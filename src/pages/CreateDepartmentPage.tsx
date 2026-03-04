/**
 * CreateDepartmentPage - Search for an existing organization and create a department within it
 * Route: /join-org
 * 
 * Flow:
 * 1. Search for existing organizations
 * 2. Select one & view its existing departments
 * 3. Enter new department name + short code
 * 4. Create admin account for the department
 * 5. Submit → creates group + member + admin role
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Church,
  GraduationCap,
  Users,
  Globe,
  Search,
  Check,
  Loader2,
  Sparkles,
  ChevronRight,
  FolderTree,
} from 'lucide-react';
import { colors } from '@/config/colors';
import { APP_NAME } from '@/config/constants';
import { organizationService } from '@/services/organizationService';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import PageWrapper from '@/components/ui/PageWrapper';
import type { Organization, OrganizationGroup } from '@/types/multiTenant';

const ORG_TYPE_ICONS: Record<string, React.ReactNode> = {
  university: <GraduationCap size={20} />,
  school: <GraduationCap size={20} />,
  church: <Church size={20} />,
  club: <Users size={20} />,
  association: <Users size={20} />,
  cooperative: <Building2 size={20} />,
  ngo: <Globe size={20} />,
  other: <Building2 size={20} />,
};

interface DeptFormData {
  group_name: string;
  group_short_name: string;
  description: string;
  parent_group_id: string;
  owner_name: string;
  owner_member_id: string;
  owner_password: string;
  owner_password_confirm: string;
}

export default function CreateDepartmentPage() {
  const navigate = useNavigate();
  const { login } = useMultiTenantAuth();

  // Steps: 1 = Search/Select org, 2 = Dept details, 3 = Admin account
  const [step, setStep] = useState(1);
  const totalSteps = 3;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Organization[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Selected org
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [existingGroups, setExistingGroups] = useState<OrganizationGroup[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  // Form
  const [form, setForm] = useState<DeptFormData>({
    group_name: '',
    group_short_name: '',
    description: '',
    parent_group_id: '',
    owner_name: '',
    owner_member_id: '',
    owner_password: '',
    owner_password_confirm: '',
  });

  const updateForm = (updates: Partial<DeptFormData>) => {
    setForm(prev => ({ ...prev, ...updates }));
    setError('');
  };

  // Debounced search
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (query.length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      setHasSearched(true);
      try {
        const results = await organizationService.search(query);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, []);

  // Load existing groups/departments when org is selected
  const selectOrganization = async (org: Organization) => {
    setSelectedOrg(org);
    setError('');
    setLoadingGroups(true);
    try {
      const groups = await organizationService.getGroups(org.id);
      setExistingGroups(groups);
      if (groups.length === 0) {
        console.log('[JoinOrg] No groups found for org:', org.id, org.name);
      }
    } catch (err) {
      console.error('[JoinOrg] Failed to load departments:', err);
      setExistingGroups([]);
      setError('Failed to load existing departments. You can still create a new one.');
    } finally {
      setLoadingGroups(false);
    }
  };

  const clearSelection = () => {
    setSelectedOrg(null);
    setExistingGroups([]);
    setError('');
  };

  // Get the group label for the selected org type
  const getGroupLabel = () => {
    if (!selectedOrg) return 'Department';
    switch (selectedOrg.organization_type) {
      case 'university': return 'Department';
      case 'school': return 'Class';
      case 'church': return 'Ministry / Unit';
      default: return 'Group';
    }
  };

  const validateStep = (): boolean => {
    switch (step) {
      case 1:
        if (!selectedOrg) {
          setError('Please search and select an organization first');
          return false;
        }
        return true;
      case 2:
        if (!form.group_name.trim()) {
          setError(`${getGroupLabel()} name is required`);
          return false;
        }
        if (!form.group_short_name.trim()) {
          setError('Short name / code is required');
          return false;
        }
        if (form.group_short_name.length < 2) {
          setError('Short name must be at least 2 characters');
          return false;
        }
        // Check if short name already exists
        if (existingGroups.some(g => g.short_name.toUpperCase() === form.group_short_name.toUpperCase())) {
          setError(`A ${getGroupLabel().toLowerCase()} with this short name already exists in ${selectedOrg?.name}`);
          return false;
        }
        return true;
      case 3:
        if (!form.owner_name.trim()) {
          setError('Your full name is required');
          return false;
        }
        if (!form.owner_member_id.trim()) {
          setError('Your login ID is required');
          return false;
        }
        if (!form.owner_password || form.owner_password.length < 6) {
          setError('Password must be at least 6 characters');
          return false;
        }
        if (form.owner_password !== form.owner_password_confirm) {
          setError('Passwords do not match');
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (validateStep()) {
      setStep(s => Math.min(s + 1, totalSteps));
      setError('');
    }
  };

  const prevStep = () => {
    setStep(s => Math.max(s - 1, 1));
    setError('');
  };

  const handleSubmit = async () => {
    if (!validateStep() || !selectedOrg) return;
    setLoading(true);
    setError('');

    try {
      const result = await organizationService.createDepartment(selectedOrg.id, {
        group_name: form.group_name.trim(),
        group_short_name: form.group_short_name.trim().toUpperCase(),
        owner_name: form.owner_name.trim(),
        owner_member_id: form.owner_member_id.trim(),
        owner_password: form.owner_password,
        description: form.description.trim() || undefined,
        parent_group_id: form.parent_group_id || undefined,
      });

      if (result?.slug) {
        // Auto-login the new department admin
        try {
          const loginResult = await login(form.owner_member_id.trim(), form.owner_password, result.slug);
          if (loginResult.mustChangePassword) {
            navigate(`/${result.slug}/change-password`, { replace: true });
          } else {
            navigate(`/${result.slug}/dashboard`, { replace: true });
          }
        } catch {
          // Fallback to login page
          navigate(`/${result.slug}/login`, { replace: true });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create department');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6">
      <motion.div
        className="w-full max-w-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => step > 1 ? prevStep() : navigate('/create')}
            className="p-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">Join Organization</h1>
            <p className="text-sm" style={{ color: colors.textTertiary }}>
              Step {step} of {totalSteps} — Create a {selectedOrg ? getGroupLabel().toLowerCase() : 'department'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold" style={{ color: colors.primary }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs"
              style={{ background: colors.primary }}>
              P
            </div>
            {APP_NAME}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="flex gap-2 mb-8">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div
              key={i}
              className="flex-1 h-1.5 rounded-full transition-all duration-300"
              style={{
                background: i < step ? colors.primary : 'rgba(255,255,255,0.1)',
              }}
            />
          ))}
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 p-3 rounded-xl text-sm text-red-400"
              style={{ background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.2)' }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Steps */}
        <AnimatePresence mode="wait">
          {/* ========== STEP 1: Search & Select Organization ========== */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.primary}20` }}>
                  <Search size={20} style={{ color: colors.primary }} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Find Your Organization</h2>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>
                    Search for an existing university, church, or organization
                  </p>
                </div>
              </div>

              {/* Selected Org Card */}
              {selectedOrg ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-6"
                >
                  {/* Selected org header */}
                  <div
                    className="p-4 rounded-2xl"
                    style={{
                      background: `${colors.primary}10`,
                      border: `1.5px solid ${colors.primary}60`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold"
                        style={{ background: selectedOrg.primary_color || colors.primary }}
                      >
                        {selectedOrg.logo_url ? (
                          <img src={selectedOrg.logo_url} alt="" className="w-full h-full object-cover rounded-xl" />
                        ) : (
                          selectedOrg.short_name?.slice(0, 2) || 'ORG'
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-white truncate">{selectedOrg.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span
                            className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase"
                            style={{ background: `${colors.primary}20`, color: colors.primary }}
                          >
                            {selectedOrg.organization_type}
                          </span>
                          {selectedOrg.country && (
                            <span className="text-xs" style={{ color: colors.textTertiary }}>
                              {selectedOrg.country}
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={clearSelection}
                        className="text-xs px-3 py-1.5 rounded-lg transition-colors hover:bg-white/10"
                        style={{ color: colors.textSecondary }}
                      >
                        Change
                      </button>
                    </div>

                    {/* Existing departments */}
                    {loadingGroups ? (
                      <div className="mt-4 flex items-center justify-center py-3">
                        <Loader2 size={16} className="animate-spin" style={{ color: colors.textTertiary }} />
                        <span className="ml-2 text-xs" style={{ color: colors.textTertiary }}>Loading departments...</span>
                      </div>
                    ) : existingGroups.length > 0 ? (
                      <div className="mt-4">
                        <p className="text-xs font-medium mb-2" style={{ color: colors.textSecondary }}>
                          <FolderTree size={12} className="inline mr-1 -mt-0.5" />
                          Existing {getGroupLabel()}s ({existingGroups.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {existingGroups.map(g => (
                            <span
                              key={g.id}
                              className="px-2.5 py-1 rounded-lg text-xs font-medium"
                              style={{ background: 'rgba(255,255,255,0.06)', color: colors.textSecondary }}
                            >
                              {g.name}
                              <span className="opacity-50 ml-1">({g.short_name})</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="mt-3 text-xs" style={{ color: colors.textTertiary }}>
                        No departments yet — you&apos;ll be the first!
                      </p>
                    )}
                  </div>

                  {/* Parent group selector (optional, for sub-departments) */}
                  {existingGroups.length > 0 && (
                    <div className="mt-4">
                      <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
                        Parent {getGroupLabel()} (optional)
                      </label>
                      <select
                        value={form.parent_group_id}
                        onChange={e => updateForm({ parent_group_id: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-[#FF6803] transition-colors appearance-none"
                      >
                        <option value="">None (top-level {getGroupLabel().toLowerCase()})</option>
                        {existingGroups.map(g => (
                          <option key={g.id} value={g.id}>{g.name} ({g.short_name})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </motion.div>
              ) : (
                /* Search UI (when no org selected) */
                <div className="mt-6">
                  {/* Search Input */}
                  <div className="relative">
                    <Search
                      size={18}
                      className="absolute left-4 top-1/2 -translate-y-1/2"
                      style={{ color: colors.textTertiary }}
                    />
                    <input
                      type="text"
                      placeholder="Search by organization name..."
                      value={searchQuery}
                      onChange={e => handleSearch(e.target.value)}
                      autoFocus
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                    />
                    {searching && (
                      <Loader2
                        size={16}
                        className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin"
                        style={{ color: colors.textTertiary }}
                      />
                    )}
                  </div>

                  {/* Search Results */}
                  {hasSearched && !searching && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4"
                    >
                      {searchResults.length > 0 ? (
                        <div className="space-y-2">
                          <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                            {searchResults.length} organization{searchResults.length > 1 ? 's' : ''} found
                          </p>
                          {searchResults.map(org => (
                            <button
                              key={org.id}
                              onClick={() => selectOrganization(org)}
                              className="w-full p-3 rounded-xl text-left transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center gap-3"
                              style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                              }}
                            >
                              <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                style={{ background: `${org.primary_color || colors.primary}20` }}
                              >
                                {org.logo_url ? (
                                  <img src={org.logo_url} alt="" className="w-full h-full object-cover rounded-xl" />
                                ) : (
                                  <span style={{ color: org.primary_color || colors.primary }}>
                                    {ORG_TYPE_ICONS[org.organization_type] || <Building2 size={20} />}
                                  </span>
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-white text-sm truncate">{org.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] uppercase font-semibold" style={{ color: colors.textTertiary }}>
                                    {org.organization_type}
                                  </span>
                                  {org.country && (
                                    <span className="text-[10px]" style={{ color: colors.textTertiary }}>
                                      • {org.country}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <ChevronRight size={16} style={{ color: colors.textTertiary }} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Building2 size={32} className="mx-auto mb-3 opacity-30 text-white" />
                          <p className="text-sm text-white/60">
                            No organizations found for &ldquo;{searchQuery}&rdquo;
                          </p>
                          <p className="text-xs mt-2" style={{ color: colors.textTertiary }}>
                            The organization may not exist yet.
                          </p>
                          <button
                            onClick={() => navigate('/create')}
                            className="mt-4 px-4 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-white/5"
                            style={{ color: colors.primary, border: `1px solid ${colors.primary}40` }}
                          >
                            Create New Organization
                          </button>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Initial prompt */}
                  {!hasSearched && !searching && (
                    <div className="mt-8 text-center">
                      <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center" style={{ background: `${colors.primary}10` }}>
                        <FolderTree size={28} style={{ color: colors.primary }} />
                      </div>
                      <p className="text-sm text-white/80">
                        Search for your university, school, church, or organization above.
                      </p>
                      <p className="text-xs mt-2" style={{ color: colors.textTertiary }}>
                        Once found, you can create a new department, class, or ministry within it.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* ========== STEP 2: Department Details ========== */}
          {step === 2 && selectedOrg && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.primary}20` }}>
                  <FolderTree size={20} style={{ color: colors.primary }} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    New {getGroupLabel()} in {selectedOrg.short_name}
                  </h2>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>
                    Create a {getGroupLabel().toLowerCase()} within {selectedOrg.name}
                  </p>
                </div>
              </div>

              <div className="space-y-4 mt-6">
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">
                    {getGroupLabel()} Name *
                  </label>
                  <input
                    type="text"
                    placeholder={
                      selectedOrg.organization_type === 'university' ? 'e.g. Computer Science' :
                      selectedOrg.organization_type === 'church' ? 'e.g. Youth Ministry' :
                      selectedOrg.organization_type === 'school' ? 'e.g. SS 2' :
                      'e.g. General'
                    }
                    value={form.group_name}
                    onChange={e => updateForm({ group_name: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">
                    Short Name / Code *
                  </label>
                  <input
                    type="text"
                    placeholder={
                      selectedOrg.organization_type === 'university' ? 'e.g. CSC' :
                      selectedOrg.organization_type === 'church' ? 'e.g. YOUTH' :
                      selectedOrg.organization_type === 'school' ? 'e.g. SS2' :
                      'e.g. GEN'
                    }
                    value={form.group_short_name}
                    onChange={e => updateForm({ group_short_name: e.target.value.toUpperCase().slice(0, 10) })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                    maxLength={10}
                  />
                  {/* Conflict check */}
                  {form.group_short_name && existingGroups.some(g => g.short_name.toUpperCase() === form.group_short_name.toUpperCase()) && (
                    <p className="mt-1 text-xs text-red-400">
                      This short name is already taken in {selectedOrg.short_name}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">
                    Description (optional)
                  </label>
                  <textarea
                    placeholder={`Brief description of this ${getGroupLabel().toLowerCase()}...`}
                    value={form.description}
                    onChange={e => updateForm({ description: e.target.value })}
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors resize-none"
                  />
                </div>

                {/* Existing departments reminder */}
                {existingGroups.length > 0 && (
                  <div
                    className="p-3 rounded-xl text-xs"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <p className="font-medium mb-1" style={{ color: colors.textSecondary }}>
                      Existing {getGroupLabel()}s in {selectedOrg.short_name}:
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {existingGroups.map(g => (
                        <span key={g.id} className="px-2 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.06)', color: colors.textTertiary }}>
                          {g.short_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ========== STEP 3: Admin Account ========== */}
          {step === 3 && selectedOrg && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.primary}20` }}>
                  <Sparkles size={20} style={{ color: colors.primary }} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Your Admin Account</h2>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>
                    You&apos;ll manage the {form.group_name || getGroupLabel().toLowerCase()} in {selectedOrg.short_name}
                  </p>
                </div>
              </div>
              <div className="space-y-4 mt-6">
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. John Doe"
                    value={form.owner_name}
                    onChange={e => updateForm({ owner_name: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Login ID *</label>
                  <input
                    type="text"
                    placeholder={
                      selectedOrg.organization_type === 'university' ? 'e.g. CSC/2020/001' : 'e.g. ADMIN001'
                    }
                    value={form.owner_member_id}
                    onChange={e => updateForm({ owner_member_id: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                  />
                  <p className="mt-1 text-xs" style={{ color: colors.textTertiary }}>
                    This is what you&apos;ll use to log in.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Password *</label>
                  <input
                    type="password"
                    placeholder="At least 6 characters"
                    value={form.owner_password}
                    onChange={e => updateForm({ owner_password: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Confirm Password *</label>
                  <input
                    type="password"
                    placeholder="Repeat your password"
                    value={form.owner_password_confirm}
                    onChange={e => updateForm({ owner_password_confirm: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                  />
                </div>

                {/* Summary Card */}
                <div className="mt-4 rounded-2xl overflow-hidden" style={{ border: `1px solid ${colors.borderPrimary}` }}>
                  <div className="px-4 py-3 flex items-center gap-3" style={{ background: `linear-gradient(135deg, ${colors.primary}18, ${colors.primary}08)` }}>
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold"
                      style={{ background: selectedOrg.primary_color || colors.primary }}
                    >
                      {selectedOrg.short_name?.slice(0, 2) || 'ORG'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{selectedOrg.name}</p>
                      <p className="text-[11px] flex items-center gap-1" style={{ color: colors.textTertiary }}>
                        <Globe size={10} />
                        payvexo.com/{selectedOrg.slug}
                      </p>
                    </div>
                  </div>

                  <div className="p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <FolderTree size={14} style={{ color: colors.textSecondary }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: colors.textTertiary }}>New {getGroupLabel()}</p>
                          <p className="text-xs text-white font-medium truncate">
                            {form.group_name} <span className="opacity-50">({form.group_short_name})</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <Sparkles size={14} style={{ color: colors.textSecondary }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: colors.textTertiary }}>Admin</p>
                          <p className="text-xs text-white font-medium truncate">{form.owner_name || '—'}</p>
                          <p className="text-[10px] truncate" style={{ color: colors.textTertiary }}>{form.owner_member_id || '—'}</p>
                        </div>
                      </div>
                    </div>
                    {form.parent_group_id && (
                      <div className="flex items-start gap-2.5 pt-1">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <Building2 size={14} style={{ color: colors.textSecondary }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: colors.textTertiary }}>Under</p>
                          <p className="text-xs text-white font-medium truncate">
                            {existingGroups.find(g => g.id === form.parent_group_id)?.name || '—'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Buttons */}
        <div className="flex gap-3 mt-8">
          {step > 1 && (
            <button
              onClick={prevStep}
              className="px-6 py-3 rounded-xl text-white font-medium transition-all hover:bg-white/5"
              style={{ border: `1px solid ${colors.borderLight}` }}
            >
              Back
            </button>
          )}
          {step === 1 && !selectedOrg ? (
            /* Can't continue without selecting an org */
            <button
              onClick={() => navigate('/create')}
              className="flex-1 px-6 py-3 rounded-xl text-white font-medium flex items-center justify-center gap-2 transition-all hover:bg-white/5"
              style={{ border: `1px solid ${colors.borderLight}` }}
            >
              Create New Organization Instead
              <ArrowRight size={18} />
            </button>
          ) : (
            <button
              onClick={step === totalSteps ? handleSubmit : nextStep}
              disabled={loading || (step === 1 && !selectedOrg)}
              className="flex-1 px-6 py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
              style={{ background: colors.primary }}
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Creating {getGroupLabel()}...
                </>
              ) : step === totalSteps ? (
                <>
                  Create {getGroupLabel()}
                  <Check size={18} />
                </>
              ) : (
                <>
                  Continue
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          )}
        </div>

        {/* Footer link */}
        {step === 1 && (
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/create')}
              className="text-xs transition-colors hover:underline"
              style={{ color: colors.textTertiary }}
            >
              Don&apos;t see your organization? Create a new one
            </button>
          </div>
        )}
      </motion.div>
    </PageWrapper>
  );
}
