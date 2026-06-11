/**
 * CreateOrganizationPage - Multi-step onboarding for new organizations
 * Accessed via /create
 */

import { useState, useEffect, useMemo } from 'react';
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
  Sparkles,
  Search,
} from 'lucide-react';
import { colors } from '@/config/colors';
import { APP_NAME } from '@/config/constants';
import { organizationService } from '@/services/organizationService';
import { supabase } from '@/config/supabase';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { multiTenantAuthService } from '@/services/multiTenantAuthService';
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown';
import Checkbox from '@/components/ui/Checkbox';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
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
  // Model-B "set" identity for the founder's first class.
  entry_year: string;
  course_duration: string;
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
  const { theme } = useTheme();
  // Theme tokens for the page chrome. Drops the dark-only `colors`
  // const in favour of the same getDashboardTokens the exec dashboards
  // use — gives us light + dark parity and the soft-blob look that
  // matches the rest of the app.
  const tt = useMemo(() => getDashboardTokens(theme), [theme]);
  const isLight = theme === 'light';
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [ownerAcknowledged, setOwnerAcknowledged] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

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
    entry_year: String(new Date().getFullYear()),
    course_duration: '4',
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
  // Steps: type → details → [academic shape] → group → owner → review.
  // The review step is always the last; previous step indices used to
  // submit straight from owner, but a final "this is your org, look
  // it over" screen catches bad slugs / typos before money-locking
  // the founder claim. Bumped by +1 vs the legacy 4/5 count.
  const totalSteps = isAcademic ? 6 : 5;
  const reviewStep = totalSteps;

  // Check if user is authorized to create organizations
  // This runs on component mount
  const checkAuthorizationStatus = async () => {
    try {
      // For now, allow anyone to create organizations (platform is open)
      // In future, you can add checks like:
      // - Require authentication: const session = await supabase.auth.getSession();
      // - Check for specific role/permission
      // - Verify email domain whitelist
      // - Require invitation code
      
      // Environment-based restriction example:
      const restrictCreation = import.meta.env.VITE_RESTRICT_ORG_CREATION === 'true';
      if (restrictCreation) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setAccessDenied(true);
          return;
        }
      }
      
      setAuthChecked(true);
    } catch (err) {
      console.error('Error checking authorization:', err);
      setAuthChecked(true); // Allow access even if check fails (graceful degradation)
    }
  };

  // Run authorization check on mount
  useEffect(() => {
    checkAuthorizationStatus();
  }, []);

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

  const checkEmailAvailability = async (email: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setEmailAvailable(null);
      return;
    }

    setCheckingEmail(true);
    try {
      const available = await organizationService.isEmailAvailable(normalizedEmail);
      setEmailAvailable(available);
    } catch {
      setEmailAvailable(null);
    } finally {
      setCheckingEmail(false);
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
        // Org contact email may be shared across orgs (same founder) — not blocked.
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
        if (form.organization_type === 'university' && !ownerAcknowledged) {
          setError('Please confirm that you are authorized to create this university.');
          return false;
        }
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

    // If the founder is already signed in (creating a SECOND org), remember
    // their current membership so we can link the new org to the same account.
    const previousMemberId = (() => {
      try { return localStorage.getItem('pvx_member_id'); } catch { return null; }
    })();

    try {
      // Org contact email is just contact info now — multiple orgs (often run by
      // the same person) may share it, so we no longer block on it being reused.

      // Determine owner/group levels to pass to service (academic level when applicable)
      let ownerLevels: string[] | undefined = undefined;
      if (isAcademic && form.academic_scope === 'level') {
        const academicLevelRaw = form.academic_level === '__custom__' ? form.custom_level : (form.academic_level || '');
        const canon = organizationService.canonicalizeLevel(academicLevelRaw);
        if (canon) ownerLevels = [canon];
      }

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
        levels: ownerLevels,
      });

      if (result?.slug) {
        // Global identity: link the new org's founder membership to the
        // creator's existing account so both show in the org switcher.
        if (previousMemberId && result.member_id) {
          await multiTenantAuthService.attachMembershipToAccount(previousMemberId, result.member_id);
        }

        // Save academic info to organization_settings.custom_settings if applicable
        if (isAcademic && form.academic_scope && result.organization_id) {
          const academicLevelRaw = form.academic_level === '__custom__' ? form.custom_level : (form.academic_level || '');
          const academicData = {
            academic_scope: form.academic_scope,
            academic_level: organizationService.canonicalizeLevel(academicLevelRaw) || null,
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

            // The first group is a class only in 'level' scope — seed its
            // Model-B set identity (entry year + course length) so the
            // level-timeline works from day one. RPC because the founder
            // isn't logged in yet (RLS would block a direct update).
            if (form.academic_scope === 'level' && result.member_id) {
              const ey = parseInt(form.entry_year, 10);
              const cd = parseInt(form.course_duration, 10);
              try {
                await supabase.rpc('set_group_set_fields', {
                  p_group_id: result.group_id,
                  p_caller_member_id: result.member_id,
                  p_entry_year: Number.isFinite(ey) ? ey : new Date().getFullYear(),
                  p_current_level: organizationService.canonicalizeLevel(academicLevelRaw) || null,
                  p_course_duration: Number.isFinite(cd) ? cd : 4,
                });
              } catch { /* best-effort */ }
            }
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

  // Friendly labels for each step — surfaced in the chip, the stepper
  // tooltips, and the live preview's "you are here" hint. Keeping
  // them centralised so the four touchpoints stay in sync.
  const stepLabel = (n: number): string => {
    if (n === 1) return 'Type';
    if (n === 2) return 'Details';
    if (isAcademic && n === academicStep) return 'Academic shape';
    if (n === groupStep) return form.organization_type === 'university'
      ? 'Your department' : form.organization_type === 'school'
      ? 'Your class' : 'First group';
    if (n === ownerStep) return 'Owner account';
    if (n === reviewStep) return 'Review';
    return `Step ${n}`;
  };

  // Subtitle that explains the step in one line. Same source of
  // truth as the H2 inside each step body, just promoted to the
  // hero for instant context.
  const stepHelp = (n: number): string => {
    if (n === 1) return 'Tell us what kind of organisation this is — we tune everything else around the answer.';
    if (n === 2) return 'Name it, give it a URL handle, pick a contact channel.';
    if (isAcademic && n === academicStep) return 'How is your school organised? By level or by faculty/department?';
    if (n === groupStep) return form.organization_type === 'university'
      ? 'Most owners are in one department to begin with. Pick yours.'
      : 'Your first internal unit — the place dues are collected at by default.';
    if (n === ownerStep) return 'Set up the account you\'ll use to sign in and run the org.';
    if (n === reviewStep) return 'Last look. Confirm the choices below before we set up your org.';
    return '';
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden py-6 px-4"
      style={{ background: tt.bgWash, color: tt.text }}
    >
      {/* Soft brand blobs — same look as the exec dashboards. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 w-[520px] h-[520px] rounded-full"
        style={{ background: tt.blob1, filter: 'blur(120px)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-32 w-[420px] h-[420px] rounded-full"
        style={{ background: tt.blob2, filter: 'blur(110px)' }}
      />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6">
        {/* Access Denied — early-out card */}
        {accessDenied && (
          <div className="p-5 rounded-2xl" style={{ background: `${tt.danger}10`, border: `1px solid ${tt.danger}40` }}>
            <p className="font-bold mb-1" style={{ color: tt.danger }}>Access denied</p>
            <p className="text-sm" style={{ color: tt.textSec }}>
              Organisation creation is currently restricted. Please contact platform support.
            </p>
            <button
              onClick={() => navigate('/')}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
              style={{ background: `${tt.danger}18`, color: tt.danger, border: `1px solid ${tt.danger}40` }}
            >
              Return home
            </button>
          </div>
        )}

        {/* Auth check loading */}
        {!authChecked && (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin mb-3" style={{ color: tt.primary }} />
            <p className="text-sm" style={{ color: tt.textSec }}>Verifying access…</p>
          </div>
        )}

        {/* Main wizard — only when auth check is green */}
        {authChecked && !accessDenied && (
        <>
        {/* ── Header ──────────────────────────────────────────── */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => step > 1 ? prevStep() : navigate('/')}
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
                style={{ color: tt.textTer }}
              >
                <ArrowLeft className="w-3 h-3" />
                {step > 1 ? 'Back' : 'Home'}
              </button>
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-1 rounded-full"
                style={{ background: tt.primarySoft, color: tt.primary, border: `1px solid ${tt.primaryRing}` }}
              >
                <Sparkles className="w-3 h-3" />
                Create {APP_NAME} organisation
              </span>
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: tt.textTer }}
              >
                Step {step}/{totalSteps} · {stepLabel(step)}
              </span>
            </div>
          </div>

          <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight" style={{ color: tt.text }}>
            {stepLabel(step)}
          </h1>
          <p className="text-sm max-w-2xl" style={{ color: tt.textSec }}>
            {stepHelp(step)}
          </p>

          {/* Stepper — segments fill as the user advances. Active
              segment has a brand-soft glow; future segments are flat. */}
          <div className="flex gap-1.5 pt-1">
            {Array.from({ length: totalSteps }, (_, i) => {
              const n = i + 1;
              const done = n < step;
              const active = n === step;
              return (
                <div
                  key={n}
                  className="flex-1 h-1.5 rounded-full transition-all duration-300"
                  style={{
                    background: done || active ? tt.primary : (isLight ? 'rgba(15,7,3,0.08)' : 'rgba(255,255,255,0.08)'),
                    boxShadow: active ? `0 0 12px ${tt.primary}50` : 'none',
                    opacity: done ? 0.7 : 1,
                  }}
                  aria-label={`${stepLabel(n)} ${active ? '(current)' : done ? '(complete)' : '(upcoming)'}`}
                />
              );
            })}
          </div>
        </motion.header>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="p-3 rounded-xl text-sm"
              style={{ background: `${tt.danger}12`, border: `1px solid ${tt.danger}38`, color: tt.danger }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 2-column: step body on the left, live preview on the right.
            Desktop sees both side-by-side; mobile collapses to a
            single column with the preview sliding in BELOW the form
            (no sticky on mobile — that would compete with the keyboard). */}
        <div className="grid lg:grid-cols-[1fr_340px] gap-6 lg:items-start">
        <div
          className="rounded-2xl p-5 sm:p-6"
          style={{ background: tt.card, border: `1px solid ${tt.cardBorder}` }}
        >

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
                  <label className="block text-sm font-medium text-white mb-1.5">Contact Email</label>
                  <div className="flex items-center bg-white/5 border border-white/10 rounded-xl overflow-hidden focus-within:border-[#FF6803] transition-colors">
                    <input
                      type="email"
                      placeholder="e.g. info@unilag.edu.ng"
                      value={form.email}
                      onChange={e => {
                        const email = e.target.value;
                        updateForm({ email });
                        setEmailAvailable(null);
                      }}
                      onBlur={() => void checkEmailAvailability(form.email)}
                      className="w-full bg-transparent px-4 py-3 text-white placeholder-gray-500 outline-none"
                    />
                    <div className="pr-3 shrink-0">
                      {checkingEmail && <Loader2 size={16} className="animate-spin text-gray-400" />}
                      {!checkingEmail && emailAvailable === true && <Check size={16} className="text-green-400" />}
                      {!checkingEmail && emailAvailable === false && <span className="text-[11px] text-amber-400">In use elsewhere</span>}
                    </div>
                  </div>
                  <p className="mt-1 text-xs" style={{ color: colors.textTertiary }}>
                    Optional contact email. The same email can be reused if you run more than one organization.
                  </p>
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

                    {/* Your set's identity — so the level-timeline works
                        from day one. The level above is where you are NOW;
                        these say which set you are + how long the course
                        runs (for graduation). */}
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <ProfessionalDropdown
                        label="Year of entry"
                        value={form.entry_year}
                        onChange={(v) => updateForm({ entry_year: v as string })}
                        options={(() => { const y = new Date().getFullYear(); return [2,1,0,-1,-2,-3].map(d => ({ value: String(y-d), label: String(y-d) })); })()}
                        variant="outlined" size="md"
                      />
                      <ProfessionalDropdown
                        label="Course length"
                        value={form.course_duration}
                        onChange={(v) => updateForm({ course_duration: v as string })}
                        options={[3,4,5,6,7].map(n => ({ value: String(n), label: `${n} years` }))}
                        variant="outlined" size="md"
                      />
                    </div>
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

                {/* Academic Year — custom dropdown of sessions */}
                {form.academic_scope && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                    <ProfessionalDropdown
                      label="Academic Session / Year *"
                      value={form.academic_year}
                      onChange={(v) => updateForm({ academic_year: v as string })}
                      options={(() => {
                        // A rolling window of sessions around now (yr-2 … yr+2)
                        // covers every realistic case; searchable for the rest.
                        const yr = new Date().getFullYear();
                        return [-2, -1, 0, 1, 2].map((d) => {
                          const s = `${yr + d}/${yr + d + 1}`;
                          return { value: s, label: d === 0 ? `${s} (current)` : s };
                        });
                      })()}
                      placeholder="Select session"
                      searchable
                      variant="outlined"
                      size="md"
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
                  <h2 className="text-lg font-semibold text-white">{form.organization_type === 'university' ? 'Institution Owner Account' : 'Your Admin Account'}</h2>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>
                    {form.organization_type === 'university'
                      ? 'University creation requires an authorized owner account.'
                      : 'You will have full access as the organization owner.'}
                  </p>
                </div>
              </div>
              <div className="space-y-4 mt-6">
                {form.organization_type === 'university' && (
                  <Checkbox
                    checked={ownerAcknowledged}
                    onChange={(e) => setOwnerAcknowledged(e.target.checked)}
                    label={(
                      <span>
                        I confirm I am authorized to create and manage this university.
                      </span>
                    )}
                    helperText="This keeps the onboarding flow clear and accountable."
                  />
                )}
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

          {/* ── STEP: Review and confirm ───────────────────────────
              Final sanity check before we provision the org. Shows
              every key choice so the user can spot a typo (especially
              the slug, which becomes part of the URL) before submit.
              The right-column LivePreview already shows most of this,
              but this on-page summary is the explicit "look it over"
              moment — and important on mobile, where the preview is
              below the form and easy to miss. */}
          {step === reviewStep && (
            <motion.div
              key="step-review"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <h2 className="text-lg font-extrabold tracking-tight mb-1" style={{ color: tt.text }}>
                Look it over
              </h2>
              <p className="text-sm mb-5" style={{ color: tt.textSec }}>
                Once you create the organisation, the slug stays — it's
                part of every URL members will see. Confirm everything
                reads right.
              </p>

              <div className="space-y-3">
                <ReviewRow label="Organisation" value={form.name} extra={form.short_name ? `(${form.short_name.toUpperCase()})` : ''} tt={tt} />
                <ReviewRow label="URL slug" value={form.slug ? `${APP_NAME.toLowerCase()}.app/${form.slug.trim().toLowerCase()}` : '—'} mono tt={tt} />
                <ReviewRow label="Type" value={ORG_TYPE_OPTIONS.find(o => o.type === form.organization_type)?.label || '—'} tt={tt} />
                {form.email && <ReviewRow label="Contact email" value={form.email} tt={tt} />}
                {form.country && <ReviewRow label="Country" value={`${form.country} · ${form.currency_code}`} tt={tt} />}

                {isAcademic && form.academic_scope && (
                  <>
                    <ReviewRow
                      label="Academic shape"
                      value={form.academic_scope === 'level' ? 'Single level' : 'Faculty + departments'}
                      tt={tt}
                    />
                    {form.academic_year && (
                      <ReviewRow label="Academic year" value={form.academic_year} tt={tt} />
                    )}
                    {form.academic_scope === 'level' && (
                      <ReviewRow
                        label="Level"
                        value={form.academic_level === '__custom__' ? form.custom_level : form.academic_level}
                        tt={tt}
                      />
                    )}
                    {form.academic_scope === 'faculty' && (
                      <ReviewRow
                        label="Faculty"
                        value={form.faculty === '__custom__' ? form.custom_faculty : form.faculty}
                        tt={tt}
                      />
                    )}
                  </>
                )}

                <ReviewRow
                  label="First group"
                  value={form.group_name}
                  extra={form.group_short_name ? `(${form.group_short_name.toUpperCase()})` : ''}
                  tt={tt}
                />
                <ReviewRow label="Owner name" value={form.owner_name} tt={tt} />
                <ReviewRow label="Owner sign-in ID" value={form.owner_member_id} mono tt={tt} />
              </div>

              {/* What happens next — sets the right expectation about
                  the Layer-2 acting state. Without this banner a
                  founder hits the dashboard and wonders why money is
                  locked. */}
              <div
                className="mt-5 p-3 rounded-xl text-xs"
                style={{
                  background: `${tt.amber}12`,
                  border: `1px solid ${tt.amber}38`,
                  color: tt.amber,
                }}
              >
                <p className="font-bold mb-1">What happens next</p>
                <p style={{ color: tt.textSec }}>
                  You'll land in your new org as an <strong style={{ color: tt.text }}>acting owner</strong>.
                  Setup (groups, theme, invites) is unlocked immediately.
                  Collecting dues, payouts, and billing unlock once your
                  founder claim is verified — peer votes or platform review.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        </div>{/* /step body card */}

          {/* Right-column live preview. Desktop: sticky to the top so
              it stays visible as the form column scrolls. Mobile: a
              normal-flow card below the form, so the keyboard doesn't
              fight it. */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <LivePreview form={form} step={step} totalSteps={totalSteps} isAcademic={isAcademic} tt={tt} />
          </aside>
        </div>{/* /grid */}

        {/* Footer: Back + Continue/Create. Matches the chip-button
            style of the exec dashboards (no shadow-lg, no gradients). */}
        <div className="flex justify-between gap-3 pt-1">
          {step > 1 ? (
            <button
              type="button"
              onClick={prevStep}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
              style={{
                background: tt.card,
                color: tt.text,
                border: `1px solid ${tt.cardBorder}`,
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : <span />}
          <button
            type="button"
            onClick={step === reviewStep ? handleSubmit : nextStep}
            disabled={loading || (form.organization_type === 'university' && step === ownerStep && !ownerAcknowledged)}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60"
            style={{
              background: tt.primary,
              color: '#FFFFFF',
              border: `1px solid ${tt.primary}`,
            }}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating…
              </>
            ) : step === reviewStep ? (
              <>
                Create organisation
                <Check className="w-4 h-4" />
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
        </>
        )}
      </div>{/* /max-w-5xl */}
    </div>
  );
}

/**
 * LivePreview — sticky right-column card that mirrors the user's
 * choices in real time. Shows the avatar, name, slug, URL preview,
 * org type, and (when filled) the first group + owner. The point
 * is to make the wizard feel CONNECTED — every keystroke updates
 * a tangible artefact the user is building.
 */
function LivePreview({
  form, step, totalSteps, isAcademic, tt,
}: {
  form: FormData;
  step: number;
  totalSteps: number;
  isAcademic: boolean;
  tt: ReturnType<typeof getDashboardTokens>;
}) {
  const initial = (form.short_name || form.name || '?').charAt(0).toUpperCase();
  const typeLabel = ORG_TYPE_OPTIONS.find(o => o.type === form.organization_type)?.label || '—';
  const url = form.slug.trim() ? `${APP_NAME.toLowerCase()}.app/${form.slug.trim().toLowerCase()}` : '—';

  return (
    <div
      className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
      style={{ background: tt.card, border: `1px solid ${tt.cardBorder}` }}
    >
      <span
        aria-hidden
        className="absolute -right-10 -top-10 w-32 h-32 rounded-full pointer-events-none"
        style={{ background: tt.blob1, filter: 'blur(40px)' }}
      />
      <div className="relative">
        <p className="text-[10px] uppercase tracking-[0.18em] font-bold mb-3" style={{ color: tt.primary }}>
          Live preview
        </p>

        {/* Avatar + name */}
        <div className="flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-extrabold"
            style={{ background: tt.primarySoft, color: tt.primary, border: `1px solid ${tt.primaryRing}` }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-extrabold truncate" style={{ color: tt.text }}>
              {form.name || 'Your organisation'}
            </p>
            <p className="text-[11px] truncate" style={{ color: tt.textTer }}>
              {typeLabel}
              {form.short_name ? ` · ${form.short_name.toUpperCase()}` : ''}
            </p>
          </div>
        </div>

        {/* URL chip */}
        <div className="mt-4">
          <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: tt.textTer }}>
            URL
          </p>
          <p
            className="text-xs font-mono px-3 py-2 rounded-lg truncate"
            style={{
              background: tt.primarySoft,
              color: tt.primary,
              border: `1px solid ${tt.primaryRing}`,
            }}
          >
            {url}
          </p>
        </div>

        {/* Academic shape — surfaces once a value is chosen */}
        {isAcademic && form.academic_scope && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: tt.textTer }}>
              Academic shape
            </p>
            <p className="text-xs" style={{ color: tt.text }}>
              {form.academic_scope === 'level' ? 'Single level' : 'Faculty + departments'}
              {form.academic_year ? ` · ${form.academic_year}` : ''}
            </p>
          </div>
        )}

        {/* First group */}
        {form.group_name && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: tt.textTer }}>
              First group
            </p>
            <p className="text-xs" style={{ color: tt.text }}>
              {form.group_name}
              {form.group_short_name ? ` (${form.group_short_name.toUpperCase()})` : ''}
            </p>
          </div>
        )}

        {/* Owner */}
        {form.owner_name && (
          <div className="mt-4">
            <p className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: tt.textTer }}>
              Owner
            </p>
            <p className="text-xs font-bold" style={{ color: tt.text }}>{form.owner_name}</p>
            {form.owner_member_id && (
              <p className="text-[11px] font-mono mt-0.5" style={{ color: tt.textTer }}>
                {form.owner_member_id}
              </p>
            )}
          </div>
        )}

        {/* "You are here" */}
        <div
          className="mt-5 pt-4 text-[10px] flex items-center justify-between"
          style={{ borderTop: `1px solid ${tt.cardBorder}`, color: tt.textTer }}
        >
          <span className="uppercase tracking-wider font-bold">Progress</span>
          <span>{step} / {totalSteps}</span>
        </div>
      </div>
    </div>
  );
}

function ReviewRow({
  label, value, extra, mono, tt,
}: {
  label: string;
  value: string;
  extra?: string;
  mono?: boolean;
  tt: ReturnType<typeof getDashboardTokens>;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2" style={{ borderBottom: `1px dashed ${tt.cardBorder}` }}>
      <span className="text-[11px] uppercase tracking-wider font-bold shrink-0" style={{ color: tt.textTer }}>
        {label}
      </span>
      <span
        className={`text-sm font-semibold text-right truncate ${mono ? 'font-mono' : ''}`}
        style={{ color: value && value !== '—' ? tt.text : tt.textTer }}
      >
        {value || '—'} {extra && <span className="font-normal" style={{ color: tt.textTer }}>{extra}</span>}
      </span>
    </div>
  );
}
