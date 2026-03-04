/**
 * CreateOrganizationPage - Multi-step onboarding for new organizations
 * Accessed via /create
 */

import { useState } from 'react';
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
  Landmark,
  Heart,
  Check,
  Loader2,
  BookOpen,
  School,
  Calendar,
  Sparkles,
  Search,
} from 'lucide-react';
import { colors } from '@/config/colors';
import { APP_NAME } from '@/config/constants';
import { organizationService } from '@/services/organizationService';
import { supabase } from '@/config/supabase';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import PageWrapper from '@/components/ui/PageWrapper';
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown';
import type { OrganizationType } from '@/config/constants';

const ORG_TYPE_OPTIONS: { type: OrganizationType; label: string; icon: React.ReactNode; desc: string }[] = [
  { type: 'university', label: 'University', icon: <GraduationCap size={28} />, desc: 'Departments, levels, semesters' },
  { type: 'school', label: 'School', icon: <GraduationCap size={28} />, desc: 'Classes, terms, sessions' },
  { type: 'church', label: 'Church', icon: <Church size={28} />, desc: 'Ministries, tithes, offerings' },
  { type: 'club', label: 'Club', icon: <Users size={28} />, desc: 'Memberships, events, dues' },
  { type: 'association', label: 'Association', icon: <Landmark size={28} />, desc: 'Chapters, levies, welfare' },
  { type: 'cooperative', label: 'Cooperative', icon: <Building2 size={28} />, desc: 'Savings, contributions, shares' },
  { type: 'ngo', label: 'NGO', icon: <Heart size={28} />, desc: 'Programs, donors, grants' },
  { type: 'other', label: 'Other', icon: <Globe size={28} />, desc: 'Custom configuration' },
];

interface FormData {
  organization_type: OrganizationType;
  name: string;
  short_name: string;
  slug: string;
  email: string;
  phone: string;
  country: string;
  currency_code: string;
  // Academic fields (university/school only)
  academic_scope: 'level' | 'faculty' | '';
  academic_level: string;
  custom_level: string;
  academic_year: string;
  faculty: string;
  custom_faculty: string;
  department: string;
  custom_department: string;
  // Group / Owner
  group_name: string;
  group_short_name: string;
  owner_name: string;
  owner_member_id: string;
  owner_password: string;
  owner_password_confirm: string;
}

const UNIVERSITY_LEVELS = ['100 Level', '200 Level', '300 Level', '400 Level', '500 Level', '600 Level', '700 Level'];
const SCHOOL_LEVELS = ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6', 'JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'];
const FACULTIES = [
  'Faculty of Engineering',
  'Faculty of Science',
  'Faculty of Arts',
  'Faculty of Social Sciences',
  'Faculty of Medicine',
  'Faculty of Law',
  'Faculty of Education',
  'Faculty of Agriculture',
  'Faculty of Management Sciences',
  'Faculty of Environmental Sciences',
  'Faculty of Pharmacy',
  'Faculty of Technology',
  'Faculty of Health Sciences',
  'Faculty of Veterinary Medicine',
  'School of Postgraduate Studies',
];

