import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "https://esm.sh/stripe@17.5.0?target=deno";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PaymentRequest {
  action:
    | "create"
    | "capture"
    | "cancel"
    | "refund"
    | "create_payout"
    | "verify_webhook";
  // Create payment intent
  rideId?: string;
  bookingId?: string;
  driverId?: string;
  amountSubtotal?: number; // In cents
  referralCode?: string;
  // Capture/Cancel/Refund
  paymentIntentId?: string;
  // Refund
  reason?: string;
  // Payout
  driverId_payout?: string;
  amount?: number;
  // Webhook
  payload?: string;
  signature?: string;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Stripe with secret key from environment
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY not configured");
    }
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Parse request body first to check action type
    const body: PaymentRequest = await req.json();
    const { action } = body;

    // For capture/cancel/refund actions, allow service role authentication (worker-to-worker calls)
    const isServiceAction = ["capture", "cancel", "refund"].includes(action);
    
    let supabaseClient;
    let userId: string | null = null;

    if (isServiceAction) {
      // Use service role key for worker actions (no user context needed)
      supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
    } else {
      // Use regular auth for user actions (create payment, etc.)
      supabaseClient = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        {
          global: {
            headers: { Authorization: req.headers.get("Authorization")! },
          },
        }
      );

      // Get user from auth
      const {
        data: { user },
        error: authError,
      } = await supabaseClient.auth.getUser();

      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      userId = user.id;
    }

    // Route to appropriate handler
    switch (action) {
      case "create":
        return await createPaymentIntent(
          stripe,
          supabaseClient,
          userId!,
          body
        );

      case "capture":
        return await capturePaymentIntent(stripe, supabaseClient, body);

      case "cancel":
        return await cancelPaymentIntent(stripe, supabaseClient, body);

      case "refund":
        return await refundPayment(stripe, supabaseClient, body);

      case "create_payout":
        return await createDriverPayout(stripe, supabaseClient, body);

      case "verify_webhook":
        return await verifyWebhook(stripe, body);

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
    }
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

