import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta configurar el secreto ${name} en Supabase.`);
  return value;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse(405, { error: "Método no permitido." });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "Solicitud JSON no válida." });
  }

  const action = String(body.action || "");
  try {
    const url = requireEnv("SUPABASE_URL");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const service = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    if (action === "bootstrap-status") {
      const { count, error } = await service
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("is_active", true);
      if (error) throw error;
      return jsonResponse(200, { needsBootstrap: count === 0 });
    }

    if (action === "bootstrap-admin") {
      const expected = Deno.env.get("ADMIN_BOOTSTRAP_CODE") || "";
      const submitted = String(body.code || "");
      if (!expected || submitted.length !== expected.length || submitted !== expected) {
        return jsonResponse(403, { error: "Código de activación no válido." });
      }

      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const fullName = String(body.fullName || "").trim();
      if (!email || !fullName || password.length < 12) {
        return jsonResponse(400, { error: "Indica nombre, correo y contraseña de al menos 12 caracteres." });
      }

      const { data: created, error: createError } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createError) throw createError;

      const { error: claimError } = await service.rpc("claim_initial_admin", {
        p_user_id: created.user.id,
        p_email: email,
        p_full_name: fullName,
      });
      if (claimError) {
        await service.auth.admin.deleteUser(created.user.id);
        if (claimError.message.toLowerCase().includes("already")) {
          return jsonResponse(409, { error: "La configuración inicial ya se completó. Inicia sesión con una cuenta existente." });
        }
        throw claimError;
      }
      return jsonResponse(201, { ok: true });
    }

    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return jsonResponse(401, { error: "Debes iniciar sesión." });
    const { data: authData, error: authError } = await service.auth.getUser(token);
    if (authError || !authData.user) return jsonResponse(401, { error: "Sesión no válida." });

    const { data: caller, error: callerError } = await service
      .from("user_profiles")
      .select("role,is_active,email")
      .eq("id", authData.user.id)
      .maybeSingle();
    if (callerError) throw callerError;
    if (!caller?.is_active) {
      return jsonResponse(403, { error: "La cuenta no está activa." });
    }

    if (action === "update-own-email") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return jsonResponse(400, { error: "Escribe una dirección de correo válida." });
      }

      const { error: profileUpdateError } = await service
        .from("user_profiles")
        .update({ email })
        .eq("id", authData.user.id);
      if (profileUpdateError) throw profileUpdateError;

      const { error: authUpdateError } = await service.auth.admin.updateUserById(authData.user.id, {
        email,
        email_confirm: true,
      });
      if (authUpdateError) {
        const { error: rollbackError } = await service
          .from("user_profiles")
          .update({ email: caller.email })
          .eq("id", authData.user.id);
        if (rollbackError) {
          console.error("[team-admin] No se pudo revertir el correo del perfil:", rollbackError);
          return jsonResponse(500, { error: "No se pudo completar el cambio de correo. Contacta con soporte antes de volver a intentarlo." });
        }
        throw authUpdateError;
      }
      return jsonResponse(200, { ok: true, email });
    }

    if (caller.role !== "admin") {
      return jsonResponse(403, { error: "Solo un administrador activo puede gestionar usuarios." });
    }

    if (action === "invite-user") {
      const email = String(body.email || "").trim().toLowerCase();
      const fullName = String(body.fullName || "").trim();
      const role = body.role === "admin" ? "admin" : "technician";
      const employeeId = role === "technician" ? String(body.employeeId || "") : null;
      if (!email || !fullName || (role === "technician" && !employeeId)) {
        return jsonResponse(400, { error: "Completa nombre, correo y ficha de empleado para los técnicos." });
      }
      if (employeeId) {
        const { data: employee, error: employeeError } = await service
          .from("empleados").select("id").eq("id", employeeId).maybeSingle();
        if (employeeError) throw employeeError;
        if (!employee) return jsonResponse(400, { error: "La ficha de empleado seleccionada no existe." });
      }

      const redirectTo = request.headers.get("origin") || undefined;
      const { data: invited, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: { full_name: fullName },
      });
      if (inviteError) throw inviteError;
      const { error: profileError } = await service.from("user_profiles").insert({
        id: invited.user.id,
        email,
        full_name: fullName,
        role,
        employee_id: employeeId,
        is_active: true,
      });
      if (profileError) {
        await service.auth.admin.deleteUser(invited.user.id);
        throw profileError;
      }
      return jsonResponse(201, { ok: true });
    }

    if (action === "update-user") {
      const userId = String(body.userId || "");
      const role = body.role === "admin" ? "admin" : "technician";
      const isActive = Boolean(body.isActive);
      const employeeId = role === "technician" ? String(body.employeeId || "") : null;
      if (!userId) return jsonResponse(400, { error: "Falta el usuario." });
      if (userId === authData.user.id && !isActive) {
        return jsonResponse(400, { error: "No puedes desactivar tu propia cuenta." });
      }
      if (role === "technician" && !employeeId) {
        return jsonResponse(400, { error: "Vincula la cuenta con una ficha de empleado." });
      }
      if (employeeId) {
        const { data: employee, error: employeeError } = await service
          .from("empleados").select("id").eq("id", employeeId).maybeSingle();
        if (employeeError) throw employeeError;
        if (!employee) return jsonResponse(400, { error: "La ficha de empleado seleccionada no existe." });
      }
      const { data: target, error: targetError } = await service
        .from("user_profiles").select("role,is_active").eq("id", userId).maybeSingle();
      if (targetError) throw targetError;
      if (!target) return jsonResponse(404, { error: "No se encontró ese usuario." });
      if (target.role === "admin" && (role !== "admin" || !isActive) && target.is_active) {
        const { count, error: countError } = await service
          .from("user_profiles").select("id", { count: "exact", head: true })
          .eq("role", "admin").eq("is_active", true);
        if (countError) throw countError;
        if ((count || 0) <= 1) return jsonResponse(409, { error: "Debe quedar al menos un administrador activo." });
      }

      const { error } = await service.from("user_profiles").update({
        role,
        employee_id: employeeId,
        is_active: isActive,
      }).eq("id", userId);
      if (error) throw error;
      return jsonResponse(200, { ok: true });
    }

    return jsonResponse(400, { error: "Acción desconocida." });
  } catch (error) {
    console.error("[team-admin]", error);
    return jsonResponse(500, { error: error instanceof Error ? error.message : "Error interno." });
  }
});
