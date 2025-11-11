import { supabase } from './supabase';
import { Earning, PayoutMethod, PayoutRequest } from '../types';

const buildStripeApiUrl = (endpoint: string) => {
  const rawBase = import.meta.env.VITE_BACKEND_API_URL?.trim();
  let base = rawBase ? rawBase.replace(/\/$/, '') : '';

  if (!base) {
    base = '/api/stripe';
  } else if (base.includes('/api/stripe')) {
    // Already scoped to the Stripe namespace
  } else if (base.endsWith('/api')) {
    base = `${base}/stripe`;
  } else if (base.includes('/api')) {
    base = `${base}/stripe`;
  } else {
    base = `${base}/api/stripe`;
  }

  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${normalizedEndpoint}`;
};

const buildAuthHeaders = async (extraHeaders: Record<string, string> = {}) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error('Authentication required. Please sign in again.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${accessToken}`,
    ...extraHeaders,
  } satisfies HeadersInit;
};

export interface EarningsStats {
  totalEarnings: number; // Net earnings after service fee
  totalGrossEarnings: number; // Gross earnings before service fee
  totalServiceFees: number; // Total service fees deducted
  thisMonth: number;
  pendingPayouts: number; // Available for payout (not yet requested)
  completedRides: number;
  thisWeek: number;
  lastMonth: number;
}

export class EarningsService {
  /**
   * Fetch driver earnings from the earnings table
   */
  static async fetchDriverEarnings(driverId: string): Promise<EarningsStats> {
    try {
      // Fetch all earnings for the driver
      const { data: earnings, error } = await supabase
        .from('earnings')
        .select('*')
        .eq('driver_id', driverId)
        .order('earning_date', { ascending: false });

      if (error) {
        console.error('Error fetching earnings:', error);
        throw error;
      }

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      
      // Get start of current week (Sunday)
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - now.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      let totalEarnings = 0; // Net earnings (after service fee)
      let totalGrossEarnings = 0; // Gross earnings (before service fee)
      let totalServiceFees = 0; // Total service fees deducted
      let thisMonth = 0;
      let thisWeek = 0;
      let lastMonthAmount = 0;
      let pendingPayouts = 0;
      let completedRides = 0;

      earnings?.forEach((earning: Earning) => {
        const netAmount = Number(earning.amount); // Net amount after service fee
        const grossAmount = Number(earning.gross_amount || earning.amount); // Gross amount before service fee
        const serviceFeeAmount = Number(earning.service_fee_amount || 0); // Service fee amount
        const earningDate = new Date(earning.earning_date);
        
        totalEarnings += netAmount; // Net earnings
        totalGrossEarnings += grossAmount; // Gross earnings
        totalServiceFees += serviceFeeAmount; // Service fees
        
        // Count completed rides (earnings exist for completed rides)
        completedRides++;
        
        // Calculate available payouts (using net amount) - money available for withdrawal
        // Only count earnings that are truly available (not requested, processing, or paid)
        if (earning.status === 'available') {
          pendingPayouts += netAmount;
        }
        
        // This month earnings (net)
        if (earningDate.getMonth() === currentMonth && earningDate.getFullYear() === currentYear) {
          thisMonth += netAmount;
        }
        
        // This week earnings (net)
        if (earningDate >= startOfWeek) {
          thisWeek += netAmount;
        }
        
        // Last month earnings (net)
        if (earningDate.getMonth() === lastMonth && earningDate.getFullYear() === lastMonthYear) {
          lastMonthAmount += netAmount;
        }
      });

      return {
        totalEarnings: Number(totalEarnings.toFixed(2)), // Net earnings
        totalGrossEarnings: Number(totalGrossEarnings.toFixed(2)), // Gross earnings
        totalServiceFees: Number(totalServiceFees.toFixed(2)), // Service fees
        thisMonth: Number(thisMonth.toFixed(2)),
        thisWeek: Number(thisWeek.toFixed(2)),
        lastMonth: Number(lastMonthAmount.toFixed(2)),
        pendingPayouts: Number(pendingPayouts.toFixed(2)),
        completedRides
      };
    } catch (error) {
      console.error('Error in fetchDriverEarnings:', error);
      return {
        totalEarnings: 0,
        totalGrossEarnings: 0,
        totalServiceFees: 0,
        thisMonth: 0,
        thisWeek: 0,
        lastMonth: 0,
        pendingPayouts: 0,
        completedRides: 0
      };
    }
  }

