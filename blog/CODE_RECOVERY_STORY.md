# 😱 I Lost Hours of Code That Git Never Tracked — Here's How VS Code Saved My Life

**A Developer's Nightmare and The Hidden Feature That Saved Everything**

![Code Recovery](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/placeholder.png)

---

## TL;DR
I spent an entire morning writing beautiful React components, custom dropdowns, PDF export utilities, and security configurations. When I tried to commit, a git rebase conflict corrupted everything. **My code vanished.** Git couldn't help because the files were never committed. But VS Code's **Local History** feature — one I never knew existed — saved every single line. Here's the full story and how you can protect yourself.

---

## 🌅 The Morning: Everything Was Perfect

It was January 5th, 2026. I was in the zone.

I had just finished implementing some seriously cool features for my Class Dues Tracker app:

- ✨ A **ProfessionalDropdown** component with search, multi-select, keyboard navigation, and smooth Framer Motion animations
- 📄 A complete **PDF Export utility** using jsPDF with professional headers, footers, and styled tables
- 🔐 A **Security configuration** module with domain validation and environment checks
- 🔄 A **DashboardSwitcher** component for seamless admin/student view transitions
- 🛡️ **Build protection** with Terser minification to protect my source code

I was proud. These weren't just quick hacks — they were production-ready, beautifully crafted components.

Then I said the fateful words to my AI coding assistant:

> "Now let's commit all our changes and push to GitHub"

Little did I know, those words would trigger a cascade of events that nearly cost me everything.

---

## 💀 The Disaster: When Git Becomes Your Enemy

Here's what happened when we tried to commit:

```bash
$ git status
interactive rebase in progress; onto d520815
```

Wait, what? An interactive rebase was somehow in progress. We hadn't started one. Maybe it was from a previous session that got interrupted.

No problem, we thought. Let's just abort it:

```bash
$ git rebase --abort
```

Then we tried to sync with remote:

```bash
$ git pull --rebase origin main
```

And that's when everything fell apart.

```
Successfully rebased and updated refs/heads/main.
Dropped 8fdd4db (duplicate commit - already in upstream)
```

The terminal showed success. But when I looked at my files...

**They were gone.**

- `ProfessionalDropdown.tsx` — Gone
- `pdfExport.ts` — Gone  
- `security.ts` — Gone
- `DashboardSwitcher.tsx` — Gone
- All my `vite.config.ts` changes — Reverted

Hours of work. Vanished. In seconds.

---

## 😰 The Panic: Checking Git Reflog

My heart was racing. But I knew about `git reflog` — Git's time machine that tracks every HEAD movement:

```bash
$ git reflog -30
18afa92 HEAD@{0}: pull --rebase origin main (finish)
8fdd4db HEAD@{1}: rebase (abort): returning to refs/heads/main
18afa92 HEAD@{2}: commit: resolved a conflict
8fdd4db HEAD@{3}: commit: fix: scanner lifecycle, diagnostics...
```

I found my commit! `8fdd4db`! Let me cherry-pick it:

```bash
$ git cherry-pick 8fdd4db
```

Output:
```
The previous cherry-pick is now empty, possibly due to conflict resolution.
```

The commit was already in the upstream. The changes from that commit were safe. But here's the devastating realization:

**The new files I created this morning were NEVER committed.**

They existed only in my working directory. And now they were gone.

Git reflog couldn't help. Git stash was empty. There was no `.git` backup of uncommitted files.

I was about to accept my fate and rewrite everything from memory...

---

## 💡 The Discovery: VS Code's Secret Weapon

Then my AI assistant asked a question that changed everything:

> "Let me check if VS Code has local history..."

```powershell
Get-ChildItem -Path "$env:APPDATA\Code\User\History" -Recurse
```

And there it was. **Hundreds of files.** VS Code had been silently saving versions of every file I edited — automatically, in the background, without me ever knowing.

```
C:\Users\USER\AppData\Roaming\Code\User\History\
├── -33ad014b\          # ProfessionalDropdown.tsx
│   ├── entries.json
│   ├── H746.tsx        # 12:26 PM
│   ├── Itgi.tsx        # 12:15 PM
│   └── ...
├── -3718bc8b\          # pdfExport.ts
│   ├── entries.json
│   ├── EM0w.ts         # 12:20 PM
│   └── ...
├── 6319c950\           # security.ts
└── ...
```

