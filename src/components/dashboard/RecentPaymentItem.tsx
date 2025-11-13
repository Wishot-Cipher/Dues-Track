import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Download, Eye, CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { StatusBadge } from '../common/StatusBadge';

const colors = {
  primary: '#6366f1',
  accentMint: '#34d399',
  statusPaid: '#10b981',
  warning: '#f59e0b',
  statusUnpaid: '#ef4444',
  textSecondary: 'rgba(255, 255, 255, 0.6)',
  textPrimary: 'rgba(255, 255, 255, 0.9)',
};

interface PaymentData {
  id: string;
  payment_type: { title: string; category: string; amount: number };
  amount: number;
  status: 'approved' | 'pending' | 'rejected';
  created_at: string;
  receipt_url?: string;
  rejection_reason?: string;
  payment_type_id?: string;
  isUnpaid?: boolean;
}

interface RecentPaymentItemProps {
  payment: PaymentData;
  index: number;
  formatCurrency: (amount: number) => string;
  formatDate: (date: string, format?: string) => string;
}

export function RecentPaymentItem({ 
  payment, 
  index, 
  formatCurrency, 
  formatDate 
}: RecentPaymentItemProps) {
  const navigate = useNavigate();

  const getCategoryEmoji = (category: string) => {
    switch (category) {
      case 'semester_dues': return '🎓';
      case 'books': return '📚';
      case 'events': return '🎉';
      case 'projects': return '📊';
      default: return '💰';
    }
  };

  const handleDownloadReceipt = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!payment.receipt_url) return;
    
    try {
      const link = document.createElement('a');
      link.href = payment.receipt_url;
      link.download = `receipt_${payment.id}.jpg`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  const isUnpaid = payment.isUnpaid || (!payment.receipt_url && payment.status !== 'approved');
  const isPaid = payment.status === 'approved';
  const isPending = payment.status === 'pending' && !payment.isUnpaid;
  const isRejected = payment.status === 'rejected';

  return (
    <motion.div
      className="rounded-xl border p-4"
      style={{ 
        background: 'rgba(255, 255, 255, 0.03)',
        borderColor: 'rgba(255, 255, 255, 0.1)'
      }}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 * index }}
      whileHover={{ background: 'rgba(255, 255, 255, 0.05)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg"
            style={{ background: 'rgba(255, 255, 255, 0.05)' }}
          >
            {getCategoryEmoji(payment.payment_type.category)}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-white text-sm truncate">
              {payment.payment_type.title}
            </h4>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              {isUnpaid ? `Due: ${formatDate(payment.created_at, 'short')}` : formatDate(payment.created_at, 'short')}
            </p>
          </div>
        </div>
        
        {/* Status Badge */}
        {isUnpaid ? (
          <div 
            className="px-3 py-1 rounded-full flex items-center gap-1.5 text-xs font-medium shrink-0"
            style={{ 
              background: `${colors.statusUnpaid}20`,
              color: colors.statusUnpaid,
              border: `1px solid ${colors.statusUnpaid}30`
            }}
          >
            <AlertCircle className="w-3 h-3" />
            <span className="hidden sm:inline">NOT PAID</span>
            <span className="sm:hidden">🔴</span>
          </div>
        ) : (
          <StatusBadge status={payment.status} size="sm" />
        )}
      </div>

      {/* Amount */}
      <div className="mb-3">
        <p className="text-lg font-bold text-white">
          {formatCurrency(payment.amount)}
        </p>
      </div>

      {/* Status Message */}
      {isPaid && (
        <div className="mb-3 p-2 rounded-lg text-xs flex items-center gap-2" style={{ 
          background: `${colors.statusPaid}10`,
          color: colors.statusPaid,
          border: `1px solid ${colors.statusPaid}30`
        }}>
          <CheckCircle className="w-4 h-4" />
          <span>Payment approved and verified</span>
        </div>
      )}
      
      {isPending && (
        <div className="mb-3 p-2 rounded-lg text-xs flex items-center gap-2" style={{ 
          background: `${colors.warning}10`,
          color: colors.warning,
          border: `1px solid ${colors.warning}30`
        }}>
          <Clock className="w-4 h-4" />
          <span>Awaiting admin approval</span>
        </div>
      )}
      
      {isRejected && payment.rejection_reason && (
        <div className="mb-3 p-2 rounded-lg text-xs" style={{ 
          background: `${colors.statusUnpaid}10`,
          color: colors.statusUnpaid,
          border: `1px solid ${colors.statusUnpaid}30`
        }}>
          <div className="flex items-start gap-2">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-1">Rejected</p>
              <p className="opacity-90">{payment.rejection_reason}</p>
            </div>
          </div>
        </div>
      )}

      {isUnpaid && (
        <div className="mb-3 p-2 rounded-lg text-xs flex items-center gap-2" style={{ 
          background: `${colors.statusUnpaid}10`,
          color: colors.statusUnpaid,
          border: `1px solid ${colors.statusUnpaid}30`
        }}>
          <AlertCircle className="w-4 h-4" />
          <span>Payment not yet submitted</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {isPaid && payment.receipt_url ? (
          <>
            <button
              onClick={handleDownloadReceipt}
              className="flex-1 py-2 px-3 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-all"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                color: colors.textPrimary
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Download</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate('/payments');
              }}
              className="flex-1 py-2 px-3 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-all"
              style={{
                background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`,
                color: 'white'
              }}
            >
              <Eye className="w-4 h-4" />
              <span className="hidden sm:inline">View Details</span>
              <span className="sm:hidden">View</span>
            </button>
          </>
        ) : isPending ? (
          <button
            onClick={() => navigate('/payments')}
            className="w-full py-2 px-4 rounded-lg font-medium text-xs transition-all"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              color: colors.textPrimary
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
          >
            View Status
          </button>
        ) : (
          <button
            onClick={() => navigate(`/payment/${payment.payment_type_id || payment.id}`)}
            className="w-full py-2 px-4 rounded-lg font-medium text-xs transition-all shadow-lg"
            style={{
              background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`,
              color: 'white'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            💰 PAY NOW
          </button>
        )}
      </div>
    </motion.div>
  );
}
