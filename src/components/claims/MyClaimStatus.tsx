/**
 * MyClaimStatus — finds the signed-in member's own in-progress claim(s) and
 * renders a ClaimStatusCard for each. Self-hides when there's nothing pending.
 * Mounted on the member dashboard so a claimant always sees where they stand.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/config/supabase';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import ClaimStatusCard from './ClaimStatusCard';

const PENDING = ['awaiting_votes', 'submitted', 'under_review', 'votes_complete'];

export default function MyClaimStatus() {
  const { user, organization } = useMultiTenantAuth();
  const [claimIds, setClaimIds] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const memberId = user?.id;
    const orgId = organization?.id;
    if (!memberId || !orgId) { setClaimIds([]); return; }

    (async () => {
      const { data } = await supabase
        .from('claim_requests')
        .select('id, status, created_at')
        .eq('claimant_user_id', memberId)
        .eq('organization_id', orgId)
        .in('status', PENDING)
        .order('created_at', { ascending: false });
      if (active) setClaimIds((data ?? []).map((c) => c.id as string));
    })();

    return () => { active = false; };
  }, [user?.id, organization?.id]);

  if (claimIds.length === 0) return null;
  return <>{claimIds.map((id) => <ClaimStatusCard key={id} claimId={id} />)}</>;
}
