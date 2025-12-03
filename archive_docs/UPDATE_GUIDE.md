# How to Notify Users of Updates

## Quick Guide

When you make changes and want users to update their app:

### 1. Update the Version Number
Open `src/components/UpdateNotification.tsx` and change the version:

```typescript
const APP_VERSION = '1.0.2'  // Increment this number
```

### 2. Push Your Changes
```bash
git add .
git commit -m "Your update message"
git push
```

### 3. What Happens Next?
- Users will automatically see an update notification banner at the top of their screen
- The banner shows:
  - 🎉 Update Available message
  - Description of new features
  - "Update Now" button
  - "Remind me later" option

### 4. Version Numbering Guide
- **Major update** (breaking changes): `1.0.0` → `2.0.0`
- **Minor update** (new features): `1.0.0` → `1.1.0`
- **Patch update** (bug fixes): `1.0.0` → `1.0.1`

## Example Workflow

```bash
# After fixing bugs or adding features
cd C:\Users\USER\Desktop\Class-dues-tracker

# 1. Update version in UpdateNotification.tsx
# Change: const APP_VERSION = '1.0.2'

# 2. Commit and push
git add .
git commit -m "Fixed expense export and added update notifications"
git push

# 3. Users will see the update banner automatically!
```

## Features

✅ **Auto-detection**: Checks for updates when app loads
✅ **Smart notifications**: Shows banner only when version changes
✅ **Service Worker integration**: Detects PWA updates automatically
✅ **User-friendly**: Easy to dismiss or postpone
✅ **Hourly checks**: Automatically checks for updates every hour
✅ **One-click update**: Users just click "Update Now" and app refreshes

## Customizing the Update Message

Edit `src/components/UpdateNotification.tsx` to change the message:

```typescript
<p className="text-white/90 text-sm mb-3">
  Your custom update message here! Tell users what's new.
</p>
```

## Testing Updates

1. Change the version number
2. Refresh your browser
3. You should see the update banner appear
4. Click "Update Now" to reload with new version

---

**Note**: The update banner appears at the top of every page and works for both web and PWA users!
