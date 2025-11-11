import { supabase } from './supabase';

export interface RideAutomationResult {
  rides_completed: number;
  rides_deleted: number;  // Always 0 - data preservation policy
  timestamp: string;
}

class RideAutomationService {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  private async callRideCompletionRpc(): Promise<{ data: unknown; error: unknown; usedFallback: boolean }> {
    const response = await supabase.rpc('auto_complete_rides');

    if ((response.error as { code?: string } | null)?.code === 'PGRST202') {
      console.warn('auto_complete_rides function missing; attempting fallback archive_old_completed_rides');
      const fallbackResponse = await supabase.rpc('archive_old_completed_rides');

      return {
        data: fallbackResponse.data,
        error: fallbackResponse.error,
        usedFallback: true,
      };
    }

    return {
      data: response.data,
      error: response.error,
      usedFallback: false,
    };
  }

  private extractRideCount(value: unknown): number {
    if (typeof value === 'number') {
      return value;
    }

    if (Array.isArray(value) && value.length > 0) {
      return this.extractRideCount(value[0]);
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      const possibleValue = record.rides_completed ?? record.count ?? record.total ?? record.value ?? record.rows_affected;

      if (typeof possibleValue === 'number') {
        return possibleValue;
      }
    }

    return 0;
  }

  // Run ride automation (completion and cleanup)
  async runAutomation(): Promise<RideAutomationResult | null> {
    try {
      const { data: autoCompleteData, error: autoCompleteError, usedFallback } = await this.callRideCompletionRpc();

      if (autoCompleteError) {
        console.error('Error completing rides automatically:', autoCompleteError);
        return null;
      }

      if (usedFallback) {
        console.log('Fallback archive_old_completed_rides executed during automation run');
      }

      const ridesCompleted = this.extractRideCount(autoCompleteData);

      const arrivalUpdates = await this.updateMissingArrivalTimes();

      const result: RideAutomationResult = {
        rides_completed: ridesCompleted,
        rides_deleted: 0,
        timestamp: new Date().toISOString(),
      };

      if (result.rides_completed > 0 || arrivalUpdates > 0) {
        console.log('Ride automation results:', {
          ...result,
          arrival_updates: arrivalUpdates,
        });
      }

      return result;
    } catch (error) {
      console.error('Error in ride automation service:', error);
      return null;
    }
  }

  // Start periodic automation (runs every 5 minutes)
  startAutomation(): void {
    if (this.isRunning) {
      console.log('Ride automation is already running');
      return;
    }

    console.log('Starting ride automation service...');
    this.isRunning = true;

    // Run immediately
    this.runAutomation();

    // Set up periodic execution every 5 minutes (300,000 ms)
    this.intervalId = setInterval(() => {
      this.runAutomation();
    }, 5 * 60 * 1000);
  }

  // Stop periodic automation
  stopAutomation(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Ride automation service stopped');
  }

  // Check if automation is running
  isAutomationRunning(): boolean {
    return this.isRunning;
  }

  // Manually complete specific rides (for testing or manual triggers)
  async completeRidesManually(): Promise<number> {
    try {
      const { data, error, usedFallback } = await this.callRideCompletionRpc();
      
      if (error) {
        console.error('Error completing rides manually:', error);
        return 0;
      }

      if (usedFallback) {
        console.log('Fallback archive_old_completed_rides executed during manual completion');
      }

      return this.extractRideCount(data);
    } catch (error) {
      console.error('Error in manual ride completion:', error);
      return 0;
    }
  }

  // REMOVED: Manually cleanup completed rides 
  // This function was removed to implement safe data deletion policy
  // Data is now preserved in database and only filtered in app interface
  async cleanupRidesManually(): Promise<number> {
    console.log('Ride cleanup disabled - data preservation policy in effect');
    console.log('All ride data is preserved in database for audit trail');
    return 0; // No rides deleted, all data preserved
  }

  // Update arrival times for existing rides
  async updateMissingArrivalTimes(): Promise<number> {
    try {
      const response = await supabase.rpc('update_missing_arrival_times');

      if ((response.error as { code?: string } | null)?.code === 'PGRST202') {
        console.warn(
          'update_missing_arrival_times function missing; attempting fallback update_past_ride_statuses'
        );

        const fallbackResponse = await supabase.rpc('update_past_ride_statuses');

        if (fallbackResponse.error) {
          console.error('Fallback update_past_ride_statuses failed:', fallbackResponse.error);
          return 0;
        }

        return this.extractRideCount(fallbackResponse.data);
      }

      if (response.error) {
        console.error('Error updating arrival times:', response.error);
        return 0;
      }

      return this.extractRideCount(response.data);
    } catch (error) {
      console.error('Error updating arrival times:', error);
      return 0;
    }
  }
}

// Export singleton instance
export const rideAutomationService = new RideAutomationService();