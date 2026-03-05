# Payvexo Email Setup Guide — Gmail SMTP

Complete step-by-step guide to enable email functionality in Payvexo (password resets, payment notifications, admin alerts).

**No custom domain required. Works with any free Gmail account. Sends to ANY email address.**

---

## What Emails Does Payvexo Send?

| Feature                     | API Route                          | When It Fires                                     |
|-----------------------------|------------------------------------|----------------------------------------------------|
| Password Reset              | `api/password/send-reset-email.ts` | Member clicks "Forgot Password" on the login page   |
| Payment Approval Alerts     | `api/notify-approvers.ts`          | A member submits a new payment for admin approval    |

Both routes use **Gmail SMTP** via `nodemailer` to deliver emails.

---

## Step 1: Prepare a Gmail Account

Use an existing Gmail account or create a new one specifically for Payvexo.

> **Recommended**: Create a dedicated account like `payvexo.noreply@gmail.com` so your personal inbox stays clean.

---

## Step 2: Enable 2-Step Verification

Google requires 2-Step Verification before you can create App Passwords.

1. Go to **https://myaccount.google.com/security**
2. Under **"How you sign in to Google"**, click **2-Step Verification**
3. If it says "Off", click **"Turn on"**
4. Follow the prompts:
   - Enter your phone number
   - Choose **Text message** or **Phone call**
   - Enter the verification code Google sends you
5. Click **"Turn on"** to confirm
6. You should now see **2-Step Verification: On** ✅

---

## Step 3: Create an App Password

App Passwords are special 16-character passwords that let apps (like Payvexo) send email through your Gmail.

1. Go to **https://myaccount.google.com/apppasswords**
   - If this link says "not available", make sure 2-Step Verification is ON (Step 2)
   - For Workspace (school/work) accounts, your admin may have disabled this — use a personal Gmail instead
2. You'll see **"App passwords"** page
3. In the **"App name"** field, type: `Payvexo`
4. Click **"Create"**
5. Google shows a **16-character password** like:
   ```
   abcd efgh ijkl mnop
   ```
6. **Copy it immediately** — Google only shows it once!
7. Remove the spaces when pasting: `abcdefghijklmnop`

---

## Step 4: Add Credentials to Your Project

### For Local Development

Open `.env.local` in your project root and update these lines:

```env
# Email Service (Gmail SMTP)
GMAIL_USER=payvexo.noreply@gmail.com
GMAIL_APP_PASSWORD=abcdefghijklmnop
FROM_EMAIL=payvexo.noreply@gmail.com
```

Replace with your actual Gmail address and the 16-character app password (no spaces).

### For Production (Vercel)

1. Go to your **Vercel project dashboard** → https://vercel.com/dashboard
2. Click your project → **Settings** → **Environment Variables**
3. Add these variables:

| Name                 | Value                              | Environment         |
|----------------------|-------------------------------------|---------------------|
| `GMAIL_USER`         | `payvexo.noreply@gmail.com`        | Production, Preview  |
| `GMAIL_APP_PASSWORD` | `abcdefghijklmnop`                 | Production, Preview  |
| `FROM_EMAIL`         | `payvexo.noreply@gmail.com`        | Production, Preview  |

4. Click **Save** for each one
5. **Redeploy** your project (Settings → Deployments → Redeploy)

---

## Step 5: Restart Your Dev Server

Vite does NOT hot-reload environment variable changes automatically.

1. Go to your terminal running `npm run dev`
2. Press **Ctrl+C** to stop it
3. Run `npm run dev` again (or `vercel dev` if testing API routes locally)

---

## Step 6: Test It

### Test Password Reset Email

1. Open your Payvexo app in the browser
2. Go to any organization login page (e.g. `https://your-app.vercel.app/your-org/login`)
3. Click **"Forgot Password"**
4. Enter the email of a member who has an email set in the database
5. Click **"Send Reset Link"**

### Check the Result

- **Check the recipient's inbox** — Gmail SMTP delivers to **any** email address, no restrictions
- **Check spam folder** — first emails from a new Gmail sender sometimes land in spam
- If the email didn't arrive, check Vercel Function logs for error details

---

## Troubleshooting

### "Email service not configured" error
- `GMAIL_USER` or `GMAIL_APP_PASSWORD` is missing in your environment
- Fix: Add both to `.env.local` (local) or Vercel Environment Variables (production), then restart/redeploy

### "Invalid login" or "Authentication failed" error
- Your App Password may be wrong or revoked
- Go to https://myaccount.google.com/apppasswords and create a new one
- Make sure you're using the App Password (16 chars), NOT your regular Gmail password
- Make sure there are no spaces in the password

### "Less secure app access" error
- This is outdated — Google no longer supports "less secure apps"
- You MUST use an App Password (Step 3). Regular passwords won't work.

### Email goes to spam
- Normal for the first few emails from a new sender
- Ask recipients to mark as "Not spam" once
- Over time, Gmail builds sender reputation and emails land in inbox

### Email arrives but looks broken
- The HTML template is in `api/password/send-reset-email.ts`
- It uses inline styles compatible with all email clients
- Customize colors, logo, and text there

### Works locally but not on Vercel
- Make sure `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `FROM_EMAIL` are set in **Vercel Environment Variables**
- Make sure you selected the correct environments (Production, Preview)
- **Redeploy** after adding variables — existing deployments don't pick up new env vars

### Rate limited
- Gmail allows **500 emails/day** — more than enough for a dues tracker
- If you need more, consider upgrading to Google Workspace ($6/month for 2,000 emails/day)

---

## Quick Reference

### Files That Send Email

| File | Purpose | Method |
|------|---------|--------|
| `api/password/send-reset-email.ts` | Password reset emails | Gmail SMTP (nodemailer) |
| `api/notify-approvers.ts` | Payment approval notifications | Gmail SMTP (nodemailer) |

### Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `GMAIL_USER` | `.env.local` + Vercel | Gmail address (sender account) |
| `GMAIL_APP_PASSWORD` | `.env.local` + Vercel | 16-char App Password from Google |
| `FROM_EMAIL` | `.env.local` + Vercel | Display sender (defaults to `GMAIL_USER`) |

### Useful Links

| Page | URL |
|------|-----|
| Google Security Settings | https://myaccount.google.com/security |
| App Passwords | https://myaccount.google.com/apppasswords |
| Gmail Sending Limits | https://support.google.com/mail/answer/22839 |

---

## Summary Checklist

- [ ] Have a Gmail account ready (personal or dedicated)
- [ ] Enabled 2-Step Verification at https://myaccount.google.com/security
- [ ] Created App Password at https://myaccount.google.com/apppasswords
- [ ] Added `GMAIL_USER` and `GMAIL_APP_PASSWORD` to `.env.local`
- [ ] Restarted dev server / redeployed on Vercel
- [ ] Tested: Forgot Password → email arrives in recipient's inbox
- [ ] (Production) Added all 3 env vars to Vercel Environment Variables
- [ ] (Production) Redeployed on Vercel