export default function CreateOrganizationPage() {
  const navigate = useNavigate();
  const { login } = useMultiTenantAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

  const [form, setForm] = useState<FormData>({
    organization_type: '' as OrganizationType,
    name: '',
    short_name: '',
    slug: '',
    email: '',
    phone: '',
    country: 'Nigeria',
    currency_code: 'NGN',
    academic_scope: '',
    academic_level: '',
    custom_level: '',
    academic_year: '',
    faculty: '',
    custom_faculty: '',
    department: '',
    custom_department: '',
    group_name: '',
    group_short_name: '',
    owner_name: '',
    owner_member_id: '',
    owner_password: '',
    owner_password_confirm: '',
  });

  const isAcademic = form.organization_type === 'university' || form.organization_type === 'school';
  const totalSteps = isAcademic ? 5 : 4;

  const updateForm = (updates: Partial<FormData>) => {
    setForm(prev => ({ ...prev, ...updates }));
    setError('');
  };

  // Auto-generate slug from name
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50);
  };

  const checkSlugAvailability = async (slug: string) => {
    if (slug.length < 3) {
      setSlugAvailable(null);
      return;
    }
    setCheckingSlug(true);
    try {
      const available = await organizationService.isSlugAvailable(slug);
      setSlugAvailable(available);
    } catch {
      setSlugAvailable(null);
    } finally {
      setCheckingSlug(false);
    }
  };

  // Map logical step to actual step function
  const getLogicalStep = () => {
    if (!isAcademic) return step;
    return step; // 1=type, 2=details, 3=academic, 4=group, 5=owner
  };

  const groupStep = isAcademic ? 4 : 3;
  const ownerStep = isAcademic ? 5 : 4;
  const academicStep = 3; // Only used when isAcademic

  const validateStep = (): boolean => {
    const s = getLogicalStep();
    switch (s) {
      case 1:
        if (!form.organization_type) {
          setError('Please select an organization type');
          return false;
        }
        return true;
      case 2:
        if (!form.name.trim()) { setError('Organization name is required'); return false; }
        if (!form.short_name.trim()) { setError('Short name / abbreviation is required'); return false; }
        if (!form.slug.trim() || form.slug.length < 3) { setError('URL slug must be at least 3 characters'); return false; }
        if (slugAvailable === false) { setError('This URL is already taken'); return false; }
        return true;
      case academicStep:
        if (isAcademic) {
          if (!form.academic_scope) { setError('Please select the scope of your organization'); return false; }
          if (form.academic_scope === 'level' && !form.academic_level) { setError('Please select a level'); return false; }
          if (form.academic_scope === 'level' && form.academic_level === '__custom__' && !form.custom_level.trim()) { setError('Please enter your custom level name'); return false; }
          if (form.academic_scope === 'faculty' && !form.faculty && !form.custom_faculty.trim()) { setError('Please select or enter a faculty'); return false; }
          if (!form.academic_year.trim()) { setError('Academic year / session is required'); return false; }
          return true;
        }
        // Non-academic step 3 = group
        if (!form.group_name.trim()) { setError('Group name is required'); return false; }
        if (!form.group_short_name.trim()) { setError('Group short name is required'); return false; }
        return true;
      case groupStep:
        if (isAcademic) {
          if (!form.group_name.trim()) { setError('Group name is required'); return false; }
          if (!form.group_short_name.trim()) { setError('Group short name is required'); return false; }
          return true;
        }
        // Non-academic step 4 = owner  
        if (!form.owner_name.trim()) { setError('Your full name is required'); return false; }
        if (!form.owner_member_id.trim()) { setError('Your login ID is required'); return false; }
        if (!form.owner_password || form.owner_password.length < 6) { setError('Password must be at least 6 characters'); return false; }
        if (form.owner_password !== form.owner_password_confirm) { setError('Passwords do not match'); return false; }
        return true;
      case ownerStep:
        if (!form.owner_name.trim()) { setError('Your full name is required'); return false; }
        if (!form.owner_member_id.trim()) { setError('Your login ID is required'); return false; }
        if (!form.owner_password || form.owner_password.length < 6) { setError('Password must be at least 6 characters'); return false; }
        if (form.owner_password !== form.owner_password_confirm) { setError('Passwords do not match'); return false; }
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
    if (!validateStep()) return;
    setLoading(true);
    setError('');

    try {
      const result = await organizationService.create({
        name: form.name.trim(),
        short_name: form.short_name.trim().toUpperCase(),
        slug: form.slug.trim().toLowerCase(),
        organization_type: form.organization_type,
        email: form.email || undefined,
        phone: form.phone || undefined,
        country: form.country,
        currency_code: form.currency_code,
        currency_symbol: form.currency_code === 'NGN' ? '₦' : form.currency_code === 'USD' ? '$' : form.currency_code === 'GBP' ? '£' : form.currency_code,
      }, {
        group_name: form.group_name.trim(),
        group_short_name: form.group_short_name.trim().toUpperCase(),
        owner_name: form.owner_name.trim(),
        owner_member_id: form.owner_member_id.trim(),
        owner_password: form.owner_password,
      });

      if (result?.slug) {
        // Save academic info to organization_settings.custom_settings if applicable
        if (isAcademic && form.academic_scope && result.organization_id) {
          const academicData = {
            academic_scope: form.academic_scope,
            academic_level: form.academic_level === '__custom__' ? form.custom_level : (form.academic_level || null),
            academic_year: form.academic_year || null,
            faculty: form.faculty === '__custom__' ? form.custom_faculty : (form.faculty || null),
          };
          // Store in custom_settings JSONB under 'academic' key
          const { data: existingSettings } = await supabase
            .from('organization_settings')
            .select('custom_settings')
            .eq('organization_id', result.organization_id)
            .single();
          const currentCustom = (existingSettings?.custom_settings as Record<string, unknown>) || {};
          await supabase
            .from('organization_settings')
            .update({ custom_settings: { ...currentCustom, academic: academicData } })
            .eq('organization_id', result.organization_id);
          // Also update the group's description with academic context
          if (result.group_id) {
            const desc = form.academic_scope === 'level'
              ? `${form.academic_level === '__custom__' ? form.custom_level : form.academic_level} - ${form.academic_year}`
              : `${form.faculty === '__custom__' ? form.custom_faculty : form.faculty} - ${form.academic_year}`;
            await supabase
              .from('organization_groups')
              .update({ description: desc })
              .eq('id', result.group_id);
          }
        }

        // Auto-login the owner after org creation
        try {
          const loginResult = await login(form.owner_member_id.trim(), form.owner_password, result.slug);
          if (loginResult.mustChangePassword) {
            navigate(`/${result.slug}/change-password`, { replace: true });
          } else {
            navigate(`/${result.slug}/dashboard`, { replace: true });
          }
        } catch {
          // If auto-login fails, fall back to login page
          navigate(`/${result.slug}/login`, { replace: true });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  // Get org-type-aware labels
  const groupLabel = form.organization_type === 'university' ? 'Department' :
    form.organization_type === 'church' ? 'Ministry / Unit' :
    form.organization_type === 'school' ? 'Class' : 'Group';

  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6">
      <motion.div
        className="w-full max-w-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-3 mb-8">
          <button
            onClick={() => step > 1 ? prevStep() : navigate('/')}
            className="p-2 rounded-xl hover:bg-white/5 transition-colors shrink-0"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-white truncate">Create Organization</h1>
            <p className="text-sm" style={{ color: colors.textTertiary }}>
              Step {step} of {totalSteps}
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-sm font-bold shrink-0" style={{ color: colors.primary }}>
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
          {/* STEP 1: Org Type */}
          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-lg font-semibold text-white mb-2">What type of organization?</h2>
              <p className="text-sm mb-6" style={{ color: colors.textTertiary }}>
                This helps us set up the right terminology and features.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {ORG_TYPE_OPTIONS.map(({ type, label, icon, desc }) => {
                  const selected = form.organization_type === type;
                  return (
                    <button
                      key={type}
                      onClick={() => updateForm({ organization_type: type })}
                      className="p-4 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                      style={{
                        background: selected ? `${colors.primary}15` : 'rgba(255,255,255,0.03)',
                        border: `1.5px solid ${selected ? colors.primary : 'rgba(255,255,255,0.08)'}`,
                      }}
                    >
                      <div className="mb-2" style={{ color: selected ? colors.primary : colors.textSecondary }}>
                        {icon}
                      </div>
                      <p className="font-medium text-white text-sm">{label}</p>
                      <p className="text-xs mt-1" style={{ color: colors.textTertiary }}>{desc}</p>
                    </button>
                  );
                })}
              </div>

              {/* Discovery Banner — link to join existing org */}
              <div
                className="mt-6 p-4 rounded-2xl cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.98]"
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px dashed rgba(255,255,255,0.12)',
                }}
                onClick={() => navigate('/join-org')}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${colors.primary}15` }}>
                    <Search size={20} style={{ color: colors.primary }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">Looking for an existing organization?</p>
                    <p className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>
                      Search and create a department, class, or ministry within it
                    </p>
                  </div>
                  <ArrowRight size={16} style={{ color: colors.primary }} />
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 2: Org Details */}
          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-lg font-semibold text-white mb-2">Organization Details</h2>
              <p className="text-sm mb-6" style={{ color: colors.textTertiary }}>
                Tell us about your {form.organization_type || 'organization'}.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Organization Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. University of Lagos"
                    value={form.name}
                    onChange={e => {
                      const name = e.target.value;
                      const slug = generateSlug(name);
                      updateForm({ name, slug });
                      checkSlugAvailability(slug);
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Short Name / Abbreviation *</label>
                  <input
                    type="text"
                    placeholder="e.g. UNILAG"
                    value={form.short_name}
                    onChange={e => updateForm({ short_name: e.target.value.toUpperCase().slice(0, 10) })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">URL Slug *</label>
                  <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-[#FF6803] transition-colors">
                    <span className="pl-4 text-sm shrink-0" style={{ color: colors.textTertiary }}>
                      payvexo.com/
                    </span>
                    <input
                      type="text"
                      value={form.slug}
                      onChange={e => {
                        const slug = generateSlug(e.target.value);
                        updateForm({ slug });
                        checkSlugAvailability(slug);
                      }}
                      className="flex-1 bg-transparent px-1 py-3 text-white outline-none"
                    />
                    <div className="pr-3">
                      {checkingSlug && <Loader2 size={16} className="animate-spin text-gray-400" />}
                      {!checkingSlug && slugAvailable === true && <Check size={16} className="text-green-400" />}
                      {!checkingSlug && slugAvailable === false && <span className="text-xs text-red-400">Taken</span>}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <ProfessionalDropdown
                      label="Country"
                      value={form.country}
                      onChange={(v) => {
                        const country = v as string;
                        const ccy = country === 'Nigeria' ? 'NGN' : country === 'Ghana' ? 'GHS' : country === 'Kenya' ? 'KES' : 'USD';
                        updateForm({ country, currency_code: ccy });
                      }}
                      options={[
                        { value: 'Nigeria', label: '🇳🇬 Nigeria' },
                        { value: 'Ghana', label: '🇬🇭 Ghana' },
                        { value: 'Kenya', label: '🇰🇪 Kenya' },
                        { value: 'South Africa', label: '🇿🇦 South Africa' },
                        { value: 'United States', label: '🇺🇸 United States' },
                        { value: 'United Kingdom', label: '🇬🇧 United Kingdom' },
                      ]}
                      searchable
                      variant="outlined"
                      size="md"
                    />
                  </div>
                  <div>
                    <ProfessionalDropdown
                      label="Currency"
                      value={form.currency_code}
                      onChange={(v) => updateForm({ currency_code: v as string })}
                      options={[
                        { value: 'NGN', label: '₦ NGN' },
                        { value: 'GHS', label: '₵ GHS' },
                        { value: 'KES', label: 'KSh KES' },
                        { value: 'ZAR', label: 'R ZAR' },
                        { value: 'USD', label: '$ USD' },
                        { value: 'GBP', label: '£ GBP' },
                      ]}
                      variant="outlined"
                      size="md"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP 3 (Academic Only): Academic Scope */}
          {isAcademic && step === academicStep && (
            <motion.div key="step-academic" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.primary}20` }}>
                  <BookOpen size={20} style={{ color: colors.primary }} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Academic Structure</h2>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>
                    {form.organization_type === 'university' ? 'Configure your university level setup' : 'Configure your school class setup'}
                  </p>
                </div>
              </div>

              <div className="space-y-5 mt-6">
                {/* Scope Selection */}
                <div>
                  <label className="block text-sm font-medium text-white mb-3">What scope is this organization for? *</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => updateForm({ academic_scope: 'level', faculty: '', custom_faculty: '', custom_level: '' })}
                      className="p-4 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                      style={{
                        background: form.academic_scope === 'level' ? `${colors.primary}15` : 'rgba(255,255,255,0.03)',
                        border: `1.5px solid ${form.academic_scope === 'level' ? colors.primary : 'rgba(255,255,255,0.08)'}`,
                      }}
                    >
                      <School size={24} className="mb-2" style={{ color: form.academic_scope === 'level' ? colors.primary : colors.textSecondary }} />
                      <p className="font-medium text-white text-sm">
                        {form.organization_type === 'university' ? 'Specific Level' : 'Specific Class'}
                      </p>
                      <p className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                        {form.organization_type === 'university' ? 'e.g. 200 Level CSC' : 'e.g. SS 2 Class'}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateForm({ academic_scope: 'faculty', academic_level: '', custom_level: '' })}
                      className="p-4 rounded-2xl text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
                      style={{
                        background: form.academic_scope === 'faculty' ? `${colors.primary}15` : 'rgba(255,255,255,0.03)',
                        border: `1.5px solid ${form.academic_scope === 'faculty' ? colors.primary : 'rgba(255,255,255,0.08)'}`,
                      }}
                    >
                      <Building2 size={24} className="mb-2" style={{ color: form.academic_scope === 'faculty' ? colors.primary : colors.textSecondary }} />
                      <p className="font-medium text-white text-sm">
                        {form.organization_type === 'university' ? 'Faculty / Department' : 'Whole School'}
                      </p>
                      <p className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                        {form.organization_type === 'university' ? 'e.g. Faculty of Engineering' : 'Manage all classes'}
                      </p>
                    </button>
                  </div>
                </div>

                {/* Level Selection (when scope = level) */}
                {form.academic_scope === 'level' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <ProfessionalDropdown
                      label={`Select ${form.organization_type === 'university' ? 'Level' : 'Class'} *`}
                      value={form.academic_level}
                      onChange={(v) => {
                        const val = v as string;
                        if (val === '__custom__') {
                          updateForm({ academic_level: '__custom__', custom_level: '' });
                        } else {
                          updateForm({ academic_level: val, custom_level: '' });
                        }
                      }}
                      options={[
                        ...(form.organization_type === 'university' ? UNIVERSITY_LEVELS : SCHOOL_LEVELS).map(level => ({
                          value: level,
                          label: level,
                        })),
                        { value: '__custom__', label: '✏️ Other (type your own)' },
                      ]}
                      placeholder={`Choose a ${form.organization_type === 'university' ? 'level' : 'class'}...`}
                      searchable
                      variant="outlined"
                      size="md"
                      icon={<School size={16} />}
                    />
                    {form.academic_level === '__custom__' && (
                      <input
                        type="text"
                        placeholder={`Enter custom ${form.organization_type === 'university' ? 'level' : 'class'} name`}
                        value={form.custom_level}
                        onChange={e => updateForm({ custom_level: e.target.value })}
                        className="w-full mt-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                      />
                    )}
                  </motion.div>
                )}

                {/* Faculty Selection (when scope = faculty) */}
                {form.academic_scope === 'faculty' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <ProfessionalDropdown
                      label={form.organization_type === 'university' ? 'Select Faculty *' : 'School Section *'}
                      value={form.faculty}
                      onChange={(v) => updateForm({ faculty: v as string, custom_faculty: '' })}
                      options={[
                        ...FACULTIES.map(f => ({ value: f, label: f })),
                        { value: '__custom__', label: '✏️ Other (type your own)' },
                      ]}
                      placeholder="Search or select a faculty..."
                      searchable
                      variant="outlined"
                      size="md"
                      icon={<Building2 size={16} />}
                    />
                    {form.faculty === '__custom__' && (
                      <input
                        type="text"
                        placeholder="Enter faculty or department name"
                        value={form.custom_faculty}
                        onChange={e => updateForm({ custom_faculty: e.target.value })}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                      />
                    )}
                  </motion.div>
                )}

                {/* Academic Year */}
                {form.academic_scope && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <label className="block text-sm font-medium text-white mb-1.5">
                      <Calendar size={14} className="inline mr-1.5 -mt-0.5" />
                      Academic Session / Year *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2024/2025"
                      value={form.academic_year}
                      onChange={e => updateForm({ academic_year: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                    />
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}

          {/* GROUP STEP: First Group */}
          {step === groupStep && (
            <motion.div key="step-group" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.primary}20` }}>
                  <Users size={20} style={{ color: colors.primary }} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Create Your First {groupLabel}</h2>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>You can add more later. Members will be assigned here.</p>
                </div>
              </div>
              <div className="space-y-4 mt-6">
                {/* Auto-suggest from academic info */}
                {isAcademic && form.academic_scope === 'level' && form.academic_level && form.academic_level !== '__custom__' && !form.group_name && (
                  <div
                    className="p-3 rounded-xl text-sm cursor-pointer hover:scale-[1.01] transition-all"
                    style={{ background: `${colors.primary}10`, border: `1px dashed ${colors.primary}40` }}
                    onClick={() => {
                      const level = form.academic_level;
                      const shortLevel = level.replace(/\s*Level\s*/i, '').replace(/\s+/g, '');
                      updateForm({
                        group_name: level,
                        group_short_name: shortLevel.toUpperCase().slice(0, 10),
                      });
                    }}
                  >
                    <Sparkles size={14} className="inline mr-1.5" style={{ color: colors.primary }} />
                    <span style={{ color: colors.primary }}>Quick fill:</span>
                    <span className="text-white ml-1">Use &quot;{form.academic_level}&quot; as your group name</span>
                  </div>
                )}
                {/* Auto-suggest for custom level */}
                {isAcademic && form.academic_scope === 'level' && form.academic_level === '__custom__' && form.custom_level.trim() && !form.group_name && (
                  <div
                    className="p-3 rounded-xl text-sm cursor-pointer hover:scale-[1.01] transition-all"
                    style={{ background: `${colors.primary}10`, border: `1px dashed ${colors.primary}40` }}
                    onClick={() => {
                      const level = form.custom_level.trim();
                      const shortLevel = level.replace(/\s+/g, '').slice(0, 10);
                      updateForm({
                        group_name: level,
                        group_short_name: shortLevel.toUpperCase(),
                      });
                    }}
                  >
                    <Sparkles size={14} className="inline mr-1.5" style={{ color: colors.primary }} />
                    <span style={{ color: colors.primary }}>Quick fill:</span>
                    <span className="text-white ml-1">Use &quot;{form.custom_level}&quot; as your group name</span>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">{groupLabel} Name *</label>
                  <input
                    type="text"
                    placeholder={
                      form.organization_type === 'university' ? 'e.g. Computer Science' :
                      form.organization_type === 'church' ? 'e.g. Choir Ministry' :
                      'e.g. General'
                    }
                    value={form.group_name}
                    onChange={e => updateForm({ group_name: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Short Name / Code *</label>
                  <input
                    type="text"
                    placeholder={
                      form.organization_type === 'university' ? 'e.g. CSC' :
                      form.organization_type === 'church' ? 'e.g. CHOIR' :
                      'e.g. GEN'
                    }
                    value={form.group_short_name}
                    onChange={e => updateForm({ group_short_name: e.target.value.toUpperCase().slice(0, 10) })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                    maxLength={10}
                  />
                </div>
              </div>
            </motion.div>
          )}

          {/* OWNER STEP: Admin Account + Professional Summary */}
          {step === ownerStep && (
            <motion.div key="step-owner" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.primary}20` }}>
                  <Sparkles size={20} style={{ color: colors.primary }} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Your Admin Account</h2>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>You&apos;ll be the owner with full access.</p>
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
                      form.organization_type === 'university' ? 'e.g. CSC/2020/001' :
                      'e.g. ADMIN001'
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

                {/* Professional Summary Card */}
                <div className="mt-4 rounded-2xl overflow-hidden" style={{ border: `1px solid ${colors.borderPrimary}` }}>
                  {/* Summary Header */}
                  <div className="px-4 py-3 flex items-center gap-3" style={{ background: `linear-gradient(135deg, ${colors.primary}18, ${colors.primary}08)` }}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold" style={{ background: colors.primary }}>
                      {form.short_name?.slice(0, 2) || 'ORG'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{form.name || 'Organization'}</p>
                      <p className="text-[11px] flex items-center gap-1" style={{ color: colors.textTertiary }}>
                        <Globe size={10} />
                        payvexo.com/{form.slug || '...'}
                      </p>
                    </div>
                    <div
                      className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wide"
                      style={{ background: `${colors.primary}20`, color: colors.primary }}
                    >
                      {form.organization_type || 'org'}
                    </div>
                  </div>

                  {/* Summary Grid */}
                  <div className="p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          {ORG_TYPE_OPTIONS.find(o => o.type === form.organization_type)?.icon || <Building2 size={14} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: colors.textTertiary }}>Type</p>
                          <p className="text-xs text-white font-medium truncate capitalize">{form.organization_type}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <Globe size={14} style={{ color: colors.textSecondary }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: colors.textTertiary }}>Region</p>
                          <p className="text-xs text-white font-medium truncate">{form.country} · {form.currency_code}</p>
                        </div>
                      </div>
                    </div>

                    {/* Academic Info (if applicable) */}
                    {isAcademic && form.academic_scope && (
                      <div className="flex items-start gap-2.5 pt-1">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <BookOpen size={14} style={{ color: colors.textSecondary }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: colors.textTertiary }}>Academic</p>
                          <p className="text-xs text-white font-medium truncate">
                            {form.academic_scope === 'level' 
                              ? (form.academic_level === '__custom__' ? form.custom_level : form.academic_level) 
                              : (form.faculty === '__custom__' ? form.custom_faculty : form.faculty)}
                            {form.academic_year ? ` · ${form.academic_year}` : ''}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <Users size={14} style={{ color: colors.textSecondary }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: colors.textTertiary }}>{groupLabel}</p>
                          <p className="text-xs text-white font-medium truncate">{form.group_name} <span className="opacity-50">({form.group_short_name})</span></p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
                          <Sparkles size={14} style={{ color: colors.textSecondary }} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide font-medium" style={{ color: colors.textTertiary }}>Owner</p>
                          <p className="text-xs text-white font-medium truncate">{form.owner_name || '—'}</p>
                          <p className="text-[10px] truncate" style={{ color: colors.textTertiary }}>{form.owner_member_id || '—'}</p>
                        </div>
                      </div>
                    </div>
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
          <button
            onClick={step === totalSteps ? handleSubmit : nextStep}
            disabled={loading}
            className="flex-1 px-6 py-3 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
            style={{ background: colors.primary }}
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Creating...
              </>
            ) : step === totalSteps ? (
              <>
                Create Organization
                <Check size={18} />
              </>
            ) : (
              <>
                Continue
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </div>
      </motion.div>
    </PageWrapper>
  );
}
