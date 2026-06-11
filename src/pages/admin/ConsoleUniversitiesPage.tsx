/**
 * Platform Admin: University Management Console
 * Manage all organizations (universities, schools, etc.)
 *
 * Path: /pvx-console (embedded in PlatformConsolePage)
 * Auth: Platform Admin only
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Building2,
  Search,
  Eye,
  Edit,
  CheckCircle,
  AlertCircle,
  Calendar,
  Globe,
  Mail,
  Phone,
  RefreshCw,
  X,
  ChevronDown,
  ChevronUp,
  Users,
  Activity,
  Layers,
} from 'lucide-react';
import { organizationService } from '@/services/organizationService';
import { supabase } from '@/config/supabase';
import type { Organization } from '@/types/multiTenant';
import { consoleColors as colors, consoleGradients as gradients } from './consoleTheme';
import ConsoleStatCard from './ConsoleStatCard';

interface CreateFormData {
  name: string;
  short_name: string;
  organization_type: string;
  email: string;
  phone: string;
  country: string;
  currency_code: string;
  admin_email: string;
}

const ORG_TYPE_COLORS: Record<string, string> = {
  university:  '#8b5cf6',
  school:      '#3b82f6',
  church:      '#f59e0b',
  club:        '#06b6d4',
  association: '#10b981',
  cooperative: '#f97316',
  ngo:         '#ec4899',
};

// ── Form Field ──
function FormField({
  label,
  required,
  hint,
  children,
  colSpan = 1,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  colSpan?: 1 | 2;
}) {
  return (
    <div className={colSpan === 2 ? 'col-span-2' : ''}>
      <label className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: colors.textSecondary }}>
        {label}
        {required && <span style={{ color: colors.primary }}>*</span>}
      </label>
      {children}
      {hint && (
        <p className="text-[10px] mt-1" style={{ color: colors.textTertiary }}>
          {hint}
        </p>
      )}
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2.5 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40 transition-all';
const inputStyle = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
};

// ── Create Modal ──
function CreateModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'details' | 'contact' | 'admin'>('details');
  const [formData, setFormData] = useState<CreateFormData>({
    name: '',
    short_name: '',
    organization_type: 'university',
    email: '',
    phone: '',
    country: 'Nigeria',
    currency_code: 'NGN',
    admin_email: '',
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const set = (key: keyof CreateFormData) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setFormData((p) => ({ ...p, [key]: e.target.value }));

  const handleSubmit = async () => {
    if (!formData.name.trim()) return setMessage({ type: 'error', text: 'Organization name is required' });
    if (!formData.short_name.trim()) return setMessage({ type: 'error', text: 'Short name is required' });
    if (!formData.admin_email.trim()) return setMessage({ type: 'error', text: 'Admin email is required' });

    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      await organizationService.create({
        name: formData.name.trim(),
        short_name: formData.short_name.trim().toUpperCase(),
        slug: formData.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        organization_type: formData.organization_type as any,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        country: formData.country,
        currency_code: formData.currency_code,
      });
      setMessage({ type: 'success', text: `"${formData.name}" created successfully` });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1400);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to create organization' });
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { key: 'details', label: 'Details',  icon: Building2 },
    { key: 'contact', label: 'Contact',  icon: Mail },
    { key: 'admin',   label: 'Admin',    icon: Users },
  ] as const;

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
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `${colors.primary}20` }}
            >
              <Plus className="w-4 h-4" style={{ color: colors.primary }} />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">New Organization</p>
              <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                Fill in the details below
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
            <X className="w-4 h-4" style={{ color: colors.textSecondary }} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
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
                className="p-3 rounded-xl text-xs flex items-center gap-2"
                style={{
                  background: message.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${message.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                  color: message.type === 'success' ? colors.success : colors.danger,
                }}
              >
                {message.type === 'success'
                  ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                  : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                {message.text}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Details tab */}
          {activeTab === 'details' && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Organization Name" required colSpan={2}>
                <input
                  type="text"
                  value={formData.name}
                  onChange={set('name')}
                  placeholder="e.g., Federal University of Technology"
                  className={inputCls}
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Short Name" required>
                <input
                  type="text"
                  value={formData.short_name}
                  onChange={set('short_name')}
                  placeholder="e.g., FUTO"
                  className={inputCls}
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Type">
                <select
                  value={formData.organization_type}
                  onChange={set('organization_type')}
                  className={inputCls}
                  style={inputStyle}
                >
                  {['university', 'school', 'church', 'club', 'association', 'cooperative', 'ngo'].map((t) => (
                    <option key={t} value={t} style={{ background: '#1a1a2e' }}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Currency">
                <select
                  value={formData.currency_code}
                  onChange={set('currency_code')}
                  className={inputCls}
                  style={inputStyle}
                >
                  <option value="NGN" style={{ background: '#1a1a2e' }}>NGN (₦)</option>
                  <option value="USD" style={{ background: '#1a1a2e' }}>USD ($)</option>
                  <option value="GBP" style={{ background: '#1a1a2e' }}>GBP (£)</option>
                  <option value="EUR" style={{ background: '#1a1a2e' }}>EUR (€)</option>
                </select>
              </FormField>
              <FormField label="Country" colSpan={2}>
                <input
                  type="text"
                  value={formData.country}
                  onChange={set('country')}
                  placeholder="Nigeria"
                  className={inputCls}
                  style={inputStyle}
                />
              </FormField>
            </div>
          )}

          {/* Contact tab */}
          {activeTab === 'contact' && (
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Organization Email" colSpan={2}>
                <input
                  type="email"
                  value={formData.email}
                  onChange={set('email')}
                  placeholder="contact@organization.com"
                  className={inputCls}
                  style={inputStyle}
                />
              </FormField>
              <FormField label="Phone" colSpan={2}>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={set('phone')}
                  placeholder="+234 800 000 0000"
                  className={inputCls}
                  style={inputStyle}
                />
              </FormField>
            </div>
          )}

          {/* Admin tab */}
          {activeTab === 'admin' && (
            <div className="space-y-3">
              <FormField
                label="Initial Admin Email"
                required
                hint="The first organization admin. A setup email will be sent to this address."
              >
                <input
                  type="email"
                  value={formData.admin_email}
                  onChange={set('admin_email')}
                  placeholder="admin@organization.com"
                  className={inputCls}
                  style={inputStyle}
                />
              </FormField>
            </div>
          )}
        </div>

        {/* Footer */}
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
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: gradients.primary }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {saving ? 'Creating…' : 'Create Organization'}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Org Card (matching OrgRow pattern from PlatformConsolePage) ──
interface SetRow {
  id: string; name: string; short_name: string;
  current_level: string | null; entry_year: number | null;
  is_graduated: boolean | null; alumni_label: string | null;
}

function OrgCard({ org }: { org: Organization }) {
  const [expanded, setExpanded] = useState(false);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [setsLoaded, setSetsLoaded] = useState(false);
  const isAcademic = org.organization_type === 'university' || org.organization_type === 'school';

  // Lazy-load the org's sets/levels the first time it's expanded.
  useEffect(() => {
    if (!expanded || setsLoaded || !isAcademic) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('organization_groups')
        .select('id, name, short_name, current_level, entry_year, is_graduated, alumni_label')
        .eq('organization_id', org.id)
        .in('kind', ['class', 'level'])
        .order('entry_year', { ascending: false })
        .limit(100);
      if (!cancelled) { setSets((data as SetRow[]) ?? []); setSetsLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [expanded, setsLoaded, isAcademic, org.id]);
  const typeColor = ORG_TYPE_COLORS[org.organization_type] || colors.primary;
  const initials = (org.short_name || org.name).substring(0, 2).toUpperCase();

  return (
    <motion.div
      className="rounded-xl overflow-hidden"
      style={{ background: colors.cardBg, border: `1px solid ${colors.cardBorder}` }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ borderColor: 'rgba(255,255,255,0.14)' }}
    >
      <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Avatar + info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
            style={{
              background: org.is_active ? `${colors.primary}15` : 'rgba(255,255,255,0.05)',
              color: org.is_active ? colors.primary : colors.textSecondary,
              border: `1px solid ${org.is_active ? colors.primary + '30' : 'rgba(255,255,255,0.1)'}`,
            }}
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-white text-sm truncate">{org.name}</p>
              {/* Active badge */}
              <span
                className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold shrink-0"
                style={{
                  background: org.is_active ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  color: org.is_active ? colors.success : colors.danger,
                }}
              >
                {org.is_active ? 'Active' : 'Inactive'}
              </span>
              {/* Type badge */}
              <span
                className="px-1.5 py-0.5 rounded-full text-[9px] font-bold shrink-0 capitalize"
                style={{ background: `${typeColor}15`, color: typeColor }}
              >
                {org.organization_type}
              </span>
            </div>
            <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>
              {org.short_name}
              {org.country ? ` · ${org.country}` : ''}
              {org.currency_code ? ` · ${org.currency_code}` : ''}
              {' · '}
              {new Date(org.created_at).toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-13 sm:ml-0 shrink-0">
          <motion.button
            onClick={() => (window.location.href = `/${org.slug}/login`)}
            className="p-2 rounded-lg transition-colors"
            style={{ background: `${colors.primary}15`, color: colors.primary }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            title="Open organization"
          >
            <Eye className="w-4 h-4" />
          </motion.button>
          <motion.button
            className="p-2 rounded-lg transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', color: colors.textSecondary }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            title="Edit"
          >
            <Edit className="w-4 h-4" />
          </motion.button>
          <motion.button
            onClick={() => setExpanded((v) => !v)}
            className="p-2 rounded-lg transition-colors"
            style={{ background: 'rgba(255,255,255,0.05)', color: colors.textSecondary }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            title="Details"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </motion.button>
        </div>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3"
              style={{ borderTop: `1px solid ${colors.cardBorder}` }}
            >
              {org.email && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider mb-0.5 flex items-center gap-1" style={{ color: colors.textSecondary }}>
                    <Mail className="w-3 h-3" /> Email
                  </p>
                  <p className="text-xs text-white truncate">{org.email}</p>
                </div>
              )}
              {org.phone && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider mb-0.5 flex items-center gap-1" style={{ color: colors.textSecondary }}>
                    <Phone className="w-3 h-3" /> Phone
                  </p>
                  <p className="text-xs text-white">{org.phone}</p>
                </div>
              )}
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-0.5 flex items-center gap-1" style={{ color: colors.textSecondary }}>
                  <Globe className="w-3 h-3" /> Country
                </p>
                <p className="text-xs text-white">{org.country || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider mb-0.5 flex items-center gap-1" style={{ color: colors.textSecondary }}>
                  <Calendar className="w-3 h-3" /> Created
                </p>
                <p className="text-xs text-white">
                  {new Date(org.created_at).toLocaleDateString('en-NG', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
              </div>
            </div>

            {/* Academic sets — levels overview (Stage 4 console) */}
            {isAcademic && (
              <div className="px-4 pb-4">
                <p className="text-[10px] uppercase tracking-wider mb-2 flex items-center gap-1" style={{ color: colors.textSecondary }}>
                  <Layers className="w-3 h-3" /> Academic sets &amp; levels
                </p>
                {!setsLoaded ? (
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Loading…</p>
                ) : sets.length === 0 ? (
                  <p className="text-xs" style={{ color: colors.textSecondary }}>No classes/sets yet.</p>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto">
                    {sets.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 text-xs rounded-lg px-3 py-2"
                        style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.cardBorder}` }}>
                        <span className="text-white font-medium truncate">{s.name}</span>
                        {s.entry_year && <span className="shrink-0" style={{ color: colors.textSecondary }}>· {s.entry_year} set</span>}
                        <span className="ml-auto shrink-0">
                          {s.is_graduated ? (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(16,185,129,0.16)', color: '#10B981' }}>
                              🎓 {s.alumni_label || 'Alumni'}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(255,104,3,0.16)', color: '#FF6803' }}>
                              {s.current_level || '—'}
                            </span>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Component ──
export default function ConsoleUniversitiesPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadOrganizations();
  }, []);

  const loadOrganizations = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const orgs = await organizationService.getAll({ limit: 100 });
      setOrganizations(orgs);
    } catch (err) {
      console.error('Error loading organizations:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query) {
      loadOrganizations();
      return;
    }
    try {
      setSearching(true);
      const results = await organizationService.search(query);
      setOrganizations(results);
    } catch (err) {
      console.error('Error searching:', err);
    } finally {
      setSearching(false);
    }
  };

  const activeCount   = organizations.filter((o) => o.is_active).length;
  const inactiveCount = organizations.length - activeCount;

  const allTypes = Array.from(new Set(organizations.map((o) => o.organization_type)));

  const filtered = organizations.filter((o) =>
    filterType === 'all' ? true : o.organization_type === filterType
  );

  return (
    <div className="space-y-6">
      {/* ── Hero Header ── */}
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
              <Building2 className="w-3.5 h-3.5" /> Organization Console
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white leading-tight">
              Manage universities and organizations with clear ownership.
            </h2>
            <p className="text-sm sm:text-base leading-7" style={{ color: colors.textSecondary }}>
              Create, search, and maintain platform organizations from a single control room.
            </p>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-3 min-w-[300px]">
            <ConsoleStatCard
              label="Total"
              value={organizations.length}
              icon={Building2}
              color={colors.primary}
            />
            <ConsoleStatCard
              label="Active"
              value={activeCount}
              icon={Activity}
              color={colors.success}
              subtext={organizations.length ? `${Math.round((activeCount / organizations.length) * 100)}%` : undefined}
            />
            <ConsoleStatCard
              label="Inactive"
              value={inactiveCount}
              icon={AlertCircle}
              color={colors.danger}
            />
          </div>
        </div>
      </motion.div>

      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
            style={{ color: colors.textTertiary }}
          />
          {searching && (
            <motion.div
              className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 border-2 rounded-full"
              style={{ borderColor: `${colors.primary}30`, borderTopColor: colors.primary }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          )}
          <input
            type="text"
            placeholder="Search organizations by name…"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 rounded-xl text-sm text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-orange-500/40"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: `1px solid ${colors.cardBorder}`,
            }}
          />
        </div>

        {/* Type filter */}
        {allTypes.length > 1 && (
          <div
            className="flex items-center gap-1 p-1 rounded-xl overflow-x-auto"
            style={{ background: colors.cardBg, border: `1px solid ${colors.cardBorder}` }}
          >
            {['all', ...allTypes].map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap capitalize transition-all"
                style={{
                  background: filterType === t ? `${colors.primary}20` : 'transparent',
                  color: filterType === t ? colors.primary : colors.textSecondary,
                }}
              >
                {t === 'all' ? 'All' : t}
              </button>
            ))}
          </div>
        )}

        {/* Refresh */}
        <motion.button
          onClick={() => loadOrganizations(true)}
          disabled={refreshing}
          className="p-2.5 rounded-xl shrink-0"
          style={{ background: colors.cardBg, border: `1px solid ${colors.cardBorder}`, color: colors.textSecondary }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </motion.button>

        {/* Create */}
        <motion.button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white shrink-0"
          style={{ background: gradients.primary }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <Plus className="w-4 h-4" />
          New Organization
        </motion.button>
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <motion.div
            className="w-8 h-8 border-2 rounded-full"
            style={{ borderColor: `${colors.primary}30`, borderTopColor: colors.primary }}
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          />
          <p className="text-xs" style={{ color: colors.textSecondary }}>
            Loading organizations…
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div
          className="text-center py-14 rounded-xl"
          style={{ background: colors.cardBg, border: `1px solid ${colors.cardBorder}` }}
        >
          <Building2
            className="w-10 h-10 mx-auto mb-3 opacity-30"
            style={{ color: colors.textSecondary }}
          />
          <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
            {searchQuery || filterType !== 'all' ? 'No matching organizations' : 'No organizations yet'}
          </p>
          {!searchQuery && filterType === 'all' && (
            <motion.button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 rounded-lg text-xs font-semibold"
              style={{ background: `${colors.primary}20`, color: colors.primary }}
              whileHover={{ scale: 1.04 }}
            >
              Create First Organization
            </motion.button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((org) => (
            <OrgCard key={org.id} org={org} />
          ))}
        </div>
      )}

      {/* ── Create Modal ── */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateModal
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => loadOrganizations(true)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}