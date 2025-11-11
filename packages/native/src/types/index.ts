// Placeholder for shared DTOs.
// TODO: Import or generate types shared with the web app (rides, bookings, payments).
export interface RideSummary {
  id: number;
  fromLocation: string;
  toLocation: string;
  departureTime: string;
  seatsAvailable: number;
}
