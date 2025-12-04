import { motion } from 'framer-motion'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular' | 'card'
  width?: string | number
  height?: string | number
  count?: number
}

export default function Skeleton({ 
  className = '', 
  variant = 'rectangular',
  width,
  height,
  count = 1
}: SkeletonProps) {
  const baseStyles: React.CSSProperties = {
    background: `linear-gradient(90deg, 
      rgba(255, 104, 3, 0.05) 0%, 
      rgba(255, 104, 3, 0.15) 50%, 
      rgba(255, 104, 3, 0.05) 100%)`,
    backgroundSize: '200% 100%',
  }

  const variantStyles: Record<string, string> = {
    text: 'h-4 rounded-md',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
    card: 'rounded-2xl p-6',
  }

  const elements = Array.from({ length: count }, (_, i) => (
    <motion.div
      key={i}
      className={`${variantStyles[variant]} ${className}`}
      style={{
        ...baseStyles,
        width: width ?? '100%',
        height: height ?? (variant === 'text' ? '1rem' : variant === 'circular' ? '3rem' : '4rem'),
      }}
      animate={{
        backgroundPosition: ['0% 0%', '-200% 0%'],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  ))

  return count === 1 ? elements[0] : <div className="space-y-3">{elements}</div>
}

// Pre-built skeleton patterns for common use cases
export function StatCardSkeleton() {
  return (
    <div 
      className="rounded-2xl p-5 sm:p-6"
      style={{ 
        background: 'rgba(26, 14, 9, 0.6)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <Skeleton variant="text" width="60%" height="0.875rem" className="mb-3" />
          <Skeleton variant="text" width="40%" height="2rem" className="mb-2" />
          <Skeleton variant="text" width="50%" height="0.75rem" />
        </div>
        <Skeleton variant="circular" width="48px" height="48px" />
      </div>
    </div>
  )
}

export function PaymentCardSkeleton() {
  return (
    <div 
      className="rounded-xl p-4"
      style={{ 
        background: 'rgba(255, 255, 255, 0.02)',
        border: '1px solid rgba(255, 255, 255, 0.05)',
      }}
    >
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width="40px" height="40px" />
        <div className="flex-1">
          <Skeleton variant="text" width="70%" height="1rem" className="mb-2" />
          <Skeleton variant="text" width="40%" height="0.75rem" />
        </div>
        <Skeleton variant="rectangular" width="80px" height="32px" className="rounded-lg" />
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      
      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div 
          className="lg:col-span-2 rounded-2xl p-6"
          style={{ 
            background: 'rgba(26, 14, 9, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <Skeleton variant="text" width="180px" height="1.5rem" className="mb-6" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <PaymentCardSkeleton key={i} />
            ))}
          </div>
        </div>
        <div 
          className="rounded-2xl p-6"
          style={{ 
            background: 'rgba(26, 14, 9, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <Skeleton variant="text" width="140px" height="1.5rem" className="mb-6" />
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <PaymentCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Profile page skeleton
export function ProfileSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
      {/* Left Column - Profile Card */}
      <div 
        className="lg:col-span-1 rounded-2xl p-6"
        style={{ 
          background: 'rgba(26, 14, 9, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div className="text-center">
          <Skeleton variant="circular" width="128px" height="128px" className="mx-auto mb-6" />
          <Skeleton variant="text" width="60%" height="1.5rem" className="mx-auto mb-2" />
          <Skeleton variant="text" width="40%" height="1rem" className="mx-auto mb-4" />
          <Skeleton variant="rectangular" width="120px" height="32px" className="mx-auto rounded-full mb-6" />
          <div className="space-y-3 pt-6 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton variant="text" width="30%" height="0.875rem" />
                <Skeleton variant="text" width="40%" height="0.875rem" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Column */}
      <div className="lg:col-span-2 space-y-4">
        <div 
          className="rounded-2xl p-6"
          style={{ 
            background: 'rgba(26, 14, 9, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          <Skeleton variant="text" width="200px" height="1.5rem" className="mb-6" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="p-4 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.02)' }}>
                <div className="flex items-start gap-3">
                  <Skeleton variant="rectangular" width="40px" height="40px" className="rounded-lg" />
                  <div className="flex-1">
                    <Skeleton variant="text" width="30%" height="0.75rem" className="mb-2" />
                    <Skeleton variant="text" width="60%" height="1rem" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Admin table skeleton
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div 
      className="rounded-2xl overflow-hidden"
      style={{ 
        background: 'rgba(26, 14, 9, 0.6)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
      }}
    >
      {/* Table Header */}
      <div className="p-4 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
        <div className="flex items-center gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} variant="text" width={`${15 + i * 5}%`} height="1rem" />
          ))}
        </div>
      </div>
      {/* Table Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div 
          key={i} 
          className="p-4 border-b" 
          style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}
        >
          <div className="flex items-center gap-4">
            <Skeleton variant="circular" width="32px" height="32px" />
            <Skeleton variant="text" width="25%" height="1rem" />
            <Skeleton variant="text" width="20%" height="1rem" />
            <Skeleton variant="text" width="15%" height="1rem" />
            <Skeleton variant="rectangular" width="80px" height="28px" className="rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

// Admin dashboard skeleton
export function AdminDashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      
      {/* Quick Actions */}
      <div 
        className="rounded-2xl p-6"
        style={{ 
          background: 'rgba(26, 14, 9, 0.6)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <Skeleton variant="text" width="150px" height="1.5rem" className="mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rectangular" height="80px" className="rounded-xl" />
          ))}
        </div>
      </div>

      {/* Pending Payments Table */}
      <TableSkeleton rows={5} />
    </div>
  )
}
