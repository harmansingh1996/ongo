import { supabase } from './supabaseClient';

/**
 * Issue Service
 * Handles issue reporting and SOS emergency operations
 */

export interface ReportIssue {
  id: string;
  user_id: string;
  user_type: 'driver' | 'rider';
  issue_type: string;
  title: string;
  description: string;
  ride_id?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  attachment_url?: string;
  resolved_at?: string;
  resolved_by?: string;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface SOSEmergency {
  id: string;
  user_id: string;
  user_type: 'driver' | 'rider';
  ride_id?: string;
  emergency_type: string;
  location_lat?: number;
  location_lng?: number;
  location_address?: string;
  description?: string;
  contact_phone?: string;
  status: 'active' | 'responded' | 'resolved' | 'cancelled';
  responded_at?: string;
  responded_by?: string;
  response_notes?: string;
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Submit a new issue report
 */
export async function submitIssue(
  userId: string,
  userType: 'driver' | 'rider',
  issueType: string,
  title: string,
  description: string,
  rideId?: string,
  priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('report_issues')
      .insert({
        user_id: userId,
        user_type: userType,
        issue_type: issueType,
        title,
        description,
        ride_id: rideId || null,
        status: 'open',
        priority,
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error submitting issue:', error);
    return false;
  }
}

/**
 * Get user's reported issues
 */
export async function getUserIssues(userId: string): Promise<ReportIssue[]> {
  try {
    const { data, error } = await supabase
      .from('report_issues')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching user issues:', error);
    return [];
  }
}

/**
 * Create an SOS emergency alert
 */
export async function createSOSEmergency(
  userId: string,
  userType: 'driver' | 'rider',
  emergencyType: string,
  location?: { lat: number; lng: number; address?: string },
  description?: string,
  contactPhone?: string,
  rideId?: string
): Promise<{ success: boolean; emergencyId?: string }> {
  try {
    const { data, error } = await supabase
      .from('sos_emergencies')
      .insert({
        user_id: userId,
        user_type: userType,
        emergency_type: emergencyType,
        location_lat: location?.lat || null,
        location_lng: location?.lng || null,
        location_address: location?.address || null,
        description: description || null,
        contact_phone: contactPhone || null,
        ride_id: rideId || null,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, emergencyId: data?.id };
  } catch (error) {
    console.error('Error creating SOS emergency:', error);
    return { success: false };
  }
}

/**
 * Cancel an active SOS emergency
 */
export async function cancelSOSEmergency(emergencyId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('sos_emergencies')
      .update({
        status: 'cancelled',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', emergencyId);

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Error cancelling SOS emergency:', error);
    return false;
  }
}

/**
 * Get user's SOS emergencies
 */
export async function getUserSOSEmergencies(userId: string): Promise<SOSEmergency[]> {
  try {
    const { data, error } = await supabase
      .from('sos_emergencies')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error fetching SOS emergencies:', error);
    return [];
  }
}

/**
 * Get active SOS emergency for user
 */
export async function getActiveSOSEmergency(userId: string): Promise<SOSEmergency | null> {
  try {
    const { data, error } = await supabase
      .from('sos_emergencies')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows returned
    return data || null;
  } catch (error) {
    console.error('Error fetching active SOS emergency:', error);
    return null;
  }
}
