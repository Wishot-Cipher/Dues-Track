import { createClient } from '@supabase/supabase-js';
import { sendEmail, billingReceiptEmail } from '../_lib/email';
import { verifyMember, setCorsHeaders } from '../_lib/auth';

// Vercel Serverless types
interface VercelRequest {
  method?: string;
  headers: { [key: string]: string | string[] | undefined };
  body?: {
    reference?: string;
    callerId?: string;
  };
}

interface VercelResponse {
  status: (code: number) => VercelResponse;
  json: (data: unknown) => void;
  setHeader: (name: string, value: string) => VercelResponse;
}

/**
 * Verify Paystack Payment
 * POST /api/billing/verify-payment
 * Body: { reference: string, callerId: string }
 *
 * SECURITY: Verifies caller is a real, active member.
 *           Verifies the billing transaction belongs to the caller's organization.
 *           Restrictive CORS (not wildcard).
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Restrictive CORS
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
  if (!PAYSTACK_SECRET_KEY) {
    return res.status(500).json({ error: 'Payment system not configured' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  const { reference, callerId } = req.body || {};
  if (!reference || typeof reference !== 'string') {
    return res.status(400).json({ error: 'Payment reference is required' });
  }
  if (!callerId) {
    return res.status(400).json({ error: 'Missing callerId' });
  }

  // ── Verify the caller is a real, active member ──
  const auth = await verifyMember(supabase, callerId);
  if (!auth.valid || !auth.data) {
    return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' });
  }

  const callerOrgId = auth.data.organization_id;

  try {
    // Verify with Paystack API
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const paystackData = await paystackRes.json();

    if (!paystackData.status || paystackData.data?.status !== 'success') {
      // Payment not successful — update transaction (scoped to caller's org)
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

    // Payment successful — update transaction (scoped to caller's org)
    const appUrl = process.env.VITE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173';

    await supabase
      .from('billing_transactions')
      .update({
        gateway_reference: paystackData.data.reference,
        gateway_response: paystackData.data,
        updated_at: new Date().toISOString(),
      })
      .eq('reference', reference)
      .eq('organization_id', callerOrgId);

    // Send billing receipt email (non-critical)
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
          plan: (txn.plan || 'Pro').charAt(0).toUpperCase() + (txn.plan || 'pro').slice(1),
          amount: `₦${(paystackData.data.amount / 100).toLocaleString()}`,
          reference: paystackData.data.reference,
          date: new Date(paystackData.data.paid_at || Date.now()).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' }),
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
    return res.status(500).json({
      success: false,
      error: 'Failed to verify payment',
    });
  }
}
