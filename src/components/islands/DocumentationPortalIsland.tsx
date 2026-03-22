import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import {
  type DocumentationSection,
  DOCUMENTATION_ROLE_OPTIONS,
  DOCUMENTATION_TONE_OPTIONS,
  buildDocumentationMarkdownFromSections,
  buildDocumentationModuleKey,
  buildDocumentationToc,
  escapeDocumentationRegex,
  getDocumentationRoleLabel,
  getKnownDocumentationModuleOptions,
  normalizeDocumentationSectionInput,
  renderDocumentationMarkdownHtml,
  suggestDocumentationModuleKey,
} from "../../lib/documentation";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppNoticeDialog from "../ui/primer/AppNoticeDialog";
import ConfirmDialog from "../ui/ConfirmDialog";

type DocumentationApiPayload = {
  markdown?: string;
  sections?: DocumentationSection[];
  source?: string;
};

function createDraftSection(sections: DocumentationSection[], base?: Partial<DocumentationSection>) {
  const nextOrder =
    sections.length > 0
      ? Math.max(...sections.map((item) => Number(item.sort_order || 0))) + 10
      : 10;

  return normalizeDocumentationSectionInput(
    {
      slug: "vtur",
      role_scope: "all",
      module_key: "",
      route_pattern: "",
      title: "",
      summary: "",
      content_markdown: "",
      tone: "info",
      sort_order: nextOrder,
      is_active: true,
      ...base,
    },
    sections.length,
  );
}

