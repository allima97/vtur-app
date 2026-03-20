import type { APIRoute } from "astro";
import { buildAuthClient } from "../v1/vendas/_utils";

type BodyPayload = {
  gestor_id?: string | null;
  vendedor_id?: string | null;
  ativo?: boolean | null;
};

function isUuid(value?: string | null) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const authClient = buildAuthClient(request);
    const { data: authData, error: authErr } = await authClient.auth.getUser();
    const requestUser = authData?.user ?? null;
    if (authErr || !requestUser) {
      return new Response(JSON.stringify({ error: "Sessao invalida." }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = (await request.json().catch(() => null)) as BodyPayload | null;
    const gestorId = String(body?.gestor_id || "").trim();
    const vendedorId = String(body?.vendedor_id || "").trim();
    const ativo = body?.ativo === true;

    if (!isUuid(gestorId) || !isUuid(vendedorId)) {
      return new Response(JSON.stringify({ error: "Gestor ou vendedor invalido." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { data, error } = await authClient.rpc("set_gestor_vendedor_relacao", {
      p_gestor_id: gestorId,
      p_vendedor_id: vendedorId,
      p_ativo: ativo,
    });
    if (error) {
      return new Response(
        JSON.stringify({ error: error.message || "Erro ao atualizar equipe." }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify(data || { ok: true, ativo }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Erro equipe/relacao", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Erro ao atualizar equipe." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
