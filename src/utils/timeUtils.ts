/**
 * Time Formatting Utilities
 * Converts 24-hour format to 12-hour AM/PM format
 */

/**
 * Format time string to 12-hour AM/PM format
 * @param timeString - Time in HH:MM or HH:MM:SS format (24-hour)
 * @returns Formatted time string in h:MM AM/PM format
 * @example formatTime("09:00") => "9:00 AM"
 * @example formatTime("14:51") => "2:51 PM"
 * @example formatTime("16:22") => "4:22 PM"
 */
export function formatTime(timeString: string): string {
  if (!timeString) return '';
  
  // Handle ISO datetime strings (e.g., "2024-01-15T14:51:00")
  if (timeString.includes('T')) {
    const date = new Date(timeString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }
  
  // Handle time-only strings (e.g., "14:51" or "14:51:00")
  const [hourStr, minuteStr] = timeString.split(':');
  const hour = parseInt(hourStr, 10);
  const minute = minuteStr;
  
  if (isNaN(hour)) return timeString;
  
  // Convert 24-hour to 12-hour format
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  
  return `${hour12}:${minute} ${period}`;
}

/**
 * Format date and time together
 * @param date - Date string in YYYY-MM-DD format
 * @param time - Time in HH:MM format (24-hour)
 * @returns Formatted string like "2024-01-15 at 2:51 PM"
 */
export function formatDateTime(date: string, time: string): string {
  return `${date} at ${formatTime(time)}`;
}

/**
 * Parse time components from time string
 * @param timeString - Time in HH:MM format
 * @returns Object with hour, minute, and period
 */
export function parseTime(timeString: string): { hour: number; minute: string; period: 'AM' | 'PM' } | null {
  if (!timeString) return null;
  
  const [hourStr, minuteStr] = timeString.split(':');
  const hour = parseInt(hourStr, 10);
  
  if (isNaN(hour)) return null;
  
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  
  return {
    hour: hour12,
    minute: minuteStr,
    period
  };
}

/**
 * Format relative time (e.g., "2 hours ago", "5 minutes ago")
 * @param dateString - ISO date string
 * @returns Relative time string
 */
export function formatDistanceToNow(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return 'just now';
  }
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  }
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  }
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  }
  
  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return `${diffInWeeks}w ago`;
  }
  
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) {
    return `${diffInMonths}mo ago`;
  }
  
  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears}y ago`;
}