  /**
   * Fetch detailed earnings for analytics with time period
   */
  static async fetchDetailedEarnings(
    driverId: string, 
    startDate?: string, 
    endDate?: string,
    limit = 100
  ): Promise<Earning[]> {
    try {
      let query = supabase
        .from('earnings')
        .select(`
          *,
          ride:rides(id, from_location, to_location, departure_time),
          booking:ride_bookings(id, seats_booked, passenger:users(display_name, email))
        `)
        .eq('driver_id', driverId)
        .order('earning_date', { ascending: false });

      if (startDate) {
        query = query.gte('earning_date', startDate);
      }
      if (endDate) {
        query = query.lte('earning_date', endDate);
      }
      
      query = query.limit(limit);

      const { data: earnings, error } = await query;

      if (error) {
        console.error('Error fetching detailed earnings:', error);
        throw error;
      }

      return earnings || [];
    } catch (error) {
      console.error('Error in fetchDetailedEarnings:', error);
      return [];
    }
  }

  /**
   * Fetch analytics data for earnings dashboard
   */
  static async fetchEarningsAnalytics(
    driverId: string,
    startDate: string,
    endDate: string
  ): Promise<any[]> {
    try {
      const { data: earnings, error } = await supabase
        .from('earnings')
        .select(`
          *,
          ride:rides(id, from_location, to_location, departure_time),
          booking:ride_bookings(id, seats_booked, status)
        `)
        .eq('driver_id', driverId)
        .gte('earning_date', startDate)
        .lte('earning_date', endDate)
        .order('earning_date', { ascending: true });

      if (error) {
        console.error('Error fetching earnings analytics:', error);
        throw error;
      }

      return earnings || [];
    } catch (error) {
      console.error('Error in fetchEarningsAnalytics:', error);
      return [];
    }
  }

  /**
   * Create earnings record for a completed booking with service fee calculation
   */
  static async createEarning(
    driverId: string,
    rideId: number,
    bookingId: number,
    grossAmount: number,
    description?: string,
    serviceFeePercentage: number = 15.0
  ): Promise<Earning | null> {
    try {
      // Calculate service fee and net amount
      const serviceFeeAmount = Math.round(grossAmount * (serviceFeePercentage / 100) * 100) / 100;
      const netAmount = Math.round((grossAmount - serviceFeeAmount) * 100) / 100;

      const { data: earning, error } = await supabase
        .from('earnings')
        .insert([{
          driver_id: driverId,
          ride_id: rideId,
          booking_id: bookingId,
          amount: netAmount, // Net amount after service fee deduction
          gross_amount: grossAmount, // Original amount before service fee
          service_fee_amount: serviceFeeAmount, // Service fee amount
          service_fee_percentage: serviceFeePercentage, // Service fee percentage
          earning_date: new Date().toISOString().split('T')[0],
          status: 'pending',
          description
        }])
        .select()
        .single();

      if (error) {
        console.error('Error creating earning:', error);
        throw error;
      }

      return earning;
    } catch (error) {
      console.error('Error in createEarning:', error);
      return null;
    }
  }

  /**
   * Request payout for available earnings
   */
  static async requestPayout(
    driverId: string,
    amount: number,
    paymentMethod: string,
    paymentDetails: Record<string, unknown>
  ): Promise<PayoutRequest | null> {
    try {
      const normalizedDetails = paymentMethod === 'bank_transfer'
        ? {
            account_holder_name: paymentDetails.account_holder_name,
            institution_number: paymentDetails.institution_number,
            transit_number: paymentDetails.transit_number,
            account_number: paymentDetails.account_number
          }
        : {
            paypal_email: paymentDetails.paypal_email
          };

      const { data, error } = await supabase
        .from('payout_requests')
        .insert({
          driver_id: driverId,
          amount,
          payment_method: paymentMethod,
          payment_details: normalizedDetails,
          status: 'pending'
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating payout request:', error);
        throw error;
      }

      return data as PayoutRequest;
    } catch (error) {
      console.error('Error in requestPayout:', error);
      return null;
    }
  }

  static async fetchPayoutMethods(userId: string): Promise<PayoutMethod[]> {
    if (!userId) {
      return [];
    }

    const headers = await buildAuthHeaders();
    const response = await fetch(
      buildStripeApiUrl(`/payout-methods?user_id=${encodeURIComponent(userId)}`),
      {
        headers,
      }
    );

    const result = await response
      .json()
      .catch(() => ({ success: false, error: 'Failed to parse payout method response' }));

    if (response.status === 404) {
      return [];
    }

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to fetch payout methods');
    }

    return (result.data?.payout_methods as PayoutMethod[] | undefined) ?? [];
  }

