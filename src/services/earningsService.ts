import { supabase, handleSupabaseError } from './supabaseClient';
import { createNotification } from './notificationService';

/**
 * Earnings Service
 * Handles driver earnings and payout operations with Supabase
 */

export interface DriverEarning {
  id: string;
  driver_id: string;
  ride_id: string;
  booking_id: string | null;
  amount: number; // Gross amount from ride
  platform_fee: number; // 15% platform service fee
  net_amount: number; // Amount driver receives after fee
  status: 'pending' | 'paid' | 'processing';
  date: string;
  payout_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayoutMethod {
  id: string;
  driver_id: string;
  bank_name: string;
  account_holder_name: string;
  institution_number: string;
  transit_number: string;
  account_number: string; // Last 4 digits only for display
  is_default: boolean;
  is_verified: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreatePayoutMethodData {
  bank_name: string;
  account_holder_name: string;
  institution_number: string;
  transit_number: string;
  account_number: string;
  is_default?: boolean;
}

export interface EarningsSummary {
  totalEarnings: number; // Total gross earnings
  totalNetEarnings: number; // Total after platform fees
  totalPlatformFees: number; // Total platform fees deducted
  thisMonthEarnings: number; // This month gross
  thisMonthNetEarnings: number; // This month after fees
  thisWeekEarnings: number; // This week gross
  thisWeekNetEarnings: number; // This week after fees
  pendingEarnings: number;
  paidEarnings: number;
}

// Platform service fee percentage
const PLATFORM_FEE_PERCENTAGE = 0.15; // 15%

/**
 * Calculate platform fee and net amount from gross amount
 */
function calculateEarningsBreakdown(grossAmount: number): {
  gross: number;
  platformFee: number;
  net: number;
} {
  const platformFee = grossAmount * PLATFORM_FEE_PERCENTAGE;
  const net = grossAmount - platformFee;
  return {
    gross: grossAmount,
    platformFee,
    net,
  };
}

/**
 * Get driver's earnings history with platform fee calculation
 */
export async function getDriverEarnings(
  driverId: string,
  filter?: 'all' | 'paid' | 'pending'
): Promise<DriverEarning[]> {
  try {
    let query = supabase
      .from('driver_earnings')
      .select('*')
      .eq('driver_id', driverId)
      .order('date', { ascending: false });

    if (filter && filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data, error } = await query;

    if (error) throw error;
    
    // Calculate platform fee and net amount for each earning
    const earningsWithFees = (data || []).map((earning) => {
      const grossAmount = parseFloat(earning.amount.toString());
      const breakdown = calculateEarningsBreakdown(grossAmount);
      
      return {
        ...earning,
        amount: breakdown.gross,
        platform_fee: breakdown.platformFee,
        net_amount: breakdown.net,
      };
    });
    
    return earningsWithFees;
  } catch (error) {
    handleSupabaseError(error, 'Failed to fetch driver earnings');
    return [];
  }
}

/**
 * Get earnings summary for a driver with platform fees
 */
export async function getEarningsSummary(driverId: string): Promise<EarningsSummary> {
  try {
    const { data, error } = await supabase
      .from('driver_earnings')
      .select('amount, status, date')
      .eq('driver_id', driverId);

    if (error) throw error;

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Calculate the start of the current week (Sunday)
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const summary = (data || []).reduce(
      (acc, earning) => {
        const earningDate = new Date(earning.date);
        const grossAmount = parseFloat(earning.amount.toString());
        const breakdown = calculateEarningsBreakdown(grossAmount);

        // Always include in total earnings (both pending and paid)
        acc.totalEarnings += breakdown.gross;
        acc.totalNetEarnings += breakdown.net;
        acc.totalPlatformFees += breakdown.platformFee;

        if (earning.status === 'paid') {
          acc.paidEarnings += breakdown.net;
        } else if (earning.status === 'pending') {
          acc.pendingEarnings += breakdown.net;
        }

        // This month calculation
        if (
          earningDate.getMonth() === currentMonth &&
          earningDate.getFullYear() === currentYear
        ) {
          acc.thisMonthEarnings += breakdown.gross;
          acc.thisMonthNetEarnings += breakdown.net;
        }

        // This week calculation (Sunday to Saturday)
        if (earningDate >= startOfWeek) {
          acc.thisWeekEarnings += breakdown.gross;
          acc.thisWeekNetEarnings += breakdown.net;
        }

        return acc;
      },
      {
        totalEarnings: 0,
        totalNetEarnings: 0,
        totalPlatformFees: 0,
        thisMonthEarnings: 0,
        thisMonthNetEarnings: 0,
        thisWeekEarnings: 0,
        thisWeekNetEarnings: 0,
        pendingEarnings: 0,
        paidEarnings: 0,
      }
    );

    return summary;
  } catch (error) {
    handleSupabaseError(error, 'Failed to fetch earnings summary');
    return {
      totalEarnings: 0,
      totalNetEarnings: 0,
      totalPlatformFees: 0,
      thisMonthEarnings: 0,
      thisMonthNetEarnings: 0,
      thisWeekEarnings: 0,
      thisWeekNetEarnings: 0,
      pendingEarnings: 0,
      paidEarnings: 0,
    };
  }
}

/**
 * Create earning record for a ride
 */
export async function createEarning(
  driverId: string,
  rideId: string,
  amount: number,
  bookingId?: string
): Promise<boolean> {
  try {
    // Calculate platform fee and net amount
    const breakdown = calculateEarningsBreakdown(amount);
    
    const { error } = await supabase.from('driver_earnings').insert({
      driver_id: driverId,
      ride_id: rideId,
      booking_id: bookingId || null,
      amount: breakdown.gross,
      platform_fee: breakdown.platformFee,
      net_amount: breakdown.net,
      status: 'pending',
      date: new Date().toISOString(),
    });

    if (error) throw error;

    // Send payment notification to driver
    await createNotification({
      userId: driverId,
      type: 'payment_received',
      title: 'Payment Received',
      message: `You earned $${breakdown.net.toFixed(2)} from your ride (after 15% platform fee).`,
      rideId: rideId,
      bookingId: bookingId,
      metadata: {
        gross_amount: breakdown.gross,
        platform_fee: breakdown.platformFee,
        net_amount: breakdown.net,
      },
      actionUrl: '/driver/earnings'
    });

    return true;
  } catch (error) {
    handleSupabaseError(error, 'Failed to create earning record');
    return false;
  }
}

/**
 * Get driver's payout methods
 */
export async function getPayoutMethods(driverId: string): Promise<PayoutMethod[]> {
  try {
    const { data, error } = await supabase
      .from('payout_methods')
      .select('*')
      .eq('driver_id', driverId)
      .order('is_default', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    handleSupabaseError(error, 'Failed to fetch payout methods');
    return [];
  }
}

/**
 * Create or update payout method
 */
export async function savePayoutMethod(
  driverId: string,
  methodData: CreatePayoutMethodData
): Promise<boolean> {
  try {
    // Check if driver already has a payout method
    const { data: existing } = await supabase
      .from('payout_methods')
      .select('id')
      .eq('driver_id', driverId)
      .single();

    // Mask account number for storage (store last 4 digits only)
    const maskedAccountNumber = methodData.account_number.slice(-4);

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from('payout_methods')
        .update({
          bank_name: methodData.bank_name,
          account_holder_name: methodData.account_holder_name,
          institution_number: methodData.institution_number,
          transit_number: methodData.transit_number,
          account_number: maskedAccountNumber,
          is_default: methodData.is_default ?? true,
        })
        .eq('id', existing.id);

      if (error) throw error;
    } else {
      // Create new
      const { error } = await supabase.from('payout_methods').insert({
        driver_id: driverId,
        bank_name: methodData.bank_name,
        account_holder_name: methodData.account_holder_name,
        institution_number: methodData.institution_number,
        transit_number: methodData.transit_number,
        account_number: maskedAccountNumber,
        is_default: methodData.is_default ?? true,
        is_verified: false,
      });

      if (error) throw error;
    }

    return true;
  } catch (error) {
    handleSupabaseError(error, 'Failed to save payout method');
    return false;
  }
}

/**
 * Delete payout method
 */
export async function deletePayoutMethod(methodId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('payout_methods')
      .delete()
      .eq('id', methodId);

    if (error) throw error;
    return true;
  } catch (error) {
    handleSupabaseError(error, 'Failed to delete payout method');
    return false;
  }
}
