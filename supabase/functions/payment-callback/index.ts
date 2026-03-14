// Supabase Edge Function: payment-callback
// Handles ACBA VPOS callback after payment attempt
// Deploy: supabase functions deploy payment-callback

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const orderId = url.searchParams.get("order_id");
    const status = url.searchParams.get("status"); // approved, declined, error
    const txnId = url.searchParams.get("txn_id");

    if (!orderId) {
      return new Response("Missing order_id", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find the registration
    const { data: reg, error: regErr } = await supabase
      .from("registrations")
      .select("id, event_id, payment_status, name, email")
      .eq("payment_order_id", orderId)
      .single();

    if (regErr || !reg) {
      return new Response("Registration not found", { status: 404 });
    }

    // Idempotency: if already paid, skip
    if (reg.payment_status === "paid") {
      const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:3000";
      return Response.redirect(`${siteUrl}/event.html?id=${reg.event_id}&payment=success`, 302);
    }

    const paymentMode = Deno.env.get("PAYMENT_MODE") || "test";

    if (paymentMode === "live") {
      // ── ACBA Server-to-server verification ──
      // IMPORTANT: Never trust redirect params alone.
      // Call ACBA's verification API to confirm the payment:
      //
      // const verifyRes = await fetch(Deno.env.get("ACBA_VERIFY_URL")!, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({
      //     client_id: Deno.env.get("ACBA_CLIENT_ID"),
      //     secret_key: Deno.env.get("ACBA_SECRET_KEY"),
      //     order_id: orderId,
      //   }),
      // });
      // const verifyData = await verifyRes.json();
      // Use verifyData.status instead of the URL param
    }

    const isApproved = status === "approved";

    // Update registration
    await supabase
      .from("registrations")
      .update({
        payment_status: isApproved ? "paid" : "failed",
        payment_txn_id: txnId || null,
        paid_at: isApproved ? new Date().toISOString() : null,
      })
      .eq("payment_order_id", orderId);

    // Log to payments audit
    await supabase.from("payments").insert({
      registration_id: reg.id,
      event_id: reg.event_id,
      order_id: orderId,
      amount: 0, // will be filled from registration
      currency: "AMD",
      status: isApproved ? "approved" : status || "declined",
      bank_response: { status, txn_id: txnId, callback_time: new Date().toISOString() },
    });

    // Send confirmation email on success
    if (isApproved) {
      try {
        const fnUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/send-confirmation-email";
        await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ registration_id: reg.id }),
        });
      } catch (emailErr) {
        console.error("Email sending failed:", emailErr);
        // Don't fail the callback because of email
      }
    }

    // Redirect user to event page
    const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:3000";
    const resultParam = isApproved ? "success" : "failed";
    return Response.redirect(
      `${siteUrl}/event.html?id=${reg.event_id}&payment=${resultParam}&order_id=${orderId}`,
      302
    );
  } catch (err) {
    console.error("Callback error:", err);
    return new Response("Internal error", { status: 500 });
  }
});
