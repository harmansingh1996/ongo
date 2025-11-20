import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface QueuePayment {
  id: string;
  payment_intent_id: string;
  ride_id: string;
  stripe_payment_intent_id: string;
  amount_cents: number;
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  error_message: string | null;
}

interface CaptureResult {
  success: boolean;
  paymentId: string;
  error?: string;
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    console.log("🔄 Payment Capture Worker: Starting execution...");

    // Initialize Supabase client with service role key for admin access
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get configuration from request or use defaults
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 10; // Process max 10 payments per run
    const maxAttempts = body.maxAttempts || 5; // Max retry attempts

    console.log(
      `📋 Configuration: batchSize=${batchSize}, maxAttempts=${maxAttempts}`
    );

    // Fetch pending payments from queue (ordered by creation time)
    const { data: pendingPayments, error: fetchError } = await supabase
      .from("payment_capture_queue")
      .select("*")
      .eq("status", "pending")
      .lt("attempts", maxAttempts)
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (fetchError) {
      throw new Error(`Failed to fetch queue: ${fetchError.message}`);
    }

    if (!pendingPayments || pendingPayments.length === 0) {
      console.log("✅ No pending payments in queue");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No pending payments",
          processed: 0,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`💳 Found ${pendingPayments.length} pending payments`);

    // Process each payment
    const results: CaptureResult[] = [];
    for (const payment of pendingPayments as QueuePayment[]) {
      const result = await processPayment(supabase, payment);
      results.push(result);

      // Small delay between requests to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Summary
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.length - successCount;

    console.log(
      `✅ Worker completed: ${successCount} succeeded, ${failureCount} failed`
    );

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        succeeded: successCount,
        failed: failureCount,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("❌ Worker error:", error);
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

/**
 * Process a single payment capture
 */
async function processPayment(
  supabase: any,
  payment: QueuePayment
): Promise<CaptureResult> {
  const paymentId = payment.id;
  const attempts = payment.attempts + 1;

  try {
    console.log(
      `🔄 Processing payment ${paymentId} (attempt ${attempts}/${5})`
    );

    // Validate payment status before attempting capture
    const { data: paymentIntent, error: piError } = await supabase
      .from("stripe_payment_intents")
      .select("status")
      .eq("id", payment.payment_intent_id)
      .single();

    if (piError) {
      throw new Error(`Failed to check payment status: ${piError.message}`);
    }

    // Only attempt capture if payment is authorized or in requires_capture state
    if (paymentIntent.status !== "authorized" && paymentIntent.status !== "requires_capture" && paymentIntent.status !== "processing") {
      console.log(`⚠️ Payment ${paymentId} has invalid status for capture: ${paymentIntent.status}`);
      
      // Mark as failed permanently - this payment cannot be captured
      await supabase
        .from("payment_capture_queue")
        .update({
          status: "failed",
          error_message: `Invalid payment status: ${paymentIntent.status}. Only 'authorized' or 'requires_capture' payments can be captured.`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentId);

      return {
        success: false,
        paymentId,
        error: `Invalid payment status: ${paymentIntent.status}`,
      };
    }

    // Mark as processing
    await supabase
      .from("payment_capture_queue")
      .update({
        status: "processing",
        attempts,
        last_attempt_at: new Date().toISOString(),
      })
      .eq("id", paymentId);

    // Call the Stripe payment Edge Function to capture
    const stripeEdgeFunctionUrl = Deno.env.get("STRIPE_EDGE_FUNCTION_URL");
    if (!stripeEdgeFunctionUrl) {
      throw new Error("STRIPE_EDGE_FUNCTION_URL not configured");
    }

    // Get Supabase auth token for Edge Function call
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!supabaseAnonKey) {
      throw new Error("SUPABASE_ANON_KEY not configured");
    }

    // Call stripe-payment Edge Function to capture
    const response = await fetch(stripeEdgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "apikey": supabaseAnonKey,
      },
      body: JSON.stringify({
        action: "capture",
        paymentIntentId: payment.payment_intent_id,
      }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || "Capture failed");
    }

    console.log(`✅ Payment ${paymentId} captured successfully`);

    // Mark as completed
    await supabase
      .from("payment_capture_queue")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);

    return {
      success: true,
      paymentId,
    };
  } catch (error) {
    console.error(`❌ Payment ${paymentId} failed:`, error.message);

    // Calculate exponential backoff (if max attempts not reached)
    const shouldRetry = attempts < 5;
    const finalStatus = shouldRetry ? "pending" : "failed";

    // Update queue with error
    await supabase
      .from("payment_capture_queue")
      .update({
        status: finalStatus,
        error_message: error.message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);

    return {
      success: false,
      paymentId,
      error: error.message,
    };
  }
}
