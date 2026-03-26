import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppButton from "../ui/primer/AppButton";

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

// ── Helpers ──────────────────────────────────────────────────────────────────

function getPrimeiroNome(nome: string) {
  return (nome || "").trim().split(/\s+/)[0] || "";
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
            {[28, 32, 36, 40, 44, 48, 52, 56, 60, 64].map((s) => (
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [messageLibrary, setMessageLibrary] = useState<MessageTemplate[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoMissing, setLogoMissing] = useState(false);
  const [savedSigId, setSavedSigId] = useState<string | null>(null);

  // ── Selection / navigation ───────────────────────────────────────
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);

  // ── Form fields ──────────────────────────────────────────────────
  const [greeting, setGreeting] = useState("");
  const [clienteNome, setClienteNome] = useState(""); // full name selected from client list
  const [clienteNomeCustom, setClienteNomeCustom] = useState(""); // override first name
  const [useCustomNome, setUseCustomNome] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [assinatura, setAssinatura] = useState<AssinaturaForm>({ ...DEFAULT_ASSINATURA });
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

  // ── Preview ──────────────────────────────────────────────────────
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived ──────────────────────────────────────────────────────
  const primeiroNome = useCustomNome ? clienteNomeCustom.trim() : clienteNome.trim();
  const palavras = countWords(mensagem);
  const maxPalavras = selectedTheme?.mensagem_max_palavras ?? 50;
  const maxLinhas = selectedTheme?.mensagem_max_linhas ?? 6;
  const palavrasExcedido = palavras > maxPalavras;
  const linhasExcedido = mensagem.split("\n").length > maxLinhas;

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

  useEffect(() => {
    if (!temaFilter.startsWith("cat:")) return;
    const exists = categories.some((cat) => `cat:${String(cat.id || "").trim()}` === temaFilter);
    if (!exists) setTemaFilter("all");
  }, [temaFilter, categories]);

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
        setLogoUrl(resolvedLogo);
        setLogoMissing(!resolvedLogo);

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
          const [catResp, themeResp, msgResp, sigResp, settingsResp] = await Promise.all([
            supabaseBrowser
              .from("crm_template_categories")
              .select("id, nome, icone, sort_order")
              .eq("ativo", true)
              .order("sort_order"),
            supabaseBrowser
              .from("user_message_template_themes")
              .select(
                "id, user_id, nome, categoria, categoria_id, asset_url, greeting_text, mensagem_max_linhas, mensagem_max_palavras, assinatura_max_linhas, assinatura_max_palavras, scope, ativo"
              )
              .order("nome"),
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
          ]);

          setCurrentUserId(fallbackUserId);
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
          setLogoUrl(resolvedLogo);
          setLogoMissing(!resolvedLogo);

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

  function selectTheme(theme: Theme) {
    setSelectedTheme(theme);
    setSelectedMessageTemplateId("");
    setGreeting(resolveGreetingByTheme(theme));
    setMensagem("");
    setPreviewUrl(null);
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
        logoUrl,
      });
      setPreviewUrl(url);
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [selectedTheme, greeting, primeiroNome, clienteNome, mensagem, assinatura, logoUrl]);

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
      <AppCard
        tone="info"
        title="CRM — Relacionamento com Cliente"
        subtitle="Escolha o modelo, personalize a mensagem e gere o cartão com preenchimento automático nos espaços técnicos."
      />

      {/* ── Logo missing alert ── */}
      {logoMissing && (
        <div className="crm-alert crm-alert--warning">
          <i className="pi pi-image" />
          <span>
            O logo da sua empresa ainda não está configurado.{" "}
            <a href="/parametros/orcamentos">Clique aqui para configurar</a>{" "}
            (ele aparecerá automaticamente no cartão, no canto inferior direito).
          </span>
        </div>
      )}

      <div className={`crm-layout${showComposer ? " crm-layout--split" : ""}`}>
        {/* ════════════════ LEFT: Gallery ════════════════ */}
        <aside className="crm-gallery">
          <AppCard
            tone="info"
            className="crm-panel-card"
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
              <div className="crm-theme-grid">
                {filteredThemes.map((t) => (
                  <ThumbCard
                    key={t.id}
                    theme={t}
                    selected={selectedTheme?.id === t.id}
                    onSelect={selectTheme}
                  />
                ))}
              </div>
            )}
          </AppCard>
        </aside>

        {/* ════════════════ RIGHT: Composer + Preview ════════════════ */}
        {showComposer && selectedTheme && (
          <div className="crm-composer-wrap">
            {/* Back */}
            <button
              type="button"
              className="crm-back-btn"
              onClick={() => { setSelectedTheme(null); setPreviewUrl(null); }}
            >
              <i className="pi pi-arrow-left" /> Escolher outro template
            </button>

            <div className="crm-composer-split">
              {/* ── Form ── */}
              <AppCard
                tone="default"
                className="crm-form crm-panel-card"
                title="Personalizar cartão"
                subtitle="Título, nome do cliente, mensagem e assinatura padronizados pelo mapa técnico."
              >
                <div className="crm-template-meta">
                  <span className={getScopeTone(selectedTheme.scope)}>{getScopeLabel(selectedTheme.scope)}</span>
                  <span className="crm-template-meta__name">{selectedTheme.nome}</span>
                </div>

                {/* Greeting */}
                <div className="crm-field">
                  <label className="crm-label">
                    Título / saudação
                    <span className="crm-hint-inline">escolha um título da biblioteca</span>
                  </label>
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
                  <label className="crm-label">Nome do cliente</label>
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
                  <label className="crm-label">
                    Mensagem principal
                    <span className="crm-hint-inline">
                      máx. {maxLinhas} linhas · {maxPalavras} palavras
                    </span>
                  </label>

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
                  </div>
                  <AssinaturaEditor value={assinatura} onChange={setAssinatura} />
                  <div className="crm-sig-actions">
                    <AppButton
                      type="button"
                      variant={sigSaved ? "primary" : "secondary"}
                      size="small"
                      className={sigSaved ? "btn--success" : ""}
                      onClick={salvarAssinatura}
                      disabled={savingSig || !assinatura.linha2.trim()}
                      title={!assinatura.linha2.trim() ? "Informe o nome do consultor na linha 2." : ""}
                    >
                      {savingSig ? (
                        <><span className="crm-spinner crm-spinner--sm" /> Salvando…</>
                      ) : sigSaved ? (
                        <><i className="pi pi-check" /> Assinatura salva!</>
                      ) : (
                        <><i className="pi pi-save" /> Salvar como padrão</>
                      )}
                    </AppButton>
                  </div>
                </div>
              </AppCard>

              {/* ── Preview panel ── */}
              <AppCard
                tone="default"
                className="crm-preview-panel crm-panel-card"
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
                  {logoMissing ? (
                    <span>
                      Sem logo configurado.{" "}
                      <a href="/parametros/orcamentos">Configurar logo</a>
                    </span>
                  ) : (
                    <span>
                      Logo da empresa no canto inferior direito.{" "}
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
    </div>
  );
}
