// Supabase Edge Function: send-certificate-email
// Sends a personalized certificate PNG via email to the participant
// Deploy: supabase functions deploy send-certificate-email

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
    const { event_id, first_name, last_name, email, certificate_png } = await req.json();
    if (!event_id || !first_name || !last_name || !email || !certificate_png) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fullName = first_name.trim() + " " + last_name.trim();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get event details for the email
    const { data: event } = await supabase
      .from("events")
      .select("title, title_am, date")
      .eq("id", event_id)
      .single();

    const emailApiKey = Deno.env.get("EMAIL_API_KEY");
    if (!emailApiKey) {
      return new Response(JSON.stringify({ error: "Email not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventTitleEn = event?.title || "AgentPark Event";
    const eventTitleAm = event?.title_am || eventTitleEn;
    const eventDateEn = event?.date
      ? new Date(event.date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      : "";
    const eventDateAm = event?.date
      ? new Date(event.date).toLocaleDateString("hy-AM", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
      : "";
    const emailFrom = Deno.env.get("EMAIL_FROM") || "AgentPark <noreply@agentpark.am>";

    const htmlBody = `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #0D2740; font-size: 24px; margin: 0;">AgentPark</h1>
          <p style="color: #CBA14B; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">\u0544\u0561\u057D\u0576\u0561\u056F\u0581\u0578\u0582\u0569\u0575\u0561\u0576 \u057E\u056F\u0561\u0575\u0561\u0563\u056B\u0580 / Certificate of Participation</p>
        </div>
        <div style="background: #f8f9fa; border-radius: 16px; padding: 24px; margin-bottom: 16px;">
          <p style="color: #0D2740; font-size: 14px; margin: 0 0 8px;">\u0540\u0561\u0580\u0563\u0565\u056c\u056b <strong>${fullName}</strong>,</p>
          <p style="color: #0D2740; font-size: 14px; margin: 0 0 16px;">
            \u0547\u0576\u0578\u0580\u0570\u0561\u056F\u0561\u056C\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u201C<strong>${eventTitleAm}</strong>\u201D \u0574\u056B\u057B\u0578\u0581\u0561\u057C\u0574\u0561\u0576\u0568 \u0574\u0561\u057D\u0576\u0561\u056F\u0581\u0565\u056C\u0578\u0582 \u0570\u0561\u0574\u0561\u0580${eventDateAm ? ", \u0578\u0580\u0568 \u056F\u0561\u0575\u0561\u0581\u0565\u056C \u0567 " + eventDateAm : ""}\u0589 \u0541\u0565\u0580 \u0574\u0561\u057D\u0576\u0561\u056F\u0581\u0578\u0582\u0569\u0575\u0561\u0576 \u057E\u056F\u0561\u0575\u0561\u0563\u056B\u0580\u0568 \u056F\u0581\u057E\u0561\u056E \u0567 \u0561\u0575\u057D \u0576\u0561\u0574\u0561\u056F\u056B\u0576\u0589
          </p>
          <p style="color: #0D2740; font-size: 14px; margin: 0;">\u0570\u0561\u0580\u0563\u0561\u0576\u0584\u0576\u0565\u0580\u0578\u057E,<br><strong>AgentPark \u0569\u056B\u0574</strong></p>
          <div style="text-align: center; margin-top: 16px;">
            <img src="https://agentpark-website.pages.dev/Brand_assets/AgentPark_logo@2x.png" alt="AgentPark" style="height: 24px; width: auto;">
          </div>
        </div>
        <div style="border-top: 1px dashed #d1d5db; margin: 8px 0 16px; position: relative;">
          <span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #fff; padding: 0 12px; color: #9ca3af; font-size: 11px;">English</span>
        </div>
        <div style="background: #f8f9fa; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
          <p style="color: #0D2740; font-size: 14px; margin: 0 0 8px;">Dear <strong>${fullName}</strong>,</p>
          <p style="color: #0D2740; font-size: 14px; margin: 0 0 16px;">
            Thank you for participating in the <strong>${eventTitleEn}</strong> seminar${eventDateEn ? " on " + eventDateEn : ""}. Your certificate of participation is attached to this email.
          </p>
          <p style="color: #0D2740; font-size: 14px; margin: 16px 0 0;">With best regards,<br><strong>AgentPark Team</strong></p>
          <div style="text-align: center; margin-top: 16px;">
            <img src="https://agentpark-website.pages.dev/Brand_assets/AgentPark_logo@2x.png" alt="AgentPark" style="height: 24px; width: auto;">
          </div>
        </div>
        <p style="color: #6c757d; font-size: 12px; text-align: center; margin-top: 32px;">
          &copy; 2026 AgentPark Ltd. &bull; Yerevan, Armenia
        </p>
      </div>
    `;

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${emailApiKey}`,
      },
      body: JSON.stringify({
        from: emailFrom,
        to: [email],
        subject: `Your Certificate: ${eventTitleEn}`,
        html: htmlBody,
        attachments: [
          {
            filename: `Certificate-${fullName.replace(/\s+/g, "-")}.png`,
            content: certificate_png,
          },
        ],
      }),
    });

    if (!emailRes.ok) {
      const errText = await emailRes.text();
      console.error("Resend error:", errText);
      return new Response(JSON.stringify({ error: "Email send failed", detail: errText }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Certificate email error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
