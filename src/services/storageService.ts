import { supabase } from './supabaseClient';

/**
 * Storage Service for Supabase Storage
 * Handles image uploads and management for driver licenses
 */

const BUCKET_NAME = 'license-photos';

/**
 * Upload image to Supabase Storage
 * @param file - File object or Blob to upload
 * @param userId - User ID for organizing files
 * @param type - 'front' or 'back' for license side
 * @returns Public URL of uploaded image or null on error
 */
export async function uploadLicenseImage(
  file: File | Blob,
  userId: string,
  type: 'front' | 'back'
): Promise<string | null> {
  try {
    // Generate unique file name with timestamp
    const timestamp = Date.now();
    const extension = file instanceof File ? file.name.split('.').pop() : 'jpg';
    const filePath = `${userId}/${type}-${timestamp}.${extension}`;

    // Upload file to Supabase Storage
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false, // Prevent overwriting existing files
      });

    if (error) {
      console.error('Error uploading image to storage:', error);
      return null;
    }

    // Get public URL for the uploaded file
    const { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(data.path);

    return publicUrl;
  } catch (error) {
    console.error('Error in uploadLicenseImage:', error);
    return null;
  }
}

/**
 * Upload image from base64 data URL
 * @param dataUrl - Base64 data URL (e.g., 'data:image/png;base64,...')
 * @param userId - User ID for organizing files
 * @param type - 'front' or 'back' for license side
 * @returns Public URL of uploaded image or null on error
 */
export async function uploadLicenseImageFromDataURL(
  dataUrl: string,
  userId: string,
  type: 'front' | 'back'
): Promise<string | null> {
  try {
    // Convert data URL to Blob
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Upload using the main upload function
    return await uploadLicenseImage(blob, userId, type);
  } catch (error) {
    console.error('Error converting data URL to blob:', error);
    return null;
  }
}

/**
 * Delete license image from storage
 * @param imageUrl - Public URL of the image to delete
 * @returns true if deleted successfully, false otherwise
 */
export async function deleteLicenseImage(imageUrl: string): Promise<boolean> {
  try {
    // Extract file path from public URL
    const url = new URL(imageUrl);
    const pathMatch = url.pathname.match(new RegExp(`${BUCKET_NAME}/(.+)$`));
    
    if (!pathMatch) {
      console.error('Invalid image URL format');
      return false;
    }

    const filePath = pathMatch[1];

    // Delete file from storage
    const { error } = await supabase.storage
      .from(BUCKET_NAME)
      .remove([filePath]);

    if (error) {
      console.error('Error deleting image from storage:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteLicenseImage:', error);
    return false;
  }
}

/**
 * Delete old license images for a user (cleanup before upload)
 * @param userId - User ID
 * @param type - 'front', 'back', or 'both'
 * @returns true if deleted successfully, false otherwise
 */
export async function deleteOldLicenseImages(
  userId: string,
  type: 'front' | 'back' | 'both' = 'both'
): Promise<boolean> {
  try {
    // List all files for this user
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list(userId);

    if (listError) {
      console.error('Error listing user files:', listError);
      return false;
    }

    if (!files || files.length === 0) {
      return true; // No files to delete
    }

    // Filter files based on type
    const filesToDelete = files
      .filter((file) => {
        if (type === 'both') return true;
        return file.name.startsWith(`${type}-`);
      })
      .map((file) => `${userId}/${file.name}`);

    if (filesToDelete.length === 0) {
      return true; // No matching files
    }

    // Delete filtered files
    const { error: deleteError } = await supabase.storage
      .from(BUCKET_NAME)
      .remove(filesToDelete);

    if (deleteError) {
      console.error('Error deleting old images:', deleteError);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error in deleteOldLicenseImages:', error);
    return false;
  }
}

/**
 * Create the storage bucket if it doesn't exist
 * This should be run once during setup
 * NOTE: Bucket creation requires service role key, typically done via Supabase Dashboard
 */
export async function ensureBucketExists(): Promise<boolean> {
  try {
    // Check if bucket exists
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();

    if (listError) {
      console.error('Error listing buckets:', listError);
      return false;
    }

    const bucketExists = buckets?.some((b) => b.name === BUCKET_NAME);

    if (bucketExists) {
      console.log(`Bucket '${BUCKET_NAME}' already exists`);
      return true;
    }

    // Create bucket (requires service role - typically done via Dashboard)
    const { error: createError } = await supabase.storage.createBucket(BUCKET_NAME, {
      public: true,
      fileSizeLimit: 5242880, // 5MB limit
      allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
    });

    if (createError) {
      console.error('Error creating bucket:', createError);
      console.warn('Bucket creation typically requires admin privileges. Please create it via Supabase Dashboard.');
      return false;
    }

    console.log(`Bucket '${BUCKET_NAME}' created successfully`);
    return true;
  } catch (error) {
    console.error('Error in ensureBucketExists:', error);
    return false;
  }
}
