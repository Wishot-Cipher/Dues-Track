# Payvexo Billing & Subscription Setup Guide

Complete step-by-step guide to setting up the Paystack billing system for Payvexo.

---

## Overview

Payvexo uses **Paystack** as the payment gateway for subscription billing. Organizations can upgrade from the Free plan to Starter, Professional, or Enterprise via in-app payments.

### Architecture

```
BillingPage (Admin UI) → billingService.ts (Client)
    ↓ Paystack Popup
    ↓ Payment success callback
api/billing/verify-payment.ts (Vercel Serverless)
    ↓ Verifies with Paystack API
    ↓ Calls upgrade_organization_plan() SQL function
    → Organization upgraded in database
```

---

## Step 1: Create a Paystack Account

1. Go to [https://dashboard.paystack.com/#/signup](https://dashboard.paystack.com/#/signup)
2. Sign up with your email and business details
3. Verify your email address
4. Complete the business verification process (KYC)

> **Note:** You can use Test Mode while setting up. Switch to Live Mode only when ready for production.

---

## Step 2: Get Your API Keys

1. Log into [Paystack Dashboard](https://dashboard.paystack.com)
2. Go to **Settings → API Keys & Webhooks**
3. Copy these two keys:
   - **Public Key**: Starts with `pk_test_` (test) or `pk_live_` (production)
   - **Secret Key**: Starts with `sk_test_` (test) or `sk_live_` (production)

---

## Step 3: Set Environment Variables

### Local Development (`.env` file)

Create or update your `.env` file in the project root:

```env
# Paystack - Client side (public key)
VITE_PAYSTACK_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Paystack - Server side (secret key) - used by Vercel API routes
PAYSTACK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Vercel Deployment

1. Go to your Vercel project dashboard
2. Navigate to **Settings → Environment Variables**
3. Add these variables:

| Variable | Value | Environment |
|----------|-------|-------------|
| `VITE_PAYSTACK_PUBLIC_KEY` | `pk_live_xxxxx` | Production |
| `PAYSTACK_SECRET_KEY` | `sk_live_xxxxx` | Production |
| `VITE_PAYSTACK_PUBLIC_KEY` | `pk_test_xxxxx` | Preview, Development |
| `PAYSTACK_SECRET_KEY` | `sk_test_xxxxx` | Preview, Development |

> **IMPORTANT:** The `PAYSTACK_SECRET_KEY` must NEVER be exposed to the client. It's only used in the Vercel serverless function (`api/billing/verify-payment.ts`).

---

## Step 4: Run the Database Migration

Execute the billing transactions SQL migration in your Supabase database:

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `database/14_billing_transactions.sql`
4. Click **Run**

This creates:
- `billing_transactions` table — Stores all payment records
- `upgrade_organization_plan()` function — Atomically upgrades org plan after payment verification
- RLS policies for secure access
- Necessary indexes

---

## Step 5: Verify Supabase Connection Variables

Make sure your Supabase variables are also set:

```env
# Supabase (required)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...

# Server-side Supabase (for API routes)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...
```

> The `SUPABASE_SERVICE_KEY` is the **service role key** from Supabase → Settings → API. It bypasses RLS and is used by the `verify-payment.ts` API route.

---

## Step 6: Deploy the Vercel API Route

The payment verification endpoint is at `api/billing/verify-payment.ts`. It's automatically deployed when you push to Vercel.

**What it does:**
1. Receives a Paystack transaction reference
2. Verifies the payment with Paystack's API using the secret key
3. Calls `upgrade_organization_plan()` to upgrade the org
4. Returns success/failure to the client

---

## Step 7: Test the Flow

### Test Mode (Recommended First)

1. Use Paystack test keys (`pk_test_...` and `sk_test_...`)
2. Log into any organization as an admin
3. Go to **Admin → Billing** (or navigate to `/{orgSlug}/admin/billing`)
4. Click **Upgrade** on any plan
5. Use Paystack test card details:
   - **Card Number:** `4084 0840 8408 4081`
   - **Expiry:** Any future date
   - **CVV:** `408`
   - **PIN:** `0000`
   - **OTP:** `123456`

### Verify Success

After a test payment:
1. Check the org's `subscription_plan` in Supabase → Table Editor → `organizations`
2. Check `billing_transactions` table for the payment record
3. The BillingPage should show the updated plan

---

## Subscription Plans

| Plan | Monthly (₦) | Yearly (₦) | Groups | Members | Admins |
|------|-------------|------------|--------|---------|--------|
| **Free** | ₦0 | ₦0 | 1 | 50 | 3 |
| **Starter** | ₦5,000 | ₦48,000 | 3 | 300 | 10 |
| **Professional** | ₦15,000 | ₦144,000 | 20 | 5,000 | 50 |
| **Enterprise** | Custom | Custom | Unlimited | Unlimited | Unlimited |

---

## Platform Console (Super Admin)

Platform admins can manage billing from the Platform Console (`/pvx-console`):

- **View** each org's current plan, trial status, and expiry dates
- **Upgrade/Downgrade** any org's plan directly (no payment needed)
- **Extend Trials** by any number of days
- **Adjust Limits** (max groups, members, admins) per org
- **View Billing History** for any organization
- **Filter** organizations by subscription plan

---

## Troubleshooting

### "Paystack not configured" warning on BillingPage
- Ensure `VITE_PAYSTACK_PUBLIC_KEY` is set and starts with `pk_`
- Restart the dev server after adding env vars

### Payment succeeds in popup but plan doesn't upgrade
- Check Vercel function logs for errors
- Ensure `PAYSTACK_SECRET_KEY` is set in Vercel environment variables
- Ensure `SUPABASE_SERVICE_KEY` is set (the service role key, not anon key)
- Verify the `billing_transactions` table and `upgrade_organization_plan` function exist

### "billing_transactions table does not exist" error
- Run the `database/14_billing_transactions.sql` migration in Supabase SQL Editor

### Test vs Live mode
- Test keys: `pk_test_...` / `sk_test_...` — use test card numbers
- Live keys: `pk_live_...` / `sk_live_...` — real payments
- Switch by changing the env variables, no code changes needed

---

## File Reference

| File | Purpose |
|------|---------|
| `src/services/billingService.ts` | Client-side billing logic, Paystack integration |
| `src/pages/admin/BillingPage.tsx` | Admin billing UI page |
| `src/hooks/useSubscriptionLimits.ts` | Hook for checking plan limits |
| `api/billing/verify-payment.ts` | Server-side payment verification |
| `database/14_billing_transactions.sql` | Database migration for billing |
| `src/types/multiTenant.ts` | Plan definitions (`SUBSCRIPTION_PLANS`) |
| `src/services/platformAdminService.ts` | Platform console billing management |
| `src/pages/PlatformConsolePage.tsx` | Platform console UI with billing controls |
