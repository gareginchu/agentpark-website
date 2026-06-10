// supabase/functions/create-payment-order/index.ts
//
// Called by the frontend (`config.js`) when PAYMENT_MODE === 'live'.
// Creates a pending registration, calls ACBA/ARCA register.do, returns formUrl.
//
// Required Deno env vars (set via `supabase secrets set ...`):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   ACBA_BASE_URL          e.g. https://ipay.arca.am/payment/rest
//   ACBA_CLIENT_ID         API username issued by ACBA
//   ACBA_SECRET_KEY        API password issued by ACBA
//   PUBLIC_SITE_URL        e.g. https://agentpark.am   (used to build returnUrl)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ---------- types ----------

interface CreateOrderRequest {
  event_id: string;
  ticket_tier_id: string;
  name: string;
  email: string;
  phone?: string;
  lang?: "en" | "am";          // UI language; defaults to "en"
  // For tiers with custom_amount=true (e.g. Scholarship Holders):
  custom_amount_amd?: number;       // self-chosen amount, in whole AMD
  scholarship_name?: string;        // free-text scholarship label
  scholarship_confirmed?: boolean;  // organizing team has verified status
}

interface TicketTier {
  id: string;
  price_amd?: number;       // canonical price, in whole AMD (absent when custom_amount=true)
  custom_amount?: boolean;  // when true, amount comes from the request, not the tier
  label_en?: string;
  label_am?: string;
  deadline?: string;
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

function isUuid(s: unknown): s is string {
  return typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function isEmail(s: unknown): s is string {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254;
}

// ---------- main ----------

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // 1. Parse + validate input
  let body: CreateOrderRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { event_id, ticket_tier_id, name, email, phone, lang,
          custom_amount_amd, scholarship_name, scholarship_confirmed } = body;
  const uiLang: "en" | "am" = lang === "am" ? "am" : "en";

  if (!isUuid(event_id))           return json({ error: "invalid_event_id" }, 400);
  if (typeof ticket_tier_id !== "string" || !ticket_tier_id) return json({ error: "invalid_ticket_tier_id" }, 400);
  if (typeof name !== "string" || name.trim().length < 2 || name.length > 120) return json({ error: "invalid_name" }, 400);
  if (!isEmail(email))             return json({ error: "invalid_email" }, 400);
  if (phone !== undefined && (typeof phone !== "string" || phone.length > 32)) return json({ error: "invalid_phone" }, 400);
  if (scholarship_name !== undefined && (typeof scholarship_name !== "string" || scholarship_name.length > 200)) {
    return json({ error: "invalid_scholarship_name" }, 400);
  }
  if (scholarship_confirmed !== undefined && typeof scholarship_confirmed !== "boolean") {
    return json({ error: "invalid_scholarship_confirmed" }, 400);
  }

  // 2. Look up canonical price from DB (never trust the client)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: event, error: eventErr } = await supabase
    .from("events")
    .select("id, title, title_am, ticket_tiers")
    .eq("id", event_id)
    .single();

  if (eventErr || !event) {
    return json({ error: "event_not_found" }, 404);
  }

  const tiers = (event.ticket_tiers as TicketTier[] | null) ?? [];
  const tier = tiers.find((t) => t.id === ticket_tier_id);
  if (!tier) {
    return json({ error: "ticket_tier_not_found" }, 404);
  }

  // Resolve amount in whole AMD.
  //   - Standard tier: amount comes from tier.price_amd.
  //   - custom_amount tier (Scholarship Holders): amount comes from the
  //     request's custom_amount_amd, with bounds, and scholarship_name is
  //     required.
  let amountAmd: number;
  if (tier.custom_amount === true) {
    if (typeof custom_amount_amd !== "number" || !Number.isFinite(custom_amount_amd)) {
      return json({ error: "invalid_custom_amount" }, 400);
    }
    if (custom_amount_amd < 1000 || custom_amount_amd > 1_000_000) {
      // Floor 1,000 AMD (~€2.30). Ceiling 1,000,000 AMD (~€2,300).
      return json({ error: "custom_amount_out_of_range" }, 400);
    }
    if (typeof scholarship_name !== "string" || scholarship_name.trim().length < 2) {
      return json({ error: "scholarship_name_required" }, 400);
    }
    amountAmd = Math.round(custom_amount_amd);
  } else {
    if (typeof tier.price_amd !== "number" || tier.price_amd <= 0) {
      return json({ error: "ticket_tier_invalid_price" }, 404);
    }
    amountAmd = tier.price_amd;
  }

  // Optional: enforce tier deadline
  if (tier.deadline && new Date(tier.deadline) < new Date()) {
    return json({ error: "tier_deadline_passed" }, 400);
  }

  // 3. Insert pending registration row
  const amountLuma = amountAmd * 100;                 // AMD luma (minor unit)
  const currencyIso = "051";                          // AMD ISO 4217 numeric

  const regRow: Record<string, unknown> = {
    event_id,
    ticket_tier_id,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    phone: phone?.trim() ?? null,
    payment_status: "pending",
    payment_amount: amountLuma,
    payment_currency: currencyIso,
  };
  if (tier.custom_amount === true) {
    regRow.scholarship_name = scholarship_name?.trim() ?? null;
    regRow.scholarship_confirmed = scholarship_confirmed ?? null;
  }

  const { data: registration, error: regErr } = await supabase
    .from("registrations")
    .insert(regRow)
    .select("id")
    .single();

  if (regErr || !registration) {
    console.error("registration insert failed", regErr);
    return json({ error: "registration_insert_failed" }, 500);
  }

  const registrationId = registration.id as string;

  // 4. Call ACBA register.do
  const baseUrl = Deno.env.get("ACBA_BASE_URL")!.replace(/\/+$/, "");
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL")!.replace(/\/+$/, "");

  // SmartVista's orderNumber field is AN 1..32. UUIDs are 36 chars with dashes —
  // strip them to get a deterministic 32-hex-char id that maps 1:1 to registration_id.
  const orderNumber = registrationId.replace(/-/g, "");

  // Pick the title/label that matches the user's UI language; fall back to the other.
  const eventTitle =
    (uiLang === "am" ? (event as any).title_am : (event as any).title) ??
    (event as any).title ?? (event as any).title_am ?? "AgentPark event";
  const tierLabel =
    (uiLang === "am" ? tier.label_am : tier.label_en) ??
    tier.label_en ?? tier.label_am ?? tier.id;

  const params = new URLSearchParams({
    userName: Deno.env.get("ACBA_CLIENT_ID")!,
    password: Deno.env.get("ACBA_SECRET_KEY")!,
    orderNumber,
    amount: String(amountLuma),
    currency: currencyIso,
    // ACBA does not support {orderId} placeholder substitution and rejects
    // URLs containing literal '{' / '}' as invalid. Send a clean URL — the
    // gateway appends ?orderId=... itself when redirecting the customer back.
    returnUrl: `${siteUrl}/payments/callback`,
    description: `${eventTitle} (${tierLabel})`,
    language: uiLang,
    // Helpful metadata; surfaces on the merchant dashboard
    jsonParams: JSON.stringify({
      registrationId,
      eventId: event_id,
      tierId: ticket_tier_id,
      customerName: name.trim(),
      customerEmail: email.trim().toLowerCase(),
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
    await supabase.from("registrations")
      .update({ payment_status: "failed" })
      .eq("id", registrationId);
    return json({ error: "gateway_unreachable" }, 502);
  }

  if (acba.errorCode && acba.errorCode !== "0") {
    console.error("acba register.do rejected", acba);
    await supabase.from("registrations")
      .update({ payment_status: "failed" })
      .eq("id", registrationId);
    return json({
      error: "gateway_rejected",
      gateway_code: acba.errorCode,
      gateway_message: acba.errorMessage,
    }, 502);
  }

  if (!acba.orderId || !acba.formUrl) {
    console.error("acba register.do incomplete response", acba);
    return json({ error: "gateway_invalid_response" }, 502);
  }

  // 5. Save the EPG orderId so the callback can join on it
  await supabase.from("registrations")
    .update({ payment_order_id: acba.orderId })
    .eq("id", registrationId);

  // 6. Hand the formUrl back to the frontend; it will window.location to it
  return json({
    registration_id: registrationId,
    order_id: acba.orderId,
    form_url: acba.formUrl,
  });
});
