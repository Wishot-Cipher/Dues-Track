import { useState, useEffect, useCallback } from 'react'
import { motion} from 'framer-motion'
import {  } from 'react-router-dom'
import { useAppNav } from '@/hooks/useAppNav';
import Modal from '@/components/ui/Modal'
import GlassCard from '@/components/ui/GlassCard'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown'
import ProfessionalDateTimePicker from '@/components/ui/ProfessionalDateTimePicker'
import { colors } from '@/config/colors'
import { useAuth } from '@/hooks/useAppAuth'
import { useToast } from '@/hooks/useToast'
import { supabase } from '@/config/supabase'
import { getOrgScope } from '@/utils/orgScope'
import { getScopedGroupIds } from '@/utils/scopedGroups'
import { useActiveRole } from '@/hooks/useActiveRole'
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth'
import { formatDate } from '@/utils/formatters'
import Footer from '@/components/Footer'
import DashboardSwitcher from '@/components/DashboardSwitcher'
import { getDashboardTokens, useTheme } from '@/hooks/useTheme'
import { 
  CreditCard, 
  Edit3, 
  Trash2, 
  AlertTriangle,
  RefreshCw,
  Plus,
  DollarSign,
  CheckCircle,
  ArrowLeft,
  Search,
  Tag
} from 'lucide-react'

interface PaymentType {
  id: string
  title: string
  description: string | null
  category: string
  amount: number
  minimum_partial_amount?: number | null
  allow_partial: boolean
  is_mandatory: boolean
  deadline: string
  target_levels: string[] | null
  target_sections: string[] | null
  icon: string
  color: string
  bank_name: string
  account_name: string
  account_number: string
  accepts_paystack?: boolean
  accepts_manual?: boolean
  late_fee_per_day?: number | null
  is_active: boolean
  is_public: boolean
  created_at: string
  updated_at: string
}

interface EditPaymentTypeForm {
  id: string
  title: string
  description: string
  category: string
  amount: string
  minimum_partial_amount: string
  allow_partial: boolean
  is_mandatory: boolean
  deadline: string
  target_levels: string[]
  target_sections: string[]
  icon: string
  color: string
  bank_name: string
  account_name: string
  account_number: string
  accepts_paystack: boolean
  accepts_manual: boolean
  late_fee_per_day: string
  is_active: boolean
  is_public: boolean
}

const CATEGORIES = [
  { value: 'semester_dues', label: 'Semester Dues', icon: '🎓' },
  { value: 'books', label: 'Books', icon: '📚' },
  { value: 'events', label: 'Events', icon: '🎉' },
  { value: 'projects', label: 'Projects', icon: '📘' },
  { value: 'welfare', label: 'Welfare', icon: '❤️' },
  { value: 'custom', label: 'Custom', icon: '📦' },
]

const COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
]

const ICONS = [
  { value: '🎓', label: 'Graduation Cap' },
  { value: '📚', label: 'Books' },
  { value: '🎉', label: 'Party' },
  { value: '📘', label: 'Notebook' },
  { value: '❤️', label: 'Heart' },
  { value: '📦', label: 'Package' },
  { value: '💰', label: 'Money Bag' },
  { value: '🏆', label: 'Trophy' },
  { value: '⚽', label: 'Sports' },
  { value: '🎨', label: 'Art' },
]

const LEVEL_OPTIONS = ['100', '200', '300', '400', '500', '600', '700']
const SECTION_OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F']

const normalizePaymentTypeToForm = (paymentType: PaymentType): EditPaymentTypeForm => ({
  id: paymentType.id,
  title: paymentType.title || '',
  description: paymentType.description || '',
  category: paymentType.category || 'semester_dues',
  amount: String(paymentType.amount ?? ''),
  minimum_partial_amount: String(paymentType.minimum_partial_amount ?? ''),
  allow_partial: paymentType.allow_partial ?? false,
  is_mandatory: paymentType.is_mandatory ?? false,
  deadline: paymentType.deadline || '',
  target_levels: paymentType.target_levels || [],
  target_sections: paymentType.target_sections || [],
  icon: paymentType.icon || '🎓',
  color: paymentType.color || colors.primary,
  bank_name: paymentType.bank_name || '',
  account_name: paymentType.account_name || '',
  account_number: paymentType.account_number || '',
  accepts_paystack: paymentType.accepts_paystack ?? true,
  accepts_manual: paymentType.accepts_manual ?? true,
  late_fee_per_day: String(paymentType.late_fee_per_day ?? ''),
  is_active: paymentType.is_active ?? true,
  is_public: paymentType.is_public ?? false,
})

