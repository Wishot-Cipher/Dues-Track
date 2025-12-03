# Class Dues Tracker - File Organization

## 📁 Root Directory Structure

### Essential Configuration Files
- `package.json` - Project dependencies and scripts
- `vite.config.ts` - Build configuration
- `tsconfig.json` - TypeScript configuration
- `tailwind.config.ts` - Styling configuration
- `components.json` - UI components configuration
- `.env.local` - Environment variables (NOT in git)
- `.env.local.example` - Environment template
- `vercel.json` - Deployment configuration

### Documentation (Active)
- `README.md` - Main project documentation
- `QUICK_START.md` - Quick setup guide
- `DEPLOYMENT_GUIDE.md` - Deployment instructions
- `SUPABASE_DEPLOYMENT_GUIDE.md` - Supabase-specific deployment
- `ADMIN_SETTINGS_GUIDE.md` - Admin feature controls

### Source Code
- `src/` - Main application code
  - `components/` - React components
  - `pages/` - Page components
  - `services/` - API services
  - `hooks/` - Custom React hooks
  - `utils/` - Utility functions
  - `types/` - TypeScript types
  - `config/` - App configuration

### Database
- `supabase/` - Database schema, policies, functions
- `supabase-migrations/` - Migration files
- `database/` - Additional SQL scripts

### Scripts
- `scripts/` - Utility scripts (imports, data processing)

### Public Assets
- `public/` - Static assets (icons, sounds, manifest)

### Archives
- `archive_sql_root/` - Old SQL files (reference only)
- `archive_docs/` - Old documentation (reference only)

---

## 🔒 Security Notes

### Files Excluded from Git (.gitignore)
- `.env.local` - Contains sensitive keys
- `node_modules/` - Dependencies
- `dist/` - Build output

### Production Checklist
- ✅ All console.log statements removed or commented out
- ✅ Error messages are generic (no sensitive details)
- ✅ Environment variables properly configured
- ✅ Database RLS policies active

---

## 📝 Recent Updates

### Security Improvements
- Removed console logs that expose user IDs
- Generic error messages (no stack traces)
- Cleaned up redundant files

### File Organization
- SQL files archived to `archive_sql_root/`
- Old documentation moved to `archive_docs/`
- Active files remain in root for easy access

---

**Last Updated:** December 3, 2025  
**Maintained By:** Dev_Wishot
