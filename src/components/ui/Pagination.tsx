/**
 * Pagination — a single on-brand pager used across admin + student lists so the
 * app stays fast and consistent as data grows. Pair it with usePagination for
 * client-side slicing, or drive it manually for server-side paging.
 *
 *   const { page, setPage, pageItems, pageCount, range, total } = usePagination(rows, 20);
 *   ...render pageItems...
 *   <Pagination page={page} pageCount={pageCount} onChange={setPage} range={range} total={total} />
 */

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { colors } from '@/config/colors';

export interface PaginationResult<T> {
  page: number;
  setPage: (p: number) => void;
  pageItems: T[];
  pageCount: number;
  total: number;
  /** 1-based [start, end] of the visible slice, for "X–Y of N". */
  range: [number, number];
}

/** Client-side pagination over an in-memory array. Resets to a valid page when the list shrinks. */
export function usePagination<T>(items: T[], pageSize = 20): PaginationResult<T> {
  const [page, setPage] = useState(1);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const pageItems = useMemo(() => items.slice(start, start + pageSize), [items, start, pageSize]);
  const range: [number, number] = total === 0 ? [0, 0] : [start + 1, Math.min(start + pageSize, total)];
  return { page: safePage, setPage, pageItems, pageCount, total, range };
}

// Build a compact page list with ellipses: 1 … 4 5 [6] 7 8 … 20
function pageList(page: number, pageCount: number): (number | 'gap')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const out: (number | 'gap')[] = [1];
  const lo = Math.max(2, page - 1);
  const hi = Math.min(pageCount - 1, page + 1);
  if (lo > 2) out.push('gap');
  for (let i = lo; i <= hi; i++) out.push(i);
  if (hi < pageCount - 1) out.push('gap');
  out.push(pageCount);
  return out;
}

export interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  /** Optional 1-based [start, end] + total to render an "X–Y of N" label. */
  range?: [number, number];
  total?: number;
  /** What each item is called in the count label (default "items"). */
  noun?: string;
  className?: string;
}

export default function Pagination({ page, pageCount, onChange, range, total, noun = 'items', className }: PaginationProps) {
  if (pageCount <= 1 && !range) return null;
  const pages = pageList(page, pageCount);
  const go = (p: number) => { if (p >= 1 && p <= pageCount && p !== page) onChange(p); };

  const navBtn = (disabled: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 34, height: 34, borderRadius: 10,
    background: 'rgba(255,255,255,0.04)', border: `1px solid ${colors.borderLight}`,
    color: disabled ? colors.textDisabled : colors.textSecondary,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
  });

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingTop: 14 }}>
      {range && total !== undefined ? (
        <span style={{ fontSize: 12, color: colors.textTertiary }}>
          {total === 0 ? `No ${noun}` : <>Showing <b style={{ color: colors.textSecondary }}>{range[0]}–{range[1]}</b> of <b style={{ color: colors.textSecondary }}>{total}</b> {noun}</>}
        </span>
      ) : <span />}

      {pageCount > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" aria-label="Previous page" onClick={() => go(page - 1)} disabled={page <= 1} style={navBtn(page <= 1)}>
            <ChevronLeft size={16} />
          </button>
          {pages.map((p, i) => p === 'gap' ? (
            <span key={`gap-${i}`} style={{ color: colors.textTertiary, padding: '0 2px', fontSize: 13 }}>…</span>
          ) : (
            <motion.button
              key={p}
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={() => go(p)}
              aria-current={p === page ? 'page' : undefined}
              style={{
                minWidth: 34, height: 34, borderRadius: 10, padding: '0 8px',
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                background: p === page ? `${colors.primary}1f` : 'rgba(255,255,255,0.04)',
                border: `1px solid ${p === page ? `${colors.primary}55` : colors.borderLight}`,
                color: p === page ? colors.primary : colors.textSecondary,
              }}
            >
              {p}
            </motion.button>
          ))}
          <button type="button" aria-label="Next page" onClick={() => go(page + 1)} disabled={page >= pageCount} style={navBtn(page >= pageCount)}>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
