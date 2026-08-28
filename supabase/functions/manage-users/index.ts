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
    const body = await req.json();
    const { action, email, password, name, role, scope, mfa, userId } = body;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    if (action === "create-user") {
      if (!email || !password || !name) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: email, password, name" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role, scope },
      });

      if (authError) {
        return new Response(
          JSON.stringify({ error: authError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { error: updateError } = await supabase
        .from("users")
        .update({
          auth_id: authData.user.id,
          must_change_password: true,
          temp_password: password,
        })
        .eq("id", userId);

      if (updateError) {
        console.error("Failed to update users table:", updateError.message);
      }

      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "notifications@cedarridge.org";
      const fromName = Deno.env.get("RESEND_FROM_NAME") || "Vitalis CMMS";
      const appUrl = Deno.env.get("APP_URL") || "http://localhost:5173";

      if (resendApiKey) {
        const emailBody = [
          `Hello ${name},`,
          ``,
          `Your Vitalis CMMS account has been created.`,
          ``,
          `Email: ${email}`,
          `Temporary password: ${password}`,
          `Role: ${role}`,
          ``,
          `Please log in at ${appUrl} and change your password when prompted.`,
          ``,
          `— Vitalis CMMS Team`,
        ].join("\n");

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: `${fromName} <${fromEmail}>`,
            to: `${name} <${email}>`,
            subject: "Your Vitalis CMMS Account",
            text: emailBody,
          }),
        });
      }

      return new Response(
        JSON.stringify({ success: true, authId: authData.user.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "reset-password") {
      if (!email) {
        return new Response(
          JSON.stringify({ error: "Missing email" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { error: resetError } = await supabase.auth.admin.generateLink({
        type: "recovery",
        email,
      });

      if (resetError) {
        return new Response(
          JSON.stringify({ error: resetError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("manage-users error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
