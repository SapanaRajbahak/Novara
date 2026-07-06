# Quick Start Installation Script
# Installs dependencies and runs database migration for PDF Import System

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  PDF Import System Installation  " -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the backend directory
if (!(Test-Path "package.json")) {
    Write-Host "ERROR: package.json not found. Please run this from the backend directory." -ForegroundColor Red
    Write-Host "Usage: cd backend; .\install-pdf-system.ps1" -ForegroundColor Yellow
    exit 1
}

# Step 1: Install dependencies
Write-Host "[1/5] Installing npm dependencies..." -ForegroundColor Green
try {
    npm install pdfjs-dist multer --save
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Dependencies installed successfully" -ForegroundColor Green
    } else {
        throw "npm install failed"
    }
} catch {
    Write-Host "✗ Failed to install dependencies" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Create upload directories
Write-Host "[2/5] Creating upload directories..." -ForegroundColor Green
$directories = @("uploads", "uploads/pdfs")
foreach ($dir in $directories) {
    if (!(Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "✓ Created: $dir" -ForegroundColor Green
    } else {
        Write-Host "✓ Already exists: $dir" -ForegroundColor Gray
    }
}

Write-Host ""

# Step 3: Run Prisma migration
Write-Host "[3/5] Running database migration..." -ForegroundColor Green
try {
    npx prisma migrate dev --name add-continuous-reading-mode
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Database migration completed" -ForegroundColor Green
    } else {
        throw "Prisma migrate failed"
    }
} catch {
    Write-Host "✗ Database migration failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "You can run the migration manually with:" -ForegroundColor Yellow
    Write-Host "  npx prisma migrate dev --name add-continuous-reading-mode" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Step 4: Generate Prisma client
Write-Host "[4/5] Generating Prisma client..." -ForegroundColor Green
try {
    npx prisma generate
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ Prisma client generated" -ForegroundColor Green
    } else {
        throw "Prisma generate failed"
    }
} catch {
    Write-Host "✗ Prisma client generation failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 5: Verify setup
Write-Host "[5/5] Verifying installation..." -ForegroundColor Green
$allGood = $true

# Check pdfjs-dist
try {
    $pkg = Get-Content "package.json" | ConvertFrom-Json
    if ($pkg.dependencies.'pdfjs-dist') {
        Write-Host "✓ pdfjs-dist installed: $($pkg.dependencies.'pdfjs-dist')" -ForegroundColor Green
    } else {
        Write-Host "✗ pdfjs-dist not found in package.json" -ForegroundColor Red
        $allGood = $false
    }
} catch {
    Write-Host "✗ Could not verify pdfjs-dist" -ForegroundColor Red
    $allGood = $false
}

# Check multer
try {
    $pkg = Get-Content "package.json" | ConvertFrom-Json
    if ($pkg.dependencies.multer) {
        Write-Host "✓ multer installed: $($pkg.dependencies.multer)" -ForegroundColor Green
    } else {
        Write-Host "✗ multer not found in package.json" -ForegroundColor Red
        $allGood = $false
    }
} catch {
    Write-Host "✗ Could not verify multer" -ForegroundColor Red
    $allGood = $false
}

# Check directories
foreach ($dir in $directories) {
    if (Test-Path $dir) {
        Write-Host "✓ Directory exists: $dir" -ForegroundColor Green
    } else {
        Write-Host "✗ Directory missing: $dir" -ForegroundColor Red
        $allGood = $false
    }
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan

if ($allGood) {
    Write-Host "  Installation Complete! ✓" -ForegroundColor Green
    Write-Host "==================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Start your server: npm start" -ForegroundColor White
    Write-Host "2. Upload a PDF via admin panel" -ForegroundColor White
    Write-Host "3. Read the integration guide:" -ForegroundColor White
    Write-Host "   backend/docs/CONTINUOUS_READER_INTEGRATION.md" -ForegroundColor White
    Write-Host ""
    Write-Host "For full documentation, see:" -ForegroundColor Yellow
    Write-Host "   backend/docs/PDF_IMPORT_MIGRATION_GUIDE.md" -ForegroundColor White
} else {
    Write-Host "  Installation Incomplete" -ForegroundColor Red
    Write-Host "==================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Some components failed to install. Please:" -ForegroundColor Red
    Write-Host "1. Review the errors above" -ForegroundColor White
    Write-Host "2. Fix any issues" -ForegroundColor White
    Write-Host "3. Re-run this script" -ForegroundColor White
}

Write-Host ""
