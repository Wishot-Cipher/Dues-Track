/**
 * RoleSwitcherSheet — mobile role-switcher rendered inside the
 * "More" bottom sheet. The desktop equivalent is RoleSwitcher.tsx.
 *
 * Theme-aware: every surface, border, and label colour resolves from
 * useThemeTokens so dark + light mode look right without overrides.
 * Routing mirrors the desktop switcher (landingPathForExec) so a
 * dept exec lands on /admin/dept, faculty on /admin/faculty, etc.
 */

import { motion } from 'framer-motion';
import { Shield, UserRound, Clock, Check } from 'lucide-react';
import { useAppNav } from '@/hooks/useAppNav';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useUserRoles } from '@/hooks/useUserRoles';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import type { RoleTab } from '@/hooks/useUserRoles';

/** Same tier-routing logic as the desktop switcher. */
function landingPathForExec(role: RoleTab): string {
  if (role.scopeLevel !== 'unit') return '/admin/dashboard';
  const kind = (role.groupKind || '').toLowerCase();
  if (kind === 'faculty' || kind === 'college') return '/admin/faculty';
  if (role.groupId) return '/admin/dept';
  return '/admin/dashboard';
}

export default function RoleSwitcherSheet({ onSelect }: { onSelect?: () => void }) {
  const tk = useThemeTokens();
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
      <p
        className="text-[10px] uppercase tracking-[0.2em] font-bold px-2"
        style={{ color: tk.primary }}
      >
        Switch role
      </p>
      <div className="mt-2 grid grid-cols-1 gap-2">
        {roles.map((role) => {
          const isPending = role.kind === 'pending';
          const isActive  = activeRole?.key === role.key;
          const RoleIcon  = role.kind === 'exec' ? Shield : UserRound;
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
                  groupKind: role.groupKind ?? null,
                  scopeLevel: role.scopeLevel,
                  label: role.label,
                  orgId: organization?.id,
                  memberId: user?.id,
                }, { fallbackGroupId: group?.id });
                if (role.kind === 'student') {
                  go('/dashboard');
                } else {
                  go(landingPathForExec(role));
                }
                onSelect?.();
              }}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl transition-all disabled:cursor-not-allowed"
              style={{
                background: isActive ? tk.primarySoft : tk.overlay,
                border: `1px solid ${isActive ? tk.primaryRing : tk.cardBorder}`,
                opacity: isPending ? 0.6 : 1,
              }}
              whileHover={!isPending ? { scale: 1.01 } : undefined}
              whileTap={!isPending ? { scale: 0.98 } : undefined}
            >
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: isActive ? tk.primarySoft : tk.card,
                  color:      isActive ? tk.primary     : (isPending ? tk.textTer : tk.textSec),
                  border: `1px solid ${isActive ? tk.primaryRing : tk.cardBorder}`,
                }}
              >
                {isPending ? <Clock size={14} /> : <RoleIcon size={14} />}
              </span>
              <div className="flex-1 text-left min-w-0">
                <div
                  className="text-[13px] font-semibold truncate"
                  style={{ color: tk.text }}
                >
                  {role.label}
                </div>
                {role.subLabel && (
                  <div
                    className="text-[10.5px] mt-0.5 truncate"
                    style={{ color: tk.textTer }}
                  >
                    {role.subLabel}
                  </div>
                )}
              </div>
              {isActive && (
                <Check size={15} className="shrink-0" style={{ color: tk.primary }} />
              )}
              {isPending && (
                <span
                  className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                  style={{ background: `${tk.amber}20`, color: tk.amber }}
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
