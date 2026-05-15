import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Building2,
  Layers,
  Search,
  Plus,
  Edit2,
  GraduationCap,
} from 'lucide-react';
import { colors, gradients } from '@/config/colors';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import organizationService from '@/services/organizationService';
import type { OrganizationGroup, GroupKind } from '@/types/multiTenant';
import PageWrapper from '@/components/ui/PageWrapper';
import GlassCard from '@/components/ui/GlassCard';
import EmptyState from '@/components/ui/EmptyState';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown';
import CustomButton from '@/components/ui/CustomButton';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';

interface GroupFormData {
  name: string;
  short_name: string;
  description: string;
  kind: GroupKind;
  parent_group_id: string;
  level: string;
}

const DEFAULT_FORM: GroupFormData = {
  name: '',
  short_name: '',
  description: '',
  kind: 'general',
  parent_group_id: '',
  level: '',
};

type GroupTab = 'all' | 'faculty' | 'class';

export default function OrgGroupsPage() {
  const { organization } = useMultiTenantAuth();
  const [groups, setGroups] = useState<OrganizationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<GroupTab>('all');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [form, setForm] = useState<GroupFormData>(DEFAULT_FORM);
  const [editTarget, setEditTarget] = useState<OrganizationGroup | null>(null);

  const isAcademicOrg = organization?.organization_type === 'university' || organization?.organization_type === 'school';
  const classLabel = organization?.organization_type === 'university' ? 'Department' : 'Class';
  const classLabelPlural = classLabel === 'Class' ? 'Classes' : `${classLabel}s`;
  const groupLabel = organization?.group_label || 'Group';
  const groupLabelPlural = organization?.group_label_plural || 'Groups';

  const fetchGroups = useCallback(async () => {
    if (!organization) return;
    setLoading(true);
    setError('');
    try {
      const data = await organizationService.getGroups(organization.id);
      setGroups(data || []);
    } catch (err) {
      console.error('Failed to load groups:', err);
      setError('Unable to load groups right now. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [organization]);

  useEffect(() => {
    void fetchGroups();
  }, [fetchGroups]);

  const facultyGroups = useMemo(() => groups.filter(g => g.kind === 'faculty'), [groups]);
  const classGroups = useMemo(() => groups.filter(g => g.kind !== 'faculty'), [groups]);

  const visibleGroups = useMemo(() => {
    let base = groups;
    if (isAcademicOrg) {
      if (activeTab === 'faculty') base = facultyGroups;
      if (activeTab === 'class') base = classGroups;
    }

    if (!searchQuery.trim()) return base;

    const query = searchQuery.trim().toLowerCase();
    return base.filter(group => (
      group.name.toLowerCase().includes(query) ||
      group.short_name.toLowerCase().includes(query) ||
      (group.description || '').toLowerCase().includes(query)
    ));
  }, [groups, isAcademicOrg, activeTab, facultyGroups, classGroups, searchQuery]);

  const statCards = useMemo(() => ([
    {
      id: 'total-groups',
      label: groupLabelPlural,
      value: groups.length,
      icon: <Layers className="w-5 h-5" />,
    },
    {
      id: 'faculty-count',
      label: isAcademicOrg ? 'Faculties' : 'Active Groups',
      value: isAcademicOrg ? facultyGroups.length : groups.filter(g => g.is_active).length,
      icon: <Building2 className="w-5 h-5" />,
    },
    {
      id: 'class-count',
      label: isAcademicOrg ? classLabelPlural : 'Inactive Groups',
      value: isAcademicOrg ? classGroups.length : groups.filter(g => !g.is_active).length,
      icon: <GraduationCap className="w-5 h-5" />,
    },
  ]), [groupLabelPlural, groups, isAcademicOrg, facultyGroups.length, classGroups.length, classLabelPlural]);

  const tabOptions: Array<{ value: GroupTab; label: string }> = isAcademicOrg
    ? [
        { value: 'all', label: 'All' },
        { value: 'faculty', label: 'Faculties' },
        { value: 'class', label: classLabelPlural },
      ]
    : [{ value: 'all', label: groupLabelPlural }];

  const resetForm = (kindOverride?: GroupKind) => {
    setForm({
      ...DEFAULT_FORM,
      kind: kindOverride || (isAcademicOrg ? 'class' : 'general'),
      short_name: '',
    });
    setFormError('');
  };

  const openCreate = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEdit = (group: OrganizationGroup) => {
    const kind = (group.kind || (isAcademicOrg ? 'class' : 'general')) as GroupKind;
    setForm({
      name: group.name || '',
      short_name: group.short_name || '',
      description: group.description || '',
      kind,
      parent_group_id: group.parent_group_id || '',
      level: group.levels && group.levels.length > 0 ? organizationService.canonicalizeLevel(group.levels[0]) : '',
    });
    setEditTarget(group);
    setShowEditModal(true);
    setFormError('');
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setEditTarget(null);
    setFormError('');
  };

  const validateForm = (): boolean => {
    if (!organization) return false;

    if (!form.name.trim()) {
      setFormError('Group name is required.');
      return false;
    }
    if (!form.short_name.trim()) {
      setFormError('Short name or code is required.');
      return false;
    }

    const requiresLevel = isAcademicOrg ? form.kind === 'class' : true;
    if (requiresLevel && !form.level.trim()) {
      setFormError('Primary level is required for this group.');
      return false;
    }

    const normalizedShort = form.short_name.trim().toUpperCase();
    const shortTaken = groups.some(g => g.short_name.toUpperCase() === normalizedShort && g.id !== editTarget?.id);
    if (shortTaken) {
      setFormError('Another group already uses this short name.');
      return false;
    }

    return true;
  };

  const handleSave = async () => {
    if (!organization) return;
    if (!validateForm()) return;

    setSaving(true);
    setFormError('');

    const payload = {
      organization_id: organization.id,
      name: form.name.trim(),
      short_name: form.short_name.trim().toUpperCase(),
      description: form.description.trim() || undefined,
      kind: form.kind,
      parent_group_id: form.kind === 'class' ? (form.parent_group_id || undefined) : undefined,
      levels: form.level.trim() ? [form.level.trim()] : undefined,
    };

    try {
      if (editTarget) {
        await organizationService.updateGroup(editTarget.id, {
          name: payload.name,
          short_name: payload.short_name,
          description: payload.description,
          parent_group_id: payload.parent_group_id,
          levels: payload.levels,
          kind: payload.kind,
        });
      } else {
        await organizationService.createGroup(payload);
      }

      await fetchGroups();
      closeModal();
    } catch (err) {
      console.error('Failed to save group:', err);
      setFormError(err instanceof Error ? err.message : 'Failed to save group.');
    } finally {
      setSaving(false);
    }
  };

  if (!organization) return null;

  return (
    <PageWrapper>
      <div className="max-w-6xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlassCard className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest mb-2" style={{ color: colors.primary }}>
                  Organization Structure
                </p>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">
                  {isAcademicOrg ? 'Faculties and Classes' : groupLabelPlural}
                </h1>
                <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>
                  Keep your structure clean and professional. Create, update, and organize groups with clarity.
                </p>
              </div>
              <CustomButton icon={Plus} onClick={openCreate}>
                New {isAcademicOrg ? classLabel : groupLabel}
              </CustomButton>
            </div>
          </GlassCard>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-3">
          {statCards.map((stat) => (
            <GlassCard key={stat.id} className="p-5" intensity="medium">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-widest" style={{ color: colors.textSecondary }}>
                    {stat.label}
                  </p>
                  <p className="text-2xl font-bold text-white mt-2">
                    {stat.value}
                  </p>
                </div>
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: gradients.glass, color: colors.primary }}
                >
                  {stat.icon}
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        <GlassCard className="p-5">
          <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
            <div className="flex-1 max-w-md">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${groupLabelPlural.toLowerCase()}...`}
                icon={<Search size={18} />}
                fullWidth
              />
            </div>
            <div className="grid grid-cols-2 gap-2 w-full sm:w-auto sm:flex sm:flex-wrap">
              {tabOptions.map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold transition-all w-full"
                  style={{
                    background: activeTab === tab.value ? gradients.primary : 'rgba(255,255,255,0.06)',
                    color: activeTab === tab.value ? '#fff' : colors.textSecondary,
                    border: `1px solid ${activeTab === tab.value ? colors.primary : 'rgba(255,255,255,0.12)'}`,
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </GlassCard>

        {loading ? (
          <GlassCard className="p-12 flex justify-center">
            <LoadingSpinner size="md" text="Loading groups..." />
          </GlassCard>
        ) : error ? (
          <GlassCard className="p-12">
            <EmptyState
              illustration="error"
              title="Unable to load groups"
              description={error}
              action={
                <CustomButton variant="secondary" onClick={fetchGroups}>
                  Try Again
                </CustomButton>
              }
            />
          </GlassCard>
        ) : visibleGroups.length === 0 ? (
          <GlassCard className="p-12">
            <EmptyState
              illustration="inbox"
              title={`No ${groupLabelPlural.toLowerCase()} yet`}
              description="Create your first group and start organizing members the right way."
              action={
                <CustomButton icon={Plus} onClick={openCreate}>
                  Create Group
                </CustomButton>
              }
            />
          </GlassCard>
        ) : (
          <div className="grid gap-4">
            {visibleGroups.map(group => {
              const kindLabel = isAcademicOrg
                ? (group.kind === 'faculty' ? 'Faculty' : classLabel)
                : groupLabel;
              const primaryLevel = group.levels && group.levels.length > 0
                ? organizationService.canonicalizeLevel(group.levels[0])
                : '—';
              const parentName = group.parent_group_id
                ? groups.find(g => g.id === group.parent_group_id)?.name || 'Unassigned'
                : '—';

              return (
                <GlassCard key={group.id} className="p-5" intensity="medium">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center"
                        style={{ background: `${colors.primary}1A`, color: colors.primary }}
                      >
                        <Building2 size={22} />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white">
                          {group.name}
                          <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                            background: `${colors.primary}20`,
                            color: colors.primary,
                          }}>
                            {group.short_name}
                          </span>
                        </h3>
                        <div className="flex flex-wrap gap-2 mt-2 text-xs" style={{ color: colors.textSecondary }}>
                          <span className="px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)' }}>
                            {kindLabel}
                          </span>
                          <span className="px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)' }}>
                            Level: {primaryLevel}
                          </span>
                          {isAcademicOrg && group.kind !== 'faculty' && (
                            <span className="px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.08)' }}>
                              Faculty: {parentName}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CustomButton variant="secondary" size="sm" icon={Edit2} onClick={() => openEdit(group)}>
                        Edit
                      </CustomButton>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        isOpen={showCreateModal || showEditModal}
        onClose={closeModal}
        title={showEditModal ? `Edit ${getGroupLabel(form.kind, classLabel, groupLabel, isAcademicOrg)}` : `Create ${getGroupLabel(form.kind, classLabel, groupLabel, isAcademicOrg)}`}
        size="lg"
      >
        <div className="space-y-4">
          {formError && (
            <div
              className="p-3 rounded-xl text-sm"
              style={{ background: 'rgba(255, 77, 77, 0.12)', border: '1px solid rgba(255, 77, 77, 0.3)', color: colors.statusUnpaid }}
            >
              {formError}
            </div>
          )}

          {isAcademicOrg && (
            <ProfessionalDropdown
              label="Group Type"
              value={form.kind}
              onChange={(value) => setForm(prev => ({ ...prev, kind: value as GroupKind, parent_group_id: '', level: '' }))}
              options={[
                { value: 'faculty', label: 'Faculty' },
                { value: 'class', label: classLabel },
              ]}
            />
          )}

          <Input
            label="Group Name"
            placeholder={isAcademicOrg && form.kind === 'faculty' ? 'e.g. Faculty of Engineering' : `e.g. ${classLabel}`}
            value={form.name}
            onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
            fullWidth
          />

          <Input
            label="Short Name / Code"
            placeholder={isAcademicOrg && form.kind === 'faculty' ? 'e.g. ENG' : 'e.g. CSC'}
            value={form.short_name}
            onChange={(e) => setForm(prev => ({ ...prev, short_name: e.target.value.toUpperCase().slice(0, 10) }))}
            fullWidth
          />

          <Textarea
            label="Description"
            placeholder="Optional summary for this group"
            value={form.description}
            onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
            fullWidth
          />

          {isAcademicOrg && form.kind === 'class' && (
            <ProfessionalDropdown
              label="Faculty (optional)"
              value={form.parent_group_id}
              onChange={(value) => setForm(prev => ({ ...prev, parent_group_id: value as string }))}
              placeholder="Select faculty"
              options={[
                { value: '', label: 'No faculty' },
                ...facultyGroups.map(group => ({
                  value: group.id,
                  label: `${group.name} (${group.short_name})`,
                })),
              ]}
              clearable
            />
          )}

          {(!isAcademicOrg || form.kind === 'class') && (
            <Input
              label="Primary Level"
              placeholder={organization?.organization_type === 'university' ? 'e.g. 200L' : 'e.g. SS2'}
              value={form.level}
              onChange={(e) => setForm(prev => ({ ...prev, level: e.target.value }))}
              fullWidth
            />
          )}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-end">
          <CustomButton variant="secondary" onClick={closeModal} disabled={saving}>
            Cancel
          </CustomButton>
          <CustomButton onClick={handleSave} loading={saving}>
            {showEditModal ? 'Save Changes' : 'Create Group'}
          </CustomButton>
        </div>
      </Modal>
    </PageWrapper>
  );
}

function getGroupLabel(kind: GroupKind, classLabel: string, groupLabel: string, isAcademic: boolean) {
  if (!isAcademic) return groupLabel;
  return kind === 'faculty' ? 'Faculty' : classLabel;
}
