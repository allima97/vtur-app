import React, { useEffect, useRef, useState } from "react";
import type ToastEditor from "@toast-ui/editor";
import "@toast-ui/editor/dist/toastui-editor.css";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import AlertMessage from "../ui/AlertMessage";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { ToastStack, useToastQueue } from "../ui/Toast";

type AvisoTemplate = {
  id: string;
  nome: string;
  assunto: string;
  mensagem: string;
  ativo: boolean;
  sender_key: string;
};

const REMETENTE_OPTIONS = [
  { value: "admin", label: "Depto. Administrativo (admin@)" },
  { value: "avisos", label: "Avisos (avisos@)" },
  { value: "financeiro", label: "Depto. Financeiro (financeiro@)" },
  { value: "suporte", label: "Suporte (suporte@)" },
];

const AvisosAdminIsland: React.FC = () => {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("AdminUsers") || can("AdminDashboard") || can("Admin");

  const [templates, setTemplates] = useState<AvisoTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [form, setForm] = useState<AvisoTemplate>({
    id: "",
    nome: "",
    assunto: "",
    mensagem: "",
    ativo: true,
    sender_key: "avisos",
  });
  const editorRef = useRef<ToastEditor | null>(null);
  const editorElRef = useRef<HTMLDivElement>(null);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  useEffect(() => {
    carregarTemplates();
  }, []);

  async function carregarTemplates() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("admin_avisos_templates")
        .select("id, nome, assunto, mensagem, ativo, sender_key")
        .order("nome");
      if (error) {
        const msg = error.message || "";
        if (msg.includes("sender_key") || msg.includes("schema cache")) {
          const fallback = await supabase
            .from("admin_avisos_templates")
            .select("id, nome, assunto, mensagem, ativo")
            .order("nome");
          if (fallback.error) throw fallback.error;
          const normalized = (fallback.data || []).map((row: any) => ({
            ...row,
            sender_key: "avisos",
          }));
          setTemplates(normalized as AvisoTemplate[]);
          showToast(
            "Atualize o banco: adicione a coluna sender_key em admin_avisos_templates.",
            "warning"
          );
          return;
        }
        throw error;
      }
      const normalized = (data || []).map((row: any) => ({
        ...row,
        sender_key: row.sender_key || "avisos",
      }));
      setTemplates(normalized as AvisoTemplate[]);
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao carregar templates.");
    } finally {
      setLoading(false);
    }
  }

  const openModal = (template?: AvisoTemplate) => {
    if (template) {
      setForm({ ...template });
    } else {
      setForm({ id: "", nome: "", assunto: "", mensagem: "", ativo: true, sender_key: "avisos" });
    }
    setModalOpen(true);
  };

  useEffect(() => {
    let cancelled = false;

    if (!modalOpen) {
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
          height: "300px",
          initialEditType: "wysiwyg",
          previewStyle: "vertical",
          language: "pt-BR",
          usageStatistics: false,
          hideModeSwitch: true,
          toolbarItems: [
            ["bold", "italic", "strike"],
            ["ul", "ol"],
            ["link"],
          ],
        });
        editorRef.current = editor;
        editor.setMarkdown(form.mensagem || "");
        editor.on("change", () => {
          const value = editorRef.current?.getMarkdown?.() || "";
          setForm((prev) => ({ ...prev, mensagem: value }));
        });
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
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen || !editorRef.current) return;
    editorRef.current.setMarkdown(form.mensagem || "");
  }, [form.id, modalOpen]);

  const salvarTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const mensagem = (editorRef.current?.getMarkdown?.() || form.mensagem || "").trim();
    if (!form.nome.trim() || !form.assunto.trim() || !mensagem || !form.sender_key) {
      setErro("Nome, assunto, mensagem e remetente são obrigatórios.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      if (form.id) {
        const { error } = await supabase
          .from("admin_avisos_templates")
          .update({
            nome: form.nome.trim(),
            assunto: form.assunto.trim(),
            mensagem,
            ativo: form.ativo,
            sender_key: form.sender_key,
            updated_at: new Date().toISOString(),
          })
          .eq("id", form.id);
        if (error) throw error;
        showToast("Template atualizado.", "success");
      } else {
        const { error } = await supabase.from("admin_avisos_templates").insert({
          nome: form.nome.trim(),
          assunto: form.assunto.trim(),
          mensagem,
          ativo: form.ativo,
          sender_key: form.sender_key,
        });
        if (error) throw error;
        showToast("Template criado.", "success");
      }
      setModalOpen(false);
      await carregarTemplates();
    } catch (err: any) {
      setErro(err?.message || "Erro ao salvar template.");
    } finally {
      setSalvando(false);
    }
  };

  const toggleAtivo = async (template: AvisoTemplate) => {
    try {
      const { error } = await supabase
        .from("admin_avisos_templates")
        .update({ ativo: !template.ativo, updated_at: new Date().toISOString() })
        .eq("id", template.id);
      if (error) throw error;
      await carregarTemplates();
    } catch (e) {
      showToast("Erro ao atualizar status.", "error");
    }
  };

  if (loadingPerm) return <LoadingUsuarioContext />;

  if (!podeVer) {
    return (
      <div style={{ padding: 20 }}>
        <h3>Apenas administradores podem acessar este módulo.</h3>
      </div>
    );
  }

  return (
    <div className="mt-6 admin-page admin-avisos-page">
      <div className="card-base card-red mb-3 list-toolbar-sticky">
        <div
          className="form-row mobile-stack"
          style={{ gap: 12, gridTemplateColumns: "minmax(240px, 1fr) auto", alignItems: "flex-end" }}
        >
          <div className="form-group">
            <h3 className="page-title">📣 Templates de avisos</h3>
            <p className="page-subtitle">Crie modelos e selecione remetentes padrão.</p>
          </div>
          <div className="form-group" style={{ alignItems: "flex-end" }}>
            <button className="btn btn-primary w-full sm:w-auto" onClick={() => openModal()}>
              Novo template
            </button>
          </div>
        </div>
      </div>

      {erro && (
        <div className="mt-3">
          <AlertMessage variant="error">{erro}</AlertMessage>
        </div>
      )}

      {loading ? (
        <p className="mt-4">Carregando templates...</p>
      ) : (
        <div className="table-container overflow-x-auto mt-4">
          <table className="table-default table-header-red table-mobile-cards min-w-[720px]">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Assunto</th>
                <th>Remetente</th>
                <th>Status</th>
                <th className="th-actions">Ações</th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr>
                  <td colSpan={5}>Nenhum template cadastrado.</td>
                </tr>
              ) : (
                templates.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Nome">{t.nome}</td>
                    <td data-label="Assunto">{t.assunto}</td>
                    <td data-label="Remetente">
                      {REMETENTE_OPTIONS.find((opt) => opt.value === t.sender_key)?.label || "Avisos"}
                    </td>
                    <td
                      data-label="Status"
                      className={t.ativo ? "text-emerald-500 font-bold" : "text-rose-500 font-bold"}
                    >
                      {t.ativo ? "Ativo" : "Inativo"}
                    </td>
                    <td className="th-actions" data-label="Ações">
                      <div className="action-buttons">
                        <button
                          type="button"
                          className="btn-icon icon-action-btn"
                          onClick={() => openModal(t)}
                          title="Editar"
                          aria-label="Editar"
                        >
                          <span aria-hidden="true">✏️</span>
                          <span className="sr-only">Editar</span>
                        </button>
                        <button
                          type="button"
                          className="btn-icon icon-action-btn"
                          onClick={() => toggleAtivo(t)}
                          title={t.ativo ? "Desativar" : "Ativar"}
                          aria-label={t.ativo ? "Desativar" : "Ativar"}
                        >
                          <span aria-hidden="true">{t.ativo ? "⏸️" : "✅"}</span>
                          <span className="sr-only">{t.ativo ? "Desativar" : "Ativar"}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 flex justify-center items-center p-4">
          <form className="card-base card-config w-full max-w-xl" onSubmit={salvarTemplate}>
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-lg font-semibold">{form.id ? "Editar template" : "Novo template"}</h4>
              <button
                type="button"
                className="btn btn-light"
                onClick={() => setModalOpen(false)}
                disabled={salvando}
              >
                Fechar
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Nome</label>
              <input
                className="form-input"
                value={form.nome}
                onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Assunto</label>
              <input
                className="form-input"
                value={form.assunto}
                onChange={(e) => setForm((prev) => ({ ...prev, assunto: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Mensagem</label>
              <div className="avisos-editor">
                <div ref={editorElRef} />
              </div>
              <small style={{ color: "#94a3b8" }}>
                Você pode usar: {"{{nome}}"}, {"{{email}}"}, {"{{empresa}}"}.
              </small>
            </div>

            <div className="form-group">
              <label className="form-label">Remetente</label>
              <select
                className="form-select"
                value={form.sender_key}
                onChange={(e) => setForm((prev) => ({ ...prev, sender_key: e.target.value }))}
                required
              >
                {REMETENTE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group flex-1">
                <label className="form-label">Ativo?</label>
                <select
                  className="form-select"
                  value={form.ativo ? "true" : "false"}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, ativo: e.target.value === "true" }))
                  }
                >
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap mt-3 mobile-stack-buttons">
              <button type="submit" className="btn btn-primary" disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar"}
              </button>
              <button
                type="button"
                className="btn btn-light"
                onClick={() => setModalOpen(false)}
                disabled={salvando}
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default AvisosAdminIsland;
