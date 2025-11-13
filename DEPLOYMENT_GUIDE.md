# 🚀 DEPLOYMENT GUIDE - Class Dues Tracker PWA

## ✅ Pre-Deployment Checklist

- [x] Build successful (`npm run build`)
- [x] Service worker generated
- [x] PWA configured
- [x] Offline mode tested
- [x] TypeScript compiled
- [x] Production preview working (`http://localhost:4173`)

## 🎯 Quick Deploy

### Option 1: Vercel (Recommended)

```bash
# Install Vercel CLI (if not already)
npm install -g vercel

# Deploy
vercel --prod

# Follow prompts:
# - Select project
# - Build command: npm run build
# - Output directory: dist
```

### Option 2: Netlify

```bash
# Install Netlify CLI (if not already)
npm install -g netlify-cli

# Deploy
netlify deploy --prod

# Build settings:
# - Build command: npm run build
# - Publish directory: dist
```

### Option 3: GitHub Pages

```bash
# Install gh-pages
npm install --save-dev gh-pages

# Add to package.json scripts:
{
  "deploy": "npm run build && gh-pages -d dist"
}

# Deploy
npm run deploy
```

### Option 4: Manual Deploy

```bash
# Build
npm run build

# Upload dist/ folder to:
# - cPanel
# - FTP server
# - Cloud storage (S3, etc.)
```

## 🔧 Environment Setup

### Required Environment Variables

Create `.env` file:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_key
```

### Vercel Setup
1. Go to project settings
2. Environment Variables
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
4. Redeploy

### Netlify Setup
1. Site settings → Build & deploy
2. Environment → Environment variables
3. Add variables
4. Trigger deploy

## 📱 PWA Requirements

### ✅ Already Configured
- HTTPS (auto on Vercel/Netlify)
- Manifest.json
- Service worker
- Icons (72px - 512px)
- Theme colors

### Test PWA Score
```bash
# After deployment, run Lighthouse:
# 1. Open site in Chrome
# 2. DevTools → Lighthouse
# 3. Run audit
# 4. Check PWA score (should be 100)
```

## 🔐 Security Setup

### Supabase RLS Policies
Ensure these are enabled:
```sql
-- Students can only see their own data
CREATE POLICY "Students view own data"
ON students FOR SELECT
TO authenticated
USING (auth.uid() = id);

-- Students can only see their own payments
CREATE POLICY "Students view own payments"
ON payments FOR SELECT
TO authenticated
USING (student_id = auth.uid());
```

### CORS Configuration
Supabase handles CORS automatically for your domain.

## 🌐 Custom Domain

### Vercel
1. Project → Settings → Domains
2. Add domain
3. Update DNS:
   - Type: CNAME
   - Name: @ or www
   - Value: cname.vercel-dns.com

### Netlify
1. Domain settings → Add custom domain
2. Follow DNS setup instructions
3. Free SSL auto-configured

## 📊 Monitoring Setup

### Analytics (Optional)
```bash
# Google Analytics
npm install @next/third-parties

# Add to App.tsx:
import { GoogleAnalytics } from '@next/third-parties/google'
<GoogleAnalytics gaId="G-XXXXXXXXXX" />
```

### Error Tracking (Optional)
```bash
# Sentry
npm install @sentry/react

# Configure in main.tsx
```

## 🔄 Update Process

### Update App
```bash
# 1. Make changes
git add .
git commit -m "Update description"

# 2. Build and test
npm run build
npm run preview

# 3. Deploy
git push origin main
# (Auto-deploys on Vercel/Netlify)
```

### Service Worker Update
- Users get update prompt automatically
- Click "Reload" to update
- New version installed

## 🧪 Post-Deployment Testing

### Test Offline Mode
1. Open deployed site
2. Chrome DevTools → Network → Offline
3. Reload page → Should load from cache
4. Check offline banner appears

### Test Install
1. Visit site in Chrome (mobile)
2. Install prompt should appear
3. Click "Install Now"
4. App appears on home screen
5. Launch and test

### Test PWA Features
- [ ] Install prompt works
- [ ] Offline mode functional
- [ ] Service worker registered
- [ ] Icons display correctly
- [ ] Theme color applied
- [ ] Standalone mode works

## 📈 Performance Optimization

### Already Optimized
- ✅ Code splitting
- ✅ Asset caching
- ✅ Lazy loading
- ✅ Service worker
- ✅ Gzip compression

### Additional Optimizations
```bash
# Analyze bundle
npm install --save-dev rollup-plugin-visualizer

# Add to vite.config.ts:
import { visualizer } from 'rollup-plugin-visualizer'
plugins: [
  visualizer({ open: true })
]
```

## 🐛 Troubleshooting

### Build Fails
```bash
# Clear cache
rm -rf node_modules dist
npm install
npm run build
```

### Service Worker Not Updating
```bash
# Hard refresh
Ctrl + Shift + R (Chrome)
Cmd + Shift + R (Mac)

# Or unregister SW in DevTools:
Application → Service Workers → Unregister
```

### PWA Not Installing
- Check HTTPS is enabled
- Verify manifest.json accessible
- Check icons exist
- Try incognito mode

## 📞 Support Contacts

### Hosting Issues
- Vercel: https://vercel.com/support
- Netlify: https://www.netlify.com/support/

### Database Issues
- Supabase: https://supabase.com/support

## 🎉 Success Criteria

Your deployment is successful when:
- ✅ Site loads on custom domain
- ✅ HTTPS enabled
- ✅ PWA install prompt appears
- ✅ Offline mode works
- ✅ Service worker registered
- ✅ No console errors
- ✅ Lighthouse PWA score: 100

## 🚀 Final Commands

```bash
# 1. Final build
npm run build

# 2. Test locally
npm run preview
# Visit http://localhost:4173

# 3. Deploy
vercel --prod
# or
netlify deploy --prod

# 4. Test live site
# - Visit your domain
# - Test offline mode
# - Test install
# - Run Lighthouse
```

## 📱 Share Your App

Once deployed, share with:
- Students: Install via Chrome/Edge
- Admin: Access admin dashboard
- Class reps: Monitor payments

**URL Format:**
- Main: `https://your-domain.com`
- Login: `https://your-domain.com/login`
- Dashboard: `https://your-domain.com/dashboard`
- Admin: `https://your-domain.com/admin/dashboard`

---

## 🎊 YOU'RE LIVE!

Congratulations! Your Class Dues Tracker PWA is now **deployed and production-ready**!

**Next Steps:**
1. Share URL with students
2. Monitor usage
3. Collect feedback
4. Plan v2 features

---

**Support:** Check OFFLINE_FEATURES.md for detailed documentation

**Version:** 1.0.0 MVP  
**Status:** 🟢 Production Ready  
**Last Updated:** November 13, 2025
