import { supabase, handleSupabaseError } from './supabaseClient';

/**
 * Legal Service
 * Handles legal documents (Terms, Privacy, Cancellation policies)
 */

export interface LegalDocument {
  id: string;
  document_type: 'terms' | 'privacy' | 'cancellation' | 'refund';
  title: string;
  content: string;
  version: string;
  effective_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserAgreementAcceptance {
  id: string;
  user_id: string;
  document_id: string;
  document_type: string;
  accepted_version: string;
  accepted_at: string;
  ip_address?: string;
  user_agent?: string;
}

/**
 * Get active legal document by type
 */
export async function getLegalDocument(
  documentType: 'terms' | 'privacy' | 'cancellation' | 'refund'
): Promise<LegalDocument | null> {
  try {
    const { data, error } = await supabase
      .from('legal_documents')
      .select('*')
      .eq('document_type', documentType)
      .eq('is_active', true)
      .order('effective_date', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      // If no document found, return null instead of throwing
      if (error.code === 'PGRST116') {
        console.warn(`No active ${documentType} document found`);
        return null;
      }
      throw error;
    }

    return data;
  } catch (error) {
    handleSupabaseError(error, `Failed to fetch ${documentType} document`);
    return null;
  }
}

/**
 * Get all active legal documents
 */
export async function getAllLegalDocuments(): Promise<LegalDocument[]> {
  try {
    const { data, error } = await supabase
      .from('legal_documents')
      .select('*')
      .eq('is_active', true)
      .order('document_type', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleSupabaseError(error, 'Failed to fetch legal documents');
    return [];
  }
}

/**
 * Record user acceptance of a legal document
 */
export async function acceptLegalDocument(
  userId: string,
  documentId: string,
  documentType: string,
  version: string
): Promise<boolean> {
  try {
    // Get user's IP and user agent (optional)
    const userAgent = navigator.userAgent;

    const { error } = await supabase
      .from('user_agreement_acceptances')
      .upsert(
        {
          user_id: userId,
          document_id: documentId,
          document_type: documentType,
          accepted_version: version,
          accepted_at: new Date().toISOString(),
          user_agent: userAgent,
        },
        {
          onConflict: 'user_id,document_id',
        }
      );

    if (error) throw error;
    return true;
  } catch (error) {
    handleSupabaseError(error, 'Failed to record document acceptance');
    return false;
  }
}

/**
 * Check if user has accepted a specific document
 */
export async function hasUserAcceptedDocument(
  userId: string,
  documentType: string
): Promise<boolean> {
  try {
    // Get the latest active document
    const document = await getLegalDocument(documentType as any);
    if (!document) return false;

    // Check if user has accepted this version
    const { data, error } = await supabase
      .from('user_agreement_acceptances')
      .select('accepted_version')
      .eq('user_id', userId)
      .eq('document_id', document.id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return false; // No acceptance record found
      }
      throw error;
    }

    // Check if accepted version matches current version
    return data.accepted_version === document.version;
  } catch (error) {
    console.error('Error checking document acceptance:', error);
    return false;
  }
}

/**
 * Get user's acceptance history
 */
export async function getUserAcceptanceHistory(
  userId: string
): Promise<UserAgreementAcceptance[]> {
  try {
    const { data, error } = await supabase
      .from('user_agreement_acceptances')
      .select('*')
      .eq('user_id', userId)
      .order('accepted_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleSupabaseError(error, 'Failed to fetch acceptance history');
    return [];
  }
}

/**
 * Get Terms & Conditions
 */
export async function getTermsAndConditions(): Promise<LegalDocument | null> {
  return getLegalDocument('terms');
}

/**
 * Get Cancellation Policy
 */
export async function getCancellationPolicy(): Promise<LegalDocument | null> {
  return getLegalDocument('cancellation');
}

/**
 * Get Privacy Policy
 */
export async function getPrivacyPolicy(): Promise<LegalDocument | null> {
  return getLegalDocument('privacy');
}

/**
 * Accept Terms & Conditions
 */
export async function acceptTermsAndConditions(userId: string): Promise<boolean> {
  const document = await getTermsAndConditions();
  if (!document) return false;
  
  return acceptLegalDocument(userId, document.id, 'terms', document.version);
}

/**
 * Accept Cancellation Policy
 */
export async function acceptCancellationPolicy(userId: string): Promise<boolean> {
  const document = await getCancellationPolicy();
  if (!document) return false;
  
  return acceptLegalDocument(userId, document.id, 'cancellation', document.version);
}
