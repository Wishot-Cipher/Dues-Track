import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Heart, Building2, Save, Loader2, Settings, Info, ExternalLink, Users, DollarSign, CheckCircle, RefreshCw, Edit3, Sparkles, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAppNav } from '@/hooks/useAppNav';
import { colors, gradients } from '@/config/colors'
import { supabase } from '@/config/supabase'
import { useToast } from '@/hooks/useToast'
import { getOrgScope } from '@/utils/orgScope'
import GlassCard from '@/components/ui/GlassCard'
import Modal from '@/components/ui/Modal'
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { PrivacyMask } from '@/components/ui/PrivacyMask'

interface BankDetails {
  bank_name: string
  account_name: string
  account_number: string
}

interface ClassInfo {
  class_name: string
  department: string
  institution: string
  tagline: string
}

interface DonationStats {
  totalContributions: number
  pendingContributions: number
  totalAmount: number
  verifiedAmount: number
}

const NIGERIAN_BANKS = [
  'Access Bank', 'Citibank', 'Ecobank', 'Fidelity Bank', 'First Bank of Nigeria',
  'First City Monument Bank (FCMB)', 'Globus Bank', 'Guaranty Trust Bank (GTBank)',
  'Heritage Bank', 'Jaiz Bank', 'Keystone Bank', 'Kuda Bank', 'Opay',
  'Palmpay', 'Parallex Bank', 'Polaris Bank', 'Providus Bank', 'Stanbic IBTC Bank',
  'Standard Chartered Bank', 'Sterling Bank', 'SunTrust Bank', 'Titan Trust Bank',
  'Union Bank of Nigeria', 'United Bank for Africa (UBA)', 'Unity Bank', 'VFD Microfinance Bank',
  'Wema Bank', 'Zenith Bank','Moniepoint', 'Other'
]

