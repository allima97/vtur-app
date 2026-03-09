import type { APIRoute } from "astro";

export const POST: APIRoute = async () =>
  new Response(
    JSON.stringify({
      error:
        "Este endpoint foi descontinuado. Use a importação local na tela de Importar Vendas.",
    }),
    {
      status: 410,
      headers: { "content-type": "application/json; charset=utf-8" },
    }
  );
