import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Heart, Users, Search, Check, X, Eye, Clock, Loader2, Gift, Filter, ChevronDown, Mail, Phone, MessageSquare, DollarSign, RefreshCw, CheckCircle, XCircle, ExternalLink } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { colors, gradients } from '@/config/colors'
import { supabase } from '@/config/supabase'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { formatNaira } from '@/utils/printStyles'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

interface PublicContribution {
  id: string
  payment_type_id: string | null
  contributor_name: string
  contributor_email: string | null
  contributor_phone: string | null
  amount: number
  message: string | null
  is_anonymous: boolean
  transaction_ref: string
  status: 'pending' | 'verified' | 'rejected'
  created_at: string
  verified_at: string | null
  verified_by: string | null
  payment_type?: {
    title: string
    icon: string
  }
}

type StatusFilter = 'all' | 'pending' | 'verified' | 'rejected'

export default function PublicContributionsPage() {
  const { hasPermission, user } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  
  const [contributions, setContributions] = useState<PublicContribution[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showFilterDropdown, setShowFilterDropdown] = useState(false)
  const [selectedContribution, setSelectedContribution] = useState<PublicContribution | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  
  // Confirmation dialog states
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    type: 'info' | 'warning' | 'danger' | 'success'
    onConfirm: () => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => {}
  })

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    verified: 0,
    rejected: 0,
    totalAmount: 0,
    verifiedAmount: 0
  })

  const fetchContributions = async () => {
    try {
      setLoading(true)
      
      let query = supabase
        .from('public_payments')
        .select(`
          *,
          payment_type:payment_types(title, icon)
        `)
        .order('created_at', { ascending: false })

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
      }

      const { data, error } = await query

      if (error) throw error

      setContributions(data || [])
      
      // Calculate stats
      const all = data || []
      setStats({
        total: all.length,
        pending: all.filter(c => c.status === 'pending').length,
        verified: all.filter(c => c.status === 'verified').length,
        rejected: all.filter(c => c.status === 'rejected').length,
        totalAmount: all.reduce((sum, c) => sum + c.amount, 0),
        verifiedAmount: all.filter(c => c.status === 'verified').reduce((sum, c) => sum + c.amount, 0)
      })
    } catch (err) {
      console.error('Error fetching contributions:', err)
      toast.error('Failed to load contributions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchContributions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchContributions()
    setRefreshing(false)
    toast.success('Refreshed!')
  }

  const handleStatusChange = async (id: string, newStatus: 'verified' | 'rejected') => {
    if (!hasPermission('can_approve_payments')) {
      toast.error('You do not have permission to manage contributions')
      return
    }

    setActionLoading(id)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        status: newStatus,
        verified_at: new Date().toISOString()
      }

      // Only set `verified_by` if the current user's id exists in the `users` table
      // to avoid foreign-key violations (Postgres 23503).
      if (user?.id) {
        const { data: existing, error: checkErr } = await supabase
          .from('users')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()

        if (checkErr) {
          console.warn('Error checking users table for verifier id:', checkErr)
        } else if (existing && existing.id) {
          payload.verified_by = user.id
        } else {
          console.warn('Current user id not found in users table; skipping verified_by to avoid FK error')
        }
      }

      const { error } = await supabase
        .from('public_payments')
        .update(payload)
        .eq('id', id)

      if (error) throw error

      if (newStatus === 'verified') {
        toast.success('Contribution verified!')
      } else {
        toast.error('Contribution rejected')
      }
      setSelectedContribution(null)
      fetchContributions()
    } catch (err) {
      console.error('Error updating status:', err)
      // Detect Postgres foreign-key violation and show actionable message
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (err && typeof err === 'object' && (err as any).code === '23503') {
        toast.error('Failed to update status: verifier id not present in users table (foreign-key violation). Use an admin/staff account.')
      } else {
        toast.error('Failed to update status')
      }
    } finally {
      setActionLoading(null)
    }
  }

  const confirmStatusChange = (id: string, newStatus: 'verified' | 'rejected') => {
    setConfirmDialog({
      isOpen: true,
      title: newStatus === 'verified' ? 'Verify Contribution?' : 'Reject Contribution?',
      message: newStatus === 'verified' 
        ? 'This will mark the contribution as verified and include it in the verified amount.'
        : 'This will mark the contribution as rejected. This action can be reversed later.',
      type: newStatus === 'verified' ? 'success' : 'danger',
      onConfirm: () => {
        handleStatusChange(id, newStatus)
      }
    })
  }

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return iso
    }
  }

  const formatCurrency = (value: number) => {
    try {
      return formatNaira(value)
    } catch {
      return `₦${value}`
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified': return colors.accentMint
      case 'rejected': return colors.error
      default: return colors.warning
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'verified': return CheckCircle
      case 'rejected': return XCircle
      default: return Clock
    }
  }

  const filteredContributions = contributions.filter((c) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      c.contributor_name?.toLowerCase().includes(q) ||
      c.transaction_ref?.toLowerCase().includes(q) ||
      (c.contributor_email || '').toLowerCase().includes(q) ||
      (c.contributor_phone || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="min-h-screen py-6 px-4" style={{ background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)' }}>
      <div className="max-w-6xl mx-auto">
        {/* Header - Mobile Responsive */}
        <motion.div 
          initial={{ opacity: 0, y: -20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="mb-6"
        >
          {/* Back Button - Full Width on Mobile */}
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex items-center gap-2 p-2 rounded-xl hover:bg-white/10 transition-colors mb-4"
            style={{ background: 'rgba(255, 255, 255, 0.05)' }}
          >
            <ArrowLeft className="w-5 h-5 text-white" />
            <span className="text-sm text-white">Back</span>
          </button>

          {/* Title Section */}
          <div className="mb-4">
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 mb-1">
              <Heart className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: colors.primary }} />
              Public Contributions
            </h1>
            <p className="text-xs sm:text-sm" style={{ color: colors.textSecondary }}>
              Manage donations from the public
            </p>
          </div>

          {/* Action Buttons - Stack on Mobile */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="w-full sm:w-auto">
              <motion.button 
                whileHover={{ scale: 1.02 }} 
                whileTap={{ scale: 0.98 }} 
                onClick={handleRefresh}
                disabled={refreshing}
                className="w-full px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-white font-medium text-sm"
                style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
              >
                <RefreshCw className={`w-4 h-4 text-white ${refreshing ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </motion.button>
            </div>

            <Link to="/contribute" target="_blank" className="w-full sm:w-auto">
              <motion.button 
                whileHover={{ scale: 1.02 }} 
                whileTap={{ scale: 0.98 }} 
                className="w-full px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-white font-medium text-sm" 
                style={{ background: gradients.primary }}
              >
                <ExternalLink className="w-4 h-4" />
                <span>View Page</span>
              </motion.button>
            </Link>
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl p-4" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${colors.primary}20` }}>
                <Gift className="w-5 h-5" style={{ color: colors.primary }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: colors.textSecondary }}>Total</p>
                <p className="text-xl font-bold text-white">{stats.total}</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl p-4" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${colors.warning}20` }}>
                <Clock className="w-5 h-5" style={{ color: colors.warning }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: colors.textSecondary }}>Pending</p>
                <p className="text-xl font-bold text-white">{stats.pending}</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl p-4" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${colors.accentMint}20` }}>
                <CheckCircle className="w-5 h-5" style={{ color: colors.accentMint }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: colors.textSecondary }}>Verified</p>
                <p className="text-xl font-bold text-white">{stats.verified}</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl p-4" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${colors.accentMint}20` }}>
                <DollarSign className="w-5 h-5" style={{ color: colors.accentMint }} />
              </div>
              <div>
                <p className="text-xs" style={{ color: colors.textSecondary }}>Verified Amount</p>
                <p className="text-lg font-bold" style={{ color: colors.accentMint }}>{formatCurrency(stats.verifiedAmount)}</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Search and Filter */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: colors.textSecondary }} />
            <input
              type="text"
              placeholder="Search by name, reference, email, phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
            />
          </div>
          
          <div className="relative">
            <button onClick={() => setShowFilterDropdown(!showFilterDropdown)} className="w-full sm:w-auto px-4 py-3 rounded-xl flex items-center justify-between gap-3 text-white" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4" style={{ color: colors.primary }} />
                <span className="text-sm capitalize">{statusFilter === 'all' ? 'All Status' : statusFilter}</span>
              </div>
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`} />
            </button>
            
            {showFilterDropdown && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden z-20" style={{ background: '#1a1a1a', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                {(['all', 'pending', 'verified', 'rejected'] as StatusFilter[]).map((status) => (
                  <button key={status} onClick={() => { setStatusFilter(status); setShowFilterDropdown(false); }} className={`w-full px-4 py-2.5 text-left text-sm hover:bg-white/10 transition-colors flex items-center gap-2 ${statusFilter === status ? 'bg-white/10' : ''}`} style={{ color: statusFilter === status ? colors.primary : 'white' }}>
                    {status === 'all' && <Users className="w-4 h-4" />}
                    {status === 'pending' && <Clock className="w-4 h-4" style={{ color: colors.warning }} />}
                    {status === 'verified' && <CheckCircle className="w-4 h-4" style={{ color: colors.accentMint }} />}
                    {status === 'rejected' && <XCircle className="w-4 h-4" style={{ color: colors.error }} />}
                    <span className="capitalize">{status === 'all' ? 'All Status' : status}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Contributions List */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: colors.primary }} />
            </div>
          ) : filteredContributions.length === 0 ? (
            <div className="rounded-2xl p-12 text-center" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <Gift className="w-16 h-16 mx-auto mb-4 opacity-30" style={{ color: colors.primary }} />
              <h3 className="text-lg font-semibold text-white mb-2">No Contributions Found</h3>
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                {searchQuery ? 'Try a different search term' : 'Public contributions will appear here'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredContributions.map((contribution, index) => {
                const StatusIcon = getStatusIcon(contribution.status)
                return (
                  <motion.div key={contribution.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.05 }} className="rounded-xl overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <div className="p-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0" style={{ background: `${getStatusColor(contribution.status)}15` }}>
                        {contribution.is_anonymous ? '🎭' : contribution.payment_type?.icon || '💝'}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-white truncate">
                            {contribution.contributor_name}
                          </h3>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium flex items-center gap-1`} style={{ background: `${getStatusColor(contribution.status)}20`, color: getStatusColor(contribution.status) }}>
                            <StatusIcon className="w-3 h-3" />
                            {contribution.status}
                          </span>
                        </div>
                        <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>
                          {contribution.payment_type?.title || 'General Donation'} • Ref: <span className="font-mono">{contribution.transaction_ref}</span>
                        </p>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>
                          {formatDate(contribution.created_at)}
                        </p>
                      </div>
                      
                      <div className="text-right shrink-0">
                        <p className="font-bold text-lg" style={{ color: colors.primary }}>{formatCurrency(contribution.amount)}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => setSelectedContribution(contribution)} className="p-2 rounded-lg hover:bg-white/10" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                            <Eye className="w-4 h-4 text-white" />
                          </motion.button>
                          {contribution.status === 'pending' && hasPermission('can_approve_payments') && (
                            <>
                              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => confirmStatusChange(contribution.id, 'verified')} disabled={actionLoading === contribution.id} className="p-2 rounded-lg" style={{ background: `${colors.accentMint}20` }}>
                                {actionLoading === contribution.id ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: colors.accentMint }} /> : <Check className="w-4 h-4" style={{ color: colors.accentMint }} />}
                              </motion.button>
                              <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => confirmStatusChange(contribution.id, 'rejected')} disabled={actionLoading === contribution.id} className="p-2 rounded-lg" style={{ background: `${colors.error}20` }}>
                                <X className="w-4 h-4" style={{ color: colors.error }} />
                              </motion.button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {contribution.message && (
                      <div className="px-4 pb-4">
                        <div className="p-3 rounded-lg flex items-start gap-2" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                          <MessageSquare className="w-4 h-4 shrink-0 mt-0.5" style={{ color: colors.textSecondary }} />
                          <p className="text-sm" style={{ color: colors.textSecondary }}>"{contribution.message}"</p>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
          )}
        </motion.div>

        {/* Detail Modal */}
        <AnimatePresence>
          {selectedContribution && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedContribution(null)}>
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl overflow-hidden max-h-[90vh] flex flex-col" style={{ background: '#1a1a1a', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                  <div className="p-5 sticky top-0 z-10" style={{ background: `linear-gradient(135deg, ${getStatusColor(selectedContribution.status)}15, transparent)` }}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-white">Contribution Details</h2>
                    <button onClick={() => setSelectedContribution(null)} className="p-2 rounded-lg hover:bg-white/10">
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                  
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl" style={{ background: `${colors.primary}20` }}>
                      {selectedContribution.is_anonymous ? '🎭' : '💝'}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">{selectedContribution.contributor_name}</h3>
                      <p className="text-2xl font-bold" style={{ color: colors.primary }}>{formatCurrency(selectedContribution.amount)}</p>
                    </div>
                  </div>
                </div>
                
                <div className="p-5 space-y-4" style={{ overflowY: 'auto', maxHeight: 'calc(90vh - 120px)' }}>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                      <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Status</p>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const StatusIcon = getStatusIcon(selectedContribution.status)
                          return <StatusIcon className="w-4 h-4" style={{ color: getStatusColor(selectedContribution.status) }} />
                        })()}
                        <span className="font-medium capitalize" style={{ color: getStatusColor(selectedContribution.status) }}>{selectedContribution.status}</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                      <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Type</p>
                      <p className="font-medium text-white">{selectedContribution.payment_type?.title || 'General'}</p>
                    </div>
                  </div>
                  
                  <div className="p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                    <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Reference</p>
                    <p className="font-mono font-medium text-white">{selectedContribution.transaction_ref}</p>
                  </div>
                  
                  {selectedContribution.contributor_email && (
                    <div className="p-3 rounded-lg flex items-center gap-3" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                      <Mail className="w-5 h-5" style={{ color: colors.accentCyan }} />
                      <div>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>Email</p>
                        <p className="font-medium text-white">{selectedContribution.contributor_email}</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedContribution.contributor_phone && (
                    <div className="p-3 rounded-lg flex items-center gap-3" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                      <Phone className="w-5 h-5" style={{ color: colors.accentMint }} />
                      <div>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>Phone</p>
                        <p className="font-medium text-white">{selectedContribution.contributor_phone}</p>
                      </div>
                    </div>
                  )}
                  
                  {selectedContribution.message && (
                    <div className="p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                      <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Message</p>
                      <p className="text-white">"{selectedContribution.message}"</p>
                    </div>
                  )}
                  
                  <div className="p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                    <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Date</p>
                    <p className="font-medium text-white">{formatDate(selectedContribution.created_at)}</p>
                  </div>
                  
                  {selectedContribution.status === 'pending' && hasPermission('can_approve_payments') && (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => confirmStatusChange(selectedContribution.id, 'rejected')} disabled={actionLoading === selectedContribution.id} className="py-3 rounded-xl font-medium flex items-center justify-center gap-2" style={{ background: `${colors.error}20`, color: colors.error }}>
                        <XCircle className="w-5 h-5" />Reject
                      </motion.button>
                      <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => confirmStatusChange(selectedContribution.id, 'verified')} disabled={actionLoading === selectedContribution.id} className="py-3 rounded-xl font-medium flex items-center justify-center gap-2 text-white" style={{ background: colors.accentMint }}>
                        {actionLoading === selectedContribution.id ? <Loader2 className="w-5 h-5 animate-spin" /> : <><CheckCircle className="w-5 h-5" />Verify</>}
                      </motion.button>
                    </div>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirmation Dialog */}
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type}
          confirmText="Continue"
          cancelText="Cancel"
        />
      </div>
    </div>
  )
}
