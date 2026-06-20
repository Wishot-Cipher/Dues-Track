/**
 * PrivacyPolicyPage — Payvexo's privacy policy.
 *
 * Route: /privacy
 *
 * Design intent: legal pages need to be scannable and trustworthy,
 * not decorative. No receipt/ledger motifs here — those belong to
 * the marketing surface (How It Works). This page borrows the same
 * token system for visual consistency but reads like a real document:
 * sticky table of contents, generous line-height, mono type reserved
 * for retention periods / emails / dates only.
 *
 * Content is a genuine NDPA-aware (Nigeria Data Protection Act 2023)
 * draft — data controller identity, lawful basis, retention, user
 * rights, named third-party processors (Paystack, Supabase), breach
 * notification, children's data. Intended as a real, deployable
 * starting point pending lawyer review, not placeholder text.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, Shield } from 'lucide-react';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';
import Footer from '@/components/Footer';

const MONO = '"JetBrains Mono", "Fira Code", ui-monospace, monospace';
const LAST_UPDATED = 'June 20, 2026';

type DTK = ReturnType<typeof getDashboardTokens>;

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'who-we-are', label: 'Who we are' },
  { id: 'what-we-collect', label: 'What we collect' },
  { id: 'why-we-collect', label: 'Why we collect it' },
  { id: 'third-parties', label: 'Who we share it with' },
  { id: 'retention', label: 'How long we keep it' },
  { id: 'security', label: 'How we protect it' },
  { id: 'your-rights', label: 'Your rights' },
  { id: 'org-isolation', label: 'Organization isolation' },
  { id: 'children', label: "Children's data" },
  { id: 'cookies', label: 'Cookies & tracking' },
  { id: 'changes', label: 'Changes to this policy' },
  { id: 'contact', label: 'Contact us' },
];

function Section({
  id, title, tk, children,
}: { id: string; title: string; tk: DTK; children: React.ReactNode }) {
  return (
    <section id={id} className="py-7 sm:py-8 scroll-mt-24" style={{ borderBottom: `1px solid ${tk.cardBorder}` }}>
      <h2 className="text-lg sm:text-xl font-extrabold tracking-tight mb-3" style={{ color: tk.text }}>
        {title}
      </h2>
      <div className="space-y-3 text-[14px] leading-7" style={{ color: tk.textSec }}>
        {children}
      </div>
    </section>
  );
}

function Mono({ tk, children }: { tk: DTK; children: React.ReactNode }) {
  return (
    <span
      className="text-[13px] font-semibold px-1.5 py-0.5 rounded"
      style={{ fontFamily: MONO, background: tk.bgWash, color: tk.primary }}
    >
      {children}
    </span>
  );
}

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const tk = getDashboardTokens(theme);
  const [activeId, setActiveId] = useState('overview');

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveId(s.id); },
        { threshold: 0.25, rootMargin: '-80px 0px -60% 0px' },
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="min-h-screen" style={{ background: tk.bg }}>
      {/* Top bar */}
      <nav className="max-w-5xl mx-auto px-5 sm:px-6 py-5 flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm font-medium"
          style={{ color: tk.textSec }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0">
            <img src="/pavexoLogo.jpeg" alt="Payvexo" className="w-full h-full object-cover" style={{ transform: 'scale(1.25)' }} />
          </div>
          <span className="text-sm font-bold">
            <span style={{ color: tk.primary }}>Pay</span>
            <span style={{ color: tk.textSec }}>vexo</span>
          </span>
        </div>
      </nav>

      {/* Header */}
      <header className="max-w-5xl mx-auto px-5 sm:px-6 pt-4 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ background: tk.primarySoft, color: tk.primary, border: `1px solid ${tk.primaryRing}` }}
          >
            <Shield className="w-3 h-3" />
            Privacy policy
          </span>
          <h1 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: tk.text }}>
            How Payvexo handles your data
          </h1>
          <p className="mt-2 text-sm" style={{ color: tk.textTer, fontFamily: MONO }}>
            Last updated: {LAST_UPDATED}
          </p>
          <p className="mt-4 text-sm leading-6 max-w-2xl" style={{ color: tk.textSec }}>
            This policy explains what personal data Payvexo collects, why we collect it,
            who we share it with, and the rights you have over it. It applies to everyone
            who uses Payvexo — members, class reps, treasurers, and founders — across every
            organization on the platform.
          </p>
        </motion.div>
      </header>

      {/* Body: sticky TOC + content */}
      <div className="max-w-5xl mx-auto px-5 sm:px-6 pb-20 grid lg:grid-cols-[200px_1fr] gap-10">
        {/* TOC — desktop sticky sidebar */}
        <aside className="hidden lg:block">
          <nav className="sticky top-8 space-y-0.5">
            {SECTIONS.map((s) => {
              const active = activeId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className="block w-full text-left px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all"
                  style={{
                    color: active ? tk.primary : tk.textTer,
                    background: active ? tk.primarySoft : 'transparent',
                  }}
                >
                  {s.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Mobile TOC — horizontal scroll chips */}
        <div className="lg:hidden -mx-5 px-5 mb-2 overflow-x-auto">
          <div className="flex gap-2 pb-2 w-max">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap"
                style={{
                  background: activeId === s.id ? tk.primarySoft : tk.card,
                  color: activeId === s.id ? tk.primary : tk.textTer,
                  border: `1px solid ${activeId === s.id ? tk.primaryRing : tk.cardBorder}`,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div>
          <Section id="overview" title="Overview" tk={tk}>
            <p>
              Payvexo is a dues and payment management platform for Nigerian universities,
              churches, clubs, and associations. We process personal data to make that
              possible — member rosters, payment records, contact details, and the
              verification information that confirms someone really holds the role
              they claim.
            </p>
            <p>
              We are guided by the Nigeria Data Protection Act 2023 (NDPA) and the
              data-protection principles it sets out: lawfulness, purpose limitation,
              data minimization, accuracy, storage limitation, integrity, and accountability.
            </p>
          </Section>

          <Section id="who-we-are" title="Who we are" tk={tk}>
            <p>
              Payvexo (operated by Wishot Technologies) is the data controller for
              account-level information — your login credentials, your identity across
              organizations, and platform-wide records.
            </p>
            <p>
              Each organization on Payvexo (your class, department, church, or club) acts
              as an independent data controller for the member data and financial records
              within that specific organization. This split exists because every org's
              data is isolated — see <Mono tk={tk}>Organization isolation</Mono> below.
            </p>
          </Section>

          <Section id="what-we-collect" title="What we collect" tk={tk}>
            <p><strong style={{ color: tk.text }}>Account information:</strong> full name, email address, phone number, password (stored as a salted hash, never in plain text), and a member/matric/staff ID you provide.</p>
            <p><strong style={{ color: tk.text }}>Organization data:</strong> the groups you belong to, your role and verification status, and your level/cohort where relevant (e.g. "300L").</p>
            <p><strong style={{ color: tk.text }}>Payment data:</strong> amounts paid, payment dates, transaction references, and payment method. We do not store your full card number, CVV, or bank PIN — that is handled entirely by Paystack, our payment processor.</p>
            <p><strong style={{ color: tk.text }}>Verification data:</strong> when you claim an exec role, we record the institutional email you used to confirm it, peer votes cast in your favor, and the confirming exec's identity.</p>
            <p><strong style={{ color: tk.text }}>Usage data:</strong> device type, browser, IP address, and basic interaction logs, collected for security and to diagnose problems.</p>
          </Section>

          <Section id="why-we-collect" title="Why we collect it" tk={tk}>
            <p>We process personal data under the following lawful bases:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong style={{ color: tk.text }}>Contractual necessity</strong> — to create your account, record your payments, and issue receipts.</li>
              <li><strong style={{ color: tk.text }}>Legitimate interest</strong> — to verify exec roles, prevent duplicate or fraudulent claims, and keep the platform secure.</li>
              <li><strong style={{ color: tk.text }}>Consent</strong> — for optional features like push notifications and marketing emails, which you can withdraw at any time.</li>
              <li><strong style={{ color: tk.text }}>Legal obligation</strong> — where Nigerian law requires us to retain financial records for a minimum period.</li>
            </ul>
          </Section>

          <Section id="third-parties" title="Who we share it with" tk={tk}>
            <p>We do not sell your personal data. We share it only with the processors needed to run the platform:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong style={{ color: tk.text }}>Paystack</strong> — processes all card, bank transfer, and USSD payments. Paystack is PCI-DSS compliant and never shares your full card details with us.</li>
              <li><strong style={{ color: tk.text }}>Supabase</strong> — hosts our database and authentication infrastructure, with row-level security enforcing the org-isolation described below.</li>
              <li><strong style={{ color: tk.text }}>Email/SMS providers</strong> — used only to deliver transactional messages (receipts, verification codes, notifications), not marketing without consent.</li>
            </ul>
            <p>
              Within your own organization, your name, payment status, and role are visible
              to other members and execs with permission to see them — that visibility is
              the whole point of a transparent ledger, and is described in detail in our
              Terms of Service.
            </p>
          </Section>

          <Section id="retention" title="How long we keep it" tk={tk}>
            <p>
              We retain account and payment records for as long as your account or
              organization remains active on Payvexo, plus <Mono tk={tk}>6 years</Mono> after
              closure — a standard window for financial record-keeping under Nigerian
              practice. Verification and voting records are retained for the life of the
              org's claim history, since they form part of the permanent audit trail
              the platform exists to provide.
            </p>
            <p>
              You can request deletion of your personal account data at any time (see
              <Mono tk={tk}>Your rights</Mono> below); financial transaction records tied
              to an organization's ledger may be retained in anonymized form to preserve
              the integrity of that organization's books for other members.
            </p>
          </Section>

          <Section id="security" title="How we protect it" tk={tk}>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Passwords are hashed, never stored in plain text.</li>
              <li>All traffic is encrypted in transit (HTTPS/TLS).</li>
              <li>Database access is governed by row-level security policies that enforce organization isolation at the database layer, not just in application code.</li>
              <li>Payment card data never touches our servers — Paystack handles it directly under PCI-DSS.</li>
              <li>Admin actions (approvals, role grants, payouts) are logged with the acting admin's identity and timestamp.</li>
            </ul>
            <p>
              No system is perfectly secure. If we discover a breach affecting your personal
              data, we will notify affected users and, where required, the National Data
              Protection Commission, within the timeframes the NDPA requires.
            </p>
          </Section>

          <Section id="your-rights" title="Your rights" tk={tk}>
            <p>Under the NDPA, you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><strong style={{ color: tk.text }}>Access</strong> the personal data we hold about you.</li>
              <li><strong style={{ color: tk.text }}>Correct</strong> inaccurate or outdated information.</li>
              <li><strong style={{ color: tk.text }}>Delete</strong> your account and associated personal data, subject to the retention exceptions above.</li>
              <li><strong style={{ color: tk.text }}>Object</strong> to processing based on legitimate interest.</li>
              <li><strong style={{ color: tk.text }}>Withdraw consent</strong> for optional processing (e.g. push notifications) at any time.</li>
              <li><strong style={{ color: tk.text }}>Port your data</strong> — request an export of your payment history in a portable format.</li>
            </ul>
            <p>
              To exercise any of these rights, email{' '}
              <a href="mailto:payvexo.noreply@gmail.com" style={{ color: tk.primary }}>payvexo.noreply@gmail.com</a>.
              We respond within 30 days.
            </p>
          </Section>

          <Section id="org-isolation" title="Organization isolation" tk={tk}>
            <p>
              Every organization's member list, payment records, and expense ledger are
              isolated from every other organization at the database level using row-level
              security — not just hidden in the interface. There is no technical path for
              one organization's data to be queried alongside another's, even by Payvexo's
              own systems, outside of aggregate, anonymized platform analytics.
            </p>
            <p>
              If you belong to multiple organizations (e.g. your class and your church),
              each maintains a completely separate view of your activity. A treasurer in
              your church cannot see that you are a class rep elsewhere, and vice versa.
            </p>
          </Section>

          <Section id="children" title="Children's data" tk={tk}>
            <p>
              Payvexo is built primarily for university-level students, who are typically
              adults under Nigerian law. We do not knowingly collect personal data from
              children under 13. If you believe a child has created an account or been
              added as a member without appropriate parental or guardian involvement,
              contact us and we will investigate and remove the data as appropriate.
            </p>
          </Section>

          <Section id="cookies" title="Cookies & tracking" tk={tk}>
            <p>
              We use essential cookies and local storage to keep you signed in and remember
              your theme and display preferences. We do not use third-party advertising
              cookies, and Payvexo does not display ads or sell data to advertisers.
            </p>
          </Section>

          <Section id="changes" title="Changes to this policy" tk={tk}>
            <p>
              We may update this policy as the platform evolves. Material changes will be
              announced via email or an in-app notice before they take effect. The "Last
              updated" date at the top of this page always reflects the current version.
            </p>
          </Section>

          <Section id="contact" title="Contact us" tk={tk}>
            <div
              className="rounded-2xl p-5 flex items-start gap-3 not-italic"
              style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
            >
              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: tk.primarySoft, color: tk.primary }}>
                <Mail className="w-4 h-4" />
              </span>
              <div>
                <p className="text-sm font-bold" style={{ color: tk.text }}>Questions about your data?</p>
                <p className="text-[13px] mt-1" style={{ color: tk.textSec }}>
                  Email us at{' '}
                  <a href="mailto:payvexo.noreply@gmail.com" style={{ color: tk.primary, fontWeight: 600 }}>
                    payvexo.noreply@gmail.com
                  </a>{' '}
                  and we'll respond within 30 days.
                </p>
              </div>
            </div>
          </Section>
        </div>
      </div>

      <Footer />
    </div>
  );
}