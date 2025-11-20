import { supabase, handleSupabaseError } from './supabaseClient';
import { uploadLicenseImage, uploadLicenseImageFromDataURL, deleteOldLicenseImages } from './storageService';

/**
 * Licence Service
 * Handles all driver licence operations with Supabase
 */

export interface DriverLicence {
  id?: string;
  user_id: string;
  licence_number: string;
  expiry_date: string;
  issuing_country?: string;
  issuing_state?: string;
  licence_class?: string;
  front_image_url?: string;
  back_image_url?: string;
  is_verified: boolean;
  verification_status: 'pending' | 'verified' | 'rejected';
  verification_notes?: string;
  verified_at?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Get driver's licence information
 */
export async function getDriverLicence(userId: string): Promise<DriverLicence | null> {
  try {
    const { data, error } = await supabase
      .from('driver_licenses')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      // If no licence found, return null (not an error)
      if (error.code === 'PGRST116') {
        return null;
      }
      handleSupabaseError(error);
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching driver licence:', error);
    return null;
  }
}

/**
 * Create or update driver licence
 * Handles image uploads to Supabase Storage automatically
 */
export async function upsertDriverLicence(licence: DriverLicence): Promise<boolean> {
  try {
    // Validate required fields (NOT NULL constraints in database)
    if (!licence.licence_number || !licence.licence_number.trim()) {
      console.error('Error upserting driver licence: licence_number is required');
      return false;
    }

    if (!licence.expiry_date || !licence.expiry_date.trim()) {
      console.error('Error upserting driver licence: expiry_date is required');
      return false;
    }

    // Handle image uploads if base64 data is provided
    let frontImageUrl = licence.front_image_url || null;
    let backImageUrl = licence.back_image_url || null;

    // Check if front image is base64 and upload to storage
    if (frontImageUrl && frontImageUrl.startsWith('data:image')) {
      console.log('Uploading front image to Supabase Storage...');
      // Delete old front image first
      await deleteOldLicenseImages(licence.user_id, 'front');
      // Upload new image
      const uploadedUrl = await uploadLicenseImageFromDataURL(
        frontImageUrl,
        licence.user_id,
        'front'
      );
      if (uploadedUrl) {
        frontImageUrl = uploadedUrl;
      } else {
        console.error('Failed to upload front image, proceeding without it');
        frontImageUrl = null;
      }
    }

    // Check if back image is base64 and upload to storage
    if (backImageUrl && backImageUrl.startsWith('data:image')) {
      console.log('Uploading back image to Supabase Storage...');
      // Delete old back image first
      await deleteOldLicenseImages(licence.user_id, 'back');
      // Upload new image
      const uploadedUrl = await uploadLicenseImageFromDataURL(
        backImageUrl,
        licence.user_id,
        'back'
      );
      if (uploadedUrl) {
        backImageUrl = uploadedUrl;
      } else {
        console.error('Failed to upload back image, proceeding without it');
        backImageUrl = null;
      }
    }

    const licenceData = {
      user_id: licence.user_id,
      licence_number: licence.licence_number.trim(),
      expiry_date: licence.expiry_date,
      issuing_country: licence.issuing_country || null,
      issuing_state: licence.issuing_state || null,
      licence_class: licence.licence_class || null,
      front_image_url: frontImageUrl,
      back_image_url: backImageUrl,
      is_verified: licence.is_verified || false,
      verification_status: licence.verification_status || 'pending',
      verification_notes: licence.verification_notes || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('driver_licenses')
      .upsert(licenceData, {
        onConflict: 'user_id',
      });

    if (error) {
      handleSupabaseError(error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error upserting driver licence:', error);
    return false;
  }
}

/**
 * Check if driver has verified licence
 */
export async function hasVerifiedLicence(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('driver_licenses')
      .select('is_verified')
      .eq('user_id', userId)
      .single();

    if (error) {
      return false;
    }

    return data?.is_verified || false;
  } catch (error) {
    console.error('Error checking licence verification:', error);
    return false;
  }
}

/**
 * Check if licence is expiring soon (within 30 days)
 */
export function isLicenceExpiringSoon(expiryDate: string): boolean {
  const expiry = new Date(expiryDate);
  const now = new Date();
  const daysUntilExpiry = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
}

/**
 * Check if licence is expired
 */
export function isLicenceExpired(expiryDate: string): boolean {
  const expiry = new Date(expiryDate);
  const now = new Date();
  
  return expiry < now;
}

/**
 * Get days until licence expiry
 */
export function getDaysUntilExpiry(expiryDate: string): number {
  const expiry = new Date(expiryDate);
  const now = new Date();
  
  return Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Submit licence for verification
 * This marks the licence as pending verification
 */
export async function submitLicenceForVerification(userId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('driver_licenses')
      .update({
        verification_status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (error) {
      handleSupabaseError(error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error submitting licence for verification:', error);
    return false;
  }
}
