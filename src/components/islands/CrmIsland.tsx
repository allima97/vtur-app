import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppButton from "../ui/primer/AppButton";
import { ToastStack, useToastQueue } from "../ui/Toast";

// ── Types ────────────────────────────────────────────────────────────────────

type Category = {
  id: string;
  nome: string;
  icone: string;
  sort_order: number;
};

type Theme = {
  id: string;
  user_id?: string | null;
  nome: string;
  categoria: string | null;
  categoria_id: string | null;
  asset_url: string;
  logo_url?: string | null;
  logo_path?: string | null;
  greeting_text: string | null;
  mensagem_max_linhas: number;
  mensagem_max_palavras: number;
  assinatura_max_linhas: number;
  assinatura_max_palavras: number;
  scope: string;
};

type MessageTemplate = {
  id: string;
  user_id?: string | null;
  nome: string;
  titulo: string;
  corpo: string;
  categoria: string | null;
  scope?: string | null;
};

type Cliente = {
  id: string;
  nome: string;
};

type AssinaturaForm = {
  linha1: string;
  linha1_font_size: number;
  linha1_italic: boolean;
  linha2: string;
  linha2_font_size: number;
  linha2_italic: boolean;
  linha3: string;
  linha3_font_size: number;
  linha3_italic: boolean;
};

type CardPositionForm = {
  title: { x: number; y: number };
  clientName: { x: number; y: number };
  body: { x: number; y: number };
  signature: { x: number; y: number };
  logo: { x: number; y: number };
};

type BirthdayItem = {
  id: string;
  nome: string;
  nascimento: string | null;
  telefone: string | null;
  pessoa_tipo?: "cliente" | "acompanhante";
  cliente_id?: string | null;
};

type ScopeValue = "system" | "master" | "gestor" | "user";

type CategoryForm = {
  nome: string;
  icone: string;
  sort_order: number;
  ativo: boolean;
};

type ThemeForm = {
  nome: string;
  categoria_id: string | null;
  asset_url: string;
  logo_url: string;
  scope: ScopeValue;
  greeting_text: string;
  mensagem_max_linhas: number;
  mensagem_max_palavras: number;
  assinatura_max_linhas: number;
  assinatura_max_palavras: number;
  ativo: boolean;
};

type MessageForm = {
  nome: string;
  categoria: string;
  titulo: string;
  corpo: string;
  scope: ScopeValue;
  ativo: boolean;
};

const CRM_THEMES_PER_PAGE = 12;
const STORAGE_BUCKET = "message-template-themes";
type LogoSourceMode = "default" | "custom";
const THEME_SELECT_WITH_LOGO =
  "id, user_id, nome, categoria, categoria_id, asset_url, logo_url, logo_path, greeting_text, mensagem_max_linhas, mensagem_max_palavras, assinatura_max_linhas, assinatura_max_palavras, scope, ativo";
const THEME_SELECT_LEGACY =
  "id, user_id, nome, categoria, categoria_id, asset_url, greeting_text, mensagem_max_linhas, mensagem_max_palavras, assinatura_max_linhas, assinatura_max_palavras, scope, ativo";

const ICON_SUGGESTIONS = [
  "pi pi-gift", "pi pi-star", "pi pi-sun", "pi pi-sparkles",
  "pi pi-heart", "pi pi-map", "pi pi-tag", "pi pi-image",
  "pi pi-calendar", "pi pi-globe", "pi pi-flag",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPrimeiroNome(nome: string) {
  return (nome || "").trim().split(/\s+/)[0] || "";
}

function isThemeLogoColumnMissingError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  if (!message) return false;
  return (
    (message.includes("column") && message.includes("logo_url")) ||
    (message.includes("column") && message.includes("logo_path")) ||
    message.includes("logo_url does not exist") ||
    message.includes("logo_path does not exist")
  );
}

function countWords(text: string) {
  return (text || "").trim().split(/\s+/).filter(Boolean).length;
}

function normalizeScopeValue(scope?: string | null): "system" | "master" | "gestor" | "user" {
  const normalized = String(scope || "").trim().toLowerCase();
  if (normalized === "system" || normalized === "master" || normalized === "gestor" || normalized === "user") {
    return normalized;
  }
  // Compatibilidade: registros legados sem `scope` passam a ser tratados como Sistema.
  return "system";
}

function normalizeText(value?: string | null) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanAssetUrl(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (lowered === "null" || lowered === "undefined") return null;
  return raw;
}

function extractStoragePath(value?: string | null) {
  if (!value) return null;
  const marker = "/quotes/";
  const index = value.indexOf(marker);
  if (index === -1) return null;
  return value.slice(index + marker.length);
}

async function resolveLogoUrlFromSettings(settings?: { logo_url?: string | null; logo_path?: string | null } | null) {
  const persistedUrl = cleanAssetUrl(settings?.logo_url);
  const logoPath = String(settings?.logo_path || extractStoragePath(persistedUrl) || "").trim();
  if (!logoPath) return persistedUrl;

  try {
    const signed = await supabaseBrowser.storage.from("quotes").createSignedUrl(logoPath, 3600);
    const signedUrl = cleanAssetUrl(signed.data?.signedUrl);
    if (signedUrl) return signedUrl;
  } catch {
    // Fallback para URL pública/legada abaixo.
  }

  try {
    const publicUrl = cleanAssetUrl(supabaseBrowser.storage.from("quotes").getPublicUrl(logoPath).data.publicUrl);
    if (publicUrl) return publicUrl;
  } catch {
    // Sem fallback adicional.
  }

  return persistedUrl;
}

function resolveThemeLogoUrl(theme?: Pick<Theme, "logo_url" | "logo_path"> | null) {
  const persistedUrl = cleanAssetUrl(theme?.logo_url);
  if (persistedUrl) return persistedUrl;

  const logoPath = String(theme?.logo_path || "").trim();
  if (!logoPath) return null;
  try {
    const publicUrl = cleanAssetUrl(supabaseBrowser.storage.from(STORAGE_BUCKET).getPublicUrl(logoPath).data.publicUrl);
    return publicUrl;
  } catch {
    return null;
  }
}

function resolveGreetingByTheme(theme?: Pick<Theme, "nome" | "categoria" | "greeting_text"> | null) {
  const explicit = String(theme?.greeting_text || "").trim();
  if (explicit) return explicit;
  const source = `${theme?.nome || ""} ${theme?.categoria || ""}`;
  const normalized = normalizeText(source);
  if (normalized.includes("anivers") || normalized.includes("birthday")) return "Feliz Aniversário!";
  if (normalized.includes("pascoa") || normalized.includes("easter")) return "Feliz Páscoa!";
  if (normalized.includes("natal") || normalized.includes("christmas")) return "Feliz Natal!";
  if (
    normalized.includes("ano novo") ||
    normalized.includes("ano-novo") ||
    normalized.includes("anonovo") ||
    normalized.includes("new year")
  ) {
    return "Feliz Ano Novo!";
  }
  if (normalized.includes("dia das maes") || normalized.includes("mother")) return "Feliz Dia das Mães!";
  if (normalized.includes("dia dos pais") || normalized.includes("father")) return "Feliz Dia dos Pais!";
  if (normalized.includes("dia da mulher") || normalized.includes("women")) return "Feliz Dia da Mulher!";
  if (normalized.includes("viajant") || normalized.includes("travel")) return "Boas viagens e muitas conquistas!";
  return "";
}

function stripLegacyGreeting(message: string) {
  const raw = String(message || "").replace(/\r/g, "");
  if (!raw.trim()) return "";
  const lines = raw.split("\n");
  const first = normalizeText(lines[0] || "");
  const looksLikeLegacy =
    first.startsWith("prezado") ||
    first.startsWith("prezada") ||
    first.includes("[nome do cliente]") ||
    first.includes("{nome}");
  if (!looksLikeLegacy) return raw;
  return lines.slice(1).join("\n").trimStart();
}

type TemaFilterValue = string;

const CRM_TEMA_FILTER_BASE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Todos", value: "all" },
  { label: "Aniversário", value: "aniversario" },
  { label: "Natal", value: "natal" },
  { label: "Páscoa", value: "pascoa" },
  { label: "Ano Novo", value: "ano_novo" },
  { label: "Dia das Mães", value: "dia_das_maes" },
  { label: "Dia dos Pais", value: "dia_dos_pais" },
  { label: "Dia da Mulher", value: "dia_da_mulher" },
  { label: "Dia do Viajante", value: "dia_do_viajante" },
  { label: "Geral", value: "geral" },
];

function resolveTemaBucket(normalizedThemeText: string): string | null {
  if (!normalizedThemeText) return null;
  if (normalizedThemeText.includes("anivers") || normalizedThemeText.includes("birthday")) return "aniversario";
  if (normalizedThemeText.includes("natal") || normalizedThemeText.includes("christmas")) return "natal";
  if (normalizedThemeText.includes("pascoa") || normalizedThemeText.includes("easter")) return "pascoa";
  if (
    normalizedThemeText.includes("ano novo") ||
    normalizedThemeText.includes("ano_novo") ||
    normalizedThemeText.includes("reveillon") ||
    normalizedThemeText.includes("new year")
  ) {
    return "ano_novo";
  }
  if (normalizedThemeText.includes("dia das maes") || normalizedThemeText.includes("mother")) return "dia_das_maes";
  if (normalizedThemeText.includes("dia dos pais") || normalizedThemeText.includes("father")) return "dia_dos_pais";
  if (normalizedThemeText.includes("dia da mulher") || normalizedThemeText.includes("women")) return "dia_da_mulher";
  if (normalizedThemeText.includes("viajant") || normalizedThemeText.includes("travel")) return "dia_do_viajante";
  if (normalizedThemeText.includes("geral") || normalizedThemeText.includes("general")) return "geral";
  return null;
}

function matchesTemaFilter(
  temaFilter: TemaFilterValue,
  normalizedThemeText: string,
  categoryId?: string | null,
) {
  if (temaFilter === "all") return true;
  const categoryFilterPrefix = "cat:";
  if (temaFilter.startsWith(categoryFilterPrefix)) {
    const selectedCategoryId = temaFilter.slice(categoryFilterPrefix.length);
    return selectedCategoryId && selectedCategoryId === String(categoryId || "");
  }
  return resolveTemaBucket(normalizedThemeText) === temaFilter;
}

function getScopeLabel(scope?: string | null) {
  const normalized = normalizeScopeValue(scope);
  if (normalized === "system") return "Sistema";
  if (normalized === "master") return "Master";
  if (normalized === "gestor") return "Gestor";
  return "Usuário";
}

function getScopeTone(scope?: string | null) {
  const normalized = normalizeScopeValue(scope);
  if (normalized === "system") return "crm-badge crm-badge--system";
  if (normalized === "master") return "crm-badge crm-badge--master";
  if (normalized === "gestor") return "crm-badge crm-badge--gestor";
  return "crm-badge crm-badge--user";
}

