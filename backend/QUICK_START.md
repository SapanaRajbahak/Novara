# Quick Start - PDF Import System

This script provides a quick installation for the PDF import system.

## Prerequisites

- Node.js and npm installed
- PostgreSQL database running
- Prisma configured

## Installation

### Windows (PowerShell)

```powershell
cd backend
.\install-pdf-system.ps1
```

### Linux/Mac (Bash)

```bash
cd backend
chmod +x install-pdf-system.sh
./install-pdf-system.sh
```

## What This Does

1. Installs npm dependencies (`pdfjs-dist`, `multer`)
2. Creates upload directories (`uploads/pdfs/`)
3. Runs Prisma database migration
4. Generates Prisma client
5. Verifies installation

## Manual Installation

If the script fails, run these commands manually:

```bash
# 1. Install dependencies
npm install pdfjs-dist multer

# 2. Create directories
mkdir -p uploads/pdfs

# 3. Run migration
npx prisma migrate dev --name add-continuous-reading-mode

# 4. Generate Prisma client
npx prisma generate
```

## Post-Installation

1. **Start the server**:
   ```bash
   npm start
   ```

2. **Test PDF Upload**:
   - Navigate to admin panel
   - Use the new PDF upload endpoint
   - Upload a sample PDF book

3. **Read Integration Guide**:
   - See `backend/docs/CONTINUOUS_READER_INTEGRATION.md`
   - Follow steps to integrate continuous reader into your frontend

## Documentation

- **Migration Guide**: `backend/docs/PDF_IMPORT_MIGRATION_GUIDE.md`
- **Integration Guide**: `backend/docs/CONTINUOUS_READER_INTEGRATION.md`

## Troubleshooting

### Migration Fails

**Error**: "Prisma migrate failed"

**Solution**: Ensure PostgreSQL is running and DATABASE_URL is correct in `.env`

### Dependencies Not Installing

**Error**: "npm install failed"

**Solution**: 
- Check internet connection
- Try `npm cache clean --force`
- Delete `node_modules` and run `npm install` again

### Permission Errors

**Error**: "Cannot create directory"

**Solution**: Run with appropriate permissions:
- Windows: Run PowerShell as Administrator
- Linux/Mac: Use `sudo` or fix directory permissions

## Support

For issues, check the full documentation or create an issue in the project repository.
