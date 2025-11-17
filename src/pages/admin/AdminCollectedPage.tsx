import { useEffect, useState, useCallback } from 'react';
// import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import GlassCard from '@/components/ui/GlassCard';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/config/supabase';
import { colors } from '@/config/colors';
import Footer from '@/components/Footer';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { ChevronDown, ChevronUp, ArrowLeft } from 'lucide-react';

interface CategorySummary {
  category: string;
  total: number;
  expenses: number;
  net: number;
  breakdown: { title: string; total: number }[];
  count?: number;
}

interface _PaymentWithType {
  amount: number;
  transaction_ref?: string | null;
  payment_types?: { title?: string; category?: string } | { title?: string; category?: string }[];
}

interface PaymentWithRelations extends _PaymentWithType {
  id: string;
  students?: { full_name?: string; reg_number?: string };
  created_at?: string;
  student_id?: string;
}

export default function AdminCollectedPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryPayments, setCategoryPayments] = useState<PaymentWithRelations[]>([]);
  const [studentTotals, setStudentTotals] = useState<{ name: string; reg: string; total: number; count: number; id?: string }[]>([]);
  const [studentFilter, setStudentFilter] = useState<string | null>(null);
  // include partial payments by default so partially-paid students appear in lists
  const [includePending, setIncludePending] = useState(true);
  const [selectedTypeTitle, setSelectedTypeTitle] = useState<string | null>(null);
  const [catLoading, setCatLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryExpenses, setCategoryExpenses] = useState<any[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);

  const fetchCollectedByCategory = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch payments with chosen statuses with their payment type's title and category
      const statuses = includePending ? ['approved', 'pending', 'partial'] : ['approved'];
      const { data: paymentsData } = await supabase
        .from('payments')
        .select(`amount, transaction_ref, status, payment_types (title, category)`, { count: 'exact' })
        .in('status', statuses)
        .order('created_at', { ascending: false });

      // Fetch all expenses
      const { data: expensesData } = await supabase
        .from('expenses')
        .select(`amount, payment_types (category)`);

      // Filter out waived amounts (transaction_ref starting with WAIVED-)
      const payments = (paymentsData || []) as _PaymentWithType[];
      const filteredPayments = payments.filter((p) => !p.transaction_ref?.startsWith('WAIVED-'));

      const expenses = expensesData || [];

      const map = new Map<string, CategorySummary>();

      // Aggregate payments by category
      for (const p of filteredPayments) {
        const pt = Array.isArray(p.payment_types) ? p.payment_types[0] : p.payment_types;
        const category = pt?.category || 'Other';
        const title = pt?.title || 'Unknown';
        const amount = Number(p.amount || 0);

        if (!map.has(category)) {
          map.set(category, { category, total: 0, expenses: 0, net: 0, breakdown: [] });
        }
        const entry = map.get(category)!;
        entry.total += amount;
        entry.count = (entry.count || 0) + 1;

        // breakdown by title
        const byTitle = entry.breakdown.find(b => b.title === title);
        if (byTitle) byTitle.total += amount;
        else entry.breakdown.push({ title, total: amount });
      }

      // Aggregate expenses by category
      for (const e of expenses) {
        const pt = Array.isArray(e.payment_types) ? e.payment_types[0] : e.payment_types;
        const category = pt?.category || 'Other';
        const amount = Number(e.amount || 0);

        if (!map.has(category)) {
          map.set(category, { category, total: 0, expenses: 0, net: 0, breakdown: [] });
        }
        const entry = map.get(category)!;
        entry.expenses += amount;
      }

      // Calculate net for each category
      for (const entry of map.values()) {
        entry.net = entry.total - entry.expenses;
      }

      // Convert map into array and sort by total
      const arr = Array.from(map.values()).sort((a, b) => b.total - a.total);
      setCategories(arr);
      // initialize tags to allow quick selection
      if (arr.length > 0) setSelectedCategory(arr[0].category);
    } catch (error) {
      console.error('Error fetching collected by category:', error);
    } finally {
      setLoading(false);
    }
  }, [includePending]);

  useEffect(() => {
    void fetchCollectedByCategory();
  }, [fetchCollectedByCategory]);

  const fetchExpensesForCategory = useCallback(async (category: string) => {
    try {
      setExpensesLoading(true);
      const { data } = await supabase
        .from('expenses')
        .select(`*, payment_types (title, category), admins (full_name)`)
        .eq('payment_types.category', category)
        .order('expense_date', { ascending: false });

      setCategoryExpenses(data || []);
    } catch (error) {
      console.error('Error fetching expenses for category:', error);
      setCategoryExpenses([]);
    } finally {
      setExpensesLoading(false);
    }
  }, []);

  const fetchPaymentsForCategory = useCallback(async (category: string, typeTitle?: string | null) => {
    try {
      setCatLoading(true);
      const statuses = includePending ? ['approved', 'pending', 'partial'] : ['approved'];
      const { data } = await supabase
        .from('payments')
        .select(`*, students (full_name, reg_number), payment_types (title, category), student_id, status`)
        .in('status', statuses)
        .order('created_at', { ascending: false });

  const payments = (data || []) as PaymentWithRelations[];
      // filter by category client-side because Supabase doesn't let us query joined fields directly
      let filtered = payments.filter(p => {
        const pt = Array.isArray(p.payment_types) ? p.payment_types[0] : p.payment_types;
        return (pt?.category || 'Other') === category && !p.transaction_ref?.startsWith('WAIVED-');
      });

      // If a specific payment type title is selected, further filter to that type (case-insensitive)
      if (typeTitle) {
        filtered = filtered.filter(p => {
          const pt = Array.isArray(p.payment_types) ? p.payment_types[0] : p.payment_types;
          return (pt?.title || '').toLowerCase() === typeTitle.toLowerCase();
        });
      }

    setCategoryPayments(filtered);
    // Aggregate by student for quick totals per student in this category
      const map = new Map<string, { name: string; reg: string; total: number; count: number; id?: string }>();
      for (const p of filtered) {
        const sid = p.student_id || p.students?.reg_number || p.id;
        const name = p.students?.full_name || 'Unknown';
        const reg = p.students?.reg_number || '';
        const amt = Number(p.amount || 0);
        if (!map.has(sid)) map.set(sid, { name, reg, total: 0, count: 0, id: sid });
        const entry = map.get(sid)!;
        entry.total += amt;
        entry.count += 1;
      }
      const totalsArr = Array.from(map.values()).sort((a, b) => b.total - a.total);
      setStudentTotals(totalsArr);
      setStudentFilter(null);
      setCurrentPage(1);
    } catch (err) {
      console.error('Error fetching payments for category', err);
      setCategoryPayments([]);
    } finally {
      setCatLoading(false);
    }
  }, [includePending]);

  useEffect(() => {
    if (!selectedCategory) return;
    // re-fetch payments when either category or selected payment-type title changes
    void fetchPaymentsForCategory(selectedCategory, selectedTypeTitle);
    void fetchExpensesForCategory(selectedCategory);
  }, [selectedCategory, selectedTypeTitle, fetchPaymentsForCategory, fetchExpensesForCategory]);

  // Filter and Paginate Category Payments
  const filteredPayments = categoryPayments.filter(p => {
    if (studentFilter) {
      const reg = p.students?.reg_number || '';
      if (reg !== studentFilter) return false;
    }
    if (!searchTerm) return true;
    const name = p.students?.full_name || '';
    const typeTitle = Array.isArray(p.payment_types) ? p.payment_types[0]?.title : p.payment_types?.title;
    return (
      name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      typeTitle?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.transaction_ref || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const totalPages = Math.max(1, Math.ceil(filteredPayments.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPayments = filteredPayments.slice(startIndex, endIndex);

  return (
    <div className="min-h-screen py-6 px-4" style={{
        background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)',
      }}
    >
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
        
        {/* ECE Logo Background - Creative Element */}
        <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.08] pointer-events-none">
          <img 
            src="/Ece picture.jpg" 
            alt="ECE Background"
            className="w-full h-full object-contain"
            style={{
              filter: 'grayscale(0.5) brightness(0.8)',
              mixBlendMode: 'soft-light',
            }}
          />
        </div>
      </div>
      <div className="max-w-5xl mx-auto relative z-10 space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/admin/dashboard")}
                  className="flex items-center justify-center sm:justify-start gap-2 mb-4 px-3 py-2 rounded-lg transition-colors w-auto outline outline-orange-500 "
                  style={{ color: colors.textSecondary }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = colors.primary)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = colors.textSecondary)
                  }
                >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-2xl font-bold text-white">Collected by Category</h1>
        </div>

        <GlassCard>
          <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
            A quick summary of amounts collected by payment category. Click a category to view a breakdown of payment types within it.
            Partial payments are included by default so contributors who paid in instalments show up.
          </p>

          {/* Permission hint: RLS may hide rows if your admin record lacks global flags */}
          {!(hasPermission('can_view_analytics') || hasPermission('can_manage_students')) && (
            <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
              <p className="text-sm" style={{ color: colors.textSecondary }}>
                Note: This view only displays approved payments and only the rows you have permission to see. If you expect to see more students/payments, ensure your admin record has <strong>can_view_analytics</strong> or <strong>can_manage_students</strong> enabled.
              </p>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" style={{ borderColor: colors.primary, borderTopColor: 'transparent' }} />
            </div>
          ) : categories.length === 0 ? (
            <div className="text-center py-8">
              <p style={{ color: colors.textSecondary }}>No payments collected yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {categories.map(cat => (
                <div key={cat.category} className="rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between p-4 cursor-pointer" style={{ background: 'rgba(255,255,255,0.03)' }} onClick={() => setExpanded(prev => ({ ...prev, [cat.category]: !prev[cat.category] }))}>
                    <div>
                      <p className="text-sm" style={{ color: colors.textSecondary }}>{cat.category.replace(/_/g, ' ')}</p>
                      <div className="flex gap-4 text-sm">
                        <span className="text-green-400">Collected: {formatCurrency(cat.total)}</span>
                        <span className="text-red-400">Expenses: {formatCurrency(cat.expenses)}</span>
                        <span className="text-blue-400 font-semibold">Net: {formatCurrency(cat.net)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium" style={{ color: colors.textSecondary }}>{cat.breakdown.length} types</p>
                      {expanded[cat.category] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>

                  {expanded[cat.category] && (
                    <div className="p-3 bg-[#0B0B0C] border-t" style={{ borderColor: 'rgba(255,255,255,0.03)' }}>
                      <div className="space-y-2">
                        {cat.breakdown.map(b => (
                          <button
                            key={b.title}
                            onClick={() => {
                              setSelectedCategory(cat.category);
                              setSelectedTypeTitle(b.title);
                            }}
                            className={`w-full text-left flex items-center justify-between p-3 rounded-lg hover:bg-white/5 ${selectedTypeTitle === b.title ? 'outline outline-orange-500' : ''}`}
                            style={{ background: 'rgba(255,255,255,0.01)' }}
                          >
                            <p className="text-sm text-white">{b.title}</p>
                            <p className="text-sm font-semibold text-white">{formatCurrency(b.total)}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </GlassCard>
        
        {/* Category Tags */}
        <GlassCard>
          <div className="flex flex-wrap gap-3 items-center">
            {categories.map(cat => (
              <button
                key={cat.category}
                onClick={() => setSelectedCategory(cat.category)}
                className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-all whitespace-nowrap flex items-center gap-2 ${selectedCategory === cat.category ? 'border' : ''}`}
                aria-pressed={selectedCategory === cat.category}
                style={{
                  background: selectedCategory === cat.category ? 'linear-gradient(90deg, rgba(255,104,3,0.15), rgba(255,104,3,0.05))' : 'rgba(255,255,255,0.03)',
                  borderColor: selectedCategory === cat.category ? 'rgba(255,255,255,0.06)' : 'transparent',
                  color: selectedCategory === cat.category ? 'white' : 'inherit'
                }}
              >
                <span className="capitalize">{cat.category.replace(/_/g, ' ')}</span>
                <span className="text-xs font-semibold">{formatCurrency(cat.total)}</span>
                <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: colors.statusPaid, color: 'white' }}>{cat.count || 0}</span>
              </button>
            ))}
          </div>
        </GlassCard>

        {/* Payments for selected category */}
        {selectedCategory && (
          <GlassCard>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-xl font-bold text-white">{selectedCategory.replace(/_/g, ' ')}</h2>
                <p className="text-sm" style={{ color: colors.textSecondary }}>Showing collected payments for this category</p>
              </div>
                  <div className="w-full md:w-48">
                <input
                  type="text"
                  placeholder="Search by name, type, txref..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg pl-3 pr-3 py-2 text-sm text-white"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}
                />
              </div>
            </div>

                  {selectedTypeTitle && (
                    <div className="mb-3 flex items-center gap-3">
                      <div className="px-3 py-1 rounded-full text-sm font-medium" style={{ background: 'rgba(255,255,255,0.03)' }}>{selectedTypeTitle}</div>
                      <button onClick={() => setSelectedTypeTitle(null)} className="text-sm underline" style={{ color: colors.primary }}>Clear type filter</button>
                    </div>
                  )}

                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 text-sm" style={{ color: colors.textSecondary }}>
                      <input
                        type="checkbox"
                        checked={includePending}
                        onChange={(e) => setIncludePending(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span>Include pending & partial</span>
                    </label>
                  </div>
                  <div className="text-sm" style={{ color: colors.textSecondary }}>
                    {studentTotals.length} students • {filteredPayments.length} payments
                  </div>
                </div>

                {/* Per-student totals (top payers) */}
                {studentTotals.length > 0 && (
                  <div className="mb-4">
                    <p className="text-sm mb-2" style={{ color: colors.textSecondary }}>Top payers in this category</p>
                    <div className="flex flex-wrap gap-2">
                      {studentTotals.slice(0, 8).map(s => (
                        <button
                          key={s.reg}
                          onClick={() => setStudentFilter(prev => prev === s.reg ? null : s.reg)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-all flex items-center gap-2 ${studentFilter === s.reg ? 'border' : ''}`}
                          style={{
                            background: studentFilter === s.reg ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                            borderColor: studentFilter === s.reg ? 'rgba(255,255,255,0.06)' : 'transparent'
                          }}
                        >
                          <span className="font-medium">{s.name}</span>
                          <span className="text-xs" style={{ color: colors.textSecondary }}>{s.reg}</span>
                          <span className="ml-2 px-2 py-0.5 rounded text-xs font-semibold" style={{ background: colors.statusPaid, color: 'white' }}>{formatCurrency(s.total)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

            {/* Loading / Empty */}
            {catLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-t-transparent" style={{ borderColor: colors.primary, borderTopColor: 'transparent' }} />
              </div>
            ) : paginatedPayments.length === 0 ? (
              <div className="text-center py-8">
                <p style={{ color: colors.textSecondary }}>No payments found for this category</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {paginatedPayments.map((p) => (
                    <div key={p.id} className="p-3 rounded-lg transition-all hover:bg-white/5" style={{ background: 'rgba(255,255,255,0.02)' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-white">{p.students?.full_name}</p>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>{p.students?.reg_number}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-white">{formatCurrency(p.amount)}</p>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>{formatDate(p.created_at, 'short')}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <p className="text-sm" style={{ color: colors.textSecondary }}>{Array.isArray(p.payment_types) ? p.payment_types[0]?.title : p.payment_types?.title}</p>
                        <p className="text-xs text-white">{p.transaction_ref}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm" style={{ color: colors.textSecondary }}>
                      Showing {startIndex + 1} - {Math.min(endIndex, filteredPayments.length)} of {filteredPayments.length} payments
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        className="px-3 py-2 rounded-lg"
                        disabled={currentPage === 1}
                        style={{ background: currentPage === 1 ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.03)' }}
                      >Prev</button>
                      <div className="px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)' }}>{currentPage} / {totalPages}</div>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                        className="px-3 py-2 rounded-lg"
                        disabled={currentPage === totalPages}
                        style={{ background: currentPage === totalPages ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.03)' }}
                      >Next</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </GlassCard>
        )}
      </div>
      <Footer />
    </div>
  );
}
