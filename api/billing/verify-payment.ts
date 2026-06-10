import { createClient } from '@supabase/supabase-js';
import { sendEmail, billingReceiptEmail } from '../_lib/email.js';
import { verifyMember, setCorsHeaders } from '../_lib/auth.js';
import { sendPushToUser } from '../_lib/push.js';

interface VercelRequest {
  method?: string;
  headers: { [key: string]: string | string[] | undefined };
  body?: {
    reference?: string;
    callerId?: string;
    action?: string;
    id?: string;
    payload?: Record<string, unknown>;
    // insert-event-tiers action (CREATE flow follow-up)
    paymentTypeId?: string;
    tiers?: Array<{
      name: string;
      price: number;
      quantity: number | null;
      sort_order?: number;
    }>;
    // issue-free-ticket action (event waiver)
    recipientMemberId?: string;
    tierId?: string;
    reason?: string;
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

  // ── INSERT EVENT TIERS ──────────────────────────────────────────
  // Called by CreateDuePage right after create_due_with_scope_check
  // returns a new payment_type_id. event_ticket_tiers RLS grants
  // INSERT to service_role only (mig 057) — a direct client insert
  // fails silently and the event renders without tiers. Routing
  // through this service-role endpoint mirrors what the EDIT path
  // already does, with the same admin-verification guard.
  if (action === 'insert-event-tiers') {
    const { paymentTypeId, callerId, tiers } = req.body || {};

    if (!paymentTypeId) return res.status(400).json({ error: 'Missing paymentTypeId' });
    if (!callerId) return res.status(400).json({ error: 'Missing callerId' });

    const auth = await verifyMember(supabase, callerId);
    if (!auth.valid || !auth.data) {
      return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' });
    }

    // Confirm the payment_type belongs to the caller's org.
    const { data: pt } = await supabase
      .from('payment_types')
      .select('id, organization_id')
      .eq('id', paymentTypeId)
      .eq('organization_id', auth.data.organization_id)
      .maybeSingle();
    if (!pt) return res.status(404).json({ error: 'Payment type not found or access denied' });

    const tierList = tiers as Array<{
      name: string;
      price: number;
      quantity: number | null;
      sort_order?: number;
    }> | undefined;
    if (!tierList || !Array.isArray(tierList) || tierList.length === 0) {
      // No tiers is a valid input (caller decided post-create to skip);
      // succeed quietly so the FE doesn't show a false error.
      return res.status(200).json({ ok: true, inserted: 0 });
    }

    const tierRows = tierList.map((t, i) => ({
      payment_type_id: paymentTypeId,
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
      console.error('insert-event-tiers failed:', tierErr);
      return res.status(500).json({ error: `Tiers failed to save: ${tierErr.message}` });
    }

    return res.status(200).json({ ok: true, inserted: tierRows.length });
  }

  // ── ISSUE FREE TICKET (event waiver) ────────────────────────────
  // For events, a "waive" means GRANT A FREE TICKET — not just mark a
  // payment as approved. The recipient needs a real ticket row with
  // a QR code so they can be checked in at the door. We:
  //   1. Insert a payments row marked approved + WAIVED with the
  //      event_tier_id set, attributed to the recipient.
  //   2. Call the existing issue_event_ticket(payment_id) RPC
  //      (mig 058) which mints the event_tickets row.
  //
  // event_tickets RLS only lets service_role INSERT, hence this
  // server endpoint. Same admin verification as the other actions.
  if (action === 'issue-free-ticket') {
    const { paymentTypeId, tierId, recipientMemberId, callerId, reason } = req.body || {};

    if (!paymentTypeId) return res.status(400).json({ error: 'Missing paymentTypeId' });
    if (!tierId) return res.status(400).json({ error: 'Missing tierId' });
    if (!recipientMemberId) return res.status(400).json({ error: 'Missing recipientMemberId' });
    if (!callerId) return res.status(400).json({ error: 'Missing callerId' });

    const auth = await verifyMember(supabase, callerId);
    if (!auth.valid || !auth.data) {
      return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' });
    }
    const orgId = auth.data.organization_id;

    // Verify the payment_type exists, is an event, and is in caller's org.
    const { data: pt } = await supabase
      .from('payment_types')
      .select('id, organization_id, category, title, group_id')
      .eq('id', paymentTypeId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!pt) return res.status(404).json({ error: 'Event not found or access denied' });
    if (pt.category !== 'event') {
      return res.status(400).json({ error: 'This is not an event. Use the regular waive flow for dues.' });
    }

    // Verify the tier exists on THIS event.
    const { data: tier } = await supabase
      .from('event_ticket_tiers')
      .select('id, name, price, payment_type_id, organization_id')
      .eq('id', tierId)
      .eq('payment_type_id', paymentTypeId)
      .maybeSingle();
    if (!tier) return res.status(404).json({ error: 'Ticket tier not found for this event' });

    // Verify the recipient is a member in this org.
    const { data: recipient } = await supabase
      .from('organization_members')
      .select('id, organization_id, full_name, email, group_id')
      .eq('id', recipientMemberId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!recipient) return res.status(404).json({ error: 'Recipient is not a member of this org' });

    // Resolve the admin record for audit attribution. A user with
    // multiple admin rows (dept-pres + class-rep) picks the highest
    // verification_layer.
    const { data: adminRec } = await supabase
      .from('member_admins')
      .select('id, verification_layer')
      .eq('member_id', auth.data.id)
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('verification_layer', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!adminRec) return res.status(403).json({ error: 'Only an admin can grant free tickets' });

    // Insert the payment row (waived, event_tier_id set).
    //
    // Note: payments.approved_by was dropped in mig 020 (legacy FK to
    // the old `admins` table). Don't reintroduce it — PostgREST
    // schema cache will reject the insert. The audit trail lives in
    // the notes field; adminRec.id is the audit identity but isn't
    // persisted as a column on payments.
    const reasonText = (reason || 'Free ticket grant').slice(0, 500);
    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert({
        member_id: recipient.id,
        payment_type_id: paymentTypeId,
        event_tier_id: tierId,
        amount: tier.price,
        payment_method: 'cash',
        status: 'approved',
        transaction_ref: `WAIVED-${Date.now()}`,
        notes: `✅ FREE TICKET GRANTED BY ADMIN ${adminRec.id}\n\nReason: ${reasonText}\n\nTier: ${tier.name}`,
        organization_id: orgId,
        group_id: recipient.group_id ?? pt.group_id,
        receipt_url: '',
      })
      .select('id')
      .single();
    if (payErr || !payment) {
      return res.status(500).json({ error: payErr?.message || 'Could not record the waiver' });
    }

    // Mint the actual ticket via the existing RPC.
    const { data: issueRes, error: issueErr } = await supabase.rpc('issue_event_ticket', {
      p_payment_id: payment.id,
    });
    if (issueErr || !issueRes?.ok) {
      // Roll back the payment so we don't leave an orphan row.
      await supabase.from('payments').delete().eq('id', payment.id);
      return res.status(500).json({
        error: issueErr?.message || issueRes?.error || 'Could not mint the ticket',
      });
    }

    // ── Notify the recipient SERVER-SIDE (service_role, guaranteed).
    //    A waive is a complete handoff: they're told, and the link
    //    takes them straight to their ticket. Doing it here (not on
    //    the client) means it can't be lost to RLS/scope quirks and
    //    always carries the recipient's correct org/group context.
    //    Best-effort — never fail the grant on a notification hiccup. ──
    const ticketTitle = '🎟️ You got a free ticket!';
    const ticketBody = `You've been given a free "${tier.name}" ticket to ${pt.title}. Open your Tickets to see the QR for check-in.`;
    await supabase.from('notifications').insert({
      organization_id: orgId,
      member_id: recipient.id,
      group_id: recipient.group_id ?? null,
      type: 'free_ticket_granted',
      title: ticketTitle,
      message: ticketBody,
      link: '/tickets',
      related_type: 'event_ticket',
      related_id: issueRes.ticket_id ?? null,
    }).then(undefined, () => {});
    // Reach the recipient's phone even if the app is closed.
    await sendPushToUser(supabase, recipient.id, { title: ticketTitle, body: ticketBody, url: '/tickets', tag: 'free_ticket' });

    return res.status(200).json({
      ok: true,
      payment_id: payment.id,
      ticket_id: issueRes.ticket_id,
      ticket_code: issueRes.ticket_code,
    });
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