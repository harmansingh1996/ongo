# Supabase Storage Setup Guide

This guide explains how to set up and use Supabase Storage for driver license photos in the OnGoPool ride-sharing application.

## Overview

**Problem Solved:** Previously, license photos were stored as base64-encoded data URLs directly in the database, causing:
- Database bloat (~1.5 MB per license record)
- Slow query performance
- Memory-intensive data transfer
- Poor scalability

**Solution:** Use Supabase Storage to store image files separately and store only small URL references in the database.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React App)                     │
│                                                               │
│  1. User uploads license photo (File/Blob)                   │
│  2. Call upsertDriverLicence() with image data               │
│     ↓                                                         │
│  3. licenceService automatically detects base64              │
│  4. Uploads to Supabase Storage                              │
│  5. Receives public URL                                      │
│  6. Saves URL to database                                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                  Supabase Storage (CDN)                      │
│                                                               │
│  Bucket: license-photos/                                     │
│    ├── {user_id}/                                            │
│    │   ├── front-1234567890.jpg                              │
│    │   └── back-1234567890.jpg                               │
│    └── {another_user_id}/                                    │
│        ├── front-1234567891.jpg                              │
│        └── back-1234567891.jpg                               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              Supabase Database (PostgreSQL)                  │
│                                                               │
│  Table: driver_licenses                                      │
│    ├── user_id: uuid                                         │
│    ├── licence_number: varchar(100)                          │
│    ├── front_image_url: text  ← Small URL reference          │
│    ├── back_image_url: text   ← Small URL reference          │
│    └── ...other fields                                       │
└─────────────────────────────────────────────────────────────┘
```

## Step 1: Create Storage Bucket (One-Time Setup)

### Option A: Via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Navigate to **Storage** in the left sidebar
3. Click **Create Bucket**
4. Configure the bucket:
   - **Name**: `license-photos`
   - **Public**: ✅ Yes (allows direct URL access)
   - **File size limit**: `5242880` (5 MB)
   - **Allowed MIME types**: `image/jpeg, image/jpg, image/png, image/webp`
5. Click **Create Bucket**

### Option B: Via Code (Requires Service Role Key)

```typescript
import { ensureBucketExists } from './src/services/storageService';

// Run this once during setup
await ensureBucketExists();
```

**Note:** Bucket creation via code requires admin privileges and may not work with the anon key.

## Step 2: Set Storage Policies (Security)

By default, the bucket is public. For better security, configure Row Level Security (RLS) policies:

### Via Supabase Dashboard:

1. Go to **Storage** → `license-photos` bucket
2. Click **Policies** tab
3. Add the following policies:

**Policy 1: Users can upload their own images**
```sql
CREATE POLICY "Users can upload own license images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'license-photos' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

**Policy 2: Users can view their own images**
```sql
CREATE POLICY "Users can view own license images"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'license-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

**Policy 3: Users can delete their own images**
```sql
CREATE POLICY "Users can delete own license images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'license-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
```

**Policy 4: Public read access (if needed)**
```sql
CREATE POLICY "Public can view license images"
ON storage.objects FOR SELECT
USING (bucket_id = 'license-photos');
```

## Step 3: Usage in Application

### Automatic Upload (Recommended)

The `licenceService` now automatically handles image uploads:

```typescript
import { upsertDriverLicence } from './services/licenceService';

// Just provide base64 data URL or regular URL
const licence = {
  user_id: currentUserId,
  licence_number: 'DL123456',
  expiry_date: '2025-12-31',
  front_image_url: 'data:image/png;base64,...', // Automatically uploaded
  back_image_url: 'data:image/png;base64,...',  // Automatically uploaded
  is_verified: false,
  verification_status: 'pending'
};

const success = await upsertDriverLicence(licence);
```

**What happens automatically:**
1. ✅ Detects base64 data URLs
2. ✅ Deletes old images (if any)
3. ✅ Uploads new images to Supabase Storage
4. ✅ Replaces base64 with storage URLs
5. ✅ Saves to database

### Manual Upload (Advanced)

For more control, use the storage service directly:

```typescript
import { uploadLicenseImage, uploadLicenseImageFromDataURL } from './services/storageService';

// Upload from File object
const frontUrl = await uploadLicenseImage(file, userId, 'front');

// Upload from base64 data URL
const backUrl = await uploadLicenseImageFromDataURL(dataUrl, userId, 'back');
```

## File Organization

Files are organized by user ID:

```
license-photos/
  └── 6d8ba943-b384-4c78-959e-bb042a53f4d7/  (user_id)
      ├── front-1700000000000.jpg
      └── back-1700000000000.jpg
```

Benefits:
- Easy to find all images for a specific user
- Automatic cleanup when deleting user
- Prevents filename conflicts

## Benefits of This Approach

| Aspect | Before (Base64 in DB) | After (Supabase Storage) |
|--------|----------------------|--------------------------|
| **Database Size** | ~1.5 MB per record | ~100 bytes per record |
| **Query Speed** | Slow (loading large data) | Fast (loading URLs only) |
| **Image Loading** | Slow (embedded in JSON) | Fast (CDN delivery) |
| **Scalability** | Poor (DB grows quickly) | Excellent (separate storage) |
| **Bandwidth** | High (always load images) | Optimized (load on demand) |
| **Caching** | Difficult | Easy (CDN caching) |

## Migration Notes

**Existing Data Cleaned:**
- All base64 data has been cleared from the database
- Image URLs are now NULL for existing records
- Users will need to re-upload their license photos

**No Data Loss for New Uploads:**
- All new license photo uploads automatically use Supabase Storage
- Old images are automatically replaced when users update

## Troubleshooting

### Images not uploading?

1. **Check bucket exists:**
   ```sql
   SELECT name, public FROM storage.buckets WHERE name = 'license-photos';
   ```

2. **Check storage policies:**
   ```sql
   SELECT * FROM storage.policies WHERE bucket_id = 'license-photos';
   ```

3. **Check console errors:**
   - Open browser DevTools → Console
   - Look for Supabase Storage errors

### Images showing as broken?

1. **Verify public access:**
   - Bucket must be marked as "public"
   - Or use signed URLs for private access

2. **Check URL format:**
   ```
   https://{project-ref}.supabase.co/storage/v1/object/public/license-photos/{user-id}/{filename}
   ```

3. **CORS issues:**
   - Ensure your domain is allowed in Supabase settings

## Best Practices

1. ✅ **Always use Supabase Storage** for images, never store base64 in database
2. ✅ **Set file size limits** (currently 5 MB) to prevent abuse
3. ✅ **Use RLS policies** to ensure users can only access their own images
4. ✅ **Delete old images** before uploading new ones (prevents storage bloat)
5. ✅ **Use timestamps in filenames** to prevent conflicts and enable versioning
6. ✅ **Organize by user ID** for easy management and cleanup
7. ✅ **Validate file types** on both client and server side

## API Reference

### storageService.ts

- `uploadLicenseImage(file, userId, type)` - Upload image file
- `uploadLicenseImageFromDataURL(dataUrl, userId, type)` - Upload from base64
- `deleteLicenseImage(imageUrl)` - Delete by URL
- `deleteOldLicenseImages(userId, type)` - Delete old user images
- `ensureBucketExists()` - Create bucket if missing

### licenceService.ts

- `upsertDriverLicence(licence)` - Save license (auto-uploads images)
- `getDriverLicence(userId)` - Get license with image URLs
- All other existing functions work the same

## Support

For issues or questions:
- Check Supabase Storage docs: https://supabase.com/docs/guides/storage
- Review storage policies in dashboard
- Check browser console for errors
