import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabaseBrowser } from "../../lib/supabase-browser";

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

function getScopeLabel(scope?: string | null) {
  const normalized = String(scope || "").trim().toLowerCase();
  if (normalized === "system") return "Sistema";
  if (normalized === "master") return "Master";
  if (normalized === "gestor") return "Gestor";
  return "Usuário";
}

function getScopeTone(scope?: string | null) {
  const normalized = String(scope || "").trim().toLowerCase();
  if (normalized === "system") return "crm-badge crm-badge--system";
  if (normalized === "master") return "crm-badge crm-badge--master";
  if (normalized === "gestor") return "crm-badge crm-badge--gestor";
  return "crm-badge crm-badge--user";
}

function buildPreviewParams(params: {
  themeId: string;
  greeting: string;
  saudacao: string;
  primeiroNome: string;
  mensagem: string;
  assinatura: AssinaturaForm;
  logoUrl: string | null;
}) {
  const { themeId, greeting, saudacao, primeiroNome, mensagem, assinatura, logoUrl } = params;
  const q = new URLSearchParams();
  q.set("theme_id", themeId);
  if (greeting) q.set("titulo", greeting);
  // clientName section: "Prezado(a) Marcos,"
  const clientName = [saudacao.trim(), primeiroNome.trim()].filter(Boolean).join(" ");
  if (clientName) q.set("nome", clientName + (clientName.endsWith(",") ? "" : ","));
  if (mensagem) q.set("corpo", mensagem);
  if (assinatura.linha1) {
    q.set("footer_lead", assinatura.linha1);
  }
  if (assinatura.linha2) q.set("assinatura", assinatura.linha2);
  if (assinatura.linha3) q.set("cargo_consultor", assinatura.linha3);
  if (assinatura.linha2_font_size) q.set("signature_font_size", String(assinatura.linha2_font_size));
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
    { key: "linha1", sizeKey: "linha1_font_size", italicKey: "linha1_italic", placeholder: "Ex.: Com carinho," },
    { key: "linha2", sizeKey: "linha2_font_size", italicKey: "linha2_italic", placeholder: "Seu nome" },
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
  linha1: "Com carinho,",
  linha1_font_size: 40,
  linha1_italic: true,
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
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<Theme | null>(null);

  // ── Form fields ──────────────────────────────────────────────────
  const [greeting, setGreeting] = useState("");
  const [saudacao, setSaudacao] = useState("Prezado(a)");
  const [clienteNome, setClienteNome] = useState(""); // full name selected from client list
  const [clienteNomeCustom, setClienteNomeCustom] = useState(""); // override first name
  const [useCustomNome, setUseCustomNome] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [assinatura, setAssinatura] = useState<AssinaturaForm>({ ...DEFAULT_ASSINATURA });
  const [savingSig, setSavingSig] = useState(false);
  const [sigSaved, setSigSaved] = useState(false);

  // ── Client search ────────────────────────────────────────────────
  const [clienteBusca, setClienteBusca] = useState("");
  const [clienteResults, setClienteResults] = useState<Cliente[]>([]);
  const [searchingClientes, setSearchingClientes] = useState(false);
  const clienteRef = useRef<HTMLDivElement>(null);

  // ── Message library picker ───────────────────────────────────────
  const [showMsgPicker, setShowMsgPicker] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<"all" | "system" | "master" | "gestor" | "user">("all");

  // ── Preview ──────────────────────────────────────────────────────
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived ──────────────────────────────────────────────────────
  const primeiroNome = useCustomNome ? clienteNomeCustom.trim() : getPrimeiroNome(clienteNome);
  const palavras = countWords(mensagem);
  const maxPalavras = selectedTheme?.mensagem_max_palavras ?? 50;
  const maxLinhas = selectedTheme?.mensagem_max_linhas ?? 6;
  const palavrasExcedido = palavras > maxPalavras;
  const linhasExcedido = mensagem.split("\n").length > maxLinhas;

  const filteredThemes = useMemo(
    () =>
      themes.filter((t) => {
        const matchCategory = selectedCategoryId ? t.categoria_id === selectedCategoryId : true;
        const matchScope = scopeFilter === "all" ? true : t.scope === scopeFilter;
        return matchCategory && matchScope;
      }),
    [themes, selectedCategoryId, scopeFilter]
  );

  const filteredMessages = useMemo(() => {
    if (!selectedTheme) return messageLibrary;
    const catId = selectedTheme.categoria_id;
    const catNome = (selectedTheme.categoria || "").toLowerCase();
    return messageLibrary.filter((m) => {
      if (catId && m.categoria) return true; // show all if same category
      const mCat = (m.categoria || "").toLowerCase();
      return !mCat || mCat === catNome || mCat === "geral";
    }).sort((a, b) => {
      const ownA = a.user_id === currentUserId ? 1 : 0;
      const ownB = b.user_id === currentUserId ? 1 : 0;
      if (ownA !== ownB) return ownB - ownA;
      return a.nome.localeCompare(b.nome);
    });
  }, [messageLibrary, selectedTheme, currentUserId]);

  const templatesByScope = useMemo(() => {
    return {
      system: themes.filter((theme) => theme.scope === "system").length,
      master: themes.filter((theme) => theme.scope === "master").length,
      gestor: themes.filter((theme) => theme.scope === "gestor").length,
      user: themes.filter((theme) => theme.scope === "user").length,
    };
  }, [themes]);

  // ── Load data ────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [authResp, catResp, themeResp, msgResp, sigResp, settingsResp] = await Promise.all([
          supabaseBrowser.auth.getUser(),
          supabaseBrowser
            .from("crm_template_categories")
            .select("id, nome, icone, sort_order")
            .eq("ativo", true)
            .order("sort_order"),
          supabaseBrowser
            .from("user_message_template_themes")
            .select(
              "id, user_id, nome, categoria, categoria_id, asset_url, greeting_text, mensagem_max_linhas, mensagem_max_palavras, assinatura_max_linhas, assinatura_max_palavras, scope"
            )
            .eq("ativo", true)
            .order("nome"),
          supabaseBrowser
            .from("user_message_templates")
            .select("id, user_id, nome, titulo, corpo, categoria, scope")
            .eq("ativo", true)
            .order("nome"),
          supabaseBrowser
            .from("user_crm_assinaturas")
            .select("*")
            .eq("is_default", true)
            .maybeSingle(),
          supabaseBrowser
            .from("quote_print_settings")
            .select("logo_url, consultor_nome")
            .maybeSingle(),
        ]);

        setCurrentUserId(authResp.data?.user?.id || "");
        setCategories((catResp.data || []) as Category[]);
        setThemes((themeResp.data || []) as Theme[]);
        setMessageLibrary((msgResp.data || []) as MessageTemplate[]);

        const settings = settingsResp.data as any;
        const resolvedLogo = settings?.logo_url || null;
        setLogoUrl(resolvedLogo);
        setLogoMissing(!resolvedLogo);

        const sig = sigResp.data as any;
        if (sig) {
          setSavedSigId(sig.id);
          setAssinatura({
            linha1: sig.linha1 || "Com carinho,",
            linha1_font_size: sig.linha1_font_size ?? 40,
            linha1_italic: sig.linha1_italic ?? true,
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
      } catch (err) {
        console.error("[CRM] Erro ao carregar dados:", err);
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
  function selectTheme(theme: Theme) {
    setSelectedTheme(theme);
    setGreeting(theme.greeting_text || "");
    setMensagem("");
    setPreviewUrl(null);
  }

  // ── Build preview (debounced) ────────────────────────────────────
  useEffect(() => {
    if (!selectedTheme) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const url = buildPreviewParams({
        themeId: selectedTheme.id,
        greeting,
        saudacao,
        primeiroNome,
        mensagem,
        assinatura,
        logoUrl,
      });
      setPreviewUrl(url);
    }, 700);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [selectedTheme, greeting, saudacao, primeiroNome, mensagem, assinatura, logoUrl]);

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
          <div className="crm-gallery__header">
            <h2 className="crm-gallery__title">
              <i className="pi pi-images" /> Templates
            </h2>
          </div>

          <div className="crm-scope-overview">
            <button type="button" className={`crm-scope-chip${scopeFilter === "all" ? " active" : ""}`} onClick={() => setScopeFilter("all")}>
              Todos
            </button>
            <button type="button" className={`crm-scope-chip${scopeFilter === "system" ? " active" : ""}`} onClick={() => setScopeFilter("system")}>
              Sistema {templatesByScope.system > 0 ? `(${templatesByScope.system})` : ""}
            </button>
            <button type="button" className={`crm-scope-chip${scopeFilter === "master" ? " active" : ""}`} onClick={() => setScopeFilter("master")}>
              Master {templatesByScope.master > 0 ? `(${templatesByScope.master})` : ""}
            </button>
            <button type="button" className={`crm-scope-chip${scopeFilter === "gestor" ? " active" : ""}`} onClick={() => setScopeFilter("gestor")}>
              Gestor {templatesByScope.gestor > 0 ? `(${templatesByScope.gestor})` : ""}
            </button>
            <button type="button" className={`crm-scope-chip${scopeFilter === "user" ? " active" : ""}`} onClick={() => setScopeFilter("user")}>
              Meus {templatesByScope.user > 0 ? `(${templatesByScope.user})` : ""}
            </button>
          </div>

          {/* Category tabs */}
          <div className="crm-category-tabs">
            <button
              type="button"
              className={`crm-category-tab${!selectedCategoryId ? " active" : ""}`}
              onClick={() => setSelectedCategoryId(null)}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`crm-category-tab${selectedCategoryId === cat.id ? " active" : ""}`}
                onClick={() => setSelectedCategoryId(cat.id)}
              >
                <i className={cat.icone} /> {cat.nome}
              </button>
            ))}
          </div>

          {/* Theme grid */}
          {filteredThemes.length === 0 ? (
            <p className="crm-empty">Nenhum template disponível nesta categoria.</p>
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
              <div className="crm-form">
                <h3 className="crm-section-title">
                  <i className="pi pi-pencil" /> Personalizar cartão
                </h3>
                <div className="crm-template-meta">
                  <span className={getScopeTone(selectedTheme.scope)}>{getScopeLabel(selectedTheme.scope)}</span>
                  <span className="crm-template-meta__name">{selectedTheme.nome}</span>
                </div>

                {/* Greeting */}
                <div className="crm-field">
                  <label className="crm-label">
                    Título / saudação
                    <span className="crm-hint-inline">ex.: Feliz Aniversário!</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={greeting}
                    onChange={(e) => setGreeting(e.target.value)}
                    placeholder="Feliz Aniversário!"
                    maxLength={80}
                  />
                </div>

                {/* Client name */}
                <div className="crm-field">
                  <label className="crm-label">Nome do cliente</label>
                  <div className="crm-client-row">
                    <input
                      type="text"
                      className="form-input crm-saudacao-input"
                      value={saudacao}
                      onChange={(e) => setSaudacao(e.target.value)}
                      placeholder="Prezado(a)"
                      title="Saudação"
                    />
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

                  {/* First name preview + override */}
                  {(clienteNome || useCustomNome) && (
                    <div className="crm-nome-preview">
                      <span className="crm-nome-preview__text">
                        {saudacao} <strong>{primeiroNome || "—"}</strong>,
                      </span>
                      {!useCustomNome ? (
                        <button
                          type="button"
                          className="crm-link-btn"
                          onClick={() => { setUseCustomNome(true); setClienteNomeCustom(primeiroNome); }}
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
                    {filteredMessages.length > 0 && (
                      <button
                        type="button"
                        className="crm-link-btn"
                        onClick={() => setShowMsgPicker((v) => !v)}
                      >
                        <i className="pi pi-book" /> Biblioteca
                      </button>
                    )}
                  </div>

                  {/* Message library picker */}
                  {showMsgPicker && (
                    <div className="crm-msg-picker">
                      <div className="crm-msg-picker__header">
                        <span>Selecione uma mensagem</span>
                        <button type="button" className="crm-link-btn" onClick={() => setShowMsgPicker(false)}>
                          <i className="pi pi-times" />
                        </button>
                      </div>
                      <div className="crm-msg-picker__list">
                        {filteredMessages.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className="crm-msg-item"
                            onClick={() => {
                              setMensagem(m.corpo);
                              setShowMsgPicker(false);
                            }}
                          >
                            <strong>{m.nome}</strong>
                            <small className={getScopeTone(m.scope)}>{getScopeLabel(m.scope)}</small>
                            <span>{m.corpo.slice(0, 100)}…</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <textarea
                    className={`form-textarea crm-mensagem${palavrasExcedido || linhasExcedido ? " crm-mensagem--over" : ""}`}
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    placeholder="Digite a mensagem ou selecione uma da biblioteca…"
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
                      <span className="crm-hint-inline">máx. 3 linhas</span>
                    </label>
                  </div>
                  <AssinaturaEditor value={assinatura} onChange={setAssinatura} />
                  <div className="crm-sig-actions">
                    <button
                      type="button"
                      className={`btn btn-secondary btn-sm${sigSaved ? " btn--success" : ""}`}
                      onClick={salvarAssinatura}
                      disabled={savingSig}
                    >
                      {savingSig ? (
                        <><span className="crm-spinner crm-spinner--sm" /> Salvando…</>
                      ) : sigSaved ? (
                        <><i className="pi pi-check" /> Assinatura salva!</>
                      ) : (
                        <><i className="pi pi-save" /> Salvar como padrão</>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Preview panel ── */}
              <div className="crm-preview-panel">
                <h3 className="crm-section-title">
                  <i className="pi pi-eye" /> Pré-visualização
                </h3>

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
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={compartilharWhatsApp}
                      disabled={!primeiroNome}
                      title={!primeiroNome ? "Informe o nome do cliente" : ""}
                    >
                      <i className="pi pi-whatsapp" /> Compartilhar no WhatsApp
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => window.open(previewUrl, "_blank")}
                    >
                      <i className="pi pi-external-link" /> Ver em tela cheia
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={copiarLinkPreview}
                    >
                      <i className="pi pi-link" /> Copiar link
                    </button>
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
              </div>
            </div>
          </div>
        )}

        {/* ── No theme selected: hint ── */}
        {!showComposer && (
          <div className="crm-select-hint">
            <i className="pi pi-hand-pointer" />
            <p>Selecione um template à esquerda para personalizar e enviar o cartão.</p>
          </div>
        )}
      </div>
    </div>
  );
}
