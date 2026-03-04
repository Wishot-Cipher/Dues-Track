import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, Users, Copy, Check, ExternalLink, ArrowRight, Star, Zap, Shield, CreditCard, Building2, CheckCircle, Info, Loader2, AlertCircle, ChevronRight, Banknote, GraduationCap, Clock, Mail, Phone, User, MessageSquare, Gift, Sparkles } from 'lucide-react'
import { colors, gradients } from '@/config/colors'
import { supabase } from '@/config/supabase'
import { useToast } from '@/hooks/useToast'

interface PublicPaymentType {
  id: string
  title: string
  description: string
  amount: number
  allow_partial: boolean
  bank_name: string
  account_name: string
  account_number: string
  icon: string
  color: string
  deadline: string
}

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

// Default values (will be replaced by DB values)
const DEFAULT_BANK_DETAILS: BankDetails = {
  bank_name: 'First Bank of Nigeria',
  account_name: 'ECE Class Account',
  account_number: '3087654321'
}

const DEFAULT_CLASS_INFO: ClassInfo = {
  class_name: 'Electronic & Computer Engineering Class',
  department: 'ECE Department',
  institution: 'University',
  tagline: 'Every contribution makes a difference'
}

const SUGGESTED_AMOUNTS = [500, 1000, 2000, 5000, 10000, 20000]

