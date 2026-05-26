import { motion } from 'framer-motion';
import { colors } from '@/config/colors';
import { useAppNav } from '@/hooks/useAppNav';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useUserRoles } from '@/hooks/useUserRoles';

export default function RoleSwitcherSheet({ onSelect }: { onSelect?: () => void }) {
  const { user, organization, group } = useMultiTenantAuth();
  const { roles, loading, hasExec } = useUserRoles();
  const { go } = useAppNav();
  const { activeRole, setActiveRole } = useActiveRole({
    orgId: organization?.id,
    memberId: user?.id,
    fallbackGroupId: group?.id,
  });

  if (loading || !hasExec) return null;

  return (
    <div className="px-3 pb-3">
      <p className="text-[10px] uppercase tracking-[0.2em] font-bold px-2" style={{ color: colors.primary }}>
        Switch role
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2">
        {roles.map((role) => {
          const isPending = role.kind === 'pending';
          const isActive = activeRole?.key === role.key;
          return (
            <motion.button
              key={role.key}
              type="button"
              disabled={isPending}
              onClick={() => {
                if (isPending) return;
                setActiveRole({
                  key: role.key,
                  kind: role.kind === 'exec' ? 'exec' : 'student',
                  adminId: role.adminId,
                  groupId: role.groupId ?? null,
                  scopeLevel: role.scopeLevel,
                  label: role.label,
                  orgId: organization?.id,
                  memberId: user?.id,
                }, { fallbackGroupId: group?.id });
                if (role.kind === 'student') {
                  go('/dashboard');
                } else {
                  go('/admin/dashboard');
                }
                onSelect?.();
              }}
              className="w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl transition-all"
              style={{
                background: isActive ? `${colors.primary}15` : 'rgba(255,255,255,0.03)',
                border: `1px solid ${isActive ? `${colors.primary}35` : colors.borderLight}`,
                color: isActive ? colors.primary : colors.textSecondary,
                opacity: isPending ? 0.55 : 1,
              }}
              whileHover={!isPending ? { scale: 1.01 } : undefined}
              whileTap={!isPending ? { scale: 0.98 } : undefined}
            >
              <div className="text-left">
                <div className="text-xs font-semibold" style={{ color: isActive ? colors.primary : colors.textSecondary }}>
                  {role.label}
                </div>
                {role.subLabel && (
                  <div className="text-[10px]" style={{ color: colors.textTertiary }}>
                    {role.subLabel}
                  </div>
                )}
              </div>
              {isPending && (
                <span
                  className="text-[10px] uppercase font-semibold px-2 py-1 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.08)', color: colors.textTertiary }}
                >
                  Pending
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
