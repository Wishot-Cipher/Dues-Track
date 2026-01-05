# Switch Database Environment
# Usage: .\switch-db.ps1 -env [prod|dev|multitenant]

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("prod", "dev", "multitenant")]
    [string]$env
)

$projectRoot = $PSScriptRoot

switch ($env) {
    "prod" {
        if (Test-Path "$projectRoot\.env.production") {
            Copy-Item "$projectRoot\.env.production" "$projectRoot\.env.local" -Force
            Write-Host "✅ Switched to PRODUCTION database" -ForegroundColor Green
        } else {
            Write-Host "❌ .env.production not found" -ForegroundColor Red
        }
    }
    "dev" {
        if (Test-Path "$projectRoot\.env.development") {
            Copy-Item "$projectRoot\.env.development" "$projectRoot\.env.local" -Force
            Write-Host "✅ Switched to DEVELOPMENT database" -ForegroundColor Green
        } else {
            Write-Host "❌ .env.development not found" -ForegroundColor Red
        }
    }
    "multitenant" {
        if (Test-Path "$projectRoot\.env.multitenant") {
            Copy-Item "$projectRoot\.env.multitenant" "$projectRoot\.env.local" -Force
            Write-Host "✅ Switched to MULTI-TENANT DEV database" -ForegroundColor Green
            Write-Host "⚠️  Remember: This is for multi-tenant development only!" -ForegroundColor Yellow
        } else {
            Write-Host "❌ .env.multitenant not found" -ForegroundColor Red
            Write-Host "   Create it from .env.multitenant.example" -ForegroundColor Yellow
        }
    }
}

# Show current config (without exposing keys)
if (Test-Path "$projectRoot\.env.local") {
    $url = Get-Content "$projectRoot\.env.local" | Where-Object { $_ -match "VITE_SUPABASE_URL" }
    if ($url) {
        Write-Host "`nCurrent Supabase URL:" -ForegroundColor Cyan
        Write-Host $url
    }
}