  static async savePayoutMethod(
    userId: string,
    payoutType: 'bank_transfer' | 'paypal',
    details: Partial<PayoutMethod>,
    makeDefault = false
  ): Promise<PayoutMethod | null> {
    if (!userId) {
      throw new Error('User ID is required to save a payout method');
    }

    const payload: Record<string, unknown> = {
      user_id: userId,
      payout_type: payoutType,
      details:
        payoutType === 'bank_transfer'
          ? {
              account_holder_name: details.account_holder_name,
              institution_number: details.institution_number,
              transit_number: details.transit_number,
              account_number: details.account_number,
            }
          : {
              paypal_email: details.paypal_email,
            },
      make_default: makeDefault,
    };

    const headers = await buildAuthHeaders();
    const response = await fetch(buildStripeApiUrl('/payout-methods'), {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const result = await response
      .json()
      .catch(() => ({ success: false, error: 'Failed to parse payout method response' }));

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to create payout method');
    }

    return (result.data?.payout_method as PayoutMethod | undefined) ?? null;
  }

  static async setDefaultPayoutMethod(userId: string, payoutMethodId: number): Promise<void> {
    if (!userId) {
      throw new Error('User ID is required to update the default payout method');
    }

    const headers = await buildAuthHeaders();
    const response = await fetch(buildStripeApiUrl(`/payout-methods/${payoutMethodId}/default`), {
      method: 'POST',
      headers,
      body: JSON.stringify({ user_id: userId }),
    });

    const result = await response
      .json()
      .catch(() => ({ success: false, error: 'Failed to parse payout method response' }));

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Failed to set default payout method');
    }
  }

  static async deletePayoutMethod(userId: string, payoutMethodId: number): Promise<void> {
    if (!userId) {
      throw new Error('User ID is required to delete a payout method');
    }

    const headers = await buildAuthHeaders();
    const response = await fetch(buildStripeApiUrl(`/payout-methods/${payoutMethodId}`), {
      method: 'DELETE',
      headers,
    });

    if (response.status === 204) {
      return;
    }

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || 'Failed to delete payout method');
    }
  }

  /**
   * Fetch payout requests for a driver
   */
  static async fetchPayoutRequests(driverId: string): Promise<PayoutRequest[]> {
    try {
      const { data: payoutRequests, error } = await supabase
        .from('payout_requests')
        .select('*')
        .eq('driver_id', driverId)
        .order('requested_at', { ascending: false });

      if (error) {
        console.error('Error fetching payout requests:', error);
        throw error;
      }

      return payoutRequests || [];
    } catch (error) {
      console.error('Error in fetchPayoutRequests:', error);
      return [];
    }
  }

  /**
   * Update earning status (e.g., mark as paid)
   */
  static async updateEarningStatus(
    earningId: string,
    status: 'pending' | 'available' | 'requested' | 'processing' | 'paid',
    payoutId?: string
  ): Promise<boolean> {
    try {
      const updateData: any = { status };
      if (payoutId) {
        updateData.payout_id = payoutId;
      }

      const { error } = await supabase
        .from('earnings')
        .update(updateData)
        .eq('id', earningId);

      if (error) {
        console.error('Error updating earning status:', error);
        throw error;
      }

      return true;
    } catch (error) {
      console.error('Error in updateEarningStatus:', error);
      return false;
    }
  }

  /**
   * Get earnings summary for a specific date range
   */
  static async getEarningsForDateRange(
    driverId: string,
    startDate: string,
    endDate: string
  ): Promise<Earning[]> {
    try {
      const { data: earnings, error } = await supabase
        .from('earnings')
        .select('*')
        .eq('driver_id', driverId)
        .gte('earning_date', startDate)
        .lte('earning_date', endDate)
        .order('earning_date', { ascending: true });

      if (error) {
        console.error('Error fetching earnings for date range:', error);
        throw error;
      }

      return earnings || [];
    } catch (error) {
      console.error('Error in getEarningsForDateRange:', error);
      return [];
    }
  }

  /**
   * Sync earnings from existing bookings (one-time migration)
   */
  static async syncEarningsFromBookings(driverId: string): Promise<void> {
    try {
      console.log('Syncing earnings from existing bookings...');
      
      // This will be handled by the database trigger we created
      // But we can also manually sync if needed
      const { data: rides, error } = await supabase
        .from('rides')
        .select(`
          id, price_per_seat, departure_time, from_location, to_location,
          ride_bookings(id, seats_booked, total_amount, status, payment_status)
        `)
        .eq('driver_id', driverId);

      if (error) {
        console.error('Error fetching rides for sync:', error);
        return;
      }

      for (const ride of rides || []) {
        for (const booking of ride.ride_bookings || []) {
          if (booking.status === 'confirmed' && booking.payment_status === 'paid') {
            // Check if earning already exists
            const { data: existingEarning } = await supabase
              .from('earnings')
              .select('id')
              .eq('booking_id', booking.id)
              .single();

            if (!existingEarning) {
              await this.createEarning(
                driverId,
                ride.id,
                booking.id,
                booking.total_amount,
                `Ride from ${ride.from_location} to ${ride.to_location}`
              );
            }
          }
        }
      }
      
      console.log('Earnings sync completed');
    } catch (error) {
      console.error('Error in syncEarningsFromBookings:', error);
    }
  }
}