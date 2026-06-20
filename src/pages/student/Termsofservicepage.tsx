/**
 * TermsOfServicePage — Payvexo's terms of service.
 *
 * Route: /terms
 *
 * Mirrors PrivacyPolicyPage's structure exactly (same TOC pattern,
 * same Section/Mono helpers, same token usage) so the two legal
 * pages read as one consistent document family rather than two
 * independently-styled pages.
 *
 * Content covers: account responsibilities, the claim/verification
 * system (and its explicit no-guarantee-of-identity disclaimer),
 * fees, payouts, the tier-autonomy model, prohibited conduct,
 * liability limits, and dispute resolution — written for the actual
 * mechanics of how Payvexo's role-claiming and money-handling works,
 * not generic SaaS boilerplate.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, FileText, Mail } from 'lucide-react';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';
import Footer from '@/components/Footer';

const MONO = '"JetBrains Mono", "Fira Code", ui-monospace, monospace';
const LAST_UPDATED = 'June 20, 2026';

type DTK = ReturnType<typeof getDashboardTokens>;

const SECTIONS = [
  { id: 'acceptance', label: 'Acceptance of terms' },
  { id: 'accounts', label: 'Your account' },
  { id: 'roles-claims', label: 'Roles & claims' },
  { id: 'payments-fees', label: 'Payments & fees' },
  { id: 'payouts', label: 'Payouts' },
  { id: 'tier-autonomy', label: 'Tier autonomy' },
  { id: 'handovers', label: 'Role handovers' },
  { id: 'prohibited', label: 'Prohibited conduct' },
  { id: 'content', label: 'Your content' },
  { id: 'disclaimers', label: 'Disclaimers' },
  { id: 'liability', label: 'Limitation of liability' },
  { id: 'termination', label: 'Suspension & termination' },
  { id: 'disputes', label: 'Disputes' },
  { id: 'changes', label: 'Changes to these terms' },
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

export default function TermsOfServicePage() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const tk = getDashboardTokens(theme);
  const [activeId, setActiveId] = useState('acceptance');

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
            <FileText className="w-3 h-3" />
            Terms of service
          </span>
          <h1 className="mt-4 text-2xl sm:text-3xl font-extrabold tracking-tight" style={{ color: tk.text }}>
            The rules of using Payvexo
          </h1>
          <p className="mt-2 text-sm" style={{ color: tk.textTer, fontFamily: MONO }}>
            Last updated: {LAST_UPDATED}
          </p>
          <p className="mt-4 text-sm leading-6 max-w-2xl" style={{ color: tk.textSec }}>
            These terms govern your use of Payvexo — whether you're a member paying dues,
            an exec collecting them, or a founder bringing your organization online. By
            creating an account or using any part of the platform, you agree to them.
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
          <Section id="acceptance" title="Acceptance of terms" tk={tk}>
            <p>
              By creating an account, joining an organization, or making a payment through
              Payvexo, you agree to be bound by these terms. If you're setting up an
              organization on behalf of a class, department, church, or club, you confirm
              you have the authority to represent that group, or are doing so as a genuine
              member with the intent to claim a real role within it.
            </p>
          </Section>

          <Section id="accounts" title="Your account" tk={tk}>
            <p>
              You're responsible for keeping your password confidential and for all activity
              under your account. Use the member, matric, or staff ID that genuinely
              identifies you within your organization — impersonating another member or
              using a fabricated ID to gain access is a violation of these terms and may
              result in suspension.
            </p>
            <p>
              You may hold accounts and roles in multiple organizations simultaneously. Each
              organization's data about you is kept separate, as described in our Privacy Policy.
            </p>
          </Section>

          <Section id="roles-claims" title="Roles & claims" tk={tk}>
            <p>
              Founding an organization on Payvexo does not make you its owner. It makes you a
              setup steward with no money access until a real exec role is claimed and verified.
            </p>
            <p>
              When you claim a role (class rep, treasurer, president, etc.), that claim moves
              through a verification process — email confirmation, peer votes from real
              members, and in most cases a parent exec's sign-off — before money-related
              capabilities unlock. <strong style={{ color: tk.text }}>Payvexo does not independently
              verify your real-world identity or legal authority to hold the role you claim</strong> beyond
              the mechanisms described in our verification system. The platform provides the
              infrastructure for a community to confirm its own leadership; it is not a
              background-check service.
            </p>
            <p>
              Submitting a false claim, or voting to confirm a claim you know to be false, is
              prohibited and may result in account suspension and removal of any granted access.
            </p>
          </Section>

          <Section id="payments-fees" title="Payments & fees" tk={tk}>
            <p>
              Payments are processed by Paystack. Payvexo does not store your full card
              details. A processing fee — currently <Mono tk={tk}>1.5%</Mono> of the due
              amount plus a flat <Mono tk={tk}>₦100</Mono> fee on payments above ₦2,500,
              capped at <Mono tk={tk}>₦2,000</Mono> — is shown to the payer before they
              confirm. This fee structure may change; any change will be reflected in your
              dashboard and applied only to dues published after the change takes effect.
            </p>
            <p>
              Payvexo does not charge a subscription fee for standard use. Organizations may
              optionally upgrade to a paid plan for additional features; those terms are
              presented separately at the point of upgrade.
            </p>
          </Section>

          <Section id="payouts" title="Payouts" tk={tk}>
            <p>
              To collect money, an organization's exec must connect a Nigerian bank account
              through a KYC-verified Paystack sub-account. Settlement to that bank account
              occurs on the next working day after a payment is confirmed. Payvexo does not
              hold organizational funds — money moves directly through Paystack's
              infrastructure to the connected account.
            </p>
            <p>
              You are responsible for the accuracy of the bank account details you connect.
              Payvexo is not liable for funds sent to an incorrectly configured payout account.
            </p>
          </Section>

          <Section id="tier-autonomy" title="Tier autonomy" tk={tk}>
            <p>
              Each tier within an organization — class, department, faculty, or org-wide —
              owns and controls its own collected funds and expense records independently.
              A higher-tier exec (e.g. a department president) cannot access, move, or
              approve expenses against a lower tier's balance (e.g. a class's funds), even
              though dues they publish may cascade down to bill members in that lower tier.
              This separation is enforced at the database level, not merely as an interface
              convention.
            </p>
          </Section>

          <Section id="handovers" title="Role handovers" tk={tk}>
            <p>
              When an exec's tenure ends, they may initiate a handover to transfer their
              role to a successor through the platform's handover flow. The successor must
              independently claim and be verified for the role; a handover initiated by the
              outgoing exec streamlines this but does not bypass verification.
            </p>
            <p>
              Upon a successful handover, the organization's balance, payment history, and
              trust level carry forward unchanged. Payvexo is not responsible for disputes
              between outgoing and incoming execs over the timing or legitimacy of a
              handover — these are resolved by the organization's own members through the
              peer-verification system.
            </p>
          </Section>

          <Section id="prohibited" title="Prohibited conduct" tk={tk}>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Submit a false role claim or vote to confirm a claim you know to be false.</li>
              <li>Use Payvexo to collect money for a fictitious or fraudulent organization.</li>
              <li>Attempt to access another organization's data, including through technical exploitation of the platform.</li>
              <li>Use the platform to launder money or process payments unrelated to legitimate organizational dues, fees, or contributions.</li>
              <li>Harass, threaten, or impersonate other members or execs.</li>
              <li>Reverse-engineer, scrape, or attempt to extract data from the platform outside the features provided.</li>
            </ul>
            <p>
              Violation of any of the above may result in immediate suspension of your
              account and, where applicable, reporting to relevant authorities.
            </p>
          </Section>

          <Section id="content" title="Your content" tk={tk}>
            <p>
              You retain ownership of the organizational content you upload — names,
              descriptions, event details, receipts. By uploading it, you grant Payvexo a
              license to store, display, and process it as needed to operate the platform
              for your organization and its members. We do not use your organization's
              content for advertising or sell it to third parties.
            </p>
          </Section>

          <Section id="disclaimers" title="Disclaimers" tk={tk}>
            <p>
              Payvexo is provided "as is." We do not guarantee that the platform will be
              uninterrupted, error-free, or that every role claim or peer vote reflects
              real-world fact — the verification system reduces the likelihood of fraud
              but cannot eliminate it entirely. You are responsible for exercising
              reasonable judgment, particularly when voting to confirm a peer's claimed role.
            </p>
          </Section>

          <Section id="liability" title="Limitation of liability" tk={tk}>
            <p>
              To the maximum extent permitted by Nigerian law, Payvexo and Wishot
              Technologies are not liable for indirect, incidental, or consequential
              damages arising from your use of the platform, including disputes between
              members and execs over collected funds, role legitimacy, or handover
              timing. Our total liability for any claim is limited to the platform fees
              actually paid by the organization in question in the preceding 12 months.
            </p>
          </Section>

          <Section id="termination" title="Suspension & termination" tk={tk}>
            <p>
              We may suspend or terminate an account or an entire organization's access if
              we reasonably believe these terms have been violated, or if required by law.
              You may close your account at any time; closure does not erase an
              organization's historical financial records, which remain visible to that
              organization's remaining members for continuity of the ledger.
            </p>
          </Section>

          <Section id="disputes" title="Disputes" tk={tk}>
            <p>
              These terms are governed by the laws of the Federal Republic of Nigeria. Any
              dispute arising from your use of Payvexo will first be addressed through good-faith
              negotiation; if unresolved, disputes are subject to the exclusive jurisdiction
              of the courts of Nigeria.
            </p>
          </Section>

          <Section id="changes" title="Changes to these terms" tk={tk}>
            <p>
              We may update these terms as the platform evolves. Material changes will be
              announced via email or an in-app notice before they take effect. Continued
              use of Payvexo after a change takes effect constitutes acceptance of the
              revised terms.
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
                <p className="text-sm font-bold" style={{ color: tk.text }}>Questions about these terms?</p>
                <p className="text-[13px] mt-1" style={{ color: tk.textSec }}>
                  Email us at{' '}
                  <a href="mailto:payvexo.noreply@gmail.com" style={{ color: tk.primary, fontWeight: 600 }}>
                    payvexo.noreply@gmail.com
                  </a>{' '}
                  and we'll respond within a reasonable timeframe.
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