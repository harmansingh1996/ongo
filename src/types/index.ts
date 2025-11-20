// Core Types
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  rating: number;
  totalTrips: number;
  memberSince: string;
  verified: boolean;
  bio?: string;
  carDetails?: CarDetails;
  preferences?: UserPreferences;
  profileImage?: string;
}

export interface CarDetails {
  make: string;
  model: string;
  year: number;
  color: string;
  licensePlate: string;
  seats: number;
}

export interface UserPreferences {
  music: boolean;
  conversation: 'quiet' | 'chatty' | 'moderate';
  smoking: boolean;
  pets: boolean;
  temperature: 'cool' | 'warm' | 'moderate';
}

// Geographic Types with Map Routing Support
export interface Location {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
}

export interface RouteStop extends Location {
  time: string;
  estimatedArrival?: string;
  order: number;
}

// Map Routing Types
export interface MapRouteData {
  geometry: {
    type: 'LineString';
    coordinates: [number, number][]; // [lng, lat] format for GeoJSON
  };
  distance: number; // meters
  duration: number; // seconds
  legs: RouteSegment[];
}

export interface RouteSegment {
  distance: number; // meters
  duration: number; // seconds
  fromStopId: string;
  toStopId: string;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

export interface RouteCalculationResult {
  fullRoute: MapRouteData;
  stops: RouteStop[];
  totalDistance: number; // meters
  totalDuration: number; // seconds
  pricePerKm: number;
  totalPrice: number;
}

// Ride Types
export interface Ride {
  id: string;
  driver: User;
  from: Location;
  to: Location;
  stops: RouteStop[];
  date: string;
  time: string;
  availableSeats: number;
  pricePerSeat: number;
  carDetails: CarDetails;
  preferences: UserPreferences;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  distance?: number;
  duration?: string;
  estimatedArrival?: string;
  ridePolicyAccepted?: boolean;
  // Map routing data
  routeData?: MapRouteData;
  pricePerKm?: number; // For segment pricing calculations
}

export interface RideRequest {
  id: string;
  passenger: User;
  ride: Ride;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  requestedSeats: number;
  pickupLocation: Location;
  dropoffLocation: Location;
  message?: string;
  requestDate: string;
}

export interface AvailableRide extends Ride {
  matchedRoute?: {
    from: RouteStop;
    to: RouteStop;
  };
  isSegmentBooking?: boolean;
  segmentDistance?: number; // meters, from map routing
  segmentDuration?: number; // seconds, from map routing
}

// Payment Types
export interface PaymentMethod {
  id: string;
  type: 'card' | 'paypal' | 'bank';
  lastFour?: string;
  expiryDate?: string;
  isDefault: boolean;
  cardBrand?: 'visa' | 'mastercard' | 'amex' | 'discover';
  email?: string; // for PayPal
  bankName?: string;
}

// Chat Types
export interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  timestamp: string;
  read: boolean;
}

export interface ChatConversation {
  id: string;
  rideId: string;
  participants: User[];
  messages: ChatMessage[];
  lastMessage?: ChatMessage;
  unreadCount: number;
}

// Notification Types
export interface Notification {
  id: string;
  type: 'ride_request' | 'ride_accepted' | 'ride_rejected' | 'message' | 'reminder' | 'ride_cancelled';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
  data?: any;
}

// Cancellation and Refund Types
export interface CancellationRequest {
  rideId: string;
  cancelledBy: string;
  cancelledByRole: 'driver' | 'passenger';
  reason?: string;
}

export interface RefundCalculation {
  refundEligible: boolean;
  refundPercentage: number;
  refundAmount: number;
  cancellationFee: number;
  hoursBeforeDeparture: number;
}

export interface CancellationResult {
  success: boolean;
  cancellationId?: string;
  refundEligible: boolean;
  refundPercentage: number;
  refundAmount: number;
  cancellationFee: number;
  message: string;
  error?: string;
}

export interface RideCancellation {
  id: string;
  ride_id: string;
  cancelled_by: string;
  cancelled_by_role: 'driver' | 'passenger';
  cancellation_reason?: string;
  cancellation_timestamp: string;
  ride_departure_time: string;
  hours_before_departure: number;
  refund_eligible: boolean;
  refund_percentage: number;
  original_amount: number;
  refund_amount: number;
  cancellation_fee: number;
  status: 'pending' | 'approved' | 'processing' | 'completed' | 'failed' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface RefundTransaction {
  id: string;
  cancellation_id: string;
  ride_id: string;
  user_id: string;
  original_payment_id?: string;
  refund_amount: number;
  refund_method: string;
  transaction_status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  transaction_reference?: string;
  error_message?: string;
  retry_count: number;
  processed_at?: string;
  created_at: string;
  updated_at: string;
}
