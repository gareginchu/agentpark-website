// Supabase Edge Function: send-certificate-email
// Generates a personalized certificate PDF and emails it to the participant
// Deploy: supabase functions deploy send-certificate-email

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { event_id, first_name, last_name, email } = await req.json();
    if (!event_id || !first_name || !last_name || !email) {
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

    // 1. Get event with certificate template
    const { data: event, error: evErr } = await supabase
      .from("events")
      .select("title, title_am, date, certificate_template")
      .eq("id", event_id)
      .single();

    if (evErr || !event || !event.certificate_template) {
      return new Response(JSON.stringify({ error: "Event or certificate template not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Verify participant exists
    const { data: regs } = await supabase
      .from("registrations")
      .select("id, name")
      .eq("event_id", event_id);

    const fnLower = first_name.trim().toLowerCase();
    const lnLower = last_name.trim().toLowerCase();
    const match = (regs || []).find((r: { name: string }) => {
      const regName = (r.name || "").toLowerCase().trim();
      return regName === fullName.toLowerCase().trim() ||
        (regName.includes(fnLower) && regName.includes(lnLower));
    });

    if (!match) {
      return new Response(JSON.stringify({ error: "Participant not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Check email API key
    const emailApiKey = Deno.env.get("EMAIL_API_KEY");
    if (!emailApiKey) {
      return new Response(JSON.stringify({ error: "Email not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Fetch certificate template
    const templateUrl = event.certificate_template;
    const templateRes = await fetch(templateUrl);
    if (!templateRes.ok) {
      return new Response(JSON.stringify({ error: "Could not fetch certificate template" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const contentType = templateRes.headers.get("content-type") || "";
    const templateBytes = new Uint8Array(await templateRes.arrayBuffer());

    // 5. Generate PDF
    const urlLower = templateUrl.toLowerCase();
    const isPdf = urlLower.includes(".pdf") || contentType.includes("pdf");
    const isPng = urlLower.includes(".png") || contentType.includes("png");

    let pdfDoc: PDFDocument;
    let page;

    if (isPdf) {
      pdfDoc = await PDFDocument.load(templateBytes);
      page = pdfDoc.getPages()[0];
    } else {
      pdfDoc = await PDFDocument.create();
      let img;
      if (isPng) {
        img = await pdfDoc.embedPng(templateBytes);
      } else {
        img = await pdfDoc.embedJpg(templateBytes);
      }
      page = pdfDoc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }

    // Overlay name
    const font = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);
    let fontSize = 96;
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();
    let textWidth = font.widthOfTextAtSize(fullName, fontSize);
    while (textWidth > pageWidth * 0.5 && fontSize > 14) {
      fontSize -= 1;
      textWidth = font.widthOfTextAtSize(fullName, fontSize);
    }
    const x = (pageWidth - textWidth) / 2;
    const y = pageHeight * 0.54;
    page.drawText(fullName, { x, y, size: fontSize, font, color: rgb(0.05, 0.15, 0.25) });

    const pdfBytes = await pdfDoc.save();

    // 6. Convert to base64 for email attachment
    // Convert to base64 in chunks to avoid stack overflow
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      const chunk = pdfBytes.slice(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    const base64Pdf = btoa(binary);

    // 7. Send email with attachment via Resend
    const eventTitleEn = event.title || "AgentPark Event";
    const eventTitleAm = event.title_am || eventTitleEn;
    const emailFrom = Deno.env.get("EMAIL_FROM") || "AgentPark <noreply@agentpark.am>";

    const htmlBody = `
      <div style="font-family: 'Inter', Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #0D2740; font-size: 24px; margin: 0;">AgentPark</h1>
          <p style="color: #CBA14B; font-size: 12px; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px;">Certificate of Participation / \u0544\u0561\u057D\u0576\u0561\u056F\u0581\u0578\u0582\u0569\u0575\u0561\u0576 \u057E\u056F\u0561\u0575\u0561\u0563\u056B\u0580</p>
        </div>
        <div style="background: #f8f9fa; border-radius: 16px; padding: 24px; margin-bottom: 16px;">
          <p style="color: #0D2740; font-size: 14px; margin: 0 0 8px;">Dear <strong>${fullName}</strong>,</p>
          <p style="color: #0D2740; font-size: 14px; margin: 0 0 16px;">
            Thank you for participating in the <strong>${eventTitleEn}</strong> seminar. Your certificate of participation is attached to this email.
          </p>
          <p style="color: #0D2740; font-size: 14px; margin: 16px 0 0;">With best regards,<br><strong>AgentPark Team</strong></p>
          <div style="text-align: center; margin-top: 16px;">
            <img src="https://agentpark-website.pages.dev/Brand_assets/AgentPark_logo@2x.png" alt="AgentPark" style="height: 24px; width: auto;">
          </div>
        </div>
        <div style="border-top: 1px dashed #d1d5db; margin: 8px 0 16px; position: relative;">
          <span style="position: absolute; top: -10px; left: 50%; transform: translateX(-50%); background: #fff; padding: 0 12px; color: #9ca3af; font-size: 11px;">\u0540\u0561\u0575\u0565\u0580\u0565\u0576</span>
        </div>
        <div style="background: #f8f9fa; border-radius: 16px; padding: 24px; margin-bottom: 24px;">
          <p style="color: #0D2740; font-size: 14px; margin: 0 0 8px;">\u0540\u0561\u0580\u0563\u0565\u056c\u056b <strong>${fullName}</strong>,</p>
          <p style="color: #0D2740; font-size: 14px; margin: 0 0 16px;">
            \u0547\u0576\u0578\u0580\u0570\u0561\u056F\u0561\u056C\u0578\u0582\u0569\u0575\u0578\u0582\u0576 \u201C<strong>${eventTitleAm}</strong>\u201D \u0574\u056B\u057B\u0578\u0581\u0561\u057C\u0574\u0561\u0576\u0568 \u0574\u0561\u057D\u0576\u0561\u056F\u0581\u0565\u056C\u0578\u0582 \u0570\u0561\u0574\u0561\u0580\u0589 \u0541\u0565\u0580 \u0574\u0561\u057D\u0576\u0561\u056F\u0581\u0578\u0582\u0569\u0575\u0561\u0576 \u057E\u056F\u0561\u0575\u0561\u0563\u056B\u0580\u0568 \u056F\u0581\u057E\u0561\u056E \u0567 \u0561\u0575\u057D \u0576\u0561\u0574\u0561\u056F\u056B\u0576\u0589
          </p>
          <p style="color: #0D2740; font-size: 14px; margin: 0;">\u0570\u0561\u0580\u0563\u0561\u0576\u0584\u0576\u0565\u0580\u0578\u057E,<br><strong>AgentPark \u0569\u056B\u0574</strong></p>
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
            filename: `Certificate-${fullName.replace(/\s+/g, "-")}.pdf`,
            content: base64Pdf,
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
