/**
 * Platform Admin: Role Management Console
 * Assign and revoke roles for organization members
 * Control who can be a class rep, admin, treasurer, etc.
 *
 * Path: /pvx-console (embedded in PlatformConsolePage)
 * Auth: Platform Admin only
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Shield,
  User,
  CheckCircle,
  AlertCircle,
  Edit,
  Trash2,
  X,
  Users,
  Building2,
  Crown,
  RefreshCw,
  ChevronRight,
  Lock,
  BarChart2,
  DollarSign,
  Settings,
  FileText,
  Eye,
  Download,
  UserCheck,
} from 'lucide-react';
import { supabase } from '@/config/supabase';
import { organizationService } from '@/services/organizationService';
import Modal from '@/components/ui/Modal';
import type { Organization, OrganizationMember, MemberAdmin } from '@/types/multiTenant';

interface MemberWithRoles extends OrganizationMember {
  member_admins?: MemberAdmin[];
  organization?: Organization;
}

type RpcError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

function normalizeMemberAdmins(member: MemberWithRoles): MemberWithRoles {
  const admins = Array.isArray(member.member_admins)
    ? member.member_admins
    : member.member_admins
    ? [member.member_admins]
    : [];

  return { ...member, member_admins: admins };
}

// ── Shared theme (matches PlatformConsolePage) ──
const colors = {
  primary: '#FF6803',
  accentMint: '#30FFAC',
  bg: '#0F0703',
  cardBg: 'rgba(255, 255, 255, 0.03)',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255, 255, 255, 0.5)',
  textTertiary: 'rgba(255, 255, 255, 0.3)',
  success: '#22c55e',
  warning: '#f59e0b',
  danger: '#ef4444',
};

const AVAILABLE_ROLES = [
  { value: 'class_rep',  label: 'Class Representative', icon: '👥', color: '#8b5cf6' },
  { value: 'treasurer',  label: 'Treasurer',             icon: '💰', color: '#f59e0b' },
  { value: 'admin',      label: 'Administrator',         icon: '🔐', color: '#ef4444' },
  { value: 'secretary',  label: 'Secretary',             icon: '📝', color: '#06b6d4' },
];

const ROLE_ALIASES: Record<string, string> = {
  org_admin: 'admin',
  org_owner: 'admin',
  super_admin: 'admin',
  group_admin: 'class_rep',
};

function normalizeRole(role?: string | null) {
  if (!role) return '';
  return ROLE_ALIASES[role] || role;
}

function getRoleInfo(role?: string | null) {
  const normalized = normalizeRole(role);
  return AVAILABLE_ROLES.find((r) => r.value === normalized);
}

type PermKey =
  | 'can_manage_members'
  | 'can_approve_payments'
  | 'can_create_payments'
  | 'can_manage_admins'
  | 'can_manage_expenses'
  | 'can_view_analytics'
  | 'can_export_data'
  | 'can_manage_settings';

const PERMISSIONS_MAP: Record<string, Partial<MemberAdmin>> = {
  class_rep: {
    can_manage_members: true,
    can_approve_payments: false,
    can_create_payments: false,
    can_manage_admins: false,
    can_manage_expenses: false,
    can_view_analytics: true,
    can_export_data: false,
    can_manage_settings: false,
  },
  treasurer: {
    can_manage_members: false,
    can_approve_payments: true,
    can_create_payments: true,
    can_manage_admins: false,
    can_manage_expenses: true,
    can_view_analytics: true,
    can_export_data: true,
    can_manage_settings: false,
  },
  admin: {
    can_manage_members: true,
    can_approve_payments: true,
    can_create_payments: true,
    can_manage_admins: true,
    can_manage_expenses: true,
    can_view_analytics: true,
    can_export_data: true,
    can_manage_settings: true,
  },
  secretary: {
    can_manage_members: true,
    can_approve_payments: false,
    can_create_payments: false,
    can_manage_admins: false,
    can_manage_expenses: false,
    can_view_analytics: true,
    can_export_data: true,
    can_manage_settings: false,
  },
};

const PERMISSION_META: { key: PermKey; label: string; icon: React.ElementType }[] = [
  { key: 'can_manage_members',   label: 'Manage Members',   icon: Users },
  { key: 'can_approve_payments', label: 'Approve Payments', icon: CheckCircle },
  { key: 'can_create_payments',  label: 'Create Payments',  icon: DollarSign },
  { key: 'can_manage_admins',    label: 'Manage Admins',    icon: Crown },
  { key: 'can_manage_expenses',  label: 'Manage Expenses',  icon: FileText },
  { key: 'can_view_analytics',   label: 'View Analytics',   icon: BarChart2 },
  { key: 'can_export_data',      label: 'Export Data',      icon: Download },
  { key: 'can_manage_settings',  label: 'Manage Settings',  icon: Settings },
];

// ── Stat Card (matching PlatformConsolePage's StatCard) ──
function StatCard({
  label,
  value,
  icon: Icon,
  color,
  subtext,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtext?: string;
}) {
  return (
    <motion.div
      className="p-4 rounded-xl relative overflow-hidden"
      style={{ background: colors.cardBg, border: `1px solid ${colors.cardBorder}` }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: color }} />
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] sm:text-xs font-medium uppercase tracking-wider"
          style={{ color: colors.textSecondary }}
        >
          {label}
        </span>
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${color}15` }}
        >
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <p className="text-xl sm:text-2xl font-bold text-white">{value}</p>
      {subtext && (
        <p className="text-[10px] mt-1" style={{ color: colors.textSecondary }}>
          {subtext}
        </p>
      )}
    </motion.div>
  );
}

// ── Role Assignment Modal ──
function RoleModal({
  member,
  selectedOrg,
  onClose,
  onSuccess,
}: {
  member: MemberWithRoles;
  selectedOrg: Organization;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const currentRole = normalizeRole(member.member_admins?.[0]?.role) || '';
  const [selectedRole, setSelectedRole] = useState(currentRole);
  const [activeTab, setActiveTab] = useState<'role' | 'permissions'>('role');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const preview = selectedRole ? PERMISSIONS_MAP[selectedRole] : {};
  const roleInfo = getRoleInfo(selectedRole);

  const handleAssign = async () => {
    if (!selectedRole) return;
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const { error } = await supabase.rpc('set_member_admin_role', {
        p_member_id: member.id,
        p_organization_id: selectedOrg.id,
        p_role: selectedRole,
        p_permissions: PERMISSIONS_MAP[selectedRole] || {},
        p_is_active: true,
      });
      if (error) throw error;
      setMessage({ type: 'success', text: `Role assigned successfully` });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      const rpcError = err as RpcError;
      const errorText = [rpcError?.message, rpcError?.details, rpcError?.hint, rpcError?.code]
        .filter(Boolean)
        .join(' | ');
      setMessage({ type: 'error', text: errorText || 'Failed to assign role' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        className="w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: '#1a1a2e', border: `1px solid ${colors.cardBorder}` }}
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
      >
        {/* Modal header */}
        <div
          className="sticky top-0 z-10 px-5 py-4 flex items-center justify-between"
          style={{ background: '#1a1a2e', borderBottom: `1px solid ${colors.cardBorder}` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm"
              style={{ background: `${colors.primary}20`, color: colors.primary }}
            >
              {(member.full_name || 'N/A').substring(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-white text-sm">{member.full_name || 'N/A'}</p>
              <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                {member.member_id} · {member.email}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-4 h-4" style={{ color: colors.textSecondary }} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3">
          {[
            { key: 'role',        label: 'Select Role',   icon: Shield },
            { key: 'permissions', label: 'Preview Access', icon: Eye },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as 'role' | 'permissions')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: activeTab === tab.key ? `${colors.primary}20` : 'transparent',
                color: activeTab === tab.key ? colors.primary : colors.textSecondary,
              }}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Message */}
          <AnimatePresence>
            {message.text && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="p-3 rounded-xl text-xs"
                style={{
                  background: message.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${message.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  color: message.type === 'success' ? colors.success : colors.danger,
                }}
              >
                {message.text}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Role tab */}
          {activeTab === 'role' && (
            <div className="space-y-2">
              {AVAILABLE_ROLES.map((role) => (
                <motion.button
                  key={role.value}
                  onClick={() => setSelectedRole(role.value)}
                  className="w-full text-left p-4 rounded-xl transition-all"
                  style={{
                    background: selectedRole === role.value ? `${role.color}12` : 'rgba(255,255,255,0.03)',
                    border: `1.5px solid ${selectedRole === role.value ? role.color + '60' : colors.cardBorder}`,
                  }}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
                        style={{ background: `${role.color}15` }}
                      >
                        {role.icon}
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">{role.label}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>
                          {role.value === 'class_rep'  && 'Manage members · View analytics'}
                          {role.value === 'treasurer'  && 'Payments · Expenses · Export data'}
                          {role.value === 'admin'      && 'Full administrative access'}
                          {role.value === 'secretary'  && 'Manage members · Export data'}
                        </p>
                      </div>
                    </div>
                    {selectedRole === role.value && (
                      <CheckCircle className="w-5 h-5 shrink-0" style={{ color: role.color }} />
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          )}

          {/* Permissions preview tab */}
          {activeTab === 'permissions' && (
            <div>
              {selectedRole ? (
                <>
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4 text-xs font-semibold"
                    style={{ background: `${roleInfo?.color}15`, color: roleInfo?.color }}
                  >
                    <span>{roleInfo?.icon}</span>
                    {roleInfo?.label} — Access Preview
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {PERMISSION_META.map(({ key, label, icon: Icon }) => {
                      const granted = !!(preview as Record<string, boolean>)[key];
                      return (
                        <div
                          key={key}
                          className="flex items-center gap-2 p-2.5 rounded-xl text-xs"
                          style={{
                            background: granted ? 'rgba(34,197,94,0.07)' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${granted ? 'rgba(34,197,94,0.2)' : colors.cardBorder}`,
                          }}
                        >
                          <Icon
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: granted ? colors.success : colors.textTertiary }}
                          />
                          <span style={{ color: granted ? colors.textPrimary : colors.textTertiary }}>
                            {label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <Lock className="w-8 h-8 mx-auto mb-2" style={{ color: colors.textTertiary }} />
                  <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Select a role first to preview its permissions
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div
          className="px-5 py-4 flex gap-3"
          style={{ borderTop: `1px solid ${colors.cardBorder}` }}
        >
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{
              background: 'rgba(255,255,255,0.05)',
              color: colors.textSecondary,
              border: `1px solid ${colors.cardBorder}`,
            }}
          >
            Cancel
          </button>
          <motion.button
            onClick={handleAssign}
            disabled={!selectedRole || saving || selectedRole === currentRole}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {saving ? 'Assigning...' : 'Assign Role'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Member Row ──
function MemberRow({
  member,
  onEdit,
  onRemove,
}: {
  member: MemberWithRoles;
  onEdit: (m: MemberWithRoles) => void;
  onRemove: (m: MemberWithRoles) => void;
}) {
  const adminEntry = member.member_admins?.[0];
  const roleInfo = adminEntry ? getRoleInfo(adminEntry.role) : null;
  const roleLabel = adminEntry ? (roleInfo?.label || adminEntry.role.replace(/_/g, ' ')) : null;

  return (
    <motion.div
      className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 sm:p-4 rounded-xl transition-all"
      style={{ background: colors.cardBg, border: `1px solid ${colors.cardBorder}` }}
      whileHover={{ borderColor: 'rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)' }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Avatar + info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
          style={{
            background: roleInfo ? `${roleInfo.color}18` : 'rgba(255,255,255,0.06)',
            color: roleInfo ? roleInfo.color : colors.textSecondary,
            border: `1px solid ${roleInfo ? roleInfo.color + '30' : 'rgba(255,255,255,0.1)'}`,
          }}
        >
          {(member.full_name || 'N/A').substring(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-white text-sm truncate">{member.full_name || 'N/A'}</p>
          <p className="text-[11px] font-mono truncate" style={{ color: colors.textSecondary }}>
            {member.member_id}
            {member.email ? ` · ${member.email}` : ''}
          </p>
        </div>
      </div>

      {/* Role badge */}
      <div className="ml-13 sm:ml-0 min-w-[140px]">
        {adminEntry ? (
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold"
            style={{ background: `${roleInfo?.color || colors.primary}18`, color: roleInfo?.color || colors.primary }}
          >
            {roleInfo?.icon || <Shield className="w-3 h-3" />}
            {roleLabel || 'Role'}
          </span>
        ) : (
          <span className="text-xs" style={{ color: colors.textTertiary }}>
            No role
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 ml-13 sm:ml-0 shrink-0">
        <motion.button
          onClick={() => onEdit(member)}
          className="p-2 rounded-lg transition-colors"
          style={{ background: `${colors.primary}15`, color: colors.primary }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          title="Edit role"
        >
          <Edit className="w-4 h-4" />
        </motion.button>
        {roleInfo && (
          <motion.button
            onClick={() => onRemove(member)}
            className="p-2 rounded-lg transition-colors"
            style={{ background: 'rgba(239,68,68,0.1)', color: colors.danger }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            title="Remove role"
          >
            <Trash2 className="w-4 h-4" />
          </motion.button>
        )}
        <motion.button
          onClick={() => onEdit(member)}
          className="p-2 rounded-lg transition-colors"
          style={{ background: 'rgba(255,255,255,0.05)', color: colors.textSecondary }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          title="Details"
        >
          <ChevronRight className="w-4 h-4" />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── Main Component ──
export default function ConsoleRoleManagementPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [members, setMembers] = useState<MemberWithRoles[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [modalMember, setModalMember] = useState<MemberWithRoles | null>(null);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [roleToRemove, setRoleToRemove] = useState<MemberAdmin | null>(null);
  const [removingRole, setRemovingRole] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    loadOrganizations();
  }, []);

  useEffect(() => {
    if (selectedOrg) loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrg]);

  const loadOrganizations = async () => {
    try {
      const orgs = await organizationService.getAll({ limit: 100 });
      setOrganizations(orgs);
      if (orgs.length > 0) setSelectedOrg(orgs[0]);
    } catch (err) {
      console.error('Error loading organizations:', err);
    }
  };

  const loadMembers = async (isRefresh = false) => {
    if (!selectedOrg) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_console_organization_members', {
        p_org_id: selectedOrg.id,
      });
      if (error) throw error;
      setMembers(((data || []) as MemberWithRoles[]).map(normalizeMemberAdmins));
    } catch (err) {
      console.error('Error loading members:', err);
      setMembers([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRemoveRole = (member: MemberWithRoles) => {
    const role = member.member_admins?.[0];
    if (!role) return;
    setRoleToRemove(role);
    setShowRemoveModal(true);
  };

  const confirmRemoveRole = async () => {
    if (!selectedOrg || !roleToRemove) return;
    setRemovingRole(true);
    try {
      const { error } = await supabase.rpc('remove_member_admin_role', {
        p_member_id: roleToRemove.member_id,
        p_organization_id: selectedOrg.id,
      });
      if (error) throw error;
      setMessage({ type: 'success', text: `Role removed successfully` });
      setShowRemoveModal(false);
      setRoleToRemove(null);
      loadMembers(true);
    } catch (err) {
      const rpcError = err as RpcError;
      const errorText = [rpcError?.message, rpcError?.details, rpcError?.hint, rpcError?.code]
        .filter(Boolean)
        .join(' | ');
      setMessage({ type: 'error', text: errorText || 'Failed to remove role' });
    } finally {
      setRemovingRole(false);
    }
  };

  const assignedCount = members.filter((m) => m.member_admins && m.member_admins.length > 0).length;

  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.member_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole =
      filterRole === 'all'
        ? true
        : filterRole === 'none'
        ? !m.member_admins || m.member_admins.length === 0
        : normalizeRole(m.member_admins?.[0]?.role) === filterRole;
    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      {/* ── Hero Header (matches PlatformConsolePage pattern) ── */}
      <motion.div
        className="rounded-3xl p-6 sm:p-7 lg:p-8 relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(255,104,3,0.12), rgba(255,255,255,0.03))',
          border: `1px solid ${colors.cardBorder}`,
        }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Radial glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at top right, rgba(255,104,3,0.14), transparent 50%)',
          }}
        />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3 max-w-2xl">
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ background: `${colors.primary}16`, color: colors.primary }}
            >
              <Shield className="w-3.5 h-3.5" />
              Role Management
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
              Assign and revoke permissions with clear boundaries.
            </h2>
            <p className="text-sm sm:text-base leading-7" style={{ color: colors.textSecondary }}>
              Manage who can approve payments, supervise members, and operate within each
              organization.
            </p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-3 min-w-[300px]">
            <StatCard
              label="Orgs"
              value={organizations.length}
              icon={Building2}
              color={colors.primary}
            />
            <StatCard
              label="Members"
              value={members.length}
              icon={Users}
              color="#3b82f6"
            />
            <StatCard
              label="With Roles"
              value={assignedCount}
              icon={UserCheck}
              color={colors.accentMint}
              subtext={members.length ? `${Math.round((assignedCount / members.length) * 100)}% assigned` : undefined}
            />
          </div>
        </div>
      </motion.div>

      {/* ── Organization Selector ── */}
      {organizations.length > 0 && (
        <div
          className="p-2 rounded-2xl flex flex-wrap gap-2"
          style={{ background: colors.cardBg, border: `1px solid ${colors.cardBorder}` }}
        >
          {organizations.map((org) => (
            <motion.button
              key={org.id}
              onClick={() => setSelectedOrg(org)}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{
                background: selectedOrg?.id === org.id ? colors.primary : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selectedOrg?.id === org.id ? colors.primary : colors.cardBorder}`,
                color: selectedOrg?.id === org.id ? '#fff' : colors.textSecondary,
              }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {org.short_name || org.name}
            </motion.button>
          ))}
        </div>
      )}

      {/* ── Message Banner ── */}
      <AnimatePresence>
        {message.text && (
          <motion.div
            className="p-3 rounded-xl flex items-center gap-3 text-sm"
            style={{
              background: message.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${message.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
              color: message.type === 'success' ? colors.success : colors.danger,
            }}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {message.type === 'success' ? (
              <CheckCircle className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            {message.text}
            <button
              className="ml-auto"
              onClick={() => setMessage({ type: '', text: '' })}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toolbar: search + role filter + refresh ── */}
      {selectedOrg && (
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative flex-1">
            <Search
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: colors.textTertiary }}
            />
            <input
              type="text"
              placeholder="Search by name, ID, or email…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${colors.cardBorder}`,
              }}
            />
          </div>

          {/* Role filter pills */}
          <div
            className="flex items-center gap-1 p-1 rounded-xl overflow-x-auto"
            style={{ background: colors.cardBg, border: `1px solid ${colors.cardBorder}` }}
          >
            {[
              { value: 'all',  label: 'All' },
              { value: 'none', label: 'No role' },
              ...AVAILABLE_ROLES.map((r) => ({ value: r.value, label: r.label.split(' ')[0] })),
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilterRole(f.value)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all"
                style={{
                  background:
                    filterRole === f.value ? `${colors.primary}20` : 'transparent',
                  color:
                    filterRole === f.value ? colors.primary : colors.textSecondary,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <motion.button
            onClick={() => loadMembers(true)}
            disabled={refreshing}
            className="p-2.5 rounded-xl"
            style={{ background: colors.cardBg, border: `1px solid ${colors.cardBorder}`, color: colors.textSecondary }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </motion.button>
        </div>
      )}

      {/* ── Member List ── */}
      {selectedOrg ? (
        loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <motion.div
              className="w-8 h-8 border-2 rounded-full"
              style={{ borderColor: `${colors.primary}30`, borderTopColor: colors.primary }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              Loading members…
            </p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div
            className="text-center py-14 rounded-xl"
            style={{ background: colors.cardBg, border: `1px solid ${colors.cardBorder}` }}
          >
            <User className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: colors.textSecondary }} />
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              {searchQuery || filterRole !== 'all' ? 'No matching members' : 'No members found'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredMembers.map((member) => (
              <MemberRow
                key={member.id}
                member={member}
                onEdit={setModalMember}
                onRemove={handleRemoveRole}
              />
            ))}
          </div>
        )
      ) : (
        <div
          className="text-center py-14 rounded-xl"
          style={{ background: colors.cardBg, border: `1px solid ${colors.cardBorder}` }}
        >
          <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: colors.textSecondary }} />
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            Select an organization to manage roles
          </p>
        </div>
      )}

      {/* ── Role Assignment Modal ── */}
      <AnimatePresence>
        {modalMember && selectedOrg && (
          <RoleModal
            member={modalMember}
            selectedOrg={selectedOrg}
            onClose={() => setModalMember(null)}
            onSuccess={() => loadMembers(true)}
          />
        )}
      </AnimatePresence>

      <Modal
        isOpen={showRemoveModal}
        onClose={() => {
          if (removingRole) return;
          setShowRemoveModal(false);
          setRoleToRemove(null);
        }}
        title="Remove Role"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm leading-6" style={{ color: colors.textSecondary }}>
            This will remove the selected role from the member. You can assign a new role later if needed.
          </p>

          {roleToRemove && (
            <div className="rounded-2xl p-4 border" style={{ background: 'rgba(255,255,255,0.04)', borderColor: colors.cardBorder }}>
              <p className="text-white font-semibold">
                {members.find(member => member.id === roleToRemove.member_id)?.full_name || 'Selected member'}
              </p>
              <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
                {getRoleInfo(roleToRemove.role)?.label || roleToRemove.role.replace(/_/g, ' ')} in {selectedOrg?.name || 'selected organization'}
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <button
              onClick={() => {
                if (removingRole) return;
                setShowRemoveModal(false);
                setRoleToRemove(null);
              }}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
              style={{ background: 'rgba(255,255,255,0.05)', color: colors.textSecondary, border: `1px solid ${colors.cardBorder}` }}
              disabled={removingRole}
            >
              Cancel
            </button>
            <button
              onClick={confirmRemoveRole}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ background: colors.danger }}
              disabled={removingRole}
            >
              {removingRole ? 'Removing...' : 'Remove Role'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}