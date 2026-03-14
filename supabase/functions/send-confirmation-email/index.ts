// Supabase Edge Function: send-confirmation-email
// Sends a bilingual (EN + AM) registration confirmation email via Resend
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
    const { registration_id, lang } = await req.json();
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

    const titleEn = event?.title || "AgentPark Event";
    const titleAm = event?.title_am || titleEn;
    const dateEn = event?.date
      ? new Date(event.date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      : "TBD";
    const dateAm = event?.date
      ? new Date(event.date).toLocaleDateString("hy-AM", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      : "Չի նշված";
    const location = event?.location || "TBD";
    const isPaid = reg.payment_status === "paid" && reg.payment_amount > 0;
    const amountDisplay = isPaid ? `${reg.payment_amount.toLocaleString()} ${reg.payment_currency}` : "";

    // Primary language first based on user's site language
    const isAm = lang === "am";

    const sectionStyle = `background: #f8f9fa; border-radius: 16px; padding: 24px; margin-bottom: 16px;`;
    const cardStyle = `border: 1px solid #e9ecef; border-radius: 12px; padding: 20px; margin-bottom: 24px;`;
    const labelStyle = `padding: 8px 0; color: #6c757d; font-size: 13px;`;
    const valueStyle = `padding: 8px 0; color: #0D2740; font-size: 13px; font-weight: 600; text-align: right;`;
    const paidRowStyle = `border-top: 1px solid #e9ecef;`;
    const paidLabelStyle = `padding: 12px 0 8px; color: #6c757d; font-size: 13px;`;
    const paidValueStyle = `padding: 12px 0 8px; color: #CBA14B; font-size: 15px; font-weight: 700; text-align: right;`;

    function buildSection(t: { greeting: string; message: string; title: string; date: string; dateLabel: string; locationLabel: string; paidLabel: string }) {
      return `
        <div style="${sectionStyle}">
          <p style="color: #0D2740; font-size: 14px; margin: 0 0 4px;">${t.greeting}</p>
          <p style="color: #0D2740; font-size: 14px; margin: 0;">${t.message}</p>
        </div>
        <div style="${cardStyle}">
          <h2 style="color: #0D2740; font-size: 18px; margin: 0 0 16px;">${t.title}</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="${labelStyle}">${t.dateLabel}</td>
              <td style="${valueStyle}">${t.date}</td>
            </tr>
            <tr>
              <td style="${labelStyle}">${t.locationLabel}</td>
              <td style="${valueStyle}">${location}</td>
            </tr>
            ${isPaid ? `
            <tr style="${paidRowStyle}">
              <td style="${paidLabelStyle}">${t.paidLabel}</td>
              <td style="${paidValueStyle}">${amountDisplay}</td>
            </tr>` : ""}
          </table>
        </div>`;
    }

    const enSection = buildSection({
      greeting: `Hello <strong>${reg.name}</strong>,`,
      message: isPaid
        ? "Your payment has been received and your registration is confirmed!"
        : "Your registration is confirmed!",
      title: titleEn,
      date: dateEn,
      dateLabel: "Date",
      locationLabel: "Location",
      paidLabel: "Amount Paid",
    });

    const amSection = buildSection({
      greeting: `\u0540\u0561\u0580\u0563\u0565\u056c\u056b <strong>${reg.name}</strong>,`,
      message: isPaid
        ? "\u0541\u0565\u0580 \u057E\u0573\u0561\u0580\u0578\u0582\u0574\u0568 \u057D\u057F\u0561\u0581\u057E\u0565\u056c \u0567 \u0587 \u0563\u0580\u0561\u0576\u0581\u0578\u0582\u0574\u0568 \u0570\u0561\u057D\u057F\u0561\u057F\u057E\u0561\u056E \u0567\u0589"
        : "\u0541\u0565\u0580 \u0563\u0580\u0561\u0576\u0581\u0578\u0582\u0574\u0568 \u0570\u0561\u057D\u057F\u0561\u057F\u057E\u0561\u056E \u0567\u0589",
      title: titleAm,
      date: dateAm,
      dateLabel: "\u0531\u0574\u057D\u0561\u0569\u056B\u057E",
      locationLabel: "\u054E\u0561\u0575\u0580",
      paidLabel: "\u054E\u0573\u0561\u0580\u057E\u0561\u056E \u0563\u0578\u0582\u0574\u0561\u0580",
    });

    const primarySection = isAm ? amSection : enSection;
    const secondarySection = isAm ? enSection : amSection;

    const htmlBody = `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #0D2740; font-size: 24px; margin: 0;">AgentPark</h1>
          <p style="color: #CBA14B; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">
            ${isAm ? "\u0544\u056B\u057B\u0578\u0581\u0561\u057C\u0574\u0561\u0576 \u0563\u0580\u0561\u0576\u0581\u0578\u0582\u0574" : "Event Registration"} / ${isAm ? "Event Registration" : "\u0544\u056B\u057B\u0578\u0581\u0561\u057C\u0574\u0561\u0576 \u0563\u0580\u0561\u0576\u0581\u0578\u0582\u0574"}
          </p>
        </div>

        ${primarySection}

        <div style="border-top: 1px dashed #d1d5db; margin: 8px 0 24px; position: relative;">
          <span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #fff; padding: 0 12px; color: #9ca3af; font-size: 11px;">
            ${isAm ? "English" : "\u0540\u0561\u0575\u0565\u0580\u0565\u0576"}
          </span>
        </div>

        ${secondarySection}

        <p style="color: #6c757d; font-size: 12px; text-align: center; margin-top: 32px;">
          &copy; 2026 AgentPark Ltd. &bull; Yerevan, Armenia
        </p>
      </div>
    `;

    const subject = isAm
      ? `\u0533\u0580\u0561\u0576\u0581\u0578\u0582\u0574\u0568 \u0570\u0561\u057D\u057F\u0561\u057F\u057E\u0561\u056E \u0567\u0589 ${titleAm}`
      : `Registration Confirmed: ${titleEn}`;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${emailApiKey}`,
      },
      body: JSON.stringify({
        from: Deno.env.get("EMAIL_FROM") || "AgentPark <noreply@agentpark.am>",
        to: [reg.email],
        subject,
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
