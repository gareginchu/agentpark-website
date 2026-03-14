// Supabase Edge Function: create-payment-order
// Creates a pending registration and returns a payment URL
// Deploy: supabase functions deploy create-payment-order

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
    const { event_id, name, email } = await req.json();
    if (!event_id || !name || !email) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch event to get price
    const { data: event, error: evErr } = await supabase
      .from("events")
      .select("id, title, price, currency, date")
      .eq("id", event_id)
      .single();

    if (evErr || !event) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!event.price || event.price <= 0) {
      return new Response(JSON.stringify({ error: "This is a free event — use direct registration" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Generate order ID
    const orderId = "AP_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);

    // Create pending registration
    const { data: reg, error: regErr } = await supabase
      .from("registrations")
      .insert({
        event_id,
        name,
        email,
        payment_status: "pending",
        payment_amount: event.price,
        payment_currency: event.currency || "AMD",
        payment_order_id: orderId,
      })
      .select("id")
      .single();

    if (regErr) {
      return new Response(JSON.stringify({ error: "Failed to create registration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paymentMode = Deno.env.get("PAYMENT_MODE") || "test";
    let paymentUrl: string;

    if (paymentMode === "live") {
      // ── ACBA VPOS Integration ──
      // When you have ACBA credentials, implement the real API call here:
      //
      // const acbaResponse = await fetch(Deno.env.get("ACBA_API_URL")!, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({
      //     client_id: Deno.env.get("ACBA_CLIENT_ID"),
      //     secret_key: Deno.env.get("ACBA_SECRET_KEY"),
      //     amount: event.price,
      //     currency: event.currency || "AMD",
      //     order_id: orderId,
      //     description: `AgentPark Event: ${event.title}`,
      //     return_url: `${Deno.env.get("SITE_URL")}/event.html?id=${event_id}&payment=success`,
      //     fail_url: `${Deno.env.get("SITE_URL")}/event.html?id=${event_id}&payment=failed`,
      //   }),
      // });
      // const acbaData = await acbaResponse.json();
      // paymentUrl = acbaData.payment_url;
      //
      // For now, fall through to test mode:
      paymentUrl = ""; // Replace with acbaData.payment_url
    } else {
      // Test mode — redirect to local test payment page
      const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:3000";
      const returnUrl = `${siteUrl}/event.html?id=${event_id}`;
      paymentUrl = `${siteUrl}/payment-test.html?order_id=${orderId}&amount=${event.price}&currency=${event.currency || "AMD"}&event_title=${encodeURIComponent(event.title)}&name=${encodeURIComponent(name)}&registration_id=${reg.id}&event_id=${event_id}&return_url=${encodeURIComponent(returnUrl)}`;
    }

    // Log payment creation
    await supabase.from("payments").insert({
      registration_id: reg.id,
      event_id,
      order_id: orderId,
      amount: event.price,
      currency: event.currency || "AMD",
      status: "created",
    });

    return new Response(
      JSON.stringify({ payment_url: paymentUrl, order_id: orderId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
