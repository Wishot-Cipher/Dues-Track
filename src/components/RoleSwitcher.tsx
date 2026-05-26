import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { colors } from '@/config/colors';
import { useAppNav } from '@/hooks/useAppNav';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useUserRoles } from '@/hooks/useUserRoles';
import type { RoleTab } from '@/hooks/useUserRoles';

function isSelectableRole(role: RoleTab): role is RoleTab & { kind: 'student' | 'exec' } {
  return role.kind !== 'pending';
}

function toActiveRole(
  role: RoleTab & { kind: 'student' | 'exec' },
  orgId?: string,
  memberId?: string
) {
  return {
    key: role.key,
    kind: role.kind,
    adminId: role.adminId,
    groupId: role.groupId ?? null,
    scopeLevel: role.scopeLevel,
    label: role.label,
    orgId,
    memberId,
  };
}

export default function RoleSwitcher() {
  const { user, organization, group } = useMultiTenantAuth();
  const { roles, loading, hasExec } = useUserRoles();
  const { go } = useAppNav();
  const { activeRole, setActiveRole } = useActiveRole({
    orgId: organization?.id,
    memberId: user?.id,
    fallbackGroupId: group?.id,
  });

  const selectableRoles = useMemo(() => roles.filter(isSelectableRole), [roles]);

  useEffect(() => {
    if (loading || selectableRoles.length === 0) return;

    const activeKey = activeRole?.key;
    const hasActive = activeKey && selectableRoles.some((r) => r.key === activeKey);
    if (!hasActive) {
      const next = selectableRoles[0];
      if (next) {
        setActiveRole(toActiveRole(next, organization?.id, user?.id), {
          fallbackGroupId: group?.id,
        });
      }
    }
  }, [loading, selectableRoles, activeRole?.key, setActiveRole, organization?.id, user?.id, group?.id]);

  if (loading || !hasExec) return null;

  return (
    <div className="hidden lg:flex items-center gap-2 max-w-[520px] overflow-x-auto">
      {roles.map((role) => {
        const isPending = role.kind === 'pending';
        const isActive = activeRole?.key === role.key;
        const baseColor = isPending ? colors.textTertiary : colors.primary;
        const border = isActive ? `${colors.primary}45` : 'rgba(255, 255, 255, 0.08)';
        const background = isActive ? `${colors.primary}15` : 'rgba(255,255,255,0.04)';

        return (
          <motion.button
            key={role.key}
            type="button"
            disabled={isPending}
            onClick={() => {
              if (!isSelectableRole(role)) return;
              const next = toActiveRole(role, organization?.id, user?.id);
              setActiveRole(next, { fallbackGroupId: group?.id });
              if (role.kind === 'student') {
                go('/dashboard');
              } else {
                go('/admin/dashboard');
              }
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition-all"
            style={{
              border: `1px solid ${border}`,
              background,
              color: isActive ? colors.primary : baseColor,
              opacity: isPending ? 0.55 : 1,
            }}
            whileHover={!isPending ? { scale: 1.02 } : undefined}
            whileTap={!isPending ? { scale: 0.98 } : undefined}
          >
            <span className="whitespace-nowrap">{role.label}</span>
            {role.subLabel && (
              <span
                className="text-[10px] font-medium whitespace-nowrap"
                style={{ color: isActive ? colors.primary : colors.textTertiary }}
              >
                {role.subLabel}
              </span>
            )}
            {isPending && (
              <span
                className="text-[9px] uppercase font-semibold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.10)', color: colors.textTertiary }}
              >
                Pending
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}