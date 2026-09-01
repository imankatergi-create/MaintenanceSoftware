import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { to, toName, subject, body, emailId, logoUrl } = await req.json();

    if (!to || !subject || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, subject, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Email service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "notifications@cedarridge.org";
    const fromName = Deno.env.get("RESEND_FROM_NAME") || "Vitalis CMMS";

    const linkMatch = (body || '').match(/Open in Vitalis CMMS: (https?:\/\/[^\s]+)/);
    const linkUrl = linkMatch ? linkMatch[1] : '';

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: toName ? `${toName} <${to}>` : to,
        subject,
        text: body,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  :root{--teal:#007f73;--brown:#6a4a3d;--cream:#f7f4ef;--ink:#27343a}
  *{box-sizing:border-box}body{margin:0;padding:0;background:#f4f1ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
  .wrap{max-width:560px;margin:0 auto;padding:24px}
  .card{background:#fff;border-radius:10px;overflow:hidden;border:1px solid #e5ddd5}
  .header{background:#fff;border-bottom:3px solid var(--teal);padding:20px 28px;display:flex;align-items:center;gap:14px}
  .header img{width:56px;height:56px;object-fit:contain}
  .header .org{font-size:18px;font-weight:800;color:var(--brown);line-height:1.2}
  .header .sys{font-size:11px;color:var(--teal);margin-top:2px}
  .content{padding:28px}
  .content h2{font-size:16px;color:var(--teal);margin:0 0 14px}
  .content p{font-size:14px;line-height:1.6;color:var(--ink);margin:0 0 14px;white-space:pre-wrap}
  .meta-box{background:var(--cream);border:1px solid #e5ddd5;border-radius:8px;padding:14px 16px;margin:16px 0}
  .meta-box p{font-size:13px;margin:0 0 6px}
  .meta-box p:last-child{margin-bottom:0}
  .btn{display:inline-block;background:var(--teal);color:#fff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 24px;border-radius:6px;margin-top:8px}
  .footer{padding:18px 28px;border-top:1px solid #e5ddd5;text-align:center}
  .footer p{font-size:11px;color:#888;margin:0}
</style></head><body><div class="wrap"><div class="card">
  <div class="header"><img src="${logoUrl || ''}" alt="Makassed General Hospital"><div><div class="org">Makassed General Hospital</div><div class="sys">Vitalis CMMS · Medical Equipment Maintenance</div></div></div>
  <div class="content"><h2>${subject}</h2><p>${(body || '').replace(/</g,'&lt;')}</p>${linkUrl ? `<a href="${linkUrl}" class="btn">Open in Vitalis CMMS</a>` : ''}</div>
  <div class="footer"><p>Makassed General Hospital · Vitalis CMMS</p><p style="margin-top:4px">This is an automated notification. Please do not reply.</p></div>
</div></div></body></html>`,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      console.error("Resend API error:", resendResponse.status, errText);

      if (emailId) {
        const supabase = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        await supabase
          .from("email_notifications")
          .update({ status: "failed", error: errText })
          .eq("id", emailId);
      }

      return new Response(
        JSON.stringify({ error: "Failed to send email", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const resendData = await resendResponse.json();

    if (emailId) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      await supabase
        .from("email_notifications")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", emailId);
    }

    return new Response(
      JSON.stringify({ success: true, id: resendData.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-email error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