Each folder corresponded to a file I had edited. Each contained timestamped backups. The `entries.json` file mapped the folder to the original file path.

**My code wasn't lost. VS Code had my back the entire time.**

---

## 🔧 The Recovery: Bringing Everything Back

The recovery process was surprisingly straightforward:

### Step 1: Find the History Folders

```powershell
# Find all Class-dues-tracker files in VS Code history
Get-ChildItem -Path "$env:APPDATA\Code\User\History" -Recurse -Filter "entries.json" | 
ForEach-Object { 
    $content = Get-Content $_.FullName | ConvertFrom-Json
    if ($content.resource -like "*Class-dues-tracker*") { 
        Write-Output "$($_.Directory.Name): $($content.resource)"
    }
}
```

### Step 2: Get the Latest Version

```powershell
# For each history folder, get the most recent file
$latestFile = Get-ChildItem -Path $historyPath -File | 
    Where-Object { $_.Name -ne "entries.json" } | 
    Sort-Object LastWriteTime -Descending | 
    Select-Object -First 1
```

### Step 3: Copy Back to Project

```powershell
Copy-Item -Path $latestFile.FullName -Destination "src/components/ui/ProfessionalDropdown.tsx" -Force
```

We automated this for all affected files:

```powershell
$mappings = @{
    "-33ad014b" = "src/components/ui/ProfessionalDropdown.tsx"
    "-3718bc8b" = "src/utils/pdfExport.ts"
    "6319c950" = "src/config/security.ts"
    "-61ef17a9" = "src/components/DashboardSwitcher.tsx"
    "7ee7ef46" = "vite.config.ts"
    "7c2d7c1c" = "LICENSE"
}

foreach ($folder in $mappings.Keys) {
    $histPath = "$env:APPDATA\Code\User\History\$folder"
    $destPath = $mappings[$folder]
    $latestFile = Get-ChildItem -Path $histPath -File | 
        Where-Object { $_.Name -ne "entries.json" } | 
        Sort-Object LastWriteTime -Descending | 
        Select-Object -First 1
    
    Copy-Item -Path $latestFile.FullName -Destination $destPath -Force
    Write-Output "✅ Restored: $destPath"
}
```

**Result:**
```
✅ Restored: src/components/ui/ProfessionalDropdown.tsx
✅ Restored: src/utils/pdfExport.ts
✅ Restored: src/config/security.ts
✅ Restored: src/components/DashboardSwitcher.tsx
✅ Restored: vite.config.ts
✅ Restored: LICENSE
```

**Every. Single. Line. Recovered.**

---

## 📊 The Final Commit

After restoration, here's what our git diff looked like:

```
27 files changed, 5976 insertions(+), 552 deletions(-)
 create mode 100644 LICENSE
 create mode 100644 src/components/DashboardSwitcher.tsx
 create mode 100644 src/components/ui/ProfessionalDropdown.tsx
 create mode 100644 src/config/security.ts
 create mode 100644 src/utils/pdfExport.ts
```

**5,976 lines of code saved.** Not rewritten from memory. Not approximated. The exact code we wrote.

---

## 🎓 Lessons Learned: How to Never Lose Code Again

### 1. **Commit Early, Commit Often**

This is Git 101, but I got complacent. I was "in the zone" and kept coding without committing. 

**New Rule:** If you've written more than 30 minutes of code, commit it. Even if it's not perfect. Use `git commit -m "WIP: feature in progress"`.

### 2. **Know About VS Code Local History**

VS Code has been saving your file history this whole time. You can access it:

- **Right-click any file** → "Open Timeline" (bottom of Explorer panel)
- **Or go to:** `%APPDATA%\Code\User\History\` (Windows) / `~/.config/Code/User/History/` (Linux/Mac)

You can also configure it in settings:
```json
{
    "workbench.localHistory.enabled": true,
    "workbench.localHistory.maxFileEntries": 50,
    "workbench.localHistory.maxFileSize": 256
}
```

### 3. **Never Force Git Operations Without Understanding**

Commands like `git rebase`, `git reset --hard`, and `git clean` can destroy uncommitted work. Before running them:

- Check `git status` first
- Make sure you've committed or stashed everything
- If unsure, create a backup branch: `git branch backup-just-in-case`

### 4. **Use Git Stash Before Risky Operations**

```bash
# Before any risky git operation
git stash push -m "backup before rebase"

