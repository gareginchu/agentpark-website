// Supabase Edge Function: send-confirmation-email
// Sends a registration confirmation email via Resend
// Deploy: supabase functions deploy send-confirmation-email

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
    const { registration_id } = await req.json();
    if (!registration_id) {
      return new Response(JSON.stringify({ error: "Missing registration_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch registration + event details
    const { data: reg, error: regErr } = await supabase
      .from("registrations")
      .select("id, name, email, payment_status, payment_amount, payment_currency, event_id")
      .eq("id", registration_id)
      .single();

    if (regErr || !reg) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: event } = await supabase
      .from("events")
      .select("title, title_am, date, end_date, location")
      .eq("id", reg.event_id)
      .single();

    const emailApiKey = Deno.env.get("EMAIL_API_KEY");
    if (!emailApiKey) {
      console.log("EMAIL_API_KEY not set — skipping email send");
      return new Response(JSON.stringify({ skipped: true, reason: "No email API key" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventTitle = event?.title || "AgentPark Event";
    const eventDate = event?.date
      ? new Date(event.date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      : "TBD";
    const eventLocation = event?.location || "TBD";
    const isPaid = reg.payment_status === "paid" && reg.payment_amount > 0;

    const htmlBody = `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #0D2740; font-size: 24px; margin: 0;">AgentPark</h1>
          <p style="color: #CBA14B; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">Event Registration</p>
        </div>

        <div style="background: #f8f9fa; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
          <p style="color: #0D2740; font-size: 14px; margin: 0 0 4px;">Hello <strong>${reg.name}</strong>,</p>
          <p style="color: #0D2740; font-size: 14px; margin: 0;">
            ${isPaid
              ? "Your payment has been received and your registration is confirmed!"
              : "Your registration is confirmed!"}
          </p>
        </div>

        <div style="border: 1px solid #e9ecef; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
          <h2 style="color: #0D2740; font-size: 18px; margin: 0 0 16px;">${eventTitle}</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6c757d; font-size: 13px;">Date</td>
              <td style="padding: 8px 0; color: #0D2740; font-size: 13px; font-weight: 600; text-align: right;">${eventDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6c757d; font-size: 13px;">Location</td>
              <td style="padding: 8px 0; color: #0D2740; font-size: 13px; font-weight: 600; text-align: right;">${eventLocation}</td>
            </tr>
            ${isPaid ? `
            <tr style="border-top: 1px solid #e9ecef;">
              <td style="padding: 12px 0 8px; color: #6c757d; font-size: 13px;">Amount Paid</td>
              <td style="padding: 12px 0 8px; color: #CBA14B; font-size: 15px; font-weight: 700; text-align: right;">${reg.payment_amount.toLocaleString()} ${reg.payment_currency}</td>
            </tr>
            ` : ""}
          </table>
        </div>

        <p style="color: #6c757d; font-size: 12px; text-align: center; margin-top: 32px;">
          &copy; 2026 AgentPark Ltd. &bull; Yerevan, Armenia
        </p>
      </div>
    `;

    // Send via Resend
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${emailApiKey}`,
      },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM") || "AgentPark <noreply@agentpark.am>",
        to: [reg.email],
        subject: `Registration Confirmed: ${eventTitle}`,
        html: htmlBody,
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("Resend error:", errText);
      return new Response(JSON.stringify({ error: "Email send failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark email as sent
    await supabase
      .from("registrations")
      .update({ email_sent: true })
      .eq("id", registration_id);

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Email function error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
