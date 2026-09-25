// supabase/functions/create-maintenance-order/index.ts
//
// Creates a maintenance_subscriptions row and calls ACBA to get a formUrl.
//
// Required env vars (same as create-payment-order):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   ACBA_BASE_URL          e.g. https://ipay.arca.am/payment/rest
//   ACBA_CLIENT_ID
//   ACBA_SECRET_KEY
//   PUBLIC_SITE_URL        e.g. https://agentpark.am
//
// Optional env vars (override defaults if AMD rate drifts):
//   MAINTENANCE_MONTHLY_AMD   AMD amount for monthly plan  (default: 13_580_000 luma = 135,800 AMD ≈ $350)
//   MAINTENANCE_ANNUAL_AMD    AMD amount for annual plan   (default: 151_320_000 luma = 1,513,200 AMD ≈ $3,900)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ---------- types ----------

interface CreateMaintenanceOrderRequest {
  name: string;
  email: string;
  plan: "monthly" | "annual";
}

interface AcbaRegisterResponse {
  orderId?: string;
  formUrl?: string;
  errorCode?: string;
  errorMessage?: string;
}

// ---------- helpers ----------

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isEmail(s: unknown): s is string {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

// ---------- plan config ----------

// Amounts in AMD luma (AMD × 100). Defaults assume ~388 AMD/USD.
// Override via env vars if the rate drifts significantly.
const PLAN_AMOUNTS: Record<"monthly" | "annual", { amountLuma: number; amountUsd: number; label: string }> = {
  monthly: {
    amountLuma: Number(Deno.env.get("MAINTENANCE_MONTHLY_AMD") ?? "13580000"),
    amountUsd: 350,
    label: "Annual Website Maintenance — Monthly Billing",
  },
  annual: {
    amountLuma: Number(Deno.env.get("MAINTENANCE_ANNUAL_AMD") ?? "151320000"),
    amountUsd: 3900,
    label: "Annual Website Maintenance — Annual Prepay (7.1% discount)",
  },
};

const CURRENCY_ISO = "051"; // AMD

const ORGANISATION = "Ararat-Eskijian Museum and Research Center";

// ---------- main ----------

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST")   return json({ error: "method_not_allowed" }, 405);

  // 1. Parse + validate
  let body: CreateMaintenanceOrderRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { name, email, plan } = body;

  if (typeof name !== "string" || name.trim().length < 2 || name.length > 120) {
    return json({ error: "invalid_name" }, 400);
  }
  if (!isEmail(email)) {
    return json({ error: "invalid_email" }, 400);
  }
  if (plan !== "monthly" && plan !== "annual") {
    return json({ error: "invalid_plan" }, 400);
  }

  const planConfig = PLAN_AMOUNTS[plan];

  // 2. Insert pending subscription row
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: subscription, error: insertErr } = await supabase
    .from("maintenance_subscriptions")
    .insert({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      organisation: ORGANISATION,
      plan,
      payment_amount_luma: planConfig.amountLuma,
      payment_amount_usd: planConfig.amountUsd,
      payment_currency: CURRENCY_ISO,
      payment_status: "pending",
    })
    .select("id")
    .single();

  if (insertErr || !subscription) {
    console.error("maintenance_subscriptions insert failed", insertErr);
    return json({ error: "subscription_insert_failed" }, 500);
  }

  const subscriptionId = subscription.id as string;

  // 3. Call ACBA register.do
  const baseUrl = Deno.env.get("ACBA_BASE_URL")!.replace(/\/+$/, "");
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL")!.replace(/\/+$/, "");

  // 32-hex orderNumber derived from subscription UUID (same pattern as event registrations)
  const orderNumber = subscriptionId.replace(/-/g, "");

  const params = new URLSearchParams({
    userName:    Deno.env.get("ACBA_CLIENT_ID")!,
    password:    Deno.env.get("ACBA_SECRET_KEY")!,
    orderNumber,
    amount:      String(planConfig.amountLuma),
    currency:    CURRENCY_ISO,
    returnUrl:   `${siteUrl}/payments/callback`,
    description: planConfig.label,
    language:    "en",
    jsonParams:  JSON.stringify({
      subscriptionId,
      orderType:     "maintenance",
      plan,
      customerName:  name.trim(),
      customerEmail: email.trim().toLowerCase(),
      organisation:  ORGANISATION,
    }),
  });

  let acba: AcbaRegisterResponse;
  try {
    const resp = await fetch(`${baseUrl}/register.do`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    acba = await resp.json();
  } catch (e) {
    console.error("acba register.do network error", e);
    await supabase
      .from("maintenance_subscriptions")
      .update({ payment_status: "failed" })
      .eq("id", subscriptionId);
    return json({ error: "gateway_unreachable" }, 502);
  }

  if (acba.errorCode && acba.errorCode !== "0") {
    console.error("acba register.do rejected", acba);
    await supabase
      .from("maintenance_subscriptions")
      .update({ payment_status: "failed" })
      .eq("id", subscriptionId);
    return json({
      error:           "gateway_rejected",
      gateway_code:    acba.errorCode,
      gateway_message: acba.errorMessage,
    }, 502);
  }

  if (!acba.orderId || !acba.formUrl) {
    console.error("acba register.do incomplete response", acba);
    return json({ error: "gateway_invalid_response" }, 502);
  }

  // 4. Persist the ACBA orderId so the callback can join on it
  await supabase
    .from("maintenance_subscriptions")
    .update({ payment_order_id: acba.orderId })
    .eq("id", subscriptionId);

  return json({
    subscription_id: subscriptionId,
    order_id:        acba.orderId,
    form_url:        acba.formUrl,
  });
});
