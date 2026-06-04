import { createClient } from '@supabase/supabase-js';
import { sendEmail, billingReceiptEmail } from '../_lib/email.js';
import { verifyMember, setCorsHeaders } from '../_lib/auth.js';

interface VercelRequest {
  method?: string;
  headers: { [key: string]: string | string[] | undefined };
  body?: {
    reference?: string;
    callerId?: string;
    action?: string;
    id?: string;
    payload?: Record<string, unknown>;
  };
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => VercelResponse;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: 'Server configuration error' });

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { action } = req.body || {};

  // ── UPDATE PAYMENT TYPE ─────────────────────────────────────────
  if (action === 'update-payment-type') {
    const { id, callerId, payload } = req.body || {};

    if (!id) return res.status(400).json({ error: 'Missing payment type id' });
    if (!callerId) return res.status(400).json({ error: 'Missing callerId' });

    const auth = await verifyMember(supabase, callerId);
    if (!auth.valid || !auth.data) {
      return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' });
    }

    const { data: pt } = await supabase
      .from('payment_types')
      .select('id, organization_id')
      .eq('id', id)
      .eq('organization_id', auth.data.organization_id)
      .maybeSingle();

    if (!pt) return res.status(404).json({ error: 'Payment type not found or access denied' });

    // Extract tiers before updating payment_types
    // (tiers live in event_ticket_tiers, not payment_types)
    const tiers = payload?.tiers as Array<{
      name: string;
      price: number;
      quantity: number | null;
      sort_order: number;
    }> | undefined;

    // Whitelist only known payment_types columns — never pass unknown keys
    const {
      tiers: _tiers,
      ...safePayload
    } = (payload || {}) as Record<string, unknown> & { tiers?: unknown };

    const { error: updateErr } = await supabase
      .from('payment_types')
      .update({ ...safePayload, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // Re-insert tiers if provided
    if (tiers && Array.isArray(tiers) && tiers.length > 0) {
      await supabase
        .from('event_ticket_tiers')
        .delete()
        .eq('payment_type_id', id);

      const tierRows = tiers.map((t, i) => ({
        payment_type_id: id,
        organization_id: auth.data.organization_id,
        name: t.name,
        price: t.price,
        quantity: t.quantity,
        sold_count: 0,
        sort_order: t.sort_order ?? i,
        is_active: true,
      }));

      const { error: tierErr } = await supabase
        .from('event_ticket_tiers')
        .insert(tierRows);

      if (tierErr) {
        console.error('Tier insert failed:', tierErr);
        return res.status(500).json({ error: `Tiers failed to save: ${tierErr.message}` });
      }
    }

    return res.status(200).json({ ok: true });
  }

  // ── VERIFY PAYMENT ──────────────────────────────────────────────
  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  if (!PAYSTACK_SECRET_KEY) return res.status(500).json({ error: 'Payment system not configured' });

  const { reference, callerId } = req.body || {};
  if (!reference || typeof reference !== 'string') return res.status(400).json({ error: 'Payment reference is required' });
  if (!callerId) return res.status(400).json({ error: 'Missing callerId' });

  const auth = await verifyMember(supabase, callerId);
  if (!auth.valid || !auth.data) {
    return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' });
  }

  const callerOrgId = auth.data.organization_id;

  try {
    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      },
    );

    const paystackData = await paystackRes.json() as {
      status: boolean;
      data?: {
        status: string;
        reference: string;
        gateway_response: string;
        amount: number;
        currency: string;
        paid_at: string;
      };
    };

    if (!paystackData.status || paystackData.data?.status !== 'success') {
      await supabase
        .from('billing_transactions')
        .update({
          status: 'failed',
          gateway_reference: paystackData.data?.reference || null,
          gateway_response: paystackData.data || paystackData,
          updated_at: new Date().toISOString(),
        })
        .eq('reference', reference)
        .eq('organization_id', callerOrgId);

      return res.status(400).json({
        success: false,
        message: paystackData.data?.gateway_response || 'Payment was not successful',
      });
    }

    const appUrl =
      process.env.VITE_APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:5173';

    await supabase
      .from('billing_transactions')
      .update({
        gateway_reference: paystackData.data.reference,
        gateway_response: paystackData.data,
        updated_at: new Date().toISOString(),
      })
      .eq('reference', reference)
      .eq('organization_id', callerOrgId);

    try {
      const { data: txn } = await supabase
        .from('billing_transactions')
        .select('organization_id, plan, email')
        .eq('reference', reference)
        .eq('organization_id', callerOrgId)
        .maybeSingle();

      if (txn?.email) {
        const { data: org } = await supabase
          .from('organizations')
          .select('name, slug')
          .eq('id', callerOrgId)
          .maybeSingle();

        const orgName = org?.name || 'Payvexo';
        const orgSlug = org?.slug || '';

        const html = billingReceiptEmail({
          adminName: txn.email.split('@')[0],
          orgName,
          plan:
            (txn.plan || 'Pro').charAt(0).toUpperCase() +
            (txn.plan || 'pro').slice(1),
          amount: `₦${(paystackData.data.amount / 100).toLocaleString()}`,
          reference: paystackData.data.reference,
          date: new Date(
            paystackData.data.paid_at || Date.now(),
          ).toLocaleDateString('en-NG', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          dashboardUrl: `${appUrl.replace(/\/$/, '')}/${orgSlug}/admin`,
        });
        await sendEmail(txn.email, `${orgName} — Payment Receipt`, html);
      }
    } catch {
      // Non-critical
    }

    return res.status(200).json({
      success: true,
      message: 'Payment verified successfully',
      data: {
        amount: paystackData.data.amount / 100,
        currency: paystackData.data.currency,
        reference: paystackData.data.reference,
        paid_at: paystackData.data.paid_at,
      },
    });
  } catch (error) {
    console.error('Paystack verification error:', error);
    return res.status(500).json({ success: false, error: 'Failed to verify payment' });
  }
}