# After operation, if something went wrong
git stash pop
```

### 5. **Set Up Auto-Save**

In VS Code settings:
```json
{
    "files.autoSave": "afterDelay",
    "files.autoSaveDelay": 1000
}
```

This ensures VS Code's Local History captures your changes.

### 6. **Consider Git Hooks for Reminders**

Create a pre-commit hook that warns about large uncommitted changes:

```bash
#!/bin/bash
# .git/hooks/pre-commit
UNCOMMITTED=$(git diff --stat | wc -l)
if [ "$UNCOMMITTED" -gt 100 ]; then
    echo "⚠️  You have $UNCOMMITTED lines of uncommitted changes!"
    echo "Consider committing more frequently."
fi
```

---

## 🔍 Where VS Code Stores Local History

| OS | Path |
|---|---|
| **Windows** | `%APPDATA%\Code\User\History\` |
| **macOS** | `~/Library/Application Support/Code/User/History/` |
| **Linux** | `~/.config/Code/User/History/` |

Each edited file gets a folder with a hash-based name. Inside:
- `entries.json` — Maps to original file path
- Multiple timestamped backup files

---

## 🛠️ Quick Recovery Script

Save this for emergencies:

```powershell
# recover-from-vscode-history.ps1
param(
    [string]$SearchPattern = "*your-project*",
    [string]$OutputDir = "./recovered"
)

$historyBase = "$env:APPDATA\Code\User\History"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Get-ChildItem -Path $historyBase -Recurse -Filter "entries.json" | ForEach-Object {
    $content = Get-Content $_.FullName -Raw | ConvertFrom-Json
    if ($content.resource -like $SearchPattern) {
        $latestFile = Get-ChildItem -Path $_.Directory.FullName -File | 
            Where-Object { $_.Name -ne "entries.json" } | 
            Sort-Object LastWriteTime -Descending | 
            Select-Object -First 1
        
        if ($latestFile) {
            $fileName = Split-Path $content.resource -Leaf
            $destPath = Join-Path $OutputDir $fileName
            Copy-Item -Path $latestFile.FullName -Destination $destPath -Force
            Write-Host "✅ Recovered: $fileName" -ForegroundColor Green
        }
    }
}

Write-Host "`n📁 Files recovered to: $OutputDir" -ForegroundColor Cyan
```

Usage:
```powershell
.\recover-from-vscode-history.ps1 -SearchPattern "*my-project*" -OutputDir "./recovered"
```

---

## 💭 Final Thoughts

This experience was terrifying but educational. I went from thinking I'd lost an entire morning's work to recovering everything in minutes — all thanks to a feature I didn't even know existed.

**The key takeaways:**

1. ✅ Git is powerful but only protects committed code
2. ✅ VS Code Local History is your silent guardian
3. ✅ Commit frequently — "WIP" commits are perfectly fine
4. ✅ Know your recovery options BEFORE you need them

The next time you're deep in a coding session, remember: **commit early, commit often, and know that VS Code has your back.**

---

## 🙏 Acknowledgments

Huge thanks to my AI coding assistant (GitHub Copilot with Claude) for discovering the VS Code Local History solution when I was ready to give up. Sometimes the best debugging partner is one who knows features you don't.

---

**Have you ever lost code and recovered it in an unexpected way? Share your war stories in the comments!** 👇

---

### Tags
`#git` `#vscode` `#webdev` `#javascript` `#typescript` `#react` `#devtips` `#productivity` `#coding` `#programming`

---

*Written by Dev_Wishot ([@wishotstudio](https://twitter.com/wishotstudio))*

*Originally experienced on January 5th, 2026, while building [Class Dues Tracker](https://github.com/Wishot-Cipher/Dues-Track) — a React + TypeScript + Supabase application for managing class payment dues.*
