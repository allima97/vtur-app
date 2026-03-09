import { createServerClient } from "../../../lib/supabaseServer";

import { getSupabaseEnv } from "../users";
const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();

function parseCookies(request: Request): Map<string, string> {
  const header = request.headers.get("cookie") ?? "";
  const map = new Map<string, string>();
  header.split(";").forEach((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) return;
    const [rawName, ...rawValue] = trimmed.split("=");
    const name = rawName?.trim();
    if (!name) return;
    map.set(name, rawValue.join("=").trim());
  });
  return map;
}

function buildAuthClient(request: Request) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("PUBLIC_SUPABASE_URL ou PUBLIC_SUPABASE_ANON_KEY nao configurados.");
  }
  const cookies = parseCookies(request);
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get: (name: string) => cookies.get(name) ?? "",
      set: () => {},
      remove: () => {},
    },
  });
}

function toIcsDate(value: Date) {
  const iso = value.toISOString().replace(/[-:]/g, "").split(".")[0];
  return `${iso}Z`;
}

export async function GET({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id") || "";
    if (!id) {
      return new Response("Informe o id da consultoria.", { status: 400 });
    }

    const authClient = buildAuthClient(request);
    const { data: userData, error: userErr } = await authClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response("Sessao invalida.", { status: 401 });
    }

    const { data, error } = await authClient
      .from("consultorias_online")
      .select("id, cliente_nome, data_hora, destino")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) {
      return new Response("Consultoria nao encontrada.", { status: 404 });
    }

    const start = new Date(data.data_hora);
    if (Number.isNaN(start.getTime())) {
      return new Response("Data invalida.", { status: 400 });
    }
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const summary = `Consultoria - ${data.cliente_nome || "Cliente"}`;
    const description = data.destino ? `Destino: ${data.destino}` : "Consultoria";
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//vtur//Consultoria//PT-BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:consultoria-${data.id}@vtur.app`,
      `DTSTAMP:${toIcsDate(new Date())}`,
      `DTSTART:${toIcsDate(start)}`,
      `DTEND:${toIcsDate(end)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      "LOCATION:Consultoria",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename=\"consultoria-${data.id}.ics\"`,
      },
    });
  } catch (error: any) {
    return new Response(`Erro interno: ${error?.message ?? error}`, { status: 500 });
  }
}
