import { isWasmCodegenBlockedError, renderSvgToPng } from "../../../../lib/cards/svgToPng";
import { renderCardSvg } from "./_render";

export async function GET({ request }: { request: Request }) {
  try {
    const { svg } = await renderCardSvg(request);
    try {
      const png = await renderSvgToPng(svg, request);
      return new Response(png, {
        status: 200,
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=60",
        },
      });
    } catch (error) {
      if (isWasmCodegenBlockedError(error)) {
        console.warn("[cards/render.png] PNG indisponível no runtime.");
        return new Response(
          JSON.stringify({
            error: "png_render_unavailable",
            message: "PNG rendering unavailable in current runtime.",
          }),
          {
            status: 503,
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store",
              "X-Card-Render-Error": "png_render_unavailable",
            },
          }
        );
      }
      throw error;
    }
  } catch (e: any) {
    return new Response(
      JSON.stringify({
        error: "card_render_error",
        message: e?.message || "Erro ao renderizar cartão.",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
