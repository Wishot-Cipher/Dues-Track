/**
 * OrgMembersPage - Admin member management
 * Add, edit, import, activate/deactivate members seamlessly
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams } from 'react-router-dom';
import {
  UserPlus, Search, Users, Shield, Edit2, Trash2,
  Download, Upload, X, Check, Copy, Loader2,
  ChevronLeft, ChevronRight, MoreVertical,
  Key, AlertTriangle, CheckCircle, UserCheck,
  FileSpreadsheet, FileText, FileUp, Eye, RotateCcw,
  Link2, Share2,
} from 'lucide-react';
import { colors } from '@/config/colors';
import { APP_NAME } from '@/config/constants';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { supabase } from '@/config/supabase';
import { getOrgScope } from '@/utils/orgScope';
import GlassCard from '@/components/ui/GlassCard';

const DEFAULT_PASSWORD = 'Change@123';

import {
  parseFile,
  parseText,
  getFileAcceptAttribute,
  type ParseResult,
} from '@/utils/memberFileParser';

interface Member {
  id: string;
  member_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  is_suspended: boolean;
  force_password_change: boolean;
  group_id: string;
  created_at: string;
  last_login_at: string | null;
  login_count: number;
  admin_records?: Array<{ role: string }>;
}

interface NewMember {
  member_id: string;
  full_name: string;
  email: string;
  phone: string;
  password: string;
}

// Default password = member's own ID (registration number)
// They are forced to change it on first login

export default function OrgMembersPage() {
  useParams<{ orgSlug: string }>();
  const { user, organization, group, hasPermission, adminRecord } = useMultiTenantAuth();

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 20;

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Invite link
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteMaxUses, setInviteMaxUses] = useState(50);
  const [inviteExpiry, setInviteExpiry] = useState<'1d' | '7d' | '30d' | 'never'>('7d');

  // Add form
  const [newMember, setNewMember] = useState<NewMember>({ member_id: '', full_name: '', email: '', phone: '', password: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState<{ name: string; id: string; password: string } | null>(null);

  // Bulk import
  const [csvData, setCsvData] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ added: number; failed: number; errors: string[] } | null>(null);
  const [parsedPreview, setParsedPreview] = useState<ParseResult | null>(null);
  const [importStep, setImportStep] = useState<'upload' | 'preview' | 'result'>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const memberLabel = organization?.member_label || 'Member';
  const memberLabelPlural = organization?.member_label_plural || 'Members';

  // ── Fetch members ──
  const fetchMembers = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    try {
      let query = supabase
        .from('organization_members')
        .select('*, admin_records:member_admins(role)')
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false });

      // If group admin, only show their group
      if (group && !hasPermission('can_manage_admins')) {
        query = query.eq('group_id', group.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setMembers((data || []) as Member[]);
    } catch (err) {
      console.error('Fetch members error:', err);
    } finally {
      setLoading(false);
    }
  }, [organization, group, hasPermission]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // ── Filter & search ──
  const filtered = members.filter(m => {
    if (statusFilter === 'active' && !m.is_active) return false;
    if (statusFilter === 'inactive' && m.is_active) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        m.full_name.toLowerCase().includes(q) ||
        m.member_id.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalPages = Math.ceil(filtered.length / perPage);
  const paginated = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);
  const activeCount = members.filter(m => m.is_active).length;
  const adminCount = members.filter(m => m.admin_records && m.admin_records.length > 0).length;

  // ── Add single member ──
  const handleAddMember = async () => {
    setAddError('');
    if (!newMember.member_id.trim()) { setAddError(`${memberLabel} ID is required`); return; }
    if (!newMember.full_name.trim()) { setAddError('Full name is required'); return; }
    // Password defaults to member_id if not customized
    const password = newMember.password.trim() || newMember.member_id.trim();
    if (password.length < 3) { setAddError('Password / ID must be at least 3 characters'); return; }
    if (!organization || !user) return;

    setAddLoading(true);
    try {
      // Hash password via RPC
      const { data: hashedPw, error: hashErr } = await supabase.rpc('hash_password', {
        p_password: password,
      });
      if (hashErr) throw hashErr;

      const groupId = group?.id;
      if (!groupId) throw new Error('No group selected');

      const { data, error } = await supabase
        .from('organization_members')
        .insert({
          organization_id: organization.id,
          group_id: groupId,
          member_id: newMember.member_id.trim(),
          full_name: newMember.full_name.trim(),
          email: newMember.email.trim() || null,
          phone: newMember.phone.trim() || null,
          password_hash: hashedPw,
          force_password_change: true,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
          throw new Error(`A ${memberLabel.toLowerCase()} with ID "${newMember.member_id}" already exists`);
        }
        throw error;
      }

      setAddSuccess({
        name: data.full_name,
        id: data.member_id,
        password: password,
      });
      setNewMember({ member_id: '', full_name: '', email: '', phone: '', password: '' });
      fetchMembers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setAddLoading(false);
    }
  };

  // ── Parse uploaded file or pasted text ──
  const handleFileSelected = async (file: File) => {
    setUploadedFileName(file.name);
    setBulkResult(null);
    try {
      const result = await parseFile(file);
      setParsedPreview(result);
      if (result.members.length > 0) {
        setImportStep('preview');
      }
    } catch (err) {
      setParsedPreview({ members: [], totalRows: 0, skippedRows: 0, warnings: [`Failed to parse file: ${err}`], detectedFormat: 'unknown', columnMapping: {} });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFileSelected(file);
    // Reset the input so the same file can be re-selected
    e.target.value = '';
  };

  const handlePastePreview = () => {
    if (!csvData.trim()) return;
    const result = parseText(csvData);
    setParsedPreview(result);
    setUploadedFileName(null);
    if (result.members.length > 0) {
      setImportStep('preview');
    }
  };

  // Drag & Drop handlers
  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragActive(false); };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  };

  // ── Bulk import parsed members ──
  const handleBulkImport = async () => {
    const membersToImport = parsedPreview?.members;
    if (!membersToImport?.length || !organization || !group) return;
    setBulkLoading(true);
    setBulkResult(null);

    const errors: string[] = [];
    let added = 0;

    for (let i = 0; i < membersToImport.length; i++) {
      const m = membersToImport[i];
      // Password = their own member_id (registration number)
      const pwd = m.member_id;
      try {
        const { data: hashedPw } = await supabase.rpc('hash_password', { p_password: pwd });

        const { error } = await supabase
          .from('organization_members')
          .insert({
            organization_id: organization.id,
            group_id: group.id,
            member_id: m.member_id,
            full_name: m.full_name,
            email: m.email || null,
            phone: m.phone || null,
            password_hash: hashedPw,
            force_password_change: true,
            is_active: true,
          });

        if (error) {
          if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
            errors.push(`"${m.member_id}" already exists`);
          } else {
            errors.push(`"${m.member_id}": ${error.message}`);
          }
        } else {
          added++;
        }
      } catch {
        errors.push(`"${m.member_id}": Unexpected error`);
      }
    }

    setBulkResult({ added, failed: errors.length, errors });
    setImportStep('result');
    if (added > 0) fetchMembers();
    setBulkLoading(false);
  };

  const resetBulkModal = () => {
    setImportStep('upload');
    setParsedPreview(null);
    setCsvData('');
    setBulkResult(null);
    setUploadedFileName(null);
  };

  // ── Generate invite link ──
  const generateInviteLink = async () => {
    if (!organization || !user || !adminRecord) return;
    setInviteLoading(true);
    try {
      const expiryMap: Record<string, number | null> = {
        '1d': 1, '7d': 7, '30d': 30, 'never': null,
      };
      const days = expiryMap[inviteExpiry];
      const expires_at = days
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      const { data, error } = await supabase
        .from('organization_invites')
        .insert({
          organization_id: organization.id,
          group_id: group?.id || null,
          invite_type: 'bulk' as const,
          max_uses: inviteMaxUses,
          invite_code: Math.random().toString(36).substring(2, 10).toUpperCase(),
          is_active: true,
          expires_at: expires_at || null,
          created_by: adminRecord.id,
        })
        .select()
        .single();

      if (error) throw error;

      const code = (data as { invite_code: string }).invite_code;
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/${organization.slug}/join?code=${code}`;
      setInviteCode(code);
      setInviteLink(link);
    } catch (err) {
      console.error('Invite generation failed:', err);
    } finally {
      setInviteLoading(false);
    }
  };

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      // fallback
      const el = document.createElement('textarea');
      el.value = inviteLink; document.body.appendChild(el);
      el.select(); document.execCommand('copy'); document.body.removeChild(el);
      setInviteCopied(true);
      setTimeout(() => setInviteCopied(false), 2000);
    }
  };

  const shareInviteLink = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${organization?.name}`,
          text: `You're invited to join ${organization?.name} on ${APP_NAME}. Use code: ${inviteCode}`,
          url: inviteLink,
        });
      } catch { /* user cancelled */ }
    } else {
      copyInviteLink();
    }
  };

  // ── Toggle active ──
  const toggleActive = async (member: Member) => {
    try {
      const scope = getOrgScope();
      let q = supabase
        .from('organization_members')
        .update({ is_active: !member.is_active, updated_at: new Date().toISOString() })
        .eq('id', member.id);
      if (scope) q = q.eq('organization_id', scope.orgId);
      await q;
      fetchMembers();
    } catch (err) {
      console.error('Toggle error:', err);
    }
    setActiveDropdown(null);
  };

  // ── Reset password ──
  const resetPassword = async (member: Member) => {
    try {
      const scope = getOrgScope();
      // Reset password to their own member_id
      const pwd = member.member_id;
      const { data: hashedPw } = await supabase.rpc('hash_password', { p_password: pwd });
      let q = supabase
        .from('organization_members')
        .update({ password_hash: hashedPw, force_password_change: true, updated_at: new Date().toISOString() })
        .eq('id', member.id);
      if (scope) q = q.eq('organization_id', scope.orgId);
      await q;
      setAddSuccess({ name: member.full_name, id: member.member_id, password: pwd });
    } catch (err) {
      console.error('Reset password error:', err);
    }
    setActiveDropdown(null);
  };

  // ── Edit member ──
  const handleEditMember = async () => {
    if (!editingMember) return;
    try {
      const scope = getOrgScope();
      let q = supabase
        .from('organization_members')
        .update({
          full_name: editingMember.full_name,
          email: editingMember.email,
          phone: editingMember.phone,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingMember.id);
      if (scope) q = q.eq('organization_id', scope.orgId);
      await q;
      setShowEditModal(false);
      setEditingMember(null);
      fetchMembers();
    } catch (err) {
      console.error('Edit error:', err);
    }
  };

  // ── Delete member ──
  const deleteMember = async (member: Member) => {
    if (!confirm(`Remove ${member.full_name}? This cannot be undone.`)) return;
    try {
      const scope = getOrgScope();
      let q = supabase.from('organization_members').delete().eq('id', member.id);
      if (scope) q = q.eq('organization_id', scope.orgId);
      await q;
      fetchMembers();
    } catch (err) {
      console.error('Delete error:', err);
    }
    setActiveDropdown(null);
  };

  // ── Copy credentials ──
  const copyCredentials = (id: string, password: string) => {
    navigator.clipboard.writeText(`ID: ${id}\nPassword: ${password}`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Manage {memberLabelPlural}</h1>
          <p className="text-sm mt-1" style={{ color: colors.textTertiary }}>
            {organization?.name} &bull; {group?.name || 'All Groups'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowInviteModal(true); setInviteLink(''); setInviteCode(''); setInviteCopied(false); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105"
            style={{ border: `1px solid ${colors.borderPrimary}`, color: colors.success }}
          >
            <Link2 size={16} />
            <span className="hidden sm:inline">Invite Link</span>
          </button>
          <button
            onClick={() => setShowBulkModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105"
            style={{ border: `1px solid ${colors.borderPrimary}`, color: colors.primary }}
          >
            <Upload size={16} />
            <span className="hidden sm:inline">Import CSV</span>
          </button>
          <button
            onClick={() => { setShowAddModal(true); setAddError(''); setAddSuccess(null); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:scale-105"
            style={{ background: colors.primary }}
          >
            <UserPlus size={16} />
            Add {memberLabel}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: `Total ${memberLabelPlural}`, value: members.length, icon: <Users size={18} />, color: colors.primary },
          { label: 'Active', value: activeCount, icon: <CheckCircle size={18} />, color: colors.success },
          { label: 'Admins', value: adminCount, icon: <Shield size={18} />, color: colors.accentPurple },
        ].map(stat => (
          <GlassCard key={stat.label} className="p-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs" style={{ color: colors.textTertiary }}>{stat.label}</span>
              <div style={{ color: stat.color }}>{stat.icon}</div>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </GlassCard>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textTertiary }} />
          <input
            type="text"
            placeholder={`Search ${memberLabelPlural.toLowerCase()}...`}
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors text-sm"
          />
        </div>
        <div className="flex gap-2">
          {(['all', 'active', 'inactive'] as const).map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setCurrentPage(1); }}
              className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all capitalize"
              style={{
                background: statusFilter === s ? `${colors.primary}15` : 'rgba(255,255,255,0.03)',
                color: statusFilter === s ? colors.primary : colors.textSecondary,
                border: `1px solid ${statusFilter === s ? colors.primary : 'rgba(255,255,255,0.08)'}`,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Members Table */}
      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <Loader2 size={24} className="animate-spin mx-auto mb-2" style={{ color: colors.primary }} />
            <p className="text-sm" style={{ color: colors.textTertiary }}>Loading {memberLabelPlural.toLowerCase()}...</p>
          </div>
        ) : paginated.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Users size={40} className="mx-auto" style={{ color: colors.textDisabled }} />
            <p className="font-medium text-white">No {memberLabelPlural.toLowerCase()} found</p>
            <p className="text-sm" style={{ color: colors.textTertiary }}>
              {searchQuery ? 'Try a different search' : `Add your first ${memberLabel.toLowerCase()} to get started`}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium mt-2"
                style={{ color: colors.primary, border: `1px solid ${colors.borderPrimary}` }}
              >
                <UserPlus size={16} />
                Add {memberLabel}
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Desktop header */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary, borderBottom: `1px solid ${colors.borderLight}` }}>
              <div className="col-span-4">{memberLabel}</div>
              <div className="col-span-2">ID</div>
              <div className="col-span-2">Contact</div>
              <div className="col-span-2">Status</div>
              <div className="col-span-2 text-right">Actions</div>
            </div>

            {/* Rows */}
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {paginated.map((member, idx) => {
                const isAdmin = member.admin_records && member.admin_records.length > 0;
                return (
                  <motion.div
                    key={member.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 px-5 py-4 hover:bg-white/2 transition-colors items-center"
                  >
                    {/* Name + Avatar */}
                    <div className="md:col-span-4 flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                        style={{ background: isAdmin ? `${colors.accentPurple}40` : `${colors.primary}30` }}
                      >
                        {member.full_name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate flex items-center gap-1.5">
                          {member.full_name}
                          {isAdmin && <Shield size={12} style={{ color: colors.accentPurple }} />}
                        </p>
                        <p className="text-xs md:hidden" style={{ color: colors.textTertiary }}>{member.member_id}</p>
                      </div>
                    </div>

                    {/* ID */}
                    <div className="hidden md:block md:col-span-2">
                      <p className="text-sm text-white">{member.member_id}</p>
                    </div>

                    {/* Contact */}
                    <div className="hidden md:block md:col-span-2">
                      {member.email ? (
                        <p className="text-xs truncate" style={{ color: colors.textSecondary }}>{member.email}</p>
                      ) : (
                        <p className="text-xs italic" style={{ color: colors.textDisabled }}>No email</p>
                      )}
                    </div>

                    {/* Status */}
                    <div className="md:col-span-2 flex items-center gap-2">
                      <span
                        className="text-xs font-medium px-2.5 py-1 rounded-full"
                        style={{
                          color: member.is_active ? colors.success : colors.error,
                          background: member.is_active ? `${colors.success}15` : `${colors.error}15`,
                        }}
                      >
                        {member.is_active ? 'Active' : 'Inactive'}
                      </span>
                      {member.force_password_change && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ color: colors.warning, background: `${colors.warning}15` }}>
                          New
                        </span>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="md:col-span-2 flex items-center justify-end gap-1 relative">
                      <button
                        onClick={() => { setEditingMember({ ...member }); setShowEditModal(true); }}
                        className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={15} style={{ color: colors.textSecondary }} />
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setActiveDropdown(activeDropdown === member.id ? null : member.id)}
                          className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                        >
                          <MoreVertical size={15} style={{ color: colors.textSecondary }} />
                        </button>

                        <AnimatePresence>
                          {activeDropdown === member.id && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setActiveDropdown(null)} />
                              <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="absolute right-0 top-full mt-1 w-48 rounded-xl overflow-hidden z-50 py-1"
                                style={{ background: colors.secondaryLighter, border: `1px solid ${colors.borderLight}`, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
                              >
                                <button
                                  onClick={() => resetPassword(member)}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/5 transition-colors text-left"
                                  style={{ color: colors.textSecondary }}
                                >
                                  <Key size={14} /> Reset Password
                                </button>
                                <button
                                  onClick={() => toggleActive(member)}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/5 transition-colors text-left"
                                  style={{ color: member.is_active ? colors.warning : colors.success }}
                                >
                                  {member.is_active ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
                                  {member.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                                <button
                                  onClick={() => deleteMember(member)}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-white/5 transition-colors text-left"
                                  style={{ color: colors.error }}
                                >
                                  <Trash2 size={14} /> Remove
                                </button>
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: `1px solid ${colors.borderLight}` }}>
                <p className="text-xs" style={{ color: colors.textTertiary }}>
                  Showing {(currentPage - 1) * perPage + 1}–{Math.min(currentPage * perPage, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-30"
                  >
                    <ChevronLeft size={16} className="text-white" />
                  </button>
                  <span className="text-sm text-white px-3">{currentPage} / {totalPages}</span>
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-30"
                  >
                    <ChevronRight size={16} className="text-white" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </GlassCard>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* INVITE LINK MODAL                                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowInviteModal(false)} />
            <motion.div
              className="relative w-full max-w-md rounded-2xl p-6 z-10"
              style={{ background: colors.backgroundCard, border: `1px solid ${colors.borderLight}` }}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.success}15` }}>
                    <Link2 size={20} style={{ color: colors.success }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Invite Link</h3>
                    <p className="text-xs" style={{ color: colors.textTertiary }}>
                      Share this link with {memberLabelPlural.toLowerCase()} to join
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowInviteModal(false)} className="p-2 rounded-lg hover:bg-white/5"><X size={18} className="text-gray-400" /></button>
              </div>

              {!inviteLink ? (
                <div className="space-y-4">
                  {/* Max Uses */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-1.5">Max number of joins</label>
                    <div className="flex gap-2">
                      {[10, 25, 50, 100, 500].map(n => (
                        <button
                          key={n}
                          onClick={() => setInviteMaxUses(n)}
                          className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: inviteMaxUses === n ? `${colors.primary}20` : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${inviteMaxUses === n ? colors.primary : 'rgba(255,255,255,0.08)'}`,
                            color: inviteMaxUses === n ? colors.primary : colors.textSecondary,
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Expiry */}
                  <div>
                    <label className="block text-sm font-medium text-white mb-1.5">Expires in</label>
                    <div className="flex gap-2">
                      {([['1d', '1 day'], ['7d', '7 days'], ['30d', '30 days'], ['never', 'Never']] as const).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => setInviteExpiry(val)}
                          className="flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: inviteExpiry === val ? `${colors.primary}20` : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${inviteExpiry === val ? colors.primary : 'rgba(255,255,255,0.08)'}`,
                            color: inviteExpiry === val ? colors.primary : colors.textSecondary,
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {group && (
                    <div className="p-3 rounded-xl text-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p className="text-xs" style={{ color: colors.textTertiary }}>
                        Members who join will be added to: <span className="text-white font-medium">{group.name}</span>
                      </p>
                    </div>
                  )}

                  <button
                    onClick={generateInviteLink}
                    disabled={inviteLoading}
                    className="w-full px-6 py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                    style={{ background: colors.primary }}
                  >
                    {inviteLoading ? <><Loader2 size={16} className="animate-spin" /> Generating...</> : <><Link2 size={16} /> Generate Link</>}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Generated Link */}
                  <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <p className="text-xs font-medium mb-2" style={{ color: colors.textTertiary }}>Invite Link</p>
                    <p className="text-sm text-white break-all font-mono">{inviteLink}</p>
                  </div>

                  <div className="p-3 rounded-xl" style={{ background: `${colors.primary}08`, border: `1px solid ${colors.primary}20` }}>
                    <p className="text-xs font-medium mb-1" style={{ color: colors.textTertiary }}>Invite Code</p>
                    <p className="text-2xl font-bold tracking-[0.3em] text-white text-center">{inviteCode}</p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={copyInviteLink}
                      className="flex-1 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                      style={{
                        background: inviteCopied ? `${colors.success}15` : `${colors.primary}15`,
                        color: inviteCopied ? colors.success : colors.primary,
                        border: `1px solid ${inviteCopied ? colors.success : colors.primary}30`,
                      }}
                    >
                      {inviteCopied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy Link</>}
                    </button>
                    <button
                      onClick={shareInviteLink}
                      className="flex-1 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                      style={{ background: `${colors.primary}15`, color: colors.primary, border: `1px solid ${colors.primary}30` }}
                    >
                      <Share2 size={16} /> Share
                    </button>
                  </div>

                  <button
                    onClick={() => { setInviteLink(''); setInviteCode(''); }}
                    className="w-full text-center text-xs py-2 hover:underline"
                    style={{ color: colors.textTertiary }}
                  >
                    Generate a new link
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ADD MEMBER MODAL                                       */}
      {/* ═══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
            <motion.div
              className="relative w-full max-w-md rounded-2xl p-6 border"
              style={{ background: colors.secondaryLight, borderColor: colors.borderLight, boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white">Add {memberLabel}</h3>
                <button onClick={() => setShowAddModal(false)} className="p-2 rounded-lg hover:bg-white/5">
                  <X size={18} className="text-white" />
                </button>
              </div>

              {/* Success State */}
              {addSuccess ? (
                <motion.div className="space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="text-center py-4">
                    <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: `${colors.success}15` }}>
                      <UserCheck size={28} style={{ color: colors.success }} />
                    </div>
                    <h4 className="text-lg font-semibold text-white">{memberLabel} Added!</h4>
                    <p className="text-sm mt-1" style={{ color: colors.textTertiary }}>{addSuccess.name} can now log in</p>
                  </div>

                  <div className="p-4 rounded-xl space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.borderLight}` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs" style={{ color: colors.textTertiary }}>Login ID</p>
                        <p className="text-sm font-mono text-white">{addSuccess.id}</p>
                      </div>
                      <button onClick={() => copyCredentials(addSuccess.id, addSuccess.password)} className="p-2 rounded-lg hover:bg-white/5" title="Copy">
                        <Copy size={14} style={{ color: colors.primary }} />
                      </button>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: colors.textTertiary }}>Default Password</p>
                      <p className="text-sm font-mono text-white">{addSuccess.password}</p>
                    </div>
                    <p className="text-xs" style={{ color: colors.warning }}>
                      Share these credentials securely. They'll be asked to change their password on first login.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setAddSuccess(null)}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white"
                      style={{ background: colors.primary }}
                    >
                      Add Another
                    </button>
                    <button
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium"
                      style={{ color: colors.textSecondary, border: `1px solid ${colors.borderLight}` }}
                    >
                      Done
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-4">
                  {addError && (
                    <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ background: `${colors.error}10`, color: colors.error, border: `1px solid ${colors.error}25` }}>
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      {addError}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-white mb-1.5">{memberLabel} ID *</label>
                    <input
                      type="text"
                      placeholder={organization?.organization_type === 'university' ? 'e.g. CSC/2020/001' : 'e.g. MEM001'}
                      value={newMember.member_id}
                      onChange={e => setNewMember(prev => ({ ...prev, member_id: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-1.5">Full Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={newMember.full_name}
                      onChange={e => setNewMember(prev => ({ ...prev, full_name: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-white mb-1.5">Email</label>
                      <input
                        type="email"
                        placeholder="Optional"
                        value={newMember.email}
                        onChange={e => setNewMember(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-1.5">Phone</label>
                      <input
                        type="tel"
                        placeholder="Optional"
                        value={newMember.phone}
                        onChange={e => setNewMember(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-1.5">Default Password</label>
                    <input
                      type="text"
                      value={newMember.password}
                      onChange={e => setNewMember(prev => ({ ...prev, password: e.target.value }))}
                      placeholder={newMember.member_id || 'Same as ID (auto)'}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors text-sm font-mono"
                    />
                    <p className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                      Defaults to their ID/Reg Number. {memberLabel} will be forced to change on first login.
                    </p>
                  </div>

                  <button
                    onClick={handleAddMember}
                    disabled={addLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                    style={{ background: colors.primary }}
                  >
                    {addLoading ? <><Loader2 size={16} className="animate-spin" /> Adding...</> : <><UserPlus size={16} /> Add {memberLabel}</>}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* BULK IMPORT MODAL                                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showBulkModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowBulkModal(false); resetBulkModal(); }} />
            <motion.div
              className="relative w-full max-w-2xl rounded-2xl border max-h-[90vh] flex flex-col"
              style={{ background: colors.secondaryLight, borderColor: colors.borderLight, boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${colors.primary}15`, color: colors.primary }}>
                    <FileUp size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Import {memberLabelPlural}</h3>
                    <p className="text-xs" style={{ color: colors.textTertiary }}>
                      {importStep === 'upload' && 'Upload a file or paste data'}
                      {importStep === 'preview' && `${parsedPreview?.members.length || 0} ${memberLabelPlural.toLowerCase()} ready`}
                      {importStep === 'result' && 'Import complete'}
                    </p>
                  </div>
                </div>
                <button onClick={() => { setShowBulkModal(false); resetBulkModal(); }} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
                  <X size={18} className="text-white" />
                </button>
              </div>

              {/* Step indicator */}
              <div className="flex items-center gap-2 px-6 py-3" style={{ borderBottom: `1px solid rgba(255,255,255,0.04)` }}>
                {(['upload', 'preview', 'result'] as const).map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                      style={{
                        background: importStep === step ? colors.primary : (['upload', 'preview', 'result'].indexOf(importStep) > i ? `${colors.success}20` : 'rgba(255,255,255,0.06)'),
                        color: importStep === step ? '#fff' : (['upload', 'preview', 'result'].indexOf(importStep) > i ? colors.success : colors.textTertiary),
                      }}
                    >
                      {['upload', 'preview', 'result'].indexOf(importStep) > i ? <Check size={12} /> : i + 1}
                    </div>
                    <span className="text-xs capitalize hidden sm:inline" style={{ color: importStep === step ? 'white' : colors.textTertiary }}>{step}</span>
                    {i < 2 && <div className="w-6 h-px mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />}
                  </div>
                ))}
              </div>

              {/* Content (scrollable) */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {/* ── Step 1: Upload ── */}
                {importStep === 'upload' && (
                  <>
                    {/* Supported formats banner */}
                    <div className="p-3 rounded-xl" style={{ background: `${colors.primary}06`, border: `1px solid ${colors.borderPrimary}` }}>
                      <div className="flex items-center gap-2 mb-2">
                        <FileSpreadsheet size={14} style={{ color: colors.primary }} />
                        <p className="text-xs font-semibold" style={{ color: colors.primary }}>Supported Formats</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { ext: 'Excel', desc: '.xlsx / .xls', icon: <FileSpreadsheet size={12} /> },
                          { ext: 'CSV', desc: '.csv', icon: <FileText size={12} /> },
                          { ext: 'Word', desc: '.docx (tables)', icon: <FileText size={12} /> },
                          { ext: 'Text', desc: '.txt / .tsv', icon: <FileText size={12} /> },
                        ].map(f => (
                          <span key={f.ext} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs" style={{ background: 'rgba(255,255,255,0.04)', color: colors.textSecondary }}>
                            {f.icon} {f.ext} <span style={{ color: colors.textTertiary }}>{f.desc}</span>
                          </span>
                        ))}
                      </div>
                      <p className="text-xs mt-2" style={{ color: colors.textTertiary }}>
                        Columns auto-detected: ID, Name, Email, Phone. Headers like "Matric No", "Student Name", "Mobile" etc. are recognized automatically.
                      </p>
                    </div>

                    {/* Drag & Drop zone */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={getFileAcceptAttribute()}
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div
                      ref={dropZoneRef}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className="relative cursor-pointer rounded-2xl p-8 text-center transition-all"
                      style={{
                        border: `2px dashed ${dragActive ? colors.primary : colors.borderMedium}`,
                        background: dragActive ? `${colors.primary}08` : 'rgba(255,255,255,0.02)',
                      }}
                    >
                      <motion.div
                        animate={{ scale: dragActive ? 1.05 : 1 }}
                        className="flex flex-col items-center gap-3"
                      >
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: `${colors.primary}12`, color: colors.primary }}>
                          <Upload size={24} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">
                            {dragActive ? 'Drop your file here' : 'Drag & drop your file here'}
                          </p>
                          <p className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                            or <span style={{ color: colors.primary, fontWeight: 600 }}>click to browse</span> — Excel, CSV, Word, or Text
                          </p>
                        </div>
                      </motion.div>
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                      <span className="text-xs font-medium" style={{ color: colors.textTertiary }}>or paste data</span>
                      <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                    </div>

                    {/* Paste area */}
                    <textarea
                      value={csvData}
                      onChange={e => setCsvData(e.target.value)}
                      placeholder={`Paste your data here (CSV, tab-separated, etc.)\n\nExample:\nCSC/2020/001, John Doe, john@email.com, 08012345678\nCSC/2020/002, Jane Smith, , 08087654321`}
                      rows={5}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors text-sm font-mono resize-none"
                    />

                    {csvData.trim() && (
                      <button
                        onClick={handlePastePreview}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-semibold text-sm transition-all hover:scale-[1.02]"
                        style={{ background: colors.primary }}
                      >
                        <Eye size={16} /> Preview Pasted Data
                      </button>
                    )}

                    {/* Parse warnings (shown if user uploaded but got 0 members) */}
                    {parsedPreview && parsedPreview.members.length === 0 && parsedPreview.warnings.length > 0 && (
                      <div className="p-3 rounded-xl space-y-1" style={{ background: `${colors.error}08`, border: `1px solid ${colors.error}20` }}>
                        <p className="text-xs font-semibold" style={{ color: colors.error }}>Could not parse any {memberLabelPlural.toLowerCase()}</p>
                        {parsedPreview.warnings.map((w, i) => (
                          <p key={i} className="text-xs" style={{ color: colors.error }}>{w}</p>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* ── Step 2: Preview ── */}
                {importStep === 'preview' && parsedPreview && (
                  <>
                    {/* Summary bar */}
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: `${colors.success}08`, border: `1px solid ${colors.success}20` }}>
                        <CheckCircle size={14} style={{ color: colors.success }} />
                        <span className="text-xs font-medium" style={{ color: colors.success }}>
                          {parsedPreview.members.length} {memberLabelPlural.toLowerCase()} found
                        </span>
                      </div>
                      {uploadedFileName && (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                          <FileText size={14} style={{ color: colors.textTertiary }} />
                          <span className="text-xs" style={{ color: colors.textSecondary }}>{uploadedFileName}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-md font-mono" style={{ background: `${colors.primary}15`, color: colors.primary }}>
                            {parsedPreview.detectedFormat}
                          </span>
                        </div>
                      )}
                      {parsedPreview.skippedRows > 0 && (
                        <span className="text-xs" style={{ color: colors.warning }}>
                          {parsedPreview.skippedRows} row{parsedPreview.skippedRows !== 1 ? 's' : ''} skipped
                        </span>
                      )}
                    </div>

                    {/* Column mapping info */}
                    {Object.keys(parsedPreview.columnMapping).length > 0 && (
                      <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <p className="text-xs font-medium mb-2" style={{ color: colors.textTertiary }}>Detected column mapping:</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(parsedPreview.columnMapping).map(([field, col]) => (
                            <span key={field} className="text-xs px-2 py-1 rounded-md" style={{ background: 'rgba(255,255,255,0.05)', color: colors.textSecondary }}>
                              <span style={{ color: colors.primary }}>{field}</span> ← "{col}"
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Warnings */}
                    {parsedPreview.warnings.length > 0 && (
                      <div className="p-3 rounded-xl" style={{ background: `${colors.warning}06`, border: `1px solid ${colors.warning}15` }}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <AlertTriangle size={12} style={{ color: colors.warning }} />
                          <p className="text-xs font-semibold" style={{ color: colors.warning }}>{parsedPreview.warnings.length} warning{parsedPreview.warnings.length !== 1 ? 's' : ''}</p>
                        </div>
                        <div className="max-h-20 overflow-y-auto space-y-0.5">
                          {parsedPreview.warnings.map((w, i) => (
                            <p key={i} className="text-xs" style={{ color: colors.textTertiary }}>{w}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Preview table */}
                    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                              <th className="text-left px-3 py-2 font-semibold" style={{ color: colors.textTertiary }}>#</th>
                              <th className="text-left px-3 py-2 font-semibold" style={{ color: colors.textTertiary }}>ID</th>
                              <th className="text-left px-3 py-2 font-semibold" style={{ color: colors.textTertiary }}>Name</th>
                              <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell" style={{ color: colors.textTertiary }}>Email</th>
                              <th className="text-left px-3 py-2 font-semibold hidden sm:table-cell" style={{ color: colors.textTertiary }}>Phone</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                            {parsedPreview.members.slice(0, 50).map((m, i) => (
                              <tr key={i} className="hover:bg-white/2 transition-colors" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                                <td className="px-3 py-2" style={{ color: colors.textTertiary }}>{i + 1}</td>
                                <td className="px-3 py-2 font-mono" style={{ color: colors.textSecondary }}>{m.member_id}</td>
                                <td className="px-3 py-2 text-white font-medium">{m.full_name}</td>
                                <td className="px-3 py-2 hidden sm:table-cell" style={{ color: m.email ? colors.textSecondary : colors.textDisabled }}>{m.email || '—'}</td>
                                <td className="px-3 py-2 hidden sm:table-cell" style={{ color: m.phone ? colors.textSecondary : colors.textDisabled }}>{m.phone || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {parsedPreview.members.length > 50 && (
                        <div className="px-3 py-2 text-center" style={{ background: 'rgba(255,255,255,0.02)', color: colors.textTertiary }}>
                          <span className="text-xs">Showing 50 of {parsedPreview.members.length} — all will be imported</span>
                        </div>
                      )}
                    </div>

                    <div className="p-3 rounded-xl" style={{ background: `${colors.primary}06`, border: `1px solid ${colors.borderPrimary}` }}>
                      <p className="text-xs" style={{ color: colors.textTertiary }}>
                        All {memberLabelPlural.toLowerCase()} will be created with default password: <span className="font-mono font-semibold" style={{ color: colors.primary }}>{DEFAULT_PASSWORD}</span>
                        <br />They will be prompted to change it on first login.
                      </p>
                    </div>
                  </>
                )}

                {/* ── Step 3: Result ── */}
                {importStep === 'result' && bulkResult && (
                  <>
                    <motion.div
                      className="flex flex-col items-center gap-4 py-4"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                    >
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center"
                        style={{ background: bulkResult.failed === 0 ? `${colors.success}15` : `${colors.warning}15` }}
                      >
                        {bulkResult.failed === 0 ? (
                          <CheckCircle size={32} style={{ color: colors.success }} />
                        ) : (
                          <AlertTriangle size={32} style={{ color: colors.warning }} />
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-xl font-bold text-white">
                          {bulkResult.added} {memberLabelPlural} Added
                        </p>
                        {bulkResult.failed > 0 && (
                          <p className="text-sm mt-1" style={{ color: colors.warning }}>
                            {bulkResult.failed} failed
                          </p>
                        )}
                      </div>
                    </motion.div>

                    {bulkResult.errors.length > 0 && (
                      <div className="p-3 rounded-xl" style={{ background: `${colors.error}06`, border: `1px solid ${colors.error}15` }}>
                        <p className="text-xs font-semibold mb-2" style={{ color: colors.error }}>Errors:</p>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {bulkResult.errors.map((err, i) => (
                            <p key={i} className="text-xs" style={{ color: colors.textTertiary }}>{err}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="text-xs" style={{ color: colors.textTertiary }}>
                        Default password: <span className="font-mono font-semibold" style={{ color: colors.primary }}>{DEFAULT_PASSWORD}</span>
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Footer actions */}
              <div className="px-6 py-4 border-t flex items-center gap-3" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                {importStep === 'upload' && (
                  <button
                    onClick={() => { setShowBulkModal(false); resetBulkModal(); }}
                    className="flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
                    style={{ color: colors.textSecondary, border: `1px solid ${colors.borderLight}` }}
                  >
                    Cancel
                  </button>
                )}

                {importStep === 'preview' && (
                  <>
                    <button
                      onClick={() => { setImportStep('upload'); setParsedPreview(null); }}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
                      style={{ color: colors.textSecondary, border: `1px solid ${colors.borderLight}` }}
                    >
                      <RotateCcw size={14} /> Back
                    </button>
                    <button
                      onClick={handleBulkImport}
                      disabled={bulkLoading}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-semibold text-sm transition-all hover:scale-[1.02] disabled:opacity-60"
                      style={{ background: colors.primary }}
                    >
                      {bulkLoading ? (
                        <><Loader2 size={16} className="animate-spin" /> Importing {parsedPreview?.members.length || 0}...</>
                      ) : (
                        <><Download size={16} /> Import {parsedPreview?.members.length || 0} {memberLabelPlural}</>
                      )}
                    </button>
                  </>
                )}

                {importStep === 'result' && (
                  <>
                    <button
                      onClick={resetBulkModal}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
                      style={{ color: colors.textSecondary, border: `1px solid ${colors.borderLight}` }}
                    >
                      <RotateCcw size={14} /> Import More
                    </button>
                    <button
                      onClick={() => { setShowBulkModal(false); resetBulkModal(); }}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-semibold text-sm transition-all hover:scale-[1.02]"
                      style={{ background: colors.primary }}
                    >
                      <Check size={16} /> Done
                    </button>
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* EDIT MEMBER MODAL                                      */}
      {/* ═══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showEditModal && editingMember && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowEditModal(false); setEditingMember(null); }} />
            <motion.div
              className="relative w-full max-w-md rounded-2xl p-6 border"
              style={{ background: colors.secondaryLight, borderColor: colors.borderLight, boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white">Edit {memberLabel}</h3>
                <button onClick={() => { setShowEditModal(false); setEditingMember(null); }} className="p-2 rounded-lg hover:bg-white/5">
                  <X size={18} className="text-white" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Full Name</label>
                  <input
                    type="text"
                    value={editingMember.full_name}
                    onChange={e => setEditingMember(prev => prev ? { ...prev, full_name: e.target.value } : null)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-[#FF6803] transition-colors text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">{memberLabel} ID</label>
                  <input
                    type="text"
                    value={editingMember.member_id}
                    disabled
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white/50 outline-none text-sm cursor-not-allowed"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-white mb-1.5">Email</label>
                    <input
                      type="email"
                      value={editingMember.email || ''}
                      onChange={e => setEditingMember(prev => prev ? { ...prev, email: e.target.value || null } : null)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-[#FF6803] transition-colors text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-1.5">Phone</label>
                    <input
                      type="tel"
                      value={editingMember.phone || ''}
                      onChange={e => setEditingMember(prev => prev ? { ...prev, phone: e.target.value || null } : null)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-[#FF6803] transition-colors text-sm"
                    />
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => { setShowEditModal(false); setEditingMember(null); }}
                    className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium"
                    style={{ color: colors.textSecondary, border: `1px solid ${colors.borderLight}` }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEditMember}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold"
                    style={{ background: colors.primary }}
                  >
                    <Check size={16} /> Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* PASSWORD RESET SUCCESS TOAST (reused)                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {addSuccess && !showAddModal && (
          <motion.div
            className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl p-4 border"
            style={{ background: colors.secondaryLight, borderColor: colors.borderLight, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.9 }}
          >
            <div className="flex items-start gap-3">
              <CheckCircle size={20} style={{ color: colors.success }} />
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Password Reset</p>
                <p className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>
                  {addSuccess.name}'s password has been reset to <span className="font-mono">{addSuccess.password}</span>
                </p>
              </div>
              <button onClick={() => setAddSuccess(null)} className="p-1 rounded hover:bg-white/5">
                <X size={14} className="text-white" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
