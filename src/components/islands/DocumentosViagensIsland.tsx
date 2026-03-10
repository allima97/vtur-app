import React, { useEffect, useMemo, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import AlertMessage from "../ui/AlertMessage";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import DataTable from "../ui/DataTable";
import SearchInput from "../ui/SearchInput";
import TableActions from "../ui/TableActions";
import ConfirmDialog from "../ui/ConfirmDialog";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppToolbar from "../ui/primer/AppToolbar";
import { ToastStack, useToastQueue } from "../ui/Toast";
import { supabase } from "../../lib/supabase";
import {
  type DocumentTemplateField,
  extractTemplateFromFile,
} from "../../lib/documentosViagens/extractTemplate";

type DocumentoViagem = {
  id: string;
  file_name: string;
  display_name: string | null;
  title?: string | null;
  template_text?: string | null;
  template_fields?: DocumentTemplateField[] | null;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string | null;
  uploader?: { id: string; nome_completo: string; email: string } | null;
};

function sanitizeKey(value: string) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_]/g, "")
    .slice(0, 64);
}

function escapeHtml(text: string) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDatePtBr(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function renderTemplateTextToHtml(params: {
  templateText: string;
  fields: DocumentTemplateField[];
  values: Record<string, string>;
}) {
  const { templateText, fields, values } = params;
  const typeMap = new Map(fields.map((f) => [f.key, f.type] as const));

  const filled = String(templateText || "").replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_m, keyRaw) => {
    const key = String(keyRaw || "");
    const type = typeMap.get(key) || "text";
    const raw = String(values[key] || "").trim();
    const val = type === "date" && raw ? formatDatePtBr(raw) : raw;
    if (val) return val;
    return type === "signature" ? "" : "________________";
  });

  // Preserva espaçamento e quebras: render em <pre>
  return `<pre class=\"doc-template-pre\">${escapeHtml(filled)}</pre>`;
}

function formatBytes(bytes?: number | null) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let val = n;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

