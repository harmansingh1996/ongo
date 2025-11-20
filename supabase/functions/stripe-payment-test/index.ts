import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TestRequest {
  scenario:
    | "create"
    | "authorize"
    | "capture"
    | "refund"
    | "cancel"
    | "failed"
    | "all";
  amount?: number;
  testCard?: string;
  metadata?: Record<string, string>;
  paymentIntentId?: string;
}

interface TestResult {
  scenario: string;
  success: boolean;
  paymentIntentId?: string;
  status?: string;
  amount?: number;
  error?: string;
  details?: any;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey?.startsWith("sk_test_")) {
      throw new Error("STRIPE_SECRET_KEY must be a TEST key");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body: TestRequest = await req.json();

    // For now, just run create test to verify fix
    const result = await testCreatePaymentIntent(stripe, supabase, body);

    return new Response(
      JSON.stringify({
        success: result.success,
        result,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

async function testCreatePaymentIntent(
  stripe: Stripe,
  supabase: any,
  config: TestRequest
): Promise<TestResult> {
  const amount = config.amount || 5000;
  
  // Create test profiles
  const testUserId = crypto.randomUUID();
  const testDriverId = crypto.randomUUID();
  
  const { error: riderError } = await supabase.from("profiles").insert({
    id: testUserId,
    email: `test-rider-${testUserId.substring(0, 8)}@test.com`,
    name: "Test Rider",
    phone: "+15145551234",
    user_type: "rider",
  });
  
  if (riderError) {
    throw new Error(`Rider profile creation failed: ${riderError.message}`);
  }

  const { error: driverError } = await supabase.from("profiles").insert({
    id: testDriverId,
    email: `test-driver-${testDriverId.substring(0, 8)}@test.com`,
    name: "Test Driver",
    phone: "+15145555678",
    user_type: "driver",
  });
  
  if (driverError) {
    throw new Error(`Driver profile creation failed: ${driverError.message}`);
  }

  // Create test ride with correct schema
  const testRideId = crypto.randomUUID();
  const testDate = new Date();
  const testTime = "10:00:00";
  
  const { data: rideData, error: rideError } = await supabase.from("rides").insert({
    id: testRideId,
    driver_id: testDriverId,
    from_location: {
      address: "123 Test St, Montreal, QC",
      lat: 45.5017,
      lng: -73.5673,
    },
    to_location: {
      address: "456 Test Ave, Montreal, QC",
      lat: 45.5088,
      lng: -73.5878,
    },
    date: testDate.toISOString().split('T')[0],
    time: testTime,
    available_seats: 3,
    price_per_seat: 15.00,
    status: "scheduled",
  }).select().single();
  
  if (rideError) {
    throw new Error(`Ride creation failed: ${rideError.message}`);
  }

  // Create Stripe payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: "cad",
    capture_method: "manual",
    payment_method_types: ["card"],
    metadata: {
      test: "true",
      ride_id: testRideId,
      rider_id: testUserId,
      driver_id: testDriverId,
    },
    description: "Test Payment",
  });

  // Save to database
  const { data: dbRecord, error: dbError } = await supabase
    .from("stripe_payment_intents")
    .insert({
      stripe_payment_intent_id: paymentIntent.id,
      ride_id: testRideId,
      rider_id: testUserId,
      driver_id: testDriverId,
      amount_subtotal: amount,
      discount_amount: 0,
      amount_total: amount,
      status: paymentIntent.status,
      capture_method: "manual",
      stripe_client_secret: paymentIntent.client_secret,
    })
    .select()
    .single();

  if (dbError) {
    throw new Error(`Database insert failed: ${dbError.message}`);
  }

  return {
    scenario: "create",
    success: true,
    paymentIntentId: dbRecord.id,
    status: paymentIntent.status,
    amount,
    details: {
      stripe_payment_intent_id: paymentIntent.id,
      db_id: dbRecord.id,
    },
  };
}