function getAvailableScopeOptions(userRole: string, isAdmin: boolean): Array<{ value: ScopeValue; label: string }> {
  if (isAdmin) {
    return [
      { value: "system", label: "Sistema (todos os usuários)" },
      { value: "master", label: "Master (empresas)" },
      { value: "gestor", label: "Gestor (agência)" },
      { value: "user", label: "Usuário (pessoal)" },
    ];
  }

  const normalizedRole = String(userRole || "").trim().toUpperCase();
  if (normalizedRole === "MASTER") {
    return [
      { value: "master", label: "Master (empresas)" },
      { value: "gestor", label: "Gestor (agência)" },
      { value: "user", label: "Usuário (pessoal)" },
    ];
  }
  if (normalizedRole === "GESTOR") {
    return [
      { value: "gestor", label: "Gestor (agência)" },
      { value: "user", label: "Usuário (pessoal)" },
    ];
  }
  return [{ value: "user", label: "Usuário (pessoal)" }];
}

function emptyCategoryForm(): CategoryForm {
  return { nome: "", icone: "pi pi-tag", sort_order: 0, ativo: true };
}

function emptyThemeForm(defaultScope: ScopeValue): ThemeForm {
  return {
    nome: "",
    categoria_id: null,
    asset_url: "",
    logo_url: "",
    scope: defaultScope,
    greeting_text: "",
    mensagem_max_linhas: 6,
    mensagem_max_palavras: 50,
    assinatura_max_linhas: 3,
    assinatura_max_palavras: 20,
    ativo: true,
  };
}

function emptyMessageForm(defaultScope: ScopeValue): MessageForm {
  return {
    nome: "",
    categoria: "",
    titulo: "",
    corpo: "",
    scope: defaultScope,
    ativo: true,
  };
}

function getStoragePathFromPublicUrl(publicUrl?: string | null): string | null {
  const raw = String(publicUrl || "").trim();
  if (!raw) return null;
  const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
  const markerIndex = raw.indexOf(marker);
  if (markerIndex >= 0) {
    const value = raw.slice(markerIndex + marker.length).split("?")[0];
    return value ? decodeURIComponent(value) : null;
  }
  try {
    const url = new URL(raw);
    const path = url.pathname || "";
    const pathIndex = path.indexOf(marker);
    if (pathIndex < 0) return null;
    const value = path.slice(pathIndex + marker.length);
    return value ? decodeURIComponent(value) : null;
  } catch {
    return null;
  }
}

const CARD_TEXT_COLOR_PRESETS: Array<{ label: string; value: string }> = [
  { label: "Padrão", value: "" },
  { label: "Azul", value: "#1B4F9A" },
  { label: "Grafite", value: "#0F172A" },
  { label: "Preto suave", value: "#111827" },
  { label: "Verde", value: "#166534" },
  { label: "Rosa", value: "#BE185D" },
  { label: "Vinho", value: "#7F1D1D" },
  { label: "Roxo", value: "#581C87" },
  { label: "Marrom", value: "#7C2D12" },
];

const DEFAULT_CARD_POSITION: CardPositionForm = {
  title: { x: 0, y: 0 },
  clientName: { x: 0, y: 0 },
  body: { x: 0, y: 0 },
  signature: { x: 0, y: 0 },
  logo: { x: 0, y: 0 },
};

function clampPositionOffset(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-240, Math.min(240, Math.round(value)));
}

function parseBirthDateParts(value?: string | null) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const isoPrefix = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoPrefix) {
    const month = Number(isoPrefix[2]);
    const day = Number(isoPrefix[3]);
    if (Number.isFinite(month) && Number.isFinite(day)) return { month, day };
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dayRaw, monthRaw] = raw.split("/");
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    if (Number.isFinite(month) && Number.isFinite(day)) return { month, day };
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return { month: parsed.getMonth() + 1, day: parsed.getDate() };
}

