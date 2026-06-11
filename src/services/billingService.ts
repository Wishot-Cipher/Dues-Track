/**
 * Billing Service
 * Handles subscription management, Paystack integration, and plan enforcement
 * Payvexo Platform Billing
 */

import { supabase } from '@/config/supabase';
import { SUBSCRIPTION_PLANS } from '@/types/multiTenant';
import type { SubscriptionTier, SubscriptionPlan } from '@/types/multiTenant';

// ============================================================
// TYPES
// ============================================================

export interface BillingTransaction {
  id: string;
  organization_id: string;
  reference: string;
  gateway: string;
  gateway_reference?: string;
  plan_id: SubscriptionTier;
  billing_cycle: 'monthly' | 'yearly';
  amount: number;
  currency: string;
  status: 'pending' | 'success' | 'failed' | 'refunded' | 'cancelled';
  payer_email?: string;
  payer_name?: string;
  period_start?: string;
  period_end?: string;
  created_at: string;
  verified_at?: string;
}

export interface SubscriptionStatus {
  plan: SubscriptionPlan;
  planId: SubscriptionTier;
  isActive: boolean;
  isTrial: boolean;
  trialEndsAt?: string;
  expiresAt?: string;
  daysRemaining: number;
  usage: {
    members: number;
    groups: number;
    admins: number;
    membersLimit: number;
    groupsLimit: number;
    adminsLimit: number;
  };
}

export interface PlanUsage {
  members: number;
  groups: number;
  admins: number;
}

// Paystack public key
const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY || '';

// ============================================================
// SERVICE
// ============================================================

