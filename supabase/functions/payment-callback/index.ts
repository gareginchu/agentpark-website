// supabase/functions/payment-callback/index.ts
//
// Two responsibilities:
//   1) Customer redirect target: ACBA sends the browser to PUBLIC_SITE_URL/payments/callback?orderId=...
//      We verify with ACBA, mark the registration paid (idempotently), trigger the
//      confirmation email, and 302 the browser to the right thank-you / failure page.
//   2) Optional notificationUrl webhook: if you ask ACBA to enable server-to-server
//      callbacks, point them at the same URL with `?webhook=1` and we'll just return 200
//      after the same verify+update logic (no redirect).
//
// Required env vars (set via `supabase secrets set ...`):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   ACBA_BASE_URL          e.g. https://ipay.arca.am/payment/rest
//   ACBA_CLIENT_ID
//   ACBA_SECRET_KEY
//   ACBA_VERIFY_URL        full URL of getOrderStatusExtended.do (kept for backward compat)
//   PUBLIC_SITE_URL        e.g. https://agentpark.am

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// ---------- types ----------

interface AcbaStatusResponse {
  errorCode?: string;
  errorMessage?: string;
  orderStatus?: number;          // 0=registered, 1=preauth, 2=paid, 3=cancelled, 4=refunded, 5=ACS-init, 6=declined
  orderNumber?: string;          // we set this to registration_id at register time
  amount?: number;
  currency?: string;
  authRefNum?: string;           // auth reference, useful as txn id
  paymentAmountInfo?: { paymentState?: string };
  attributes?: Array<{ name: string; value: string }>;
}

// ---------- helpers ----------

function redirect(target: string): Response {
  return new Response(null, { status: 302, headers: { Location: target } });
}

// Build the event.html redirect for a known registration.
// event.html already handles ?payment=success and ?payment=failed.
function eventRedirect(siteUrl: string, eventId: string, payment: "success" | "failed", reason?: string): Response {
  const qs = new URLSearchParams({ id: eventId, payment });
  if (reason) qs.set("reason", reason);
  return redirect(`${siteUrl}/event.html?${qs.toString()}`);
}

// When we can't resolve a registration (unknown orderId, missing param, etc.) we
// don't know which event to send the user back to. Land them on the events list
// with a generic failure flag.
function fallbackRedirect(siteUrl: string, reason: string): Response {
  return redirect(`${siteUrl}/?payment=failed&reason=${encodeURIComponent(reason)}`);
}

