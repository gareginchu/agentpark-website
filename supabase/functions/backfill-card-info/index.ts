// supabase/functions/backfill-card-info/index.ts
//
// One-shot admin endpoint. Loops through every paid registration that doesn't
// yet have card_country populated, queries ACBA's getOrderStatusExtended.do for
// each one, and writes the issuer-bank metadata into the row.
//
// Invoke once after migration 003 has run, e.g.:
//   curl -X POST https://<project>.supabase.co/functions/v1/backfill-card-info \
//        -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
//
// Returns a JSON summary of how many rows were updated, skipped, and failed.
//
// Required env (already set for payment-callback):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   ACBA_BASE_URL
//   ACBA_CLIENT_ID
//   ACBA_SECRET_KEY
//   ACBA_VERIFY_URL (optional override)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

interface AcbaStatusResponse {
  errorCode?: string;
  errorMessage?: string;
  orderStatus?: number;
  Pan?: string;
  cardAuthInfo?: { pan?: string; maskedPan?: string };
  bankInfo?: { bankName?: string; bankCountryCode?: string; bankCountryName?: string };
  attributes?: Array<{ name: string; value: string }>;
}

function brandFromPan(pan: string | null | undefined): string | null {
  if (!pan) return null;
  const first = pan[0];
  const first2 = pan.slice(0, 2);
  if (first === "4") return "visa";
  if (first === "5" || ["22", "23", "24", "25", "26", "27"].includes(first2)) return "mastercard";
  if (["34", "37"].includes(first2)) return "amex";
  if (first === "9") return "arca";
  if (first === "6") return "discover";
  return "unknown";
}

function extractCardInfo(s: AcbaStatusResponse) {
  const pan = s.cardAuthInfo?.maskedPan ?? s.cardAuthInfo?.pan ?? s.Pan ??
              s.attributes?.find((a) => a.name?.toLowerCase() === "pan")?.value ?? null;
  const country = s.bankInfo?.bankCountryCode ??
              s.attributes?.find((a) => a.name?.toLowerCase() === "bankcountrycode")?.value ?? null;
  const countryName = s.bankInfo?.bankCountryName ??
              s.attributes?.find((a) => a.name?.toLowerCase() === "bankcountryname")?.value ?? null;
  const bankName = s.bankInfo?.bankName ??
              s.attributes?.find((a) => a.name?.toLowerCase() === "bankname")?.value ?? null;
  return {
    card_pan_masked: pan,
    card_brand: brandFromPan(pan),
    card_country: country ? country.toUpperCase() : null,
    card_country_name: countryName,
    card_bank_name: bankName,
  };
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

serve(async (_req: Request): Promise<Response> => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pull every paid row that still lacks card_country (idempotent — re-runs are safe).
  const { data: rows, error } = await supabase
    .from("registrations")
    .select("id, payment_order_id")
    .eq("payment_status", "paid")
    .is("card_country", null)
    .not("payment_order_id", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let updated = 0;
  let skipped = 0;
  const failed: Array<{ id: string; reason: string }> = [];

  for (const r of rows ?? []) {
    try {
      const status = await verifyOrder(r.payment_order_id);
      if (status.errorCode && status.errorCode !== "0") {
        failed.push({ id: r.id, reason: `gateway: ${status.errorMessage ?? status.errorCode}` });
        continue;
      }
      const cardInfo = extractCardInfo(status);
      if (!cardInfo.card_country && !cardInfo.card_pan_masked) {
        skipped += 1;
        continue;
      }
      const { error: updErr } = await supabase
        .from("registrations")
        .update(cardInfo)
        .eq("id", r.id);
      if (updErr) {
        failed.push({ id: r.id, reason: `update: ${updErr.message}` });
      } else {
        updated += 1;
      }
      // Be polite to ACBA — pace the loop a bit.
      await new Promise((res) => setTimeout(res, 250));
    } catch (e) {
      failed.push({ id: r.id, reason: `exception: ${(e as Error).message}` });
    }
  }

  return new Response(
    JSON.stringify({ total: rows?.length ?? 0, updated, skipped, failed }, null, 2),
    { headers: { "Content-Type": "application/json" } },
  );
});
