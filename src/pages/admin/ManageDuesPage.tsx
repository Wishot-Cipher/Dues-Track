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
import { formatDate } from '@/utils/formatters'
import Footer from '@/components/Footer'
import DashboardSwitcher from '@/components/DashboardSwitcher'
import { getDashboardTokens, useTheme } from '@/hooks/useTheme'
import { 
  CreditCard, 
  Edit3, 
  Trash2, 
  X, 
  AlertTriangle,
  RefreshCw,
  Sparkles,
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
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  
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
      let query = supabase
        .from('payment_types')
        .select('*')
        .order('created_at', { ascending: false })
      if (scope) {
        query = query.eq('organization_id', scope.orgId)
        query = query.eq('group_id', scope.groupId)
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
  }, [showError])

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
    <div className="min-h-screen relative overflow-hidden" style={{ background: tk.bgWash }}>
      {/* Background Grid Pattern */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(${colors.primary}40 1px, transparent 1px),
            linear-gradient(90deg, ${colors.primary}40 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Animated Gradient Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-30 animate-pulse"
          style={{
            background: `radial-gradient(circle, ${colors.primary} 0%, transparent 70%)`,
            top: '-10%',
            right: '-5%',
            animationDuration: '4s',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
          style={{
            background: `radial-gradient(circle, ${colors.accentMint} 0%, transparent 70%)`,
            bottom: '-5%',
            left: '-5%',
            animation: 'pulse 6s ease-in-out infinite',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8">
        {/* Dashboard Switcher — single-tenant only */}
        {!orgSlug && (
        <div className="mb-6">
          <DashboardSwitcher />
        </div>
        )}

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <GlassCard className="relative overflow-hidden">
            <div 
              className="absolute top-0 left-0 w-full h-1"
              style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accentMint}, transparent)` }}
            />
            
            <div className="relative z-10">
              <motion.button
                whileHover={{ x: -4 }}
                onClick={() => navigate('/admin/dashboard')}
                className="flex items-center gap-2 mb-4 px-4 py-2 rounded-xl transition-all"
                style={{ 
                  background: `${colors.primary}15`,
                  border: `1px solid ${colors.primary}30`,
                  color: colors.primary 
                }}
              >
                <ArrowLeft size={16} />
                <span className="font-medium">Back to Dashboard</span>
              </motion.button>

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className="relative"
                  >
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                      style={{
                        background: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`,
                        border: `1px solid ${colors.primary}40`,
                        boxShadow: `0 4px 20px ${colors.primary}20`
                      }}
                    >
                      <CreditCard className="w-7 h-7" style={{ color: colors.primary }} />
                    </div>
                  </motion.div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h1 className="text-xl lg:text-2xl font-bold text-white">Manage Dues</h1>
                      <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{ 
                          background: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`,
                          border: `1px solid ${colors.primary}40`,
                          color: colors.primary
                        }}
                      >
                        <Sparkles className="w-3 h-3" />
                        ADMIN
                      </motion.span>
                    </div>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                      View, edit, and manage all payment types
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={loadPaymentTypes}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all"
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: colors.textSecondary
                    }}
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Refresh</span>
                  </motion.button>
                  
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/admin/create-payment')}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all"
                    style={{
                      background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`,
                      color: 'white'
                    }}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create New</span>
                  </motion.button>
                </div>
              </div>

              {/* Stats Row */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-6">
                <div className="p-2 sm:p-3 rounded-xl text-center overflow-hidden" style={{ background: `${colors.primary}10`, border: `1px solid ${colors.primary}20` }}>
                  <div className="flex flex-col items-center justify-center mb-0.5 sm:mb-1">
                    <Tag className="w-3.5 h-3.5 sm:w-4 sm:h-4 mb-0.5" style={{ color: colors.primary }} />
                    <span className="text-[11px] sm:text-base font-bold leading-tight" style={{ color: colors.primary }}>{stats.total}</span>
                  </div>
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Total Dues</p>
                </div>
                <div className="p-2 sm:p-3 rounded-xl text-center overflow-hidden" style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                  <div className="flex flex-col items-center justify-center mb-0.5 sm:mb-1">
                    <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 mb-0.5" style={{ color: '#22C55E' }} />
                    <span className="text-[11px] sm:text-base font-bold leading-tight" style={{ color: '#22C55E' }}>{stats.active}</span>
                  </div>
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Active</p>
                </div>
                <div className="p-2 sm:p-3 rounded-xl text-center overflow-hidden" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
                  <div className="flex flex-col items-center justify-center mb-0.5 sm:mb-1">
                    <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 mb-0.5" style={{ color: colors.warning }} />
                    <span className="text-[11px] sm:text-base font-bold leading-tight truncate w-full" style={{ color: colors.warning }}>
                      ₦{stats.totalAmount.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[9px] sm:text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Total Value</p>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Search and Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6 relative z-20"
        >
          <GlassCard className="p-4 overflow-visible">
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: colors.textSecondary }} />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by title, description, category..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border text-white placeholder:text-gray-500 focus:outline-none focus:ring-2"
                  style={{ borderColor: 'rgba(255, 255, 255, 0.1)', outlineColor: colors.primary }}
                />
              </div>
              
              {/* Status Filter */}
              <ProfessionalDropdown
                value={filterStatus}
                onChange={(value) => setFilterStatus(value as 'all' | 'active' | 'inactive')}
                options={[
                  { value: 'all', label: 'All Status' },
                  { value: 'active', label: 'Active Only' },
                  { value: 'inactive', label: 'Inactive Only' }
                ]}
                placeholder="Status"
              />
              
              {/* Category Filter */}
              <ProfessionalDropdown
                value={filterCategory}
                onChange={(value) => setFilterCategory(typeof value === 'string' ? value : value[0] || 'all')}
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
          </GlassCard>
        </motion.div>

        {/* Payment Types List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <GlassCard className="relative overflow-hidden">
            <div className="px-6 pb-6">
              {loading && (
                <div className="text-center py-12">
                  <div className="w-12 h-12 mx-auto border-4 border-t-transparent rounded-full animate-spin mb-4"
                       style={{ borderColor: `${colors.primary}30`, borderTopColor: 'transparent' }} />
                  <p style={{ color: colors.textSecondary }}>Loading payment types...</p>
                </div>
              )}

              {!loading && filteredPaymentTypes.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-16"
                >
                  <div className="w-20 h-20 mx-auto mb-6 rounded-3xl flex items-center justify-center"
                       style={{ background: `${colors.primary}10`, border: `1px solid ${colors.primary}30` }}>
                    <CreditCard className="w-10 h-10" style={{ color: colors.primary }} />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">
                    {searchTerm || filterStatus !== 'all' || filterCategory !== 'all' ? 'No Results Found' : 'No Payment Types'}
                  </h3>
                  <p className="text-sm max-w-sm mx-auto mb-6" style={{ color: colors.textSecondary }}>
                    {searchTerm || filterStatus !== 'all' || filterCategory !== 'all' 
                      ? 'Try adjusting your search or filters.'
                      : 'Create your first payment type to get started.'}
                  </p>
                  {!searchTerm && filterStatus === 'all' && filterCategory === 'all' && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => navigate('/admin/create-payment')}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium"
                      style={{
                        background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`,
                        color: 'white'
                      }}
                    >
                      <Plus className="w-5 h-5" />
                      Create Payment Type
                    </motion.button>
                  )}
                </motion.div>
              )}

              {!loading && filteredPaymentTypes.length > 0 && (
                <div className="space-y-4 pt-6">
                  {filteredPaymentTypes.map((pt, index) => (
                    <motion.div
                      key={pt.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.02, 0.3) }}
                      className="rounded-xl overflow-hidden"
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: `1px solid ${pt.is_active ? 'rgba(255, 255, 255, 0.1)' : 'rgba(239, 68, 68, 0.3)'}`
                      }}
                    >
                      {/* Header with Icon and Title */}
                      <div 
                        className="p-4 flex items-center gap-4"
                        style={{ 
                          background: pt.is_active 
                            ? `linear-gradient(135deg, ${pt.color || colors.primary}15, transparent)` 
                            : 'linear-gradient(135deg, rgba(239, 68, 68, 0.1), transparent)'
                        }}
                      >
                        <div
                          className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-bold shrink-0"
                          style={{ 
                            background: `linear-gradient(135deg, ${pt.color || colors.primary}, ${pt.color || colors.primary}80)`
                          }}
                        >
                          {pt.icon || getCategoryIcon(pt.category)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white text-base truncate">{pt.title}</p>
                          <p className="text-2xl font-bold" style={{ color: pt.color || colors.primary }}>
                            ₦{(pt.amount || 0).toLocaleString()}
                          </p>
                        </div>
                        {/* Status Badge */}
                        <div
                          className="px-2 py-1 rounded-full text-[10px] font-medium shrink-0"
                          style={{
                            background: pt.is_active ? `${colors.statusPaid}20` : `${colors.statusUnpaid}20`,
                            color: pt.is_active ? colors.statusPaid : colors.statusUnpaid,
                            border: `1px solid ${pt.is_active ? `${colors.statusPaid}40` : `${colors.statusUnpaid}40`}`
                          }}
                        >
                          {pt.is_active ? '● Active' : '○ Inactive'}
                        </div>
                      </div>

                      {/* Category & Type Badges */}
                      <div className="px-4 pb-3">
                        <div className="flex flex-wrap gap-2">
                          <span 
                            className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5"
                            style={{ 
                              background: `${pt.color || colors.primary}25`, 
                              color: pt.color || colors.primary,
                              border: `1px solid ${pt.color || colors.primary}40`
                            }}
                          >
                            {getCategoryIcon(pt.category)}
                            {getCategoryLabel(pt.category)}
                          </span>
                          <span 
                            className="px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5"
                            style={{ 
                              background: 'rgba(255, 255, 255, 0.05)', 
                              color: colors.textSecondary,
                              border: '1px solid rgba(255, 255, 255, 0.1)'
                            }}
                          >
                            {pt.allow_partial ? '✓ Partial OK' : '⨉ Full Only'}
                          </span>
                          {pt.is_mandatory && (
                            <span 
                              className="px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5"
                              style={{ 
                                background: `${colors.warning}25`, 
                                color: colors.warning,
                                border: `1px solid ${colors.warning}40`
                              }}
                            >
                              ★ Required
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Description */}
                      {pt.description && (
                        <div className="px-4 pb-3">
                          <p className="text-sm leading-relaxed line-clamp-2" style={{ color: colors.textSecondary }}>
                            {pt.description}
                          </p>
                        </div>
                      )}

                      {/* Details Grid */}
                      <div className="px-4 pb-3">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="p-2.5 rounded-lg text-center" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: colors.textSecondary }}>Deadline</p>
                            <p className="text-white font-semibold text-sm">{formatDate(pt.deadline)}</p>
                          </div>
                          <div className="p-2.5 rounded-lg text-center" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: colors.textSecondary }}>Category</p>
                            <p className="text-white font-semibold text-sm capitalize">{pt.category || 'General'}</p>
                          </div>
                          <div className="p-2.5 rounded-lg text-center" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: colors.textSecondary }}>Late Fee / Day</p>
                            <p className="text-white font-semibold text-sm">{pt.late_fee_per_day ? `₦${Number(pt.late_fee_per_day).toLocaleString()}` : '₦0'}</p>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="p-4 pt-2 space-y-3" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        {/* Activate/Deactivate Button */}
                        <button
                          onClick={() => {
                            setSelectedPaymentType(pt)
                            setShowDeactivateConfirm(true)
                          }}
                          disabled={actionLoading}
                          className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50"
                          style={{
                            background: pt.is_active ? `${colors.statusUnpaid}15` : `${colors.statusPaid}15`,
                            color: pt.is_active ? colors.statusUnpaid : colors.statusPaid,
                            border: `1px solid ${pt.is_active ? `${colors.statusUnpaid}30` : `${colors.statusPaid}30`}`
                          }}
                        >
                          {pt.is_active ? '⏸ Deactivate Payment Type' : '▶ Activate Payment Type'}
                        </button>

                        {/* Edit/Delete Buttons */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => {
                              setSelectedPaymentType(pt)
                              setEditingPaymentType(normalizePaymentTypeToForm(pt))
                              setShowEditConfirm(true)
                            }}
                            className="p-3 rounded-xl transition-all active:scale-[0.95] flex items-center justify-center gap-2"
                            style={{ 
                              background: `${colors.primary}15`,
                              border: `1px solid ${colors.primary}30`
                            }}
                          >
                            <Edit3 className="w-4 h-4" style={{ color: colors.primary }} />
                            <span className="text-xs font-medium" style={{ color: colors.primary }}>Edit Details</span>
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPaymentType(pt)
                              setShowDeleteConfirm(true)
                            }}
                            className="p-3 rounded-xl transition-all active:scale-[0.95] flex items-center justify-center gap-2"
                            style={{ 
                              background: 'rgba(239, 68, 68, 0.1)',
                              border: '1px solid rgba(239, 68, 68, 0.2)'
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                            <span className="text-xs font-medium text-red-400">Delete</span>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </GlassCard>
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