function buildPreviewParams(params: {
  themeId: string;
  themeName?: string | null;
  themeAssetUrl?: string | null;
  greeting: string;
  primeiroNome: string;
  nomeCompleto: string;
  mensagem: string;
  assinatura: AssinaturaForm;
  logoUrl: string | null;
  textColor: string;
  position: CardPositionForm;
}) {
  const {
    themeId,
    themeName,
    themeAssetUrl,
    greeting,
    primeiroNome,
    nomeCompleto,
    mensagem,
    assinatura,
    logoUrl,
    textColor,
    position,
  } = params;
  const q = new URLSearchParams();
  q.set("theme_id", themeId);
  if (themeName) q.set("theme_name", themeName);
  if (themeAssetUrl) q.set("theme_asset_url", themeAssetUrl);
  if (greeting) q.set("titulo", greeting);
  // `nome` alimenta variáveis e fallbacks; `cliente_nome_literal` fixa a linha dinâmica.
  const safeNome = String(nomeCompleto || primeiroNome || "Cliente").trim();
  q.set("nome", safeNome || "Cliente");
  const clientName = String(primeiroNome || nomeCompleto || "").trim();
  if (clientName) q.set("cliente_nome_literal", clientName.endsWith(",") ? clientName : `${clientName},`);
  if (mensagem) q.set("corpo", mensagem);
  q.set("footer_lead", assinatura.linha1 || "");
  if (assinatura.linha2) q.set("assinatura", assinatura.linha2);
  q.set("cargo_consultor", assinatura.linha3 || "");
  q.set("footer_lead_font_size", String(assinatura.linha1_font_size || 40));
  q.set("consultant_font_size", String(assinatura.linha2_font_size || 56));
  q.set("consultant_role_font_size", String(assinatura.linha3_font_size || 38));
  q.set("footer_lead_italic", assinatura.linha1_italic ? "1" : "0");
  q.set("consultant_italic", assinatura.linha2_italic ? "1" : "0");
  q.set("consultant_role_italic", assinatura.linha3_italic ? "1" : "0");
  // Compatibilidade com links antigos que usam apenas signature_font_size para a linha 2.
  q.set("signature_font_size", String(assinatura.linha2_font_size || 56));
  if (textColor) q.set("text_color", textColor);
  if (position.title.x) q.set("title_offset_x", String(position.title.x));
  if (position.title.y) q.set("title_offset_y", String(position.title.y));
  if (position.clientName.x) q.set("client_offset_x", String(position.clientName.x));
  if (position.clientName.y) q.set("client_offset_y", String(position.clientName.y));
  if (position.body.x) q.set("body_offset_x", String(position.body.x));
  if (position.body.y) q.set("body_offset_y", String(position.body.y));
  if (position.signature.x) q.set("signature_offset_x", String(position.signature.x));
  if (position.signature.y) q.set("signature_offset_y", String(position.signature.y));
  if (position.logo.x) q.set("logo_offset_x", String(position.logo.x));
  if (position.logo.y) q.set("logo_offset_y", String(position.logo.y));
  if (logoUrl) q.set("logo_url", logoUrl);
  return `/api/v1/cards/render.svg?${q.toString()}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ThumbCard({
  theme,
  selected,
  onSelect,
}: {
  theme: Theme;
  selected: boolean;
  onSelect: (t: Theme) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(theme)}
      className={`crm-thumb${selected ? " crm-thumb--selected" : ""}`}
      title={theme.nome}
    >
      <img
        src={theme.asset_url}
        alt={theme.nome}
        loading="lazy"
        className="crm-thumb__img"
      />
      <span className="crm-thumb__label">{theme.nome}</span>
      <span className={getScopeTone(theme.scope)}>{getScopeLabel(theme.scope)}</span>
      {selected && <span className="crm-thumb__check">✓</span>}
    </button>
  );
}

function AssinaturaEditor({
  value,
  onChange,
}: {
  value: AssinaturaForm;
  onChange: (v: AssinaturaForm) => void;
}) {
  function set(field: keyof AssinaturaForm, val: string | number | boolean) {
    onChange({ ...value, [field]: val });
  }

  const linhas: Array<{
    key: "linha1" | "linha2" | "linha3";
    sizeKey: "linha1_font_size" | "linha2_font_size" | "linha3_font_size";
    italicKey: "linha1_italic" | "linha2_italic" | "linha3_italic";
    placeholder: string;
  }> = [
    { key: "linha1", sizeKey: "linha1_font_size", italicKey: "linha1_italic", placeholder: "Linha opcional (ex.: Com carinho,)" },
    { key: "linha2", sizeKey: "linha2_font_size", italicKey: "linha2_italic", placeholder: "Nome do consultor (obrigatório)" },
    { key: "linha3", sizeKey: "linha3_font_size", italicKey: "linha3_italic", placeholder: "Seu cargo (opcional)" },
  ];

  return (
    <div className="crm-assinatura-editor">
      {linhas.map((l, i) => (
        <div key={l.key} className="crm-assinatura-linha">
          <span className="crm-assinatura-linha__num">{i + 1}</span>
          <input
            type="text"
            className="form-input crm-assinatura-linha__text"
            value={value[l.key] as string}
            onChange={(e) => set(l.key, e.target.value)}
            placeholder={l.placeholder}
            style={{ fontStyle: value[l.italicKey] ? "italic" : "normal" }}
          />
          <select
            className="form-select crm-assinatura-linha__size"
            value={value[l.sizeKey] as number}
            onChange={(e) => set(l.sizeKey, Number(e.target.value))}
            title="Tamanho da fonte"
          >
            {[12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 36, 40, 44, 48, 52, 56, 60, 64].map((s) => (
              <option key={s} value={s}>{s}px</option>
            ))}
          </select>
          <button
            type="button"
            className={`crm-assinatura-linha__italic-btn${value[l.italicKey] ? " active" : ""}`}
            onClick={() => set(l.italicKey, !value[l.italicKey])}
            title="Itálico"
          >
            <i />
          </button>
        </div>
      ))}
      <p className="crm-hint">Máx. 3 linhas · 20 palavras no total</p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const DEFAULT_ASSINATURA: AssinaturaForm = {
  linha1: "",
  linha1_font_size: 40,
  linha1_italic: false,
  linha2: "",
  linha2_font_size: 56,
  linha2_italic: false,
  linha3: "",
  linha3_font_size: 38,
  linha3_italic: false,
};

export default function CrmIsland() {
  // ── Data ────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [currentUserRole, setCurrentUserRole] = useState("");
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [messageLibrary, setMessageLibrary] = useState<MessageTemplate[]>([]);
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [companyLogoMissing, setCompanyLogoMissing] = useState(false);
  const [logoSourceMode, setLogoSourceMode] = useState<LogoSourceMode>("default");
  const [savedSigId, setSavedSigId] = useState<string | null>(null);
  const [birthdayItemsToday, setBirthdayItemsToday] = useState<BirthdayItem[]>([]);
  const [loadingBirthdays, setLoadingBirthdays] = useState(false);
  const [selectedBirthdayId, setSelectedBirthdayId] = useState<string | null>(null);

  // ── Selection / navigation ───────────────────────────────────────
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);

  // ── Form fields ──────────────────────────────────────────────────
  const [greeting, setGreeting] = useState("");
  const [clienteNome, setClienteNome] = useState(""); // full name selected from client list
  const [clienteNomeCustom, setClienteNomeCustom] = useState(""); // override first name
  const [useCustomNome, setUseCustomNome] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [assinatura, setAssinatura] = useState<AssinaturaForm>({ ...DEFAULT_ASSINATURA });
  const [textColor, setTextColor] = useState("");
  const [textPosition, setTextPosition] = useState<CardPositionForm>({ ...DEFAULT_CARD_POSITION });
  const [savingSig, setSavingSig] = useState(false);
  const [sigSaved, setSigSaved] = useState(false);
  const [selectedMessageTemplateId, setSelectedMessageTemplateId] = useState("");

  // ── Client search ────────────────────────────────────────────────
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteResults, setClienteResults] = useState<Cliente[]>([]);
  const [searchingClientes, setSearchingClientes] = useState(false);
  const clienteRef = useRef<HTMLDivElement>(null);

  const [scopeFilter, setScopeFilter] = useState<"all" | "system" | "master" | "gestor" | "user">("all");
  const [temaFilter, setTemaFilter] = useState<TemaFilterValue>("all");
  const [themePage, setThemePage] = useState(1);

  // ── CRM library creation (template/category/message) ────────────
  const [showCreateCategoryModal, setShowCreateCategoryModal] = useState(false);
  const [showCreateThemeModal, setShowCreateThemeModal] = useState(false);
  const [showCreateMessageModal, setShowCreateMessageModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>(() => emptyCategoryForm());
  const [themeForm, setThemeForm] = useState<ThemeForm>(() => emptyThemeForm("user"));
  const [messageForm, setMessageForm] = useState<MessageForm>(() => emptyMessageForm("user"));
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [savingMessage, setSavingMessage] = useState(false);
  const [uploadingThemeArt, setUploadingThemeArt] = useState(false);
  const [uploadingThemeLogo, setUploadingThemeLogo] = useState(false);
  const themeFileInputRef = useRef<HTMLInputElement>(null);
  const themeLogoInputRef = useRef<HTMLInputElement>(null);

  // ── Preview ──────────────────────────────────────────────────────
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  const queryThemesWithLogoFallback = useCallback(async () => {
    const withLogo = await supabaseBrowser
      .from("user_message_template_themes")
      .select(THEME_SELECT_WITH_LOGO)
      .order("nome");
    if (!withLogo.error) {
      return {
        data: (withLogo.data || []) as Theme[],
        error: null as any,
        logoColumnsAvailable: true,
      };
    }

    if (!isThemeLogoColumnMissingError(withLogo.error)) {
      return {
        data: [] as Theme[],
        error: withLogo.error,
        logoColumnsAvailable: false,
      };
    }

    const legacy = await supabaseBrowser
      .from("user_message_template_themes")
      .select(THEME_SELECT_LEGACY)
      .order("nome");
    if (legacy.error) {
      return {
        data: [] as Theme[],
        error: legacy.error,
        logoColumnsAvailable: false,
      };
    }

    const normalized = ((legacy.data || []) as any[]).map((row) => ({
      ...row,
      logo_url: null,
      logo_path: null,
    })) as Theme[];

    return {
      data: normalized,
      error: null as any,
      logoColumnsAvailable: false,
    };
  }, []);

  // ── Derived ──────────────────────────────────────────────────────
  const primeiroNome = useCustomNome ? clienteNomeCustom.trim() : clienteNome.trim();
  const palavras = countWords(mensagem);
  const maxPalavras = selectedTheme?.mensagem_max_palavras ?? 50;
  const maxLinhas = selectedTheme?.mensagem_max_linhas ?? 6;
  const palavrasExcedido = palavras > maxPalavras;
  const linhasExcedido = mensagem.split("\n").length > maxLinhas;
  const selectedThemeCustomLogoUrl = useMemo(() => resolveThemeLogoUrl(selectedTheme), [selectedTheme]);
  const hasSelectedThemeCustomLogo = Boolean(selectedThemeCustomLogoUrl);
  const activeLogoUrl =
    logoSourceMode === "custom" && hasSelectedThemeCustomLogo
      ? selectedThemeCustomLogoUrl
      : companyLogoUrl;

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    categories.forEach((cat) => {
      map.set(cat.id, String(cat.nome || "").trim());
    });
    return map;
  }, [categories]);

  const temaFilterOptions = useMemo(() => {
    const options = [...CRM_TEMA_FILTER_BASE_OPTIONS];
    const knownBuckets = new Set(options.map((option) => option.value));

    categories.forEach((cat) => {
      const id = String(cat.id || "").trim();
      const nome = String(cat.nome || "").trim();
      if (!id || !nome) return;
      const normalized = normalizeText(nome);
      const fixedBucket = resolveTemaBucket(normalized);
      if (fixedBucket && knownBuckets.has(fixedBucket)) return;
      options.push({ label: nome, value: `cat:${id}` });
    });

    return options;
  }, [categories]);

  const filteredThemes = useMemo(
    () =>
      themes.filter((t) => {
        const matchScope = scopeFilter === "all" ? true : normalizeScopeValue(t.scope) === scopeFilter;
        const categoryName = categoryNameById.get(String(t.categoria_id || "").trim()) || String(t.categoria || "").trim();
        const normalizedThemeText = normalizeText(`${t.nome || ""} ${categoryName || ""}`);
        const matchTema = matchesTemaFilter(temaFilter, normalizedThemeText, t.categoria_id);
        return matchScope && matchTema;
      }),
    [themes, scopeFilter, temaFilter, categoryNameById]
  );

  const totalThemePages = Math.max(1, Math.ceil(filteredThemes.length / CRM_THEMES_PER_PAGE));

  const pagedThemes = useMemo(() => {
    const start = (themePage - 1) * CRM_THEMES_PER_PAGE;
    return filteredThemes.slice(start, start + CRM_THEMES_PER_PAGE);
  }, [filteredThemes, themePage]);

  const filteredMessages = useMemo(() => {
    if (!selectedTheme) return messageLibrary;
    const catNome = (selectedTheme.categoria || "").toLowerCase();
    return messageLibrary.filter((m) => {
      const mCat = (m.categoria || "").toLowerCase();
      if (!catNome) return !mCat || mCat === "geral";
      return !mCat || mCat === catNome || mCat === "geral";
    }).sort((a, b) => {
      const ownA = a.user_id === currentUserId ? 1 : 0;
      const ownB = b.user_id === currentUserId ? 1 : 0;
      if (ownA !== ownB) return ownB - ownA;
      return a.nome.localeCompare(b.nome);
    });
  }, [messageLibrary, selectedTheme, currentUserId]);

  const titleDropdownOptions = useMemo(() => {
    const options = [{ label: "Selecione o título", value: "" }];
    filteredMessages.forEach((message) => {
      const titulo = String(message.titulo || message.nome || "").trim();
      if (!titulo) return;
      options.push({
        label: titulo,
        value: message.id,
      });
    });
    return options;
  }, [filteredMessages]);

  const templatesByScope = useMemo(() => {
    return {
      system: themes.filter((theme) => normalizeScopeValue(theme.scope) === "system").length,
      master: themes.filter((theme) => normalizeScopeValue(theme.scope) === "master").length,
      gestor: themes.filter((theme) => normalizeScopeValue(theme.scope) === "gestor").length,
      user: themes.filter((theme) => normalizeScopeValue(theme.scope) === "user").length,
    };
  }, [themes]);

  const availableScopeOptions = useMemo(
    () => getAvailableScopeOptions(currentUserRole, isAdmin),
    [currentUserRole, isAdmin]
  );

  const defaultCreationScope = useMemo<ScopeValue>(
    () => availableScopeOptions[0]?.value || "user",
    [availableScopeOptions]
  );

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "long",
      }).format(new Date()),
    []
  );

  const moveElement = useCallback(
    (key: keyof CardPositionForm, axis: "x" | "y", delta: number) => {
      setTextPosition((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          [axis]: clampPositionOffset((prev[key][axis] || 0) + delta),
        },
      }));
    },
    []
  );

  const resetElementPosition = useCallback((key: keyof CardPositionForm) => {
    setTextPosition((prev) => ({
      ...prev,
      [key]: { x: 0, y: 0 },
    }));
  }, []);

  const resetTextFormatting = useCallback(() => {
    setTextPosition({ ...DEFAULT_CARD_POSITION });
    setTextColor("");
  }, []);

  const renderInlinePositionControl = useCallback(
    (params: {
      keyName: keyof CardPositionForm;
      label: string;
    }) => {
      const pos = textPosition[params.keyName] || { x: 0, y: 0 };
      const step = 6;
      const titleBase = `Mover ${params.label}`;
      return (
        <div className="crm-position-inline" aria-label={`${titleBase} no cartão`}>
          <button
            type="button"
            className="crm-position-btn"
            onClick={() => moveElement(params.keyName, "y", -step)}
            title={`${titleBase} para cima`}
            aria-label={`${titleBase} para cima`}
          >
            <i className="pi pi-arrow-up" />
          </button>
          <button
            type="button"
            className="crm-position-btn"
            onClick={() => moveElement(params.keyName, "x", -step)}
            title={`${titleBase} para esquerda`}
            aria-label={`${titleBase} para esquerda`}
          >
            <i className="pi pi-arrow-left" />
          </button>
          <button
            type="button"
            className="crm-position-btn"
            onClick={() => moveElement(params.keyName, "x", step)}
            title={`${titleBase} para direita`}
            aria-label={`${titleBase} para direita`}
          >
            <i className="pi pi-arrow-right" />
          </button>
          <button
            type="button"
            className="crm-position-btn"
            onClick={() => moveElement(params.keyName, "y", step)}
            title={`${titleBase} para baixo`}
            aria-label={`${titleBase} para baixo`}
          >
            <i className="pi pi-arrow-down" />
          </button>
          <button
            type="button"
            className="crm-position-btn"
            onClick={() => resetElementPosition(params.keyName)}
            title={`Zerar posição de ${params.label}`}
            aria-label={`Zerar posição de ${params.label}`}
          >
            <i className="pi pi-refresh" />
          </button>
          <span className="crm-position-inline__value">
            X:{pos.x >= 0 ? `+${pos.x}` : pos.x} · Y:{pos.y >= 0 ? `+${pos.y}` : pos.y}
          </span>
        </div>
      );
    },
    [moveElement, resetElementPosition, textPosition]
  );

  useEffect(() => {
    if (!temaFilter.startsWith("cat:")) return;
    const exists = categories.some((cat) => `cat:${String(cat.id || "").trim()}` === temaFilter);
    if (!exists) setTemaFilter("all");
  }, [temaFilter, categories]);

  useEffect(() => {
    setThemePage(1);
  }, [scopeFilter, temaFilter]);

  useEffect(() => {
    if (themePage > totalThemePages) {
      setThemePage(totalThemePages);
    }
  }, [themePage, totalThemePages]);

  useEffect(() => {
    if (logoSourceMode === "custom" && !hasSelectedThemeCustomLogo) {
      setLogoSourceMode("default");
    }
  }, [logoSourceMode, hasSelectedThemeCustomLogo]);

  useEffect(() => {
    if (logoSourceMode === "default" && !companyLogoUrl && hasSelectedThemeCustomLogo) {
      setLogoSourceMode("custom");
    }
  }, [logoSourceMode, companyLogoUrl, hasSelectedThemeCustomLogo]);

  useEffect(() => {
    setThemeForm((prev) => {
      if (availableScopeOptions.some((option) => option.value === prev.scope)) return prev;
      return { ...prev, scope: defaultCreationScope };
    });
    setMessageForm((prev) => {
      if (availableScopeOptions.some((option) => option.value === prev.scope)) return prev;
      return { ...prev, scope: defaultCreationScope };
    });
  }, [availableScopeOptions, defaultCreationScope]);

  useEffect(() => {
    let mounted = true;
    async function loadTodayBirthdays() {
      setLoadingBirthdays(true);
      try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const resp = await fetch(`/api/v1/dashboard/aniversariantes?mode=geral&month=${month}`, {
          credentials: "include",
        });
        if (!resp.ok) throw new Error(`Falha ao carregar aniversariantes (${resp.status}).`);
        const payload = (await resp.json()) as any;
        const items = ((payload?.items || []) as BirthdayItem[])
          .filter((item) => {
            const parts = parseBirthDateParts(item?.nascimento);
            return Boolean(
              parts &&
                parts.month === month &&
                parts.day === day &&
                String(item?.pessoa_tipo || "cliente") !== "acompanhante"
            );
          })
          .sort((a, b) => String(a?.nome || "").localeCompare(String(b?.nome || ""), "pt-BR"));
        if (!mounted) return;
        setBirthdayItemsToday(items);
      } catch (err) {
        console.error("[CRM] Falha ao carregar aniversariantes do dia:", err);
        if (mounted) setBirthdayItemsToday([]);
      } finally {
        if (mounted) setLoadingBirthdays(false);
      }
    }
    loadTodayBirthdays();
    return () => {
      mounted = false;
    };
  }, []);

  // ── Load data ────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const resp = await fetch("/api/v1/crm/library", { credentials: "include" });
        if (!resp.ok) {
          throw new Error(`Falha ao carregar biblioteca CRM (${resp.status}).`);
        }
        const payload = (await resp.json()) as any;

        setCurrentUserId(String(payload?.userId || ""));
        setCurrentUserRole(String(payload?.userRole || ""));
        setCurrentCompanyId(String(payload?.currentCompanyId || "").trim() || null);
        setIsAdmin(Boolean(payload?.isAdmin));
        setCategories((payload?.categories || []) as Category[]);
        setThemes(
          ((payload?.themes || []) as Theme[])
            .filter((theme: any) => theme?.ativo !== false)
            .map((theme) => ({
              ...theme,
              scope: normalizeScopeValue(theme.scope),
            }))
        );
        setMessageLibrary(
          ((payload?.messages || []) as MessageTemplate[])
            .filter((message: any) => message?.ativo !== false)
            .map((message) => ({
              ...message,
              scope: normalizeScopeValue(message.scope),
            }))
        );

        const settings = payload?.settings || null;
        const resolvedLogo = await resolveLogoUrlFromSettings(settings);
        setCompanyLogoUrl(resolvedLogo);
        setCompanyLogoMissing(!resolvedLogo);

        const sig = payload?.signature || null;
        if (sig?.id) {
          setSavedSigId(String(sig.id));
          setAssinatura({
            linha1: sig.linha1 || "",
            linha1_font_size: sig.linha1_font_size ?? 40,
            linha1_italic: sig.linha1_italic ?? false,
            linha2: sig.linha2 || settings?.consultor_nome || "",
            linha2_font_size: sig.linha2_font_size ?? 56,
            linha2_italic: sig.linha2_italic ?? false,
            linha3: sig.linha3 || "",
            linha3_font_size: sig.linha3_font_size ?? 38,
            linha3_italic: sig.linha3_italic ?? false,
          });
        } else if (settings?.consultor_nome) {
          setAssinatura((prev) => ({ ...prev, linha2: String(settings.consultor_nome || "") }));
        }
      } catch (err) {
        console.error("[CRM] Erro no endpoint /api/v1/crm/library, tentando fallback direto:", err);
        try {
          const authResp = await supabaseBrowser.auth.getUser();
          const fallbackUserId = authResp.data?.user?.id || "";
          const [catResp, themeResp, msgResp, sigResp, settingsResp, userMetaResp] = await Promise.all([
            supabaseBrowser
              .from("crm_template_categories")
              .select("id, nome, icone, sort_order")
              .eq("ativo", true)
              .order("sort_order"),
            queryThemesWithLogoFallback(),
            supabaseBrowser
              .from("user_message_templates")
              .select("id, user_id, nome, titulo, corpo, categoria, scope, ativo")
              .order("nome"),
            supabaseBrowser
              .from("user_crm_assinaturas")
              .select("*")
              .eq("is_default", true)
              .maybeSingle(),
            supabaseBrowser
              .from("quote_print_settings")
              .select("logo_url, logo_path, consultor_nome")
              .eq("owner_user_id", fallbackUserId)
              .maybeSingle(),
            supabaseBrowser
              .from("users")
              .select("company_id, user_types(name)")
              .eq("id", fallbackUserId)
              .maybeSingle(),
          ]);
          if (themeResp.error) throw themeResp.error;

          const userMeta = (userMetaResp.data || null) as any;
          setCurrentUserId(fallbackUserId);
          setCurrentUserRole(String(userMeta?.user_types?.name || ""));
          setCurrentCompanyId(String(userMeta?.company_id || "").trim() || null);
          setIsAdmin(String(userMeta?.user_types?.name || "").trim().toUpperCase() === "ADMIN");
          setCategories((catResp.data || []) as Category[]);
          setThemes(
            ((themeResp.data || []) as Theme[])
              .filter((theme: any) => theme?.ativo !== false)
              .map((theme) => ({
              ...theme,
              scope: normalizeScopeValue(theme.scope),
            }))
          );
          setMessageLibrary(
            ((msgResp.data || []) as MessageTemplate[])
              .filter((message: any) => message?.ativo !== false)
              .map((message) => ({
              ...message,
              scope: normalizeScopeValue(message.scope),
            }))
          );

          let settings = settingsResp.data as any;
          if (!settings && settingsResp.error) {
            const legacySettingsResp = await supabaseBrowser
              .from("quote_print_settings")
              .select("logo_url, consultor_nome")
              .eq("owner_user_id", fallbackUserId)
              .maybeSingle();
            settings = legacySettingsResp.data as any;
          }
          const resolvedLogo = await resolveLogoUrlFromSettings(settings);
          setCompanyLogoUrl(resolvedLogo);
          setCompanyLogoMissing(!resolvedLogo);

          const sig = sigResp.data as any;
          if (sig) {
            setSavedSigId(sig.id);
            setAssinatura({
              linha1: sig.linha1 || "",
              linha1_font_size: sig.linha1_font_size ?? 40,
              linha1_italic: sig.linha1_italic ?? false,
              linha2: sig.linha2 || settings?.consultor_nome || "",
              linha2_font_size: sig.linha2_font_size ?? 56,
              linha2_italic: sig.linha2_italic ?? false,
              linha3: sig.linha3 || "",
              linha3_font_size: sig.linha3_font_size ?? 38,
              linha3_italic: sig.linha3_italic ?? false,
            });
          } else if (settings?.consultor_nome) {
            setAssinatura((prev) => ({ ...prev, linha2: settings.consultor_nome }));
          }
        } catch (fallbackErr) {
          console.error("[CRM] Erro no fallback direto:", fallbackErr);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Client search ────────────────────────────────────────────────
  const buscarClientes = useCallback(async (busca: string) => {
    if (busca.length < 2) { setClienteResults([]); return; }
    setSearchingClientes(true);
    try {
      const { data } = await supabaseBrowser
        .from("clientes")
        .select("id, nome")
        .ilike("nome", `%${busca}%`)
        .limit(8);
      setClienteResults(data || []);
    } finally {
      setSearchingClientes(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => buscarClientes(clienteBusca), 350);
    return () => clearTimeout(t);
  }, [clienteBusca, buscarClientes]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node)) {
        setClienteResults([]);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Select theme ─────────────────────────────────────────────────
  function applyTemplateById(templateId: string) {
    const selected = filteredMessages.find((message) => message.id === templateId);
    if (!selected) return;
    const selectedTitle = String(selected.titulo || selected.nome || "").trim();
    if (selectedTitle) {
      setGreeting(selectedTitle);
    }
    setMensagem(stripLegacyGreeting(selected.corpo));
  }

  const selectTheme = useCallback((theme: Theme) => {
    setSelectedTheme(theme);
    setSelectedMessageTemplateId("");
    setGreeting(resolveGreetingByTheme(theme));
    setMensagem("");
    setPreviewUrl(null);
  }, []);

  useEffect(() => {
    if (filteredThemes.length === 0) {
      if (selectedTheme) setSelectedTheme(null);
      return;
    }
    if (selectedTheme && filteredThemes.some((theme) => theme.id === selectedTheme.id)) {
      return;
    }
    selectTheme(filteredThemes[0]);
  }, [filteredThemes, selectedTheme, selectTheme]);

  function applyBirthdayCliente(item: BirthdayItem) {
    const nome = String(item?.nome || "").trim();
    if (!nome) return;
    setSelectedBirthdayId(item.id);
    setClienteNome(nome);
    setClienteBusca(nome);
    setUseCustomNome(false);
    setClienteNomeCustom("");
  }

  useEffect(() => {
    if (!selectedTheme) return;
    if (!filteredMessages.length) {
      setSelectedMessageTemplateId("");
      return;
    }
    if (selectedMessageTemplateId && filteredMessages.some((message) => message.id === selectedMessageTemplateId)) {
      return;
    }

    const greetingByTheme = resolveGreetingByTheme(selectedTheme);
    const normalizedGreetingByTheme = normalizeText(greetingByTheme);
    const matched =
      filteredMessages.find((message) => {
        const messageTitle = normalizeText(String(message.titulo || message.nome || ""));
        if (!messageTitle || !normalizedGreetingByTheme) return false;
        return messageTitle.includes(normalizedGreetingByTheme) || normalizedGreetingByTheme.includes(messageTitle);
      }) || filteredMessages[0];

    if (!matched) return;
    setSelectedMessageTemplateId(matched.id);
    const matchedTitle = String(matched.titulo || matched.nome || "").trim();
    setGreeting(matchedTitle || greetingByTheme);
    setMensagem(stripLegacyGreeting(matched.corpo));
  }, [selectedTheme, filteredMessages, selectedMessageTemplateId]);

  // ── Build preview (debounced) ────────────────────────────────────
  useEffect(() => {
    if (!selectedTheme) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const url = buildPreviewParams({
        themeId: selectedTheme.id,
        themeName: selectedTheme.nome,
        themeAssetUrl: selectedTheme.asset_url,
        greeting,
        primeiroNome,
        nomeCompleto: clienteNome || primeiroNome,
        mensagem,
        assinatura,
        logoUrl: activeLogoUrl,
        textColor,
        position: textPosition,
      });
      setPreviewUrl(url);
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [selectedTheme, greeting, primeiroNome, clienteNome, mensagem, assinatura, activeLogoUrl, textColor, textPosition]);

  // ── Save signature ───────────────────────────────────────────────
  async function salvarAssinatura() {
    setSavingSig(true);
    try {
      const {
        data: { user },
      } = await supabaseBrowser.auth.getUser();
      if (!user) return;
      const payload = {
        user_id: user.id,
        nome: "Minha Assinatura",
        linha1: assinatura.linha1,
        linha1_font_size: assinatura.linha1_font_size,
        linha1_italic: assinatura.linha1_italic,
        linha2: assinatura.linha2,
        linha2_font_size: assinatura.linha2_font_size,
        linha2_italic: assinatura.linha2_italic,
        linha3: assinatura.linha3,
        linha3_font_size: assinatura.linha3_font_size,
        linha3_italic: assinatura.linha3_italic,
        is_default: true,
        updated_at: new Date().toISOString(),
      };
      if (savedSigId) {
        await supabaseBrowser
          .from("user_crm_assinaturas")
          .update(payload)
          .eq("id", savedSigId);
      } else {
        const { data: inserted } = await supabaseBrowser
          .from("user_crm_assinaturas")
          .insert(payload)
          .select("id")
          .single();
        if (inserted?.id) setSavedSigId(inserted.id);
      }
      setSigSaved(true);
      setTimeout(() => setSigSaved(false), 3000);
    } finally {
      setSavingSig(false);
    }
  }

  // ── WhatsApp share ───────────────────────────────────────────────
  function compartilharWhatsApp() {
    if (!previewUrl || !primeiroNome) return;
    const absoluteImg = `${window.location.origin}${previewUrl.replace(".svg", ".png")}`;
    const texto = encodeURIComponent(
      `${greeting ? greeting + "\n\n" : ""}${mensagem ? mensagem + "\n\n" : ""}${assinatura.linha1 ? assinatura.linha1 + "\n" : ""}${assinatura.linha2 || ""}`
    );
    window.open(`https://wa.me/?text=${texto}%0A%0A${encodeURIComponent(absoluteImg)}`, "_blank");
  }

  function copiarLinkPreview() {
    if (!previewUrl) return;
    const url = `${window.location.origin}${previewUrl}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }

  async function reloadCategories() {
    const { data, error } = await supabaseBrowser
      .from("crm_template_categories")
      .select("id, nome, icone, sort_order")
      .eq("ativo", true)
      .order("sort_order");
    if (error) {
      showToast(error.message || "Erro ao recarregar categorias.", "error");
      return;
    }
    setCategories((data || []) as Category[]);
  }

  async function reloadThemes() {
    const { data, error } = await queryThemesWithLogoFallback();
    if (error) {
      showToast(error.message || "Erro ao recarregar modelos.", "error");
      return;
    }
    setThemes(
      ((data || []) as Theme[])
        .filter((theme: any) => theme?.ativo !== false)
        .map((theme) => ({
          ...theme,
          scope: normalizeScopeValue(theme.scope),
        }))
    );
  }

  async function reloadMessages() {
    const { data, error } = await supabaseBrowser
      .from("user_message_templates")
      .select("id, user_id, nome, titulo, corpo, categoria, scope, ativo")
      .order("nome");
    if (error) {
      showToast(error.message || "Erro ao recarregar mensagens.", "error");
      return;
    }
    setMessageLibrary(
      ((data || []) as MessageTemplate[])
        .filter((message: any) => message?.ativo !== false)
        .map((message) => ({
          ...message,
          scope: normalizeScopeValue(message.scope),
        }))
    );
  }

  function openCreateCategory() {
    setShowCreateThemeModal(false);
    setShowCreateMessageModal(false);
    setCategoryForm(emptyCategoryForm());
    setShowCreateCategoryModal(true);
  }

  function openCreateTheme() {
    setShowCreateCategoryModal(false);
    setShowCreateMessageModal(false);
    setThemeForm(emptyThemeForm(defaultCreationScope));
    setShowCreateThemeModal(true);
  }

  function openCreateMessage() {
    setShowCreateCategoryModal(false);
    setShowCreateThemeModal(false);
    setMessageForm(emptyMessageForm(defaultCreationScope));
    setShowCreateMessageModal(true);
  }

  async function uploadThemeArt(file: File) {
    if (!currentUserId) {
      showToast("Sessão inválida para upload da arte.", "error");
      return;
    }
    setUploadingThemeArt(true);
    try {
      const safeFileName = file.name.replace(/[^a-z0-9.\-_]/gi, "_");
      const path = `users/${currentUserId}/${Date.now()}-${safeFileName}`;
      const previousStoragePath = getStoragePathFromPublicUrl(themeForm.asset_url);
      const { error: uploadError } = await supabaseBrowser.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;

      const publicUrl = supabaseBrowser.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
      if (!publicUrl) throw new Error("Falha ao gerar URL pública da arte.");
      setThemeForm((prev) => ({ ...prev, asset_url: publicUrl }));

      if (previousStoragePath && previousStoragePath !== path) {
        const { error: removeError } = await supabaseBrowser.storage.from(STORAGE_BUCKET).remove([previousStoragePath]);
        if (removeError) {
          console.warn("[CRM] Falha ao remover arte anterior do rascunho:", removeError);
        }
      }

      showToast("Arte carregada com sucesso.", "success");
    } catch (err: any) {
      showToast(err?.message || "Erro ao carregar arte.", "error");
    } finally {
      setUploadingThemeArt(false);
    }
  }

  async function uploadThemeLogo(file: File) {
    if (!currentUserId) {
      showToast("Sessão inválida para upload do logo.", "error");
      return;
    }
    setUploadingThemeLogo(true);
    try {
      const safeFileName = file.name.replace(/[^a-z0-9.\-_]/gi, "_");
      const path = `users/${currentUserId}/logos/${Date.now()}-${safeFileName}`;
      const previousStoragePath = getStoragePathFromPublicUrl(themeForm.logo_url);
      const { error: uploadError } = await supabaseBrowser.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;

      const publicUrl = supabaseBrowser.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
      if (!publicUrl) throw new Error("Falha ao gerar URL pública do logo.");
      setThemeForm((prev) => ({ ...prev, logo_url: publicUrl }));

      if (previousStoragePath && previousStoragePath !== path) {
        const { error: removeError } = await supabaseBrowser.storage.from(STORAGE_BUCKET).remove([previousStoragePath]);
        if (removeError) {
          console.warn("[CRM] Falha ao remover logo anterior do rascunho:", removeError);
        }
      }

      showToast("Logo personalizado carregado com sucesso.", "success");
    } catch (err: any) {
      showToast(err?.message || "Erro ao carregar logo personalizado.", "error");
    } finally {
      setUploadingThemeLogo(false);
    }
  }

  async function saveCategory() {
    if (!categoryForm.nome.trim()) {
      showToast("Informe o nome da categoria.", "error");
      return;
    }
    setSavingCategory(true);
    try {
      const payload = {
        nome: categoryForm.nome.trim(),
        icone: categoryForm.icone || "pi pi-tag",
        sort_order: Number(categoryForm.sort_order) || 0,
        ativo: categoryForm.ativo !== false,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabaseBrowser.from("crm_template_categories").insert(payload);
      if (error) throw error;
      showToast("Categoria criada com sucesso.", "success");
      setShowCreateCategoryModal(false);
      await reloadCategories();
    } catch (err: any) {
      showToast(err?.message || "Erro ao criar categoria.", "error");
    } finally {
      setSavingCategory(false);
    }
  }

  async function saveTheme() {
    if (!currentUserId) {
      showToast("Sessão inválida.", "error");
      return;
    }
    if (!themeForm.nome.trim()) {
      showToast("Informe o nome do template.", "error");
      return;
    }
    if (!themeForm.asset_url.trim()) {
      showToast("Adicione a arte do template.", "error");
      return;
    }
    setSavingTheme(true);
    try {
      const scope = themeForm.scope || defaultCreationScope;
      const customLogoUrl = themeForm.logo_url.trim();
      const payload = {
        user_id: currentUserId,
        company_id: scope === "system" ? null : currentCompanyId,
        nome: themeForm.nome.trim(),
        categoria_id: themeForm.categoria_id || null,
        asset_url: themeForm.asset_url.trim(),
        logo_url: customLogoUrl || null,
        logo_path: customLogoUrl ? getStoragePathFromPublicUrl(customLogoUrl) : null,
        scope,
        greeting_text: themeForm.greeting_text?.trim() || null,
        mensagem_max_linhas: Number(themeForm.mensagem_max_linhas) || 6,
        mensagem_max_palavras: Number(themeForm.mensagem_max_palavras) || 50,
        assinatura_max_linhas: Number(themeForm.assinatura_max_linhas) || 3,
        assinatura_max_palavras: Number(themeForm.assinatura_max_palavras) || 20,
        ativo: themeForm.ativo !== false,
        updated_at: new Date().toISOString(),
      };
      let createdWithLegacyColumns = false;
      let { error } = await supabaseBrowser.from("user_message_template_themes").insert(payload);
      if (error && isThemeLogoColumnMissingError(error)) {
        const { logo_url, logo_path, ...legacyPayload } = payload;
        const legacyInsert = await supabaseBrowser.from("user_message_template_themes").insert(legacyPayload);
        error = legacyInsert.error;
        if (!error) {
          createdWithLegacyColumns = true;
        }
      }
      if (error) throw error;
      showToast(
        createdWithLegacyColumns
          ? "Template criado, mas este ambiente ainda não suporta logo personalizado. Aplique a migration do CRM para habilitar."
          : "Template criado com sucesso.",
        createdWithLegacyColumns ? "warning" : "success"
      );
      setShowCreateThemeModal(false);
      await reloadThemes();
    } catch (err: any) {
      showToast(err?.message || "Erro ao criar template.", "error");
    } finally {
      setSavingTheme(false);
    }
  }

  async function saveMessageTemplate() {
    if (!currentUserId) {
      showToast("Sessão inválida.", "error");
      return;
    }
    if (!messageForm.nome.trim()) {
      showToast("Informe o nome da mensagem.", "error");
      return;
    }
    if (!messageForm.titulo.trim()) {
      showToast("Informe o título/greeting.", "error");
      return;
    }
    if (!messageForm.corpo.trim()) {
      showToast("Informe a mensagem principal.", "error");
      return;
    }
    setSavingMessage(true);
    try {
      const scope = messageForm.scope || defaultCreationScope;
      const payload = {
        user_id: currentUserId,
        company_id: scope === "system" ? null : currentCompanyId,
        nome: messageForm.nome.trim(),
        categoria: messageForm.categoria?.trim() || null,
        assunto: messageForm.titulo.trim(),
        titulo: messageForm.titulo.trim(),
        corpo: messageForm.corpo.trim(),
        scope,
        ativo: messageForm.ativo !== false,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabaseBrowser.from("user_message_templates").insert(payload);
      if (error) throw error;
      showToast("Mensagem criada com sucesso.", "success");
      setShowCreateMessageModal(false);
      await reloadMessages();
    } catch (err: any) {
      showToast(err?.message || "Erro ao criar mensagem.", "error");
    } finally {
      setSavingMessage(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="crm-loading">
        <span className="crm-spinner" />
        <span>Carregando templates…</span>
      </div>
    );
  }

  const showComposer = Boolean(selectedTheme);

  return (
    <div className="crm-root">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <AppCard
        tone="info"
        title="CRM — Relacionamento com Cliente"
        subtitle="Escolha o modelo, personalize a mensagem e gere o cartão com preenchimento automático nos espaços técnicos."
      />

      {/* ── Logo missing alert ── */}
      {companyLogoMissing && (
        <div className="crm-alert crm-alert--warning">
          <i className="pi pi-image" />
          <span>
            O logo padrão da sua empresa ainda não está configurado.{" "}
            <a href="/parametros/orcamentos">Clique aqui para configurar</a>.{" "}
            Você também pode usar logo personalizado por template, quando disponível.
          </span>
        </div>
      )}

      <AppCard
        tone="config"
        className="crm-birthday-card"
        title={`Aniversariantes de hoje (${todayLabel})`}
        subtitle="Clique no cliente para preencher o nome no cartão e agilizar o envio."
      >
        {loadingBirthdays ? (
          <div className="crm-birthday-loading">
            <span className="crm-spinner crm-spinner--sm" />
            <span>Carregando aniversariantes do dia...</span>
          </div>
        ) : birthdayItemsToday.length === 0 ? (
          <p className="crm-birthday-empty">Nenhum aniversariante encontrado para hoje.</p>
        ) : (
          <div className="crm-birthday-list">
            {birthdayItemsToday.map((item) => {
              const selected = selectedBirthdayId === item.id;
              const nome = String(item.nome || "").trim() || "Cliente";
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`crm-birthday-chip${selected ? " is-active" : ""}`}
                  onClick={() => applyBirthdayCliente(item)}
                  title={`Selecionar ${nome} para personalizar o cartão`}
                >
                  <i className="pi pi-gift" />
                  <span>{nome}</span>
                </button>
              );
            })}
          </div>
        )}
      </AppCard>

      <AppCard tone="info" className="vtur-conciliacao-tab-card crm-admin-tab-card">
        <div className="vtur-conciliacao-tab-nav">
          <button
            type="button"
            className={["vtur-conciliacao-tab-btn", showCreateThemeModal ? "is-active" : ""].filter(Boolean).join(" ")}
            onClick={openCreateTheme}
          >
            <span className="vtur-conciliacao-tab-btn-label">
              <i className="pi pi-images" aria-hidden="true" /> Novo template
            </span>
            <span className="vtur-conciliacao-tab-btn-sub">Artes e configurações visuais.</span>
          </button>
          <button
            type="button"
            className={["vtur-conciliacao-tab-btn", showCreateCategoryModal ? "is-active" : ""].filter(Boolean).join(" ")}
            onClick={openCreateCategory}
          >
            <span className="vtur-conciliacao-tab-btn-label">
              <i className="pi pi-tags" aria-hidden="true" /> Nova categoria
            </span>
            <span className="vtur-conciliacao-tab-btn-sub">Organização e ordenação dos grupos.</span>
          </button>
          <button
            type="button"
            className={["vtur-conciliacao-tab-btn", showCreateMessageModal ? "is-active" : ""].filter(Boolean).join(" ")}
            onClick={openCreateMessage}
          >
            <span className="vtur-conciliacao-tab-btn-label">
              <i className="pi pi-file-edit" aria-hidden="true" /> Nova mensagem
            </span>
            <span className="vtur-conciliacao-tab-btn-sub">Mensagens reutilizáveis por tema.</span>
          </button>
        </div>
      </AppCard>

      <div className={`crm-layout${showComposer ? " crm-layout--split" : ""}`}>
        {/* ════════════════ LEFT: Gallery ════════════════ */}
        <aside className="crm-gallery">
          <AppCard
            tone="info"
            className="crm-panel-card crm-equal-card crm-models-card"
            title="Modelos"
            subtitle="Filtre por escopo e ocasião para escolher a arte."
          >
            <div className="vtur-inline-filter-row crm-filter-row">
              <AppField
                as="select"
                label="Escopo"
                value={scopeFilter}
                onChange={(e) =>
                  setScopeFilter((e as React.ChangeEvent<HTMLSelectElement>).target.value as "all" | "system" | "master" | "gestor" | "user")
                }
                options={[
                  { label: "Todos", value: "all" },
                  { label: `Sistema (${templatesByScope.system})`, value: "system" },
                  { label: `Master (${templatesByScope.master})`, value: "master" },
                  { label: `Gestor (${templatesByScope.gestor})`, value: "gestor" },
                  { label: `Meus (${templatesByScope.user})`, value: "user" },
                ]}
              />
              <AppField
                as="select"
                label="Tema"
                value={temaFilter}
                onChange={(e) => setTemaFilter((e as React.ChangeEvent<HTMLSelectElement>).target.value as TemaFilterValue)}
                options={temaFilterOptions}
              />
              <div className="vtur-inline-filter-actions">
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setScopeFilter("all");
                    setTemaFilter("all");
                  }}
                >
                  Limpar
                </AppButton>
              </div>
            </div>

            {filteredThemes.length === 0 ? (
              <p className="crm-empty">Nenhum modelo encontrado para os filtros atuais.</p>
            ) : (
              <div className="crm-theme-grid-wrap">
                <div className="crm-theme-grid">
                  {pagedThemes.map((t) => (
                    <ThumbCard
                      key={t.id}
                      theme={t}
                      selected={selectedTheme?.id === t.id}
                      onSelect={selectTheme}
                    />
                  ))}
                </div>
              </div>
            )}
            {filteredThemes.length > 0 && (
              <div className="crm-theme-pagination">
                <AppButton
                  type="button"
                  variant="secondary"
                  icon="pi pi-angle-left"
                  onClick={() => setThemePage((p) => Math.max(1, p - 1))}
                  disabled={themePage <= 1}
                >
                  Anterior
                </AppButton>
                <span className="crm-theme-pagination__meta">
                  Página {themePage} de {totalThemePages}
                </span>
                <AppButton
                  type="button"
                  variant="secondary"
                  icon="pi pi-angle-right"
                  iconPos="right"
                  onClick={() => setThemePage((p) => Math.min(totalThemePages, p + 1))}
                  disabled={themePage >= totalThemePages}
                >
                  Próxima
                </AppButton>
              </div>
            )}
          </AppCard>
        </aside>

        {/* ════════════════ RIGHT: Composer + Preview ════════════════ */}
        {showComposer && selectedTheme && (
          <div className="crm-composer-wrap">
            <div className="crm-composer-split">
              {/* ── Form ── */}
              <AppCard
                tone="default"
                className="crm-form crm-panel-card crm-equal-card"
                title="Personalizar cartão"
                subtitle="Título, nome do cliente, mensagem e assinatura padronizados pelo mapa técnico."
              >
                <div className="crm-template-meta">
                  <span className={getScopeTone(selectedTheme.scope)}>{getScopeLabel(selectedTheme.scope)}</span>
                  <span className="crm-template-meta__name">{selectedTheme.nome}</span>
                </div>

                <div className="crm-text-color-box">
                  <label className="crm-label">
                    Cor do texto
                    <span className="crm-hint-inline">uma cor única para todo o texto do cartão</span>
                  </label>
                  <div className="crm-color-palette" role="radiogroup" aria-label="Cor do texto do cartão">
                    {CARD_TEXT_COLOR_PRESETS.map((color) => {
                      const selected = textColor === color.value;
                      const isDefault = !color.value;
                      return (
                        <button
                          key={color.label}
                          type="button"
                          className={`crm-color-swatch${selected ? " is-active" : ""}${isDefault ? " is-default" : ""}`}
                          style={isDefault ? undefined : { backgroundColor: color.value }}
                          onClick={() => setTextColor(color.value)}
                          title={
                            isDefault
                              ? "Usar as cores padrão do template"
                              : `Aplicar ${color.label} em todo o texto`
                          }
                          aria-label={
                            isDefault
                              ? "Cor padrão do template"
                              : `Cor ${color.label}`
                          }
                          aria-pressed={selected}
                        >
                          {isDefault && <span>Aa</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Greeting */}
                <div className="crm-field">
                  <div className="crm-label-row">
                    <label className="crm-label">
                      Título / saudação
                      <span className="crm-hint-inline">escolha um título da biblioteca</span>
                    </label>
                    {renderInlinePositionControl({
                      keyName: "title",
                      label: "Título / saudação",
                    })}
                  </div>
                  <select
                    className="form-select"
                    value={selectedMessageTemplateId}
                    onChange={(e) => {
                      const templateId = e.target.value;
                      setSelectedMessageTemplateId(templateId);
                      if (!templateId) {
                        setGreeting(resolveGreetingByTheme(selectedTheme));
                        return;
                      }
                      applyTemplateById(templateId);
                    }}
                  >
                    {titleDropdownOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Client name */}
                <div className="crm-field">
                  <div className="crm-label-row">
                    <label className="crm-label">Nome do cliente</label>
                    {renderInlinePositionControl({
                      keyName: "clientName",
                      label: "Nome do cliente",
                    })}
                  </div>
                  <div className="crm-client-row">
                    <div className="crm-client-search" ref={clienteRef}>
                      <input
                        type="text"
                        className="form-input"
                        value={clienteBusca}
                        onChange={(e) => setClienteBusca(e.target.value)}
                        placeholder="Buscar cliente…"
                      />
                      {clienteResults.length > 0 && (
                        <div className="crm-client-dropdown">
                          {clienteResults.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              className="crm-client-item"
                              onClick={() => {
                                setClienteNome(c.nome);
                                setClienteBusca(c.nome);
                                setClienteResults([]);
                                setUseCustomNome(false);
                                setClienteNomeCustom("");
                              }}
                            >
                              {c.nome}
                            </button>
                          ))}
                        </div>
                      )}
                      {searchingClientes && <span className="crm-spinner crm-spinner--sm" />}
                    </div>
                  </div>

                  {/* Nome exibido + personalização */}
                  {(clienteNome || useCustomNome) && (
                    <div className="crm-nome-preview">
                      <span className="crm-nome-preview__text">
                        Nome exibido no cartão: <strong>{primeiroNome || "—"}</strong>
                      </span>
                      {!useCustomNome ? (
                        <button
                          type="button"
                          className="crm-link-btn"
                          onClick={() => {
                            setUseCustomNome(true);
                            setClienteNomeCustom(primeiroNome || getPrimeiroNome(clienteNome));
                          }}
                        >
                          Personalizar nome
                        </button>
                      ) : (
                        <div className="crm-nome-custom-row">
                          <input
                            type="text"
                            className="form-input crm-nome-custom-input"
                            value={clienteNomeCustom}
                            onChange={(e) => setClienteNomeCustom(e.target.value)}
                            placeholder="Nome a exibir"
                          />
                          <button
                            type="button"
                            className="crm-link-btn"
                            onClick={() => { setUseCustomNome(false); setClienteNomeCustom(""); }}
                          >
                            Usar nome original
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Message */}
                <div className="crm-field">
                  <div className="crm-label-row">
                    <label className="crm-label">
                      Mensagem principal
                      <span className="crm-hint-inline">
                        máx. {maxLinhas} linhas · {maxPalavras} palavras
                      </span>
                    </label>
                    {renderInlinePositionControl({
                      keyName: "body",
                      label: "Mensagem principal",
                    })}
                  </div>

                  <textarea
                    className={`form-textarea crm-mensagem${palavrasExcedido || linhasExcedido ? " crm-mensagem--over" : ""}`}
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    placeholder="Mensagem preenchida automaticamente pelo título selecionado."
                    rows={6}
                  />
                  <div className={`crm-counter${palavrasExcedido ? " crm-counter--over" : ""}`}>
                    {palavrasExcedido && (
                      <span className="crm-counter__alert">
                        <i className="pi pi-exclamation-triangle" /> Limite excedido!{" "}
                      </span>
                    )}
                    {palavras}/{maxPalavras} palavras
                    {mensagem.split("\n").length > 1 && (
                      <> · {mensagem.split("\n").length}/{maxLinhas} linhas</>
                    )}
                  </div>
                </div>

                {/* Signature */}
                <div className="crm-field">
                  <div className="crm-label-row">
                    <label className="crm-label">
                      Assinatura
                      <span className="crm-hint-inline">linha 2 obrigatória · linhas 1 e 3 opcionais</span>
                    </label>
                    {renderInlinePositionControl({
                      keyName: "signature",
                      label: "Assinatura",
                    })}
                  </div>
                  <AssinaturaEditor value={assinatura} onChange={setAssinatura} />
                </div>

                <div className="crm-field">
                  <div className="crm-label-row">
                    <label className="crm-label">
                      Logo da empresa
                      <span className="crm-hint-inline">posicione o logo no cartão</span>
                    </label>
                    {renderInlinePositionControl({
                      keyName: "logo",
                      label: "Logo da empresa",
                    })}
                  </div>
                  <div className="crm-logo-source-switch" role="radiogroup" aria-label="Origem do logo do cartão">
                    <button
                      type="button"
                      className={`crm-logo-source-btn${logoSourceMode === "default" ? " is-active" : ""}`}
                      onClick={() => setLogoSourceMode("default")}
                      aria-pressed={logoSourceMode === "default"}
                    >
                      Logo padrão da empresa
                    </button>
                    <button
                      type="button"
                      className={`crm-logo-source-btn${logoSourceMode === "custom" ? " is-active" : ""}`}
                      onClick={() => setLogoSourceMode("custom")}
                      disabled={!hasSelectedThemeCustomLogo}
                      aria-pressed={logoSourceMode === "custom"}
                      title={
                        hasSelectedThemeCustomLogo
                          ? "Usar o logo personalizado cadastrado neste template"
                          : "Este template ainda não possui logo personalizado"
                      }
                    >
                      Logo personalizado do template
                    </button>
                  </div>
                  {hasSelectedThemeCustomLogo ? (
                    <div className="crm-selected-logo-preview">
                      <img src={selectedThemeCustomLogoUrl || ""} alt="Logo personalizado do template" />
                      <span className="crm-hint">Logo personalizado disponível para este template.</span>
                    </div>
                  ) : (
                    <p className="crm-hint">Este template não possui logo personalizado cadastrado.</p>
                  )}
                  <p className="crm-hint">
                    {logoSourceMode === "custom" && hasSelectedThemeCustomLogo
                      ? "Usando logo personalizado do template na pré-visualização."
                      : companyLogoMissing
                        ? "Sem logo padrão configurado."
                        : "Usando logo padrão da empresa na pré-visualização."}
                    {logoSourceMode !== "custom" && companyLogoMissing && (
                      <>
                        {" "}
                        <a href="/parametros/orcamentos">Configurar logo padrão</a>.
                      </>
                    )}
                  </p>
                </div>

                <div className="crm-sig-actions">
                  <AppButton
                    type="button"
                    variant="primary"
                    size="small"
                    onClick={salvarAssinatura}
                    loading={savingSig}
                    disabled={savingSig || !assinatura.linha2.trim()}
                    title={!assinatura.linha2.trim() ? "Informe o nome do consultor na linha 2." : ""}
                  >
                    {sigSaved ? "Assinatura salva!" : "Salvar como padrão"}
                  </AppButton>
                  <AppButton
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={resetTextFormatting}
                    title="Zerar posicionamento e voltar para a cor padrão do template"
                  >
                    Limpar formatação
                  </AppButton>
                </div>
              </AppCard>

              {/* ── Preview panel ── */}
              <AppCard
                tone="default"
                className="crm-preview-panel crm-panel-card crm-equal-card"
                title="Pré-visualização"
                subtitle="Saída final seguindo o template técnico."
              >

                <div className="crm-preview-frame">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Pré-visualização do cartão"
                      className="crm-preview-img"
                      key={previewUrl}
                    />
                  ) : (
                    <div className="crm-preview-placeholder">
                      <i className="pi pi-image" />
                      <span>Preencha os campos para visualizar o cartão</span>
                    </div>
                  )}
                </div>

                {previewUrl && (
                  <div className="crm-preview-actions">
                    <AppButton
                      type="button"
                      variant="primary"
                      icon="pi pi-whatsapp"
                      onClick={compartilharWhatsApp}
                      disabled={!primeiroNome || !assinatura.linha2.trim()}
                      title={!primeiroNome ? "Informe o nome do cliente" : !assinatura.linha2.trim() ? "Informe o nome do consultor na assinatura." : ""}
                    >
                      Compartilhar no WhatsApp
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="secondary"
                      icon="pi pi-external-link"
                      onClick={() => window.open(previewUrl, "_blank")}
                    >
                      Ver em tela cheia
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="secondary"
                      icon="pi pi-link"
                      onClick={copiarLinkPreview}
                    >
                      Copiar link
                    </AppButton>
                  </div>
                )}

                {/* Logo info */}
                <div className="crm-logo-info">
                  <i className="pi pi-info-circle" />
                  {!activeLogoUrl ? (
                    <span>
                      Sem logo disponível para esta seleção.{" "}
                      <a href="/parametros/orcamentos">Configurar logo</a>
                    </span>
                  ) : logoSourceMode === "custom" && hasSelectedThemeCustomLogo ? (
                    <span>Usando logo personalizado do template selecionado.</span>
                  ) : (
                    <span>
                      Usando logo padrão da empresa no canto inferior direito.{" "}
                      <a href="/parametros/orcamentos">Alterar</a>
                    </span>
                  )}
                </div>
              </AppCard>
            </div>
          </div>
        )}

        {/* ── No theme selected: hint ── */}
        {!showComposer && (
          <AppCard tone="config" className="crm-select-card">
            <div className="crm-select-hint">
              <i className="pi pi-hand-pointer" />
              <p>Selecione um modelo à esquerda para personalizar e enviar o cartão.</p>
            </div>
          </AppCard>
        )}
      </div>

      {showCreateCategoryModal && (
        <div className="crm-admin-modal-overlay" onClick={() => setShowCreateCategoryModal(false)}>
          <div className="crm-admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="crm-admin-modal__header">
              <h3>Nova categoria</h3>
              <button type="button" className="crm-link-btn" onClick={() => setShowCreateCategoryModal(false)}>
                <i className="pi pi-times" />
              </button>
            </div>
            <div className="crm-admin-modal__body">
              <div className="crm-field">
                <label className="crm-label">Nome *</label>
                <input
                  type="text"
                  className="form-input"
                  value={categoryForm.nome}
                  onChange={(event) => setCategoryForm((prev) => ({ ...prev, nome: event.target.value }))}
                  placeholder="Ex.: Aniversário"
                  autoFocus
                />
              </div>
              <div className="crm-field">
                <label className="crm-label">Ícone (classe PrimeIcons)</label>
                <div className="crm-icon-row">
                  <input
                    type="text"
                    className="form-input"
                    value={categoryForm.icone}
                    onChange={(event) => setCategoryForm((prev) => ({ ...prev, icone: event.target.value }))}
                    placeholder="pi pi-gift"
                  />
                  <i className={categoryForm.icone} style={{ fontSize: "1.4rem" }} />
                </div>
                <div className="crm-icon-suggestions">
                  {ICON_SUGGESTIONS.map((iconClass) => (
                    <button
                      key={iconClass}
                      type="button"
                      className={`crm-icon-btn${categoryForm.icone === iconClass ? " active" : ""}`}
                      onClick={() => setCategoryForm((prev) => ({ ...prev, icone: iconClass }))}
                      title={iconClass}
                    >
                      <i className={iconClass} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="crm-field">
                <label className="crm-label">Ordem de exibição</label>
                <input
                  type="number"
                  className="form-input"
                  value={categoryForm.sort_order}
                  onChange={(event) => setCategoryForm((prev) => ({ ...prev, sort_order: Number(event.target.value) }))}
                  min={0}
                  style={{ width: 100 }}
                />
              </div>
              <div className="crm-field">
                <label className="crm-label" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={categoryForm.ativo}
                    onChange={(event) => setCategoryForm((prev) => ({ ...prev, ativo: event.target.checked }))}
                    style={{ marginRight: 6 }}
                  />
                  Categoria ativa
                </label>
              </div>
            </div>
            <div className="crm-admin-modal__footer">
              <AppButton type="button" variant="secondary" onClick={() => setShowCreateCategoryModal(false)}>
                Cancelar
              </AppButton>
              <AppButton type="button" variant="primary" onClick={saveCategory} disabled={savingCategory}>
                {savingCategory ? "Salvando..." : "Salvar"}
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {showCreateThemeModal && (
        <div className="crm-admin-modal-overlay" onClick={() => setShowCreateThemeModal(false)}>
          <div className="crm-admin-modal crm-admin-modal--wide" onClick={(event) => event.stopPropagation()}>
            <div className="crm-admin-modal__header">
              <h3>Novo template</h3>
              <button type="button" className="crm-link-btn" onClick={() => setShowCreateThemeModal(false)}>
                <i className="pi pi-times" />
              </button>
            </div>
            <div className="crm-admin-modal__body crm-admin-modal__body--split">
              <div className="crm-admin-modal__col">
                <div className="crm-field">
                  <label className="crm-label">Nome *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={themeForm.nome}
                    onChange={(event) => setThemeForm((prev) => ({ ...prev, nome: event.target.value }))}
                    placeholder="Ex.: Aniversário Azul"
                    autoFocus
                  />
                </div>
                <div className="crm-field">
                  <label className="crm-label">Categoria</label>
                  <select
                    className="form-select"
                    value={themeForm.categoria_id || ""}
                    onChange={(event) => setThemeForm((prev) => ({ ...prev, categoria_id: event.target.value || null }))}
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.nome}</option>
                    ))}
                  </select>
                </div>
                <div className="crm-field">
                  <label className="crm-label">Escopo</label>
                  <select
                    className="form-select"
                    value={themeForm.scope}
                    onChange={(event) => setThemeForm((prev) => ({ ...prev, scope: event.target.value as ScopeValue }))}
                  >
                    {availableScopeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="crm-field">
                  <label className="crm-label">Texto de saudação padrão</label>
                  <input
                    type="text"
                    className="form-input"
                    value={themeForm.greeting_text}
                    onChange={(event) => setThemeForm((prev) => ({ ...prev, greeting_text: event.target.value }))}
                    placeholder="Ex.: Feliz Aniversário!"
                    maxLength={100}
                  />
                </div>
                <div className="crm-admin-limits">
                  <span className="crm-admin-limits__title">Limites da mensagem</span>
                  <div className="crm-admin-limits__row">
                    <label>Linhas</label>
                    <input
                      type="number"
                      className="form-input"
                      value={themeForm.mensagem_max_linhas}
                      onChange={(event) =>
                        setThemeForm((prev) => ({ ...prev, mensagem_max_linhas: Number(event.target.value) || 6 }))
                      }
                      min={1}
                      max={20}
                    />
                    <label>Palavras</label>
                    <input
                      type="number"
                      className="form-input"
                      value={themeForm.mensagem_max_palavras}
                      onChange={(event) =>
                        setThemeForm((prev) => ({ ...prev, mensagem_max_palavras: Number(event.target.value) || 50 }))
                      }
                      min={1}
                      max={500}
                    />
                  </div>
                  <span className="crm-admin-limits__title" style={{ marginTop: 8 }}>Limites da assinatura</span>
                  <div className="crm-admin-limits__row">
                    <label>Linhas</label>
                    <input
                      type="number"
                      className="form-input"
                      value={themeForm.assinatura_max_linhas}
                      onChange={(event) =>
                        setThemeForm((prev) => ({ ...prev, assinatura_max_linhas: Number(event.target.value) || 3 }))
                      }
                      min={1}
                      max={5}
                    />
                    <label>Palavras</label>
                    <input
                      type="number"
                      className="form-input"
                      value={themeForm.assinatura_max_palavras}
                      onChange={(event) =>
                        setThemeForm((prev) => ({ ...prev, assinatura_max_palavras: Number(event.target.value) || 20 }))
                      }
                      min={1}
                      max={100}
                    />
                  </div>
                </div>
              </div>

              <div className="crm-admin-modal__col">
                <div className="crm-field">
                  <label className="crm-label">Arte do cartão *</label>
                  <div
                    className="crm-art-drop"
                    onClick={() => themeFileInputRef.current?.click()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const file = event.dataTransfer.files?.[0];
                      if (file) void uploadThemeArt(file);
                    }}
                  >
                    {themeForm.asset_url ? (
                      <img src={themeForm.asset_url} alt="Arte do template" className="crm-art-preview" />
                    ) : uploadingThemeArt ? (
                      <><span className="crm-spinner" /> Enviando…</>
                    ) : (
                      <>
                        <i className="pi pi-upload" style={{ fontSize: "2rem", opacity: 0.4 }} />
                        <span>Clique ou arraste a imagem</span>
                        <span className="crm-hint">PNG, JPG, SVG — recomendado 1080x1080px</span>
                      </>
                    )}
                    <input
                      ref={themeFileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadThemeArt(file);
                      }}
                    />
                  </div>
                  {themeForm.asset_url && !uploadingThemeArt && (
                    <button type="button" className="crm-link-btn" onClick={() => themeFileInputRef.current?.click()}>
                      <i className="pi pi-refresh" /> Trocar arte
                    </button>
                  )}
                  <details style={{ marginTop: 8 }}>
                    <summary className="crm-hint" style={{ cursor: "pointer" }}>Ou cole uma URL de imagem</summary>
                    <input
                      type="url"
                      className="form-input"
                      style={{ marginTop: 6 }}
                      value={themeForm.asset_url}
                      onChange={(event) => setThemeForm((prev) => ({ ...prev, asset_url: event.target.value }))}
                      placeholder="https://..."
                    />
                  </details>
                </div>

                <div className="crm-field">
                  <label className="crm-label">
                    Logo personalizado do template
                    <span className="crm-hint-inline">opcional</span>
                  </label>
                  <div
                    className="crm-art-drop crm-art-drop--logo"
                    onClick={() => themeLogoInputRef.current?.click()}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const file = event.dataTransfer.files?.[0];
                      if (file) void uploadThemeLogo(file);
                    }}
                  >
                    {themeForm.logo_url ? (
                      <img src={themeForm.logo_url} alt="Logo personalizado do template" className="crm-art-preview" />
                    ) : uploadingThemeLogo ? (
                      <><span className="crm-spinner" /> Enviando logo…</>
                    ) : (
                      <>
                        <i className="pi pi-image" style={{ fontSize: "1.5rem", opacity: 0.4 }} />
                        <span>Clique ou arraste o logo</span>
                        <span className="crm-hint">PNG/SVG com fundo transparente</span>
                      </>
                    )}
                    <input
                      ref={themeLogoInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void uploadThemeLogo(file);
                      }}
                    />
                  </div>
                  {themeForm.logo_url && !uploadingThemeLogo && (
                    <button type="button" className="crm-link-btn" onClick={() => themeLogoInputRef.current?.click()}>
                      <i className="pi pi-refresh" /> Trocar logo
                    </button>
                  )}
                  <details style={{ marginTop: 8 }}>
                    <summary className="crm-hint" style={{ cursor: "pointer" }}>Ou cole uma URL do logo</summary>
                    <input
                      type="url"
                      className="form-input"
                      style={{ marginTop: 6 }}
                      value={themeForm.logo_url}
                      onChange={(event) => setThemeForm((prev) => ({ ...prev, logo_url: event.target.value }))}
                      placeholder="https://..."
                    />
                  </details>
                </div>
              </div>
            </div>
            <div className="crm-admin-modal__footer">
              <AppButton type="button" variant="secondary" onClick={() => setShowCreateThemeModal(false)}>
                Cancelar
              </AppButton>
              <AppButton type="button" variant="primary" onClick={saveTheme} disabled={savingTheme || uploadingThemeArt || uploadingThemeLogo}>
                {savingTheme ? "Salvando..." : "Salvar"}
              </AppButton>
            </div>
          </div>
        </div>
      )}

      {showCreateMessageModal && (
        <div className="crm-admin-modal-overlay" onClick={() => setShowCreateMessageModal(false)}>
          <div className="crm-admin-modal crm-admin-modal--wide" onClick={(event) => event.stopPropagation()}>
            <div className="crm-admin-modal__header">
              <h3>Nova mensagem</h3>
              <button type="button" className="crm-link-btn" onClick={() => setShowCreateMessageModal(false)}>
                <i className="pi pi-times" />
              </button>
            </div>
            <div className="crm-admin-modal__body">
              <div className="crm-field">
                <label className="crm-label">Nome *</label>
                <input
                  type="text"
                  className="form-input"
                  value={messageForm.nome}
                  onChange={(event) => setMessageForm((prev) => ({ ...prev, nome: event.target.value }))}
                  placeholder="Ex.: Aniversário padrão"
                  autoFocus
                />
              </div>
              <div className="crm-field">
                <label className="crm-label">Ocasião</label>
                <input
                  type="text"
                  className="form-input"
                  value={messageForm.categoria}
                  onChange={(event) => setMessageForm((prev) => ({ ...prev, categoria: event.target.value }))}
                  placeholder="Ex.: Aniversário"
                />
              </div>
              <div className="crm-field">
                <label className="crm-label">Escopo</label>
                <select
                  className="form-select"
                  value={messageForm.scope}
                  onChange={(event) => setMessageForm((prev) => ({ ...prev, scope: event.target.value as ScopeValue }))}
                >
                  {availableScopeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="crm-field">
                <label className="crm-label">Greeting / título *</label>
                <input
                  type="text"
                  className="form-input"
                  value={messageForm.titulo}
                  onChange={(event) => setMessageForm((prev) => ({ ...prev, titulo: event.target.value }))}
                  placeholder="Ex.: Feliz Aniversário!"
                />
              </div>
              <div className="crm-field">
                <label className="crm-label">Mensagem principal *</label>
                <textarea
                  className="form-textarea"
                  rows={8}
                  value={messageForm.corpo}
                  onChange={(event) => setMessageForm((prev) => ({ ...prev, corpo: event.target.value }))}
                  placeholder="Texto padrão que será reaproveitado no cartão."
                />
              </div>
            </div>
            <div className="crm-admin-modal__footer">
              <AppButton type="button" variant="secondary" onClick={() => setShowCreateMessageModal(false)}>
                Cancelar
              </AppButton>
              <AppButton type="button" variant="primary" onClick={saveMessageTemplate} disabled={savingMessage}>
                {savingMessage ? "Salvando..." : "Salvar"}
              </AppButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
