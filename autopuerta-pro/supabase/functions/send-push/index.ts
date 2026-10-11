import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

function requireEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta el secreto ${name}`);
  return value;
}

const ESTADOS: Record<string, string> = {
  aceptada: "aceptada",
  en_camino: "en camino",
  resuelta: "resuelta",
  pendiente: "pendiente",
};

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    if (request.headers.get("x-webhook-secret") !== requireEnv("PUSH_WEBHOOK_SECRET")) {
      return new Response("Unauthorized", { status: 401 });
    }
    const body = await request.json();
    const kind = String(body.kind || "");

    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") || "mailto:admin@valgom.es",
      requireEnv("VAPID_PUBLIC_KEY"),
      requireEnv("VAPID_PRIVATE_KEY"),
    );

    const service = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let targetIds: string[] = [];
    let payload: Record<string, string>;

    if (kind === "incidencia_asignada") {
      const { data: techs } = await service.from("user_profiles")
        .select("id").eq("employee_id", String(body.empleadoid || "")).eq("role", "technician").eq("is_active", true);
      targetIds = (techs || []).map((t: { id: string }) => t.id);
      const urgente = body.prioridad === "urgente";
      payload = {
        title: urgente ? "🚨 Incidencia URGENTE asignada" : "Nueva incidencia asignada",
        body: `${body.cliente || "Cliente"}: ${body.descripcion || ""}`,
        page: "incidencias",
      };
    } else if (kind === "incidencia_estado") {
      const { data: admins } = await service.from("user_profiles")
        .select("id").eq("role", "admin").eq("is_active", true);
      targetIds = (admins || []).map((a: { id: string }) => a.id);
      payload = {
        title: `Incidencia ${ESTADOS[String(body.estado)] || body.estado}`,
        body: `${body.empleadonombre || "Un técnico"} · ${body.cliente || "Cliente"}`,
        page: "incidencias",
      };
    } else {
      const { data: tech } = await service.from("user_profiles")
        .select("full_name").eq("id", String(body.createdby || "")).maybeSingle();
      const who = tech?.full_name || "Un técnico";
      const { data: admins } = await service.from("user_profiles")
        .select("id").eq("role", "admin").eq("is_active", true);
      targetIds = (admins || []).map((a: { id: string }) => a.id);
      const isParte = kind === "parte";
      payload = {
        title: isParte ? "Nuevo parte de trabajo" : "Nueva solicitud de material",
        body: isParte ? `${who} ha subido un parte.` : `${who} ha enviado una solicitud de material.`,
        page: isParte ? "partesTrabajo" : "presupuestos",
      };
    }

    if (!targetIds.length) return new Response("sin destinatarios");

    const { data: subs } = await service.from("push_subscriptions")
      .select("endpoint,p256dh,auth").in("user_id", targetIds);

    const message = JSON.stringify(payload);
    let sent = 0;
    for (const sub of subs || []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, message);
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await service.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        } else {
          console.error("push error", status);
        }
      }
    }
    return new Response(`enviadas ${sent}`);
  } catch (err) {
    console.error(err);
    return new Response("Error", { status: 500 });
  }
});
