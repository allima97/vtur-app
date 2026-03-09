import { isWasmCodegenBlockedError, renderSvgToPng } from "../../../../lib/cards/svgToPng";
import { renderCardSvg } from "./_render";

export async function GET({ request }: { request: Request }) {
  try {
    const url = new URL(request.url);
    const format = String(url.searchParams.get("format") || "svg").trim().toLowerCase();
    const { svg } = await renderCardSvg(request);

    if (format === "png") {
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
          console.warn("[cards/render] PNG indisponível no runtime.");
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
    }

    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=60",
      },
    });
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
