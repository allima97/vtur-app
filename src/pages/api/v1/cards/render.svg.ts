import { renderCardSvg } from "./_render";

export async function GET({ request }: { request: Request }) {
  try {
    const { svg } = await renderCardSvg(request);
    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (e: any) {
    return new Response(e?.message || "Erro ao renderizar cartão.", { status: 500 });
  }
}