// ==========================================
// Create Payment Intent (Authorization Hold)
// ==========================================
async function createPaymentIntent(
  stripe: Stripe,
  supabase: any,
  userId: string,
  body: PaymentRequest
) {
  const { rideId, bookingId, driverId, amountSubtotal, referralCode } = body;

  if (
    !rideId ||
    !driverId ||
    !amountSubtotal ||
    amountSubtotal <= 0
  ) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Calculate discount if referral code provided
  let discountAmount = 0;
  let finalReferralCode = null;

  if (referralCode) {
    const { data: referral } = await supabase
      .from("referrals")
      .select("discount_percent, used, expires_at")
      .eq("code", referralCode)
      .eq("referred_user_id", userId)
      .single();

    if (
      referral &&
      !referral.used &&
      new Date(referral.expires_at) > new Date()
    ) {
      discountAmount = Math.floor(
        (amountSubtotal * referral.discount_percent) / 100
      );
      finalReferralCode = referralCode;
    }
  }

  const amountTotal = amountSubtotal - discountAmount;

  // Create Stripe PaymentIntent with manual capture
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountTotal,
    currency: "cad", // Canadian Dollars for Canada-based app
    capture_method: "manual", // CRITICAL: Authorize only, capture later
    metadata: {
      ride_id: rideId,
      booking_id: bookingId || "pending",
      rider_id: userId,
      driver_id: driverId,
      referral_code: finalReferralCode || "",
    },
    description: `Ride booking ${bookingId || "pending"}`,
  });

  // Store payment intent in database with initial status
  // CRITICAL FIX: Status should be "requires_payment_method" initially
  // It will be updated to "authorized" via webhook when payment is confirmed
  const { data: savedPaymentIntent, error: insertError } = await supabase
    .from("stripe_payment_intents")
    .insert({
      stripe_payment_intent_id: paymentIntent.id,
      ride_id: rideId,
      booking_id: bookingId,
      rider_id: userId,
      driver_id: driverId,
      amount_subtotal: amountSubtotal,
      discount_amount: discountAmount,
      amount_total: amountTotal,
      referral_code: finalReferralCode,
      status: paymentIntent.status, // Use actual Stripe status
      capture_method: "manual",
      stripe_client_secret: paymentIntent.client_secret,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    // Try to cancel the Stripe payment intent if database insert fails
    await stripe.paymentIntents.cancel(paymentIntent.id);
    throw new Error(`Failed to save payment intent: ${insertError.message}`);
  }

  // Mark referral as used
  if (finalReferralCode) {
    await supabase
      .from("referrals")
      .update({ used: true, used_at: new Date().toISOString() })
      .eq("code", finalReferralCode);
  }

  // Create payment history record with initial status
  // Status will be updated when payment is confirmed
  await supabase.from("payment_history").insert({
    booking_id: bookingId || null,
    user_id: userId,
    stripe_payment_intent_id: paymentIntent.id,
    amount: amountTotal,
    payment_method: "stripe",
    transaction_id: paymentIntent.id,
    status: "pending", // Changed from "authorized" to "pending"
    date: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({
      success: true,
      paymentIntent: savedPaymentIntent,
      clientSecret: paymentIntent.client_secret,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

// ==========================================
// Capture Payment Intent (After Ride Complete)
// ==========================================
async function capturePaymentIntent(
  stripe: Stripe,
  supabase: any,
  body: PaymentRequest
) {
  const { paymentIntentId } = body;

  if (!paymentIntentId) {
    return new Response(
      JSON.stringify({ error: "Payment intent ID required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Get payment intent from database
  const { data: paymentRecord, error: fetchError } = await supabase
    .from("stripe_payment_intents")
    .select("*")
    .eq("id", paymentIntentId)
    .single();

  if (fetchError || !paymentRecord) {
    return new Response(
      JSON.stringify({ error: "Payment intent not found" }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // CRITICAL FIX: Sync status from Stripe before attempting capture
  // This handles cases where frontend confirmed payment but DB wasn't updated
  let currentStripeIntent;
  try {
    currentStripeIntent = await stripe.paymentIntents.retrieve(
      paymentRecord.stripe_payment_intent_id
    );
  } catch (retrieveError) {
    return new Response(
      JSON.stringify({ error: `Failed to retrieve Stripe payment intent: ${retrieveError.message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Map Stripe status to our database status
  // Stripe "requires_capture" = our "authorized" status
  let dbStatus = currentStripeIntent.status;
  if (currentStripeIntent.status === "requires_capture") {
    dbStatus = "authorized";
  }

  // Update database if status is out of sync
  if (paymentRecord.status !== dbStatus) {
    console.log(`Syncing payment status from ${paymentRecord.status} to ${dbStatus}`);
    await supabase
      .from("stripe_payment_intents")
      .update({
        status: dbStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentIntentId);
    
    // Update payment record for subsequent checks
    paymentRecord.status = dbStatus;
  }

  // Validate that payment is in a capturable state
  if (paymentRecord.status !== "authorized") {
    return new Response(
      JSON.stringify({
        error: `Cannot capture payment in status: ${paymentRecord.status}. Stripe status: ${currentStripeIntent.status}`,
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Capture payment in Stripe
  const capturedIntent = await stripe.paymentIntents.capture(
    paymentRecord.stripe_payment_intent_id
  );

  // Update database status
  await supabase
    .from("stripe_payment_intents")
    .update({
      status: "succeeded",
      captured_at: new Date().toISOString(),
    })
    .eq("id", paymentIntentId);

  // Update payment history
  await supabase
    .from("payment_history")
    .update({
      status: "succeeded",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_payment_intent_id", paymentRecord.stripe_payment_intent_id);

  // Create payment capture log
  await supabase.from("payment_capture_log").insert({
    payment_intent_id: paymentIntentId,
    stripe_payment_intent_id: paymentRecord.stripe_payment_intent_id,
    amount_captured: paymentRecord.amount_total,
    stripe_charge_id: capturedIntent.latest_charge,
    captured_at: new Date().toISOString(),
    status: "success",
  });

  // Create driver earnings record
  const platformFeePercent = 15; // 15% platform fee
  const grossEarnings = paymentRecord.amount_total;
  const platformFee = Math.floor((grossEarnings * platformFeePercent) / 100);
  const netEarnings = grossEarnings - platformFee;

  await supabase.from("driver_earnings").insert({
    driver_id: paymentRecord.driver_id,
    ride_id: paymentRecord.ride_id,
    booking_id: paymentRecord.booking_id,
    payment_intent_id: paymentIntentId,
    gross_amount: grossEarnings,
    platform_fee: platformFee,
    net_amount: netEarnings,
    status: "pending", // Will be paid in weekly batch
    created_at: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({
      success: true,
      capturedAmount: paymentRecord.amount_total,
      driverEarnings: netEarnings,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

// ==========================================
// Cancel Payment Intent (Release Authorization)
// ==========================================
async function cancelPaymentIntent(
  stripe: Stripe,
  supabase: any,
  body: PaymentRequest
) {
  const { paymentIntentId, reason } = body;

  if (!paymentIntentId) {
    return new Response(
      JSON.stringify({ error: "Payment intent ID required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Get payment intent from database
  const { data: paymentRecord, error: fetchError } = await supabase
    .from("stripe_payment_intents")
    .select("*")
    .eq("id", paymentIntentId)
    .single();

  if (fetchError || !paymentRecord) {
    return new Response(
      JSON.stringify({ error: "Payment intent not found" }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  if (paymentRecord.status === "canceled") {
    return new Response(
      JSON.stringify({ success: true, message: "Already canceled" }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Cancel in Stripe
  await stripe.paymentIntents.cancel(
    paymentRecord.stripe_payment_intent_id,
    {
      cancellation_reason: "requested_by_customer",
    }
  );

  // Update database
  await supabase
    .from("stripe_payment_intents")
    .update({
      status: "canceled",
      canceled_at: new Date().toISOString(),
      cancellation_reason: reason || "booking_canceled",
    })
    .eq("id", paymentIntentId);

  // Update payment history
  await supabase
    .from("payment_history")
    .update({
      status: "refunded",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_payment_intent_id", paymentRecord.stripe_payment_intent_id);

  // Mark referral as expired if it was used
  if (paymentRecord.referral_code) {
    await supabase
      .from("referrals")
      .update({
        used: false,
        used_at: null,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Extend by 30 days
      })
      .eq("code", paymentRecord.referral_code);
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: "Payment authorization released",
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

// ==========================================
// Refund Payment (Already Captured)
// ==========================================
async function refundPayment(
  stripe: Stripe,
  supabase: any,
  body: PaymentRequest
) {
  const { paymentIntentId, reason } = body;

  if (!paymentIntentId) {
    return new Response(
      JSON.stringify({ error: "Payment intent ID required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Get payment intent from database
  const { data: paymentRecord, error: fetchError } = await supabase
    .from("stripe_payment_intents")
    .select("*")
    .eq("id", paymentIntentId)
    .single();

  if (fetchError || !paymentRecord) {
    return new Response(
      JSON.stringify({ error: "Payment intent not found" }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  if (paymentRecord.status !== "succeeded") {
    return new Response(
      JSON.stringify({
        error: "Can only refund succeeded payments",
      }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Create refund in Stripe
  const refund = await stripe.refunds.create({
    payment_intent: paymentRecord.stripe_payment_intent_id,
    reason: "requested_by_customer",
  });

  // Update payment status
  await supabase
    .from("stripe_payment_intents")
    .update({
      status: "refunded",
      refunded_at: new Date().toISOString(),
      stripe_refund_id: refund.id,
    })
    .eq("id", paymentIntentId);

  // Update payment history
  await supabase.from("payment_history").insert({
    booking_id: paymentRecord.booking_id,
    user_id: paymentRecord.rider_id,
    stripe_payment_intent_id: paymentRecord.stripe_payment_intent_id,
    amount: -paymentRecord.amount_total, // Negative for refund
    payment_method: "stripe",
    transaction_id: `${paymentRecord.stripe_payment_intent_id}_refund_${Date.now()}`,
    status: "refunded",
    date: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });

  // Update driver earnings to deduct this amount
  await supabase
    .from("driver_earnings")
    .update({
      status: "refunded",
      refunded_at: new Date().toISOString(),
    })
    .eq("payment_intent_id", paymentIntentId);

  return new Response(
    JSON.stringify({
      success: true,
      refundId: refund.id,
      amountRefunded: paymentRecord.amount_total,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

// ==========================================
// Create Driver Payout (To Bank Account)
// ==========================================
async function createDriverPayout(
  stripe: Stripe,
  supabase: any,
  body: PaymentRequest
) {
  const { driverId_payout, amount } = body;

  if (!driverId_payout || !amount || amount <= 0) {
    return new Response(
      JSON.stringify({ error: "Driver ID and amount required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Get driver's Stripe Connect account ID
  const { data: driver } = await supabase
    .from("profiles")
    .select("stripe_connect_account_id")
    .eq("id", driverId_payout)
    .single();

  if (!driver || !driver.stripe_connect_account_id) {
    return new Response(
      JSON.stringify({ error: "Driver Stripe account not configured" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // Create payout (requires Stripe Connect setup)
  const payout = await stripe.transfers.create({
    amount: amount,
    currency: "cad", // Canadian Dollars for Canada-based app
    destination: driver.stripe_connect_account_id,
    description: `Weekly payout to driver ${driverId_payout}`,
  });

  return new Response(
    JSON.stringify({
      success: true,
      payoutId: payout.id,
      amount: amount,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

// ==========================================
// Verify Webhook Signature
// ==========================================
async function verifyWebhook(stripe: Stripe, body: PaymentRequest) {
  const { payload, signature } = body;

  if (!payload || !signature) {
    return new Response(
      JSON.stringify({ error: "Payload and signature required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  }

  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );

    return new Response(
      JSON.stringify({
        success: true,
        event: event.type,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Webhook verification failed" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
}