export default function DocumentosViagensIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadPerm = loadingPerms || !ready;

  const podeVer = can("Documentos Viagens");
  const podeCriar = can("Documentos Viagens", "create");
  const podeEditar = can("Documentos Viagens", "edit");
  const podeExcluir = can("Documentos Viagens", "delete");

  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [items, setItems] = useState<DocumentoViagem[]>([]);

  const [mostrarUpload, setMostrarUpload] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const editingDoc = useMemo(
    () => items.find((d) => d.id === editingId) || null,
    [editingId, items]
  );

  const [modelTitle, setModelTitle] = useState("");
  const [modelText, setModelText] = useState("");
  const [modelFields, setModelFields] = useState<DocumentTemplateField[]>([]);
  const [modelValues, setModelValues] = useState<Record<string, string>>({});
  const [savingModel, setSavingModel] = useState(false);

  async function fetchList(noCache = false) {
    const params = new URLSearchParams();
    if (busca.trim()) params.set("busca", busca.trim());
    if (noCache) params.set("no_cache", "1");
    const resp = await fetch(`/api/v1/documentos-viagens/list?${params.toString()}`, {
      credentials: "same-origin",
    });
    if (!resp.ok) throw new Error(await resp.text());
    const json = (await resp.json()) as { items?: DocumentoViagem[] };
    return json.items || [];
  }

  async function carregar(noCache = false) {
    if (!podeVer) return;
    setLoading(true);
    setErro(null);
    try {
      const list = await fetchList(noCache);
      setItems(list);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar documentos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (loadPerm) return;
    carregar();
  }, [loadPerm, podeVer]);

  useEffect(() => {
    if (!podeVer) return;
    const handle = setTimeout(() => {
      carregar();
    }, 250);
    return () => clearTimeout(handle);
  }, [busca]);

  useEffect(() => {
    if (!editingDoc) return;
    setModelTitle(String(editingDoc.title || editingDoc.display_name || editingDoc.file_name || "").trim());
    setModelText(String(editingDoc.template_text || "").trim());
    const f = Array.isArray(editingDoc.template_fields) ? editingDoc.template_fields : [];
    setModelFields(f);
    setModelValues((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const field of f) {
        if (!(field.key in next)) next[field.key] = "";
      }
      return next;
    });
  }, [editingDoc?.id]);

  async function prepararUpload(file: File) {
    const resp = await fetch("/api/v1/documentos-viagens/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        file_name: file.name,
        display_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      }),
    });
    if (!resp.ok) throw new Error(await resp.text());
    const json = (await resp.json()) as { ok?: boolean; doc?: any };
    if (!json.doc) throw new Error("Resposta inválida.");
    return json.doc as DocumentoViagem;
  }

  async function enviarArquivo() {
    if (!selectedFile) {
      showToast("Selecione um arquivo.", "error");
      return;
    }
    if (!podeCriar) return;

    try {
      setUploading(true);
      setErro(null);

      // Extrai primeiro (mais rápido de falhar e não deixa lixo no banco).
      const extracted = await extractTemplateFromFile(selectedFile);

      const doc = await prepararUpload(selectedFile);

      const { error: upErr } = await supabase.storage
        .from(doc.storage_bucket)
        .upload(doc.storage_path, selectedFile, {
          contentType: selectedFile.type || undefined,
          upsert: false,
        });

      if (upErr) {
        console.error(upErr);
        await fetch("/api/v1/documentos-viagens/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ id: doc.id }),
        });
        throw upErr;
      }

      // Salva modelo extraído
      const saveResp = await fetch("/api/v1/documentos-viagens/save-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          id: doc.id,
          title: extracted.title,
          template_text: extracted.template_text,
          template_fields: extracted.template_fields,
        }),
      });
      if (!saveResp.ok) throw new Error(await saveResp.text());

      showToast("Documento enviado.", "success");
      setSelectedFile(null);
      setMostrarUpload(false);
      await carregar(true);

      // Abre editor do modelo recém-criado
      setEditingId(doc.id);
    } catch (e) {
      console.error(e);
      setErro("Erro ao enviar documento.");
      showToast("Erro ao enviar documento.", "error");
    } finally {
      setUploading(false);
    }
  }

  function abrirUpload() {
    setErro(null);
    setSelectedFile(null);
    setMostrarUpload(true);
  }

  function fecharUpload() {
    if (uploading) return;
    setErro(null);
    setSelectedFile(null);
    setMostrarUpload(false);
  }

  async function abrirDocumento(doc: DocumentoViagem) {
    try {
      const { data, error } = await supabase.storage
        .from(doc.storage_bucket)
        .createSignedUrl(doc.storage_path, 60);
      if (error) throw error;
      const url = data?.signedUrl;
      if (!url) throw new Error("URL inválida.");
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      console.error(e);
      showToast("Erro ao abrir documento.", "error");
    }
  }

  async function excluirConfirmado() {
    const id = confirmDeleteId;
    if (!id) return;
    if (!podeExcluir) return;

    try {
      setConfirmDeleteId(null);
      const resp = await fetch("/api/v1/documentos-viagens/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      showToast("Documento excluído.", "success");
      await carregar(true);
    } catch (e) {
      console.error(e);
      showToast("Erro ao excluir documento.", "error");
    }
  }

  async function salvarModelo() {
    if (!editingDoc) return;
    if (!podeEditar) return;
    if (!modelTitle.trim()) {
      showToast("Informe um título.", "error");
      return;
    }
    if (!modelText.trim()) {
      showToast("Informe o texto do modelo.", "error");
      return;
    }

    try {
      setSavingModel(true);
      const resp = await fetch("/api/v1/documentos-viagens/save-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          id: editingDoc.id,
          title: modelTitle.trim(),
          template_text: modelText,
          template_fields: modelFields,
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      showToast("Modelo salvo.", "success");
      await carregar(true);
    } catch (e) {
      console.error(e);
      showToast("Erro ao salvar modelo.", "error");
    } finally {
      setSavingModel(false);
    }
  }

  function adicionarAssinatura() {
    const current = modelFields.filter((f) => f.type === "signature");
    const nextIdx =
      current.length > 0
        ? Math.max(
            ...current
              .map((f) => String(f.key))
              .map((k) => Number(String(k).replace(/[^0-9]/g, "")) || 0)
          ) + 1
        : 1;
    const key = sanitizeKey(`assinatura_${nextIdx}`);
    if (!key) return;
    if (modelFields.some((f) => f.key === key)) return;
    const nextField: DocumentTemplateField = { key, label: `Assinatura ${nextIdx}`, type: "signature" };
    setModelFields((prev) => [...prev, nextField]);
    setModelValues((prev) => ({ ...prev, [key]: prev[key] ?? "" }));
    setModelText((prev) => `${String(prev || "").trim()}\n\n_________________________________\n{{${key}}}\n`);
  }

  function imprimir() {
    document.body.classList.add("documentos-viagens-printing");
    const cleanup = () => {
      document.body.classList.remove("documentos-viagens-printing");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);
    window.print();
  }

  if (loadPerm) return <LoadingUsuarioContext />;

  if (!podeVer) {
    return (
      <AppCard tone="config">
        <strong>Acesso negado ao modulo de Documentos Viagens.</strong>
      </AppCard>
    );
  }

  const colSpan = 6;

  const previewHtml = editingDoc
    ? renderTemplateTextToHtml({
        templateText: modelText || "",
        fields: modelFields || [],
        values: modelValues || {},
      })
    : "";

  return (
    <div className="page-content-wrap documentos-viagens-page">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      <AppToolbar
        tone="info"
        className="list-toolbar-sticky"
        title="Documentos de viagens"
        subtitle="Upload, gestao de modelos e impressao de documentos."
      />

      {!mostrarUpload && (
        <AppCard tone="info" className="mb-3">
          <div
            className="form-row mobile-stack"
            style={{ gap: 12, gridTemplateColumns: "minmax(240px, 1fr) auto", alignItems: "flex-end" }}
          >
            <div style={{ flex: "1 1 320px" }}>
              <SearchInput
                label="Buscar"
                value={busca}
                onChange={setBusca}
                placeholder="Nome, tipo, enviado por..."
                wrapperClassName="m-0"
              />
            </div>
            <div className="mobile-stack-buttons" style={{ justifyContent: "flex-end" }}>
              <AppButton
                type="button"
                variant="primary"
                onClick={abrirUpload}
                disabled={!podeCriar}
              >
                Enviar documento
              </AppButton>
            </div>
          </div>
        </AppCard>
      )}

      {mostrarUpload && (
        <AppCard tone="info" className="form-card mb-3" title="Enviar documento">
          <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap" }}>
            <div />
            <AppButton type="button" variant="secondary" onClick={fecharUpload} disabled={uploading}>
              Cancelar
            </AppButton>
          </div>

          <div className="form-row" style={{ alignItems: "flex-end" }}>
            <div className="form-group" style={{ flex: 2, minWidth: 260 }}>
              <label className="form-label">Arquivo (PDF/DOCX/ODT/XLS)</label>
              <input
                className="form-input"
                type="file"
                accept=".pdf,.docx,.odt,.xls,.xlsx,.txt"
                disabled={uploading || !podeCriar}
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="mobile-stack-buttons" style={{ justifyContent: "flex-end" }}>
              <AppButton
                type="button"
                variant="primary"
                disabled={uploading || !podeCriar || !selectedFile}
                onClick={enviarArquivo}
              >
                {uploading ? "Enviando..." : "Enviar"}
              </AppButton>
            </div>
          </div>

          {erro && <AlertMessage variant="error">{erro}</AlertMessage>}
        </AppCard>
      )}

      {!mostrarUpload && (
        <AppCard tone="info" title="Documentos">
          <div className="flex items-center gap-3" style={{ flexWrap: "wrap" }}>
            <div style={{ flex: 1 }} />
          </div>

          <DataTable
            className="table-mobile-cards"
            headers={
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>Tamanho</th>
                <th>Enviado por</th>
                <th>Data</th>
                <th className="th-actions" style={{ width: 140, textAlign: "center" }}>
                  Ações
                </th>
              </tr>
            }
            loading={loading}
            empty={!loading && items.length === 0}
            colSpan={colSpan}
          >
            {items.map((doc) => (
              <tr key={doc.id}>
                <td data-label="Nome">{doc.display_name || doc.file_name}</td>
                <td data-label="Tipo">{doc.mime_type || "-"}</td>
                <td data-label="Tamanho">{formatBytes(doc.size_bytes)}</td>
                <td data-label="Enviado por">{doc.uploader?.nome_completo || doc.uploader?.email || "-"}</td>
                <td data-label="Data">{doc.created_at ? new Date(doc.created_at).toLocaleString("pt-BR") : "-"}</td>
                <td className="th-actions" data-label="Ações">
                  <TableActions
                    actions={[
                      {
                        key: "open",
                        label: "Abrir",
                        icon: "📄",
                        variant: "primary",
                        onClick: () => abrirDocumento(doc),
                      },
                      {
                        key: "model",
                        label: "Modelo",
                        icon: "🧾",
                        onClick: () => setEditingId(doc.id),
                      },
                      {
                        key: "delete",
                        label: "Excluir",
                        icon: "🗑️",
                        variant: "danger",
                        onClick: () => setConfirmDeleteId(doc.id),
                        disabled: !podeExcluir,
                      },
                    ]}
                  />
                </td>
              </tr>
              ))}
            </DataTable>
        </AppCard>
      )}

      {editingDoc && (
        <AppCard
          tone="config"
          className="mt-3"
          title={`Modelo: ${editingDoc.display_name || editingDoc.file_name}`}
        >
          <div className="flex items-center justify-between gap-3" style={{ flexWrap: "wrap" }}>
            <div />
            <div className="mobile-stack-buttons" style={{ justifyContent: "flex-end" }}>
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => setEditingId(null)}
              >
                Fechar
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                onClick={imprimir}
                disabled={!modelText.trim()}
              >
                Imprimir / PDF
              </AppButton>
              <AppButton
                type="button"
                variant="primary"
                onClick={salvarModelo}
                disabled={!podeEditar || savingModel || !modelText.trim() || !modelTitle.trim()}
              >
                {savingModel ? "Salvando..." : "Salvar modelo"}
              </AppButton>
            </div>
          </div>

          <div className="form-row" style={{ alignItems: "flex-end" }}>
            <div className="form-group" style={{ flex: 2, minWidth: 260 }}>
              <label className="form-label">Título</label>
              <input
                className="form-input"
                value={modelTitle}
                onChange={(e) => setModelTitle(e.target.value)}
                disabled={!podeEditar}
              />
            </div>
            <div className="mobile-stack-buttons" style={{ justifyContent: "flex-end" }}>
              <AppButton
                type="button"
                variant="secondary"
                onClick={adicionarAssinatura}
                disabled={!podeEditar}
              >
                + Assinatura
              </AppButton>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              {"Texto do modelo (use {{campo_x}}, {{data}}, {{assinatura_1}})"}
            </label>
            <textarea
              className="form-input"
              style={{ minHeight: 220, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
              value={modelText}
              onChange={(e) => setModelText(e.target.value)}
              disabled={!podeEditar}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Campos</label>
            <DataTable
              className="table-mobile-cards"
              headers={
                <tr>
                  <th>Campo</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                </tr>
              }
              loading={false}
              empty={modelFields.length === 0}
              colSpan={3}
            >
              {modelFields.map((f) => (
                <tr key={f.key}>
                  <td data-label="Campo" style={{ minWidth: 220 }}>
                    <input
                      className="form-input"
                      value={f.label}
                      disabled={!podeEditar}
                      onChange={(e) => {
                        const label = e.target.value;
                        setModelFields((prev) => prev.map((x) => (x.key === f.key ? { ...x, label } : x)));
                      }}
                    />
                    <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                      {"{{"}
                      {f.key}
                      {"}}"}
                    </div>
                  </td>
                  <td data-label="Tipo" style={{ width: 160 }}>
                    <select
                      className="form-input"
                      value={f.type}
                      disabled={!podeEditar}
                      onChange={(e) => {
                        const type = String(e.target.value) as any;
                        setModelFields((prev) =>
                          prev.map((x) => (x.key === f.key ? { ...x, type } : x))
                        );
                      }}
                    >
                      <option value="text">Texto</option>
                      <option value="date">Data</option>
                      <option value="signature">Assinatura</option>
                    </select>
                  </td>
                  <td data-label="Valor">
                    {f.type === "date" ? (
                      <input
                        className="form-input"
                        type="date"
                        value={modelValues[f.key] || ""}
                        onChange={(e) => setModelValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      />
                    ) : (
                      <input
                        className="form-input"
                        value={modelValues[f.key] || ""}
                        onChange={(e) => setModelValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>

          <div className="form-group">
            <label className="form-label">Visualização (HTML)</label>
            <AppCard tone="info">
              <div
                className="doc-print-area"
                dangerouslySetInnerHTML={{ __html: `<h2 style=\"margin:0 0 12px 0\">${escapeHtml(
                  modelTitle || ""
                )}</h2>${previewHtml}` }}
              />
            </AppCard>
          </div>
        </AppCard>
      )}

      <ConfirmDialog
        open={Boolean(confirmDeleteId)}
        title="Excluir documento?"
        message="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        confirmVariant="danger"
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={excluirConfirmado}
      />
    </div>
  );
}
