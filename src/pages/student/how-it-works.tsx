/**
 * HowItWorksPage — "How Payvexo Works" (REWRITE)
 *
 * Dramatically expanded from the original:
 *   — Fee transparency section (exact maths, settlement timing)
 *   — Tier autonomy section (class money ≠ dept money)
 *   — Claim system deep-dive (5 rungs, what each unlocks)
 *   — Multi-org identity (one person, many orgs, role switching)
 *   — Event tickets (QR, tiers, check-in per tier)
 *   — Expanded FAQ (10 questions)
 *   — Richer hero with dual-view receipt
 *   — Interactive mini-dashboard simulator
 *
 * Design language: ledger paper, mono type for every number/ID/amount,
 * editorial-fintech, disciplined use of the app's existing dashboard tokens.
 *
 * Drop into src/pages/ and route at /how-it-works.
 */

import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    motion,
    AnimatePresence,
    useReducedMotion,
    useScroll,
    useTransform,
} from 'framer-motion';
import {
    ArrowLeft,
    ArrowRight,
    Search,
    HandHeart,
    Wallet,
    Repeat,
    Check,
    CheckCircle2,
    ChevronDown,
    NotebookPen,
    ReceiptText,
    ShieldCheck,
    Mail,
    FileCheck2,
    BadgeCheck,
    Users,
    Building2,
    GraduationCap,
    Eye,
    Lock,
    Sparkles,
    Layers,
    QrCode,
    ScanLine,
    CreditCard,
    Landmark,
    RefreshCw,
    AlertCircle,
    UserCheck,
    Globe,
    Smartphone,
    BarChart3,
    Gift,
    Zap,
    Clock,
    TrendingUp,
    Shield,
} from 'lucide-react';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';
import { useSpring } from 'framer-motion';
import { useEffect } from 'react';
import Footer from '@/components/Footer';

// ── Page-local design tokens ──────────────────────────────────────
const LEDGER_RED = '#E8533D';
const EASE = [0.22, 1, 0.36, 1] as const;
const MONO = '"JetBrains Mono", "Fira Code", "Cascadia Code", ui-monospace, monospace';

type DTK = ReturnType<typeof getDashboardTokens>;

// ── Utility: format Naira ─────────────────────────────────────────
function naira(n: number) {
    return '₦' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Shared: section eyebrow ───────────────────────────────────────
function Eyebrow({
    tk,
    children,
    tone = 'primary',
}: {
    tk: DTK;
    children: React.ReactNode;
    tone?: 'primary' | 'mint' | 'red' | 'amber';
}) {
    const color =
        tone === 'mint'
            ? tk.mint
            : tone === 'red'
                ? LEDGER_RED
                : tone === 'amber'
                    ? tk.amber
                    : tk.primary;
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ background: `${color}14`, color, border: `1px solid ${color}30` }}
        >
            {children}
        </span>
    );
}

// ── Shared: perforated divider (receipt motif) ────────────────────
function Perforation({ tk }: { tk: DTK }) {
    return (
        <div
            aria-hidden
            className="w-full h-4 my-0"
            style={{
                backgroundImage: `radial-gradient(circle, ${tk.bg} 3.5px, transparent 4px)`,
                backgroundSize: '14px 14px',
                backgroundPosition: 'center',
            }}
        />
    );
}

// ── Shared: mono stamp ────────────────────────────────────────────
function Stamp({
    tk,
    children,
    color,
}: {
    tk: DTK;
    children: React.ReactNode;
    color?: string;
}) {
    const c = color || tk.textTer;
    return (
        <span
            className="text-[10px] font-bold uppercase tracking-[0.2em]"
            style={{ fontFamily: MONO, color: c }}
        >
            {children}
        </span>
    );
}

// ════════════════════════════════════════════════════════════════
// HERO — dual-view receipt: member side + exec side
// ════════════════════════════════════════════════════════════════
function ReceiptHero({
    tk,
    navigate,
}: {
    tk: DTK;
    navigate: (path: string) => void;
}) {
    const reduceMotion = useReducedMotion();
    const [activeView, setActiveView] = useState<'member' | 'exec'>('member');

    const memberLines = [
        { label: 'DEPT. WEEK DUES — 300L EEE', value: '₦5,000.00', strong: true },
        { label: 'PLATFORM FEE (1.5%)', value: '−₦75.00', dim: true },
        { label: 'YOUR CLASS RECEIVES', value: '₦4,925.00', mint: true },
        { label: 'RECEIPT NO.', value: 'PVX-8821', code: true },
        { label: 'STATUS', value: 'PAID & VERIFIED', ok: true },
    ];

    const execLines = [
        { label: 'DUES COLLECTED — THIS MONTH', value: '₦847,500.00', strong: true },
        { label: 'TOTAL MEMBERS', value: '169 / 183', dim: true },
        { label: 'PENDING APPROVALS', value: '2 expenses', warn: true },
        { label: 'AVAILABLE TO PAYOUT', value: '₦831,250.00', mint: true },
        { label: 'SETTLEMENT', value: 'NEXT WORKING DAY', code: true },
    ];

    const lines = activeView === 'member' ? memberLines : execLines;

    return (
        <section id="hero" className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-10 sm:pt-16 pb-10">
            <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-10 lg:gap-16 items-center">
                {/* Left: thesis */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: EASE }}
                >
                    <Eyebrow tk={tk}>How Payvexo works</Eyebrow>
                    <h1
                        className="mt-4 text-[2.2rem] sm:text-[3.2rem] font-extrabold tracking-tight leading-[1.06]"
                        style={{ color: tk.text }}
                    >
                        Dues that live
                        <br />
                        <span style={{ color: tk.primary }}>in the ledger,</span>
                        <br />
                        not the notebook.
                    </h1>
                    <p
                        className="mt-5 text-base sm:text-lg leading-7 max-w-lg"
                        style={{ color: tk.textSec }}
                    >
                        Nigerian student classes, churches, and clubs have been collecting
                        dues on paper since forever. Cash goes missing. Notebooks
                        disappear at graduation. The next exec inherits nothing. Payvexo
                        replaces all of that with a permanent, auditable, digitally-settled
                        ledger — and the trust system to make sure the right people are
                        running it.
                    </p>

                    {/* Stats strip */}
                    <div className="mt-6 flex flex-wrap gap-4">
                        {[
                            { value: '1.5%', label: 'Paystack fee per due' },
                            { value: 'T+1', label: 'Settlement to your bank' },
                            { value: '5 min', label: 'To bring your org online' },
                            { value: '5', label: 'Trust levels before money' },
                        ].map((s) => (
                            <div
                                key={s.label}
                                className="rounded-xl px-4 py-3 flex-shrink-0"
                                style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
                            >
                                <p
                                    className="text-xl font-extrabold"
                                    style={{ fontFamily: MONO, color: tk.primary }}
                                >
                                    {s.value}
                                </p>
                                <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
                                    {s.label}
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-7 flex flex-wrap items-center gap-3">
                        <motion.button
                            onClick={() => navigate('/bring-school')}
                            whileHover={{ y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold"
                            style={{
                                background: tk.primary,
                                color: '#fff',
                                boxShadow: `0 10px 28px ${tk.primary}38`,
                            }}
                        >
                            Bring your school online
                            <ArrowRight className="w-4 h-4" />
                        </motion.button>
                        <a
                            href="#mechanism"
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold"
                            style={{
                                background: tk.card,
                                color: tk.text,
                                border: `1px solid ${tk.cardBorder}`,
                            }}
                        >
                            See the mechanism
                        </a>
                    </div>
                </motion.div>

                {/* Right: interactive receipt */}
                <motion.div
                    initial={{ opacity: 0, y: 24, rotate: -1 }}
                    animate={{ opacity: 1, y: 0, rotate: -1 }}
                    transition={{ duration: 0.6, ease: EASE, delay: 0.12 }}
                    className="relative mx-auto w-full max-w-sm"
                >
                    {/* View switcher */}
                    <div className="flex mb-3 gap-2 justify-center" style={{ transform: 'rotate(1deg)' }}>
                        {(['member', 'exec'] as const).map((v) => (
                            <button
                                key={v}
                                onClick={() => setActiveView(v)}
                                className="px-3 py-1.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all"
                                style={{
                                    background: activeView === v ? tk.primary : tk.card,
                                    color: activeView === v ? '#fff' : tk.textTer,
                                    border: `1px solid ${activeView === v ? tk.primary : tk.cardBorder}`,
                                    fontFamily: MONO,
                                }}
                            >
                                {v === 'member' ? '👨‍🎓 Member view' : '🏛️ Exec view'}
                            </button>
                        ))}
                    </div>

                    <div
                        className="relative rounded-[4px] px-6 pt-7 pb-8"
                        style={{
                            fontFamily: MONO,
                            background: tk.card,
                            border: `1px solid ${tk.cardBorder}`,
                            boxShadow: '0 30px 70px rgba(0,0,0,0.3)',
                        }}
                    >
                        <p
                            className="text-[10px] tracking-[0.3em] text-center uppercase"
                            style={{ color: tk.textTer }}
                        >
                            {activeView === 'member' ? 'Payment receipt' : 'Admin dashboard'}
                        </p>
                        <p className="mt-1 text-[10px] text-center" style={{ color: tk.textTer }}>
                            {new Date().toLocaleDateString('en-GB', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                            })}
                        </p>

                        <div
                            className="my-4 border-t"
                            style={{ borderStyle: 'dashed', borderColor: tk.cardBorder }}
                        />

                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeView}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.2 }}
                                className="space-y-3"
                            >
                                {lines.map((line, i) => (
                                    <motion.div
                                        key={line.label}
                                        initial={{ opacity: 0, x: -6 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: reduceMotion ? 0 : i * 0.07 }}
                                        className="flex items-baseline justify-between gap-3 text-[12px]"
                                    >
                                        <span style={{ color: tk.textSec, fontWeight: 500 }}>{line.label}</span>
                                        <span
                                            style={{
                                                color: (line as any).ok
                                                    ? tk.mint
                                                    : (line as any).mint
                                                        ? tk.mint
                                                        : (line as any).warn
                                                            ? tk.amber
                                                            : (line as any).dim
                                                                ? tk.textTer
                                                                : (line as any).strong
                                                                    ? tk.text
                                                                    : (line as any).code
                                                                        ? tk.primary
                                                                        : tk.text,
                                                fontWeight: (line as any).strong || (line as any).mint ? 700 : 500,
                                            }}
                                        >
                                            {line.value}
                                        </span>
                                    </motion.div>
                                ))}
                            </motion.div>
                        </AnimatePresence>

                        <div
                            className="my-4 border-t"
                            style={{ borderStyle: 'dashed', borderColor: tk.cardBorder }}
                        />

                        <motion.div
                            initial={{ opacity: 0, scale: 0.92 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: reduceMotion ? 0 : 0.6, duration: 0.35, ease: EASE }}
                            className="flex items-center justify-center gap-2 py-2 rounded-lg"
                            style={{
                                background: `${tk.mint}12`,
                                border: `1px solid ${tk.mint}30`,
                            }}
                        >
                            <CheckCircle2 className="w-3.5 h-3.5" style={{ color: tk.mint }} />
                            <span
                                className="text-[10px] font-bold tracking-widest uppercase"
                                style={{ color: tk.mint }}
                            >
                                {activeView === 'member' ? 'Exec verified · nothing hidden' : 'Paystack sub-account active'}
                            </span>
                        </motion.div>

                        <p className="mt-4 text-[9px] text-center leading-4" style={{ color: tk.textTer }}>
                            Every figure traceable · fee shown before you pay · audit trail permanent
                        </p>

                        {/* Perforated tear */}
                        <div
                            aria-hidden
                            className="absolute left-0 right-0 -bottom-2 h-4"
                            style={{
                                backgroundImage: `radial-gradient(circle, ${tk.bg} 3px, transparent 3.5px)`,
                                backgroundSize: '14px 14px',
                                backgroundPosition: 'top center',
                            }}
                        />
                    </div>
                </motion.div>
            </div>
        </section>
    );
}

