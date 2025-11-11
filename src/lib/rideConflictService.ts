import { supabase } from './supabase';

export interface RideConflict {
  ride_id: number;
  from_location: string;
  to_location: string;
  departure_time: string;
  end_time: string;
  overlap_start: string;
  overlap_end: string;
  overlap_minutes: number;
  conflict_type:
    | 'same_day_overlap'
    | 'existing_covers_new'
    | 'new_covers_existing'
    | 'starts_during'
    | 'ends_during'
    | 'partial_overlap'
    | 'invalid_time_window';
  same_day: boolean;
}

export interface ConflictCheckResult {
  conflict_exists: boolean;
  conflicting_ride_id?: number;
  conflicting_ride_info?: string;
  conflict_details: {
    conflicts: RideConflict[];
  };
}

class RideConflictService {
  // Check if a new ride conflicts with existing rides for a driver
  async checkRideConflicts(
    driverId: string,
    departureTime: string,
    arrivalTime: string,
    excludeRideId?: number
  ): Promise<ConflictCheckResult | null> {
    try {
      const { data, error } = await supabase.rpc('check_ride_conflicts', {
        p_driver_id: driverId,
        p_departure: departureTime,
        p_arrival: arrivalTime,
        p_exclude_ride_id: excludeRideId || null
      });

      if (error) {
        console.error('Error checking ride conflicts:', error);
        return null;
      }

      // The function should return a single row with conflict information
      const result = data?.[0];
      if (!result) {
        return {
          conflict_exists: false,
          conflict_details: { conflicts: [] }
        };
      }

      const conflicts: RideConflict[] = result.conflict_details?.conflicts || [];

      return {
        conflict_exists: result.conflict_exists,
        conflicting_ride_id: result.conflicting_ride_id,
        conflicting_ride_info: result.conflicting_ride_info,
        conflict_details: {
          conflicts
        }
      };
    } catch (error) {
      console.error('Error in ride conflict service:', error);
      return null;
    }
  }

  // Format conflict message for user display
  formatConflictMessage(conflictResult: ConflictCheckResult): string {
    if (!conflictResult.conflict_exists) {
      return '';
    }

    const conflicts = conflictResult.conflict_details.conflicts;
    if (conflicts.length === 0) {
      return 'A scheduling conflict was detected. Please choose a different time.';
    }

    const primaryConflict = conflicts[0];
    const summary = conflictResult.conflicting_ride_info
      ? `You already have a ride scheduled during this window: ${conflictResult.conflicting_ride_info}`
      : 'You already have a ride scheduled during this time window.';

    const overlapDetail = primaryConflict.same_day
      ? 'Rides on the same day must not overlap; please leave enough time between your arrival and next departure.'
      : 'The arrival and departure times overlap. Adjust the schedule so rides do not overlap.';

    const overlapWindow = `Conflict window: ${new Date(primaryConflict.overlap_start).toLocaleString()} – ${new Date(primaryConflict.overlap_end).toLocaleString()} (${Math.ceil(primaryConflict.overlap_minutes)} minutes)`;

    if (conflicts.length === 1) {
      return `${summary}\n${overlapDetail}\n${overlapWindow}`;
    }

    return `${summary}\n${overlapDetail}\nThere are ${conflicts.length} conflicting rides. ${overlapWindow}`;
  }

  // Get detailed conflict information for advanced UI
  getConflictDetails(conflictResult: ConflictCheckResult): RideConflict[] {
    return conflictResult.conflict_details.conflicts || [];
  }

  // Check if a specific time range is available for a driver
  async isTimeSlotAvailable(
    driverId: string,
    departureTime: string,
    arrivalTime: string,
    excludeRideId?: number
  ): Promise<boolean> {
    const result = await this.checkRideConflicts(driverId, departureTime, arrivalTime, excludeRideId);
    if (!result) {
      return false;
    }

    return !result.conflict_exists;
  }

  // Suggest alternative time slots (basic implementation)
  async suggestAlternativeTimeSlots(
    driverId: string,
    preferredDepartureTime: string,
    estimatedDurationMinutes: number
  ): Promise<{ departureTime: string; arrivalTime: string }[]> {
    const suggestions: { departureTime: string; arrivalTime: string }[] = [];
    const baseTime = new Date(preferredDepartureTime);
    
    // Try slots before and after the preferred time
    const timeSlotsToTry = [
      -120, -90, -60, -30, // Earlier slots
      30, 60, 90, 120      // Later slots
    ];

    for (const offsetMinutes of timeSlotsToTry) {
      const newDeparture = new Date(baseTime.getTime() + offsetMinutes * 60 * 1000);
      const newArrival = new Date(newDeparture.getTime() + estimatedDurationMinutes * 60 * 1000);

      const isAvailable = await this.isTimeSlotAvailable(
        driverId,
        newDeparture.toISOString(),
        newArrival.toISOString()
      );

      if (isAvailable) {
        suggestions.push({
          departureTime: newDeparture.toISOString(),
          arrivalTime: newArrival.toISOString()
        });

        // Limit to 3 suggestions
        if (suggestions.length >= 3) {
          break;
        }
      }
    }

    return suggestions;
  }

  // Format time for display
  formatTimeForDisplay(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }

  // Format date and time for display
  formatDateTimeForDisplay(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  }
}

// Export singleton instance
export const rideConflictService = new RideConflictService();