async function verifyOrder(orderId: string): Promise<AcbaStatusResponse> {
  const verifyUrl =
    Deno.env.get("ACBA_VERIFY_URL") ??
    `${Deno.env.get("ACBA_BASE_URL")!.replace(/\/+$/, "")}/getOrderStatusExtended.do`;

  const params = new URLSearchParams({
    userName: Deno.env.get("ACBA_CLIENT_ID")!,
    password: Deno.env.get("ACBA_SECRET_KEY")!,
    orderId,
  });

  const resp = await fetch(verifyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  return await resp.json() as AcbaStatusResponse;
}

function pickTxnId(s: AcbaStatusResponse): string | null {
  if (s.authRefNum) return s.authRefNum;
  const attr = s.attributes?.find((a) => a.name?.toLowerCase() === "rrn");
  return attr?.value ?? null;
}

// ---------- main ----------

serve(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const orderId = url.searchParams.get("orderId");
  const isWebhook = url.searchParams.get("webhook") === "1";
  const siteUrl = Deno.env.get("PUBLIC_SITE_URL")!.replace(/\/+$/, "");

  if (!orderId) {
    return isWebhook
      ? new Response("missing orderId", { status: 400 })
      : fallbackRedirect(siteUrl, "missing_order");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1. Find the registration by EPG orderId
  const { data: registration, error: lookupErr } = await supabase
    .from("registrations")
    .select("id, event_id, payment_status, payment_amount, payment_currency, payment_order_id")
    .eq("payment_order_id", orderId)
    .single();

  if (lookupErr || !registration) {
    console.warn("callback: unknown orderId", orderId, lookupErr);
    return isWebhook
      ? new Response("unknown order", { status: 404 })
      : fallbackRedirect(siteUrl, "unknown_order");
  }

  // 2. Idempotency: if already finalised, skip the work and just redirect
  if (registration.payment_status === "paid") {
    return isWebhook
      ? new Response("already paid", { status: 200 })
      : eventRedirect(siteUrl, registration.event_id, "success");
  }
  if (registration.payment_status === "failed" || registration.payment_status === "declined") {
    return isWebhook
      ? new Response("already failed", { status: 200 })
      : eventRedirect(siteUrl, registration.event_id, "failed");
  }

  // 3. Verify with ACBA — never trust the redirect alone
  let status: AcbaStatusResponse;
  try {
    status = await verifyOrder(orderId);
  } catch (e) {
    console.error("verifyOrder network error", e);
    return isWebhook
      ? new Response("verify failed", { status: 502 })
      : eventRedirect(siteUrl, registration.event_id, "failed", "verify_failed");
  }

  if (status.errorCode && status.errorCode !== "0") {
    console.warn("verifyOrder gateway error", status);
    await supabase.from("registrations")
      .update({ payment_status: "failed" })
      .eq("id", registration.id)
      .eq("payment_status", "pending");                 // optimistic guard
    return isWebhook
      ? new Response("gateway error", { status: 200 })
      : eventRedirect(siteUrl, registration.event_id, "failed");
  }

  // 4. Branch on orderStatus
  // 2 = paid, 1 = pre-authorized, 6 = declined, others = treat as failed/pending
  if (status.orderStatus === 2) {
    // Sanity-check the amount the gateway thinks it captured.
    if (typeof status.amount === "number" && status.amount !== registration.payment_amount) {
      console.error("amount mismatch", { expected: registration.payment_amount, got: status.amount });
      await supabase.from("registrations")
        .update({ payment_status: "amount_mismatch" })
        .eq("id", registration.id)
        .eq("payment_status", "pending");
      return isWebhook
        ? new Response("amount mismatch", { status: 200 })
        : eventRedirect(siteUrl, registration.event_id, "failed", "amount_mismatch");
    }

    // Idempotent update: only flip from `pending` to `paid`.
    const { data: updated, error: updErr } = await supabase
      .from("registrations")
      .update({
        payment_status: "paid",
        paid_at: new Date().toISOString(),
        payment_txn_id: pickTxnId(status),
      })
      .eq("id", registration.id)
      .eq("payment_status", "pending")
      .select("id")
      .maybeSingle();

    if (updErr) {
      console.error("paid update failed", updErr);
    }

    // Fire confirmation email — only if we won the race (i.e. we just transitioned).
    if (updated) {
      try {
        const fnUrl = `${Deno.env.get("SUPABASE_URL")!.replace(/\/+$/, "")}/functions/v1/send-confirmation-email`;
        await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ registration_id: registration.id }),
        });
      } catch (e) {
        // Don't fail the user-facing redirect just because email failed; admin
        // can resend manually from admin.html.
        console.error("confirmation email trigger failed", e);
      }
    }

    return isWebhook
      ? new Response("ok", { status: 200 })
      : eventRedirect(siteUrl, registration.event_id, "success");
  }

  if (status.orderStatus === 6) {
    await supabase.from("registrations")
      .update({ payment_status: "declined" })
      .eq("id", registration.id)
      .eq("payment_status", "pending");
    return isWebhook
      ? new Response("declined", { status: 200 })
      : eventRedirect(siteUrl, registration.event_id, "failed", "declined");
  }

  // Status 0 (registered, not paid) or anything else: leave row as pending so the
  // periodic reconciler can pick it up later. event.html only handles success/failed,
  // so surface this to the user as failed-with-pending-reason; the reconciler may
  // promote it to paid afterwards if the bank eventually confirms.
  return isWebhook
    ? new Response("pending", { status: 200 })
    : eventRedirect(siteUrl, registration.event_id, "failed", "pending_at_gateway");
});