// ════════════════════════════════════════════════════════════════
// LEDGER STRIP
// ════════════════════════════════════════════════════════════════
function LedgerStrip({ tk }: { tk: DTK }) {
    const reduceMotion = useReducedMotion();
    const items = [
        '₦5,000 dues → ₦4,925 to class · ₦75 Paystack fee',
        'Treasurer role: transferred · ledger unchanged · balance intact',
        'Exec verification: school email confirmed · Layer 2 unlocked',
        'Event ticket: PVX-TKT-4892 · VIP tier · QR scan at door',
        'Expense approved: ₦12,000 dept week · audit trail recorded',
        'Class rep graduates → new rep claims role → 10 peer votes → Layer 4',
        '₦847,500 settled → Paystack sub-account → next working day to bank',
        'Same-class name duplicate blocked · "Try adding a middle initial"',
    ];
    const loop = [...items, ...items];

    return (
        <div
            className="relative overflow-hidden py-2.5"
            style={{
                background: tk.bgWash,
                borderTop: `1px solid ${tk.cardBorder}`,
                borderBottom: `1px solid ${tk.cardBorder}`,
            }}
        >
            <motion.div
                className="flex items-center gap-8 whitespace-nowrap text-[11px]"
                style={{ color: tk.textTer, fontFamily: MONO }}
                animate={reduceMotion ? undefined : { x: ['0%', '-50%'] }}
                transition={
                    reduceMotion ? undefined : { duration: 44, repeat: Infinity, ease: 'linear' }
                }
            >
                {loop.map((t, i) => (
                    <span key={i} className="inline-flex items-center gap-8">
                        <span>{t}</span>
                        <span style={{ color: tk.primary }}>·</span>
                    </span>
                ))}
            </motion.div>
        </div>
    );
}

// ════════════════════════════════════════════════════════════════
// OLD vs NEW — same scenario, richer detail
// ════════════════════════════════════════════════════════════════
function OldVsNewSection({ tk }: { tk: DTK }) {
    const oldItems = [
        { icon: '📓', text: 'Class rep collects cash; writes names in a personal notebook only they can read.' },
        { icon: '🤷', text: 'Some members "paid last week." Nobody can prove it either way. Arguments begin.' },
        { icon: '💸', text: 'Treasurer uses some dues for "the event" — no receipt, no record, no accountability.' },
        { icon: '🎓', text: 'Class rep graduates. Notebook goes with them. New exec inherits a verbal balance and a WhatsApp number to "call if you have questions."' },
        { icon: '🔁', text: 'Same problems repeat next session. Every single year.' },
    ];
    const newItems = [
        { icon: '📱', text: 'Members pay via Paystack inline. Receipt auto-issued. No chasing, no screenshots.' },
        { icon: '✅', text: 'Every payment is timestamped, attributed to a member ID. Anyone in scope can see who paid.' },
        { icon: '🔍', text: 'Every approved expense links to its purpose, amount, and the exec who approved it — visible to all members.' },
        { icon: '🔄', text: 'Class rep graduates. Their role is transferred via the Payvexo handover flow. The new exec lands on the exact same balance, history, and trust level.' },
        { icon: '🏦', text: 'Money settles to a KYC-verified Paystack sub-account on the next working day. No manual withdrawal needed.' },
    ];

    return (
        <section id="old-vs-new" className="max-w-6xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
            <div className="text-center max-w-xl mx-auto mb-10">
                <Eyebrow tk={tk} tone="red">
                    The same scenario, twice
                </Eyebrow>
                <h2
                    className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight"
                    style={{ color: tk.text }}
                >
                    Your class needs ₦5,000 for departmental week.
                </h2>
                <p className="mt-3 text-sm leading-6" style={{ color: tk.textSec }}>
                    Here's what happens under a notebook — and what happens under a ledger.
                </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* OLD */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.45, ease: EASE }}
                    className="rounded-2xl p-6 relative overflow-hidden"
                    style={{ background: tk.card, border: `1px solid ${LEDGER_RED}28` }}
                >
                    <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: LEDGER_RED }} />
                    <div className="flex items-center gap-2.5 mb-5">
                        <span
                            className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{ background: `${LEDGER_RED}14`, color: LEDGER_RED }}
                        >
                            <NotebookPen className="w-4 h-4" />
                        </span>
                        <div>
                            <h3 className="text-sm font-bold" style={{ color: tk.text }}>
                                The cash / notebook way
                            </h3>
                            <Stamp tk={tk} color={LEDGER_RED}>
                                2005 → today · unchanged
                            </Stamp>
                        </div>
                    </div>
                    <ul className="space-y-4">
                        {oldItems.map((item) => (
                            <li key={item.text} className="flex items-start gap-3 text-sm leading-5">
                                <span className="text-base shrink-0 mt-0.5">{item.icon}</span>
                                <span style={{ color: tk.textSec }}>{item.text}</span>
                            </li>
                        ))}
                    </ul>
                    <div
                        className="mt-6 p-3 rounded-xl"
                        style={{ background: `${LEDGER_RED}10`, border: `1px solid ${LEDGER_RED}25` }}
                    >
                        <Stamp tk={tk} color={LEDGER_RED}>
                            RECORD STATUS: lost at handover · disputes unresolvable · no audit trail
                        </Stamp>
                    </div>
                </motion.div>

                {/* NEW */}
                <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-60px' }}
                    transition={{ duration: 0.45, ease: EASE, delay: 0.1 }}
                    className="rounded-2xl p-6 relative overflow-hidden"
                    style={{ background: tk.card, border: `1px solid ${tk.mint}28` }}
                >
                    <div
                        className="absolute top-0 left-0 right-0 h-[3px]"
                        style={{ background: tk.mint }}
                    />
                    <div className="flex items-center gap-2.5 mb-5">
                        <span
                            className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{ background: `${tk.mint}14`, color: tk.mint }}
                        >
                            <ReceiptText className="w-4 h-4" />
                        </span>
                        <div>
                            <h3 className="text-sm font-bold" style={{ color: tk.text }}>
                                The Payvexo way
                            </h3>
                            <Stamp tk={tk} color={tk.mint}>
                                Digital · auditable · permanent
                            </Stamp>
                        </div>
                    </div>
                    <ul className="space-y-4">
                        {newItems.map((item) => (
                            <li key={item.text} className="flex items-start gap-3 text-sm leading-5">
                                <span className="text-base shrink-0 mt-0.5">{item.icon}</span>
                                <span style={{ color: tk.textSec }}>{item.text}</span>
                            </li>
                        ))}
                    </ul>
                    <div
                        className="mt-6 p-3 rounded-xl"
                        style={{ background: `${tk.mint}10`, border: `1px solid ${tk.mint}25` }}
                    >
                        <Stamp tk={tk} color={tk.mint}>
                            RECORD STATUS: intact at handover · disputes impossible · audit trail permanent
                        </Stamp>
                    </div>
                </motion.div>
            </div>
        </section>
    );
}

