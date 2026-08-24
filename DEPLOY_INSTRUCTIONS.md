# Deployment Instructions

## Build Status
✅ **Production build successful**
- Bundle size: 449KB JS (130KB gzipped)
- PWA service worker generated with 9 entries precached
- All assets ready in `/dist` directory

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the database to provision (takes ~2 minutes)
3. Navigate to **SQL Editor** in the left sidebar
4. Copy the entire contents of `supabase-schema.sql` and paste it into the editor
5. Click **Run** to execute all table creations, views, functions, and indexes

## Step 2: Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your Supabase credentials from the project dashboard:
   - Go to **Settings** → **API** in Supabase
   - Copy `Project URL` → paste as `VITE_SUPABASE_URL`
   - Copy `anon public` key → paste as `VITE_SUPABASE_ANON_KEY`

## Step 3: Deploy to Vercel

### Option A: Using Vercel CLI (Recommended)
```bash
# Install Vercel CLI globally if not already installed
npm install -g vercel

# Login to Vercel
vercel login

# Deploy
vercel --prod
```

### Option B: Using Vercel Dashboard
1. Go to [vercel.com](https://vercel.com)
2. Click **Add New Project**
3. Import this repository from GitHub
4. In **Build & Development Settings**:
   - Framework Preset: **Vite**
   - Output Directory: **dist**
5. Add Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
6. Click **Deploy**

## Step 4: Post-Deployment Setup

### 4.1 Migrate Historical Data (Optional but Recommended)
1. Navigate to `https://your-deployed-app.vercel.app/migrate`
2. Export data from your old system (or prepare a CSV with columns: `project_name`, `item_name`, `quantity`, `supplier_name`)
3. Upload the file
4. Review catalog clusters and confirm merges
5. Execute migration

### 4.2 Test Offline Functionality
1. Open the deployed app in Chrome
2. Open DevTools → **Application** tab → **Service Workers**
3. Check "Offline" checkbox
4. Navigate to a project and try:
   - Adding a material
   - Marking items as delivered
   - Attaching a photo
5. Uncheck "Offline" and verify sync completes

## Step 5: Daily Usage Workflow

1. **Create Project**: Add new project with client, location, install date
2. **Upload Quote**: Drag-and-drop PDF quote to auto-extract materials
3. **Review Readiness Dashboard**: Check for late/at-risk items (sorted by urgency)
4. **Accept Suggestions**: Review AI-suggested missing items based on history
5. **On-Site Checklist**: Use offline-capable checklist to mark deliveries and attach DO photos

## Troubleshooting

### Build Fails
```bash
# Clear cache and rebuild
rm -rf node_modules dist
npm install
npm run build
```

### PWA Not Working
- Ensure `manifest.webmanifest` is served with correct MIME type
- Check browser console for service worker registration errors
- Hard refresh: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)

### Supabase Connection Errors
- Verify environment variables are set correctly
- Check that RLS policies allow anonymous access (single-user mode)
- Ensure `supabase-schema.sql` was executed successfully

## Support
For issues related to:
- **Schema**: Review `supabase-schema.sql` comments
- **Offline Sync**: Check `src/lib/syncQueue.js` and browser DevTools Application tab
- **Suggestions**: Verify historical data exists via `/migrate` page