export default function DonationSettingsPage() {
  const toast = useToast()
  const { go: navigate, path } = useAppNav();
  
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editMode, setEditMode] = useState<'bank' | 'class' | null>(null)
  
  const [bankDetails, setBankDetails] = useState<BankDetails>({
    bank_name: 'First Bank of Nigeria',
    account_name: 'ECE Class Account',
    account_number: ''
  })
  
  const [classInfo, setClassInfo] = useState<ClassInfo>({
    class_name: 'Electronic & Computer Engineering Class',
    department: 'ECE Department',
    institution: 'University',
    tagline: 'Every contribution makes a difference'
  })
  
  const [stats, setStats] = useState<DonationStats>({
    totalContributions: 0,
    pendingContributions: 0,
    totalAmount: 0,
    verifiedAmount: 0
  })

  const fetchData = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      setLoading(true)
      
      const scope = getOrgScope();
      let settingsQ = supabase
        .from('general_settings')
        .select('key, value')
        .in('key', ['donation_bank_details', 'class_info']);
      if (scope) settingsQ = settingsQ.eq('organization_id', scope.orgId);

      let contribQ = supabase
        .from('public_payments')
        .select('amount, status');
      if (scope) contribQ = contribQ.eq('organization_id', scope.orgId);

      const [settingsRes, contributionsRes] = await Promise.all([
        settingsQ,
        contribQ
      ])
      
      // Process settings
      if (settingsRes.data) {
        for (const setting of settingsRes.data) {
          if (setting.key === 'donation_bank_details' && setting.value) {
            setBankDetails(setting.value as BankDetails)
          }
          if (setting.key === 'class_info' && setting.value) {
            setClassInfo(setting.value as ClassInfo)
          }
        }
      }
      
      // Calculate stats
      if (contributionsRes.data) {
        const all = contributionsRes.data
        setStats({
          totalContributions: all.length,
          pendingContributions: all.filter(c => c.status === 'pending').length,
          totalAmount: all.reduce((sum, c) => sum + c.amount, 0),
          verifiedAmount: all.filter(c => c.status === 'verified').reduce((sum, c) => sum + c.amount, 0)
        })
      }
    } catch (err) {
      console.error('Error fetching data:', err)
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [toast])

  // Confirmation modal states
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [modalConfig, setModalConfig] = useState<{
    title: string
    message: string
    action: () => Promise<void>
    variant: 'primary' | 'danger' | 'warning'
  }>({
    title: '',
    message: '',
    action: async () => {},
    variant: 'primary'
  })

  // Open confirmation modal helper
  const openConfirmModal = (
    title: string,
    message: string,
    action: () => Promise<void>,
    variant: 'primary' | 'danger' | 'warning' = 'primary'
  ) => {
    setModalConfig({ title, message, action, variant })
    setShowConfirmModal(true)
  }

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await modalConfig.action()
    } catch (err) {
      console.error('Action failed:', err)
    } finally {
      setSaving(false)
      setShowConfirmModal(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const saveBankDetails = async () => {
    if (!bankDetails.account_number.trim()) {
      toast.error('Account number is required')
      return
    }
    
    setSaving(true)
    try {
      const scope = getOrgScope();
      const upsertData: Record<string, unknown> = {
        key: 'donation_bank_details',
        value: bankDetails,
        updated_at: new Date().toISOString()
      };
      if (scope) upsertData.organization_id = scope.orgId;
      const { error } = await supabase
        .from('general_settings')
        .upsert(upsertData, { onConflict: scope ? 'key,organization_id' : 'key' })
      
      if (error) throw error
      
      toast.success('Bank details saved!')
      setEditMode(null)
    } catch (err) {
      console.error('Error saving:', err)
      toast.error('Failed to save bank details')
    } finally {
      setSaving(false)
    }
  }

  const saveClassInfo = async () => {
    if (!classInfo.class_name.trim()) {
      toast.error('Class name is required')
      return
    }
    
    setSaving(true)
    try {
      const scope = getOrgScope();
      const upsertData: Record<string, unknown> = {
        key: 'class_info',
        value: classInfo,
        updated_at: new Date().toISOString()
      };
      if (scope) upsertData.organization_id = scope.orgId;
      const { error } = await supabase
        .from('general_settings')
        .upsert(upsertData, { onConflict: scope ? 'key,organization_id' : 'key' })
      
      if (error) throw error
      
      toast.success('Class info saved!')
      setEditMode(null)
    } catch (err) {
      console.error('Error saving:', err)
      toast.error('Failed to save class info')
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (amount: number) => `₦${amount.toLocaleString()}`

  if (loading) {
    return <LoadingSpinner fullScreen text="Loading settings..." />
  }

  return (
    <div className="min-h-screen py-6 px-4" style={{ background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)' }}>
      <div className="max-w-4xl mx-auto">
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
              <Settings className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: colors.primary }} />
              Donation Settings
            </h1>
            <p className="text-xs sm:text-sm" style={{ color: colors.textSecondary }}>
              Configure public donation page
            </p>
          </div>

          {/* Action Buttons - Stack on Mobile */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <Link to={path('/admin/contributions')} className="flex-1 sm:flex-none">
              <motion.button 
                whileHover={{ scale: 1.02 }} 
                whileTap={{ scale: 0.98 }} 
                className="w-full px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-white font-medium text-sm" 
                style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
              >
                <Users className="w-4 h-4" />
                <span>View Contributions</span>
              </motion.button>
            </Link>
            
            <Link to={path('/contribute')} target="_blank" className="flex-1 sm:flex-none">
              <motion.button 
                whileHover={{ scale: 1.02 }} 
                whileTap={{ scale: 0.98 }} 
                className="w-full px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 text-white font-medium text-sm" 
                style={{ background: gradients.primary }}
              >
                <ExternalLink className="w-4 h-4" />
                <span>Preview Page</span>
              </motion.button>
            </Link>
          </div>
        </motion.div>

        {/* Stats Cards - Better Mobile Layout */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.1 }} 
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6"
        >
          <div className="rounded-xl p-3 sm:p-4" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center" style={{ background: `${colors.primary}20` }}>
                <Heart className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: colors.primary }} />
              </div>
              <div>
                <p className="text-[10px] sm:text-xs" style={{ color: colors.textSecondary }}>Total</p>
                <p className="text-lg sm:text-xl font-bold text-white">{stats.totalContributions}</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl p-3 sm:p-4" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center" style={{ background: `${colors.warning}20` }}>
                <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: colors.warning }} />
              </div>
              <div>
                <p className="text-[10px] sm:text-xs" style={{ color: colors.textSecondary }}>Pending</p>
                <p className="text-lg sm:text-xl font-bold text-white">{stats.pendingContributions}</p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl p-3 sm:p-4" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center" style={{ background: `${colors.accentMint}20` }}>
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: colors.accentMint }} />
              </div>
              <div>
                <p className="text-[10px] sm:text-xs" style={{ color: colors.textSecondary }}>Verified</p>
                <p className="text-lg sm:text-xl font-bold" style={{ color: colors.accentMint }}><PrivacyMask>{formatCurrency(stats.verifiedAmount)}</PrivacyMask></p>
              </div>
            </div>
          </div>
          
          <div className="rounded-xl p-3 sm:p-4" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center" style={{ background: `${colors.accentCyan}20` }}>
                <DollarSign className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: colors.accentCyan }} />
              </div>
              <div>
                <p className="text-[10px] sm:text-xs" style={{ color: colors.textSecondary }}>Total Amount</p>
                <p className="text-lg sm:text-xl font-bold" style={{ color: colors.accentCyan }}><PrivacyMask>{formatCurrency(stats.totalAmount)}</PrivacyMask></p>
              </div>
            </div>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Bank Details Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <GlassCard className="h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.accentMint}15`, border: `1px solid ${colors.accentMint}30` }}>
                    <Building2 className="w-5 h-5" style={{ color: colors.accentMint }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Bank Account</h2>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>For general donations</p>
                  </div>
                </div>
                {editMode !== 'bank' && (
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setEditMode('bank')} className="p-2 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                    <Edit3 className="w-4 h-4 text-white" />
                  </motion.button>
                )}
              </div>

              {editMode === 'bank' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Bank Name</label>
                    <ProfessionalDropdown
                      label=""
                      placeholder="Select bank"
                      value={bankDetails.bank_name}
                      onChange={(val) => setBankDetails({ ...bankDetails, bank_name: val as string })}
                      options={NIGERIAN_BANKS.map(bank => ({ value: bank, label: bank }))}
                      searchable
                      variant="outlined"
                      size="md"
                      icon={<Building2 className="w-4 h-4" />}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Account Name</label>
                    <input type="text" value={bankDetails.account_name} onChange={(e) => setBankDetails({ ...bankDetails, account_name: e.target.value })} placeholder="e.g. CSC Class Account" className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }} />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Account Number</label>
                    <input type="text" value={bankDetails.account_number} onChange={(e) => setBankDetails({ ...bankDetails, account_number: e.target.value })} placeholder="10-digit account number" maxLength={10} className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 font-mono text-lg tracking-widest" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }} />
                  </div>
                  
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => openConfirmModal('Discard changes?', 'Are you sure you want to discard your edits?', async () => { setEditMode(null) }, 'warning')} className="flex-1 py-2.5 rounded-xl font-medium text-sm" style={{ background: 'rgba(255, 255, 255, 0.05)', color: colors.textSecondary }}>Cancel</button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => openConfirmModal('Save bank details?', 'Save the bank details you entered?', saveBankDetails, 'primary')} disabled={saving} className="flex-1 py-2.5 rounded-xl font-medium text-sm text-white flex items-center justify-center gap-2" style={{ background: gradients.primary }}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" />Save</>}
                    </motion.button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Bank</p>
                    <p className="font-medium text-white">{bankDetails.bank_name}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Account Name</p>
                    <p className="font-medium text-white">{bankDetails.account_name}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ background: `${colors.primary}10`, border: `1px solid ${colors.primary}30` }}>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Account Number</p>
                    <p className="font-bold text-xl text-white tracking-widest font-mono">{bankDetails.account_number || '—'}</p>
                  </div>
                </div>
              )}
            </GlassCard>
          </motion.div>

          {/* Class Info Card */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <GlassCard className="h-full">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.primary}15`, border: `1px solid ${colors.primary}30` }}>
                    <Sparkles className="w-5 h-5" style={{ color: colors.primary }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Class Info</h2>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Displayed on donation page</p>
                  </div>
                </div>
                {editMode !== 'class' && (
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setEditMode('class')} className="p-2 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                    <Edit3 className="w-4 h-4 text-white" />
                  </motion.button>
                )}
              </div>

              {editMode === 'class' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Class Name</label>
                    <input type="text" value={classInfo.class_name} onChange={(e) => setClassInfo({ ...classInfo, class_name: e.target.value })} placeholder="e.g. Computer Science Class" className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }} />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Department</label>
                    <input type="text" value={classInfo.department} onChange={(e) => setClassInfo({ ...classInfo, department: e.target.value })} placeholder="e.g. Computer Science" className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }} />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">Tagline</label>
                    <input type="text" value={classInfo.tagline} onChange={(e) => setClassInfo({ ...classInfo, tagline: e.target.value })} placeholder="e.g. Every contribution makes a difference" className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }} />
                  </div>
                  
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => openConfirmModal('Discard changes?', 'Are you sure you want to discard your edits?', async () => { setEditMode(null) }, 'warning')} className="flex-1 py-2.5 rounded-xl font-medium text-sm" style={{ background: 'rgba(255, 255, 255, 0.05)', color: colors.textSecondary }}>Cancel</button>
                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => openConfirmModal('Save class info?', 'Save the class information you entered?', saveClassInfo, 'primary')} disabled={saving} className="flex-1 py-2.5 rounded-xl font-medium text-sm text-white flex items-center justify-center gap-2" style={{ background: gradients.primary }}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4" />Save</>}
                    </motion.button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Class Name</p>
                    <p className="font-medium text-white">{classInfo.class_name}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Department</p>
                    <p className="font-medium text-white">{classInfo.department}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ background: `${colors.warning}10`, border: `1px solid ${colors.warning}30` }}>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Tagline</p>
                    <p className="font-medium text-white italic">"{classInfo.tagline}"</p>
                  </div>
                </div>
              )}
            </GlassCard>
          </motion.div>
        </div>

        {/* Info Box */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-6">
          <div className="rounded-xl p-4 flex items-start gap-3" style={{ background: `${colors.accentCyan}10`, border: `1px solid ${colors.accentCyan}30` }}>
            <Info className="w-5 h-5 shrink-0 mt-0.5" style={{ color: colors.accentCyan }} />
            <div className="text-sm" style={{ color: colors.textSecondary }}>
              <p className="font-medium text-white mb-1">How it works:</p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Public visitors can donate via <Link to={path('/contribute')} target="_blank" className="underline" style={{ color: colors.primary }}>/contribute</Link></li>
                <li>They'll see the bank details you configure here for general donations</li>
                <li>You can also create specific campaigns by marking payment types as "Public" in <Link to={path('/admin/manage-dues')} className="underline" style={{ color: colors.primary }}>Manage Dues</Link></li>
                <li>Review pending contributions in <Link to={path('/admin/contributions')} className="underline" style={{ color: colors.primary }}>View Contributions</Link></li>
              </ul>
            </div>
          </div>
        </motion.div>

        {showConfirmModal && (
          <Modal isOpen={showConfirmModal} onClose={() => setShowConfirmModal(false)} title={modalConfig.title} footer={
            <>
              <button onClick={() => setShowConfirmModal(false)} className="py-2 px-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.05)', color: colors.textSecondary }}>Cancel</button>
              <motion.button onClick={handleConfirm} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} disabled={saving} className="py-2 px-4 rounded-xl font-medium text-white" style={{ background: gradients.primary }}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm'}
              </motion.button>
            </>
          }>
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg" style={{ background: `${colors.warning}10`, border: `1px solid ${colors.warning}30` }}>
                <AlertTriangle className="w-6 h-6" style={{ color: colors.warning }} />
              </div>
              <div>
                <p className="font-semibold text-lg text-white">{modalConfig.title}</p>
                <p className="text-sm" style={{ color: colors.textSecondary }}>{modalConfig.message}</p>
              </div>
            </div>
          </Modal>
        )}

      </div>
    </div>
  )
}
