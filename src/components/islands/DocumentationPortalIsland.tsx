import React, { useEffect, useMemo, useRef, useState } from "react";
import type ToastEditor from "@toast-ui/editor";
import "@toast-ui/editor/dist/toastui-editor.css";
import { usePermissoesStore } from "../../lib/permissoesStore";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppToolbar from "../ui/primer/AppToolbar";

export default function DocumentationPortalIsland() {
  const [raw, setRaw] = useState("Carregando documentação...");
  const [search, setSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ToastEditor | null>(null);
  const editorElRef = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState("");
  const { isSystemAdmin } = usePermissoesStore();

  // ==========================================================
  // 1) CARREGAR O ARQUIVO MD
  // ==========================================================
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/documentacao");
        if (!res.ok) throw new Error("Falha ao carregar documentação.");
        const data = await res.json();
        setRaw(data?.markdown || "Documentação indisponível.");
      } catch (e) {
        setRaw("Erro ao carregar documentação.");
      }
    }
    load();
  }, []);

  // ==========================================================
  // 2) PARSE SIMPLES DE MARKDOWN → HTML
  // (com ids automáticos para navegação)
  // ==========================================================
  function mdToHtml(md: string) {
    let html = md;

    // IDs automáticos
    html = html.replace(/^### (.*)$/gim, (_, title) => {
      const id = slug(title);
      return `<h3 id="${id}">${title}</h3>`;
    });

    html = html.replace(/^## (.*)$/gim, (_, title) => {
      const id = slug(title);
      return `<h2 id="${id}">${title}</h2>`;
    });

    html = html.replace(/^# (.*)$/gim, (_, title) => {
      const id = slug(title);
      return `<h1 id="${id}">${title}</h1>`;
    });

    // Imagens
    html = html.replace(/!\[(.*?)\]\((.*?)\)/gim, '<img src="$2" alt="$1" />');

    // Links
    html = html.replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

    // Negrito
    html = html.replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>");

    // Itálico
    html = html.replace(/\*(.*?)\*/gim, "<em>$1</em>");

    // Listas
    html = html.replace(/^- (.*)$/gim, "<li>$1</li>");

    // Agrupar <li> em <ul>
    const lines = html.split("\n");
    const out: string[] = [];
    let inList = false;
    for (const line of lines) {
      if (line.trim().startsWith("<li>")) {
        if (!inList) {
          out.push("<ul>");
          inList = true;
        }
        out.push(line);
      } else {
        if (inList) {
          out.push("</ul>");
          inList = false;
        }
        out.push(line);
      }
    }
    if (inList) out.push("</ul>");
    html = out.join("\n");

    html = html.replace(/\n{2,}/g, "<br/><br/>");

    return html;
  }

  const htmlContent = useMemo(() => mdToHtml(raw), [raw]);


  // ==========================================================
  // 3) GERAR SUMÁRIO AUTOMÁTICO
  // ==========================================================
  const toc = useMemo(() => {
    const lines = raw.split("\n");
    const items: { level: number; title: string; id: string }[] = [];

    for (const line of lines) {
      if (line.startsWith("# ")) {
        const title = line.replace("# ", "").trim();
        items.push({ level: 1, title, id: slug(title) });
      }
      if (line.startsWith("## ")) {
        const title = line.replace("## ", "").trim();
        items.push({ level: 2, title, id: slug(title) });
      }
      if (line.startsWith("### ")) {
        const title = line.replace("### ", "").trim();
        items.push({ level: 3, title, id: slug(title) });
      }
    }

    return items;
  }, [raw]);

  function slug(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  // ==========================================================
  // 4) SCROLL SPY (destaca sessão ativa)
  // ==========================================================
  useEffect(() => {
    if (isEditing) return;
    const el = contentRef.current;
    if (!el) return;

    function onScroll() {
      const headers = el.querySelectorAll("h1, h2, h3");
      let current = "";

      headers.forEach((h) => {
        const rect = h.getBoundingClientRect();
        if (rect.top >= 0 && rect.top < 200) {
          current = h.id;
        }
      });

      if (current && current !== activeId) {
        setActiveId(current);
      }
    }

    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [htmlContent, isEditing]);

  // ==========================================================
  // 5) FILTRAR DOCUMENTAÇÃO POR PESQUISA
  // ==========================================================
  const filteredHTML = useMemo(() => {
    if (!search.trim()) return htmlContent;

    const regex = new RegExp(search, "gi");
    return htmlContent.replace(regex, (m) => `<mark>${m}</mark>`);
  }, [search, htmlContent]);

  function startEditing() {
    setIsEditing(true);
    setSaveStatus(null);
  }

  function cancelEditing() {
    setIsEditing(false);
    setSaveStatus(null);
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

  async function restoreVersion(versionId: string) {
    if (!versionId || restoringId) return;
    const confirmar = window.confirm(
      "Restaurar esta versão substituirá o conteúdo atual da documentação. Deseja continuar?"
    );
    if (!confirmar) return;
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
      const data = await res.json();
      const markdown = String(data?.markdown || "");
      if (markdown) {
        setRaw(markdown);
        if (isEditing) {
          editorRef.current?.setMarkdown(markdown);
        }
      }
      setSaveStatus("Versão restaurada com sucesso.");
      setHistoryItems([]);
      setHistoryOpen(false);
    } catch (err: any) {
      setSaveStatus(err?.message || "Erro ao restaurar versão.");
    } finally {
      setRestoringId(null);
    }
  }

  function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && historyItems.length === 0) {
      loadHistory();
    }
  }

  async function saveEditing() {
    if (saving) return;
    const markdown = editorRef.current?.getMarkdown?.() || "";
    if (!markdown.trim()) {
      setSaveStatus("O conteúdo está vazio.");
      return;
    }

    try {
      setSaving(true);
      setSaveStatus(null);
      const res = await fetch("/api/admin/documentacao", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || "Erro ao salvar documentação.");
      }
      setRaw(markdown);
      setIsEditing(false);
      setSaveStatus("Documentação salva com sucesso.");
      setHistoryItems([]);
      setHistoryOpen(false);
    } catch (err: any) {
      setSaveStatus(err?.message || "Erro ao salvar documentação.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    if (!isEditing) {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
      return;
    }

    if (!editorElRef.current || editorRef.current) return;

    (async () => {
      if (typeof window === "undefined") return;
      try {
        await import("@toast-ui/editor/dist/i18n/pt-br");
        const { default: EditorCtor } = await import("@toast-ui/editor");
        if (cancelled || !editorElRef.current || editorRef.current) return;
        const editor = new EditorCtor({
          el: editorElRef.current,
          height: "520px",
          initialEditType: "wysiwyg",
          previewStyle: "vertical",
          language: "pt-BR",
          usageStatistics: false,
          hideModeSwitch: true,
          toolbarItems: [
            ["heading", "bold", "italic"],
            ["ul", "ol"],
            ["link", "image"],
            ["hr"],
          ],
          hooks: {
            addImageBlobHook: async (blob, callback) => {
              try {
                const formData = new FormData();
                const fileName = (blob as File)?.name || `imagem-${Date.now()}.png`;
                formData.append("file", blob, fileName);
                const res = await fetch("/api/admin/documentacao/imagem", {
                  method: "POST",
                  body: formData,
                });
                if (!res.ok) {
                  const msg = await res.text();
                  throw new Error(msg || "Erro ao enviar imagem.");
                }
                const data = await res.json();
                if (data?.url) {
                  callback(data.url, data.name || "Imagem");
                }
              } catch {
                alert("Não foi possível enviar a imagem.");
              }
            },
          },
        });
        editorRef.current = editor;
        editor.setMarkdown(raw || "");
      } catch (err) {
        console.error("Falha ao carregar o editor.", err);
      }
    })();

    return () => {
      cancelled = true;
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing || !editorRef.current) return;
    editorRef.current.setMarkdown(raw || "");
  }, [raw, isEditing]);

  // ==========================================================
  // UI FINAL
  // ==========================================================

  return (
    <section className="documentation-portal-page">
      <AppToolbar
        tone="info"
        title="Portal de Documentacao"
        subtitle="Documentacao viva com sumario, busca e historico de versoes."
      />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <AppCard
          tone="info"
          title="Sumario"
          className="h-auto lg:h-[calc(100vh-200px)] overflow-y-auto lg:sticky lg:top-[110px]"
        >
          <AppField
            as="input"
            type="text"
            label="Pesquisar"
            placeholder="Pesquisar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            wrapperClassName="mb-3"
          />

          {toc.map((item) => (
            <div
              key={item.id}
              style={{
                marginLeft: `${(item.level - 1) * 15}px`,
                marginBottom: "6px",
              }}
            >
              <a
                href={`#${item.id}`}
                style={{
                  textDecoration: activeId === item.id ? "underline" : "none",
                  fontWeight: activeId === item.id ? "bold" : "normal",
                }}
              >
                {item.title}
              </a>
            </div>
          ))}
        </AppCard>

        <AppCard tone="info" className="h-auto lg:h-[calc(100vh-200px)]">
          <div ref={contentRef} className="h-full overflow-y-auto" style={{ lineHeight: 1.6 }}>
            {isSystemAdmin && (
              <div className="doc-editor-bar">
                {!isEditing ? (
                  <AppButton type="button" variant="secondary" onClick={startEditing}>
                    Editar documentacao
                  </AppButton>
                ) : (
                  <>
                    <div className="doc-editor-toolbar">
                      <AppButton type="button" variant="secondary" onClick={toggleHistory}>
                        {historyOpen ? "Fechar historico" : "Historico"}
                      </AppButton>
                    </div>
                    <div className="doc-editor-actions">
                      <AppButton type="button" variant="primary" onClick={saveEditing} disabled={saving}>
                        {saving ? "Salvando..." : "Salvar"}
                      </AppButton>
                      <AppButton type="button" variant="secondary" onClick={cancelEditing} disabled={saving}>
                        Cancelar
                      </AppButton>
                    </div>
                  </>
                )}
                {saveStatus && <div className="doc-editor-status">{saveStatus}</div>}
                {historyOpen && (
                  <div className="doc-history">
                    {historyLoading && <div>Carregando historico...</div>}
                    {!historyLoading && historyItems.length === 0 && (
                      <div>Nenhuma alteracao registrada.</div>
                    )}
                    {!historyLoading &&
                      historyItems.map((item) => {
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
                      })}
                  </div>
                )}
              </div>
            )}

            {isEditing ? (
              <div className="doc-editor">
                <div ref={editorElRef} />
              </div>
            ) : (
              <div
                className="doc-content"
                dangerouslySetInnerHTML={{ __html: filteredHTML }}
              />
            )}
          </div>
        </AppCard>
      </div>
    </section>
  );
}
