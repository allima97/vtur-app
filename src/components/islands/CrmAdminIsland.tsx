import React, { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { ToastStack, useToastQueue } from "../ui/Toast";
import ConfirmDialog from "../ui/ConfirmDialog";
import TableActions from "../ui/TableActions";
import AppCard from "../ui/primer/AppCard";
import AppButton from "../ui/primer/AppButton";

// ── Types ──────────────────────────────────────────────────────────────────

type Category = {
  id: string;
  nome: string;
  icone: string;
  sort_order: number;
  ativo: boolean;
};

type Theme = {
  id: string;
  nome: string;
  categoria_id: string | null;
  asset_url: string;
  scope: string;
  greeting_text: string | null;
  mensagem_max_linhas: number;
  mensagem_max_palavras: number;
  assinatura_max_linhas: number;
  assinatura_max_palavras: number;
  ativo: boolean;
};

type MessageTemplate = {
  id: string;
  nome: string;
  categoria: string | null;
  titulo: string;
  corpo: string;
  scope: string;
  ativo: boolean;
};

const STORAGE_BUCKET = "message-template-themes";

const SCOPE_OPTIONS = [
  { value: "system", label: "Sistema (todos os usuários)" },
  { value: "master", label: "Master (empresas)" },
  { value: "gestor", label: "Gestor (agência)" },
  { value: "user", label: "Usuário (pessoal)" },
];

const SCOPE_LABELS: Record<string, string> = {
  system: "Sistema",
  master: "Master",
  gestor: "Gestor",
  user: "Usuário",
};

const ICON_SUGGESTIONS = [
  "pi pi-gift", "pi pi-star", "pi pi-sun", "pi pi-sparkles",
  "pi pi-heart", "pi pi-map", "pi pi-tag", "pi pi-image",
  "pi pi-calendar", "pi pi-globe", "pi pi-flag",
];

const CRM_TAB_SECTIONS = [
  {
    id: "modelos",
    icon: "pi pi-images",
    label: "Modelos",
    subtitle: "Artes e configurações visuais.",
  },
  {
    id: "textos",
    icon: "pi pi-file-edit",
    label: "Textos padrão por ocasião",
    subtitle: "Mensagens reutilizáveis por tema.",
  },
  {
    id: "categorias",
    icon: "pi pi-tags",
    label: "Categorias",
    subtitle: "Organização e ordenação dos grupos.",
  },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────

function emptyCategory(): Omit<Category, "id"> {
  return { nome: "", icone: "pi pi-tag", sort_order: 0, ativo: true };
}

function emptyTheme(): Omit<Theme, "id"> {
  return {
    nome: "",
    categoria_id: null,
    asset_url: "",
    scope: "system",
    greeting_text: "",
    mensagem_max_linhas: 6,
    mensagem_max_palavras: 50,
    assinatura_max_linhas: 3,
    assinatura_max_palavras: 20,
    ativo: true,
  };
}

function emptyMessageTemplate(): Omit<MessageTemplate, "id"> {
  return {
    nome: "",
    categoria: "",
    titulo: "",
    corpo: "",
    scope: "system",
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

// ── Main component ─────────────────────────────────────────────────────────

export default function CrmAdminIsland() {
  const [tab, setTab] = useState<"categorias" | "modelos" | "textos">("modelos");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);

  // ── Categories ──
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [catForm, setCatForm] = useState<Partial<Category> & Omit<Category, "id">>(emptyCategory());
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [showCatModal, setShowCatModal] = useState(false);
  const [savingCat, setSavingCat] = useState(false);

  // ── Themes ──
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loadingThemes, setLoadingThemes] = useState(true);
  const [themeForm, setThemeForm] = useState<Partial<Theme> & Omit<Theme, "id">>(emptyTheme());
  const [editingThemeId, setEditingThemeId] = useState<string | null>(null);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [savingTheme, setSavingTheme] = useState(false);
  const [uploadingArt, setUploadingArt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Message templates ──
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [messageForm, setMessageForm] = useState<Partial<MessageTemplate> & Omit<MessageTemplate, "id">>(emptyMessageTemplate());
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [savingMessage, setSavingMessage] = useState(false);
  const [themeToDelete, setThemeToDelete] = useState<Theme | null>(null);
  const [deletingThemeId, setDeletingThemeId] = useState<string | null>(null);
  const [messageToDelete, setMessageToDelete] = useState<MessageTemplate | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [themeToPreview, setThemeToPreview] = useState<Theme | null>(null);
  const [messageToPreview, setMessageToPreview] = useState<MessageTemplate | null>(null);

  // ── Filter ──
  const [filterCatId, setFilterCatId] = useState<string>("");

  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    void (async () => {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || "";
      setCurrentUserId(userId);
      if (userId) {
        const { data: userData } = await supabase
          .from("users")
          .select("company_id")
          .eq("id", userId)
          .maybeSingle();
        setCurrentCompanyId((userData as any)?.company_id || null);
      }
      loadCategories();
      loadThemes();
      loadMessages();
    })();
  }, []);

  async function loadCategories() {
    setLoadingCats(true);
    const { data, error } = await supabase
      .from("crm_template_categories")
      .select("id, nome, icone, sort_order, ativo")
      .order("sort_order");
    if (error) showToast("Erro ao carregar categorias.", "error");
    else setCategories(data || []);
    setLoadingCats(false);
  }

  async function loadThemes() {
    setLoadingThemes(true);
    const { data, error } = await supabase
      .from("user_message_template_themes")
      .select("id, nome, categoria_id, asset_url, scope, greeting_text, mensagem_max_linhas, mensagem_max_palavras, assinatura_max_linhas, assinatura_max_palavras, ativo")
      .order("nome");
    if (error) showToast("Erro ao carregar templates.", "error");
    else setThemes(data || []);
    setLoadingThemes(false);
  }

  async function loadMessages() {
    setLoadingMessages(true);
    const { data, error } = await supabase
      .from("user_message_templates")
      .select("id, nome, categoria, titulo, corpo, scope, ativo")
      .order("categoria")
      .order("nome");
    if (error) showToast("Erro ao carregar textos padrão.", "error");
    else setMessageTemplates((data || []) as MessageTemplate[]);
    setLoadingMessages(false);
  }

  // ── Category CRUD ─────────────────────────────────────────────────────────
  function openNewCategory() {
    setEditingCatId(null);
    setCatForm(emptyCategory());
    setShowCatModal(true);
  }

  function openEditCategory(cat: Category) {
    setEditingCatId(cat.id);
    setCatForm({ nome: cat.nome, icone: cat.icone, sort_order: cat.sort_order, ativo: cat.ativo });
    setShowCatModal(true);
  }

  async function saveCategory() {
    if (!catForm.nome.trim()) { showToast("Informe o nome da categoria.", "error"); return; }
    setSavingCat(true);
    try {
      const payload = {
        nome: catForm.nome.trim(),
        icone: catForm.icone || "pi pi-tag",
        sort_order: Number(catForm.sort_order) || 0,
        ativo: catForm.ativo !== false,
        updated_at: new Date().toISOString(),
      };
      if (editingCatId) {
        const { error } = await supabase.from("crm_template_categories").update(payload).eq("id", editingCatId);
        if (error) throw error;
        showToast("Categoria atualizada.", "success");
      } else {
        const { error } = await supabase.from("crm_template_categories").insert(payload);
        if (error) throw error;
        showToast("Categoria criada.", "success");
      }
      setShowCatModal(false);
      loadCategories();
    } catch (err: any) {
      showToast(err?.message || "Erro ao salvar categoria.", "error");
    } finally {
      setSavingCat(false);
    }
  }

  async function toggleCategoryAtivo(cat: Category) {
    await supabase.from("crm_template_categories").update({ ativo: !cat.ativo }).eq("id", cat.id);
    loadCategories();
  }

  // ── Theme CRUD ────────────────────────────────────────────────────────────
  function openNewTheme() {
    setEditingThemeId(null);
    setThemeForm(emptyTheme());
    setShowThemeModal(true);
  }

  function openEditTheme(theme: Theme) {
    setEditingThemeId(theme.id);
    setThemeForm({
      nome: theme.nome,
      categoria_id: theme.categoria_id,
      asset_url: theme.asset_url,
      scope: theme.scope,
      greeting_text: theme.greeting_text || "",
      mensagem_max_linhas: theme.mensagem_max_linhas,
      mensagem_max_palavras: theme.mensagem_max_palavras,
      assinatura_max_linhas: theme.assinatura_max_linhas,
      assinatura_max_palavras: theme.assinatura_max_palavras,
      ativo: theme.ativo,
    });
    setShowThemeModal(true);
  }

  async function uploadArt(file: File) {
    setUploadingArt(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `admin/${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, "_")}`;
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      const publicUrl = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl;
      if (!publicUrl) throw new Error("Falha ao gerar URL pública.");
      setThemeForm((prev) => ({ ...prev, asset_url: publicUrl }));
      showToast("Arte carregada com sucesso.", "success");
    } catch (err: any) {
      showToast(err?.message || "Erro ao fazer upload.", "error");
    } finally {
      setUploadingArt(false);
    }
  }

  async function saveTheme() {
    if (!themeForm.nome.trim()) { showToast("Informe o nome do template.", "error"); return; }
    if (!themeForm.asset_url.trim()) { showToast("Adicione a arte do template.", "error"); return; }
    setSavingTheme(true);
    try {
      const payload = {
        user_id: currentUserId,
        company_id: (themeForm.scope || "system") === "system" ? null : currentCompanyId,
        nome: themeForm.nome.trim(),
        categoria_id: themeForm.categoria_id || null,
        asset_url: themeForm.asset_url.trim(),
        scope: themeForm.scope || "system",
        greeting_text: themeForm.greeting_text?.trim() || null,
        mensagem_max_linhas: Number(themeForm.mensagem_max_linhas) || 6,
        mensagem_max_palavras: Number(themeForm.mensagem_max_palavras) || 50,
        assinatura_max_linhas: Number(themeForm.assinatura_max_linhas) || 3,
        assinatura_max_palavras: Number(themeForm.assinatura_max_palavras) || 20,
        ativo: themeForm.ativo !== false,
        updated_at: new Date().toISOString(),
      };
      if (editingThemeId) {
        const { error } = await supabase.from("user_message_template_themes").update(payload).eq("id", editingThemeId);
        if (error) throw error;
        showToast("Template atualizado.", "success");
      } else {
        const { error } = await supabase.from("user_message_template_themes").insert(payload);
        if (error) throw error;
        showToast("Template criado.", "success");
      }
      setShowThemeModal(false);
      loadThemes();
    } catch (err: any) {
      showToast(err?.message || "Erro ao salvar template.", "error");
    } finally {
      setSavingTheme(false);
    }
  }

  async function toggleThemeAtivo(theme: Theme) {
    await supabase.from("user_message_template_themes").update({ ativo: !theme.ativo }).eq("id", theme.id);
    loadThemes();
  }

  async function deleteTheme(theme: Theme) {
    setDeletingThemeId(theme.id);
    try {
      const { error } = await supabase
        .from("user_message_template_themes")
        .delete()
        .eq("id", theme.id);
      if (error) throw error;

      const storagePath = getStoragePathFromPublicUrl(theme.asset_url);
      if (storagePath) {
        const { count } = await supabase
          .from("user_message_template_themes")
          .select("id", { count: "exact", head: true })
          .eq("asset_url", theme.asset_url);
        if (!count || count <= 0) {
          const { error: removeError } = await supabase.storage
            .from(STORAGE_BUCKET)
            .remove([storagePath]);
          if (removeError) {
            console.warn("Falha ao remover arte do storage após excluir template:", removeError);
          }
        }
      }

      showToast("Template excluído.", "success");
      await loadThemes();
    } catch (err: any) {
      showToast(err?.message || "Erro ao excluir template.", "error");
    } finally {
      setDeletingThemeId(null);
      setThemeToDelete(null);
    }
  }

  // ── Message template CRUD ───────────────────────────────────────────────
  function openNewMessageTemplate() {
    setEditingMessageId(null);
    setMessageForm(emptyMessageTemplate());
    setShowMessageModal(true);
  }

  function openEditMessageTemplate(template: MessageTemplate) {
    setEditingMessageId(template.id);
    setMessageForm({
      nome: template.nome,
      categoria: template.categoria || "",
      titulo: template.titulo,
      corpo: template.corpo,
      scope: template.scope,
      ativo: template.ativo,
    });
    setShowMessageModal(true);
  }

  async function saveMessageTemplate() {
    if (!messageForm.nome?.trim()) { showToast("Informe o nome do texto padrão.", "error"); return; }
    if (!messageForm.titulo?.trim()) { showToast("Informe o greeting/título.", "error"); return; }
    if (!messageForm.corpo?.trim()) { showToast("Informe a mensagem principal.", "error"); return; }
    setSavingMessage(true);
    try {
      const payload = {
        user_id: currentUserId,
        company_id: (messageForm.scope || "system") === "system" ? null : currentCompanyId,
        nome: messageForm.nome.trim(),
        categoria: messageForm.categoria?.trim() || null,
        assunto: messageForm.titulo.trim(),
        titulo: messageForm.titulo.trim(),
        corpo: messageForm.corpo.trim(),
        scope: messageForm.scope || "system",
        ativo: messageForm.ativo !== false,
        updated_at: new Date().toISOString(),
      };
      if (editingMessageId) {
        const { error } = await supabase.from("user_message_templates").update(payload).eq("id", editingMessageId);
        if (error) throw error;
        showToast("Texto padrão atualizado.", "success");
      } else {
        const { error } = await supabase.from("user_message_templates").insert(payload);
        if (error) throw error;
        showToast("Texto padrão criado.", "success");
      }
      setShowMessageModal(false);
      loadMessages();
    } catch (err: any) {
      showToast(err?.message || "Erro ao salvar texto padrão.", "error");
    } finally {
      setSavingMessage(false);
    }
  }

  async function toggleMessageAtivo(template: MessageTemplate) {
    await supabase.from("user_message_templates").update({ ativo: !template.ativo }).eq("id", template.id);
    loadMessages();
  }

  async function deleteMessageTemplate(template: MessageTemplate) {
    setDeletingMessageId(template.id);
    try {
      const { error } = await supabase
        .from("user_message_templates")
        .delete()
        .eq("id", template.id);
      if (error) throw error;
      showToast("Texto padrão excluído.", "success");
      await loadMessages();
    } catch (err: any) {
      showToast(err?.message || "Erro ao excluir texto padrão.", "error");
    } finally {
      setDeletingMessageId(null);
      setMessageToDelete(null);
    }
  }

  // ── Filtered themes ──
  const filteredThemes = filterCatId
    ? themes.filter((t) => t.categoria_id === filterCatId)
    : themes;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="crm-admin-root">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      <AppCard
        tone="info"
        title="CRM — Gerenciar Templates"
        subtitle="Gerencie as artes e categorias disponíveis para envio de cartões de relacionamento."
      />

      {/* Tabs */}
      <AppCard tone="info" className="mb-3 list-toolbar-sticky vtur-conciliacao-tab-card crm-admin-tab-card">
        <div className="vtur-conciliacao-tab-nav">
          {CRM_TAB_SECTIONS.map((section) => (
            <button
              key={section.id}
              type="button"
              className={[
                "vtur-conciliacao-tab-btn",
                tab === section.id ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => setTab(section.id)}
            >
              <span className="vtur-conciliacao-tab-btn-label">
                <i className={section.icon} aria-hidden="true" /> {section.label}
              </span>
              <span className="vtur-conciliacao-tab-btn-sub">{section.subtitle}</span>
            </button>
          ))}
        </div>
      </AppCard>

      {/* ══════════ TAB: MODELOS ══════════ */}
      {tab === "modelos" && (
        <div className="crm-admin-section">
          <div className="crm-admin-toolbar">
            <select
              className="form-select crm-admin-filter"
              value={filterCatId}
              onChange={(e) => setFilterCatId(e.target.value)}
            >
              <option value="">Todas as categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </select>
            <AppButton type="button" variant="primary" icon="pi pi-plus" onClick={openNewTheme}>
              Novo modelo
            </AppButton>
          </div>

          {loadingThemes ? (
            <div className="crm-admin-loading"><span className="crm-spinner" /> Carregando…</div>
          ) : filteredThemes.length === 0 ? (
            <p className="crm-admin-empty">Nenhum modelo encontrado.</p>
          ) : (
            <div className="crm-admin-theme-grid">
              {filteredThemes.map((t) => {
                const catNome = categories.find((c) => c.id === t.categoria_id)?.nome || "—";
                const deletingTheme = deletingThemeId === t.id;
                return (
                  <div key={t.id} className={`crm-admin-card${t.ativo ? "" : " crm-admin-card--inactive"}`}>
                    <div className="crm-admin-card__thumb">
                      {t.asset_url ? (
                        <img src={t.asset_url} alt={t.nome} loading="lazy" />
                      ) : (
                        <i className="pi pi-image" />
                      )}
                    </div>
                    <div className="crm-admin-card__body">
                      <strong className="crm-admin-card__name">{t.nome}</strong>
                      <span className="crm-admin-card__meta">
                        <span className={`crm-scope-badge crm-scope-badge--${t.scope}`}>
                          {SCOPE_LABELS[t.scope] || t.scope}
                        </span>
                        <span>{catNome}</span>
                      </span>
                      {t.greeting_text && (
                        <span className="crm-admin-card__greeting">"{t.greeting_text}"</span>
                      )}
                    </div>
                    <div className="crm-admin-card__actions">
                      <TableActions
                        className="crm-admin-card-actions"
                        actions={[
                          {
                            key: "view",
                            label: "Visualizar",
                            icon: "pi pi-eye",
                            onClick: () => setThemeToPreview(t),
                            disabled: deletingTheme,
                          },
                          {
                            key: "edit",
                            label: "Editar",
                            icon: "pi pi-pencil",
                            onClick: () => openEditTheme(t),
                            disabled: deletingTheme,
                          },
                          {
                            key: "toggle",
                            label: t.ativo ? "Desativar" : "Ativar",
                            icon: t.ativo ? (
                              <i
                                className="pi pi-times-circle"
                                style={{ color: "var(--color-danger-fg, #cf222e)" }}
                                aria-hidden="true"
                              />
                            ) : (
                              <i
                                className="pi pi-check-circle"
                                style={{ color: "var(--color-success-fg, #1a7f37)" }}
                                aria-hidden="true"
                              />
                            ),
                            variant: "ghost",
                            onClick: () => toggleThemeAtivo(t),
                            disabled: deletingTheme,
                          },
                          {
                            key: "delete",
                            label: "Excluir",
                            icon: deletingTheme ? "pi pi-spin pi-spinner" : "pi pi-trash",
                            variant: "danger",
                            onClick: () => setThemeToDelete(t),
                            disabled: deletingTheme,
                          },
                        ]}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      )}

      {/* ══════════ TAB: TEXTOS ══════════ */}
      {tab === "textos" && (
        <div className="crm-admin-section">
          <div className="crm-admin-toolbar">
            <span className="crm-admin-subsection__title">Textos padrão por ocasião</span>
            <AppButton
              type="button"
              variant="primary"
              icon="pi pi-plus"
              onClick={openNewMessageTemplate}
            >
              Novo texto
            </AppButton>
          </div>

          {loadingMessages ? (
            <div className="crm-admin-loading"><span className="crm-spinner" /> Carregando…</div>
          ) : messageTemplates.length === 0 ? (
            <p className="crm-admin-empty">Nenhum texto padrão encontrado.</p>
          ) : (
            <table className="crm-admin-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Ocasião</th>
                  <th>Greeting</th>
                  <th>Escopo</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {messageTemplates.map((template) => {
                  const deletingMessage = deletingMessageId === template.id;
                  return (
                    <tr key={template.id} className={template.ativo ? "" : "crm-row--inactive"}>
                      <td>{template.nome}</td>
                      <td>{template.categoria || "—"}</td>
                      <td>{template.titulo}</td>
                      <td>
                        <span className={`crm-scope-badge crm-scope-badge--${template.scope}`}>
                          {SCOPE_LABELS[template.scope] || template.scope}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${
                            template.ativo ? "status-badge--active" : "status-badge--inactive"
                          }`}
                        >
                          {template.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </td>
                      <td className="crm-td-actions">
                        <TableActions
                          className="crm-admin-table-actions"
                          actions={[
                            {
                              key: "view",
                              label: "Visualizar",
                              icon: "pi pi-eye",
                              onClick: () => setMessageToPreview(template),
                              disabled: deletingMessage,
                            },
                            {
                              key: "edit",
                              label: "Editar",
                              icon: "pi pi-pencil",
                              onClick: () => openEditMessageTemplate(template),
                              disabled: deletingMessage,
                            },
                            {
                              key: "toggle",
                              label: template.ativo ? "Desativar" : "Ativar",
                              icon: template.ativo ? (
                                <i
                                  className="pi pi-times-circle"
                                  style={{ color: "var(--color-danger-fg, #cf222e)" }}
                                  aria-hidden="true"
                                />
                              ) : (
                                <i
                                  className="pi pi-check-circle"
                                  style={{ color: "var(--color-success-fg, #1a7f37)" }}
                                  aria-hidden="true"
                                />
                              ),
                              variant: "ghost",
                              onClick: () => toggleMessageAtivo(template),
                              disabled: deletingMessage,
                            },
                            {
                              key: "delete",
                              label: "Excluir",
                              icon: deletingMessage ? "pi pi-spin pi-spinner" : "pi pi-trash",
                              variant: "danger",
                              onClick: () => setMessageToDelete(template),
                              disabled: deletingMessage,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══════════ TAB: CATEGORIAS ══════════ */}
      {tab === "categorias" && (
        <div className="crm-admin-section">
          <div className="crm-admin-toolbar">
            <span />
            <AppButton type="button" variant="primary" icon="pi pi-plus" onClick={openNewCategory}>
              Nova categoria
            </AppButton>
          </div>

          {loadingCats ? (
            <div className="crm-admin-loading"><span className="crm-spinner" /> Carregando…</div>
          ) : categories.length === 0 ? (
            <p className="crm-admin-empty">Nenhuma categoria cadastrada.</p>
          ) : (
            <table className="crm-admin-table">
              <thead>
                <tr>
                  <th>Ordem</th>
                  <th>Ícone</th>
                  <th>Nome</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id} className={cat.ativo ? "" : "crm-row--inactive"}>
                    <td className="crm-td-center">{cat.sort_order}</td>
                    <td className="crm-td-center"><i className={cat.icone} /></td>
                    <td>{cat.nome}</td>
                    <td>
                      <span className={`status-badge ${cat.ativo ? "status-badge--active" : "status-badge--inactive"}`}>
                        {cat.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="crm-td-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => openEditCategory(cat)}
                      >
                        <i className="pi pi-pencil" />
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm${cat.ativo ? " btn-secondary" : " btn-primary"}`}
                        onClick={() => toggleCategoryAtivo(cat)}
                        title={cat.ativo ? "Desativar" : "Ativar"}
                      >
                        <i
                          className={`pi ${cat.ativo ? "pi-times-circle" : "pi-check-circle"}`}
                          style={{
                            color: cat.ativo
                              ? "var(--color-danger-fg, #cf222e)"
                              : "var(--color-success-fg, #1a7f37)",
                          }}
                        />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══════════ MODAL: Category ══════════ */}
      {showCatModal && (
        <div className="crm-admin-modal-overlay" onClick={() => setShowCatModal(false)}>
          <div className="crm-admin-modal" onClick={(e) => e.stopPropagation()}>
            <div className="crm-admin-modal__header">
              <h3>{editingCatId ? "Editar categoria" : "Nova categoria"}</h3>
              <button type="button" className="crm-link-btn" onClick={() => setShowCatModal(false)}>
                <i className="pi pi-times" />
              </button>
            </div>
            <div className="crm-admin-modal__body">
              <div className="crm-field">
                <label className="crm-label">Nome *</label>
                <input
                  type="text"
                  className="form-input"
                  value={catForm.nome}
                  onChange={(e) => setCatForm((p) => ({ ...p, nome: e.target.value }))}
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
                    value={catForm.icone}
                    onChange={(e) => setCatForm((p) => ({ ...p, icone: e.target.value }))}
                    placeholder="pi pi-gift"
                  />
                  <i className={catForm.icone} style={{ fontSize: "1.4rem" }} />
                </div>
                <div className="crm-icon-suggestions">
                  {ICON_SUGGESTIONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      className={`crm-icon-btn${catForm.icone === ic ? " active" : ""}`}
                      onClick={() => setCatForm((p) => ({ ...p, icone: ic }))}
                      title={ic}
                    >
                      <i className={ic} />
                    </button>
                  ))}
                </div>
              </div>
              <div className="crm-field">
                <label className="crm-label">Ordem de exibição</label>
                <input
                  type="number"
                  className="form-input"
                  value={catForm.sort_order}
                  onChange={(e) => setCatForm((p) => ({ ...p, sort_order: Number(e.target.value) }))}
                  min={0}
                  style={{ width: 100 }}
                />
              </div>
              <div className="crm-field">
                <label className="crm-label" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={catForm.ativo}
                    onChange={(e) => setCatForm((p) => ({ ...p, ativo: e.target.checked }))}
                    style={{ marginRight: 6 }}
                  />
                  Categoria ativa
                </label>
              </div>
            </div>
            <div className="crm-admin-modal__footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowCatModal(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={saveCategory} disabled={savingCat}>
                {savingCat ? <><span className="crm-spinner crm-spinner--sm" /> Salvando…</> : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ MODAL: Theme ══════════ */}
      {showThemeModal && (
        <div className="crm-admin-modal-overlay" onClick={() => setShowThemeModal(false)}>
          <div className="crm-admin-modal crm-admin-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="crm-admin-modal__header">
              <h3>{editingThemeId ? "Editar template" : "Novo template"}</h3>
              <button type="button" className="crm-link-btn" onClick={() => setShowThemeModal(false)}>
                <i className="pi pi-times" />
              </button>
            </div>
            <div className="crm-admin-modal__body crm-admin-modal__body--split">
              {/* Left: form */}
              <div className="crm-admin-modal__col">
                <div className="crm-field">
                  <label className="crm-label">Nome *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={themeForm.nome}
                    onChange={(e) => setThemeForm((p) => ({ ...p, nome: e.target.value }))}
                    placeholder="Ex.: Aniversário Azul"
                    autoFocus
                  />
                </div>

                <div className="crm-field">
                  <label className="crm-label">Categoria</label>
                  <select
                    className="form-select"
                    value={themeForm.categoria_id || ""}
                    onChange={(e) => setThemeForm((p) => ({ ...p, categoria_id: e.target.value || null }))}
                  >
                    <option value="">Sem categoria</option>
                    {categories.filter((c) => c.ativo).map((c) => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>

                <div className="crm-field">
                  <label className="crm-label">Escopo de acesso</label>
                  <select
                    className="form-select"
                    value={themeForm.scope}
                    onChange={(e) => setThemeForm((p) => ({ ...p, scope: e.target.value }))}
                  >
                    {SCOPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <span className="crm-hint">
                    "Sistema" = visível para todos os usuários da plataforma.
                  </span>
                </div>

                <div className="crm-field">
                  <label className="crm-label">Texto de saudação padrão</label>
                  <input
                    type="text"
                    className="form-input"
                    value={themeForm.greeting_text || ""}
                    onChange={(e) => setThemeForm((p) => ({ ...p, greeting_text: e.target.value }))}
                    placeholder="Ex.: Feliz Aniversário!"
                    maxLength={100}
                  />
                  <span className="crm-hint">Pré-preenche o campo "Título" ao selecionar este template.</span>
                </div>

                <div className="crm-admin-limits">
                  <span className="crm-admin-limits__title">Limites da mensagem</span>
                  <div className="crm-admin-limits__row">
                    <label>Linhas</label>
                    <input
                      type="number"
                      className="form-input"
                      value={themeForm.mensagem_max_linhas}
                      onChange={(e) => setThemeForm((p) => ({ ...p, mensagem_max_linhas: Number(e.target.value) }))}
                      min={1} max={20}
                    />
                    <label>Palavras</label>
                    <input
                      type="number"
                      className="form-input"
                      value={themeForm.mensagem_max_palavras}
                      onChange={(e) => setThemeForm((p) => ({ ...p, mensagem_max_palavras: Number(e.target.value) }))}
                      min={1} max={500}
                    />
                  </div>
                  <span className="crm-admin-limits__title" style={{ marginTop: 8 }}>Limites da assinatura</span>
                  <div className="crm-admin-limits__row">
                    <label>Linhas</label>
                    <input
                      type="number"
                      className="form-input"
                      value={themeForm.assinatura_max_linhas}
                      onChange={(e) => setThemeForm((p) => ({ ...p, assinatura_max_linhas: Number(e.target.value) }))}
                      min={1} max={5}
                    />
                    <label>Palavras</label>
                    <input
                      type="number"
                      className="form-input"
                      value={themeForm.assinatura_max_palavras}
                      onChange={(e) => setThemeForm((p) => ({ ...p, assinatura_max_palavras: Number(e.target.value) }))}
                      min={1} max={100}
                    />
                  </div>
                </div>

                <div className="crm-field">
                  <label className="crm-label" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={themeForm.ativo}
                      onChange={(e) => setThemeForm((p) => ({ ...p, ativo: e.target.checked }))}
                      style={{ marginRight: 6 }}
                    />
                    Template ativo
                  </label>
                </div>
              </div>

              {/* Right: art upload */}
              <div className="crm-admin-modal__col">
                <div className="crm-field">
                  <label className="crm-label">Arte do cartão *</label>
                  <div
                    className="crm-art-drop"
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files[0];
                      if (file) uploadArt(file);
                    }}
                  >
                    {themeForm.asset_url ? (
                      <img src={themeForm.asset_url} alt="arte" className="crm-art-preview" />
                    ) : uploadingArt ? (
                      <><span className="crm-spinner" /> Enviando…</>
                    ) : (
                      <>
                        <i className="pi pi-upload" style={{ fontSize: "2rem", opacity: 0.4 }} />
                        <span>Clique ou arraste a imagem</span>
                        <span className="crm-hint">PNG, JPG, SVG — recomendado 1080×1080px</span>
                      </>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadArt(file);
                      }}
                    />
                  </div>
                  {themeForm.asset_url && !uploadingArt && (
                    <button
                      type="button"
                      className="crm-link-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <i className="pi pi-refresh" /> Trocar arte
                    </button>
                  )}
                  {/* URL manual fallback */}
                  <details style={{ marginTop: 8 }}>
                    <summary className="crm-hint" style={{ cursor: "pointer" }}>Ou cole uma URL de imagem</summary>
                    <input
                      type="url"
                      className="form-input"
                      style={{ marginTop: 6 }}
                      value={themeForm.asset_url}
                      onChange={(e) => setThemeForm((p) => ({ ...p, asset_url: e.target.value }))}
                      placeholder="https://…"
                    />
                  </details>
                </div>
              </div>
            </div>
            <div className="crm-admin-modal__footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowThemeModal(false)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={saveTheme}
                disabled={savingTheme || uploadingArt}
              >
                {savingTheme ? <><span className="crm-spinner crm-spinner--sm" /> Salvando…</> : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ MODAL: Message template ══════════ */}
      {showMessageModal && (
        <div className="crm-admin-modal-overlay" onClick={() => setShowMessageModal(false)}>
          <div className="crm-admin-modal crm-admin-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="crm-admin-modal__header">
              <h3>{editingMessageId ? "Editar texto padrão" : "Novo texto padrão"}</h3>
              <button type="button" className="crm-link-btn" onClick={() => setShowMessageModal(false)}>
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
                  onChange={(e) => setMessageForm((p) => ({ ...p, nome: e.target.value }))}
                  placeholder="Ex.: Aniversário padrão"
                  autoFocus
                />
              </div>
              <div className="crm-field">
                <label className="crm-label">Ocasião</label>
                <input
                  type="text"
                  className="form-input"
                  value={messageForm.categoria || ""}
                  onChange={(e) => setMessageForm((p) => ({ ...p, categoria: e.target.value }))}
                  placeholder="Ex.: Aniversário"
                />
              </div>
              <div className="crm-field">
                <label className="crm-label">Escopo</label>
                <select
                  className="form-select"
                  value={messageForm.scope}
                  onChange={(e) => setMessageForm((p) => ({ ...p, scope: e.target.value }))}
                >
                  {SCOPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="crm-field">
                <label className="crm-label">Greeting / título *</label>
                <input
                  type="text"
                  className="form-input"
                  value={messageForm.titulo}
                  onChange={(e) => setMessageForm((p) => ({ ...p, titulo: e.target.value }))}
                  placeholder="Ex.: Feliz Aniversário!"
                />
              </div>
              <div className="crm-field">
                <label className="crm-label">Mensagem principal *</label>
                <textarea
                  className="form-textarea"
                  rows={8}
                  value={messageForm.corpo}
                  onChange={(e) => setMessageForm((p) => ({ ...p, corpo: e.target.value }))}
                  placeholder="Texto padrão que será reaproveitado no card."
                />
              </div>
              <div className="crm-field">
                <label className="crm-label" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={messageForm.ativo}
                    onChange={(e) => setMessageForm((p) => ({ ...p, ativo: e.target.checked }))}
                    style={{ marginRight: 6 }}
                  />
                  Texto ativo
                </label>
              </div>
            </div>
            <div className="crm-admin-modal__footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowMessageModal(false)}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={saveMessageTemplate} disabled={savingMessage}>
                {savingMessage ? <><span className="crm-spinner crm-spinner--sm" /> Salvando…</> : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {themeToPreview && (
        <div className="crm-admin-modal-overlay" onClick={() => setThemeToPreview(null)}>
          <div className="crm-admin-modal crm-admin-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="crm-admin-modal__header">
              <h3>Visualizar template</h3>
              <button type="button" className="crm-link-btn" onClick={() => setThemeToPreview(null)}>
                <i className="pi pi-times" />
              </button>
            </div>
            <div className="crm-admin-modal__body crm-admin-modal__body--split">
              <div className="crm-admin-modal__col">
                <div className="crm-admin-preview-art">
                  {themeToPreview.asset_url ? (
                    <img src={themeToPreview.asset_url} alt={themeToPreview.nome} />
                  ) : (
                    <i className="pi pi-image" />
                  )}
                </div>
              </div>
              <div className="crm-admin-modal__col">
                <div className="crm-field">
                  <label className="crm-label">Nome</label>
                  <p className="crm-preview-text">{themeToPreview.nome}</p>
                </div>
                <div className="crm-field">
                  <label className="crm-label">Categoria</label>
                  <p className="crm-preview-text">
                    {categories.find((c) => c.id === themeToPreview.categoria_id)?.nome || "—"}
                  </p>
                </div>
                <div className="crm-field">
                  <label className="crm-label">Escopo</label>
                  <p className="crm-preview-text">{SCOPE_LABELS[themeToPreview.scope] || themeToPreview.scope}</p>
                </div>
                <div className="crm-field">
                  <label className="crm-label">Greeting padrão</label>
                  <p className="crm-preview-text">{themeToPreview.greeting_text || "—"}</p>
                </div>
                <div className="crm-field">
                  <label className="crm-label">Status</label>
                  <span className={`status-badge ${themeToPreview.ativo ? "status-badge--active" : "status-badge--inactive"}`}>
                    {themeToPreview.ativo ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </div>
            </div>
            <div className="crm-admin-modal__footer">
              <button type="button" className="btn btn-secondary" onClick={() => setThemeToPreview(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {messageToPreview && (
        <div className="crm-admin-modal-overlay" onClick={() => setMessageToPreview(null)}>
          <div className="crm-admin-modal crm-admin-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="crm-admin-modal__header">
              <h3>Visualizar texto padrão</h3>
              <button type="button" className="crm-link-btn" onClick={() => setMessageToPreview(null)}>
                <i className="pi pi-times" />
              </button>
            </div>
            <div className="crm-admin-modal__body">
              <div className="crm-field">
                <label className="crm-label">Nome</label>
                <p className="crm-preview-text">{messageToPreview.nome}</p>
              </div>
              <div className="crm-field">
                <label className="crm-label">Ocasião</label>
                <p className="crm-preview-text">{messageToPreview.categoria || "—"}</p>
              </div>
              <div className="crm-field">
                <label className="crm-label">Escopo</label>
                <p className="crm-preview-text">
                  {SCOPE_LABELS[messageToPreview.scope] || messageToPreview.scope}
                </p>
              </div>
              <div className="crm-field">
                <label className="crm-label">Greeting</label>
                <p className="crm-preview-text">{messageToPreview.titulo}</p>
              </div>
              <div className="crm-field">
                <label className="crm-label">Mensagem principal</label>
                <div className="crm-preview-message">{messageToPreview.corpo}</div>
              </div>
              <div className="crm-field">
                <label className="crm-label">Status</label>
                <span className={`status-badge ${messageToPreview.ativo ? "status-badge--active" : "status-badge--inactive"}`}>
                  {messageToPreview.ativo ? "Ativo" : "Inativo"}
                </span>
              </div>
            </div>
            <div className="crm-admin-modal__footer">
              <button type="button" className="btn btn-secondary" onClick={() => setMessageToPreview(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(themeToDelete)}
        title="Excluir template"
        message={`Deseja excluir o template "${themeToDelete?.nome || ""}"?`}
        confirmLabel={deletingThemeId ? "Excluindo..." : "Excluir"}
        confirmVariant="danger"
        confirmDisabled={Boolean(deletingThemeId)}
        onCancel={() => {
          if (deletingThemeId) return;
          setThemeToDelete(null);
        }}
        onConfirm={() => {
          if (!themeToDelete || deletingThemeId) return;
          void deleteTheme(themeToDelete);
        }}
      />

      <ConfirmDialog
        open={Boolean(messageToDelete)}
        title="Excluir texto padrão"
        message={`Deseja excluir o texto "${messageToDelete?.nome || ""}"?`}
        confirmLabel={deletingMessageId ? "Excluindo..." : "Excluir"}
        confirmVariant="danger"
        confirmDisabled={Boolean(deletingMessageId)}
        onCancel={() => {
          if (deletingMessageId) return;
          setMessageToDelete(null);
        }}
        onConfirm={() => {
          if (!messageToDelete || deletingMessageId) return;
          void deleteMessageTemplate(messageToDelete);
        }}
      />
    </div>
  );
}
