/**
 * useSubscriptionLimits hook
 * Checks and enforces subscription plan limits for the current organization.
 * Use before creating members, groups, or admins.
 */

import { useState, useEffect, useCallback } from 'react';
import { billingService, type SubscriptionStatus } from '@/services/billingService';
import { getOrgScope } from '@/utils/orgScope';

export function useSubscriptionLimits() {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const scope = getOrgScope();
  const orgId = scope?.orgId;

  const refresh = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await billingService.getSubscriptionStatus(orgId);
      setStatus(result);
    } catch (error) {
      console.error('Error loading subscription status:', error);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * Check if a resource can be created
   */
  const canCreate = useCallback((resource: 'members' | 'groups' | 'admins'): {
    allowed: boolean;
    current: number;
    limit: number;
    message?: string;
  } => {
    // Size (members / groups / admins) is NEVER capped — free + unlimited
    // is the model; we monetise the transaction fee + value-add features,
    // not org size. Always allow.
    const current = status ? status.usage[resource] : 0;
    return { allowed: true, current, limit: -1 };
  }, [status]);

  /**
   * Check if the subscription is still active
   */
  const isActive = status?.isActive ?? true;

  /**
   * Get a feature flag from the current plan
   */
  const hasFeature = useCallback((feature: string): boolean => {
    if (!status) return false;
    const features = status.plan.features as unknown as Record<string, boolean>;
    return features[feature] ?? false;
  }, [status]);

  return {
    status,
    loading,
    refresh,
    canCreate,
    isActive,
    hasFeature,
    planName: status?.plan.name ?? 'Free',
    planId: status?.planId ?? 'free',
    isTrial: status?.isTrial ?? false,
    daysRemaining: status?.daysRemaining ?? 0,
  };
}

export default useSubscriptionLimits;
