const PNG_RENDER_UNAVAILABLE_MSG =
  "PNG rendering unavailable in current worker plan/runtime. Fallback to SVG.";

function canUseCanvasPngRenderer() {
  return (
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap === "function" &&
    typeof Blob !== "undefined"
  );
}

export async function renderSvgToPng(svg: string, _request?: Request) {
  if (!canUseCanvasPngRenderer()) {
    throw new Error(PNG_RENDER_UNAVAILABLE_MSG);
  }

  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const bitmap = await createImageBitmap(svgBlob);
  const width = Math.max(1, Number(bitmap.width || 0));
  const height = Math.max(1, Number(bitmap.height || 0));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error(PNG_RENDER_UNAVAILABLE_MSG);
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);

  const pngBlob = await canvas.convertToBlob({ type: "image/png" });
  const pngBuffer = await pngBlob.arrayBuffer();
  return new Uint8Array(pngBuffer);
}

export function isWasmCodegenBlockedError(error: unknown) {
  const message = String((error as any)?.message || error || "");
  return (
    /createimagebitmap is not defined/i.test(message) ||
    /offscreencanvas is not defined/i.test(message) ||
    /wasm code generation disallowed by embedder/i.test(message) ||
    /png rendering unavailable/i.test(message)
  );
}
