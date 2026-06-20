/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared email utility for Payvexo
 * 
 * Provides:
 * - Gmail SMTP transporter (reusable)
 * - Professional HTML email wrapper with consistent branding
 * - Pre-built email templates for all features
 */
import nodemailer from 'nodemailer'

// ── Config ───────────────────────────────────────────────────
const GMAIL_USER = process.env.GMAIL_USER
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD
const FROM_EMAIL = process.env.FROM_EMAIL || GMAIL_USER

// ── Transporter (singleton) ──────────────────────────────────
let _transporter: nodemailer.Transporter | null = null

function getTransporter(): nodemailer.Transporter | null {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    })
  }
  return _transporter
}

// ── Send helper ──────────────────────────────────────────────
export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  const transporter = getTransporter()
  if (!transporter) return false

  try {
    await transporter.sendMail({
      from: FROM_EMAIL ? `Payvexo <${FROM_EMAIL}>` : `Payvexo <${GMAIL_USER}>`,
      to,
      subject,
      html,
    })
    return true
  } catch (err) {
    console.error('📧 Email send failed:', (err as any)?.message || err)
    return false
  }
}

export function isEmailConfigured(): boolean {
  return !!(GMAIL_USER && GMAIL_APP_PASSWORD)
}

// ── Brand colors ─────────────────────────────────────────────
const brand = {
  primary: '#FF6B35',
  primaryLight: '#FF8534',
  accent: '#F59E0B',
  success: '#10B981',
  danger: '#EF4444',
  warning: '#F59E0B',
  dark: '#0F0703',
  cardBg: '#1A1410',
  cardBorder: 'rgba(255, 107, 53, 0.15)',
  mutedText: 'rgba(255, 255, 255, 0.5)',
  bodyText: 'rgba(255, 255, 255, 0.85)',
  white: '#FFFFFF',
}

// ── Master layout wrapper ────────────────────────────────────
/**
 * Wraps any email body content in a professional, consistent layout.
 * Provides: preheader, header logo area, gradient accent bar, footer.
 */