export default function DocumentationPortalIsland() {
  const { isSystemAdmin } = usePermissoesStore();

  const [raw, setRaw] = useState("Carregando documentação...");
  const [sections, setSections] = useState<DocumentationSection[]>([]);
  const [source, setSource] = useState("fallback");
  const [search, setSearch] = useState("");
  const [sectionSearch, setSectionSearch] = useState("");
  const [isManaging, setIsManaging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [restoreConfirmId, setRestoreConfirmId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [draftSection, setDraftSection] = useState<DocumentationSection | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState("");

  const moduleOptions = useMemo(() => getKnownDocumentationModuleOptions(), []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/documentacao");
        if (!res.ok) throw new Error("Falha ao carregar documentação.");
        const data = (await res.json()) as DocumentationApiPayload;
        const nextSections = Array.isArray(data?.sections) ? data.sections : [];
        setRaw(String(data?.markdown || "Documentação indisponível."));
        setSections(nextSections);
        setSource(String(data?.source || "fallback"));
      } catch {
        setRaw("Erro ao carregar documentação.");
        setSections([]);
        setSource("fallback");
      }
    }
    load();
  }, []);

  const htmlContent = useMemo(() => renderDocumentationMarkdownHtml(raw), [raw]);
  const toc = useMemo(() => buildDocumentationToc(raw), [raw]);

  const filteredHTML = useMemo(() => {
    if (!search.trim()) return htmlContent;
    const regex = new RegExp(escapeDocumentationRegex(search), "gi");
    return htmlContent.replace(regex, (match) => `<mark>${match}</mark>`);
  }, [search, htmlContent]);

  const filteredSections = useMemo(() => {
    const term = sectionSearch.trim().toLowerCase();
    if (!term) return sections;
    return sections.filter((section) => {
      const haystack = [
        section.title,
        section.summary,
        section.module_key,
        section.route_pattern,
        getDocumentationRoleLabel(section.role_scope),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [sectionSearch, sections]);

  const previewHtml = useMemo(() => {
    if (!draftSection) return "";
    const markdown = [
      draftSection.title ? `### ${draftSection.title}` : "",
      draftSection.summary || "",
      draftSection.content_markdown || "",
    ]
      .filter(Boolean)
      .join("\n\n");
    return renderDocumentationMarkdownHtml(markdown);
  }, [draftSection]);

  useEffect(() => {
    if (toc.length === 0 || isManaging) {
      setActiveId("");
      return;
    }
    if (!activeId || !toc.some((item) => item.id === activeId)) {
      setActiveId(toc[0].id);
    }
  }, [toc, activeId, isManaging]);

  useEffect(() => {
    if (isManaging) return;
    const el = contentRef.current;
    if (!el) return;

    function onScroll() {
      const headers = Array.from(el.querySelectorAll<HTMLElement>("h1, h2, h3"));
      if (headers.length === 0) return;

      const threshold = el.scrollTop + 64;
      let current = headers[0]?.id || "";
      for (const header of headers) {
        if (header.offsetTop <= threshold) {
          current = header.id;
          continue;
        }
        break;
      }

      if (current && current !== activeId) {
        setActiveId(current);
      }
    }

    onScroll();
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [htmlContent, activeId, isManaging]);

  useEffect(() => {
    if (!isManaging) return;
    if (draftSection) return;
    if (sections.length > 0) {
      const first = sections[0];
      setSelectedSectionId(first.id);
      setDraftSection(normalizeDocumentationSectionInput(first, 0));
      return;
    }
    const fresh = createDraftSection([]);
    setSelectedSectionId(fresh.id);
    setDraftSection(fresh);
  }, [isManaging, draftSection, sections]);

  function scrollToSection(id: string) {
    const container = contentRef.current;
    const target = container?.querySelector<HTMLElement>(`#${id}`);
    if (!container || !target) return;
    container.scrollTo({
      top: Math.max(0, target.offsetTop - 16),
      behavior: "smooth",
    });
    setActiveId(id);
  }

  function loadPayloadIntoState(data: DocumentationApiPayload) {
    const nextSections = Array.isArray(data?.sections) ? data.sections : [];
    const nextMarkdown =
      String(data?.markdown || "").trim() || buildDocumentationMarkdownFromSections(nextSections);
    setSections(nextSections);
    setRaw(nextMarkdown);
    if (data?.source) {
      setSource(String(data.source));
    } else if (nextSections.length > 0) {
      setSource("sections");
    }
  }

  function startManaging() {
    setIsManaging(true);
    setSaveStatus(null);
    if (sections.length > 0) {
      const first = sections[0];
      setSelectedSectionId(first.id);
      setDraftSection(normalizeDocumentationSectionInput(first, 0));
    } else {
      const fresh = createDraftSection([]);
      setSelectedSectionId(fresh.id);
      setDraftSection(fresh);
    }
  }

  function cancelManaging() {
    setIsManaging(false);
    setSaveStatus(null);
    setSectionSearch("");
    setHistoryOpen(false);
    setDraftSection(null);
    setSelectedSectionId("");
  }

  function selectSection(sectionId: string) {
    const target = sections.find((section) => section.id === sectionId);
    if (!target) return;
    setSelectedSectionId(sectionId);
    setDraftSection(normalizeDocumentationSectionInput(target, 0));
    setSaveStatus(null);
  }

  function createSection() {
    const fresh = createDraftSection(sections);
    setSelectedSectionId(fresh.id);
    setDraftSection(fresh);
    setSaveStatus(null);
  }

  function updateDraft<K extends keyof DocumentationSection>(field: K, value: DocumentationSection[K]) {
    setDraftSection((current) => {
      if (!current) return current;
      const next = { ...current, [field]: value } as DocumentationSection;
      if (field === "title" && !String(current.module_key || "").trim()) {
        next.module_key = suggestDocumentationModuleKey(String(value || ""));
      }
      return next;
    });
  }

  async function loadHistory() {
    try {
      setHistoryLoading(true);
      const res = await fetch("/api/admin/documentacao/versoes");
      if (!res.ok) throw new Error("Erro ao carregar histórico.");
      const data = await res.json();
      setHistoryItems(data?.items || []);
    } catch {
      setHistoryItems([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && historyItems.length === 0) {
      loadHistory();
    }
  }

  async function restoreVersion(versionId: string) {
    if (!versionId || restoringId) return;
    setRestoreConfirmId(versionId);
  }

  async function confirmRestoreVersion() {
    const versionId = String(restoreConfirmId || "").trim();
    if (!versionId || restoringId) {
      setRestoreConfirmId(null);
      return;
    }
    try {
      setRestoringId(versionId);
      const res = await fetch("/api/admin/documentacao/restaurar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: versionId }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Erro ao restaurar versão.");
      }
      const data = (await res.json()) as DocumentationApiPayload;
      loadPayloadIntoState(data);
      if (Array.isArray(data?.sections) && data.sections.length > 0) {
        const first = data.sections[0];
        setSelectedSectionId(first.id);
        setDraftSection(normalizeDocumentationSectionInput(first, 0));
      }
      setSaveStatus("Versão restaurada com sucesso.");
      setHistoryItems([]);
      setHistoryOpen(false);
    } catch (err: any) {
      setSaveStatus(err?.message || "Erro ao restaurar versão.");
    } finally {
      setRestoringId(null);
      setRestoreConfirmId(null);
    }
  }

  async function saveDraftSection() {
    if (!draftSection || saving) return;

    const normalized = normalizeDocumentationSectionInput(draftSection, sections.length);
    if (!normalized.title) {
      setSaveStatus("Informe o título da seção.");
      return;
    }
    if (!normalized.content_markdown) {
      setSaveStatus("Informe o conteúdo da seção.");
      return;
    }
    if (!normalized.module_key && !normalized.route_pattern) {
      setSaveStatus("Informe o module_key ou um route_pattern.");
      return;
    }

    const nextSections = [...sections];
    const existingIndex = nextSections.findIndex((item) => item.id === normalized.id);
    if (existingIndex >= 0) {
      nextSections[existingIndex] = normalized;
    } else {
      nextSections.push(normalized);
    }

    try {
      setSaving(true);
      setSaveStatus(null);
      const res = await fetch("/api/admin/documentacao", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: nextSections }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Erro ao salvar documentação.");
      }
      const data = (await res.json()) as DocumentationApiPayload;
      loadPayloadIntoState(data);
      setSource("sections");
      const returnedSections = Array.isArray(data?.sections) ? data.sections : nextSections;
      const savedSection =
        returnedSections.find(
          (item) =>
            item.role_scope === normalized.role_scope &&
            item.module_key === normalized.module_key &&
            item.title === normalized.title,
        ) || returnedSections[0];
      if (savedSection) {
        setSelectedSectionId(savedSection.id);
        setDraftSection(normalizeDocumentationSectionInput(savedSection, 0));
      }
      setSaveStatus("Seção salva com sucesso.");
      setHistoryItems([]);
      setHistoryOpen(false);
    } catch (err: any) {
      setSaveStatus(err?.message || "Erro ao salvar documentação.");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDeleteSection() {
    if (!draftSection || saving) {
      setDeleteConfirmOpen(false);
      return;
    }

    const nextSections = sections.filter((item) => item.id !== draftSection.id);

    try {
      setSaving(true);
      setSaveStatus(null);
      const res = await fetch("/api/admin/documentacao", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: nextSections }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Erro ao excluir seção.");
      }
      const data = (await res.json()) as DocumentationApiPayload;
      loadPayloadIntoState(data);
      setSource("sections");
      const returnedSections = Array.isArray(data?.sections) ? data.sections : nextSections;
      if (returnedSections[0]) {
        setSelectedSectionId(returnedSections[0].id);
        setDraftSection(normalizeDocumentationSectionInput(returnedSections[0], 0));
      } else {
        const fresh = createDraftSection([]);
        setSelectedSectionId(fresh.id);
        setDraftSection(fresh);
      }
      setSaveStatus("Seção excluída com sucesso.");
      setHistoryItems([]);
      setHistoryOpen(false);
    } catch (err: any) {
      setSaveStatus(err?.message || "Erro ao excluir seção.");
    } finally {
      setSaving(false);
      setDeleteConfirmOpen(false);
    }
  }

  const headerActions = isSystemAdmin ? (
    <div className="vtur-app-toolbar-actions">
      {!isManaging ? (
        <AppButton type="button" variant="secondary" onClick={startManaging}>
          Gerenciar seções
        </AppButton>
      ) : (
        <>
          <AppButton type="button" variant="secondary" onClick={createSection}>
            Nova seção
          </AppButton>
          <AppButton type="button" variant="ghost" onClick={cancelManaging}>
            Voltar para visualização
          </AppButton>
        </>
      )}
    </div>
  ) : null;

  return (
    <section className="documentation-portal-page admin-page page-content-wrap admin-page-shell">
      <AppCard
        tone="info"
        className="list-toolbar-sticky"
        title="Portal de Documentacao"
        subtitle="Documentacao viva com sumario, busca, historico e edicao por modulo."
        actions={headerActions}
      />

      {isManaging && isSystemAdmin && source !== "sections" ? (
        <AppCard
          tone="config"
          title="Modo legado detectado"
          subtitle="Ao salvar qualquer seção, a documentação passa a ficar estruturada por módulo no banco, sem depender de build."
        />
      ) : null}

      <div className="documentation-portal-layout">
        <AppCard
          tone="info"
          title={isManaging ? "Seções" : "Sumario"}
          className="documentation-sidebar-card"
        >
          <AppField
            as="input"
            type="text"
            label={isManaging ? "Buscar seção" : "Pesquisar"}
            placeholder={isManaging ? "Título, módulo ou rota..." : "Pesquisar..."}
            value={isManaging ? sectionSearch : search}
            onChange={(e) => (isManaging ? setSectionSearch(e.target.value) : setSearch(e.target.value))}
            wrapperClassName="mb-3"
          />

          {isManaging ? (
            <>
              <div className="documentation-section-list">
                {filteredSections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    className={[
                      "documentation-section-item",
                      selectedSectionId === section.id ? "is-active" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => selectSection(section.id)}
                  >
                    <strong>{section.title}</strong>
                    <small>
                      {getDocumentationRoleLabel(section.role_scope)} • {section.module_key || "sem chave"}
                    </small>
                    {section.route_pattern ? <small>{section.route_pattern}</small> : null}
                  </button>
                ))}
                {filteredSections.length === 0 ? (
                  <div className="documentation-section-empty">Nenhuma seção encontrada.</div>
                ) : null}
              </div>
              <datalist id="documentation-module-key-list">
                {moduleOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </datalist>
            </>
          ) : (
            <nav className="documentation-toc" aria-label="Sumario da documentacao">
              {toc.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    "documentation-toc-item",
                    `documentation-toc-level-${item.level}`,
                    activeId === item.id ? "is-active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => scrollToSection(item.id)}
                  aria-current={activeId === item.id ? "true" : undefined}
                >
                  {item.title}
                </button>
              ))}
            </nav>
          )}
        </AppCard>

        <AppCard
          tone={isManaging ? "config" : "info"}
          className="documentation-content-card"
          title={isManaging ? draftSection?.title || "Nova seção" : undefined}
          subtitle={
            isManaging && draftSection
              ? `${getDocumentationRoleLabel(draftSection.role_scope)} • ${draftSection.module_key || "sem module_key"}`
              : undefined
          }
        >
          <div
            ref={contentRef}
            className={[
              "documentation-content-scroll",
              isManaging ? "is-editing" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {isManaging && isSystemAdmin ? (
              <>
                <div className="doc-editor-bar">
                  <div className="doc-editor-actions">
                    <AppButton type="button" variant="primary" onClick={saveDraftSection} disabled={saving}>
                      {saving ? "Salvando..." : "Salvar seção"}
                    </AppButton>
                    <AppButton type="button" variant="secondary" onClick={toggleHistory} disabled={saving}>
                      {historyOpen ? "Fechar historico" : "Historico completo"}
                    </AppButton>
                    <AppButton
                      type="button"
                      variant="ghost"
                      onClick={() => setDeleteConfirmOpen(true)}
                      disabled={saving || sections.length === 0}
                    >
                      Excluir seção
                    </AppButton>
                  </div>
                  {saveStatus ? <div className="doc-editor-status">{saveStatus}</div> : null}
                </div>

                {historyOpen ? (
                  <div className="doc-history">
                    {historyLoading ? <div>Carregando historico...</div> : null}
                    {!historyLoading && historyItems.length === 0 ? <div>Nenhuma alteracao registrada.</div> : null}
                    {!historyLoading
                      ? historyItems.map((item) => {
                          const user = item?.users?.nome_completo || item?.users?.email || "Admin";
                          const date = item?.created_at
                            ? new Date(item.created_at).toLocaleString("pt-BR")
                            : "";
                          const action =
                            item?.action === "INSERT"
                              ? "Criacao"
                              : item?.action === "DELETE"
                              ? "Remocao"
                              : "Atualizacao";
                          return (
                            <div key={item.id} className="doc-history-item">
                              <div className="doc-history-info">
                                <strong>{action}</strong> • {user} • {date}
                              </div>
                              <AppButton
                                type="button"
                                variant="secondary"
                                size="small"
                                onClick={() => restoreVersion(item.id)}
                                disabled={Boolean(restoringId)}
                              >
                                {restoringId === item.id ? "Restaurando..." : "Restaurar"}
                              </AppButton>
                            </div>
                          );
                        })
                      : null}
                  </div>
                ) : null}

                {draftSection ? (
                  <div className="documentation-section-editor">
                    <div className="documentation-section-form">
                      <AppField
                        as="select"
                        label="Perfil"
                        value={draftSection.role_scope}
                        onChange={(e) => updateDraft("role_scope", e.target.value as DocumentationSection["role_scope"])}
                        options={DOCUMENTATION_ROLE_OPTIONS}
                      />
                      <AppField
                        as="input"
                        type="number"
                        label="Ordem"
                        value={String(draftSection.sort_order || 0)}
                        onChange={(e) => updateDraft("sort_order", Number(e.target.value || 0))}
                      />
                      <AppField
                        as="select"
                        label="Tom visual"
                        value={draftSection.tone}
                        onChange={(e) => updateDraft("tone", e.target.value as DocumentationSection["tone"])}
                        options={DOCUMENTATION_TONE_OPTIONS}
                      />
                      <AppField
                        as="select"
                        label="Ativa"
                        value={draftSection.is_active ? "true" : "false"}
                        onChange={(e) => updateDraft("is_active", e.target.value === "true")}
                        options={[
                          { label: "Sim", value: "true" },
                          { label: "Não", value: "false" },
                        ]}
                      />
                      <AppField
                        as="input"
                        type="text"
                        label="Título"
                        value={draftSection.title}
                        onChange={(e) => updateDraft("title", e.target.value)}
                        wrapperClassName="documentation-section-form-span-2"
                      />
                      <AppField
                        as="input"
                        type="text"
                        label="Module key"
                        list="documentation-module-key-list"
                        caption="Chave principal usada pela ajuda contextual. Ex.: admin_logs, vendas, operacao_controle_sac."
                        value={draftSection.module_key}
                        onChange={(e) => updateDraft("module_key", buildDocumentationModuleKey(e.target.value))}
                      />
                      <AppField
                        as="input"
                        type="text"
                        label="Route pattern"
                        caption="Opcional. Use para telas novas sem precisar de deploy. Ex.: /admin/novo-modulo"
                        value={draftSection.route_pattern || ""}
                        onChange={(e) => updateDraft("route_pattern", e.target.value)}
                      />
                      <AppField
                        as="textarea"
                        label="Resumo"
                        rows={3}
                        caption="Opcional. Aparece na visão consolidada e ajuda a contextualizar a seção."
                        value={draftSection.summary || ""}
                        onChange={(e) => updateDraft("summary", e.target.value)}
                        wrapperClassName="documentation-section-form-span-2"
                      />
                      <AppField
                        as="textarea"
                        label="Conteúdo em Markdown"
                        rows={16}
                        caption="Aceita títulos, listas, links, imagens e blocos simples em Markdown."
                        value={draftSection.content_markdown}
                        onChange={(e) => updateDraft("content_markdown", e.target.value)}
                        wrapperClassName="documentation-section-form-span-2"
                      />
                    </div>

                    <div className="documentation-preview-card">
                      <strong className="documentation-preview-title">Pré-visualização</strong>
                      <div className="doc-content" dangerouslySetInnerHTML={{ __html: previewHtml }} />
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <div className="doc-content" dangerouslySetInnerHTML={{ __html: filteredHTML }} />
            )}
          </div>
        </AppCard>
      </div>

      <ConfirmDialog
        open={Boolean(restoreConfirmId)}
        title="Restaurar versão"
        message="Restaurar esta versão substituirá o conteúdo atual da documentação estruturada. Deseja continuar?"
        confirmLabel="Restaurar"
        cancelLabel="Cancelar"
        onConfirm={() => void confirmRestoreVersion()}
        onCancel={() => setRestoreConfirmId(null)}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Excluir seção"
        message="Deseja excluir esta seção da documentação?"
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        onConfirm={() => void confirmDeleteSection()}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
      <AppNoticeDialog
        open={Boolean(noticeMessage)}
        title="Aviso"
        message={noticeMessage}
        closeLabel="OK"
        onClose={() => setNoticeMessage(null)}
      />
    </section>
  );
}
