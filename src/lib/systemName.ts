export const SYSTEM_NAME = "vtur";
export const SYSTEM_TAGLINE = "Sistema de Gerenciamento de Vendas";
export const SYSTEM_TITLE = `${SYSTEM_NAME} - ${SYSTEM_TAGLINE}`;
export const SYSTEM_DESCRIPTION = "Sistema de gerenciamento de vendas para equipes, operacao e resultados.";

export const APP_HOST = "vtur.app";
export const APP_URL = `https://${APP_HOST}`;
export const WEBSITE_HOST = "vtur.com.br";
export const WEBSITE_URL = `https://${WEBSITE_HOST}`;

export const SUPPORT_EMAIL = "suporte@vtur.com.br";
export const DEFAULT_FROM_EMAILS = {
  admin: "admin@vtur.com.br",
  avisos: "avisos@vtur.com.br",
  financeiro: "financeiro@vtur.com.br",
  suporte: SUPPORT_EMAIL,
} as const;

export const DOC_PRIMARY_SLUG = "vtur";
export const DOC_LEGACY_SLUG = "sgtur";
export const DOC_SLUGS = [DOC_PRIMARY_SLUG, DOC_LEGACY_SLUG] as const;
export const DOC_PRIMARY_PATH = "/VTUR_DOCUMENTACAO.md";
export const DOC_LEGACY_PATH = "/SGVTUR_DOCUMENTACAO.md";
export const DOC_FALLBACK_PATHS = [DOC_PRIMARY_PATH, DOC_LEGACY_PATH] as const;

export const MANIFEST_PATH = "/manifest.webmanifest";
export const BRAND_ICON_PATH = "/icons/icon-192.png";
export const BRAND_OG_IMAGE_PATH = "/icons/icon-512.png";
export const APPLE_TOUCH_ICON_PATH = "/icons/apple-touch-icon.png";