export function emailLayout(options: {
  preheader?: string
  orgName?: string
  bodyContent: string
  footerExtra?: string
  year?: number
}): string {
  const { preheader = '', orgName = 'Payvexo', bodyContent, footerExtra = '', year = new Date().getFullYear() } = options

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${orgName}</title>
  <!--[if mso]>
  <noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <style>
    * { box-sizing: border-box; }
    body, table, td { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    img { border: 0; display: block; outline: none; text-decoration: none; }
    a { color: ${brand.primary}; text-decoration: none; }
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; }
      .fluid { max-width: 100% !important; height: auto !important; }
      .stack-column { display: block !important; width: 100% !important; }
      .mobile-pad { padding-left: 20px !important; padding-right: 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: ${brand.dark}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
  <!-- Preheader (hidden preview text) -->
  <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
    ${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <!-- Email wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: ${brand.dark};">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <!-- Email container -->
        <table role="presentation" class="email-container" width="600" cellpadding="0" cellspacing="0" style="background-color: ${brand.cardBg}; border: 1px solid ${brand.cardBorder}; border-radius: 16px; overflow: hidden;">

          <!-- Gradient accent bar -->
          <tr>
            <td style="height: 4px; background: linear-gradient(90deg, ${brand.primary}, ${brand.accent});"></td>
          </tr>

          <!-- Logo / Brand header -->
          <tr>
            <td style="padding: 28px 36px 0 36px;" class="mobile-pad">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <span style="font-size: 22px; font-weight: 800; color: ${brand.primary}; letter-spacing: -0.5px;">Pay</span><span style="font-size: 22px; font-weight: 800; color: ${brand.accent}; letter-spacing: -0.5px;">vexo</span>
                  </td>
                  <td align="right" style="color: ${brand.mutedText}; font-size: 12px; vertical-align: middle;">
                    ${orgName !== 'Payvexo' ? orgName : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding: 16px 36px 0 36px;" class="mobile-pad">
              <div style="height: 1px; background: ${brand.cardBorder};"></div>
            </td>
          </tr>

          <!-- Body content -->
          <tr>
            <td style="padding: 28px 36px 36px 36px;" class="mobile-pad">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 0 36px 28px 36px;" class="mobile-pad">
              <div style="height: 1px; background: ${brand.cardBorder}; margin-bottom: 20px;"></div>
              ${footerExtra ? `<p style="color: ${brand.mutedText}; font-size: 12px; line-height: 1.6; margin: 0 0 12px;">${footerExtra}</p>` : ''}
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color: ${brand.mutedText}; font-size: 11px; line-height: 1.5;">
                    &copy; ${year} Payvexo &mdash; Modern Payment Management
                  </td>
                  <td align="right" style="color: ${brand.mutedText}; font-size: 11px;">
                    Powered by <span style="color: ${brand.primary};">Payvexo</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Email container -->

      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Reusable components ──────────────────────────────────────

/** Big CTA button */
function ctaButton(text: string, url: string, color = brand.primary): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 28px 0;">
      <tr>
        <td align="center">
          <!--[if mso]>
          <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${url}" style="height:48px;v-text-anchor:middle;width:220px;" arcsize="17%" strokecolor="${color}" fillcolor="${color}">
          <center style="color:#ffffff;font-family:sans-serif;font-size:16px;font-weight:bold;">${text}</center>
          </v:roundrect>
          <![endif]-->
          <!--[if !mso]><!-->
          <a href="${url}" target="_blank" style="display: inline-block; padding: 14px 36px; background: ${color}; color: ${brand.white}; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 15px; letter-spacing: 0.3px; mso-padding-alt: 0; text-align: center;">
            ${text}
          </a>
          <!--<![endif]-->
        </td>
      </tr>
    </table>`
}

/** Info/data card with key-value rows */
function dataCard(rows: { label: string; value: string; highlight?: boolean }[]): string {
  const rowsHtml = rows.map(r => `
    <tr>
      <td style="padding: 10px 16px; color: ${brand.mutedText}; font-size: 13px; border-bottom: 1px solid rgba(255,255,255,0.05); width: 35%;">${r.label}</td>
      <td style="padding: 10px 16px; color: ${r.highlight ? brand.success : brand.white}; font-size: 14px; font-weight: ${r.highlight ? '700' : '500'}; border-bottom: 1px solid rgba(255,255,255,0.05);">${r.value}</td>
    </tr>`
  ).join('')

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; overflow: hidden; margin: 20px 0;">
      ${rowsHtml}
    </table>`
}

/** Alert / notice box */
function alertBox(text: string, type: 'warning' | 'info' | 'success' | 'danger' = 'warning'): string {
  const colors = {
    warning: { bg: 'rgba(245, 158, 11, 0.08)', border: brand.warning, text: '#FBBF24' },
    info: { bg: 'rgba(59, 130, 246, 0.08)', border: '#3B82F6', text: '#60A5FA' },
    success: { bg: 'rgba(16, 185, 129, 0.08)', border: brand.success, text: '#34D399' },
    danger: { bg: 'rgba(239, 68, 68, 0.08)', border: brand.danger, text: '#F87171' },
  }
  const c = colors[type]

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
      <tr>
        <td style="background: ${c.bg}; border-left: 3px solid ${c.border}; border-radius: 6px; padding: 14px 16px;">
          <p style="color: ${c.text}; font-size: 13px; margin: 0; line-height: 1.6;">${text}</p>
        </td>
      </tr>
    </table>`
}

/** Section heading */
function heading(text: string, subtitle?: string): string {
  return `
    <h1 style="color: ${brand.white}; margin: 0 0 ${subtitle ? '6px' : '20px'}; font-size: 26px; font-weight: 800; line-height: 1.3;">${text}</h1>
    ${subtitle ? `<p style="color: ${brand.mutedText}; margin: 0 0 24px; font-size: 14px;">${subtitle}</p>` : ''}`
}

/** Greeting paragraph */
function greeting(name: string): string {
  return `<p style="color: ${brand.bodyText}; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">Hi <strong style="color: ${brand.white};">${name}</strong>,</p>`
}

/** Body paragraph */
function paragraph(text: string): string {
  return `<p style="color: ${brand.bodyText}; font-size: 15px; line-height: 1.7; margin: 0 0 16px;">${text}</p>`
}

/** Fallback link text below a CTA */
function fallbackLink(url: string): string {
  return `
    <p style="color: ${brand.mutedText}; font-size: 12px; margin: 0 0 4px;">Or copy this link into your browser:</p>
    <p style="color: ${brand.primary}; font-size: 12px; word-break: break-all; margin: 0;">${url}</p>`
}

/** Code/token display */
function codeBlock(code: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0;">
      <tr>
        <td align="center" style="background: rgba(255,255,255,0.04); border: 1px dashed rgba(255,255,255,0.15); border-radius: 8px; padding: 16px;">
          <span style="font-family: 'Courier New', monospace; font-size: 22px; font-weight: 700; letter-spacing: 3px; color: ${brand.primary};">${code}</span>
        </td>
      </tr>
    </table>`
}


// ══════════════════════════════════════════════════════════════
//  EMAIL TEMPLATES
// ══════════════════════════════════════════════════════════════

/**
 * 1. PASSWORD RESET — sent when member requests a password reset
 */
export function passwordResetEmail(data: {
  memberName: string
  orgName: string
  resetUrl: string
}): string {
  const { memberName, orgName, resetUrl } = data

  return emailLayout({
    preheader: `Reset your password for ${orgName}`,
    orgName,
    bodyContent: [
      heading('Reset Your Password'),
      greeting(memberName),
      paragraph(`We received a request to reset your password for <strong style="color: ${brand.white};">${orgName}</strong>. Click the button below to create a new password.`),
      ctaButton('Reset Password', resetUrl),
      fallbackLink(resetUrl),
      alertBox(
        `<strong>Security Notice:</strong> This link expires in <strong>1 hour</strong>. If you didn't request this reset, you can safely ignore this email — your password won't change.`,
        'warning'
      ),
    ].join(''),
    footerExtra: 'You received this email because a password reset was requested for your account. If this wasn\'t you, no action is needed.',
  })
}


/**
 * 2. PASSWORD CHANGED — confirmation after password is successfully reset
 */
export function passwordChangedEmail(data: {
  memberName: string
  orgName: string
  loginUrl: string
}): string {
  const { memberName, orgName, loginUrl } = data

  return emailLayout({
    preheader: `Your ${orgName} password was changed successfully`,
    orgName,
    bodyContent: [
      heading('Password Changed', 'Your password has been updated successfully.'),
      greeting(memberName),
      paragraph(`Your password for <strong style="color: ${brand.white};">${orgName}</strong> has been changed. You can now log in with your new password.`),
      ctaButton('Log In Now', loginUrl, brand.success),
      alertBox(
        `<strong>Didn't change your password?</strong> If you didn't make this change, please contact your organization admin immediately to secure your account.`,
        'danger'
      ),
    ].join(''),
  })
}


/**
 * 3. PAYMENT SUBMITTED — notification to admins when a payment is submitted for review
 */
export function paymentSubmittedEmail(data: {
  adminName: string
  memberName: string
  memberId: string
  paymentType: string
  amount: string
  orgName: string
  reviewUrl: string
}): string {
  const { adminName, memberName, memberId, paymentType, amount, orgName, reviewUrl } = data

  return emailLayout({
    preheader: `New payment: ${memberName} submitted ${amount} for ${paymentType}`,
    orgName,
    bodyContent: [
      heading('New Payment Submitted', 'A member has submitted a payment for your review.'),
      greeting(adminName),
      paragraph('A new payment has been submitted and is waiting for your approval:'),
      dataCard([
        { label: 'Member', value: memberName },
        { label: 'Member ID', value: memberId },
        { label: 'Payment Type', value: paymentType },
        { label: 'Amount', value: amount, highlight: true },
      ]),
      ctaButton('Review Payment →', reviewUrl),
      paragraph(`<span style="color: ${brand.mutedText}; font-size: 13px;">You're receiving this because you have payment approval permissions in ${orgName}.</span>`),
    ].join(''),
  })
}


/**
 * 4. PAYMENT APPROVED — notification to member when their payment is approved
 */
export function paymentApprovedEmail(data: {
  memberName: string
  paymentType: string
  amount: string
  orgName: string
  approvedBy: string
  dashboardUrl: string
  date?: string
}): string {
  const { memberName, paymentType, amount, orgName, approvedBy, dashboardUrl, date } = data

  return emailLayout({
    preheader: `Your payment of ${amount} for ${paymentType} has been approved!`,
    orgName,
    bodyContent: [
      heading('Payment Approved ✓', 'Great news — your payment has been confirmed.'),
      greeting(memberName),
      paragraph(`Your payment has been reviewed and <strong style="color: ${brand.success};">approved</strong> by an admin.`),
      dataCard([
        { label: 'Payment Type', value: paymentType },
        { label: 'Amount', value: amount, highlight: true },
        { label: 'Status', value: '✓ Approved' },
        { label: 'Approved By', value: approvedBy },
        ...(date ? [{ label: 'Date', value: date }] : []),
      ]),
      ctaButton('View Dashboard', dashboardUrl, brand.success),
      paragraph(`<span style="color: ${brand.mutedText}; font-size: 13px;">Thank you for your payment. Keep this email as your confirmation.</span>`),
    ].join(''),
  })
}


/**
 * 5. PAYMENT REJECTED — notification to member when their payment is rejected
 */
export function paymentRejectedEmail(data: {
  memberName: string
  paymentType: string
  amount: string
  orgName: string
  rejectedBy: string
  reason?: string
  dashboardUrl: string
}): string {
  const { memberName, paymentType, amount, orgName, rejectedBy, reason, dashboardUrl } = data

  return emailLayout({
    preheader: `Your payment of ${amount} for ${paymentType} was not approved`,
    orgName,
    bodyContent: [
      heading('Payment Not Approved'),
      greeting(memberName),
      paragraph(`Unfortunately, your payment submission was <strong style="color: ${brand.danger};">not approved</strong>.`),
      dataCard([
        { label: 'Payment Type', value: paymentType },
        { label: 'Amount', value: amount },
        { label: 'Status', value: '✗ Rejected' },
        { label: 'Reviewed By', value: rejectedBy },
      ]),
      reason
        ? alertBox(`<strong>Reason:</strong> ${reason}`, 'info')
        : alertBox('No specific reason was provided. Please contact your admin for more details.', 'info'),
      ctaButton('View Details', dashboardUrl),
      paragraph(`<span style="color: ${brand.mutedText}; font-size: 13px;">If you believe this was a mistake, please contact your organization admin.</span>`),
    ].join(''),
  })
}


/**
 * 6. BILLING RECEIPT — sent after successful billing/subscription payment
 */
export function billingReceiptEmail(data: {
  adminName: string
  orgName: string
  plan: string
  amount: string
  reference: string
  date: string
  dashboardUrl: string
}): string {
  const { adminName, orgName, plan, amount, reference, date, dashboardUrl } = data

  return emailLayout({
    preheader: `Payment receipt for ${orgName} — ${plan} plan`,
    orgName,
    bodyContent: [
      heading('Payment Receipt', `Thank you for upgrading ${orgName}.`),
      greeting(adminName),
      paragraph(`Your subscription payment has been processed successfully. Here are your receipt details:`),
      dataCard([
        { label: 'Plan', value: plan },
        { label: 'Amount', value: amount, highlight: true },
        { label: 'Transaction Ref', value: reference },
        { label: 'Date', value: date },
        { label: 'Organization', value: orgName },
        { label: 'Status', value: '✓ Paid' },
      ]),
      ctaButton('Go to Dashboard', dashboardUrl, brand.success),
      alertBox('This serves as your official payment receipt. Save or print this email for your records.', 'info'),
    ].join(''),
  })
}


/**
 * 7. WELCOME EMAIL — sent when a new member/admin first joins
 */
export function welcomeEmail(data: {
  memberName: string
  orgName: string
  loginUrl: string
  role?: string
}): string {
  const { memberName, orgName, loginUrl, role } = data

  return emailLayout({
    preheader: `Welcome to ${orgName} on Payvexo!`,
    orgName,
    bodyContent: [
      heading(`Welcome to ${orgName}!`, `You've been added to the organization${role ? ` as ${role}` : ''}.`),
      greeting(memberName),
      paragraph(`You now have access to <strong style="color: ${brand.white};">${orgName}</strong> on Payvexo. Here's what you can do:`),
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0;">
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: ${brand.success}; font-size: 16px;">✓</span>
            <span style="color: ${brand.bodyText}; font-size: 14px; margin-left: 8px;">View and track your payment history</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: ${brand.success}; font-size: 16px;">✓</span>
            <span style="color: ${brand.bodyText}; font-size: 14px; margin-left: 8px;">Submit payments with proof of payment</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: ${brand.success}; font-size: 16px;">✓</span>
            <span style="color: ${brand.bodyText}; font-size: 14px; margin-left: 8px;">Get notified when payments are approved</span>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 0;">
            <span style="color: ${brand.success}; font-size: 16px;">✓</span>
            <span style="color: ${brand.bodyText}; font-size: 14px; margin-left: 8px;">Download receipts and payment summaries</span>
          </td>
        </tr>
      </table>`,
      ctaButton('Log In to Get Started', loginUrl),
    ].join(''),
  })
}


/**
 * 9. SCHOOL-EMAIL VERIFICATION — OTP to verify an exec holds an institutional email
 */
export function schoolEmailVerifyEmail(data: {
  memberName: string
  orgName: string
  code: string
}): string {
  const { memberName, orgName, code } = data

  return emailLayout({
    preheader: `Your ${orgName} verification code is ${code}`,
    orgName,
    bodyContent: [
      heading('Verify your school email', `Confirm you can collect for ${orgName}.`),
      greeting(memberName),
      paragraph(`Enter this code in Payvexo to verify your role at <strong style="color: ${brand.white};">${orgName}</strong>. This unlocks creating dues, events and payouts.`),
      codeBlock(code),
      alertBox(
        `<strong>This code expires in 15 minutes.</strong> If you didn't request it, you can ignore this email — nothing changes.`,
        'warning'
      ),
    ].join(''),
    footerExtra: 'You received this because someone requested role verification for your account on Payvexo.',
  })
}


/**
 * 10. ACCOUNT DELETION CONFIRMATION — bearer-token confirmation link sent
 * when a member requests to delete their account. Same shape as
 * passwordResetEmail (one CTA, fallback link, 24h expiry notice), but
 * uses the danger color since the action it confirms is irreversible.
 */
export function accountDeletionRequestEmail(data: {
  memberName: string
  orgName: string
  confirmUrl: string
  deletionPath: 'hard' | 'soft' | 'hard_with_orphan_group'
}): string {
  const { memberName, orgName, confirmUrl, deletionPath } = data

  const whatHappens = deletionPath === 'soft'
    ? 'Your name, email and phone will be permanently removed. Payment records stay as anonymized entries so the organization\u2019s books remain accurate.'
    : 'Your account and all personal data will be permanently deleted.'

  return emailLayout({
    preheader: `Confirm deletion of your ${orgName} account`,
    orgName,
    bodyContent: [
      heading('Confirm Account Deletion'),
      greeting(memberName),
      paragraph(`We received a request to delete your account on <strong style="color: ${brand.white};">${orgName}</strong>. This is permanent and cannot be undone.`),
      alertBox(`<strong>What happens:</strong> ${whatHappens}`, 'danger'),
      ctaButton('Confirm Account Deletion', confirmUrl, brand.danger),
      fallbackLink(confirmUrl),
      alertBox(
        `<strong>This link expires in 24 hours.</strong> If you didn't request this, ignore this email \u2014 your account will remain exactly as it is.`,
        'warning'
      ),
    ].join(''),
    footerExtra: 'You received this because an account deletion was requested for your account. If this wasn\u2019t you, no action is needed.',
  })
}


/**
 * 8. ADMIN RESET PASSWORD — sent when an admin resets a member's password
 */
export function adminResetPasswordEmail(data: {
  memberName: string
  orgName: string
  tempPassword: string
  loginUrl: string
  adminName: string
}): string {
  const { memberName, orgName, tempPassword, loginUrl, adminName } = data

  return emailLayout({
    preheader: `Your password for ${orgName} has been reset by an admin`,
    orgName,
    bodyContent: [
      heading('Password Reset by Admin'),
      greeting(memberName),
      paragraph(`Your password for <strong style="color: ${brand.white};">${orgName}</strong> has been reset by <strong style="color: ${brand.white};">${adminName}</strong>.`),
      paragraph('Use this temporary password to log in:'),
      codeBlock(tempPassword),
      alertBox(
        `<strong>Important:</strong> You will be asked to change this password when you log in. Please choose a strong, unique password.`,
        'warning'
      ),
      ctaButton('Log In Now', loginUrl),
    ].join(''),
    footerExtra: 'If you did not expect this reset, please contact your organization admin.',
  })
}