export default function ManageDuesPage() {
  const { go: navigate, orgSlug } = useAppNav();
  const { theme } = useTheme()
  const tk = getDashboardTokens(theme)
  const { hasPermission } = useAuth()
  const { success, error: showError } = useToast()
  const { user, organization } = useMultiTenantAuth()
  const { activeRole } = useActiveRole({
    orgId: organization?.id,
    memberId: user?.id,
  })
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  // Pagination — keeps the page responsive as the dues catalogue
  // grows. perPage is conservative for mobile (renders ~25 cards
  // before the user has to scroll into the pagination footer).
  const [currentPage, setCurrentPage] = useState(1)
  const PER_PAGE = 25
  
  // Modals
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)
  const [showEditConfirm, setShowEditConfirm] = useState(false)
  const [editingPaymentType, setEditingPaymentType] = useState<EditPaymentTypeForm | null>(null)
  const [selectedPaymentType, setSelectedPaymentType] = useState<PaymentType | null>(null)
  
  // Stats
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    totalAmount: 0
  })

  const loadPaymentTypes = useCallback(async () => {
    try {
      setLoading(true)
      const scope = getOrgScope()
      // The old filter pinned group_id to the user's PRIMARY group,
      // which meant a faculty/dept exec only saw dues for their own
      // unit and never the dues they published targeting classes
      // below them. We now scope to the ACTIVE role's subtree —
      //   class rep → just their class
      //   dept exec → their dept + all classes under it
      //   faculty exec → their faculty + every dept + every class
      //   org owner → everything (scope = null → no filter)
      const scopedIds = scope ? await getScopedGroupIds({
        orgId: scope.orgId,
        activeGroupId: activeRole?.groupId ?? null,
        activeScopeLevel: activeRole?.scopeLevel ?? null,
      }) : null
      let query = supabase
        .from('payment_types')
        .select('*')
        .order('created_at', { ascending: false })
      if (scope) {
        query = query.eq('organization_id', scope.orgId)
        if (scopedIds) {
          query = query.in('group_id', Array.from(scopedIds))
        }
      }
      const { data, error } = await query

      if (error) throw error

      setPaymentTypes(data || [])
      
      // Calculate stats
      const activeTypes = data?.filter(pt => pt.is_active) || []
      setStats({
        total: data?.length || 0,
        active: activeTypes.length,
        totalAmount: activeTypes.reduce((sum, pt) => sum + (pt.amount || 0), 0)
      })
    } catch {
      showError('Failed to load payment types')
    } finally {
      setLoading(false)
    }
  }, [showError, activeRole?.groupId, activeRole?.scopeLevel])

  useEffect(() => {
    loadPaymentTypes()
  }, [loadPaymentTypes])

  async function handleToggleActive(paymentType: PaymentType) {
    try {
      setActionLoading(true)
      const newStatus = !paymentType.is_active
      
      const scope = getOrgScope();
      let updateQ = supabase
        .from('payment_types')
        .update({ is_active: newStatus, updated_at: new Date().toISOString() })
        .eq('id', paymentType.id);
      if (scope) {
        updateQ = updateQ.eq('organization_id', scope.orgId);
        updateQ = updateQ.eq('group_id', scope.groupId);
      }
      const { error } = await updateQ;

      if (error) throw error

      success(`Payment type ${newStatus ? 'activated' : 'deactivated'} successfully`)
      await loadPaymentTypes()
    } catch {
      showError('Failed to update payment type status')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleEdit() {
    if (!editingPaymentType?.id) return

    if (!editingPaymentType.title.trim()) {
      showError('Please provide a title')
      return
    }

    if (!editingPaymentType.amount || Number(editingPaymentType.amount) <= 0) {
      showError('Please provide a valid amount')
      return
    }

    if (!editingPaymentType.accepts_paystack && !editingPaymentType.accepts_manual) {
      showError('Enable at least one payment method')
      return
    }

    if (editingPaymentType.allow_partial && Number(editingPaymentType.minimum_partial_amount || 0) <= 0) {
      showError('Set a minimum partial amount')
      return
    }

    if (editingPaymentType.accepts_manual && (!editingPaymentType.bank_name.trim() || !editingPaymentType.account_number.trim())) {
      showError('Manual payments need bank details')
      return
    }

    try {
      setActionLoading(true)
      const scope = getOrgScope();
      let editQ = supabase
        .from('payment_types')
        .update({
          title: editingPaymentType.title.trim(),
          description: editingPaymentType.description.trim() || null,
          category: editingPaymentType.category,
          amount: Number(editingPaymentType.amount),
          minimum_partial_amount:
            editingPaymentType.allow_partial && editingPaymentType.minimum_partial_amount
              ? Number(editingPaymentType.minimum_partial_amount)
              : null,
          allow_partial: editingPaymentType.allow_partial,
          is_mandatory: editingPaymentType.is_mandatory,
          deadline: editingPaymentType.deadline || null,
          late_fee_per_day: editingPaymentType.late_fee_per_day ? Number(editingPaymentType.late_fee_per_day) : null,
          target_levels: editingPaymentType.target_levels.length ? editingPaymentType.target_levels : null,
          target_sections: editingPaymentType.target_sections.length ? editingPaymentType.target_sections : null,
          icon: editingPaymentType.icon,
          color: editingPaymentType.color,
          bank_name: editingPaymentType.accepts_manual ? editingPaymentType.bank_name.trim() : null,
          account_name: editingPaymentType.accepts_manual ? editingPaymentType.account_name.trim() : null,
          account_number: editingPaymentType.accepts_manual ? editingPaymentType.account_number.trim() : null,
          accepts_paystack: editingPaymentType.accepts_paystack,
          accepts_manual: editingPaymentType.accepts_manual,
          is_public: editingPaymentType.is_public,
          updated_at: new Date().toISOString()
        })
        .eq('id', editingPaymentType.id);
      if (scope) {
        editQ = editQ.eq('organization_id', scope.orgId);
        editQ = editQ.eq('group_id', scope.groupId);
      }
      const { error } = await editQ;

      if (error) throw error

      success('Payment type updated successfully')
      setShowEditModal(false)
      setEditingPaymentType(null)
      await loadPaymentTypes()
    } catch (err) {
      console.error('Failed to update payment type error:', err)
      showError('Failed to update payment type')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDelete(paymentTypeId: string) {
    try {
      setActionLoading(true)
      
      // Check if there are any payments associated with this payment type
      const scope = getOrgScope();
      let countQ = supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('payment_type_id', paymentTypeId);
      if (scope) {
        countQ = countQ.eq('organization_id', scope.orgId);
        countQ = countQ.eq('group_id', scope.groupId);
      }
      const { count } = await countQ;

      if (count && count > 0) {
        showError(`Cannot delete: ${count} payment(s) are associated with this due. Consider deactivating instead.`)
        setShowDeleteConfirm(false)
        return
      }

      let deleteQ = supabase
        .from('payment_types')
        .delete()
        .eq('id', paymentTypeId);
      if (scope) {
        deleteQ = deleteQ.eq('organization_id', scope.orgId);
        deleteQ = deleteQ.eq('group_id', scope.groupId);
      }
      const { error } = await deleteQ;

      if (error) throw error

      success('Payment type deleted successfully')
      setShowDeleteConfirm(false)
      setSelectedPaymentType(null)
      await loadPaymentTypes()
    } catch {
      showError('Failed to delete payment type')
    } finally {
      setActionLoading(false)
    }
  }

  // Filter payment types
  const filteredPaymentTypes = paymentTypes.filter(pt => {
    const matchesSearch = pt.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         pt.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         pt.category.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = filterStatus === 'all' ||
                         (filterStatus === 'active' && pt.is_active) ||
                         (filterStatus === 'inactive' && !pt.is_active)
    const matchesCategory = filterCategory === 'all' || pt.category === filterCategory
    return matchesSearch && matchesStatus && matchesCategory
  })

  // Pagination math. Clamp page when the underlying list shrinks
  // (e.g. user filters down and the current page is past the new
  // last page). Keeps the visible window stable for the user.
  const totalPages = Math.max(1, Math.ceil(filteredPaymentTypes.length / PER_PAGE))
  const clampedPage = Math.min(currentPage, totalPages)
  if (clampedPage !== currentPage && currentPage !== 1) setCurrentPage(clampedPage)
  const paginatedPaymentTypes = filteredPaymentTypes.slice(
    (clampedPage - 1) * PER_PAGE,
    clampedPage * PER_PAGE,
  )

  const getCategoryLabel = (category: string) => {
    const cat = CATEGORIES.find(c => c.value === category)
    return cat?.label || category
  }

  const getCategoryIcon = (category: string) => {
    const cat = CATEGORIES.find(c => c.value === category)
    return cat?.icon || '📦'
  }

  // Check permission
  const canManageDues = hasPermission('can_create_payments')

  if (!canManageDues) {
    return (
      <div className="min-h-screen relative overflow-hidden" style={{ background: tk.bgWash }}>
        <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
          <GlassCard className="p-6">
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: `${colors.warning}15` }}>
                <AlertTriangle className="w-8 h-8" style={{ color: colors.warning }} />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Access Restricted</h2>
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                You don't have permission to manage payment types.
              </p>
            </div>
          </GlassCard>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen py-6 px-4 relative overflow-hidden"
      style={{ background: tk.bgWash, color: tk.text }}
    >
      {/* Soft brand blobs — match exec dashboards. Replaces the
          50px grid + two animated radial orbs the legacy hero used. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 w-[520px] h-[520px] rounded-full"
        style={{ background: tk.blob1, filter: 'blur(120px)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-32 w-[420px] h-[420px] rounded-full"
        style={{ background: tk.blob2, filter: 'blur(110px)' }}
      />

      <div className="relative z-10 max-w-5xl mx-auto space-y-6">
        {/* Single-tenant DashboardSwitcher slot */}
        {!orgSlug && (
          <div className="flex justify-end">
            <DashboardSwitcher />
          </div>
        )}

        {/* ── Header ────────────────────────────────────────────── */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {/* Back link as a quiet text chip — not a giant orange button */}
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
            style={{ color: tk.textTer }}
          >
            <ArrowLeft className="w-3 h-3" />
            Back to dashboard
          </button>

          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-1 rounded-full"
                style={{
                  background: tk.primarySoft,
                  color: tk.primary,
                  border: `1px solid ${tk.primaryRing}`,
                }}
              >
                <CreditCard className="w-3 h-3" />
                Dues catalogue
              </span>
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: tk.textTer }}
              >
                {stats.total} {stats.total === 1 ? 'due' : 'dues'} in scope
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={loadPaymentTypes}
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
                style={{
                  background: tk.card,
                  color: tk.text,
                  border: `1px solid ${tk.cardBorder}`,
                }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/create-payment')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98]"
                style={{
                  background: tk.primary,
                  color: '#FFFFFF',
                  border: `1px solid ${tk.primary}`,
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                Create new
              </button>
            </div>
          </div>

          <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight" style={{ color: tk.text }}>
            Manage dues
          </h1>
          <p className="text-sm" style={{ color: tk.textSec }}>
            Every due your scope publishes lives here — edit terms,
            toggle visibility, retire stale ones. Class reps see their
            class; dept and faculty execs see their whole subtree.
          </p>

          {/* Stats strip — same shape as exec-dashboard Stat cards */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <ManageStat
              label="Total dues"
              value={stats.total}
              icon={<Tag className="w-3.5 h-3.5" />}
              color={tk.primary}
              tk={tk}
            />
            <ManageStat
              label="Active"
              value={stats.active}
              icon={<CheckCircle className="w-3.5 h-3.5" />}
              color={tk.mint}
              tk={tk}
            />
            <ManageStat
              label="Total value"
              value={`₦${stats.totalAmount.toLocaleString()}`}
              icon={<DollarSign className="w-3.5 h-3.5" />}
              color={tk.amber}
              tk={tk}
            />
          </div>
        </motion.header>

        {/* Search and Filters */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="rounded-2xl p-3 sm:p-4 relative z-20"
          style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
        >
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: tk.textTer }}
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="Search by title, description, category..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 transition-all"
                style={{
                  background: theme === 'light' ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${tk.cardBorder}`,
                  color: tk.text,
                  ['--tw-ring-color' as any]: tk.primaryRing,
                }}
              />
            </div>

            <ProfessionalDropdown
              value={filterStatus}
              onChange={(value) => { setFilterStatus(value as 'all' | 'active' | 'inactive'); setCurrentPage(1); }}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'active', label: 'Active Only' },
                { value: 'inactive', label: 'Inactive Only' }
              ]}
              placeholder="Status"
            />

            <ProfessionalDropdown
              value={filterCategory}
              onChange={(value) => { setFilterCategory(typeof value === 'string' ? value : value[0] || 'all'); setCurrentPage(1); }}
              options={[
                { value: 'all', label: 'All Categories' },
                ...CATEGORIES.map((cat) => ({
                  value: cat.value,
                  label: `${cat.icon} ${cat.label}`
                }))
              ]}
              placeholder="Category"
            />
          </div>
        </motion.div>

        {/* ── Payment types list ────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="space-y-3"
        >
          {loading && (
            <div
              className="text-center py-12 rounded-2xl"
              style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
            >
              <div
                className="w-10 h-10 mx-auto border-4 rounded-full animate-spin mb-3"
                style={{ borderColor: `${tk.primary}30`, borderTopColor: 'transparent' }}
              />
              <p className="text-sm" style={{ color: tk.textSec }}>
                Loading payment types…
              </p>
            </div>
          )}

          {!loading && filteredPaymentTypes.length === 0 && (
            <div
              className="text-center py-14 rounded-2xl"
              style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
            >
              <div
                className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                style={{ background: tk.primarySoft, border: `1px solid ${tk.primaryRing}` }}
              >
                <CreditCard className="w-7 h-7" style={{ color: tk.primary }} />
              </div>
              <h3 className="text-lg font-extrabold tracking-tight mb-1" style={{ color: tk.text }}>
                {searchTerm || filterStatus !== 'all' || filterCategory !== 'all'
                  ? 'No results found'
                  : 'No payment types yet'}
              </h3>
              <p className="text-sm max-w-sm mx-auto mb-5" style={{ color: tk.textSec }}>
                {searchTerm || filterStatus !== 'all' || filterCategory !== 'all'
                  ? 'Try adjusting your search or filters.'
                  : 'Create your first due to start collecting from your scope.'}
              </p>
              {!searchTerm && filterStatus === 'all' && filterCategory === 'all' && (
                <button
                  type="button"
                  onClick={() => navigate('/admin/create-payment')}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98]"
                  style={{
                    background: tk.primary,
                    color: '#FFFFFF',
                    border: `1px solid ${tk.primary}`,
                  }}
                >
                  <Plus className="w-4 h-4" />
                  Create payment type
                </button>
              )}
            </div>
          )}

          {!loading && filteredPaymentTypes.length > 0 && (
            <div className="space-y-3">
              {paginatedPaymentTypes.map((pt, index) => {
                const accent = pt.color || tk.primary
                return (
                  <motion.div
                    key={pt.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.02, 0.25) }}
                    className="rounded-2xl overflow-hidden"
                    style={{
                      background: tk.card,
                      border: `1px solid ${pt.is_active ? tk.cardBorder : `${tk.danger}50`}`,
                    }}
                  >
                    {/* Title row */}
                    <div
                      className="p-4 flex items-center gap-3"
                      style={{
                        background: pt.is_active
                          ? `linear-gradient(135deg, ${accent}10, transparent 60%)`
                          : `linear-gradient(135deg, ${tk.danger}10, transparent 60%)`,
                      }}
                    >
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
                        style={{
                          background: `${accent}18`,
                          color: accent,
                          border: `1px solid ${accent}30`,
                        }}
                      >
                        {pt.icon || getCategoryIcon(pt.category)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm sm:text-base truncate" style={{ color: tk.text }}>
                          {pt.title}
                        </p>
                        <p
                          className="text-xl sm:text-2xl font-extrabold tabular-nums leading-tight"
                          style={{ color: accent }}
                        >
                          ₦{(pt.amount || 0).toLocaleString()}
                        </p>
                      </div>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0"
                        style={{
                          background: pt.is_active ? `${tk.mint}18` : `${tk.danger}18`,
                          color: pt.is_active ? tk.mint : tk.danger,
                          border: `1px solid ${pt.is_active ? `${tk.mint}40` : `${tk.danger}40`}`,
                        }}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: pt.is_active ? tk.mint : tk.danger }}
                        />
                        {pt.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {/* Badges */}
                    <div className="px-4 pb-3 flex flex-wrap gap-2">
                      <span
                        className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider inline-flex items-center gap-1"
                        style={{
                          background: `${accent}14`,
                          color: accent,
                          border: `1px solid ${accent}30`,
                        }}
                      >
                        {getCategoryIcon(pt.category)}
                        {getCategoryLabel(pt.category)}
                      </span>
                      <span
                        className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                        style={{
                          background: theme === 'light' ? 'rgba(15,7,3,0.04)' : 'rgba(255,255,255,0.04)',
                          color: tk.textSec,
                          border: `1px solid ${tk.cardBorder}`,
                        }}
                      >
                        {pt.allow_partial ? 'Partial OK' : 'Full only'}
                      </span>
                      {pt.is_mandatory && (
                        <span
                          className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                          style={{
                            background: `${tk.amber}18`,
                            color: tk.amber,
                            border: `1px solid ${tk.amber}40`,
                          }}
                        >
                          Required
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    {pt.description && (
                      <div className="px-4 pb-3">
                        <p className="text-sm leading-relaxed line-clamp-2" style={{ color: tk.textSec }}>
                          {pt.description}
                        </p>
                      </div>
                    )}

                    {/* Details grid */}
                    <div className="px-4 pb-3 grid grid-cols-3 gap-2">
                      <DetailCell label="Deadline"      value={formatDate(pt.deadline)}                                   tk={tk} theme={theme} />
                      <DetailCell label="Category"      value={(pt.category || 'General').toString()}                     tk={tk} theme={theme} />
                      <DetailCell label="Late fee / day" value={pt.late_fee_per_day ? `₦${Number(pt.late_fee_per_day).toLocaleString()}` : '₦0'} tk={tk} theme={theme} />
                    </div>

                    {/* Actions */}
                    <div
                      className="p-4 pt-3 space-y-2"
                      style={{ borderTop: `1px solid ${tk.cardBorder}` }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPaymentType(pt)
                          setShowDeactivateConfirm(true)
                        }}
                        disabled={actionLoading}
                        className="w-full px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-50"
                        style={{
                          background: pt.is_active ? `${tk.danger}12` : `${tk.mint}12`,
                          color: pt.is_active ? tk.danger : tk.mint,
                          border: `1px solid ${pt.is_active ? `${tk.danger}30` : `${tk.mint}30`}`,
                        }}
                      >
                        {pt.is_active ? 'Deactivate payment type' : 'Activate payment type'}
                      </button>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPaymentType(pt)
                            setEditingPaymentType(normalizePaymentTypeToForm(pt))
                            setShowEditConfirm(true)
                          }}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.98]"
                          style={{
                            background: tk.primarySoft,
                            color: tk.primary,
                            border: `1px solid ${tk.primaryRing}`,
                          }}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          Edit details
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPaymentType(pt)
                            setShowDeleteConfirm(true)
                          }}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-[0.98]"
                          style={{
                            background: `${tk.danger}12`,
                            color: tk.danger,
                            border: `1px solid ${tk.danger}30`,
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}

          {/* Pagination footer — only renders when there's more than
              one page worth of dues. "Showing X-Y of Z" sits left;
              prev/page-numbers/next sit right. Numbered buttons
              window around the current page so very long lists don't
              spew dozens of chips. */}
          {!loading && filteredPaymentTypes.length > PER_PAGE && (
            <div
              className="rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3"
              style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
            >
              <p className="text-[11px]" style={{ color: tk.textSec }}>
                Showing <span className="font-bold" style={{ color: tk.text }}>
                  {(clampedPage - 1) * PER_PAGE + 1}–{Math.min(clampedPage * PER_PAGE, filteredPaymentTypes.length)}
                </span> of {filteredPaymentTypes.length}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={clampedPage === 1}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40"
                  style={{
                    background: tk.card,
                    color: tk.text,
                    border: `1px solid ${tk.cardBorder}`,
                  }}
                >
                  Prev
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum: number
                  if (totalPages <= 5) pageNum = i + 1
                  else if (clampedPage <= 3) pageNum = i + 1
                  else if (clampedPage >= totalPages - 2) pageNum = totalPages - 4 + i
                  else pageNum = clampedPage - 2 + i
                  const isActive = pageNum === clampedPage
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className="w-8 h-8 rounded-lg text-xs font-bold tabular-nums transition-all"
                      style={{
                        background: isActive ? tk.primary : tk.card,
                        color: isActive ? '#FFFFFF' : tk.text,
                        border: `1px solid ${isActive ? tk.primary : tk.cardBorder}`,
                      }}
                    >
                      {pageNum}
                    </button>
                  )
                })}
                <button
                  type="button"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={clampedPage >= totalPages}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-40"
                  style={{
                    background: tk.card,
                    color: tk.text,
                    border: `1px solid ${tk.cardBorder}`,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </motion.div>

        <Footer />
      </div>

      {/* Edit Modal */}
      <Modal
        isOpen={showEditModal && Boolean(editingPaymentType)}
        onClose={() => {
          setShowEditModal(false)
          setEditingPaymentType(null)
        }}
        title="Edit Published Due"
        size="xl"
      >
        {editingPaymentType && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <div className="space-y-5">
              <section className="rounded-2xl p-5 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Edit3 className="w-4 h-4" style={{ color: colors.primary }} />
                  <h4 className="text-sm font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>Basics</h4>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Title</label>
                    <input
                      type="text"
                      value={editingPaymentType.title}
                      onChange={(e) => setEditingPaymentType({ ...editingPaymentType, title: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border text-white focus:outline-none focus:ring-2"
                      style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Description</label>
                    <textarea
                      value={editingPaymentType.description}
                      onChange={(e) => setEditingPaymentType({ ...editingPaymentType, description: e.target.value })}
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl bg-white/5 border text-white focus:outline-none focus:ring-2 resize-none"
                      style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Amount (₦)</label>
                      <input
                        type="number"
                        value={editingPaymentType.amount}
                        onChange={(e) => setEditingPaymentType({ ...editingPaymentType, amount: e.target.value.replace(/[^0-9.]/g, '') })}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border text-white focus:outline-none focus:ring-2"
                        style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
                      />
                    </div>
                    <ProfessionalDateTimePicker
                      label="Deadline"
                      value={editingPaymentType.deadline?.slice(0, 16) || ''}
                      onChange={(value) => setEditingPaymentType({ ...editingPaymentType, deadline: value })}
                      helperText="Choose when this due stops accepting payments."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Category</label>
                      <ProfessionalDropdown
                        value={editingPaymentType.category}
                        onChange={(value) => setEditingPaymentType({ ...editingPaymentType, category: typeof value === 'string' ? value : value[0] })}
                        options={CATEGORIES.map((cat) => ({ value: cat.value, label: `${cat.icon} ${cat.label}` }))}
                        placeholder="Select category"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Icon</label>
                      <ProfessionalDropdown
                        value={editingPaymentType.icon}
                        onChange={(value) => setEditingPaymentType({ ...editingPaymentType, icon: typeof value === 'string' ? value : value[0] })}
                        options={ICONS.map((icon) => ({ value: icon.value, label: `${icon.value} ${icon.label}` }))}
                        placeholder="Select icon"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Color</label>
                    <div className="flex flex-wrap gap-2">
                      {COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setEditingPaymentType({ ...editingPaymentType, color })}
                          className={`w-8 h-8 rounded-lg transition-all ${editingPaymentType.color === color ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-110' : ''}`}
                          style={{ background: color }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Late fee per day (₦)</label>
                      <input
                        type="number"
                        value={editingPaymentType.late_fee_per_day}
                        onChange={(e) => setEditingPaymentType({ ...editingPaymentType, late_fee_per_day: e.target.value.replace(/[^0-9.]/g, '') })}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border text-white focus:outline-none focus:ring-2"
                        style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">Minimum partial amount (₦)</label>
                      <input
                        type="number"
                        value={editingPaymentType.minimum_partial_amount}
                        onChange={(e) => setEditingPaymentType({ ...editingPaymentType, minimum_partial_amount: e.target.value.replace(/[^0-9.]/g, '') })}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border text-white focus:outline-none focus:ring-2"
                        style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl p-5 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <Tag className="w-4 h-4" style={{ color: colors.primary }} />
                  <h4 className="text-sm font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>Targeting</h4>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textSecondary }}>Levels</p>
                    <div className="flex flex-wrap gap-2">
                      {LEVEL_OPTIONS.map((lvl) => {
                        const active = editingPaymentType.target_levels.includes(lvl)
                        return (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setEditingPaymentType({
                              ...editingPaymentType,
                              target_levels: active
                                ? editingPaymentType.target_levels.filter((item) => item !== lvl)
                                : [...editingPaymentType.target_levels, lvl],
                            })}
                            className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
                            style={{
                              background: active ? `${colors.primary}20` : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${active ? `${colors.primary}40` : 'rgba(255,255,255,0.08)'}`,
                              color: active ? colors.primary : colors.textSecondary,
                            }}
                          >
                            {lvl}L
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textSecondary }}>Sections</p>
                    <div className="flex flex-wrap gap-2">
                      {SECTION_OPTIONS.map((section) => {
                        const active = editingPaymentType.target_sections.includes(section)
                        return (
                          <button
                            key={section}
                            type="button"
                            onClick={() => setEditingPaymentType({
                              ...editingPaymentType,
                              target_sections: active
                                ? editingPaymentType.target_sections.filter((item) => item !== section)
                                : [...editingPaymentType.target_sections, section],
                            })}
                            className="px-3 py-2 rounded-xl text-sm font-medium transition-all"
                            style={{
                              background: active ? `${colors.accentMint}22` : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${active ? `${colors.accentMint}40` : 'rgba(255,255,255,0.08)'}`,
                              color: active ? colors.accentMint : colors.textSecondary,
                            }}
                          >
                            Section {section}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl p-5 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-center gap-2 mb-4">
                  <CreditCard className="w-4 h-4" style={{ color: colors.primary }} />
                  <h4 className="text-sm font-semibold uppercase tracking-wider" style={{ color: colors.textSecondary }}>Payment setup</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer" style={{ background: editingPaymentType.allow_partial ? `${colors.primary}12` : 'rgba(255,255,255,0.03)', borderColor: editingPaymentType.allow_partial ? `${colors.primary}35` : 'rgba(255,255,255,0.08)' }}>
                    <input type="checkbox" checked={editingPaymentType.allow_partial} onChange={(e) => setEditingPaymentType({ ...editingPaymentType, allow_partial: e.target.checked })} />
                    <span className="text-sm text-white">Allow partial payments</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer" style={{ background: editingPaymentType.is_mandatory ? `${colors.warning}12` : 'rgba(255,255,255,0.03)', borderColor: editingPaymentType.is_mandatory ? `${colors.warning}35` : 'rgba(255,255,255,0.08)' }}>
                    <input type="checkbox" checked={editingPaymentType.is_mandatory} onChange={(e) => setEditingPaymentType({ ...editingPaymentType, is_mandatory: e.target.checked })} />
                    <span className="text-sm text-white">Mandatory payment</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer" style={{ background: editingPaymentType.is_public ? `${colors.accentMint}12` : 'rgba(255,255,255,0.03)', borderColor: editingPaymentType.is_public ? `${colors.accentMint}35` : 'rgba(255,255,255,0.08)' }}>
                    <input type="checkbox" checked={editingPaymentType.is_public} onChange={(e) => setEditingPaymentType({ ...editingPaymentType, is_public: e.target.checked })} />
                    <span className="text-sm text-white">Public link</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer" style={{ background: editingPaymentType.accepts_paystack ? `${colors.primary}12` : 'rgba(255,255,255,0.03)', borderColor: editingPaymentType.accepts_paystack ? `${colors.primary}35` : 'rgba(255,255,255,0.08)' }}>
                    <input type="checkbox" checked={editingPaymentType.accepts_paystack} onChange={(e) => setEditingPaymentType({ ...editingPaymentType, accepts_paystack: e.target.checked })} />
                    <span className="text-sm text-white">Paystack checkout</span>
                  </label>
                  <label className="flex items-center gap-3 p-3 rounded-xl border cursor-pointer sm:col-span-2" style={{ background: editingPaymentType.accepts_manual ? `${colors.blue}12` : 'rgba(255,255,255,0.03)', borderColor: editingPaymentType.accepts_manual ? `${colors.blue}35` : 'rgba(255,255,255,0.08)' }}>
                    <input type="checkbox" checked={editingPaymentType.accepts_manual} onChange={(e) => setEditingPaymentType({ ...editingPaymentType, accepts_manual: e.target.checked })} />
                    <span className="text-sm text-white">Manual bank transfer</span>
                  </label>
                </div>

                {editingPaymentType.accepts_manual && (
                  <div className="space-y-4 pt-1">
                    <p className="text-xs uppercase tracking-wider font-semibold" style={{ color: colors.textSecondary }}>Bank details shown to members</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white mb-2">Bank Name</label>
                        <input
                          type="text"
                          value={editingPaymentType.bank_name}
                          onChange={(e) => setEditingPaymentType({ ...editingPaymentType, bank_name: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-white/5 border text-white focus:outline-none focus:ring-2"
                          style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white mb-2">Account Name</label>
                        <input
                          type="text"
                          value={editingPaymentType.account_name}
                          onChange={(e) => setEditingPaymentType({ ...editingPaymentType, account_name: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-white/5 border text-white focus:outline-none focus:ring-2"
                          style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-sm font-medium text-white mb-2">Account Number</label>
                        <input
                          type="text"
                          value={editingPaymentType.account_number}
                          onChange={(e) => setEditingPaymentType({ ...editingPaymentType, account_number: e.target.value.replace(/[^0-9]/g, '') })}
                          className="w-full px-4 py-3 rounded-xl bg-white/5 border text-white focus:outline-none focus:ring-2"
                          style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-4 lg:sticky lg:top-0 self-start">
              <div className="rounded-2xl p-5 border" style={{ background: `linear-gradient(135deg, ${editingPaymentType.color}22, rgba(255,255,255,0.03))`, borderColor: `${editingPaymentType.color}35` }}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl" style={{ background: editingPaymentType.color }}>
                    {editingPaymentType.icon}
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider" style={{ color: colors.textSecondary }}>Live preview</p>
                    <h4 className="text-lg font-bold text-white">Student view</h4>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xl font-bold text-white">{editingPaymentType.title || 'Untitled due'}</p>
                  <p className="text-sm leading-6" style={{ color: colors.textSecondary }}>
                    {editingPaymentType.description || 'No description provided yet.'}
                  </p>

                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: `${editingPaymentType.color}20`, color: editingPaymentType.color }}>
                      {getCategoryLabel(editingPaymentType.category)}
                    </span>
                    {editingPaymentType.is_public && (
                      <span className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: `${colors.accentMint}20`, color: colors.accentMint }}>
                        Public
                      </span>
                    )}
                    {editingPaymentType.allow_partial && (
                      <span className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: `${colors.warning}20`, color: colors.warning }}>
                        Partial allowed
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Amount</p>
                      <p className="text-white font-semibold">₦{Number(editingPaymentType.amount || 0).toLocaleString()}</p>
                    </div>
                    <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Deadline</p>
                      <p className="text-white font-semibold text-sm">{editingPaymentType.deadline ? formatDate(editingPaymentType.deadline) : 'No deadline'}</p>
                    </div>
                    <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Levels</p>
                      <p className="text-white font-semibold text-sm">{editingPaymentType.target_levels.length ? `${editingPaymentType.target_levels.join(', ')}L` : 'All levels'}</p>
                    </div>
                    <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Sections</p>
                      <p className="text-white font-semibold text-sm">{editingPaymentType.target_sections.length ? editingPaymentType.target_sections.join(', ') : 'All sections'}</p>
                    </div>
                  </div>

                  {editingPaymentType.accepts_manual && editingPaymentType.bank_name && (
                    <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: colors.textSecondary }}>Manual payment details</p>
                      <p className="text-white font-medium">{editingPaymentType.bank_name}</p>
                      <p className="text-sm" style={{ color: colors.textSecondary }}>{editingPaymentType.account_name || 'Account name not set'}</p>
                      <p className="text-sm font-mono" style={{ color: colors.textSecondary }}>{editingPaymentType.account_number || 'Account number not set'}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl p-4 border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <p className="text-xs uppercase tracking-wider font-semibold mb-3" style={{ color: colors.textSecondary }}>Quick summary</p>
                <div className="space-y-2 text-sm">
                  <p style={{ color: colors.textSecondary }}>• {editingPaymentType.is_mandatory ? 'Mandatory' : 'Optional'} due</p>
                  <p style={{ color: colors.textSecondary }}>• {editingPaymentType.accepts_paystack ? 'Paystack enabled' : 'Paystack disabled'}</p>
                  <p style={{ color: colors.textSecondary }}>• {editingPaymentType.accepts_manual ? 'Manual transfer enabled' : 'Manual transfer disabled'}</p>
                  <p style={{ color: colors.textSecondary }}>• {editingPaymentType.allow_partial ? 'Partial payments enabled' : 'Full payment only'}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingPaymentType(null)
                  }}
                  className="flex-1 px-4 py-3 rounded-xl font-medium"
                  style={{ background: 'rgba(255, 255, 255, 0.05)', color: colors.textSecondary }}
                >
                  Cancel
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleEdit}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})` }}
                >
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </motion.button>
              </div>
            </aside>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false)
          setSelectedPaymentType(null)
        }}
        onConfirm={() => selectedPaymentType && handleDelete(selectedPaymentType.id)}
        title="Delete Payment Type"
        message={`Are you sure you want to delete "${selectedPaymentType?.title}"? This action cannot be undone. If there are payments associated with this type, deletion will fail.`}
        type="danger"
        confirmText="Delete"
        cancelText="Cancel"
      />

      {/* Deactivate/Activate Confirmation */}
      <ConfirmDialog
        isOpen={showDeactivateConfirm}
        onClose={() => {
          setShowDeactivateConfirm(false)
          setSelectedPaymentType(null)
        }}
        onConfirm={() => {
          if (selectedPaymentType) {
            handleToggleActive(selectedPaymentType)
            setShowDeactivateConfirm(false)
          }
        }}
        title={selectedPaymentType?.is_active ? "Deactivate Payment Type" : "Activate Payment Type"}
        message={selectedPaymentType?.is_active 
          ? `Are you sure you want to deactivate "${selectedPaymentType?.title}"? Students will no longer be able to make payments for this due.`
          : `Are you sure you want to activate "${selectedPaymentType?.title}"? This will make it available for students to pay.`
        }
        type={selectedPaymentType?.is_active ? "warning" : "info"}
        confirmText={selectedPaymentType?.is_active ? "Deactivate" : "Activate"}
        cancelText="Cancel"
      />

      {/* Edit Confirmation */}
      <ConfirmDialog
        isOpen={showEditConfirm}
        onClose={() => {
          setShowEditConfirm(false)
          // Keep editingPaymentType so modal can open properly
        }}
        onConfirm={() => {
          setShowEditConfirm(false)
          setShowEditModal(true)
        }}
        title="Edit Payment Type"
        message={`You are about to edit "${editingPaymentType?.title}". Changes will affect all future and existing references to this payment type. Continue?`}
        type="info"
        confirmText="Continue to Edit"
        cancelText="Cancel"
      />
    </div>
  )
}

function DetailCell({
  label, value, tk, theme,
}: {
  label: string
  value: string
  tk: ReturnType<typeof getDashboardTokens>
  theme: 'light' | 'dark'
}) {
  return (
    <div
      className="p-2.5 rounded-lg text-center"
      style={{
        background: theme === 'light' ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${tk.cardBorder}`,
      }}
    >
      <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: tk.textTer }}>
        {label}
      </p>
      <p className="font-bold text-sm truncate" style={{ color: tk.text }}>
        {value}
      </p>
    </div>
  )
}

function ManageStat({
  label, value, icon, color, tk,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
  tk: ReturnType<typeof getDashboardTokens>
}) {
  return (
    <div
      className="rounded-2xl p-3 sm:p-4"
      style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18`, color }}
        >
          {icon}
        </span>
        <p className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: tk.textTer }}>
          {label}
        </p>
      </div>
      <p
        className="text-xl font-extrabold tabular-nums mt-2 truncate"
        style={{ color: tk.text }}
      >
        {value}
      </p>
    </div>
  )
}
