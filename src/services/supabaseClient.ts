import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = 'https://fewhwgvlgstmukhebyvz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZld2h3Z3ZsZ3N0bXVraGVieXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNDY0NDEsImV4cCI6MjA3ODcyMjQ0MX0.Sgw13uQNKId3j3MsT-L5Ae8_oRnWTNvBw480BfS0e-I';

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// Database types helper
export type Profile = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  user_type: 'driver' | 'rider';
  profile_image: string | null;
  bio: string | null;
  rating: number;
  total_trips: number;
  verified: boolean;
  member_since: string;
  created_at: string;
  updated_at: string;
};

export type CarDetails = {
  id: string;
  user_id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  license_plate: string;
  seats: number;
  created_at: string;
  updated_at: string;
};

export type Ride = {
  id: string;
  driver_id: string;
  from_location: any; // JSONB
  to_location: any; // JSONB
  date: string;
  time: string;
  available_seats: number;
  price_per_seat: number;
  status: 'scheduled' | 'ongoing' | 'completed' | 'cancelled';
  distance: number | null;
  duration: number | null;
  estimated_arrival: string | null;
  route_data: any | null; // JSONB
  price_per_km: number | null;
  ride_policy_accepted: boolean;
  created_at: string;
  updated_at: string;
};

export type RideRequest = {
  id: string;
  ride_id: string;
  passenger_id: string;
  requested_seats: number;
  pickup_location: any; // JSONB
  dropoff_location: any; // JSONB
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  message: string | null;
  request_date: string;
  created_at: string;
  updated_at: string;
};

export type RouteStop = {
  id: string;
  ride_id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  stop_order: number;
  estimated_arrival: string | null;
  created_at: string;
};

// Helper function to handle Supabase errors
export function handleSupabaseError(error: any, customMessage?: string) {
  console.error('Supabase error:', error);
  const errorMessage = customMessage || error.message || 'An error occurred with the database';
  throw new Error(errorMessage);
}
