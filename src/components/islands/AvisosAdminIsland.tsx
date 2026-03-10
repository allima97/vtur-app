import React, { useEffect, useRef, useState } from "react";
import type ToastEditor from "@toast-ui/editor";
import "@toast-ui/editor/dist/toastui-editor.css";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppToolbar from "../ui/primer/AppToolbar";
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
      <AppCard tone="config" className="admin-page admin-avisos-page">
        Apenas administradores podem acessar este modulo.
      </AppCard>
    );
  }

  return (
    <div className="mt-6 admin-page admin-avisos-page">
      <AppToolbar
        tone="config"
        className="list-toolbar-sticky"
        title="Templates de avisos"
        subtitle="Crie modelos e selecione remetentes padrao."
        actions={
          <AppButton type="button" variant="primary" onClick={() => openModal()}>
            Novo template
          </AppButton>
        }
      />

      {erro && (
        <AlertMessage variant="error">{erro}</AlertMessage>
      )}

      {loading ? (
        <AppCard tone="config">Carregando templates...</AppCard>
      ) : (
        <AppCard tone="config">
          <DataTable
            className="table-mobile-cards min-w-[720px]"
            headers={
              <tr>
                <th>Nome</th>
                <th>Assunto</th>
                <th>Remetente</th>
                <th>Status</th>
                <th className="th-actions">Acoes</th>
              </tr>
            }
            colSpan={5}
            empty={templates.length === 0}
            emptyMessage="Nenhum template cadastrado."
          >
            {templates.map((t) => (
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
                <td className="th-actions" data-label="Acoes">
                  <div className="action-buttons">
                    <AppButton type="button" variant="ghost" onClick={() => openModal(t)}>
                      Editar
                    </AppButton>
                    <AppButton type="button" variant="secondary" onClick={() => toggleAtivo(t)}>
                      {t.ativo ? "Desativar" : "Ativar"}
                    </AppButton>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        </AppCard>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 flex justify-center items-center p-4">
          <form className="w-full max-w-xl" onSubmit={salvarTemplate}>
            <AppCard
              tone="config"
              title={form.id ? "Editar template" : "Novo template"}
              actions={
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={salvando}
                >
                  Fechar
                </AppButton>
              }
            >
              <AppField
                as="input"
                label="Nome"
                value={form.nome}
                onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                required
              />

              <AppField
                as="input"
                label="Assunto"
                value={form.assunto}
                onChange={(e) => setForm((prev) => ({ ...prev, assunto: e.target.value }))}
                required
              />

              <div className="form-group">
                <label className="form-label">Mensagem</label>
                <div className="avisos-editor">
                  <div ref={editorElRef} />
                </div>
                <small style={{ color: "#94a3b8" }}>
                  Voce pode usar: {"{{nome}}"}, {"{{email}}"}, {"{{empresa}}"}.
                </small>
              </div>

              <AppField
                as="select"
                label="Remetente"
                value={form.sender_key}
                onChange={(e) => setForm((prev) => ({ ...prev, sender_key: e.target.value }))}
                required
                options={REMETENTE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
              />

              <AppField
                as="select"
                label="Ativo?"
                value={form.ativo ? "true" : "false"}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, ativo: e.target.value === "true" }))
                }
                options={[
                  { value: "true", label: "Sim" },
                  { value: "false", label: "Nao" },
                ]}
              />

              <div className="flex gap-2 flex-wrap mt-3 mobile-stack-buttons">
                <AppButton type="submit" variant="primary" disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
                </AppButton>
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={() => setModalOpen(false)}
                  disabled={salvando}
                >
                  Cancelar
                </AppButton>
              </div>
            </AppCard>
          </form>
        </div>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
};

export default AvisosAdminIsland;
