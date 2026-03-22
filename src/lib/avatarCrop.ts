export type AvatarCropViewport = {
  naturalWidth: number;
  naturalHeight: number;
  containerSize: number;
  zoom: number;
};

export type AvatarCropPosition = {
  x: number;
  y: number;
};

export type AvatarCropBounds = {
  drawWidth: number;
  drawHeight: number;
  maxOffsetX: number;
  maxOffsetY: number;
};

export function getAvatarCropBounds(viewport: AvatarCropViewport): AvatarCropBounds {
  const naturalWidth = Math.max(1, Number(viewport.naturalWidth || 1));
  const naturalHeight = Math.max(1, Number(viewport.naturalHeight || 1));
  const containerSize = Math.max(1, Number(viewport.containerSize || 1));
  const zoom = Math.max(1, Number(viewport.zoom || 1));
  const aspect = naturalWidth / naturalHeight;

  let drawWidth = containerSize;
  let drawHeight = containerSize;

  if (aspect >= 1) {
    drawHeight = containerSize;
    drawWidth = drawHeight * aspect;
  } else {
    drawWidth = containerSize;
    drawHeight = drawWidth / aspect;
  }

  drawWidth *= zoom;
  drawHeight *= zoom;

  return {
    drawWidth,
    drawHeight,
    maxOffsetX: Math.max(0, (drawWidth - containerSize) / 2),
    maxOffsetY: Math.max(0, (drawHeight - containerSize) / 2),
  };
}

export function clampAvatarCropPosition(
  position: AvatarCropPosition,
  bounds: Pick<AvatarCropBounds, "maxOffsetX" | "maxOffsetY">
) {
  const clamp = (value: number, limit: number) =>
    Math.max(-limit, Math.min(limit, Number.isFinite(value) ? value : 0));

  return {
    x: clamp(position.x, bounds.maxOffsetX),
    y: clamp(position.y, bounds.maxOffsetY),
  };
}

export async function loadAvatarCropImage(src: string) {
  const image = new Image();
  image.decoding = "async";
  image.crossOrigin = "anonymous";

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Nao foi possivel carregar a imagem para recorte."));
    image.src = src;
  });

  return image;
}

export async function renderAvatarCropToBlob(options: {
  imageSrc: string;
  mimeType?: string;
  fileName?: string;
  viewport: AvatarCropViewport;
  position: AvatarCropPosition;
}) {
  const image = await loadAvatarCropImage(options.imageSrc);
  const bounds = getAvatarCropBounds(options.viewport);
  const containerSize = Math.max(1, Math.round(options.viewport.containerSize || 1));
  const safePosition = clampAvatarCropPosition(options.position, bounds);
  const x = (containerSize - bounds.drawWidth) / 2 + safePosition.x;
  const y = (containerSize - bounds.drawHeight) / 2 + safePosition.y;

  const canvas = document.createElement("canvas");
  canvas.width = containerSize;
  canvas.height = containerSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Nao foi possivel inicializar o canvas do recorte.");

  ctx.clearRect(0, 0, containerSize, containerSize);
  ctx.drawImage(image, x, y, bounds.drawWidth, bounds.drawHeight);

  const outputMime =
    options.mimeType && /^image\/(png|jpeg|jpg|webp)$/i.test(options.mimeType)
      ? options.mimeType.replace("jpg", "jpeg")
      : "image/jpeg";

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => {
        if (value) resolve(value);
        else reject(new Error("Nao foi possivel gerar o avatar recortado."));
      },
      outputMime,
      outputMime === "image/png" ? undefined : 0.92
    );
  });

  const ext = outputMime === "image/png" ? "png" : outputMime === "image/webp" ? "webp" : "jpg";
  const file = new File([blob], options.fileName || `avatar.${ext}`, { type: outputMime });
  return { blob, file };
}
