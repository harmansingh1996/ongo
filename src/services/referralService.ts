import { supabase } from './supabaseClient';

/**
 * Referral Service
 * Handles referral program functionality with Supabase
 */

export interface Referral {
  id: string;
  user_id: string;
  referral_code: string;
  discount_percent: number;
  total_referrals: number;
  total_earned: number;
  created_at: string;
  updated_at: string;
}

export interface ReferralUse {
  id: string;
  referral_code: string;
  referrer_id: string;
  referred_user_id: string;
  discount_applied: number;
  status: 'pending' | 'used' | 'expired';
  used_at: string | null;
  created_at: string;
}

/**
 * Generate a unique referral code for a user
 */
function generateReferralCode(userName: string, userId: string): string {
  const namePrefix = userName.substring(0, 3).toUpperCase();
  const uniquePart = userId.substring(0, 6).toUpperCase();
  return `${namePrefix}${uniquePart}`;
}

/**
 * Get or create user's referral code
 */
export async function getUserReferral(userId: string, userName: string): Promise<Referral | null> {
  try {
    // Check if user already has a referral code
    const { data: existing, error: fetchError } = await supabase
      .from('referrals')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (existing) {
      return existing;
    }

    // Create new referral code if none exists
    const referralCode = generateReferralCode(userName, userId);
    
    const { data, error } = await supabase
      .from('referrals')
      .insert([
        {
          user_id: userId,
          referral_code: referralCode,
          discount_percent: 10,
          total_referrals: 0,
          total_earned: 0,
        },
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Error getting/creating referral:', error);
    return null;
  }
}

/**
 * Get pending referral discount for a user
 * Checks if user has a pending 10% discount either as:
 * 1. Referred user (used someone's referral code) - status = 'pending'
 * 2. Referrer (someone used their code) - referrer_discount_status = 'pending'
 * 
 * Returns the referral_use record with discount type information
 */
export async function getPendingReferralForUser(
  userId: string
): Promise<(ReferralUse & { discountType?: 'referred' | 'referrer' }) | null> {
  try {
    // Check if user is the referred user (used someone's code)
    const { data: asReferred, error: referredError } = await supabase
      .from('referral_uses')
      .select('*')
      .eq('referred_user_id', userId)
      .eq('status', 'pending')
      .single();

    if (asReferred) {
      return { ...asReferred, discountType: 'referred' };
    }

    // Check if user is the referrer (someone used their code)
    const { data: asReferrer, error: referrerError } = await supabase
      .from('referral_uses')
      .select('*')
      .eq('referrer_id', userId)
      .eq('referrer_discount_status', 'pending')
      .single();

    if (asReferrer) {
      return { ...asReferrer, discountType: 'referrer' };
    }

    // No pending discount found
    return null;
  } catch (error) {
    console.error('Error getting pending referral:', error);
    return null;
  }
}

/**
 * Apply a referral code when a new user signs up
 */
export async function applyReferralCode(
  referralCode: string,
  newUserId: string
): Promise<boolean> {
  try {
    // Find the referral
    const { data: referral, error: referralError } = await supabase
      .from('referrals')
      .select('*')
      .eq('referral_code', referralCode)
      .single();

    if (referralError || !referral) {
      console.error('Invalid referral code');
      return false;
    }

    // Prevent self-referral
    if (referral.user_id === newUserId) {
      console.error('Cannot use your own referral code');
      return false;
    }

    // Create referral use record
    const { error: useError } = await supabase
      .from('referral_uses')
      .insert([
        {
          referral_code: referralCode,
          referrer_id: referral.user_id,
          referred_user_id: newUserId,
          status: 'pending',
        },
      ]);

    if (useError) throw useError;

    // Update referral stats
    const { error: updateError } = await supabase
      .from('referrals')
      .update({
        total_referrals: referral.total_referrals + 1,
      })
      .eq('id', referral.id);

    if (updateError) throw updateError;

    return true;
  } catch (error) {
    console.error('Error applying referral code:', error);
    return false;
  }
}

/**
 * Get user's referral statistics
 */
export async function getReferralStats(userId: string): Promise<{
  totalReferrals: number;
  totalEarned: number;
  pendingReferrals: number;
} | null> {
  try {
    const { data: referral } = await supabase
      .from('referrals')
      .select('total_referrals, total_earned')
      .eq('user_id', userId)
      .single();

    if (!referral) return null;

    const { count } = await supabase
      .from('referral_uses')
      .select('*', { count: 'exact', head: true })
      .eq('referrer_id', userId)
      .eq('status', 'pending');

    return {
      totalReferrals: referral.total_referrals,
      totalEarned: referral.total_earned,
      pendingReferrals: count || 0,
    };
  } catch (error) {
    console.error('Error getting referral stats:', error);
    return null;
  }
}

/**
 * Get list of users referred by this user
 */
export async function getReferredUsers(userId: string): Promise<ReferralUse[]> {
  try {
    const { data, error } = await supabase
      .from('referral_uses')
      .select('*')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting referred users:', error);
    return [];
  }
}

/**
 * Mark a referral as used (when referred user makes first purchase)
 * This triggers automatic reward: referrer gets 10% discount for their next ride
 * 
 * @param referralUseId - The referral_uses record ID
 * @param discountApplied - Amount of discount the referred user received
 * @param discountType - Whether this is for 'referred' user or 'referrer' user
 */
export async function markReferralUsed(
  referralUseId: string,
  discountApplied: number,
  discountType: 'referred' | 'referrer' = 'referred'
): Promise<boolean> {
  try {
    if (discountType === 'referred') {
      // Referred user used their discount on first ride
      const { error } = await supabase
        .from('referral_uses')
        .update({
          status: 'used',
          discount_applied: discountApplied,
          used_at: new Date().toISOString(),
        })
        .eq('id', referralUseId);

      if (error) throw error;
      
      // Database trigger will set referrer_discount_status = 'pending'
      console.log('✅ Referral marked as used - referrer will get 10% discount on next ride');
    } else {
      // Referrer used their discount reward
      const { error } = await supabase
        .from('referral_uses')
        .update({
          referrer_discount_status: 'used',
          referrer_discount_used_at: new Date().toISOString(),
        })
        .eq('id', referralUseId);

      if (error) throw error;
      
      console.log('✅ Referrer discount marked as used');
    }
    
    return true;
  } catch (error) {
    console.error('Error marking referral as used:', error);
    return false;
  }
}

/**
 * Get referral balance details
 */
export async function getReferralBalance(userId: string): Promise<{
  availableBalance: number;
  pendingBalance: number;
  totalEarned: number;
  totalRedeemed: number;
} | null> {
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select('available_balance, pending_balance, total_earned, total_redeemed')
      .eq('user_id', userId)
      .single();

    if (error) throw error;
    
    return {
      availableBalance: parseFloat(data.available_balance || '0'),
      pendingBalance: parseFloat(data.pending_balance || '0'),
      totalEarned: parseFloat(data.total_earned || '0'),
      totalRedeemed: parseFloat(data.total_redeemed || '0'),
    };
  } catch (error) {
    console.error('Error getting referral balance:', error);
    return null;
  }
}

/**
 * Request redemption of referral rewards
 */
export async function requestRedemption(
  userId: string,
  amount: number,
  method: 'bank_transfer' | 'wallet' | 'ride_credit',
  bankInfo?: any,
  walletAddress?: string
): Promise<{ success: boolean; redemptionId?: string; error?: string }> {
  try {
    // Call database function to create redemption request
    const { data, error } = await supabase.rpc('request_referral_redemption', {
      p_user_id: userId,
      p_amount: amount,
      p_redemption_method: method,
      p_bank_info: bankInfo || null,
      p_wallet_address: walletAddress || null,
    });

    if (error) throw error;
    
    return {
      success: true,
      redemptionId: data,
    };
  } catch (error: any) {
    console.error('Error requesting redemption:', error);
    return {
      success: false,
      error: error.message || 'Failed to request redemption',
    };
  }
}

/**
 * Get user's redemption history
 */
export async function getRedemptionHistory(userId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('referral_redemptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting redemption history:', error);
    return [];
  }
}

/**
 * Get referral transaction history
 */
export async function getTransactionHistory(userId: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('referral_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error getting transaction history:', error);
    return [];
  }
}
