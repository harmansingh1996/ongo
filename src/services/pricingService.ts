import { supabase, handleSupabaseError } from './supabaseClient';

/**
 * Pricing Service
 * Handles tier-based pricing and price validation
 */

export interface PricingTier {
  id: string;
  tier_name: string;
  min_distance_km: number;
  max_distance_km: number | null;
  min_price_per_km: number;
  max_price_per_km: number;
  created_at: string;
  updated_at: string;
}

/**
 * Get all pricing tiers
 */
export async function getPricingTiers(): Promise<PricingTier[]> {
  try {
    const { data, error } = await supabase
      .from('pricing_tiers')
      .select('*')
      .order('min_distance_km', { ascending: true });

    if (error) {
      handleSupabaseError(error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Error fetching pricing tiers:', error);
    return [];
  }
}

/**
 * Get pricing tier for a specific distance
 */
export async function getPricingTierForDistance(distanceKm: number): Promise<PricingTier | null> {
  try {
    const { data, error } = await supabase
      .from('pricing_tiers')
      .select('*')
      .lte('min_distance_km', distanceKm)
      .or(`max_distance_km.gte.${distanceKm},max_distance_km.is.null`)
      .single();

    if (error) {
      // If no exact match, try to find the closest tier
      const allTiers = await getPricingTiers();
      
      for (const tier of allTiers) {
        if (distanceKm >= tier.min_distance_km) {
          if (tier.max_distance_km === null || distanceKm <= tier.max_distance_km) {
            return tier;
          }
        }
      }
      
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error fetching pricing tier for distance:', error);
    return null;
  }
}

/**
 * Validate price per km against tier limits
 */
export function validatePricePerKm(
  pricePerKm: number,
  tier: PricingTier
): { valid: boolean; message?: string } {
  if (pricePerKm < tier.min_price_per_km) {
    return {
      valid: false,
      message: `Price per km must be at least $${tier.min_price_per_km.toFixed(2)}`,
    };
  }

  if (pricePerKm > tier.max_price_per_km) {
    return {
      valid: false,
      message: `Price per km cannot exceed $${tier.max_price_per_km.toFixed(2)}`,
    };
  }

  return { valid: true };
}

/**
 * Calculate price per seat from price per km and distance
 */
export function calculatePricePerSeat(pricePerKm: number, distanceKm: number): number {
  return Math.round(pricePerKm * distanceKm * 100) / 100;
}

/**
 * Calculate price per km from total price per seat and distance
 */
export function calculatePricePerKm(pricePerSeat: number, distanceKm: number): number {
  if (distanceKm === 0) return 0;
  return Math.round((pricePerSeat / distanceKm) * 10000) / 10000;
}
