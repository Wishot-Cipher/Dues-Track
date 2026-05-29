/**
 * paystackService — frontend bindings for the Paystack init + verify API.
 *
 * Two methods:
 *   initialize({ paymentTypeId, memberId?, guestName?, guestEmail?, callbackPath? })
 *      → calls POST /api/paystack/init
 *      → returns { authorization_url, reference, payment_id, total_kobo, … }
 *
 *   verify(reference)
 *      → calls GET /api/paystack/verify?reference=<ref>
 *      → returns { status: 'approved' | 'failed' | 'abandoned' | 'pending', ... }
 *
 * Together with PaymentVerifyPage these complete Payment Phase 1:
 * student clicks Pay → redirected to Paystack → returns to verify page →
 * page calls verify() → shows the outcome.
 */

export interface PaystackInitInput {
  paymentTypeId: string;
  memberId?: string;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  /** For events: the chosen ticket tier (drives the price). */
  tierId?: string | null;
  /**
   * Override where Paystack redirects after payment. Path only —
   * the API joins it with the configured app URL. Defaults to
   * `/<orgSlug>/payments/verify` which is what we register the
   * route under.
   */
  ticket_code?: string | null;
  callbackPath?: string;
}

export interface PaystackInitResult {
  ok: boolean;
  error?: string;
  payment_id?: string;
  reference?: string;
  authorization_url?: string;
  access_code?: string;
  total_kobo?: number;
  dues_kobo?: number;
  fee_kobo?: number;
  currency?: string;
}

export interface PaystackVerifyResult {
  ok: boolean;
  error?: string;
  status?: 'approved' | 'failed' | 'abandoned' | 'pending' | 'reversed';
  ticket_code?: string | null;
  payment?: {
    id: string;
    status: string;
    paystack_status: string | null;
    dues_amount_kobo: number | null;
    platform_fee_kobo: number | null;
    total_charged_kobo: number | null;
    currency_code: string | null;
    payer_email: string | null;
    payer_name: string | null;
    payment_type_id: string;
    organization_id: string;
    group_id: string | null;
  };
  paystack?: {
    status?: string;
    amount?: number;
    channel?: string;
    paid_at?: string;
  };
}

export interface PaystackBank {
  name: string;
  code: string;
}

export interface SubaccountResult {
  ok: boolean;
  error?: string;
  subaccount_code?: string;
  account_name?: string;
  bank_code?: string;
  account_number?: string;
}

export const paystackService = {
  /**
   * Start a Paystack transaction. Returns the hosted-checkout URL —
   * the caller does `window.location.href = result.authorization_url`
   * to send the user to Paystack.
   */
  async initialize(input: PaystackInitInput): Promise<PaystackInitResult> {
    try {
      const res = await fetch('/api/paystack/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId:     input.memberId,
          paymentTypeId: input.paymentTypeId,
          guestName:    input.guestName,
          guestEmail:   input.guestEmail,
          guestPhone:   input.guestPhone,
          tierId:       input.tierId ?? undefined,
          callbackPath: input.callbackPath,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as PaystackInitResult;
      if (!res.ok) {
        return { ok: false, error: json?.error || `HTTP ${res.status}` };
      }
      return json;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Network error';
      return { ok: false, error: message };
    }
  },

  /**
   * Verify a transaction by reference. Safe to call multiple times —
   * the server short-circuits once status is 'approved'.
   */
  async verify(reference: string): Promise<PaystackVerifyResult> {
    if (!reference) return { ok: false, error: 'Missing reference' };
    try {
      const res = await fetch(`/api/paystack/verify?reference=${encodeURIComponent(reference)}`);
      const json = (await res.json().catch(() => ({}))) as PaystackVerifyResult;
      if (!res.ok) {
        return { ok: false, error: json?.error || `HTTP ${res.status}` };
      }
      return json;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Network error';
      return { ok: false, error: message };
    }
  },

  /**
   * List Nigerian banks for the payout-setup dropdown.
   */
  async listBanks(): Promise<{ ok: boolean; banks: PaystackBank[]; error?: string }> {
    try {
      const res = await fetch('/api/paystack/banks');
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) return { ok: false, banks: [], error: json?.error || `HTTP ${res.status}` };
      return { ok: true, banks: json.banks || [] };
    } catch (e) {
      return { ok: false, banks: [], error: e instanceof Error ? e.message : 'Network error' };
    }
  },

  /**
   * Set up (or update) the org's payout account: resolves the bank account,
   * creates a Paystack subaccount, and stores it on the org so dues split to
   * the org's bank automatically. Server requires a VERIFIED admin.
   */
  async setupSubaccount(input: {
    memberId: string;
    bankCode: string;
    accountNumber: string;
    businessName?: string;
  }): Promise<SubaccountResult> {
    try {
      const res = await fetch('/api/paystack/subaccount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: input.memberId,
          bankCode: input.bankCode,
          accountNumber: input.accountNumber,
          businessName: input.businessName,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as SubaccountResult;
      if (!res.ok || !json?.ok) return { ok: false, error: json?.error || `HTTP ${res.status}` };
      return json;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  },
};

export default paystackService;
