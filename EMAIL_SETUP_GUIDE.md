# 📧 Email Setup Guide (Resend API)

## Why Emails Aren't Working

The password reset emails show "success" but don't arrive because:
1. `onboarding@resend.dev` is a test email that only works with verified recipients
2. You need to verify your own domain in Resend to send production emails

---

## ✅ Quick Setup (5 minutes)

### Step 1: Get Your Resend API Key
1. Go to https://resend.com/
2. Sign up or log in
3. Go to **API Keys** → Create new key
4. Copy the key (starts with `re_...`)

### Step 2: Add to Environment Variables

Add to your `.env` or `.env.local` file:

```env
# Resend Email Configuration
RESEND_API_KEY=re_your_actual_key_here
FROM_EMAIL=onboarding@resend.dev
```

For Vercel deployment:
1. Go to your project settings
2. **Environment Variables**
3. Add `RESEND_API_KEY` and `FROM_EMAIL`

---

## 🎯 Production Setup (Recommended)

### Option A: Verify Your Domain (Best)

1. **Add Domain in Resend:**
   - Go to https://resend.com/domains
   - Click "Add Domain"
   - Enter your domain (e.g., `classdues.com`)
   
2. **Add DNS Records:**
   - Resend will give you DNS records
   - Add them to your domain provider (Namecheap, GoDaddy, etc.)
   - Wait for verification (usually 10-30 minutes)

3. **Update Environment Variable:**
   ```env
   FROM_EMAIL=noreply@classdues.com
   # or
   FROM_EMAIL=ECE Class Dues <noreply@classdues.com>
   ```

### Option B: Use Resend's Subdomain (Quick)

1. **Create Subdomain in Resend:**
   - Go to https://resend.com/domains
   - They provide a free subdomain like `yourusername.resend.dev`

2. **Update Environment:**
   ```env
   FROM_EMAIL=notifications@yourusername.resend.dev
   ```

---

## 🧪 Testing Email

### Test Email Endpoint

Create `test-email.html`:

```html
<!DOCTYPE html>
<html>
<body>
  <h1>Test Password Reset Email</h1>
  <form id="testForm">
    <input type="email" id="email" placeholder="Your email" required>
    <button type="submit">Send Test Email</button>
  </form>
  <div id="result"></div>

  <script>
    document.getElementById('testForm').onsubmit = async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      
      const res = await fetch('/api/password/send-reset-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      
      const data = await res.json();
      document.getElementById('result').innerHTML = 
        `<pre>${JSON.stringify(data, null, 2)}</pre>`;
    };
  </script>
</body>
</html>
```

---

## 🔍 Troubleshooting

### "Email sent" but not received?

**Check Resend Dashboard:**
1. Go to https://resend.com/emails
2. Look for your sent email
3. Check status:
   - ✅ **Delivered** = Email sent successfully
   - ❌ **Bounce** = Invalid email address
   - ⏸️ **Queued** = Still processing
   - 🚫 **Rejected** = Domain not verified

### Common Issues:

| Issue | Solution |
|-------|----------|
| "onboarding@resend.dev" only works for test recipients | Verify your domain or use Resend subdomain |
| Email goes to spam | Add SPF/DKIM records (Resend provides these) |
| API key error | Check key is correct and has send permission |
| Rate limit exceeded | Free plan: 100 emails/day. Upgrade if needed |

---

## 📊 Resend Free Tier Limits

- 3,000 emails/month
- 100 emails/day
- ✅ Perfect for class dues tracker

Need more? Upgrade to Pro ($20/month) for 50,000 emails/month.

---

## 🎨 Customize Email Template

The email template is in `api/password/send-reset-email.ts` around line 116.

You can customize:
- Colors (currently matches app theme: #FF6B35, #F59E0B)
- Logo (add an image URL)
- Footer text
- Email subject

---

## 🚀 Alternative: Gmail SMTP (Not Recommended)

If you can't use Resend, you can use Gmail SMTP, but it's less reliable:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Not your regular password!
FROM_EMAIL=your-email@gmail.com
```

⚠️ **Note:** Gmail limits to 500 emails/day and may mark you as spam.

---

## ✅ Recommended Setup

For a class dues tracker, this is the best approach:

1. Use Resend free tier
2. Verify a cheap domain ($2/year on Namecheap)
3. Use `noreply@yourdomain.com` as sender
4. Professional, reliable, and free!

**Total cost:** ~$2/year for domain only