export const billingService = {
  /**
   * Get the full subscription status for an organization
   */
  async getSubscriptionStatus(orgId: string): Promise<SubscriptionStatus | null> {
    try {
      // Fetch org details
      const { data: org, error } = await supabase
        .from('organizations')
        .select('subscription_plan, max_groups, max_members, max_admins, is_on_trial, trial_ends_at, subscription_expires_at')
        .eq('id', orgId)
        .single();

      if (error || !org) return null;

      // Get current usage in parallel
      const [membersRes, groupsRes, adminsRes] = await Promise.all([
        supabase
          .from('organization_members')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('is_active', true),
        supabase
          .from('organization_groups')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId)
          .eq('is_active', true),
        supabase
          .from('member_admins')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId),
      ]);

      const planId = (org.subscription_plan || 'free') as SubscriptionTier;
      const plan = SUBSCRIPTION_PLANS[planId];

      // Calculate days remaining
      let daysRemaining = 0;
      const expiryDate = org.is_on_trial ? org.trial_ends_at : org.subscription_expires_at;
      if (expiryDate) {
        const diff = new Date(expiryDate).getTime() - Date.now();
        daysRemaining = Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
      }

      // Determine if subscription is active
      let isActive = true;
      if (planId !== 'free') {
        if (org.is_on_trial && org.trial_ends_at) {
          isActive = new Date(org.trial_ends_at) > new Date();
        } else if (org.subscription_expires_at) {
          isActive = new Date(org.subscription_expires_at) > new Date();
        }
      }

      return {
        plan,
        planId,
        isActive,
        isTrial: org.is_on_trial || false,
        trialEndsAt: org.trial_ends_at || undefined,
        expiresAt: org.subscription_expires_at || undefined,
        daysRemaining,
        usage: {
          members: membersRes.count ?? 0,
          groups: groupsRes.count ?? 0,
          admins: adminsRes.count ?? 0,
          membersLimit: org.max_members ?? plan.max_members,
          groupsLimit: org.max_groups ?? plan.max_groups,
          adminsLimit: org.max_admins ?? plan.max_admins,
        },
      };
    } catch (error) {
      console.error('Error getting subscription status:', error);
      return null;
    }
  },

  /**
   * Check if an action is allowed by the current plan
   */
  async checkLimit(orgId: string, resource: 'members' | 'groups' | 'admins'): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    planName: string;
  }> {
    const status = await this.getSubscriptionStatus(orgId);
    if (!status) {
      return { allowed: false, current: 0, limit: 0, planName: 'Unknown' };
    }

    const current = status.usage[resource];

    // Members, groups and admins are NEVER capped — the platform is free +
    // unlimited and monetises the transaction fee + value-add features,
    // not org size. Capping members directly contradicts that (and was
    // silently blocking joins at the old 50-member free limit), so size is
    // always allowed regardless of any plan/org limit still in the data.
    return {
      allowed: true,
      current,
      limit: -1,
      planName: status.plan.name,
    };
  },

  /**
   * Get the price for a plan in the org's currency
   */
  getPrice(plan: SubscriptionPlan, cycle: 'monthly' | 'yearly', currency: string): {
    amount: number;
    formattedAmount: string;
    savings?: string;
  } {
    const isNGN = currency === 'NGN';
    const amount = cycle === 'monthly'
      ? (isNGN ? plan.price_monthly_ngn : plan.price_monthly_usd)
      : (isNGN ? plan.price_yearly_ngn : plan.price_yearly_usd);

    const symbol = isNGN ? '₦' : '$';
    const formattedAmount = `${symbol}${amount.toLocaleString()}`;

    let savings: string | undefined;
    if (cycle === 'yearly') {
      const monthlyTotal = (isNGN ? plan.price_monthly_ngn : plan.price_monthly_usd) * 12;
      const saved = monthlyTotal - amount;
      if (saved > 0) {
        savings = `Save ${symbol}${saved.toLocaleString()}/year`;
      }
    }

    return { amount, formattedAmount, savings };
  },

  /**
   * Generate a unique payment reference
   */
  generateReference(orgId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `PVX-${orgId.slice(0, 8)}-${timestamp}-${random}`.toUpperCase();
  },

  /**
   * Initiate a Paystack payment
   */
  async initiatePayment(params: {
    orgId: string;
    planId: SubscriptionTier;
    billingCycle: 'monthly' | 'yearly';
    email: string;
    payerName: string;
    currency: string;
    memberId?: string;
  }): Promise<{ reference: string; publicKey: string; amount: number; error?: undefined } | { error: string }> {
    try {
      const plan = SUBSCRIPTION_PLANS[params.planId];
      if (!plan) return { error: 'Invalid plan selected' };

      const price = this.getPrice(plan, params.billingCycle, params.currency);
      if (price.amount === 0 && params.planId !== 'free') {
        return { error: 'Enterprise plans require custom pricing. Contact sales.' };
      }

      const reference = this.generateReference(params.orgId);

      // Record pending transaction
      const { error } = await supabase
        .from('billing_transactions')
        .insert({
          organization_id: params.orgId,
          reference,
          gateway: 'paystack',
          plan_id: params.planId,
          billing_cycle: params.billingCycle,
          amount: price.amount,
          currency: params.currency,
          status: 'pending',
          payer_email: params.email,
          payer_name: params.payerName,
          initiated_by: params.memberId || null,
        });

      if (error) {
        console.error('Billing insert error:', error);
        // Surface specific messages for common errors
        if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
          return { error: 'Billing table not set up. Run the database/14_billing_transactions.sql migration in Supabase SQL Editor.' };
        }
        if (error.code === '42501' || error.message?.includes('policy')) {
          return { error: 'Permission denied. Check RLS policies on billing_transactions table.' };
        }
        return { error: `Database error: ${error.message}` };
      }

      return {
        reference,
        publicKey: PAYSTACK_PUBLIC_KEY,
        amount: price.amount * 100, // Paystack expects kobo/cents
      };
    } catch (error) {
      console.error('Error initiating payment:', error);
      return { error: error instanceof Error ? error.message : 'Failed to initiate payment' };
    }
  },

  /**
   * Verify a Paystack payment and upgrade the plan
   */
  async verifyAndUpgrade(reference: string): Promise<{ success: boolean; message: string }> {
    try {
      // Get the pending transaction
      const { data: tx, error: txError } = await supabase
        .from('billing_transactions')
        .select('*')
        .eq('reference', reference)
        .eq('status', 'pending')
        .single();

      if (txError || !tx) {
        return { success: false, message: 'Transaction not found or already processed' };
      }

      // Call the server-side verify endpoint
      const verifyUrl = `/api/billing/verify-payment`;
      const callerId = localStorage.getItem('pvx_member_id') || localStorage.getItem('current_user_id');
      const resp = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference, callerId }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        return { success: false, message: errData.error || 'Verification failed' };
      }

      const result = await resp.json();
      if (result.success) {
        // Call the SQL function to atomically upgrade
        const { error: rpcError } = await supabase.rpc('upgrade_organization_plan', {
          p_org_id: tx.organization_id,
          p_plan: tx.plan_id,
          p_billing_cycle: tx.billing_cycle,
          p_transaction_ref: reference,
        });

        if (rpcError) {
          console.error('RPC upgrade error:', rpcError);
          return { success: false, message: 'Plan upgrade failed. Contact support.' };
        }

        return { success: true, message: 'Subscription activated successfully!' };
      }

      // Payment not successful — mark as failed
      await supabase
        .from('billing_transactions')
        .update({ status: 'failed', gateway_response: result, updated_at: new Date().toISOString() })
        .eq('reference', reference);

      return { success: false, message: result.message || 'Payment verification failed' };
    } catch (error) {
      console.error('Error verifying payment:', error);
      return { success: false, message: 'An error occurred during verification' };
    }
  },

  /**
   * Get billing history for an organization
   */
  async getTransactions(orgId: string): Promise<BillingTransaction[]> {
    try {
      const { data, error } = await supabase
        .from('billing_transactions')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error fetching transactions:', error);
        return [];
      }

      return data as BillingTransaction[];
    } catch (error) {
      console.error('Error in getTransactions:', error);
      return [];
    }
  },

  /**
   * Check if Paystack is configured
   */
  isPaystackConfigured(): boolean {
    return !!PAYSTACK_PUBLIC_KEY && PAYSTACK_PUBLIC_KEY.startsWith('pk_');
  },
};

export default billingService;
