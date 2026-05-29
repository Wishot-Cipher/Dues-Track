/* eslint-disable @typescript-eslint/no-explicit-any */
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
  ChevronLeft, ChevronRight, ChevronDown,
  Key, AlertTriangle, CheckCircle, UserCheck,
  FileSpreadsheet, FileText, FileUp, Eye, RotateCcw,
  Link2, Share2, Crown, CheckSquare, Square, MinusSquare,
  UserCog, Sparkles, Filter, Plus, User, XCircle,
} from 'lucide-react';
import { colors, gradients } from '@/config/colors';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import { APP_NAME } from '@/config/constants';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { supabase } from '@/config/supabase';
import organizationService from '@/services/organizationService';
import { getOrgScope } from '@/utils/orgScope';
import GlassCard from '@/components/ui/GlassCard';
import { exportStudentsToPDF } from '@/utils/htmlPrintExports';
import { useSubscriptionLimits } from '@/hooks/useSubscriptionLimits';
import { useAppNav } from '@/hooks/useAppNav';
import { useOrganization } from '@/hooks/useOrganization';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';

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
  level: string | null;
  section: string | null;
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
  level: string;
}

// Default password = member's own ID (registration number)
// They are forced to change it on first login

export default function OrgMembersPage() {
  useParams<{ orgSlug: string }>();
  const { theme } = useTheme();
  const tk = getDashboardTokens(theme);
  const { user, organization, group, hasPermission, adminRecord } = useMultiTenantAuth();
  const { canCreate, planName, refresh: refreshLimits } = useSubscriptionLimits();
  const { go: navigateTo } = useAppNav();
  const { settings } = useOrganization();

  // Org/group-level fallback values for exports (used when per-student fields are empty)
  const academicInfo = (settings?.custom_settings as Record<string, unknown>)?.academic as { academic_level?: string; faculty?: string } | undefined;
  // Prefer the group's primary level when available; fall back to org-level setting.
  const orgLevel = (group?.levels && group.levels.length > 0 ? organizationService.canonicalizeLevel(group.levels[0]) : academicInfo?.academic_level) || '';
  const orgDepartment = group?.name || '';

  // Limit check state
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [limitMessage, setLimitMessage] = useState('');

  // Confirmation modal state
  const [confirmAction, setConfirmAction] = useState<{
    isOpen: boolean;
    type: 'delete' | 'deactivate' | null;
    member: Member | null;
  }>({ isOpen: false, type: null, member: null });

  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'finsec' | 'class_rep' | 'member'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 20;
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  // Selection & export state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'pdf' | 'csv'>('pdf');
  const [exporting, setExporting] = useState(false);
  const [exportFields, setExportFields] = useState({
    name: true,
    regNumber: true,
    level: true,
    department: true,
    email: false,
    phone: false,
    status: true,
    roles: false,
    joinDate: false,
  });

  // Role management
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [roleTarget, setRoleTarget] = useState<Member | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  // Invite link
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteMaxUses, setInviteMaxUses] = useState(50);
  const [inviteExpiry, setInviteExpiry] = useState<'1d' | '7d' | '30d' | 'never'>('7d');

  // Add form
  const [newMember, setNewMember] = useState<NewMember>({ member_id: '', full_name: '', email: '', phone: '', password: '', level: '' });
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
  const pageSurface = {
    background: tk.bgWash,
    color: tk.text,
  };
  const cardSurface = {
    background: tk.card,
    border: `1px solid ${tk.cardBorder}`,
  };
  const subtleSurface = {
    background: theme === 'light' ? 'rgba(255, 255, 255, 0.78)' : 'rgba(255, 255, 255, 0.03)',
    border: `1px solid ${tk.cardBorder}`,
  };

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
      const scope = getOrgScope();
      if (group?.id) {
        query = query.eq('group_id', group.id);
      } else if (scope) {
        query = query.eq('group_id', scope.groupId);
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

  // Lock body scroll when any modal is open
  useEffect(() => {
    const isAnyModalOpen = showAddModal || showBulkModal || showEditModal || showExportModal || showRoleModal || showInviteModal || (!!addSuccess && !showAddModal);

    if (isAnyModalOpen) {
      const scrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflow = 'hidden';
    } else {
      const scrollY = document.body.style.top;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0', 10) * -1);
      }
    }

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
    };
  }, [showAddModal, showBulkModal, showEditModal, showExportModal, showRoleModal, showInviteModal, addSuccess]);

  // ── Filter & search ──
  const filtered = members.filter(m => {
    if (statusFilter === 'active' && !m.is_active) return false;
    if (statusFilter === 'inactive' && m.is_active) return false;

    // Role filter
    if (roleFilter !== 'all') {
      const roles = m.admin_records || [];
      const isAdmin = roles.some(r => ['admin', 'org_admin', 'org_owner', 'super_admin'].includes(r.role));
      const isFinsec = roles.some(r => r.role === 'treasurer');
      const isClassRep = roles.some(r => r.role === 'group_admin');
      if (roleFilter === 'admin' && !isAdmin) return false;
      if (roleFilter === 'finsec' && !isFinsec) return false;
      if (roleFilter === 'class_rep' && !isClassRep) return false;
      if (roleFilter === 'member' && (isAdmin || isFinsec || isClassRep)) return false;
    }

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

  // Sort alphabetically
  const sortedFiltered = [...filtered].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

  const totalPages = Math.ceil(sortedFiltered.length / perPage);
  const paginated = sortedFiltered.slice((currentPage - 1) * perPage, currentPage * perPage);
  const activeCount = members.filter(m => m.is_active).length;
  const inactiveCount = members.filter(m => !m.is_active).length;
  const adminCount = members.filter(m => {
    const roles = m.admin_records || [];
    return roles.some(r => ['admin', 'org_admin', 'org_owner', 'super_admin'].includes(r.role));
  }).length;
  const finsecCount = members.filter(m => {
    const roles = m.admin_records || [];
    return roles.some(r => r.role === 'treasurer');
  }).length;
  const classRepCount = members.filter(m => {
    const roles = m.admin_records || [];
    return roles.some(r => r.role === 'group_admin');
  }).length;
  const memberOnlyCount = members.filter(m => {
    const roles = m.admin_records || [];
    const isAdmin = roles.some(r => ['admin', 'org_admin', 'org_owner', 'super_admin'].includes(r.role));
    const isFinsec = roles.some(r => r.role === 'treasurer');
    const isClassRep = roles.some(r => r.role === 'group_admin');
    return !isAdmin && !isFinsec && !isClassRep;
  }).length;

  // ── Add single member ──
  const handleAddMember = async () => {
    setAddError('');
    if (!newMember.member_id.trim()) { setAddError(`${memberLabel} ID is required`); return; }
    if (!newMember.full_name.trim()) { setAddError('Full name is required'); return; }
    // Password defaults to member_id if not customized
    const password = newMember.password.trim() || newMember.member_id.trim();
    if (password.length < 3) { setAddError('Password / ID must be at least 3 characters'); return; }
    if (!organization || !user) return;

    // ── Check plan limit before adding ──
    const limitCheck = canCreate('members');
    if (!limitCheck.allowed) {
      setLimitMessage(limitCheck.message || `You've reached the member limit on the ${planName} plan.`);
      setShowLimitModal(true);
      return;
    }

    setAddLoading(true);
    try {
      // Hash password via RPC
      const { data: hashedPw, error: hashErr } = await supabase.rpc('hash_password', {
        p_password: password,
      });
      if (hashErr) throw hashErr;

      const groupId = group?.id;
      if (!groupId) throw new Error('No group selected');

      // Enforce group's single primary level
      const groupPrimary = group?.levels && group.levels.length > 0 ? organizationService.canonicalizeLevel(group.levels[0]) : null;
      if (newMember.level.trim() && groupPrimary) {
        const provided = organizationService.canonicalizeLevel(newMember.level.trim());
        if (provided && provided !== groupPrimary) {
          throw new Error(`This department's level is ${groupPrimary}. Members must use that level.`);
        }
      }

      const { data, error } = await supabase
        .from('organization_members')
        .insert({
          organization_id: organization.id,
          group_id: groupId,
          member_id: newMember.member_id.trim(),
          full_name: newMember.full_name.trim(),
          email: newMember.email.trim() || null,
          phone: newMember.phone.trim() || null,
          level: groupPrimary,
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
      setNewMember({ member_id: '', full_name: '', email: '', phone: '', password: '', level: '' });
      // If org-level (academic_level) is not set, persist this group's primary level so
      // other places that fall back to org level (exports, profile) show a value.
      try {
        const currentCustom = (settings?.custom_settings as Record<string, any>) || {};
        const currentAcademic = (currentCustom.academic as Record<string, any>) || {};
        const groupPrimary = group?.levels && group.levels.length > 0 ? organizationService.canonicalizeLevel(group.levels[0]) : null;
        if (groupPrimary && !currentAcademic.academic_level) {
          const updatedCustom = { ...currentCustom, academic: { ...currentAcademic, academic_level: groupPrimary } };
          await supabase.from('organization_settings').update({ custom_settings: updatedCustom }).eq('organization_id', organization.id);
        }
      } catch (err) {
        console.error('Failed to persist org academic level:', err);
      }

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

    // ── Check plan limit before bulk import ──
    const limitCheck = canCreate('members');
    if (!limitCheck.allowed) {
      setLimitMessage(limitCheck.message || `You've reached the member limit on the ${planName} plan.`);
      setShowLimitModal(true);
      return;
    }
    // Check if bulk import would exceed limits
    if (limitCheck.limit !== -1 && (limitCheck.current + membersToImport.length) > limitCheck.limit) {
      const remaining = limitCheck.limit - limitCheck.current;
      setLimitMessage(
        `You can only add ${remaining} more member${remaining !== 1 ? 's' : ''} on the ${planName} plan (${limitCheck.current}/${limitCheck.limit} used). You're trying to import ${membersToImport.length}. Please upgrade your plan or reduce the import size.`
      );
      setShowLimitModal(true);
      return;
    }

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

        // Enforce group's single primary level for bulk-import rows
        const groupPrimary = group?.levels && group.levels.length > 0 ? organizationService.canonicalizeLevel(group.levels[0]) : null;
        const providedLevel = (m as any).level ? organizationService.canonicalizeLevel((m as any).level) : null;
        if (providedLevel && groupPrimary && providedLevel !== groupPrimary) {
          errors.push(`Row ${i + 1} (${m.member_id}): level "${(m as any).level}" does not match department level ${groupPrimary}`);
          continue;
        }

        const { error } = await supabase
          .from('organization_members')
          .insert({
            organization_id: organization.id,
            group_id: group.id,
            member_id: m.member_id,
            full_name: m.full_name,
            email: m.email || null,
            phone: m.phone || null,
            level: groupPrimary,
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
    if (added > 0) {
      // Ensure org-level is populated from group primary level when importing
      try {
        const currentCustom = (settings?.custom_settings as Record<string, any>) || {};
        const currentAcademic = (currentCustom.academic as Record<string, any>) || {};
        const groupPrimary = group?.levels && group.levels.length > 0 ? organizationService.canonicalizeLevel(group.levels[0]) : null;
        if (groupPrimary && !currentAcademic.academic_level) {
          const updatedCustom = { ...currentCustom, academic: { ...currentAcademic, academic_level: groupPrimary } };
          await supabase.from('organization_settings').update({ custom_settings: updatedCustom }).eq('organization_id', organization.id);
        }
      } catch (err) {
        console.error('Failed to persist org academic level after bulk import:', err);
      }

      fetchMembers();
    }
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

    // ── Check plan limit before generating invite ──
    const limitCheck = canCreate('members');
    if (!limitCheck.allowed) {
      setLimitMessage(limitCheck.message || `You've reached the member limit on the ${planName} plan.`);
      setShowLimitModal(true);
      return;
    }

    setInviteLoading(true);
    try {
      const createdBy = adminRecord.id || user.id;
      if (!createdBy) {
        throw new Error('Missing invite creator');
      }

      const expiryMap: Record<string, number | null> = {
        '1d': 1, '7d': 7, '30d': 30, 'never': null,
      };
      const days = expiryMap[inviteExpiry];
      const expires_at = days
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      const invite = await organizationService.createInvite({
        organization_id: organization.id,
        group_id: group?.id || undefined,
        invite_type: 'bulk',
        max_uses: inviteMaxUses,
        expires_at,
        created_by: createdBy,
      });

      if (!invite || !invite.invite_code) throw new Error('Invite creation failed');

      const code = invite.invite_code;
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

  // ── Toggle active (confirm first) ──
  const toggleActive = (member: Member) => {
    setConfirmAction({ isOpen: true, type: 'deactivate', member });
  };

  const executeToggleActive = async (member: Member) => {
    try {
      const scope = getOrgScope();
      let q = supabase
        .from('organization_members')
        .update({ is_active: !member.is_active, updated_at: new Date().toISOString() })
        .eq('id', member.id);
      if (scope) {
        q = q.eq('organization_id', scope.orgId);
        q = q.eq('group_id', scope.groupId);
      }
      await q;
      fetchMembers();
    } catch (err) {
      console.error('Toggle error:', err);
    }
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
      if (scope) {
        q = q.eq('organization_id', scope.orgId);
        q = q.eq('group_id', scope.groupId);
      }
      await q;
      setAddSuccess({ name: member.full_name, id: member.member_id, password: pwd });
    } catch (err) {
      console.error('Reset password error:', err);
    }
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
          level: editingMember.level,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingMember.id);
      if (scope) {
        q = q.eq('organization_id', scope.orgId);
        q = q.eq('group_id', scope.groupId);
      }
      await q;
      setShowEditModal(false);
      setEditingMember(null);
      fetchMembers();
    } catch (err) {
      console.error('Edit error:', err);
    }
  };

  // ── Delete member (confirm first) ──
  const deleteMember = (member: Member) => {
    setConfirmAction({ isOpen: true, type: 'delete', member });
  };

  const executeDeleteMember = async (member: Member) => {
    try {
      const scope = getOrgScope();
      let q = supabase.from('organization_members').delete().eq('id', member.id);
      if (scope) {
        q = q.eq('organization_id', scope.orgId);
        q = q.eq('group_id', scope.groupId);
      }
      await q;
      fetchMembers();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // ── Handle confirm action ──
  const handleConfirmAction = async () => {
    if (!confirmAction.member) return;
    const { type, member } = confirmAction;
    setConfirmAction({ isOpen: false, type: null, member: null });
    if (type === 'delete') {
      await executeDeleteMember(member);
    } else if (type === 'deactivate') {
      await executeToggleActive(member);
    }
  };

  // ── Copy credentials ──
  const copyCredentials = (id: string, password: string) => {
    navigator.clipboard.writeText(`ID: ${id}\nPassword: ${password}`);
  };

  // ── Selection helpers ──
  const toggleSelectMember = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(m => m.id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const isAllSelected = filtered.length > 0 && selectedIds.size === filtered.length;
  const isPartialSelected = selectedIds.size > 0 && selectedIds.size < filtered.length;

  // Helper to check role
  const getMemberRoles = (member: Member) => {
    const roles = member.admin_records || [];
    return {
      isAdmin: roles.some(r => ['admin', 'org_admin', 'org_owner', 'super_admin'].includes(r.role)),
      isFinsec: roles.some(r => r.role === 'treasurer'),
      isClassRep: roles.some(r => r.role === 'group_admin'),
    };
  };

  // ── Role management ──
  const toggleRole = async (member: Member, role: 'admin' | 'finsec' | 'class_rep') => {
    if (!organization) return;
    setRoleLoading(true);
    try {
      const roleMap = { admin: 'org_admin', finsec: 'treasurer', class_rep: 'group_admin' };
      const checkRoles = role === 'admin' ? ['admin', 'org_admin'] : [roleMap[role]];
      const dbRole = roleMap[role];
      const orgId = organization.id;
      const scope = getOrgScope();
      const groupId = group?.id || scope?.groupId || null;

      const { data: existing } = await supabase
        .from('member_admins')
        .select('id')
        .eq('member_id', member.id)
        .in('role', checkRoles)
        .eq('organization_id', orgId)
        .eq('group_id', groupId || '');

      if (existing && existing.length > 0) {
        // Remove role
        await supabase.from('member_admins').delete().eq('id', existing[0].id);
        
        await supabase.from('notifications').insert({
          member_id: member.id,
          organization_id: orgId,
          group_id: groupId,
          type: 'role_removed',
          title: `${role === 'admin' ? 'Admin' : role === 'finsec' ? 'FinSec' : 'Class Rep'} Role Removed`,
          message: `Your ${role === 'admin' ? 'Admin' : role === 'finsec' ? 'Financial Secretary' : 'Class Rep'} role has been removed.`,
          link: '/profile',
        });
      } else {
        // Check billing limit before granting role
        const adminCheck = canCreate('admins');
        if (!adminCheck.allowed) {
          setLimitMessage(adminCheck.message || `You've reached the admin limit on the ${planName} plan. Upgrade to add more.`);
          setShowLimitModal(true);
          setRoleLoading(false);
          return;
        }

        // Grant role
        const permissions = {
          admin: { can_create_payments: true, can_approve_payments: true, can_manage_members: true, can_view_analytics: true },
          finsec: { can_create_payments: true, can_approve_payments: true, can_manage_members: false, can_view_analytics: true },
          class_rep: { can_create_payments: true, can_approve_payments: true, can_manage_members: true, can_view_analytics: true },
        };

        await supabase.from('member_admins').insert({
          member_id: member.id,
          organization_id: orgId,
          group_id: groupId,
          role: dbRole,
          ...permissions[role],
        });

        await supabase.from('notifications').insert({
          member_id: member.id,
          organization_id: orgId,
          group_id: groupId,
          type: 'role_assigned',
          title: `${role === 'admin' ? 'Admin' : role === 'finsec' ? 'FinSec' : 'Class Rep'} Role Granted`,
          message: `You have been granted ${role === 'admin' ? 'Admin' : role === 'finsec' ? 'Financial Secretary' : 'Class Rep'} privileges.`,
          link: '/admin/dashboard',
        });
      }

      // ── Optimistic local state update ──
      // Update members state immediately so filter counts refresh instantly,
      // avoiding race conditions with Supabase join read-after-write timing.
      setMembers(prev => prev.map(m => {
        if (m.id !== member.id) return m;
        const currentRoles = m.admin_records || [];
        if (existing && existing.length > 0) {
          // Role was removed — filter out matching roles
          return { ...m, admin_records: currentRoles.filter(r => !checkRoles.includes(r.role)) };
        } else {
          // Role was added
          return { ...m, admin_records: [...currentRoles, { role: dbRole }] };
        }
      }));

      // Also refetch from DB for full consistency (runs in background)
      fetchMembers();
      await refreshLimits();
    } catch (err) {
      console.error('Role toggle error:', err);
    } finally {
      setRoleLoading(false);
    }
  };

  // ── Export CSV ──
  const handleExportCSV = () => {
    setExporting(true);
    try {
      const raw = selectedIds.size > 0 ? filtered.filter(m => selectedIds.has(m.id)) : filtered;
      // Sort alphabetically by name for clean output
      const dataToExport = [...raw].sort((a, b) =>
        (a.full_name || '').localeCompare(b.full_name || '', undefined, { sensitivity: 'base' })
      );
      
      const escapeCSV = (field: string | number | boolean | null | undefined): string => {
        if (field === null || field === undefined) return '';
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) return `"${str.replace(/"/g, '""')}"`;
        return str;
      };

      const lines: string[] = [];
      lines.push(`${APP_NAME.toUpperCase()} - ${memberLabelPlural.toUpperCase()} DIRECTORY`);
      lines.push(`Organization,${organization?.name || ''}`);
      lines.push(`Generated,${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })}`);
      lines.push(`Total ${memberLabelPlural},${dataToExport.length}`);
      lines.push('');
      
      const headerCols: string[] = ['S/N'];
      if (exportFields.name) headerCols.push('Full Name');
      if (exportFields.regNumber) headerCols.push(`${memberLabel} ID`);
      if (exportFields.level) headerCols.push('Level');
      if (exportFields.department) headerCols.push('Department');
      if (exportFields.email) headerCols.push('Email');
      if (exportFields.phone) headerCols.push('Phone');
      if (exportFields.status) headerCols.push('Status');
      if (exportFields.roles) headerCols.push('Roles');
      if (exportFields.joinDate) headerCols.push('Joined');
      lines.push(headerCols.join(','));
      
      dataToExport.forEach((m, index) => {
        const { isAdmin, isFinsec, isClassRep } = getMemberRoles(m);
        const roles = [isAdmin ? 'Admin' : '', isFinsec ? 'FinSec' : '', isClassRep ? 'Class Rep' : ''].filter(Boolean).join(' | ') || memberLabel;
        
        const rowCols: string[] = [escapeCSV(index + 1)];
        if (exportFields.name) rowCols.push(escapeCSV(m.full_name));
        if (exportFields.regNumber) rowCols.push(escapeCSV(m.member_id));
        if (exportFields.level) rowCols.push(escapeCSV(m.level || orgLevel || 'N/A'));
        if (exportFields.department) rowCols.push(escapeCSV(m.section || orgDepartment || 'N/A'));
        if (exportFields.email) rowCols.push(escapeCSV(m.email || 'N/A'));
        if (exportFields.phone) rowCols.push(escapeCSV(m.phone || 'N/A'));
        if (exportFields.status) rowCols.push(escapeCSV(m.is_active ? 'Active' : 'Inactive'));
        if (exportFields.roles) rowCols.push(escapeCSV(roles));
        if (exportFields.joinDate) rowCols.push(escapeCSV(new Date(m.created_at).toLocaleDateString()));
        lines.push(rowCols.join(','));
      });

      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${organization?.slug || 'members'}_directory_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('CSV export error:', err);
    } finally {
      setExporting(false);
      setShowExportModal(false);
    }
  };

  // ── Export PDF ──
  const handleExportPDF = () => {
    setExporting(true);
    try {
      const dataToExport = selectedIds.size > 0 ? filtered.filter(m => selectedIds.has(m.id)) : filtered;
      // Map to the format expected by exportStudentsToPDF
      const mapped = dataToExport.map(m => {
        const { isAdmin, isFinsec, isClassRep } = getMemberRoles(m);
        return {
          id: m.id,
          full_name: m.full_name,
          reg_number: m.member_id,
          email: m.email || undefined,
          phone: m.phone || undefined,
          level: m.level || orgLevel || undefined,
          department: m.section || orgDepartment || undefined,
          is_active: m.is_active,
          is_admin: isAdmin,
          is_finsec: isFinsec,
          is_class_rep: isClassRep,
          created_at: m.created_at,
        };
      });
      exportStudentsToPDF(mapped, {
        status: statusFilter !== 'all' ? statusFilter : undefined,
        fields: exportFields,
      });
    } catch (err) {
      console.error('PDF export error:', err);
    } finally {
      setExporting(false);
      setShowExportModal(false);
    }
  };

  return (
    <div className="min-h-screen py-4 sm:py-6 pb-24 lg:pb-6 relative overflow-x-hidden" style={pageSurface}>
      {/* Background Grid Pattern */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(${theme === 'light' ? 'rgba(255, 104, 3, 0.12)' : 'rgba(255, 104, 3, 0.24)'} 1px, transparent 1px),
            linear-gradient(90deg, ${theme === 'light' ? 'rgba(255, 104, 3, 0.12)' : 'rgba(255, 104, 3, 0.24)'} 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Animated Gradient Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-30 animate-pulse"
          style={{
            background: `radial-gradient(circle, ${tk.primary} 0%, transparent 70%)`,
            top: '-10%',
            right: '-5%',
            animationDuration: '4s',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
          style={{
            background: `radial-gradient(circle, ${tk.mint} 0%, transparent 70%)`,
            bottom: '-5%',
            left: '-5%',
            animation: 'pulse 6s ease-in-out infinite',
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 sm:mb-6"
        >
          <GlassCard className="relative overflow-hidden">
            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-64 h-64 opacity-5 pointer-events-none">
              <Users className="w-full h-full" style={{ color: tk.primary }} />
            </div>
            <div
              className="absolute top-0 left-0 w-full h-1"
              style={{ background: tk.gradOrange }}
            />

            <div className="relative z-10">
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 mb-2">
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${tk.primary}30, ${tk.primary}10)`,
                    border: `1px solid ${tk.primaryRing}`,
                    boxShadow: `0 4px 15px ${tk.primary}20`
                  }}
                >
                  <Users className="w-7 h-7" style={{ color: tk.primary }} />
                </motion.div>
                <div className="text-center sm:text-left">
                  {/* Badge */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-2"
                    style={{
                      background: theme === 'light' ? tk.primarySoft : `linear-gradient(135deg, ${tk.primary}30, ${tk.primary}10)`,
                      border: `1px solid ${tk.primaryRing}`,
                      color: tk.primary,
                    }}
                  >
                    <Sparkles className="w-3 h-3" />
                    {memberLabelPlural.toUpperCase()} MANAGEMENT
                  </motion.div>
                  <h1 className="text-2xl sm:text-3xl font-bold" style={{ color: tk.text }}>Manage {memberLabelPlural}</h1>
                  <p className="flex items-center justify-center sm:justify-start gap-2" style={{ color: tk.textSec }}>
                    <Filter className="w-4 h-4" />
                    {organization?.name} &bull; {group?.name || 'All Groups'}
                  </p>
                </div>

                {/* Add Member Button - Right Side */}
                <div className="relative sm:ml-auto mt-3 sm:mt-0">
                  <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowAddMenu(!showAddMenu)}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl font-semibold transition-all"
                    style={{
                      background: tk.gradOrange,
                      color: '#FFFFFF',
                      boxShadow: `0 4px 20px ${tk.primary}40`
                    }}
                  >
                    <Plus className="w-5 h-5" />
                    <span>Add {memberLabelPlural}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showAddMenu ? 'rotate-180' : ''}`} />
                  </motion.button>

                  <AnimatePresence>
                    {showAddMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-64 rounded-xl overflow-hidden shadow-2xl z-50"
                        style={{
                          ...subtleSurface,
                          backdropFilter: 'blur(20px)',
                          boxShadow: '0 16px 48px rgba(15, 7, 3, 0.18)',
                        }}
                      >
                        <div className="p-2">
                          <motion.button
                            whileHover={{ x: 4 }}
                            onClick={() => { setShowAddMenu(false); setShowAddModal(true); setAddError(''); setAddSuccess(null); }}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all hover:bg-white/5"
                          >
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: tk.primarySoft }}>
                              <UserPlus className="w-4 h-4" style={{ color: tk.primary }} />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-medium" style={{ color: tk.text }}>Single {memberLabel}</p>
                              <p className="text-[10px]" style={{ color: tk.textSec }}>Add one {memberLabel.toLowerCase()} manually</p>
                            </div>
                          </motion.button>
                          <motion.button
                            whileHover={{ x: 4 }}
                            onClick={() => { setShowAddMenu(false); setShowBulkModal(true); }}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all hover:bg-white/5"
                          >
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${tk.mint}20` }}>
                              <Upload className="w-4 h-4" style={{ color: tk.mint }} />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-medium" style={{ color: tk.text }}>Bulk Import</p>
                              <p className="text-[10px]" style={{ color: tk.textSec }}>Upload CSV / Excel file</p>
                            </div>
                          </motion.button>
                          <motion.button
                            whileHover={{ x: 4 }}
                            onClick={() => { setShowAddMenu(false); setShowInviteModal(true); setInviteLink(''); setInviteCode(''); setInviteCopied(false); }}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all hover:bg-white/5"
                          >
                            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${tk.mint}20` }}>
                              <Link2 className="w-4 h-4" style={{ color: tk.mint }} />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-medium" style={{ color: tk.text }}>Invite Link</p>
                              <p className="text-[10px]" style={{ color: tk.textSec }}>Share a join link</p>
                            </div>
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  {showAddMenu && <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />}
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
                <div className="p-3 rounded-xl text-center" style={cardSurface}>
                  <p className="text-2xl font-bold" style={{ color: tk.text }}><AnimatedCounter value={members.length} /></p>
                  <p className="text-xs" style={{ color: tk.textSec }}>Total</p>
                </div>
                <div className="p-3 rounded-xl text-center" style={{ background: `${tk.mint}10`, border: `1px solid ${tk.mint}20` }}>
                  <p className="text-2xl font-bold" style={{ color: tk.mint }}><AnimatedCounter value={activeCount} /></p>
                  <p className="text-xs" style={{ color: tk.textSec }}>Active</p>
                </div>
                <div className="p-3 rounded-xl text-center" style={{ background: tk.primarySoft, border: `1px solid ${tk.primaryRing}` }}>
                  <p className="text-2xl font-bold" style={{ color: tk.primary }}><AnimatedCounter value={adminCount} /></p>
                  <p className="text-xs" style={{ color: tk.textSec }}>Admins</p>
                </div>
                <div className="p-3 rounded-xl text-center" style={{ background: `${tk.mint}10`, border: `1px solid ${tk.mint}20` }}>
                  <p className="text-2xl font-bold" style={{ color: tk.mint }}><AnimatedCounter value={finsecCount} /></p>
                  <p className="text-xs" style={{ color: tk.textSec }}>FinSecs</p>
                </div>
                <div className="p-3 rounded-xl text-center" style={{ background: `${tk.amber}10`, border: `1px solid ${tk.amber}20` }}>
                  <p className="text-2xl font-bold" style={{ color: tk.amber }}><AnimatedCounter value={classRepCount} /></p>
                  <p className="text-xs" style={{ color: tk.textSec }}>Class Reps</p>
                </div>
              </div>

              {/* ── Plan Usage / Limit Banner ── */}
              {(() => {
                const memberLimit = canCreate('members');
                if (memberLimit.limit === -1) return null; // unlimited
                const usagePercent = memberLimit.limit > 0 ? Math.round((memberLimit.current / memberLimit.limit) * 100) : 0;
                const isNearLimit = usagePercent >= 80;
                const isAtLimit = !memberLimit.allowed;
                const barColor = isAtLimit ? colors.error : isNearLimit ? colors.warning : colors.accentMint;

                return (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-3 rounded-xl"
                    style={{
                      background: isAtLimit
                        ? `${colors.error}10`
                        : isNearLimit
                        ? `${colors.warning}08`
                        : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${isAtLimit ? colors.error : isNearLimit ? colors.warning : tk.cardBorder}30`,
                    }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" style={{ color: barColor }} />
                        <span className="text-xs font-medium" style={{ color: barColor }}>
                          {isAtLimit ? '⚠ Member Limit Reached' : isNearLimit ? '⚡ Approaching Limit' : 'Plan Usage'}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${barColor}20`, color: barColor }}>
                          {planName}
                        </span>
                      </div>
                      <span className="text-xs font-semibold" style={{ color: barColor }}>
                        {memberLimit.current} / {memberLimit.limit}
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(usagePercent, 100)}%` }}
                        transition={{ duration: 1, ease: 'easeOut' }}
                        className="h-full rounded-full"
                        style={{ background: `linear-gradient(90deg, ${barColor}80, ${barColor})` }}
                      />
                    </div>
                    {(isAtLimit || isNearLimit) && (
                      <div className="flex items-center justify-between mt-2">
                        <p className="text-[10px]" style={{ color: colors.textTertiary }}>
                          {isAtLimit
                            ? 'Upgrade your plan to add more members.'
                            : `${memberLimit.limit - memberLimit.current} slot${memberLimit.limit - memberLimit.current !== 1 ? 's' : ''} remaining.`}
                        </p>
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => navigateTo('/admin/billing')}
                          className="text-[10px] font-semibold px-3 py-1 rounded-full transition-colors"
                          style={{
                            background: `${barColor}20`,
                            color: barColor,
                            border: `1px solid ${barColor}30`,
                          }}
                        >
                          Upgrade Plan →
                        </motion.button>
                      </div>
                    )}
                  </motion.div>
                );
              })()}
            </div>
          </GlassCard>
        </motion.div>

        {/* Search & Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <GlassCard className="mb-4 sm:mb-6">
            <div className="relative mb-4">
              <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5" style={{ color: tk.textSec }} />
              <input
                type="text"
                placeholder={`Search by name, ID, email...`}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 rounded-lg text-sm sm:text-base focus:outline-none"
                style={{
                  background: theme === 'light' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.04)',
                  border: `1px solid ${tk.cardBorder}`,
                  color: tk.text,
                }}
              />
            </div>

            {/* Quick Filters */}
            <div className="space-y-3">
              {/* Status Filter */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: tk.textSec }}>Status</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'all' as const, label: 'All', count: members.length },
                    { value: 'active' as const, label: 'Active', count: activeCount },
                    { value: 'inactive' as const, label: 'Inactive', count: inactiveCount },
                  ].map(({ value, label, count }) => (
                    <button
                      key={value}
                      onClick={() => {
                        setStatusFilter(value);
                        setCurrentPage(1);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all"
                      style={{
                        background: statusFilter === value ? tk.primarySoft : theme === 'light' ? '#FFF6EE' : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${statusFilter === value ? tk.primaryRing : 'transparent'}`,
                        color: statusFilter === value ? tk.primary : tk.textSec,
                      }}
                    >
                      {label} ({count})
                    </button>
                  ))}
                </div>
              </div>

              {/* Role Filter */}
              <div>
                <p className="text-xs font-medium mb-2" style={{ color: tk.textSec }}>Role</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'all' as const, label: 'All Roles', count: members.length },
                    { value: 'admin' as const, label: 'Admins', count: adminCount },
                    { value: 'finsec' as const, label: 'FinSecs', count: finsecCount },
                    { value: 'class_rep' as const, label: 'Class Reps', count: classRepCount },
                    { value: 'member' as const, label: `${memberLabelPlural} Only`, count: memberOnlyCount },
                  ].map(({ value, label, count }) => (
                    <button
                      key={value}
                      onClick={() => {
                        setRoleFilter(value);
                        setCurrentPage(1);
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all"
                      style={{
                        background: roleFilter === value ? `${tk.mint}20` : theme === 'light' ? '#FFF6EE' : 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${roleFilter === value ? tk.mint + '60' : 'transparent'}`,
                        color: roleFilter === value ? tk.mint : tk.textSec,
                      }}
                    >
                      {label} ({count})
                    </button>
                  ))}
                </div>
              </div>

              {/* Clear Filters */}
              {(statusFilter !== 'all' || roleFilter !== 'all' || searchQuery !== '') && (
                <button
                  onClick={() => {
                    setStatusFilter('all');
                    setRoleFilter('all');
                    setSearchQuery('');
                    setCurrentPage(1);
                  }}
                  className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
                  style={{
                    background: tk.primarySoft,
                    border: `1px solid ${tk.primaryRing}`,
                    color: tk.primary,
                  }}
                >
                  <X className="w-4 h-4" />
                  Clear All Filters
                </button>
              )}
            </div>
          </GlassCard>
        </motion.div>

        {/* Selection Toolbar */}
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl mb-4"
              style={{ background: `${colors.primary}08`, border: `1px solid ${colors.borderPrimary}` }}
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <CheckSquare size={16} style={{ color: colors.primary }} />
                  <span className="text-sm font-semibold" style={{ color: colors.primary }}>
                    {selectedIds.size} selected
                  </span>
                </div>
                <button
                  onClick={clearSelection}
                  className="text-xs px-2.5 py-1 rounded-lg hover:bg-white/5 transition-colors"
                  style={{ color: colors.textTertiary }}
                >
                  Clear
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowExportModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                  style={{ background: `${colors.primary}15`, color: colors.primary }}
                >
                  <Download size={13} /> Export Selected
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Members List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <GlassCard>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-xl font-bold text-white">
                {sortedFiltered.length} {sortedFiltered.length !== 1 ? memberLabelPlural : memberLabel}
              </h2>

              {/* Export Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowExportModal(true)}
                disabled={exporting || sortedFiltered.length === 0}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: `linear-gradient(135deg, ${colors.primary}20, ${colors.primary}10)`,
                  border: `1px solid ${colors.primary}40`,
                  color: colors.primary,
                }}
              >
                {exporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Exporting...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Export</span>
                  </>
                )}
              </motion.button>
            </div>

            {loading ? (
              <div className="text-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <div className="animate-spin rounded-full h-10 w-10 border-3 border-t-transparent"
                    style={{ borderColor: colors.primary, borderTopColor: 'transparent' }}
                  />
                  <p className="text-sm" style={{ color: colors.textSecondary }}>Loading {memberLabelPlural.toLowerCase()}...</p>
                </div>
              </div>
            ) : sortedFiltered.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-16 h-16 mx-auto mb-4" style={{ color: colors.textSecondary }} />
                <p className="text-lg font-medium text-white mb-2">No {memberLabelPlural.toLowerCase()} found</p>
                <p style={{ color: colors.textSecondary }}>
                  {searchQuery ? 'Try a different search term' : `Add your first ${memberLabel.toLowerCase()} to get started`}
                </p>
                {!searchQuery && (
                  <button
                    onClick={() => { setShowAddModal(true); setAddError(''); setAddSuccess(null); }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium mt-4"
                    style={{ color: colors.primary, border: `1px solid ${colors.borderPrimary}` }}
                  >
                    <UserPlus size={16} />
                    Add {memberLabel}
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden lg:block overflow-x-auto">
                  <table className="min-w-full divide-y" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                    <thead>
                      <tr className="border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                        <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap w-8" style={{ color: colors.textSecondary }}>
                          <button onClick={toggleSelectAll} className="p-0.5 rounded hover:bg-white/5 transition-colors" title={isAllSelected ? 'Deselect all' : 'Select all'}>
                            {isAllSelected ? <CheckSquare size={16} style={{ color: colors.primary }} /> : isPartialSelected ? <MinusSquare size={16} style={{ color: colors.primary }} /> : <Square size={16} />}
                          </button>
                        </th>
                        <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>{memberLabel}</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>Level</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>Contact</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>Roles</th>
                        <th className="text-left py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>Status</th>
                        <th className="text-right py-3 px-4 text-sm font-semibold whitespace-nowrap" style={{ color: colors.textSecondary }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}>
                      {paginated.map((member, index) => {
                        const { isAdmin, isFinsec, isClassRep } = getMemberRoles(member);
                        return (
                          <motion.tr
                            key={member.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: Math.min(index * 0.02, 0.3) }}
                            className={`border-b hover:bg-white/5 transition-colors ${selectedIds.has(member.id) ? 'bg-white/4' : ''}`}
                            style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}
                          >
                            <td className="py-4 px-4">
                              <button
                                onClick={() => toggleSelectMember(member.id)}
                                className="p-0.5 rounded hover:bg-white/5 transition-colors"
                              >
                                {selectedIds.has(member.id)
                                  ? <CheckSquare size={16} style={{ color: colors.primary }} />
                                  : <Square size={16} style={{ color: colors.textDisabled }} />}
                              </button>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                                  style={{ background: gradients.primary }}
                                >
                                  {member.full_name?.charAt(0)?.toUpperCase() || '?'}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-white truncate">{member.full_name}</p>
                                  <p className="text-sm truncate" style={{ color: colors.textSecondary }}>{member.member_id}</p>
                                </div>
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              {(member.level || orgLevel) ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold" style={{ background: `${colors.accentMint}15`, color: colors.accentMint, border: `1px solid ${colors.accentMint}25` }}>
                                    {member.level || orgLevel}
                                  </span>
                                ) : (
                                  <span className="text-xs italic" style={{ color: colors.textDisabled }}>—</span>
                                )}
                            </td>
                            <td className="py-4 px-4">
                              {member.email ? (
                                <p className="text-sm text-white truncate">{member.email}</p>
                              ) : (
                                <p className="text-sm italic" style={{ color: colors.textDisabled }}>No email</p>
                              )}
                              {member.phone && <p className="text-sm" style={{ color: colors.textSecondary }}>{member.phone}</p>}
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex flex-wrap gap-1">
                                {isAdmin && (
                                  <span className="px-2 py-1 rounded text-xs font-medium whitespace-nowrap" style={{ background: `${colors.primary}20`, color: colors.primary }}>
                                    <Crown className="w-3 h-3 inline mr-1" />
                                    Admin
                                  </span>
                                )}
                                {isFinsec && (
                                  <span className="px-2 py-1 rounded text-xs font-medium whitespace-nowrap" style={{ background: `${colors.accentMint}20`, color: colors.accentMint }}>
                                    <Shield className="w-3 h-3 inline mr-1" />
                                    FinSec
                                  </span>
                                )}
                                {isClassRep && (
                                  <span className="px-2 py-1 rounded text-xs font-medium whitespace-nowrap" style={{ background: `${colors.warning}20`, color: colors.warning }}>
                                    <Users className="w-3 h-3 inline mr-1" />
                                    Class Rep
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-4 px-4">
                              <button
                                onClick={() => toggleActive(member)}
                                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap"
                                style={{
                                  background: member.is_active ? `${colors.statusPaid}20` : `${colors.statusUnpaid}20`,
                                  color: member.is_active ? colors.statusPaid : colors.statusUnpaid
                                }}
                              >
                                {member.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                                <span className="hidden sm:inline">{member.is_active ? 'Active' : 'Inactive'}</span>
                              </button>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center justify-end gap-1 sm:gap-2">
                                <button
                                  onClick={() => { setRoleTarget(member); setShowRoleModal(true); }}
                                  className="p-2 rounded-lg transition-colors"
                                  style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                                  title="Manage Roles"
                                >
                                  <UserCog className="w-4 h-4" style={{ color: colors.accentPurple }} />
                                </button>
                                <button
                                  onClick={() => { setEditingMember({ ...member }); setShowEditModal(true); }}
                                  className="p-2 rounded-lg transition-colors hover:bg-white/10"
                                  style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                                  title="Edit"
                                >
                                  <Edit2 className="w-4 h-4" style={{ color: colors.textSecondary }} />
                                </button>
                                <button
                                  onClick={() => resetPassword(member)}
                                  className="p-2 rounded-lg transition-colors hover:bg-amber-500/20"
                                  style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                                  title="Reset Password"
                                >
                                  <Key className="w-4 h-4" style={{ color: colors.warning }} />
                                </button>
                                <button
                                  onClick={() => deleteMember(member)}
                                  className="p-2 rounded-lg transition-colors hover:bg-red-500/20"
                                  style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                                  title="Remove"
                                >
                                  <Trash2 className="w-4 h-4 text-red-400" />
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="lg:hidden space-y-4">
                  {paginated.map((member, index) => {
                    const { isAdmin, isFinsec, isClassRep } = getMemberRoles(member);
                    const hasRoles = isAdmin || isFinsec || isClassRep;

                    return (
                      <motion.div
                        key={member.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(index * 0.02, 0.3) }}
                        className="rounded-xl overflow-hidden"
                        style={{
                          background: theme === 'light' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.05)',
                          border: `1px solid ${tk.cardBorder}`,
                        }}
                      >
                        <div
                          className="p-4 flex items-center gap-4"
                          style={{
                            background: isAdmin
                              ? `linear-gradient(135deg, ${tk.primarySoft}, transparent)`
                              : isFinsec
                                ? `linear-gradient(135deg, ${tk.mint}18, transparent)`
                                : isClassRep
                                  ? `linear-gradient(135deg, ${tk.amber}18, transparent)`
                                  : 'transparent'
                          }}
                        >
                          <div
                            className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                            style={{
                              background: isAdmin
                                ? tk.gradOrange
                                : isFinsec
                                  ? `linear-gradient(135deg, ${tk.mint}, ${tk.blue})`
                                  : isClassRep
                                    ? `linear-gradient(135deg, ${tk.amber}, ${tk.primary})`
                                    : tk.gradOrange,
                              color: '#FFFFFF'
                            }}
                          >
                            {member.full_name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-base truncate" style={{ color: tk.text }}>{member.full_name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-sm truncate" style={{ color: tk.textSec }}>{member.member_id}</p>
                              {(member.level || orgLevel) && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0" style={{ background: tk.primarySoft, color: tk.primary }}>
                                  {member.level || orgLevel}
                                </span>
                              )}
                            </div>
                            {member.email && <p className="text-xs truncate" style={{ color: tk.textSec }}>{member.email}</p>}
                          </div>
                          <div
                            className="px-2 py-1 rounded-full text-[10px] font-medium shrink-0"
                            style={{
                              background: member.is_active ? `${tk.mint}20` : `${tk.amber}20`,
                              color: member.is_active ? tk.mint : tk.amber,
                              border: `1px solid ${member.is_active ? `${tk.mint}40` : `${tk.amber}40`}`
                            }}
                          >
                            {member.is_active ? '● Active' : '○ Inactive'}
                          </div>
                        </div>

                        <div className="px-4 pb-3">
                          <div className="flex flex-wrap gap-2">
                            {isAdmin && (
                              <span className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5" style={{ background: tk.primarySoft, color: tk.primary, border: `1px solid ${tk.primaryRing}` }}>
                                <Crown className="w-3.5 h-3.5" />
                                Admin
                              </span>
                            )}
                            {isFinsec && (
                              <span className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5" style={{ background: `${tk.mint}18`, color: tk.mint, border: `1px solid ${tk.mint}30` }}>
                                <Shield className="w-3.5 h-3.5" />
                                Financial Sec
                              </span>
                            )}
                            {isClassRep && (
                              <span className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5" style={{ background: `${tk.amber}18`, color: tk.amber, border: `1px solid ${tk.amber}30` }}>
                                <Users className="w-3.5 h-3.5" />
                                Class Rep
                              </span>
                            )}
                            {!hasRoles && (
                              <span className="px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5" style={{ background: theme === 'light' ? '#FFF6EE' : 'rgba(255, 255, 255, 0.05)', color: tk.textSec, border: `1px solid ${tk.cardBorder}` }}>
                                <User className="w-3.5 h-3.5" />
                                {memberLabel}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="p-4 pt-2 space-y-3" style={{ borderTop: `1px solid ${tk.cardBorder}` }}>
                          <button
                            onClick={() => toggleActive(member)}
                            className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98]"
                            style={{
                              background: member.is_active ? `${tk.amber}15` : `${tk.mint}15`,
                              color: member.is_active ? tk.amber : tk.mint,
                              border: `1px solid ${member.is_active ? `${tk.amber}30` : `${tk.mint}30`}`
                            }}
                          >
                            {member.is_active ? '⏸ Deactivate' : '▶ Activate'}
                          </button>

                          <button
                            onClick={() => { setRoleTarget(member); setShowRoleModal(true); }}
                            className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                            style={{
                              background: `${tk.primarySoft}`,
                              color: tk.primary,
                              border: `1px solid ${tk.primaryRing}`
                            }}
                          >
                            <UserCog className="w-4 h-4" />
                            Manage Roles
                          </button>

                          <div className="grid grid-cols-3 gap-2">
                            <button
                              onClick={() => { setEditingMember({ ...member }); setShowEditModal(true); }}
                              className="p-3 rounded-xl transition-all active:scale-[0.95] flex items-center justify-center gap-2"
                              style={{
                                background: theme === 'light' ? '#FFFDF9' : 'rgba(255, 255, 255, 0.05)',
                                border: `1px solid ${tk.cardBorder}`
                              }}
                            >
                              <Edit2 className="w-4 h-4" style={{ color: tk.textSec }} />
                              <span className="text-xs font-medium" style={{ color: tk.textSec }}>Edit</span>
                            </button>
                            <button
                              onClick={() => resetPassword(member)}
                              className="p-3 rounded-xl transition-all active:scale-[0.95] flex items-center justify-center gap-2"
                              style={{
                                background: `${tk.amber}10`,
                                border: `1px solid ${tk.amber}20`
                              }}
                            >
                              <Key className="w-4 h-4" style={{ color: tk.amber }} />
                              <span className="text-xs font-medium" style={{ color: tk.amber }}>Reset</span>
                            </button>
                            <button
                              onClick={() => deleteMember(member)}
                              className="p-3 rounded-xl transition-all active:scale-[0.95] flex items-center justify-center gap-2"
                              style={{
                                background: `${tk.danger}10`,
                                border: `1px solid ${tk.danger}20`
                              }}
                            >
                              <Trash2 className="w-4 h-4" style={{ color: tk.danger }} />
                              <span className="text-xs font-medium" style={{ color: tk.danger }}>Delete</span>
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-6 pt-4" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  Showing {(currentPage - 1) * perPage + 1} - {Math.min(currentPage * perPage, sortedFiltered.length)} of {sortedFiltered.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg transition-colors disabled:opacity-30"
                    style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                  >
                    <ChevronLeft className="w-5 h-5 text-white" />
                  </button>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className="w-10 h-10 rounded-lg text-sm font-medium transition-all"
                        style={{
                          background: currentPage === pageNum ? colors.primary : 'rgba(255, 255, 255, 0.05)',
                          color: currentPage === pageNum ? 'white' : colors.textSecondary,
                        }}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg transition-colors disabled:opacity-30"
                    style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                  >
                    <ChevronRight className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>
            )}
          </GlassCard>
        </motion.div>

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
              className="relative w-full max-w-lg rounded-3xl p-5 sm:p-8 z-10 overflow-hidden backdrop-blur-xl"
              style={{
                background: theme === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(15, 7, 3, 0.6)',
                border: `1px solid ${tk.primaryRing}`,
                color: tk.text,
                boxShadow: `
                  0 0 0 1px ${theme === 'light' ? 'rgba(15, 7, 3, 0.06)' : 'rgba(255, 104, 3, 0.1)'},
                  0 20px 50px -12px ${theme === 'light' ? 'rgba(15, 7, 3, 0.15)' : 'rgba(0, 0, 0, 0.8)'},
                  inset 0 1px 0 0 ${theme === 'light' ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.05)'}
                `,
              }}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${tk.mint}15` }}>
                    <Link2 size={20} style={{ color: tk.mint }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold" style={{ color: tk.text }}>Invite Link</h3>
                    <p className="text-xs" style={{ color: tk.textSec }}>
                      Share this link with {memberLabelPlural.toLowerCase()} to join
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowInviteModal(false)} className="p-2 rounded-lg hover:bg-white/5 shrink-0"><X size={18} style={{ color: tk.textSec }} /></button>
              </div>

              {!inviteLink ? (
                <div className="space-y-4">
                  {/* Max Uses */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: tk.text }}>Max number of joins</label>
                    <div className="flex flex-wrap gap-2">
                      {[10, 25, 50, 100, 500].map(n => (
                        <button
                          key={n}
                          onClick={() => setInviteMaxUses(n)}
                          className="min-w-[4.5rem] flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: inviteMaxUses === n ? tk.primarySoft : theme === 'light' ? '#FFF6EE' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${inviteMaxUses === n ? tk.primaryRing : tk.cardBorder}`,
                            color: inviteMaxUses === n ? tk.primary : tk.textSec,
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Expiry */}
                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: tk.text }}>Expires in</label>
                    <div className="flex flex-wrap gap-2">
                      {([['1d', '1 day'], ['7d', '7 days'], ['30d', '30 days'], ['never', 'Never']] as const).map(([val, label]) => (
                        <button
                          key={val}
                          onClick={() => setInviteExpiry(val)}
                          className="min-w-[5.5rem] flex-1 py-2 rounded-lg text-xs font-medium transition-all"
                          style={{
                            background: inviteExpiry === val ? tk.primarySoft : theme === 'light' ? '#FFF6EE' : 'rgba(255,255,255,0.03)',
                            border: `1px solid ${inviteExpiry === val ? tk.primaryRing : tk.cardBorder}`,
                            color: inviteExpiry === val ? tk.primary : tk.textSec,
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {group && (
                    <div className="p-3 rounded-xl text-sm break-words" style={{ background: theme === 'light' ? '#FFFDF9' : 'rgba(255,255,255,0.03)', border: `1px solid ${tk.cardBorder}` }}>
                      <p className="text-xs" style={{ color: tk.textSec }}>
                        Members who join will be added to: <span style={{ color: tk.text, fontWeight: 500 }}>{group.name}</span>
                      </p>
                    </div>
                  )}

                  <button
                    onClick={generateInviteLink}
                    disabled={inviteLoading}
                    className="w-full px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                    style={{ background: tk.gradOrange, color: '#FFFFFF' }}
                  >
                    {inviteLoading ? <><Loader2 size={16} className="animate-spin" /> Generating...</> : <><Link2 size={16} /> Generate Link</>}
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Generated Link */}
                  <div className="p-3 rounded-xl" style={{ background: theme === 'light' ? '#FFFDF9' : 'rgba(255,255,255,0.03)', border: `1px solid ${tk.cardBorder}` }}>
                    <p className="text-xs font-medium mb-2" style={{ color: tk.textSec }}>Invite Link</p>
                    <p className="text-xs sm:text-sm break-all font-mono leading-relaxed" style={{ color: tk.text }}>{inviteLink}</p>
                  </div>

                  <div className="p-3 rounded-xl text-center" style={{ background: tk.primarySoft, border: `1px solid ${tk.primaryRing}` }}>
                    <p className="text-xs font-medium mb-1" style={{ color: tk.textSec }}>Invite Code</p>
                    <p className="text-xl sm:text-2xl font-bold tracking-[0.18em] sm:tracking-[0.3em] break-all" style={{ color: tk.text }}>{inviteCode}</p>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={copyInviteLink}
                      className="flex-1 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                      style={{
                        background: inviteCopied ? `${tk.mint}15` : tk.primarySoft,
                        color: inviteCopied ? tk.mint : tk.primary,
                        border: `1px solid ${inviteCopied ? tk.mint : tk.primary}30`,
                      }}
                    >
                      {inviteCopied ? <><Check size={16} /> Copied!</> : <><Copy size={16} /> Copy Link</>}
                    </button>
                    <button
                      onClick={shareInviteLink}
                      className="flex-1 px-4 py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                      style={{ background: tk.primarySoft, color: tk.primary, border: `1px solid ${tk.primaryRing}` }}
                    >
                      <Share2 size={16} /> Share
                    </button>
                  </div>

                  <button
                    onClick={() => { setInviteLink(''); setInviteCode(''); }}
                    className="w-full text-center text-xs py-2 hover:underline"
                    style={{ color: tk.textSec }}
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
              style={{ background: tk.card, borderColor: tk.cardBorder, boxShadow: '0 25px 60px rgba(0,0,0,0.18)', color: tk.text }}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold" style={{ color: tk.text }}>Add {memberLabel}</h3>
                <button onClick={() => setShowAddModal(false)} className="p-2 rounded-lg hover:bg-white/5">
                  <X size={18} style={{ color: tk.textSec }} />
                </button>
              </div>

              {/* Success State */}
              {addSuccess ? (
                <motion.div className="space-y-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="text-center py-4">
                    <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: `${tk.mint}15` }}>
                      <UserCheck size={28} style={{ color: tk.mint }} />
                    </div>
                    <h4 className="text-lg font-semibold" style={{ color: tk.text }}>{memberLabel} Added!</h4>
                    <p className="text-sm mt-1" style={{ color: tk.textSec }}>{addSuccess.name} can now log in</p>
                  </div>

                  <div className="p-4 rounded-xl space-y-3" style={{ background: theme === 'light' ? '#FFFDF9' : 'rgba(255,255,255,0.03)', border: `1px solid ${tk.cardBorder}` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs" style={{ color: tk.textSec }}>Login ID</p>
                        <p className="text-sm font-mono" style={{ color: tk.text }}>{addSuccess.id}</p>
                      </div>
                      <button onClick={() => copyCredentials(addSuccess.id, addSuccess.password)} className="p-2 rounded-lg hover:bg-white/5" title="Copy">
                        <Copy size={14} style={{ color: tk.primary }} />
                      </button>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: tk.textSec }}>Default Password</p>
                      <p className="text-sm font-mono" style={{ color: tk.text }}>{addSuccess.password}</p>
                    </div>
                    <p className="text-xs" style={{ color: tk.amber }}>
                      Share these credentials securely. They'll be asked to change their password on first login.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setAddSuccess(null)}
                      className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium"
                      style={{ background: tk.gradOrange, color: '#FFFFFF' }}
                    >
                      Add Another
                    </button>
                    <button
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2.5 rounded-xl text-sm font-medium"
                      style={{ color: tk.textSec, border: `1px solid ${tk.cardBorder}` }}
                    >
                      Done
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-4">
                  {addError && (
                    <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ background: `${tk.danger}10`, color: tk.danger, border: `1px solid ${tk.danger}25` }}>
                      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                      {addError}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: tk.text }}>{memberLabel} ID *</label>
                    <input
                      type="text"
                      placeholder={organization?.organization_type === 'university' ? 'e.g. CSC/2020/001' : 'e.g. MEM001'}
                      value={newMember.member_id}
                      onChange={e => setNewMember(prev => ({ ...prev, member_id: e.target.value }))}
                      className="w-full rounded-xl px-4 py-3 outline-none transition-colors text-sm"
                      style={{ background: theme === 'light' ? '#FFFDF9' : 'rgba(255,255,255,0.04)', border: `1px solid ${tk.cardBorder}`, color: tk.text }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: tk.text }}>Full Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. John Doe"
                      value={newMember.full_name}
                      onChange={e => setNewMember(prev => ({ ...prev, full_name: e.target.value }))}
                      className="w-full rounded-xl px-4 py-3 outline-none transition-colors text-sm"
                      style={{ background: theme === 'light' ? '#FFFDF9' : 'rgba(255,255,255,0.04)', border: `1px solid ${tk.cardBorder}`, color: tk.text }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: tk.text }}>Email</label>
                      <input
                        type="email"
                        placeholder="Optional"
                        value={newMember.email}
                        onChange={e => setNewMember(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full rounded-xl px-4 py-3 outline-none transition-colors text-sm"
                        style={{ background: theme === 'light' ? '#FFFDF9' : 'rgba(255,255,255,0.04)', border: `1px solid ${tk.cardBorder}`, color: tk.text }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1.5" style={{ color: tk.text }}>Phone</label>
                      <input
                        type="tel"
                        placeholder="Optional"
                        value={newMember.phone}
                        onChange={e => setNewMember(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full rounded-xl px-4 py-3 outline-none transition-colors text-sm"
                        style={{ background: theme === 'light' ? '#FFFDF9' : 'rgba(255,255,255,0.04)', border: `1px solid ${tk.cardBorder}`, color: tk.text }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: tk.text }}>Level / Year</label>
                    <input
                      type="text"
                      placeholder="e.g. 200L, Year 2, Grade 10"
                      value={newMember.level}
                      onChange={e => setNewMember(prev => ({ ...prev, level: e.target.value }))}
                      className="w-full rounded-xl px-4 py-3 outline-none transition-colors text-sm"
                      style={{ background: theme === 'light' ? '#FFFDF9' : 'rgba(255,255,255,0.04)', border: `1px solid ${tk.cardBorder}`, color: tk.text }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1.5" style={{ color: tk.text }}>Default Password</label>
                    <input
                      type="text"
                      value={newMember.password}
                      onChange={e => setNewMember(prev => ({ ...prev, password: e.target.value }))}
                      placeholder={newMember.member_id || 'Same as ID (auto)'}
                      className="w-full rounded-xl px-4 py-3 outline-none transition-colors text-sm font-mono"
                      style={{ background: theme === 'light' ? '#FFFDF9' : 'rgba(255,255,255,0.04)', border: `1px solid ${tk.cardBorder}`, color: tk.text }}
                    />
                    <p className="text-xs mt-1" style={{ color: tk.textSec }}>
                      Defaults to their ID/Reg Number. {memberLabel} will be forced to change on first login.
                    </p>
                  </div>

                  <button
                    onClick={handleAddMember}
                    disabled={addLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                    style={{ background: tk.gradOrange, color: '#FFFFFF' }}
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
              <div className="flex-1 overflow-y-auto modal-scrollbar px-6 py-4 space-y-4">
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
                        <div className="max-h-20 overflow-y-auto modal-scrollbar space-y-0.5">
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
                        <div className="max-h-32 overflow-y-auto modal-scrollbar space-y-1">
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

                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Level / Year</label>
                  <input
                    type="text"
                    placeholder="e.g. 200L, Year 2"
                    value={editingMember.level || ''}
                    onChange={e => setEditingMember(prev => prev ? { ...prev, level: e.target.value || null } : null)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-[#FF6803] transition-colors text-sm"
                  />
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
      {/* PASSWORD RESET SUCCESS CARD                             */}
      {/* ═══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {addSuccess && !showAddModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setAddSuccess(null)} />
            <motion.div
              className="relative w-full max-w-sm rounded-2xl p-6 border"
              style={{ background: colors.secondaryLight, borderColor: colors.borderLight, boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              {/* Success icon */}
              <div className="flex flex-col items-center text-center mb-5">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" style={{ background: `${colors.success}15` }}>
                  <CheckCircle size={28} style={{ color: colors.success }} />
                </div>
                <h3 className="text-lg font-bold text-white">Password Reset Successful</h3>
                <p className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                  {addSuccess.name}'s password has been reset
                </p>
              </div>

              {/* Credentials card */}
              <div className="rounded-xl p-4 mb-4 space-y-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: colors.textTertiary }}>Login ID</p>
                    <p className="text-sm font-mono font-semibold text-white mt-0.5">{addSuccess.id}</p>
                  </div>
                </div>
                <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-medium" style={{ color: colors.textTertiary }}>New Password</p>
                    <p className="text-sm font-mono font-semibold text-white mt-0.5">{addSuccess.password}</p>
                  </div>
                  <button
                    onClick={() => copyCredentials(addSuccess.id, addSuccess.password)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                    style={{ background: `${colors.primary}15`, color: colors.primary }}
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
              </div>

              <p className="text-xs text-center mb-4" style={{ color: colors.textTertiary }}>
                {memberLabel} will be prompted to change this on next login.
              </p>

              <button
                onClick={() => setAddSuccess(null)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-semibold text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: colors.primary }}
              >
                <Check size={16} /> Done
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* EXPORT FIELD SELECTION MODAL                           */}
      {/* ═══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showExportModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowExportModal(false)} />
            <motion.div
              className="relative w-full max-w-lg rounded-2xl border max-h-[90vh] flex flex-col"
              style={{ background: colors.secondaryLight, borderColor: colors.borderLight, boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4" style={{ borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`, border: `1px solid ${colors.primary}40` }}>
                    <Download size={22} style={{ color: colors.primary }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Export {memberLabelPlural}</h3>
                    <p className="text-xs" style={{ color: colors.textTertiary }}>
                      {selectedIds.size > 0 ? `${selectedIds.size} selected` : `All ${filtered.length} ${memberLabelPlural.toLowerCase()}`}
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowExportModal(false)} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
                  <X size={18} className="text-white" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto modal-scrollbar px-6 py-5 space-y-6">
                {/* Format Selection */}
                <div>
                  <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: colors.textTertiary }}>Export Format</p>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { value: 'pdf' as const, label: 'PDF Document', desc: 'Professional formatted report', icon: <FileText size={20} />, color: colors.statusUnpaid },
                      { value: 'csv' as const, label: 'CSV Spreadsheet', desc: 'Excel compatible format', icon: <FileSpreadsheet size={20} />, color: colors.accentMint },
                    ]).map(fmt => (
                      <button
                        key={fmt.value}
                        onClick={() => setExportFormat(fmt.value)}
                        className="flex flex-col items-center gap-2.5 px-4 py-4 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                        style={{
                          background: exportFormat === fmt.value ? `${fmt.color}15` : 'rgba(255,255,255,0.03)',
                          color: exportFormat === fmt.value ? fmt.color : colors.textSecondary,
                          border: `1px solid ${exportFormat === fmt.value ? fmt.color + '50' : 'rgba(255,255,255,0.08)'}`,
                          boxShadow: exportFormat === fmt.value ? `0 4px 15px ${fmt.color}20` : 'none',
                        }}
                      >
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${fmt.color}20` }}>
                          {fmt.icon}
                        </div>
                        <span className="font-semibold">{fmt.label}</span>
                        <span className="text-[10px]" style={{ color: colors.textTertiary }}>{fmt.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Field Selection */}
                <div>
                  <p className="text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: colors.textTertiary }}>Include Fields</p>
                  <div className="space-y-1.5 rounded-xl p-1" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    {([
                      { key: 'name' as const, label: 'Full Name', always: true },
                      { key: 'regNumber' as const, label: `${memberLabel} ID` },
                      { key: 'level' as const, label: 'Level' },
                      { key: 'department' as const, label: 'Department' },
                      { key: 'email' as const, label: 'Email Address' },
                      { key: 'phone' as const, label: 'Phone Number' },
                      { key: 'status' as const, label: 'Active Status' },
                      { key: 'roles' as const, label: 'Roles (Admin / FinSec / Rep)' },
                      { key: 'joinDate' as const, label: 'Date Joined' },
                    ]).map(field => (
                      <button
                        key={field.key}
                        onClick={() => {
                          if ('always' in field && field.always) return;
                          setExportFields(prev => ({ ...prev, [field.key]: !prev[field.key] }));
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all hover:bg-white/5"
                        style={{
                          color: exportFields[field.key] ? 'white' : colors.textTertiary,
                          background: exportFields[field.key] ? 'rgba(255,255,255,0.04)' : 'transparent',
                          border: exportFields[field.key] ? `1px solid rgba(255,255,255,0.08)` : '1px solid transparent',
                        }}
                      >
                        <span className="flex items-center gap-2.5">
                          {field.label}
                          {'always' in field && field.always && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: `${colors.primary}20`, color: colors.primary, border: `1px solid ${colors.primary}30` }}>Required</span>
                          )}
                        </span>
                        {exportFields[field.key]
                          ? <CheckSquare size={18} style={{ color: colors.primary }} />
                          : <Square size={18} style={{ color: colors.textDisabled }} />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Export Info */}
                <div className="p-3 rounded-xl flex items-center gap-3" style={{ background: `${colors.primary}08`, border: `1px solid ${colors.primary}20` }}>
                  <Download size={14} style={{ color: colors.primary }} />
                  <p className="text-xs" style={{ color: colors.textSecondary }}>
                    Exporting {selectedIds.size > 0 ? selectedIds.size : filtered.length} {memberLabelPlural.toLowerCase()} as {exportFormat.toUpperCase()}
                  </p>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex gap-3 px-6 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowExportModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all"
                  style={{ color: colors.textSecondary, background: 'rgba(255,255,255,0.05)', border: `1px solid rgba(255,255,255,0.1)` }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => exportFormat === 'csv' ? handleExportCSV() : handleExportPDF()}
                  disabled={exporting}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${colors.accentMint}, ${colors.primary})`, boxShadow: `0 4px 15px ${colors.accentMint}40` }}
                >
                  {exporting ? <><Loader2 size={16} className="animate-spin" /> Exporting...</> : <><Download size={16} /> Export {exportFormat.toUpperCase()}</>}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════ */}
      {/* ROLE MANAGEMENT MODAL                                  */}
      {/* ═══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showRoleModal && roleTarget && (() => {
          const currentMember = members.find(m => m.id === roleTarget.id) || roleTarget;
          const currentRoles = getMemberRoles(currentMember);
          return (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setShowRoleModal(false); setRoleTarget(null); }} />
              <motion.div
                className="relative w-full max-w-sm rounded-2xl p-6 border"
                style={{ background: colors.secondaryLight, borderColor: colors.borderLight, boxShadow: '0 25px 60px rgba(0,0,0,0.6)' }}
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.accentPurple}15`, color: colors.accentPurple }}>
                      <UserCog size={20} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">Manage Roles</h3>
                      <p className="text-xs" style={{ color: colors.textTertiary }}>{roleTarget.full_name}</p>
                    </div>
                  </div>
                  <button onClick={() => { setShowRoleModal(false); setRoleTarget(null); }} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <X size={18} className="text-white" />
                  </button>
                </div>

                {/* Role toggles */}
                <div className="space-y-2">
                  {([
                    { role: 'admin' as const, label: 'Admin', desc: 'Full access to manage organization', color: colors.accentPurple, icon: <Shield size={16} /> },
                    { role: 'finsec' as const, label: 'Financial Secretary', desc: 'Manage payments & finances', color: colors.success, icon: <Crown size={16} /> },
                    { role: 'class_rep' as const, label: 'Class Representative', desc: 'Manage group members', color: colors.primary, icon: <Users size={16} /> },
                  ]).map(r => {
                    const isActive = r.role === 'admin' ? currentRoles.isAdmin : r.role === 'finsec' ? currentRoles.isFinsec : currentRoles.isClassRep;
                    return (
                      <button
                        key={r.role}
                        onClick={() => toggleRole(currentMember, r.role)}
                        disabled={roleLoading}
                        className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                        style={{
                          background: isActive ? `${r.color}10` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${isActive ? r.color : 'rgba(255,255,255,0.08)'}`,
                        }}
                      >
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${r.color}15`, color: r.color }}>
                          {r.icon}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium" style={{ color: isActive ? 'white' : colors.textSecondary }}>{r.label}</p>
                          <p className="text-xs" style={{ color: colors.textTertiary }}>{r.desc}</p>
                        </div>
                        <div className="shrink-0">
                          {roleLoading ? (
                            <Loader2 size={16} className="animate-spin" style={{ color: r.color }} />
                          ) : isActive ? (
                            <CheckSquare size={18} style={{ color: r.color }} />
                          ) : (
                            <Square size={18} style={{ color: colors.textDisabled }} />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs mt-4 text-center" style={{ color: colors.textTertiary }}>
                  Click to toggle roles. Changes take effect immediately.
                </p>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
      </div>

      {/* ── Confirm Action Modal ── */}
      <AnimatePresence>
        {confirmAction.isOpen && confirmAction.member && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setConfirmAction({ isOpen: false, type: null, member: null })}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, rgba(30, 20, 15, 0.98), rgba(15, 8, 4, 0.98))',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              {/* Gradient accent bar */}
              <div className="h-1" style={{ background: confirmAction.type === 'delete'
                ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                : `linear-gradient(90deg, ${colors.warning}, ${colors.primary})`
              }} />

              <div className="p-6">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.1, damping: 15 }}
                  className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{
                    background: confirmAction.type === 'delete' ? 'rgba(239, 68, 68, 0.15)' : `${colors.warning}20`,
                    border: `2px solid ${confirmAction.type === 'delete' ? 'rgba(239, 68, 68, 0.3)' : colors.warning + '40'}`,
                  }}
                >
                  {confirmAction.type === 'delete'
                    ? <Trash2 className="w-8 h-8 text-red-400" />
                    : <AlertTriangle className="w-8 h-8" style={{ color: colors.warning }} />
                  }
                </motion.div>

                {/* Title */}
                <h3 className="text-xl font-bold text-white text-center mb-2">
                  {confirmAction.type === 'delete'
                    ? 'Delete Member'
                    : confirmAction.member.is_active ? 'Deactivate Member' : 'Activate Member'
                  }
                </h3>

                {/* Member info card */}
                <div
                  className="p-4 rounded-xl flex items-center gap-4 mb-4"
                  style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                    style={{ background: `${colors.primary}20`, color: colors.primary }}
                  >
                    {confirmAction.member.full_name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-semibold text-white">{confirmAction.member.full_name}</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>{confirmAction.member.member_id}</p>
                  </div>
                </div>

                {/* Warning message */}
                <div
                  className="p-4 rounded-xl flex items-start gap-3 mb-6"
                  style={{
                    background: confirmAction.type === 'delete' ? 'rgba(239, 68, 68, 0.1)' : `${colors.warning}10`,
                    border: `1px solid ${confirmAction.type === 'delete' ? 'rgba(239, 68, 68, 0.2)' : colors.warning + '20'}`,
                  }}
                >
                  <AlertTriangle
                    className="w-5 h-5 mt-0.5 shrink-0"
                    style={{ color: confirmAction.type === 'delete' ? '#ef4444' : colors.warning }}
                  />
                  <p className="text-sm" style={{ color: colors.textSecondary }}>
                    {confirmAction.type === 'delete'
                      ? `Are you sure you want to permanently remove "${confirmAction.member.full_name}"? This action cannot be undone and will delete all associated data.`
                      : confirmAction.member.is_active
                        ? `Are you sure you want to deactivate "${confirmAction.member.full_name}"? They will no longer be able to log in or access the system.`
                        : `Are you sure you want to reactivate "${confirmAction.member.full_name}"? They will regain access to the system.`
                    }
                  </p>
                </div>

                {/* Buttons */}
                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setConfirmAction({ isOpen: false, type: null, member: null })}
                    className="flex-1 py-3 rounded-xl font-medium text-sm transition-colors"
                    style={{ background: 'rgba(255,255,255,0.05)', color: colors.textSecondary, border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleConfirmAction}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all"
                    style={{
                      background: confirmAction.type === 'delete'
                        ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                        : confirmAction.member.is_active
                          ? `linear-gradient(135deg, ${colors.warning}, #d97706)`
                          : `linear-gradient(135deg, ${colors.statusPaid}, #16a34a)`,
                      boxShadow: confirmAction.type === 'delete'
                        ? '0 4px 15px rgba(239, 68, 68, 0.3)'
                        : confirmAction.member.is_active
                          ? `0 4px 15px ${colors.warning}30`
                          : `0 4px 15px ${colors.statusPaid}30`,
                    }}
                  >
                    {confirmAction.type === 'delete'
                      ? 'Delete Member'
                      : confirmAction.member.is_active ? 'Deactivate' : 'Activate'
                    }
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Subscription Limit Reached Modal ── */}
      <AnimatePresence>
        {showLimitModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-100 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
            onClick={() => setShowLimitModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl"
              style={{
                background: 'linear-gradient(135deg, rgba(30, 20, 15, 0.98), rgba(15, 8, 4, 0.98))',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              {/* Gradient accent bar */}
              <div className="h-1" style={{ background: `linear-gradient(90deg, ${colors.warning}, ${colors.primary})` }} />

              <div className="p-6 text-center">
                {/* Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.1, damping: 15 }}
                  className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{ background: `${colors.warning}20`, border: `2px solid ${colors.warning}40` }}
                >
                  <AlertTriangle className="w-8 h-8" style={{ color: colors.warning }} />
                </motion.div>

                <h3 className="text-xl font-bold text-white mb-2">Plan Limit Reached</h3>
                <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
                  {limitMessage}
                </p>

                <div className="flex gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowLimitModal(false)}
                    className="flex-1 py-3 rounded-xl font-medium text-sm transition-colors"
                    style={{ background: 'rgba(255,255,255,0.05)', color: colors.textSecondary, border: '1px solid rgba(255,255,255,0.1)' }}
                  >
                    Close
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setShowLimitModal(false); navigateTo('/admin/billing'); }}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-all"
                    style={{
                      background: `linear-gradient(135deg, ${colors.warning}, ${colors.primary})`,
                      boxShadow: `0 4px 15px ${colors.warning}30`,
                    }}
                  >
                    Upgrade Plan ✨
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