// ════════════════════════════════════════════════════════════════
// THE MECHANISM — 6 steps
// ════════════════════════════════════════════════════════════════
function MechanismSection({ tk }: { tk: DTK }) {
    const steps = [
        {
            icon: Search,
            title: 'Find your org',
            body: "Search your school, church, or club. If it's not listed yet, bring it online in under five minutes using seed data pre-populated for Nigerian universities.",
        },
        {
            icon: HandHeart,
            title: 'Claim your role',
            body: "Being a founder doesn't mean you own the money — it means you set up the structure. Claim your actual role (class rep, treasurer, president) and start the verification climb.",
        },
        {
            icon: UserCheck,
            title: 'Get verified by your people',
            body: 'Your classmates, members, or congregation vote to confirm you hold the role you claimed. Ten peer confirmations — or a parent exec sign-off — unlocks money access.',
        },
        {
            icon: Wallet,
            title: 'Collect dues',
            body: 'Publish a due, set the amount, add a deadline. Members pay via Paystack. Every payment is receipted, attributed, and visible to whoever needs to audit it.',
        },
        {
            icon: Landmark,
            title: 'Approve expenses + payout',
            body: "Record and approve expenses against your collected balance. When you're ready to withdraw, money moves to your KYC-verified Paystack sub-account and settles to your bank the next working day.",
        },
        {
            icon: Repeat,
            title: 'Hand over, intact',
            body: 'When your tenure ends, the incoming exec claims the role. The balance, history, and trust level carry forward untouched. The ledger is permanently theirs — whoever currently holds it.',
        },
    ];

    return (
        <section id="mechanism" className="max-w-6xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
            <div className="text-center max-w-xl mx-auto mb-12">
                <Eyebrow tk={tk}>The mechanism</Eyebrow>
                <h2
                    className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight"
                    style={{ color: tk.text }}
                >
                    Six steps. No surprises.
                </h2>
                <p className="mt-3 text-sm leading-6" style={{ color: tk.textSec }}>
                    From founding to payout — what happens at each stage, in order.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {steps.map((s, i) => (
                    <motion.div
                        key={s.title}
                        initial={{ opacity: 0, y: 18 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-40px' }}
                        transition={{ duration: 0.4, ease: EASE, delay: i * 0.07 }}
                        className="rounded-2xl p-5 relative"
                        style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <Stamp tk={tk} color={tk.primary}>
                                {String(i + 1).padStart(2, '0')}
                            </Stamp>
                            <span
                                className="w-9 h-9 rounded-xl flex items-center justify-center"
                                style={{ background: tk.primarySoft, color: tk.primary }}
                            >
                                <s.icon className="w-4 h-4" />
                            </span>
                        </div>
                        <h3 className="text-sm font-bold mb-1.5" style={{ color: tk.text }}>
                            {s.title}
                        </h3>
                        <p className="text-[13px] leading-5" style={{ color: tk.textSec }}>
                            {s.body}
                        </p>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}

// ════════════════════════════════════════════════════════════════
// THE HANDOVER — scroll-driven, signature section
// ════════════════════════════════════════════════════════════════
function HandoverSection({ tk }: { tk: DTK }) {
    const reduceMotion = useReducedMotion();
    const sectionRef = useRef<HTMLDivElement>(null);
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ['start 0.8', 'end 0.35'],
    });
    const batonX = useTransform(scrollYProgress, [0, 1], ['5%', '88%']);
    const ledgerFill = useTransform(scrollYProgress, [0, 1], ['0%', '100%']);
    const roleOpacity = useTransform(scrollYProgress, [0.2, 0.5, 0.8], [1, 0.6, 1]);

    return (
        <section ref={sectionRef} id="handover" className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24">
            <div className="text-center max-w-xl mx-auto mb-12">
                <Eyebrow tk={tk} tone="mint">
                    The signature mechanism
                </Eyebrow>
                <h2
                    className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight"
                    style={{ color: tk.text }}
                >
                    The handover.
                </h2>
                <p className="mt-3 text-sm leading-6" style={{ color: tk.textSec }}>
                    This is the problem Payvexo actually solves. Not faster payments —
                    a role that can change hands, indefinitely, without the record
                    underneath it ever breaking. Scroll slowly through this section
                    to watch it happen.
                </p>
            </div>

            <div
                className="relative rounded-[28px] p-8 sm:p-12"
                style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
            >
                {/* Exec cards */}
                <div className="relative flex items-center justify-between">
                    <ExecCard tk={tk} name="David O." role="Treasurer" status="outgoing" />
                    <div className="flex-1 relative h-8 mx-4">
                        {/* Track line */}
                        <div
                            className="absolute top-1/2 left-0 right-0 h-px"
                            style={{ background: tk.cardBorder }}
                            aria-hidden
                        />
                        {/* Sliding baton */}
                        <motion.div
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
                            style={{
                                left: reduceMotion ? '50%' : batonX,
                                background: tk.primary,
                                color: '#fff',
                                boxShadow: `0 8px 22px ${tk.primary}40`,
                                fontFamily: MONO,
                                opacity: roleOpacity,
                            }}
                        >
                            <BadgeCheck className="w-3 h-3" />
                            Role token
                        </motion.div>
                    </div>
                    <ExecCard tk={tk} name="Amaka I." role="Treasurer" status="incoming" />
                </div>

                {/* Ledger line */}
                <div className="mt-10">
                    <div
                        className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-widest"
                        style={{ fontFamily: MONO, color: tk.textTer }}
                    >
                        <span>Ledger balance — unchanged throughout transfer</span>
                        <span style={{ color: tk.mint }}>₦184,300.00</span>
                    </div>
                    <div
                        className="h-1.5 rounded-full overflow-hidden"
                        style={{ background: tk.cardBorder }}
                    >
                        <motion.div
                            className="h-full rounded-full"
                            style={{
                                width: reduceMotion ? '100%' : ledgerFill,
                                background: `linear-gradient(90deg, ${tk.mint} 0%, ${tk.primary} 100%)`,
                            }}
                        />
                    </div>
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                        {[
                            { label: 'Balance carries over', icon: Wallet, value: '₦184,300.00', color: tk.mint },
                            { label: 'Payment history intact', icon: ReceiptText, value: '847 records', color: tk.primary },
                            { label: 'Trust level preserved', icon: Shield, value: 'Layer 4 verified', color: tk.amber },
                        ].map((item) => (
                            <div
                                key={item.label}
                                className="rounded-xl p-4 text-center"
                                style={{ background: tk.bgWash, border: `1px solid ${tk.cardBorder}` }}
                            >
                                <item.icon className="w-5 h-5 mx-auto mb-2" style={{ color: item.color }} />
                                <p
                                    className="text-sm font-bold"
                                    style={{ fontFamily: MONO, color: item.color }}
                                >
                                    {item.value}
                                </p>
                                <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
                                    {item.label}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

function ExecCard({
    tk,
    name,
    role,
    status,
}: {
    tk: DTK;
    name: string;
    role: string;
    status: 'outgoing' | 'incoming';
}) {
    const outgoing = status === 'outgoing';
    return (
        <div
            className="w-[42%] sm:w-[160px] rounded-2xl p-4 text-center relative z-10"
            style={{
                background: tk.bgWash,
                border: `1px solid ${outgoing ? tk.cardBorder : tk.primary + '50'}`,
                opacity: outgoing ? 0.5 : 1,
            }}
        >
            <div
                className="w-10 h-10 mx-auto rounded-full flex items-center justify-center text-sm font-bold mb-2"
                style={{
                    background: `linear-gradient(135deg, ${tk.primary}, ${tk.mint})`,
                    color: '#fff',
                }}
            >
                {name.charAt(0)}
            </div>
            <p className="text-xs font-bold" style={{ color: tk.text }}>
                {name}
            </p>
            <p
                className="text-[10px] uppercase tracking-wider mt-0.5"
                style={{ fontFamily: MONO, color: tk.textTer }}
            >
                {outgoing ? `Former ${role}` : `New ${role}`}
            </p>
            {!outgoing && (
                <div
                    className="mt-2 flex items-center justify-center gap-1 text-[9px] font-bold uppercase"
                    style={{ color: tk.mint }}
                >
                    <CheckCircle2 className="w-3 h-3" />
                    Peer voted in
                </div>
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════════════════
// TRUST LADDER — deep-dive with what each layer unlocks
// ════════════════════════════════════════════════════════════════
function TrustLadderSection({ tk }: { tk: DTK }) {
    const rungs = [
        {
            icon: Building2,
            title: 'Community',
            subtitle: 'Layer 0',
            body: 'The org exists on Payvexo. A founding member brought it online. No exec has claimed a role yet — structure is set up but no money features are active.',
            unlocks: ['View org structure', 'Invite members (founder only)', 'Set up groups'],
            locked: ['Collect dues', 'Approve expenses', 'Run payouts'],
        },
        {
            icon: Mail,
            title: 'Email verified',
            subtitle: 'Layer 2 · Acting admin',
            body: 'The exec confirmed ownership of a school or org email tied to this organization. For universities, the email domain must match. For churches and clubs, any verifiable email counts.',
            unlocks: ['Access admin dashboard', 'Manage org structure', 'View member list', 'Set up calendar'],
            locked: ['Collect dues', 'Approve expenses', 'Run payouts'],
        },
        {
            icon: Users,
            title: 'Peer confirmed',
            subtitle: 'Layer 3 · Social trust',
            body: 'Real members of the organization voted to confirm this exec holds the role they claimed. Ten independent peer confirmations, or a parent exec sign-off, moves the claim here.',
            unlocks: ['Stronger trust signal', 'Visible "Peer verified" badge'],
            locked: ['Collect dues', 'Approve expenses', 'Run payouts'],
        },
        {
            icon: FileCheck2,
            title: 'Fully verified',
            subtitle: 'Layer 4 · Full admin · Money unlocked',
            body: "A parent exec in the org hierarchy — or the platform's own verification team — has confirmed this person's identity and role. This is the gate money sits behind.",
            unlocks: ['Publish dues', 'Waive payments', 'Approve expenses', 'Connect payout account', 'Transfer your role', 'View full financial audit trail'],
            locked: [],
        },
        {
            icon: ShieldCheck,
            title: 'Platform verified',
            subtitle: 'Layer 5 · Highest trust',
            body: 'Reserved for organizations the Payvexo team has independently confirmed — school registrar confirmed, BVN matched, institution letter received. Unlocks highest payout limits.',
            unlocks: ['Highest payout limits', 'Platform spotlight', 'Priority support'],
            locked: [],
        },
    ];

    return (
        <section id="trust" className="max-w-4xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
            <div className="text-center mb-12">
                <Eyebrow tk={tk}>Verification system</Eyebrow>
                <h2
                    className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight"
                    style={{ color: tk.text }}
                >
                    Trust is earned, one layer at a time.
                </h2>
                <p
                    className="mt-3 text-sm leading-6 max-w-md mx-auto"
                    style={{ color: tk.textSec }}
                >
                    The reason Payvexo can let anyone found an org is that founding grants zero money access.
                    Every financial capability is gated behind real, hard-to-fake verification.
                    Here's exactly what each layer looks like and what it unlocks.
                </p>
            </div>

            <div className="relative pl-10 sm:pl-14">
                {/* Spine */}
                <div
                    className="absolute left-[15px] sm:left-[19px] top-2 bottom-2 w-0.5"
                    style={{ background: `linear-gradient(180deg, ${tk.cardBorder}, ${tk.mint})` }}
                    aria-hidden
                />

                <div className="space-y-5">
                    {rungs.map((r, i) => {
                        const isTop = i === rungs.length - 1;
                        const nodeColor = isTop ? tk.mint : i >= 3 ? tk.primary : i >= 1 ? tk.amber : tk.textTer;

                        return (
                            <motion.div
                                key={r.title}
                                initial={{ opacity: 0, x: -14 }}
                                whileInView={{ opacity: 1, x: 0 }}
                                viewport={{ once: true, margin: '-40px' }}
                                transition={{ duration: 0.4, ease: EASE, delay: i * 0.08 }}
                                className="relative"
                            >
                                {/* Node */}
                                <div
                                    className="absolute -left-10 sm:-left-14 top-4 w-8 h-8 rounded-full flex items-center justify-center"
                                    style={{
                                        background: isTop ? tk.mint : tk.card,
                                        border: `2px solid ${nodeColor}`,
                                        color: isTop ? '#06281C' : nodeColor,
                                    }}
                                >
                                    <r.icon className="w-3.5 h-3.5" />
                                </div>

                                <div
                                    className="rounded-2xl p-5"
                                    style={{
                                        background: tk.card,
                                        border: `1px solid ${isTop ? tk.mint + '40' : tk.cardBorder}`,
                                    }}
                                >
                                    <div className="flex items-start justify-between gap-4 mb-2 flex-wrap">
                                        <div>
                                            <h3 className="text-sm font-bold" style={{ color: tk.text }}>
                                                {r.title}
                                            </h3>
                                            <Stamp tk={tk} color={nodeColor}>
                                                {r.subtitle}
                                            </Stamp>
                                        </div>
                                        <div
                                            className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                                            style={{
                                                fontFamily: MONO,
                                                background: `${nodeColor}14`,
                                                color: nodeColor,
                                                border: `1px solid ${nodeColor}30`,
                                            }}
                                        >
                                            RUNG {i + 1}/{rungs.length}
                                        </div>
                                    </div>

                                    <p className="text-[13px] leading-5 mb-4" style={{ color: tk.textSec }}>
                                        {r.body}
                                    </p>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {r.unlocks.length > 0 && (
                                            <div>
                                                <p
                                                    className="text-[10px] font-bold uppercase tracking-wider mb-2"
                                                    style={{ color: tk.mint }}
                                                >
                                                    Unlocks
                                                </p>
                                                <ul className="space-y-1.5">
                                                    {r.unlocks.map((u) => (
                                                        <li
                                                            key={u}
                                                            className="flex items-center gap-2 text-[12px]"
                                                            style={{ color: tk.textSec }}
                                                        >
                                                            <Check className="w-3 h-3 shrink-0" style={{ color: tk.mint }} />
                                                            {u}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                        {r.locked.length > 0 && (
                                            <div>
                                                <p
                                                    className="text-[10px] font-bold uppercase tracking-wider mb-2"
                                                    style={{ color: LEDGER_RED }}
                                                >
                                                    Still locked
                                                </p>
                                                <ul className="space-y-1.5">
                                                    {r.locked.map((l) => (
                                                        <li
                                                            key={l}
                                                            className="flex items-center gap-2 text-[12px]"
                                                            style={{ color: tk.textTer }}
                                                        >
                                                            <Lock className="w-3 h-3 shrink-0" style={{ color: LEDGER_RED + '80' }} />
                                                            {l}
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}

// ════════════════════════════════════════════════════════════════
// TIER AUTONOMY — class money ≠ dept money ≠ faculty money
// ════════════════════════════════════════════════════════════════
function TierAutonomySection({ tk }: { tk: DTK }) {
    const tiers = [
        {
            label: 'Faculty level',
            color: tk.purple || tk.primary,
            example: 'Engineering Faculty',
            dues: '₦2,000 faculty development levy',
            scope: 'Billed to every student across all departments under this faculty',
        },
        {
            label: 'Department level',
            color: tk.amber,
            example: 'Electrical Eng. Dept.',
            dues: '₦5,000 dept week dues',
            scope: 'Billed to every student in every class under this department',
        },
        {
            label: 'Class level',
            color: tk.mint,
            example: 'EEE 300L 2027',
            dues: '₦3,000 class socialization fund',
            scope: 'Billed to and collected from this class only',
        },
    ];

    return (
        <section id="tier-autonomy" className="max-w-5xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
            <div className="text-center max-w-xl mx-auto mb-10">
                <Eyebrow tk={tk} tone="amber">
                    Tier autonomy
                </Eyebrow>
                <h2
                    className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight"
                    style={{ color: tk.text }}
                >
                    Every tier owns its own money.
                </h2>
                <p className="mt-3 text-sm leading-6" style={{ color: tk.textSec }}>
                    A class rep collects class dues. A HOD collects department dues.
                    A faculty exec collects faculty dues. These balances are completely
                    separate — a department executive cannot see or touch your class's
                    money, and vice versa. The right people see the right ledger.
                </p>
            </div>

            {/* Hierarchy visual */}
            <div className="space-y-3">
                {tiers.map((tier, i) => (
                    <motion.div
                        key={tier.label}
                        initial={{ opacity: 0, x: -12 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true, margin: '-40px' }}
                        transition={{ duration: 0.4, ease: EASE, delay: i * 0.1 }}
                        className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4"
                        style={{
                            background: tk.card,
                            border: `1px solid ${tier.color}30`,
                            marginLeft: `${i * 20}px`,
                        }}
                    >
                        <div
                            className="w-3 h-full min-h-[40px] rounded-full shrink-0"
                            style={{ background: tier.color }}
                        />
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <Stamp tk={tk} color={tier.color}>
                                    {tier.label}
                                </Stamp>
                                <span className="text-sm font-bold" style={{ color: tk.text }}>
                                    {tier.example}
                                </span>
                            </div>
                            <p className="text-[13px]" style={{ color: tk.textSec }}>
                                <span className="font-semibold" style={{ color: tk.text }}>
                                    Sample due:
                                </span>{' '}
                                {tier.dues}
                            </p>
                            <p className="text-[12px] mt-1" style={{ color: tk.textTer }}>
                                {tier.scope}
                            </p>
                        </div>
                        <div
                            className="shrink-0 rounded-xl px-4 py-2 text-center"
                            style={{ background: `${tier.color}10`, border: `1px solid ${tier.color}25` }}
                        >
                            <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: tier.color, fontFamily: MONO }}>
                                Own balance
                            </p>
                            <Layers className="w-4 h-4 mx-auto" style={{ color: tier.color }} />
                        </div>
                    </motion.div>
                ))}
            </div>

            <div
                className="mt-6 p-4 rounded-2xl flex items-start gap-3"
                style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
            >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" style={{ color: tk.amber }} />
                <p className="text-sm leading-6" style={{ color: tk.textSec }}>
                    <strong style={{ color: tk.text }}>Cascade rule:</strong> when a department
                    publishes a due, it automatically bills every student in every class under it —
                    you don't have to go class by class. The department collects; the classes
                    can see it in their member dashboards as a due from the dept. Settlement
                    goes to the department's payout account, not the class's.
                </p>
            </div>
        </section>
    );
}

// ════════════════════════════════════════════════════════════════
// FEE TRANSPARENCY — exact math, settlement timing
// ════════════════════════════════════════════════════════════════
function FeeSection({ tk }: { tk: DTK }) {
    const [amount, setAmount] = useState(5000);
    const fee = Math.min(Math.round(amount * 0.015), 2000);
    const net = amount - fee;

    return (
        <section id="fees" className="max-w-5xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
            <div className="text-center max-w-xl mx-auto mb-10">
                <Eyebrow tk={tk}>Fee transparency</Eyebrow>
                <h2
                    className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight"
                    style={{ color: tk.text }}
                >
                    No hidden fees. Ever.
                </h2>
                <p className="mt-3 text-sm leading-6" style={{ color: tk.textSec }}>
                    Every fee is shown to the member before they pay. The Paystack
                    fee is 1.5% of the due amount + ₦100 flat fee, capped at ₦2,000. You always see the
                    exact split before confirming.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                {/* Calculator */}
                <div
                    className="rounded-2xl p-6"
                    style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
                >
                    <h3 className="text-sm font-bold mb-4" style={{ color: tk.text }}>
                        Live fee calculator
                    </h3>
                    <div className="mb-4">
                        <label
                            className="block text-[11px] font-bold uppercase tracking-wider mb-2"
                            style={{ color: tk.textTer }}
                        >
                            Due amount (₦)
                        </label>
                        <div className="flex gap-2 flex-wrap">
                            {[2000, 5000, 10000, 20000].map((v) => (
                                <button
                                    key={v}
                                    onClick={() => setAmount(v)}
                                    className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                                    style={{
                                        background: amount === v ? tk.primary : tk.bgWash,
                                        color: amount === v ? '#fff' : tk.textSec,
                                        border: `1px solid ${amount === v ? tk.primary : tk.cardBorder}`,
                                        fontFamily: MONO,
                                    }}
                                >
                                    {naira(v)}
                                </button>
                            ))}
                        </div>
                        <input
                            type="range"
                            min={500}
                            max={50000}
                            step={500}
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                            className="w-full mt-4 accent-current"
                            style={{ accentColor: tk.primary }}
                        />
                    </div>

                    <div
                        className="rounded-xl p-4 space-y-3"
                        style={{ background: tk.bgWash, fontFamily: MONO }}
                    >
                        <div className="flex justify-between text-sm">
                            <span style={{ color: tk.textSec }}>Member pays</span>
                            <span style={{ color: tk.text, fontWeight: 700 }}>{naira(amount)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                            <span style={{ color: tk.textSec }}>Paystack fee (1.5%)</span>
                            <span style={{ color: LEDGER_RED }}>−{naira(fee)}</span>
                        </div>
                        <div
                            className="pt-3 flex justify-between border-t"
                            style={{ borderColor: tk.cardBorder }}
                        >
                            <span className="text-sm font-bold" style={{ color: tk.text }}>
                                Your class receives
                            </span>
                            <span className="text-sm font-bold" style={{ color: tk.mint }}>
                                {naira(net)}
                            </span>
                        </div>
                    </div>

                    <p className="text-[11px] mt-3 leading-4" style={{ color: tk.textTer }}>
                        Fee capped at ₦2,000 for dues above ₦133,333. No subscription, no setup fee, no monthly charge, also a flat fee of ₦100 applies to payments above 2,500.
                    </p>
                </div>

                {/* Settlement */}
                <div className="space-y-4">
                    <div
                        className="rounded-2xl p-5"
                        style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <span
                                className="w-9 h-9 rounded-xl flex items-center justify-center"
                                style={{ background: `${tk.mint}14`, color: tk.mint }}
                            >
                                <Clock className="w-4 h-4" />
                            </span>
                            <div>
                                <h4 className="text-sm font-bold" style={{ color: tk.text }}>
                                    Settlement timing
                                </h4>
                                <Stamp tk={tk} color={tk.mint}>
                                    Next working day
                                </Stamp>
                            </div>
                        </div>
                        <p className="text-[13px] leading-5" style={{ color: tk.textSec }}>
                            Money moves directly to your org's KYC-verified Paystack sub-account.
                            You don't have to manually withdraw — settlement happens automatically
                            on the next Nigerian working day after each payment confirms.
                        </p>
                    </div>

                    <div
                        className="rounded-2xl p-5"
                        style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <span
                                className="w-9 h-9 rounded-xl flex items-center justify-center"
                                style={{ background: `${tk.primary}14`, color: tk.primary }}
                            >
                                <Landmark className="w-4 h-4" />
                            </span>
                            <div>
                                <h4 className="text-sm font-bold" style={{ color: tk.text }}>
                                    KYC-verified payout
                                </h4>
                                <Stamp tk={tk} color={tk.primary}>
                                    Bank account required
                                </Stamp>
                            </div>
                        </div>
                        <p className="text-[13px] leading-5" style={{ color: tk.textSec }}>
                            Collecting money requires connecting a Nigerian bank account through
                            Paystack. This is intentional — it means the money goes somewhere real
                            and traceable, not a pocket. The payout account is visible to all
                            members who have permission, so nothing is hidden.
                        </p>
                    </div>

                    <div
                        className="rounded-2xl p-5"
                        style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <span
                                className="w-9 h-9 rounded-xl flex items-center justify-center"
                                style={{ background: `${tk.amber}14`, color: tk.amber }}
                            >
                                <TrendingUp className="w-4 h-4" />
                            </span>
                            <div>
                                <h4 className="text-sm font-bold" style={{ color: tk.text }}>
                                    No subscription
                                </h4>
                                <Stamp tk={tk} color={tk.amber}>
                                    Free + unlimited
                                </Stamp>
                            </div>
                        </div>
                        <p className="text-[13px] leading-5" style={{ color: tk.textSec }}>
                            Payvexo is free to use. No member caps, no group limits, no monthly
                            fee. You pay only when money moves — the platform earns when you earn.
                            Large collectors can unlock lower fee rates through a paid plan.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}

// ════════════════════════════════════════════════════════════════
// EVENT TICKETS — QR, tiers, check-in
// ════════════════════════════════════════════════════════════════
function EventTicketsSection({ tk }: { tk: DTK }) {
    const [scanned, setScanned] = useState(false);

    return (
        <section id="events" className="max-w-5xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
            <div className="text-center max-w-xl mx-auto mb-10">
                <Eyebrow tk={tk} tone="mint">
                    Event tickets
                </Eyebrow>
                <h2
                    className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight"
                    style={{ color: tk.text }}
                >
                    Not just dues — full event ticketing.
                </h2>
                <p className="mt-3 text-sm leading-6" style={{ color: tk.textSec }}>
                    Publish an event with multiple ticket tiers, price them differently,
                    cap the seats. Members pay and receive a QR code. At the door,
                    your exec scans it. The system confirms the tier and marks it used —
                    no printed ticket, no list to check manually.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Ticket card */}
                <div
                    className="rounded-2xl p-5 relative overflow-hidden"
                    style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
                >
                    <div
                        className="absolute top-0 left-0 right-0 h-[3px]"
                        style={{ background: `linear-gradient(90deg, ${tk.primary}, ${tk.mint})` }}
                    />
                    <Stamp tk={tk} color={tk.primary}>
                        Event ticket
                    </Stamp>
                    <h3 className="text-sm font-bold mt-2 mb-1" style={{ color: tk.text }}>
                        Dept Week Gala Night
                    </h3>
                    <p className="text-[12px]" style={{ color: tk.textTer }}>
                        EEE Dept · April 12 · 6:00 PM
                    </p>

                    <div className="mt-4 space-y-2">
                        {[
                            { tier: 'Regular', price: '₦3,000', avail: '120 left' },
                            { tier: 'VIP', price: '₦8,000', avail: '18 left', low: true },
                            { tier: 'VVIP', price: '₦15,000', avail: '5 left', low: true },
                        ].map((t) => (
                            <div
                                key={t.tier}
                                className="flex items-center justify-between rounded-xl px-3 py-2.5"
                                style={{
                                    background: tk.bgWash,
                                    border: `1px solid ${t.low ? tk.amber + '40' : tk.cardBorder}`,
                                }}
                            >
                                <div>
                                    <p className="text-[12px] font-bold" style={{ color: tk.text }}>
                                        {t.tier}
                                    </p>
                                    <p
                                        className="text-[11px]"
                                        style={{ color: t.low ? tk.amber : tk.textTer, fontFamily: MONO }}
                                    >
                                        {t.avail}
                                        {t.low && ' · filling fast'}
                                    </p>
                                </div>
                                <span
                                    className="text-sm font-bold"
                                    style={{ fontFamily: MONO, color: tk.primary }}
                                >
                                    {t.price}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Issued ticket */}
                <div
                    className="rounded-2xl p-5 relative overflow-hidden"
                    style={{ background: tk.card, border: `1px solid ${tk.mint}30` }}
                >
                    <div
                        className="absolute top-0 left-0 right-0 h-[3px]"
                        style={{ background: tk.mint }}
                    />
                    <Stamp tk={tk} color={tk.mint}>
                        Your ticket · issued on payment
                    </Stamp>
                    <div className="mt-4 flex items-center justify-between mb-3">
                        <div>
                            <p className="text-sm font-bold" style={{ color: tk.text }}>
                                Dept Week Gala Night
                            </p>
                            <p className="text-[12px]" style={{ color: tk.textSec }}>
                                VIP · April 12 · 6:00 PM
                            </p>
                        </div>
                        <div
                            className="text-right"
                            style={{ fontFamily: MONO, color: tk.primary, fontSize: 11 }}
                        >
                            PVX-TKT
                            <br />
                            4892
                        </div>
                    </div>

                    {/* Fake QR */}
                    <div
                        className="w-24 h-24 mx-auto rounded-xl flex items-center justify-center mb-3"
                        style={{ background: tk.bgWash, border: `1px solid ${tk.cardBorder}` }}
                    >
                        <QrCode className="w-14 h-14" style={{ color: tk.text }} />
                    </div>

                    <p className="text-center text-[11px]" style={{ color: tk.textTer }}>
                        Show this at the door. Scannable by any authorized exec.
                    </p>

                    <Perforation tk={tk} />

                    <div className="flex items-center justify-between text-[11px]" style={{ fontFamily: MONO }}>
                        <span style={{ color: tk.textTer }}>Chukwuemeka O.</span>
                        <span style={{ color: tk.mint }}>VALID</span>
                    </div>
                </div>

                {/* Door scan */}
                <div
                    className="rounded-2xl p-5 relative overflow-hidden"
                    style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
                >
                    <Stamp tk={tk} color={tk.primary}>
                        Door check-in · exec only
                    </Stamp>
                    <p className="text-[12px] mt-2 mb-4" style={{ color: tk.textSec }}>
                        Each tier exec can only scan tickets from their own tier's events —
                        a class rep can't scan faculty tickets, and vice versa.
                    </p>

                    <div
                        className="rounded-xl p-4 text-center mb-4"
                        style={{
                            background: tk.bgWash,
                            border: `1px dashed ${tk.cardBorder}`,
                        }}
                    >
                        <ScanLine className="w-8 h-8 mx-auto mb-2" style={{ color: tk.primary }} />
                        <p className="text-[12px]" style={{ color: tk.textTer }}>
                            Point camera at member QR
                        </p>
                    </div>

                    <AnimatePresence mode="wait">
                        {!scanned ? (
                            <motion.button
                                key="scan"
                                onClick={() => setScanned(true)}
                                whileHover={{ y: -1 }}
                                whileTap={{ scale: 0.98 }}
                                className="w-full py-2.5 rounded-xl text-sm font-bold"
                                style={{ background: tk.primary, color: '#fff' }}
                                exit={{ opacity: 0 }}
                            >
                                Simulate a scan →
                            </motion.button>
                        ) : (
                            <motion.div
                                key="result"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="rounded-xl p-4 text-center"
                                style={{ background: `${tk.mint}12`, border: `1px solid ${tk.mint}30` }}
                            >
                                <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: tk.mint }} />
                                <p className="text-sm font-bold" style={{ color: tk.mint }}>
                                    Valid — VIP tier
                                </p>
                                <p className="text-[12px] mt-1" style={{ color: tk.textSec }}>
                                    Chukwuemeka O. · PVX-TKT-4892
                                </p>
                                <button
                                    onClick={() => setScanned(false)}
                                    className="mt-3 text-[11px] underline"
                                    style={{ color: tk.textTer }}
                                >
                                    Reset
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </section>
    );
}

// ════════════════════════════════════════════════════════════════
// MULTI-ORG IDENTITY
// ════════════════════════════════════════════════════════════════
function MultiOrgSection({ tk }: { tk: DTK }) {
    const [activeOrg, setActiveOrg] = useState(0);
    const orgs = [
        {
            name: 'EEE 300L 2027',
            role: 'Class Rep',
            layer: 4,
            type: 'class',
            color: tk.primary,
            emoji: '🎓',
        },
        {
            name: 'Gospel Assembly',
            role: 'Financial Secretary',
            layer: 3,
            type: 'church',
            color: tk.mint,
            emoji: '🙏',
        },
        {
            name: 'NSA Enugu Chapter',
            role: 'Member',
            layer: 0,
            type: 'association',
            color: tk.amber,
            emoji: '🤝',
        },
    ];

    return (
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
            <div className="text-center max-w-xl mx-auto mb-10">
                <Eyebrow tk={tk}>Multi-org identity</Eyebrow>
                <h2
                    className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight"
                    style={{ color: tk.text }}
                >
                    One person. Many roles.
                </h2>
                <p className="mt-3 text-sm leading-6" style={{ color: tk.textSec }}>
                    You might be a class rep in your department, a financial secretary in
                    your church, and a regular member in a professional association —
                    all with the same Payvexo account. Switch orgs from the nav with one tap.
                    Each org's data is completely isolated from the others.
                </p>
            </div>

            <div
                className="rounded-2xl overflow-hidden"
                style={{ border: `1px solid ${tk.cardBorder}` }}
            >
                {/* Org switcher */}
                <div
                    className="flex border-b"
                    style={{ borderColor: tk.cardBorder, background: tk.bgWash }}
                >
                    {orgs.map((org, i) => (
                        <button
                            key={org.name}
                            onClick={() => setActiveOrg(i)}
                            className="flex-1 py-3 px-4 text-center text-[12px] font-bold transition-all"
                            style={{
                                background: activeOrg === i ? tk.card : 'transparent',
                                color: activeOrg === i ? org.color : tk.textTer,
                                borderBottom: activeOrg === i ? `2px solid ${org.color}` : '2px solid transparent',
                            }}
                        >
                            <span className="block text-base mb-0.5">{org.emoji}</span>
                            <span className="hidden sm:block">{org.name}</span>
                            <span className="block sm:hidden text-[10px]">{org.type}</span>
                        </button>
                    ))}
                </div>

                {/* Org content */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeOrg}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2 }}
                        className="p-6"
                        style={{ background: tk.card }}
                    >
                        <div className="flex items-center justify-between mb-5 flex-wrap gap-4">
                            <div>
                                <p className="text-lg font-extrabold" style={{ color: tk.text }}>
                                    {orgs[activeOrg].name}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                    <Stamp tk={tk} color={orgs[activeOrg].color}>
                                        {orgs[activeOrg].role}
                                    </Stamp>
                                    <span
                                        className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                                        style={{
                                            background: `${orgs[activeOrg].color}14`,
                                            color: orgs[activeOrg].color,
                                            fontFamily: MONO,
                                        }}
                                    >
                                        Layer {orgs[activeOrg].layer}
                                    </span>
                                </div>
                            </div>
                            <Globe className="w-8 h-8" style={{ color: orgs[activeOrg].color + '50' }} />
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                                { label: 'Data visible to', value: 'This org only' },
                                { label: 'Other orgs can see', value: 'Nothing' },
                                { label: 'Role in other orgs', value: 'Unaffected' },
                                { label: 'Switch orgs via', value: 'Nav dropdown' },
                            ].map((item) => (
                                <div
                                    key={item.label}
                                    className="rounded-xl p-3"
                                    style={{ background: tk.bgWash, border: `1px solid ${tk.cardBorder}` }}
                                >
                                    <p className="text-[10px]" style={{ color: tk.textTer }}>
                                        {item.label}
                                    </p>
                                    <p className="text-[12px] font-bold mt-1" style={{ color: tk.text }}>
                                        {item.value}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>

            <p className="mt-4 text-[12px] text-center" style={{ color: tk.textTer }}>
                Your password, email, and member IDs are separate per org. Joining a new org
                doesn't expose your identity to the other orgs you're in.
            </p>
        </section>
    );
}

// ════════════════════════════════════════════════════════════════
// FOR MEMBERS vs FOR EXECS
// ════════════════════════════════════════════════════════════════
function AudienceSection({ tk }: { tk: DTK }) {
    const member = [
        { icon: Eye, text: 'See exactly what you owe and what you\'ve already paid — with receipts for every payment.' },
        { icon: CreditCard, text: 'Pay in seconds via Paystack. No chasing a treasurer to confirm cash or waiting for a mark in a book.' },
        { icon: BarChart3, text: 'See where approved expenses actually went — category, amount, date, who approved it.' },
        { icon: QrCode, text: 'Get a QR-code ticket for every event you pay for. Show it at the door, get scanned, walk in.' },
        { icon: RefreshCw, text: 'Your payment history survives every exec handover. Nothing resets when the class rep changes.' },
        { icon: Globe, text: 'Join multiple orgs with one identity. Your church fellowship and your class, separate and clean.' },
    ];
    const exec = [
        { icon: Wallet, text: 'Collect dues without manually tracking who paid. The ledger does it in real time.' },
        { icon: Gift, text: 'Waive dues for members who can\'t pay — they still get proper receipts and event tickets.' },
        { icon: FileCheck2, text: 'Approve expenses with an audit trail attached automatically — date, category, approver, amount.' },
        { icon: Repeat, text: 'Hand over your role at the end of your tenure. The entire ledger carries forward to the next exec.' },
        { icon: BadgeCheck, text: 'Build real trust with the community through Payvexo\'s verification system — not just a title.' },
        { icon: Layers, text: 'Publish dues that cascade down to every member in your subtree — class, department, or faculty.' },
    ];

    return (
        <section className="max-w-6xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
            <div className="text-center max-w-xl mx-auto mb-10">
                <Eyebrow tk={tk}>Built for both sides</Eyebrow>
                <h2
                    className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight"
                    style={{ color: tk.text }}
                >
                    For members. For execs.
                </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div
                    className="rounded-2xl p-6"
                    style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
                >
                    <div className="flex items-center gap-2.5 mb-6">
                        <span
                            className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{ background: tk.primarySoft, color: tk.primary }}
                        >
                            <GraduationCap className="w-4 h-4" />
                        </span>
                        <div>
                            <h3 className="text-sm font-bold" style={{ color: tk.text }}>
                                If you're a member
                            </h3>
                            <Stamp tk={tk}>Student · worshipper · associate</Stamp>
                        </div>
                    </div>
                    <ul className="space-y-4">
                        {member.map((m) => (
                            <li key={m.text} className="flex items-start gap-3 text-sm leading-5">
                                <span
                                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ background: tk.primarySoft, color: tk.primary }}
                                >
                                    <m.icon className="w-3.5 h-3.5" />
                                </span>
                                <span style={{ color: tk.textSec }}>{m.text}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div
                    className="rounded-2xl p-6"
                    style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
                >
                    <div className="flex items-center gap-2.5 mb-6">
                        <span
                            className="w-9 h-9 rounded-xl flex items-center justify-center"
                            style={{ background: `${tk.mint}14`, color: tk.mint }}
                        >
                            <ShieldCheck className="w-4 h-4" />
                        </span>
                        <div>
                            <h3 className="text-sm font-bold" style={{ color: tk.text }}>
                                If you're an exec
                            </h3>
                            <Stamp tk={tk}>Class rep · treasurer · HOD · pastor</Stamp>
                        </div>
                    </div>
                    <ul className="space-y-4">
                        {exec.map((m) => (
                            <li key={m.text} className="flex items-start gap-3 text-sm leading-5">
                                <span
                                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                                    style={{ background: `${tk.mint}14`, color: tk.mint }}
                                >
                                    <m.icon className="w-3.5 h-3.5" />
                                </span>
                                <span style={{ color: tk.textSec }}>{m.text}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </section>
    );
}

// ════════════════════════════════════════════════════════════════
// ORG TYPES SUPPORTED
// ════════════════════════════════════════════════════════════════
function OrgTypesSection({ tk }: { tk: DTK }) {
    const types = [
        { emoji: '🎓', label: 'University class', detail: 'Dues, events, class-level management, cohort level tracking (100L → 500L)' },
        { emoji: '🏛️', label: 'Department', detail: 'Dept-wide dues, expense management, faculty/class subtree visibility' },
        { emoji: '📚', label: 'College of Education', detail: 'Same academic hierarchy, NCE terminology adapted' },
        { emoji: '🔬', label: 'Polytechnic', detail: 'HND, ND and Part-Time levels supported' },
        { emoji: '⛪', label: 'Church', detail: 'Ministries instead of departments. Fellowships, youth wings, mothers union' },
        { emoji: '🤝', label: 'Association', detail: 'Chapters, zones, central. Professional associations, alumni bodies' },
        { emoji: '♟️', label: 'Club', detail: 'Branches and sub-chapters. Social clubs, sports clubs, hobby groups' },
        { emoji: '🏢', label: 'Company / Cooperative', detail: 'Staff welfare levies, cooperative savings units' },
    ];

    return (
        <section className="max-w-5xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
            <div className="text-center max-w-xl mx-auto mb-10">
                <Eyebrow tk={tk}>Supported org types</Eyebrow>
                <h2
                    className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight"
                    style={{ color: tk.text }}
                >
                    Not just universities.
                </h2>
                <p className="mt-3 text-sm leading-6" style={{ color: tk.textSec }}>
                    Payvexo was designed for the Nigerian context. The terminology adapts to
                    whatever type of organization you are — you'll see the right labels,
                    the right hierarchy, and the right language for your group everywhere
                    in the product.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {types.map((t, i) => (
                    <motion.div
                        key={t.label}
                        initial={{ opacity: 0, y: 12 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-40px' }}
                        transition={{ duration: 0.35, ease: EASE, delay: i * 0.06 }}
                        className="rounded-2xl p-4"
                        style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
                    >
                        <span className="text-2xl">{t.emoji}</span>
                        <h4 className="text-sm font-bold mt-2 mb-1" style={{ color: tk.text }}>
                            {t.label}
                        </h4>
                        <p className="text-[12px] leading-4" style={{ color: tk.textSec }}>
                            {t.detail}
                        </p>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}

// ════════════════════════════════════════════════════════════════
// FAQ — 10 questions
// ════════════════════════════════════════════════════════════════
function FAQSection({ tk }: { tk: DTK }) {
    const faqs = [
        {
            q: "Is our class's money pooled with any other organization's?",
            a: "No. Every organization on Payvexo is fully isolated at the database level — your balance, your members, your payment records, and your expenses are scoped to your org alone. Row-level security means there is no technical path for one org's data to reach another, even accidentally.",
        },
        {
            q: 'What happens when our treasurer or class rep graduates?',
            a: "The outgoing exec uses the Payvexo handover flow to transfer their role to the incoming exec. The incoming person claims the role, gets peer-verified, and is granted the same Layer 4 access. The balance, payment history, and trust level are all preserved exactly as they were — the ledger belongs to the class, not to any individual.",
        },
        {
            q: 'How do you verify someone is actually a class rep or treasurer?',
            a: "Through the layered verification system. It starts with confirming ownership of a school or org email (Layer 2), then peer votes from real members in the org (Layer 3), then confirmation from a parent exec or the platform team (Layer 4). Each layer unlocks more capabilities. The money stays locked until Layer 4 — so claiming a title alone gets you nothing.",
        },
        {
            q: 'What exact fee does Paystack charge?',
            a: "The Paystack fee is 1.5% of each due amount + ₦100 flat fee for payments above ₦2,500 capped at ₦2,000. There is no subscription fee, no setup fee, no monthly charge. The fee is shown to the member before they confirm payment — it's never hidden or added after the fact. The exact amount your class receives is always visible in the payment breakdown.",
        },
        {
            q: 'When does money actually reach our bank account?',
            a: "Money moves directly to your organization's KYC-verified Paystack sub-account. Settlement to your linked Nigerian bank account happens on the next working day after each payment confirms — automatically, with no manual withdrawal needed on your part.",
        },
        {
            q: 'Can members see where approved expenses went?',
            a: "Yes. Every approved expense can be exported and shown to members in your organization — category, amount, date, and the exec who approved it. This is intentional: the whole point of Payvexo is that money is transparent, not that it's hidden from the people who contributed it.",
        },
        {
            q: "We're a church / club / association — does Payvexo work for us?",
            a: "Yes. Payvexo was designed for the full Nigerian context. The terminology in your dashboard adapts to your org type: universities see Faculties, Departments, and Classes; churches see Ministries and Fellowships; clubs see Chapters and Branches. The financial infrastructure is the same underneath — what changes is the language.",
        },
        {
            q: 'What if two people both claim to be the class rep?',
            a: "Payvexo handles contested claims. When a second person files a claim for a role that already has an active claim, both claimants are notified, and the entire voting pool sees both candidates — clearly marked as a contest. Only one person can be granted the verified seat. Once one person is confirmed Layer 4, the other claim is closed automatically.",
        },
        {
            q: 'Can a department president see my class\'s money?',
            a: "No. This is one of the core design principles: each tier owns its own money. A department exec can see collections from department-level dues (dues they published that cascade to your class), but they cannot see or touch the class's own balance, the class's own expenses, or the class's own payout account. Tier autonomy is enforced at both the application and database level.",
        },
        {
            q: 'What is the platform fee used for, and will it go up?',
            a: "The fee covers Paystack's processing charges. The fee structure is shown transparently in your dashboard at all times. Payvexo does not earn from ads, does not sell data, and does not hold your organization's money. Any changes to the fee schedule would be announced in advance, and your current fee rate is always visible in your org's settings.",
        },
    ];

    const [open, setOpen] = useState<number | null>(0);

    return (
        <section id="faq" className="max-w-2xl mx-auto px-5 sm:px-6 py-14 sm:py-20">
            <div className="text-center mb-10">
                <Eyebrow tk={tk}>Common questions</Eyebrow>
                <h2
                    className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight"
                    style={{ color: tk.text }}
                >
                    Questions we actually get asked.
                </h2>
            </div>

            <div className="space-y-2.5">
                {faqs.map((f, i) => {
                    const isOpen = open === i;
                    return (
                        <div
                            key={f.q}
                            className="rounded-2xl overflow-hidden transition-all"
                            style={{
                                background: tk.card,
                                border: `1px solid ${isOpen ? tk.primary + '40' : tk.cardBorder}`,
                            }}
                        >
                            <button
                                onClick={() => setOpen(isOpen ? null : i)}
                                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                                aria-expanded={isOpen}
                            >
                                <span className="flex items-center gap-3">
                                    <span
                                        className="font-bold text-[11px] shrink-0"
                                        style={{ fontFamily: MONO, color: tk.textTer }}
                                    >
                                        {String(i + 1).padStart(2, '0')}
                                    </span>
                                    <span className="text-sm font-bold" style={{ color: tk.text }}>
                                        {f.q}
                                    </span>
                                </span>
                                <ChevronDown
                                    className="w-4 h-4 shrink-0 transition-transform"
                                    style={{
                                        color: tk.textTer,
                                        transform: isOpen ? 'rotate(180deg)' : 'none',
                                    }}
                                />
                            </button>
                            <AnimatePresence initial={false}>
                                {isOpen && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.25, ease: EASE }}
                                    >
                                        <p
                                            className="px-5 pb-5 pl-14 text-[13px] leading-6"
                                            style={{ color: tk.textSec }}
                                        >
                                            {f.a}
                                        </p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

// ════════════════════════════════════════════════════════════════
// CTA
// ════════════════════════════════════════════════════════════════
function CTASection({
    tk,
    navigate,
}: {
    tk: DTK;
    navigate: (path: string) => void;
}) {
    return (
        <section className="max-w-4xl mx-auto px-5 sm:px-6 py-16 sm:py-24">
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, ease: EASE }}
                className="rounded-[28px] p-10 sm:p-14 text-center relative overflow-hidden"
                style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
            >
                <div
                    className="absolute -top-28 -right-28 w-80 h-80 rounded-full"
                    style={{
                        background: tk.primary,
                        opacity: 0.07,
                        filter: 'blur(90px)',
                    }}
                    aria-hidden
                />
                <div
                    className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full"
                    style={{
                        background: tk.mint,
                        opacity: 0.05,
                        filter: 'blur(80px)',
                    }}
                    aria-hidden
                />

                <Sparkles className="w-6 h-6 mx-auto mb-4" style={{ color: tk.primary }} />
                <h2
                    className="text-2xl sm:text-3xl font-extrabold tracking-tight max-w-md mx-auto"
                    style={{ color: tk.text }}
                >
                    Start a ledger that outlives your tenure.
                </h2>
                <p
                    className="mt-3 text-sm leading-6 max-w-sm mx-auto"
                    style={{ color: tk.textSec }}
                >
                    Bring your class, department, fellowship, or club online in under five
                    minutes. The next exec will inherit a complete record — not a WhatsApp
                    message asking "do you know what the balance is?"
                </p>

                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <motion.button
                        onClick={() => navigate('/bring-school')}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold"
                        style={{
                            background: tk.primary,
                            color: '#fff',
                            boxShadow: `0 12px 32px ${tk.primary}40`,
                        }}
                    >
                        Bring your school online
                        <ArrowRight className="w-4 h-4" />
                    </motion.button>
                    <motion.button
                        onClick={() => navigate('/')}
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.98 }}
                        className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold"
                        style={{
                            background: tk.bgWash,
                            color: tk.text,
                            border: `1px solid ${tk.cardBorder}`,
                        }}
                    >
                        <Search className="w-4 h-4" />
                        Find your school first
                    </motion.button>
                </div>

                <div
                    className="mt-8 flex flex-wrap items-center justify-center gap-5 text-[11px]"
                    style={{ color: tk.textTer }}
                >
                    {[
                        { icon: Lock, text: 'Org-isolated data' },
                        { icon: Eye, text: 'Full audit trail' },
                        { icon: Zap, text: 'T+1 bank settlement' },
                        { icon: Smartphone, text: 'Mobile-ready' },
                        { icon: Shield, text: 'KYC-verified payouts' },
                    ].map((item) => (
                        <span key={item.text} className="inline-flex items-center gap-1.5">
                            <item.icon className="w-3 h-3" />
                            {item.text}
                        </span>
                    ))}
                </div>
            </motion.div>
        </section>
    );
}

// ════════════════════════════════════════════════════════════════
// MAIN PAGE
// ════════════════════════════════════════════════════════════════

interface HIWSection {
    id: string;
    label: string;
}

const HIW_SECTIONS: HIWSection[] = [
    { id: 'hero', label: 'How it works' },
    { id: 'old-vs-new', label: 'Old vs new' },
    { id: 'mechanism', label: 'Mechanism' },
    { id: 'handover', label: 'Handover' },
    { id: 'trust', label: 'Trust levels' },
    { id: 'tier-autonomy', label: 'Tier autonomy' },
    { id: 'fees', label: 'Fees' },
    { id: 'events', label: 'Event tickets' },
    { id: 'faq', label: 'FAQ' },
];


function PageNav({ tk, theme }: { tk: DTK; theme: 'light' | 'dark' }) {
    const isLight = theme === 'light';
    const { scrollYProgress } = useScroll();
    const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 30 });
    const [activeIdx, setActiveIdx] = useState(0);
    const [pillVisible, setPillVisible] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    

    useEffect(() => {
        const observers: IntersectionObserver[] = [];
        HIW_SECTIONS.forEach((s, i) => {
            const el = document.getElementById(s.id);
            if (!el) return;
            const obs = new IntersectionObserver(
                ([entry]) => { if (entry.isIntersecting) setActiveIdx(i); },
                { threshold: 0.3 }
            );
            obs.observe(el);
            observers.push(obs);
        });

        const onScroll = () => setPillVisible(window.scrollY > 200);
        window.addEventListener('scroll', onScroll, { passive: true });

        return () => {
            observers.forEach(o => o.disconnect());
            window.removeEventListener('scroll', onScroll);
        };
    }, []);

    const scrollTo = (id: string) => {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return (
        <>
            {/* ── Progress bar ───────────────────────────────────── */}
            <div
                className="fixed top-0 left-0 right-0 z-[60]"
                style={{ height: 2, background: 'rgba(255,104,3,0.12)' }}
            >
                <motion.div
                    className="h-full origin-left relative"
                    style={{ scaleX, background: 'linear-gradient(90deg, #FF6803, #FFAC5F)' }}
                >
                    <motion.div
                        className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full"
                        style={{ background: '#FF6803', boxShadow: '0 0 8px #FF680380', translateX: '50%' }}
                    />
                </motion.div>
            </div>

            {/* ── Desktop side nav — xl and above ────────────────── */}
            <nav
                className="fixed right-6 top-1/2 -translate-y-1/2 z-50 hidden xl:flex flex-col gap-2"
                aria-label="Page sections"
            >
                {HIW_SECTIONS.map((s, i) => {
                    const done = i < activeIdx;
                    const active = i === activeIdx;
                    return (
                        <button
                            key={s.id}
                            onClick={() => scrollTo(s.id)}
                            className="flex items-center gap-2 flex-row-reverse group"
                            aria-label={`Jump to ${s.label}`}
                        >
                            <div
                                className="rounded-full transition-all duration-300 shrink-0"
                                style={{
                                    width: active ? 8 : 6,
                                    height: active ? 8 : 6,
                                    background: active
                                        ? '#FF6803'
                                        : done
                                            ? 'rgba(255,104,3,0.45)'
                                            : tk.cardBorder,
                                    boxShadow: active ? '0 0 10px rgba(255,104,3,0.5)' : 'none',
                                    transition: 'all 0.25s',
                                }}
                            />
                            <span
                                className="text-[10px] font-bold uppercase tracking-[0.12em] transition-all duration-200 whitespace-nowrap"
                                style={{
                                    color: active ? '#FF6803' : tk.textTer,
                                    opacity: active ? 1 : 0,
                                    transform: active ? 'translateX(0)' : 'translateX(6px)',
                                }}
                            >
                                {s.label}
                            </span>
                            {!active && (
                                <span
                                    className="text-[10px] font-bold uppercase tracking-[0.12em] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-200"
                                    style={{ color: tk.textSec, position: 'absolute', right: 20 }}
                                >
                                    {s.label}
                                </span>
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* ── Mobile bottom nav — hidden on xl+ ──────────────── */}
            <div className="xl:hidden fixed bottom-4 left-4 right-4 z-50">
                <AnimatePresence mode="wait">
                    {!mobileOpen ? (
                        <motion.button
                            key="pill"
                            onClick={() => setMobileOpen(true)}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: pillVisible ? 1 : 0, y: pillVisible ? 0 : 12 }}
                            exit={{ opacity: 0, y: 8 }}
                            transition={{ duration: 0.25 }}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl"
                            style={{
                                background: isLight ? '#FFFFFF' : '#1A0E09',
                                border: `1px solid ${tk.cardBorder}`,
                                boxShadow: '0 -4px 32px rgba(0,0,0,0.25)',
                            }}
                        >
                            <motion.div
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ background: '#FF6803' }}
                                animate={{ opacity: [1, 0.4, 1] }}
                                transition={{ duration: 2, repeat: Infinity }}
                            />
                            <span
                                className="flex-1 text-left text-[11px] font-bold uppercase tracking-[0.1em]"
                                style={{ color: tk.text }}
                            >
                                {HIW_SECTIONS[activeIdx]?.label}
                            </span>
                            <span
                                className="text-[10px] font-semibold tabular-nums"
                                style={{ color: tk.textTer }}
                            >
                                {activeIdx + 1}/{HIW_SECTIONS.length}
                            </span>
                            <span className="text-[11px]" style={{ color: tk.textTer }}>↑</span>
                        </motion.button>
                    ) : (
                        <motion.div
                            key="grid"
                            initial={{ opacity: 0, y: 20, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 12, scale: 0.98 }}
                            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                            className="rounded-2xl overflow-hidden"
                            style={{
                                background: isLight ? '#FFFFFF' : '#1A0E09',
                                border: `1px solid ${tk.cardBorder}`,
                                boxShadow: '0 -8px 48px rgba(0,0,0,0.35)',
                            }}
                        >
                            {/* Handle + header */}
                            <div className="relative flex items-center justify-between px-4 pt-4 pb-2">
                                <div
                                    className="w-8 h-0.5 rounded-full absolute left-1/2 -translate-x-1/2 top-2"
                                    style={{ background: tk.cardBorder }}
                                />
                                <span
                                    className="text-[10px] font-bold uppercase tracking-[0.14em]"
                                    style={{ color: tk.textTer }}
                                >
                                    Jump to section
                                </span>
                                <button
                                    onClick={() => setMobileOpen(false)}
                                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs"
                                    style={{ background: tk.card, color: tk.textTer, border: `1px solid ${tk.cardBorder}` }}
                                >
                                    ✕
                                </button>
                            </div>

                            {/* Section grid */}
                            <div className="grid grid-cols-2 gap-2 p-3">
                                {HIW_SECTIONS.map((s, i) => {
                                    const isActive = i === activeIdx;
                                    const isDone = i < activeIdx;
                                    return (
                                        <button
                                            key={s.id}
                                            onClick={() => {
                                                setMobileOpen(false);
                                                setTimeout(() => scrollTo(s.id), 200);
                                            }}
                                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all"
                                            style={{
                                                background: isActive
                                                    ? 'rgba(255,104,3,0.10)'
                                                    : isLight ? 'rgba(15,7,3,0.04)' : 'rgba(255,255,255,0.05)',
                                                border: `0.5px solid ${isActive ? 'rgba(255,104,3,0.35)' : tk.cardBorder}`,
                                            }}
                                        >
                                            <span
                                                className="text-[10px] font-bold tabular-nums shrink-0"
                                                style={{
                                                    color: isActive
                                                        ? '#FF6803'
                                                        : isDone
                                                            ? 'rgba(255,104,3,0.45)'
                                                            : tk.textTer,
                                                    fontFamily: MONO,
                                                }}
                                            >
                                                {String(i + 1).padStart(2, '0')}
                                            </span>
                                            <span
                                                className="text-[11px] font-semibold leading-tight"
                                                style={{ color: isActive ? '#FF6803' : tk.text }}
                                            >
                                                {s.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
}

export default function HowItWorksPage() {
    const navigate = useNavigate();
    const { theme } = useTheme();
    const tk = getDashboardTokens(theme);

    return (
        <div
            className="min-h-screen relative overflow-x-hidden"
            style={{ background: tk.bg }}
        >
            <PageNav tk={tk} theme={theme} />

            {/* Ambient glow */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
                <div
                    className="absolute rounded-full blur-[160px]"
                    style={{
                        width: 560,
                        height: 560,
                        background: `radial-gradient(circle, ${tk.primary} 0%, transparent 70%)`,
                        top: '-8%',
                        right: '-10%',
                        opacity: 0.09,
                    }}
                />
                <div
                    className="absolute rounded-full blur-[140px]"
                    style={{
                        width: 420,
                        height: 420,
                        background: `radial-gradient(circle, ${tk.mint} 0%, transparent 70%)`,
                        bottom: '10%',
                        left: '-10%',
                        opacity: 0.06,
                    }}
                />
            </div>

            {/* Top bar */}
            <nav className="relative z-10 max-w-6xl mx-auto px-5 sm:px-6 py-5 flex items-center justify-between">
                <button
                    onClick={() => navigate('/')}
                    className="flex items-center gap-2 text-sm font-medium transition-colors"
                    style={{ color: tk.textSec }}
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                </button>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0">
                        <img
                            src="/pavexoLogo.jpeg"
                            alt="Payvexo"
                            className="w-full h-full object-cover"
                            style={{ transform: 'scale(1.25)' }}
                        />
                    </div>
                    <span className="text-base font-bold">
                        <span style={{ color: tk.primary }}>Pay</span>
                        <span style={{ color: tk.textSec }}>vexo</span>
                    </span>
                </div>
                <button
                    onClick={() => navigate('/bring-school')}
                    className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold"
                    style={{ background: tk.primary, color: '#fff' }}
                >
                    Get started
                </button>
            </nav>

            {/* Sections */}
            <ReceiptHero tk={tk} navigate={navigate} />
            <LedgerStrip tk={tk} />

            <div className="relative z-10">
                <OldVsNewSection tk={tk} />
                <MechanismSection tk={tk} />
                <HandoverSection tk={tk} />
                <TrustLadderSection tk={tk} />
                <TierAutonomySection tk={tk} />
                <FeeSection tk={tk} />
                <EventTicketsSection tk={tk} />
                <MultiOrgSection tk={tk} />
                <AudienceSection tk={tk} />
                <OrgTypesSection tk={tk} />
                <FAQSection tk={tk} />
                <CTASection tk={tk} navigate={navigate} />
            </div>

            <Footer />
        </div>
    );
}