export default function ContributePage() {
  const { success: toastSuccess, error: toastError } = useToast()
  const { orgSlug } = useParams<{ orgSlug: string }>()
  
  const [publicPaymentTypes, setPublicPaymentTypes] = useState<PublicPaymentType[]>([])
  const [selectedPaymentType, setSelectedPaymentType] = useState<PublicPaymentType | null>(null)
  const [loading, setLoading] = useState(true)
  const [isGeneralDonation, setIsGeneralDonation] = useState(false)
  
  // Settings from DB
  const [donationBankDetails, setDonationBankDetails] = useState<BankDetails>(DEFAULT_BANK_DETAILS)
  const [classInfo, setClassInfo] = useState<ClassInfo>(DEFAULT_CLASS_INFO)
  
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState('')
  const [contributorName, setContributorName] = useState('')
  const [contributorEmail, setContributorEmail] = useState('')
  const [contributorPhone, setContributorPhone] = useState('')
  const [message, setMessage] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [contributionRef, setContributionRef] = useState('')
  const [step, setStep] = useState<'select' | 'amount' | 'details' | 'payment'>('select')

  useEffect(() => {
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Strict org enforcement - must have org slug
      if (!orgSlug) {
        setLoading(false)
        return
      }

      // Look up org by slug for data isolation
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, short_name, organization_type')
        .eq('slug', orgSlug)
        .eq('is_active', true)
        .single();
      
      if (!org) {
        setLoading(false)
        return
      }

      const orgId = org.id;

      // Update class info with actual org data
      setClassInfo(prev => ({
        ...prev,
        class_name: org.name,
        department: org.short_name || prev.department,
        institution: org.organization_type || prev.institution,
      }))
      
      // Fetch public payment types and settings in parallel (scoped to org)
      const ptQ = supabase
        .from('payment_types')
        .select('id, title, description, amount, allow_partial, bank_name, account_name, account_number, icon, color, deadline')
        .eq('is_public', true)
        .eq('is_active', true)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

      const settQ = supabase
        .from('general_settings')
        .select('key, value')
        .in('key', ['donation_bank_details', 'class_info'])
        .eq('organization_id', orgId);

      const [paymentTypesRes, settingsRes] = await Promise.all([ptQ, settQ])
      
      setPublicPaymentTypes(paymentTypesRes.data || [])
      
      // Process settings
      if (settingsRes.data) {
        for (const setting of settingsRes.data) {
          if (setting.key === 'donation_bank_details' && setting.value) {
            setDonationBankDetails(setting.value as BankDetails)
          }
          if (setting.key === 'class_info' && setting.value) {
            setClassInfo(setting.value as ClassInfo)
          }
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err)
    } finally {
      setLoading(false)
    }
  }

  const generateRef = () => {
    const ref = `DON-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    setContributionRef(ref)
    return ref
  }

  const getFinalAmount = () => {
    if (customAmount) return parseInt(customAmount) || 0
    return selectedAmount || 0
  }

  const getBankDetails = () => {
    if (selectedPaymentType) {
      return {
        bank_name: selectedPaymentType.bank_name,
        account_name: selectedPaymentType.account_name,
        account_number: selectedPaymentType.account_number
      }
    }
    return donationBankDetails
  }

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
      toastSuccess('Copied!')
    } catch {
      toastError('Failed to copy')
    }
  }

  const handleSelectCampaign = (pt: PublicPaymentType) => {
    setSelectedPaymentType(pt)
    setIsGeneralDonation(false)
    // Auto-fill the amount if the payment type has a set amount
    if (pt.amount > 0 && !pt.allow_partial) {
      setSelectedAmount(pt.amount)
      setCustomAmount('')
    } else if (pt.amount > 0 && pt.allow_partial) {
      // For partial payments, pre-fill amount as suggestion
      setSelectedAmount(pt.amount)
      setCustomAmount('')
    } else {
      setSelectedAmount(null)
      setCustomAmount('')
    }
    setStep('amount')
  }

  const handleGeneralDonation = () => {
    setSelectedPaymentType(null)
    setIsGeneralDonation(true)
    setSelectedAmount(null)
    setCustomAmount('')
    setStep('amount')
  }

  const handleAmountContinue = () => {
    if (getFinalAmount() < 100) {
      toastError('Minimum contribution is ₦100')
      return
    }
    setStep('details')
  }

  const handleDetailsContinue = () => {
    if (!isAnonymous && !contributorName.trim()) {
      toastError('Please enter your name or choose anonymous')
      return
    }
    generateRef()
    setStep('payment')
  }

  const handleSubmitContribution = async () => {
    const amount = getFinalAmount()
    setSubmitting(true)
    
    try {
      // Look up org by slug for data isolation
      if (!orgSlug) {
        toastError('Organization not found')
        return
      }

      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .single();
      
      if (!org) {
        toastError('Organization not found')
        return
      }

      await supabase.from('public_payments').insert({
        payment_type_id: selectedPaymentType?.id || null,
        contributor_name: isAnonymous ? 'Anonymous' : contributorName.trim(),
        contributor_email: contributorEmail.trim() || null,
        contributor_phone: contributorPhone.trim() || null,
        amount: amount,
        message: message.trim() || null,
        is_anonymous: isAnonymous,
        transaction_ref: contributionRef,
        status: 'pending',
        organization_id: org.id,
      });
      setShowSuccess(true)
      toastSuccess('Contribution recorded!')
    } catch (err) {
      console.error('Error:', err)
      setShowSuccess(true)
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setShowSuccess(false)
    setSelectedPaymentType(null)
    setIsGeneralDonation(false)
    setSelectedAmount(null)
    setCustomAmount('')
    setContributorName('')
    setContributorEmail('')
    setContributorPhone('')
    setMessage('')
    setIsAnonymous(false)
    setStep('select')
    setContributionRef('')
  }

  const formatCurrency = (amount: number) => `₦${amount.toLocaleString()}`

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)' }}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <Loader2 className="w-10 h-10 mx-auto mb-3 animate-spin" style={{ color: colors.primary }} />
          <p className="text-sm text-white/70 font-medium">Loading contribution page...</p>
        </motion.div>
      </div>
    )
  }

  // No org slug or org not found
  if (!orgSlug) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)' }}>
        <div className="text-center max-w-sm">
          <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: colors.primary }} />
          <h2 className="text-xl font-bold text-white mb-2">Organization Required</h2>
          <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
            This contribution page is specific to an organization. Please use the link provided by your organization.
          </p>
          <a href="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white" style={{ background: gradients.primary }}>
            Go to Homepage <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    )
  }

  const bankDetails = getBankDetails()

  return (
    <div className="min-h-screen py-6 px-4 relative overflow-hidden" style={{ background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)' }}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-96 h-96 opacity-20 blur-3xl" style={{ background: gradients.radialWarm }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 opacity-15 blur-3xl" style={{ background: gradients.radialMint }} />
      </div>

      <div className="max-w-lg mx-auto relative z-10">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-3" style={{ background: `linear-gradient(135deg, ${colors.primary}30, ${colors.accentMint}20)`, border: `2px solid ${colors.primary}40`, boxShadow: `0 0 30px ${colors.primary}30` }}>
            <Heart className="w-8 h-8" style={{ color: colors.primary }} />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Support {classInfo.class_name}</h1>
          <p className="text-sm" style={{ color: colors.textSecondary }}>{classInfo.tagline}</p>
          
          <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium" style={{ background: `${colors.accentMint}15`, color: colors.accentMint }}>
              <Shield className="w-3 h-3" />Secure
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium" style={{ background: `${colors.primary}15`, color: colors.primary }}>
              <Zap className="w-3 h-3" />Instant
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium" style={{ background: `${colors.warning}15`, color: colors.warning }}>
              <Star className="w-3 h-3" />Verified
            </span>
          </div>
        </motion.div>

        {/* Progress Steps */}
        {!showSuccess && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
            <div className="flex items-center justify-center gap-2">
              {['select', 'amount', 'details', 'payment'].map((s, i) => {
                const stepIndex = ['select', 'amount', 'details', 'payment'].indexOf(step)
                const isActive = i === stepIndex
                const isComplete = i < stepIndex
                return (
                  <div key={s} className="flex items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${isActive ? 'scale-110' : ''}`} style={{ background: isComplete ? colors.accentMint : isActive ? colors.primary : 'rgba(255,255,255,0.1)', color: isComplete || isActive ? 'white' : colors.textSecondary }}>
                      {isComplete ? <Check className="w-4 h-4" /> : i + 1}
                    </div>
                    {i < 3 && <div className="w-8 h-0.5 mx-1" style={{ background: isComplete ? colors.accentMint : 'rgba(255,255,255,0.1)' }} />}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {showSuccess ? (
            /* Success Screen */
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div className="p-6 text-center" style={{ background: `linear-gradient(135deg, ${colors.accentMint}10, transparent)` }}>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2 }} className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-3" style={{ background: `${colors.accentMint}20`, border: `2px solid ${colors.accentMint}40` }}>
                  <CheckCircle className="w-8 h-8" style={{ color: colors.accentMint }} />
                </motion.div>
                <h2 className="text-xl font-bold text-white mb-1">Thank You! 🎉</h2>
                <p className="text-sm" style={{ color: colors.textSecondary }}>Complete your payment of <span className="font-bold" style={{ color: colors.primary }}>{formatCurrency(getFinalAmount())}</span></p>
                
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer hover:opacity-80" style={{ background: 'rgba(255, 255, 255, 0.08)' }} onClick={() => copyToClipboard(contributionRef, 'ref')}>
                  <span className="text-[10px]" style={{ color: colors.textSecondary }}>Ref:</span>
                  <span className="font-mono font-bold text-sm text-white">{contributionRef}</span>
                  {copiedField === 'ref' ? <Check className="w-3.5 h-3.5" style={{ color: colors.accentMint }} /> : <Copy className="w-3.5 h-3.5" style={{ color: colors.textSecondary }} />}
                </div>
              </div>
              
              <div className="p-5 space-y-4">
                <div className="flex items-center gap-2 text-white font-medium text-sm">
                  <Info className="w-4 h-4" style={{ color: colors.warning }} />Transfer to:
                </div>
                
                <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                  <div className="px-4 py-3 flex items-center gap-3" style={{ background: `${colors.primary}15`, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <Building2 className="w-5 h-5" style={{ color: colors.primary }} />
                    <span className="font-semibold text-white">{bankDetails.bank_name}</span>
                  </div>
                  
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-white/5" style={{ background: 'rgba(255, 255, 255, 0.03)' }} onClick={() => copyToClipboard(bankDetails.account_name, 'name')}>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Account Name</p>
                        <p className="font-medium text-white">{bankDetails.account_name}</p>
                      </div>
                      {copiedField === 'name' ? <Check className="w-4 h-4" style={{ color: colors.accentMint }} /> : <Copy className="w-4 h-4" style={{ color: colors.textSecondary }} />}
                    </div>
                    
                    <div className="flex items-center justify-between p-4 rounded-xl cursor-pointer hover:opacity-90" style={{ background: `linear-gradient(135deg, ${colors.primary}20, ${colors.primary}10)`, border: `1px solid ${colors.primary}40` }} onClick={() => copyToClipboard(bankDetails.account_number, 'number')}>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Account Number</p>
                        <p className="font-bold text-lg sm:text-2xl text-white tracking-wider sm:tracking-widest truncate">{bankDetails.account_number}</p>
                      </div>
                      <div className="p-2 rounded-lg" style={{ background: `${colors.primary}30` }}>
                        {copiedField === 'number' ? <Check className="w-5 h-5" style={{ color: colors.accentMint }} /> : <Copy className="w-5 h-5" style={{ color: colors.primary }} />}
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: `${colors.accentMint}10`, border: `1px solid ${colors.accentMint}30` }}>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Amount</p>
                        <p className="font-bold text-xl" style={{ color: colors.accentMint }}>{formatCurrency(getFinalAmount())}</p>
                      </div>
                      <Banknote className="w-6 h-6" style={{ color: colors.accentMint }} />
                    </div>
                  </div>
                </div>
                
                <div className="p-3 rounded-xl flex items-start gap-2.5" style={{ background: `${colors.warning}10`, border: `1px solid ${colors.warning}20` }}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: colors.warning }} />
                  <div className="text-xs" style={{ color: colors.textSecondary }}>
                    <p className="font-medium text-white mb-1">Important:</p>
                    <ul className="space-y-0.5">
                      <li>• Use <span className="font-mono font-bold">{contributionRef}</span> as payment narration</li>
                      <li>• Contribution will be verified within 24 hours</li>
                    </ul>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={resetForm} className="py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: colors.textSecondary }}>
                    <Heart className="w-4 h-4" />Donate Again
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => window.location.href = orgSlug ? `/${orgSlug}/login` : '/login'} className="py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 text-white" style={{ background: gradients.primary }}>
                    Member Login<ExternalLink className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ) : step === 'select' ? (
            /* Step 1: Select Campaign or General Donation */
            <motion.div key="select" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
              {/* General Donation Option - Always Available */}
              <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleGeneralDonation} className="w-full rounded-2xl overflow-hidden text-left" style={{ background: `linear-gradient(135deg, ${colors.primary}15, ${colors.accentMint}10)`, border: `2px solid ${colors.primary}30` }}>
                <div className="p-5 flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${colors.primary}30, ${colors.accentMint}20)` }}>
                    <Gift className="w-8 h-8" style={{ color: colors.primary }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-bold text-white text-lg">General Donation</h3>
                      <Sparkles className="w-4 h-4" style={{ color: colors.warning }} />
                    </div>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>Contribute any amount to support the class</p>
                  </div>
                  <ChevronRight className="w-6 h-6" style={{ color: colors.primary }} />
                </div>
              </motion.button>

              {/* Specific Campaigns */}
              {publicPaymentTypes.length > 0 && (
                <>
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
                    <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>OR SUPPORT A CAMPAIGN</span>
                    <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
                  </div>

                  {publicPaymentTypes.map((pt, index) => (
                    <motion.button key={pt.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: (index + 1) * 0.1 }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => handleSelectCampaign(pt)} className="w-full rounded-2xl overflow-hidden text-left" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      <div className="p-4 flex items-start gap-4" style={{ background: `linear-gradient(135deg, ${pt.color || colors.primary}15, transparent)` }}>
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl shrink-0" style={{ background: `${pt.color || colors.primary}20`, border: `1px solid ${pt.color || colors.primary}30` }}>
                          {pt.icon || '💰'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-white mb-1">{pt.title}</h3>
                          <p className="text-xs line-clamp-2 mb-2" style={{ color: colors.textSecondary }}>{pt.description || 'Support this initiative'}</p>
                          <div className="flex items-center gap-3 flex-wrap">
                            {pt.amount > 0 && <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: `${colors.accentMint}15`, color: colors.accentMint }}>Target: {formatCurrency(pt.amount)}</span>}
                            {pt.deadline && <span className="text-xs flex items-center gap-1" style={{ color: colors.textSecondary }}><Clock className="w-3 h-3" />{new Date(pt.deadline).toLocaleDateString()}</span>}
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 shrink-0" style={{ color: colors.textSecondary }} />
                      </div>
                    </motion.button>
                  ))}
                </>
              )}
            </motion.div>
          ) : step === 'amount' ? (
            /* Step 2: Amount */
            <motion.div key="amount" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div className="p-5">
                <div className="flex items-center gap-3 p-3 rounded-xl mb-5" style={{ background: isGeneralDonation ? `${colors.primary}15` : `${selectedPaymentType?.color || colors.primary}15` }}>
                  <span className="text-2xl">{isGeneralDonation ? '🎁' : (selectedPaymentType?.icon || '💰')}</span>
                  <div className="flex-1">
                    <p className="font-medium text-white text-sm">{isGeneralDonation ? 'General Donation' : selectedPaymentType?.title}</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>{isGeneralDonation ? 'Any amount welcome' : (selectedPaymentType?.allow_partial ? 'Any amount' : `Target: ${formatCurrency(selectedPaymentType?.amount || 0)}`)}</p>
                  </div>
                  <button onClick={() => setStep('select')} className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.1)', color: colors.textSecondary }}>Change</button>
                </div>
                
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Banknote className="w-5 h-5" style={{ color: colors.accentMint }} />Select Amount
                </h2>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {SUGGESTED_AMOUNTS.map((amount) => (
                    <motion.button key={amount} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={() => { setSelectedAmount(amount); setCustomAmount(''); }} className={`p-3 rounded-xl text-center transition-all ${selectedAmount === amount && !customAmount ? 'ring-2 ring-amber-500' : ''}`} style={{ background: selectedAmount === amount && !customAmount ? `${colors.primary}20` : 'rgba(255, 255, 255, 0.05)', border: `1px solid ${selectedAmount === amount && !customAmount ? colors.primary + '50' : 'rgba(255, 255, 255, 0.1)'}` }}>
                      <p className="font-bold text-white">{formatCurrency(amount)}</p>
                    </motion.button>
                  ))}
                </div>
                
                <div className="mb-5">
                  <label className="text-sm font-medium text-white mb-2 block">Or enter custom amount</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white font-medium">₦</span>
                    <input type="number" placeholder="Enter amount" value={customAmount} onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null); }} className="w-full pl-10 pr-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50" style={{ background: customAmount ? `${colors.primary}15` : 'rgba(255, 255, 255, 0.05)', border: `1px solid ${customAmount ? colors.primary + '50' : 'rgba(255, 255, 255, 0.1)'}` }} min="100" />
                  </div>
                </div>
                
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleAmountContinue} disabled={getFinalAmount() < 100} className="w-full py-3.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: gradients.primary, boxShadow: getFinalAmount() >= 100 ? `0 4px 20px ${colors.primary}40` : 'none' }}>
                  Continue with {formatCurrency(getFinalAmount())}<ArrowRight className="w-5 h-5" />
                </motion.button>
              </div>
            </motion.div>
          ) : step === 'details' ? (
            /* Step 3: Details */
            <motion.div key="details" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div className="p-5">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5" style={{ color: colors.accentMint }} />Your Details
                </h2>
                
                <div className="space-y-4">
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-white/5" style={{ background: isAnonymous ? `${colors.primary}15` : 'transparent' }}>
                    <div className="w-11 h-6 rounded-full relative cursor-pointer" style={{ background: isAnonymous ? colors.primary : 'rgba(255, 255, 255, 0.2)' }} onClick={(e) => { e.preventDefault(); setIsAnonymous(!isAnonymous); }}>
                      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all ${isAnonymous ? 'left-[22px]' : 'left-0.5'}`} />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-white">Contribute anonymously</span>
                      <p className="text-xs" style={{ color: colors.textSecondary }}>Your name won't be displayed</p>
                    </div>
                  </label>
                  
                  {!isAnonymous && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                      <label className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                        <User className="w-4 h-4" style={{ color: colors.primary }} />Your Name *
                      </label>
                      <input type="text" value={contributorName} onChange={(e) => setContributorName(e.target.value)} placeholder="Enter your full name" className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }} />
                    </motion.div>
                  )}
                  
                  <div>
                    <label className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                      <Mail className="w-4 h-4" style={{ color: colors.accentCyan }} />Email (optional)
                    </label>
                    <input type="email" value={contributorEmail} onChange={(e) => setContributorEmail(e.target.value)} placeholder="your.email@example.com" className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }} />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                      <Phone className="w-4 h-4" style={{ color: colors.accentMint }} />Phone (optional)
                    </label>
                    <input type="tel" value={contributorPhone} onChange={(e) => setContributorPhone(e.target.value)} placeholder="080XXXXXXXX" className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }} />
                  </div>
                  
                  <div>
                    <label className="text-sm font-medium text-white mb-2 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" style={{ color: colors.warning }} />Message (optional)
                    </label>
                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Leave a message..." rows={3} className="w-full px-4 py-3 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }} />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-3 mt-5">
                  <button onClick={() => setStep('amount')} className="py-3 rounded-xl font-medium text-sm" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: colors.textSecondary }}>Back</button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleDetailsContinue} disabled={!isAnonymous && !contributorName.trim()} className="py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: gradients.primary }}>
                    Continue<ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            </motion.div>
          ) : (
            /* Step 4: Confirm */
            <motion.div key="payment" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <div className="p-5">
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <CreditCard className="w-5 h-5" style={{ color: colors.warning }} />Confirm Contribution
                </h2>
                
                <div className="rounded-xl p-4 mb-5 space-y-3" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                  <div className="flex justify-between items-center">
                    <span className="text-sm" style={{ color: colors.textSecondary }}>Type</span>
                    <span className="font-medium text-white">{isGeneralDonation ? 'General Donation' : selectedPaymentType?.title}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm" style={{ color: colors.textSecondary }}>Contributor</span>
                    <span className="font-medium text-white">{isAnonymous ? 'Anonymous' : contributorName}</span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-white/10">
                    <span className="text-sm font-medium text-white">Total</span>
                    <span className="font-bold text-xl" style={{ color: colors.primary }}>{formatCurrency(getFinalAmount())}</span>
                  </div>
                </div>
                
                <div className="rounded-xl p-3 mb-5 flex items-center justify-between" style={{ background: `${colors.warning}10`, border: `1px solid ${colors.warning}20` }}>
                  <div>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Reference Code</p>
                    <p className="font-mono font-bold text-white">{contributionRef}</p>
                  </div>
                  <button onClick={() => copyToClipboard(contributionRef, 'ref')} className="p-2 rounded-lg hover:bg-white/10">
                    {copiedField === 'ref' ? <Check className="w-5 h-5" style={{ color: colors.accentMint }} /> : <Copy className="w-5 h-5" style={{ color: colors.warning }} />}
                  </button>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setStep('details')} className="py-3 rounded-xl font-medium text-sm" style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: colors.textSecondary }}>Back</button>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleSubmitContribution} disabled={submitting} className="py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50" style={{ background: gradients.primary, boxShadow: `0 4px 20px ${colors.primary}40` }}>
                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Heart className="w-4 h-4" />Get Bank Details</>}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="text-center mt-6 space-y-2">
          <p className="text-xs" style={{ color: colors.textSecondary }}>Made with ❤️ by {classInfo.class_name}</p>
          <a href={orgSlug ? `/${orgSlug}/login` : '/login'} className="text-xs font-medium inline-flex items-center gap-1 hover:underline" style={{ color: colors.primary }}>
            <GraduationCap className="w-3.5 h-3.5" />Class member? Login here
          </a>
          <p className="text-[10px] pt-2" style={{ color: colors.textSecondary }}>
            Developed by{' '}
            <a 
              href="https://x.com/wishotstudio?s=21" 
              target="_blank" 
              rel="noopener noreferrer"
              className="font-bold hover:underline"
              style={{ color: colors.primary }}
            >
              Dev_Wishot
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  )
}
