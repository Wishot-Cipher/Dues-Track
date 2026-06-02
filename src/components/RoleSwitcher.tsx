/**
 * RoleSwitcher — desktop "acting as" dropdown in the header.
 *
 * Replaces the inline button row that overflowed the nav whenever a
 * user had ≥3 roles or a long label like "Electronics Engineering
 * — Class Rep". One compact pill shows the active role; clicking
 * opens a menu listing all the roles, with the active one ticked.
 *
 * • Theme-aware via useThemeTokens
 * • Fixed width, label truncates with ellipsis
 * • Pending roles show as disabled rows in the menu (still visible
 *   so the user knows their claim is in flight)
 * • Closes on outside click and on selection
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Clock, UserRound, Shield } from 'lucide-react';
import { useAppNav } from '@/hooks/useAppNav';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useUserRoles } from '@/hooks/useUserRoles';
import type { RoleTab } from '@/hooks/useUserRoles';
import { useThemeTokens } from '@/hooks/useThemeTokens';

function isSelectableRole(role: RoleTab): role is RoleTab & { kind: 'student' | 'exec' } {
  return role.kind !== 'pending';
}

function toActiveRole(
  role: RoleTab & { kind: 'student' | 'exec' },
  orgId?: string,
  memberId?: string,
) {
  return {
    key: role.key,
    kind: role.kind,
    adminId: role.adminId,
    groupId: role.groupId ?? null,
    groupKind: role.groupKind ?? null,
    scopeLevel: role.scopeLevel,
    label: role.label,
    orgId,
    memberId,
  };
}

/**
 * Where an exec role should land its holder after they pick it from
 * the switcher. Dept exec → /admin/dept; faculty exec → /admin/faculty
 * (still being built; falls back gracefully); everyone else → the
 * generic /admin/dashboard.
 */
function landingPathForExec(role: RoleTab): string {
  const scope = role.scopeLevel;
  const kind = (role.groupKind || '').toLowerCase();
  if (scope === 'unit' && kind === 'department') return '/admin/dept';
  if (scope === 'unit' && (kind === 'faculty' || kind === 'college')) return '/admin/faculty';
  return '/admin/dashboard';
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
  const tk = useThemeTokens();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

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

  // Close menu on outside click
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (loading || !hasExec) return null;

  const active = roles.find((r) => r.key === activeRole?.key);
  const ActiveIcon = active?.kind === 'exec' ? Shield : UserRound;
  const activeLabel = active?.label ?? 'Choose role';
  const activeSubLabel = active?.subLabel;

  return (
    <div ref={wrapRef} className="hidden lg:block relative">
      {/* Trigger pill — fixed width, truncates long labels */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-semibold transition-all"
        style={{
          border: `1px solid ${open ? tk.primaryRing : tk.cardBorder}`,
          background: open ? tk.primarySoft : tk.overlay,
          color: tk.text,
          maxWidth: 240,
        }}
      >
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
          style={{ background: tk.primarySoft, color: tk.primary }}
        >
          <ActiveIcon size={12} />
        </span>
        <span className="flex flex-col items-start min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: tk.textTer }}>
            Acting as
          </span>
          <span className="truncate max-w-[160px] leading-tight" style={{ color: tk.text }}>
            {activeLabel}
            {activeSubLabel && (
              <span className="ml-1 font-normal" style={{ color: tk.textTer }}>
                · {activeSubLabel}
              </span>
            )}
          </span>
        </span>
        <ChevronDown
          size={14}
          className="shrink-0 transition-transform"
          style={{
            color: tk.textSec,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </button>

      {/* Menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="absolute left-0 top-full mt-2 z-50 rounded-2xl p-1.5 overflow-hidden"
            style={{
              background: tk.card,
              border: `1px solid ${tk.cardBorder}`,
              boxShadow: tk.shadowLg,
              minWidth: 260,
            }}
          >
            <p
              className="px-3 pt-2 pb-1.5 text-[10px] font-bold uppercase tracking-[0.14em]"
              style={{ color: tk.textTer }}
            >
              Switch role
            </p>
            <div className="space-y-0.5">
              {roles.map((role) => {
                const isPending = role.kind === 'pending';
                const isActive = activeRole?.key === role.key;
                const RoleIcon = role.kind === 'exec' ? Shield : UserRound;
                return (
                  <button
                    key={role.key}
                    type="button"
                    disabled={isPending}
                    onClick={() => {
                      if (!isSelectableRole(role)) return;
                      const next = toActiveRole(role, organization?.id, user?.id);
                      setActiveRole(next, { fallbackGroupId: group?.id });
                      setOpen(false);
                      if (role.kind === 'student') {
                        go('/dashboard');
                      } else {
                        // Pick the right exec dashboard for this scope/kind.
                        go(landingPathForExec(role));
                      }
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs transition-all disabled:cursor-not-allowed"
                    style={{
                      background: isActive ? tk.primarySoft : 'transparent',
                      color: isActive ? tk.text : tk.textSec,
                      opacity: isPending ? 0.6 : 1,
                    }}
                  >
                    <span
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: isActive ? tk.primarySoft : tk.overlay,
                        color: isActive ? tk.primary : (isPending ? tk.textTer : tk.textSec),
                        border: `1px solid ${isActive ? tk.primaryRing : 'transparent'}`,
                      }}
                    >
                      {isPending ? <Clock size={13} /> : <RoleIcon size={13} />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="font-semibold truncate block" style={{ color: tk.text }}>
                        {role.label}
                      </span>
                      {role.subLabel && (
                        <span className="text-[10px] block truncate" style={{ color: tk.textTer }}>
                          {role.subLabel}
                        </span>
                      )}
                    </span>
                    {isActive && (
                      <Check size={14} className="shrink-0" style={{ color: tk.primary }} />
                    )}
                    {isPending && (
                      <span
                        className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: tk.amber + '20', color: tk.amber }}
                      >
                        Pending
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
