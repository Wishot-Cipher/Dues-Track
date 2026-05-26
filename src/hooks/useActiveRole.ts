import { useCallback, useEffect, useState } from 'react';

export type ActiveRoleKind = 'student' | 'exec';
export type ActiveScopeLevel = 'org' | 'unit' | 'group';

export interface ActiveRole {
  key: string;
  kind: ActiveRoleKind;
  adminId?: string;
  groupId?: string | null;
  scopeLevel?: ActiveScopeLevel;
  label?: string;
  orgId?: string;
  memberId?: string;
}

const ROLE_KEY = 'pvx_active_role';
const ROLE_EVENT = 'pvx:role-changed';

function readStoredRole(orgId?: string, memberId?: string): ActiveRole | null {
  try {
    const raw = localStorage.getItem(ROLE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveRole;
    if (orgId && parsed.orgId && parsed.orgId !== orgId) return null;
    if (memberId && parsed.memberId && parsed.memberId !== memberId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function useActiveRole(params?: {
  orgId?: string;
  memberId?: string;
  fallbackGroupId?: string;
}) {
  const [activeRole, setActiveRoleState] = useState<ActiveRole | null>(() =>
    readStoredRole(params?.orgId, params?.memberId)
  );

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ActiveRole>).detail;
      if (!detail) return;
      if (params?.orgId && detail.orgId && detail.orgId !== params.orgId) return;
      if (params?.memberId && detail.memberId && detail.memberId !== params.memberId) return;
      setActiveRoleState(detail);
    };
    window.addEventListener(ROLE_EVENT, onChange);
    return () => window.removeEventListener(ROLE_EVENT, onChange);
  }, [params?.orgId, params?.memberId]);

  const setActiveRole = useCallback((role: ActiveRole, opts?: { fallbackGroupId?: string }) => {
    const enriched: ActiveRole = {
      ...role,
      orgId: role.orgId ?? params?.orgId,
      memberId: role.memberId ?? params?.memberId,
    };

    setActiveRoleState(enriched);

    try {
      localStorage.setItem(ROLE_KEY, JSON.stringify(enriched));
    } catch {
      // ignore storage failures
    }

    const fallbackGroupId = opts?.fallbackGroupId ?? params?.fallbackGroupId;
    const nextGroupId = role.kind === 'exec' ? (role.groupId || fallbackGroupId) : fallbackGroupId;
    if (nextGroupId) {
      try {
        localStorage.setItem('pvx_group_id', nextGroupId);
      } catch {
        // ignore storage failures
      }
    }

    try {
      window.dispatchEvent(new CustomEvent<ActiveRole>(ROLE_EVENT, { detail: enriched }));
    } catch {
      // ignore dispatch failures
    }
  }, [params?.orgId, params?.memberId, params?.fallbackGroupId]);

  const clearActiveRole = useCallback(() => {
    setActiveRoleState(null);
    try {
      localStorage.removeItem(ROLE_KEY);
    } catch {
      // ignore storage failures
    }
  }, []);

  return { activeRole, setActiveRole, clearActiveRole };
}

export default useActiveRole;
