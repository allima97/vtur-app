import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { useMasterScope } from "../../lib/useMasterScope";
import { boundDateEndISO, selectAllInputOnFocus } from "../../lib/inputNormalization";
import ConfirmDialog from "../ui/ConfirmDialog";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";

type CampanhaStatus = "ativa" | "inativa" | "cancelada";

type Campanha = {
  id: string;
  company_id: string;
  titulo: string;
  imagem_url: string | null;
  imagem_path: string | null;
  link_url: string | null;
  link_instagram: string | null;
  link_facebook: string | null;
  data_campanha: string; // YYYY-MM-DD
  validade_ate: string | null; // YYYY-MM-DD
  regras: string | null;
  status: CampanhaStatus;
  created_at: string;
  arquivada_em?: string | null;
};

const STORAGE_BUCKET = "campanhas";

function sanitizeFileName(name: string) {
  return String(name || "imagem")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 120);
}

function statusStyle(status: CampanhaStatus) {
  if (status === "ativa") return { background: "#dcfce7", color: "#166534" };
  if (status === "cancelada") return { background: "#fee2e2", color: "#991b1b" };
  return { background: "#e2e8f0", color: "#0f172a" };
}

function getAttachmentNameFromPath(path?: string | null) {
  const base = String(path || "").split("/").pop() || "";
  if (!base) return "anexo";
  const cleaned = base.replace(/^\d+-/, "");
  return cleaned || base || "anexo";
}

function detectAttachmentKind(pathOrUrl?: string | null) {
  const raw = String(pathOrUrl || "").toLowerCase().trim();
  if (!raw) return null;
  if (raw.endsWith(".pdf")) return "pdf" as const;
  if (raw.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/)) return "image" as const;
  return "file" as const;
}

function getCompanyLabel(companyId: string, empresas: { id: string; nome_fantasia: string }[]) {
  const id = String(companyId || "").trim();
  if (!id) return "";
  const found = empresas.find((e) => String(e.id) === id);
  return found?.nome_fantasia || id;
}

export default function CampanhasIsland() {
  const { loading: loadingPerms, ready, userType } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;

  const isMaster = /MASTER/i.test(String(userType || ""));
  const isGestor = /GESTOR/i.test(String(userType || ""));
  // Requisito: todos podem ver; apenas Gestor/Master podem criar/editar/excluir.
  const podeGerenciar = Boolean(isMaster || isGestor);
  const podeCriar = podeGerenciar;
  const podeEditar = podeGerenciar;
  const podeExcluir = podeGerenciar;
  const masterScope = useMasterScope(Boolean(isMaster && ready));

  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const scopedCompanyId = useMemo(() => {
    if (!isMaster) return companyId;
    return masterScope.empresaSelecionada !== "all" ? masterScope.empresaSelecionada : null;
  }, [isMaster, companyId, masterScope.empresaSelecionada]);

  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Campanha | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Campanha | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [confirmArchivar, setConfirmArchivar] = useState<Campanha | null>(null);
  const [preview, setPreview] = useState<{
    url: string;
    title: string;
    kind: "image" | "pdf" | "file";
    downloadName: string;
  } | null>(null);

  const [titulo, setTitulo] = useState("");
  const [dataCampanha, setDataCampanha] = useState(() => new Date().toISOString().slice(0, 10));
  const [validadeAte, setValidadeAte] = useState("");
  const [status, setStatus] = useState<CampanhaStatus>("ativa");
  const [regras, setRegras] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkInstagram, setLinkInstagram] = useState("");
  const [linkFacebook, setLinkFacebook] = useState("");
  const [imagemFile, setImagemFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [aplicarEmTodasFiliais, setAplicarEmTodasFiliais] = useState(false);
  const [empresaDestinoId, setEmpresaDestinoId] = useState<string>("");

  const resetForm = () => {
    setTitulo("");
    setDataCampanha(new Date().toISOString().slice(0, 10));
    setValidadeAte("");
    setStatus("ativa");
    setRegras("");
    setLinkUrl("");
    setLinkInstagram("");
    setLinkFacebook("");
    setImagemFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setAplicarEmTodasFiliais(false);
    setEmpresaDestinoId("");
  };

  useEffect(() => {
    let mounted = true;
    async function loadUser() {
      try {
        const { data: authData, error: authErr } = await supabase.auth.getUser();
        if (authErr) throw authErr;
        const uid = authData?.user?.id || null;
        if (!uid) return;
        const { data, error } = await supabase
          .from("users")
          .select("company_id")
          .eq("id", uid)
          .maybeSingle();
        if (error) throw error;
        if (!mounted) return;
        setUserId(uid);
        setCompanyId((data as any)?.company_id || null);
      } catch (e) {
        console.error(e);
      }
    }
    if (!loadingPerm) loadUser();
    return () => {
      mounted = false;
    };
  }, [loadingPerm]);

  async function carregar() {
    if (!scopedCompanyId) {
      setCampanhas([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setErro(null);
      setFeedback(null);
      const { data, error } = await supabase
        .from("campanhas")
        .select(
          "id, company_id, titulo, imagem_url, imagem_path, link_url, link_instagram, link_facebook, data_campanha, validade_ate, regras, status, created_at, arquivada_em"
        )
        .eq("company_id", scopedCompanyId)
        .order("data_campanha", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      setCampanhas((data || []) as Campanha[]);
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao carregar campanhas.");
      setCampanhas([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (loadingPerm) return;
    if (isMaster && masterScope.loading) return;
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingPerm, scopedCompanyId, isMaster, masterScope.loading]);

  function openCreate() {
    setEditing(null);
    resetForm();
    if (isMaster) {
      const selected =
        masterScope.empresaSelecionada !== "all" ? masterScope.empresaSelecionada : "";
      const first = masterScope.empresasAprovadas[0]?.id || "";
      setEmpresaDestinoId(selected || first || "");
    }
    setModalOpen(true);
  }

  function openEdit(c: Campanha) {
    setEditing(c);
    setTitulo(c.titulo || "");
    setDataCampanha(c.data_campanha || new Date().toISOString().slice(0, 10));
    setValidadeAte(c.validade_ate || "");
    setStatus((c.status as CampanhaStatus) || "ativa");
    setRegras(c.regras || "");
    setLinkUrl(c.link_url || "");
    setLinkInstagram(c.link_instagram || "");
    setLinkFacebook(c.link_facebook || "");
    setImagemFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setAplicarEmTodasFiliais(false);
    setEmpresaDestinoId(c.company_id || "");
    setModalOpen(true);
  }

  async function uploadImagem(targetCompanyId: string, file: File) {
    const safeName = sanitizeFileName(file.name || "campanha.png");
    const path = `${targetCompanyId}/${Date.now()}-${safeName}`;
    const upload = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType:
        file.type || (safeName.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png"),
    });
    if (upload.error) throw upload.error;
    const publicUrl = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl || null;
    return { path, url: publicUrl };
  }

  async function salvarCampanha(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) {
      setErro("Usuário não autenticado.");
      return;
    }
    if (!titulo.trim()) {
      setErro("Título é obrigatório.");
      return;
    }
    if (!dataCampanha) {
      setErro("Data da campanha é obrigatória.");
      return;
    }
    if (editing && !podeEditar) return;
    if (!editing && !podeCriar) return;

    try {
      setSaving(true);
      setErro(null);
      setFeedback(null);

      if (editing) {
        let imagemPath = editing.imagem_path || null;
        let imagemUrl = editing.imagem_url || null;

        if (imagemFile) {
          const uploaded = await uploadImagem(editing.company_id, imagemFile);
          imagemPath = uploaded.path;
          imagemUrl = uploaded.url;
          if (editing.imagem_path) {
            supabase.storage.from(STORAGE_BUCKET).remove([editing.imagem_path]).catch(() => {});
          }
        }

        const payload = {
          company_id: editing.company_id,
          titulo: titulo.trim(),
          data_campanha: dataCampanha,
          validade_ate: validadeAte || null,
          status,
          regras: regras.trim() || null,
          link_url: linkUrl.trim() || null,
          link_instagram: linkInstagram.trim() || null,
          link_facebook: linkFacebook.trim() || null,
          imagem_path: imagemPath,
          imagem_url: imagemUrl,
          created_by: userId,
        };

        const { error } = await supabase.from("campanhas").update(payload).eq("id", editing.id);
        if (error) throw error;
        setFeedback("Campanha atualizada.");
      } else {
        let destinos: string[] = [];
        if (isMaster) {
          if (aplicarEmTodasFiliais) {
            destinos = (masterScope.empresasAprovadas || [])
              .map((e) => String(e.id || "").trim())
              .filter(Boolean);
          } else {
            const id = String(empresaDestinoId || "").trim();
            if (id) destinos = [id];
          }
        } else {
          const id = String(companyId || "").trim();
          if (id) destinos = [id];
        }

        destinos = Array.from(new Set(destinos));

        if (destinos.length === 0) {
          setErro(isMaster ? "Selecione uma filial (ou todas) para continuar." : "Empresa não definida.");
          return;
        }

        const uploadedPaths: string[] = [];
        const payloadRows: any[] = [];

        try {
          for (const targetCompanyId of destinos) {
            let imagemPath = null;
            let imagemUrl = null;
            if (imagemFile) {
              const uploaded = await uploadImagem(targetCompanyId, imagemFile);
              imagemPath = uploaded.path;
              imagemUrl = uploaded.url;
              if (uploaded.path) uploadedPaths.push(uploaded.path);
            }

            payloadRows.push({
              company_id: targetCompanyId,
              titulo: titulo.trim(),
              data_campanha: dataCampanha,
              validade_ate: validadeAte || null,
              status,
              regras: regras.trim() || null,
              link_url: linkUrl.trim() || null,
              link_instagram: linkInstagram.trim() || null,
              link_facebook: linkFacebook.trim() || null,
              imagem_path: imagemPath,
              imagem_url: imagemUrl,
              created_by: userId,
            });
          }

          const { error } = await supabase.from("campanhas").insert(payloadRows);
          if (error) throw error;
        } catch (insertErr) {
          if (uploadedPaths.length > 0) {
            supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths).catch(() => {});
          }
          throw insertErr;
        }

        setFeedback(
          destinos.length > 1
            ? `Campanha criada para ${destinos.length} filiais.`
            : "Campanha criada."
        );
      }

      setModalOpen(false);
      setEditing(null);
      resetForm();
      await carregar();
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao salvar campanha.");
    } finally {
      setSaving(false);
    }
  }

  async function excluirCampanha() {
    if (!confirmDelete) return;
    if (!podeExcluir) return;
    try {
      setErro(null);
      setFeedback(null);
      const alvo = confirmDelete;
      setConfirmDelete(null);
      const { error } = await supabase.from("campanhas").delete().eq("id", alvo.id);
      if (error) throw error;
      if (alvo.imagem_path) {
        supabase.storage.from(STORAGE_BUCKET).remove([alvo.imagem_path]).catch(() => {});
      }
      setFeedback("Campanha excluída.");
      await carregar();
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao excluir campanha.");
    }
  }

  async function arquivarCampanha(c: Campanha) {
    const ts = new Date().toISOString();
    await supabase.from("campanhas").update({ arquivada_em: ts }).eq("id", c.id);
    setCampanhas((prev) => prev.map((x) => (x.id === c.id ? { ...x, arquivada_em: ts } : x)));
    setConfirmArchivar(null);
  }

  async function restaurarCampanha(id: string) {
    await supabase.from("campanhas").update({ arquivada_em: null }).eq("id", id);
    setCampanhas((prev) => prev.map((x) => (x.id === id ? { ...x, arquivada_em: null } : x)));
  }

  if (loadingPerm) return <LoadingUsuarioContext />;
  // Visualização é liberada para todos (controle de escrita via role/RLS).

  const ativas = campanhas.filter((c) => !c.arquivada_em);
  const arquivadas = campanhas.filter((c) => !!c.arquivada_em);

  return (
    <div>
      {isMaster && (
        <div className="card-base card-config mb-3" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group" style={{ minWidth: 240 }}>
            <label className="form-label">Filial</label>
            <select
              className="form-select"
              value={masterScope.empresaSelecionada}
              onChange={(e) => masterScope.setEmpresaSelecionada(e.target.value)}
            >
              <option value="all">Selecione</option>
              {masterScope.empresasAprovadas.map((empresa) => (
                <option key={empresa.id} value={empresa.id}>
                  {empresa.nome_fantasia}
                </option>
              ))}
            </select>
            {masterScope.erro && <small style={{ color: "#b91c1c" }}>{masterScope.erro}</small>}
          </div>
          <div style={{ flex: 1 }} />
          {podeCriar && (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              Nova campanha
            </button>
          )}
        </div>
      )}

      {!isMaster && (
        <div className="mobile-stack-buttons mb-3" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn btn-light" onClick={carregar} disabled={loading}>
            Atualizar
          </button>
          {podeCriar && (
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              Nova campanha
            </button>
          )}
        </div>
      )}

      {erro && (
        <div className="card-base card-config mb-3">
          <strong style={{ color: "#b91c1c" }}>{erro}</strong>
        </div>
      )}
      {feedback && (
        <div className="card-base card-config mb-3">
          <strong style={{ color: "#166534" }}>{feedback}</strong>
        </div>
      )}

      {!scopedCompanyId && isMaster ? (
        <div style={{ color: "#64748b" }}>Selecione uma filial para ver as campanhas.</div>
      ) : loading ? (
        <div>Carregando...</div>
      ) : (
        <>
        <div style={{ display: "grid", gap: 12 }}>
          {ativas.length === 0 && arquivadas.length === 0 && <div style={{ color: "#64748b" }}>Nenhuma campanha cadastrada.</div>}
          {ativas.map((c) => {
            const anexoUrl = c.imagem_url || null;
            const anexoNome = getAttachmentNameFromPath(c.imagem_path);
            const anexoKind = detectAttachmentKind(c.imagem_path || c.imagem_url) || "file";
            const openPreview = () => {
              if (!anexoUrl) return;
              setPreview({
                url: anexoUrl,
                title: c.titulo,
                kind: anexoKind,
                downloadName: anexoNome,
              });
            };

            return (
              <div key={c.id} className="card-base" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 96,
                    height: 72,
                    borderRadius: 10,
                    background: "#e2e8f0",
                    overflow: "hidden",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {anexoUrl ? (
                    anexoKind === "image" ? (
                      <button
                        type="button"
                        onClick={openPreview}
                        title="Pré-visualizar"
                        style={{
                          border: "none",
                          padding: 0,
                          margin: 0,
                          width: "100%",
                          height: "100%",
                          background: "transparent",
                          cursor: "pointer",
                        }}
                      >
                        <img src={anexoUrl} alt={c.titulo} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={openPreview}
                        title={anexoKind === "pdf" ? "Pré-visualizar PDF" : "Pré-visualizar"}
                        style={{
                          border: "none",
                          width: "100%",
                          height: "100%",
                          background: "transparent",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 4,
                          color: "#0f172a",
                          fontWeight: 800,
                          fontSize: 12,
                        }}
                      >
                        <span style={{ fontSize: 22, lineHeight: 1 }}>{anexoKind === "pdf" ? "📄" : "📎"}</span>
                        <span>{anexoKind === "pdf" ? "PDF" : "Anexo"}</span>
                      </button>
                    )
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
                      sem anexo
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ fontSize: 16 }}>{c.titulo}</strong>
                    <span
                      className="todo-badge"
                      style={{ ...statusStyle(c.status), padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}
                    >
                      {c.status}
                    </span>
                  </div>
                  <div style={{ marginTop: 6, color: "#475569", fontSize: 13, display: "grid", gap: 4 }}>
                    <div>
                      <strong>Data:</strong> {c.data_campanha}
                      {c.validade_ate ? (
                        <>
                          {" "}
                          <span style={{ opacity: 0.85 }}>•</span> <strong>Validade:</strong> {c.validade_ate}
                        </>
                      ) : null}
                    </div>
                    {c.regras ? (
                      <div style={{ whiteSpace: "pre-wrap" }}>
                        <strong>Regras:</strong> {c.regras}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      {anexoUrl ? (
                        <>
                          <button type="button" className="btn-icon" onClick={openPreview} title="Pré-visualizar">
                            👁️
                          </button>
                          <a
                            className="btn-icon"
                            href={anexoUrl}
                            target="_blank"
                            rel="noreferrer"
                            download={anexoNome}
                            title="Baixar anexo"
                          >
                            ⬇️
                          </a>
                        </>
                      ) : null}
                      {c.link_url ? (
                        <a className="btn btn-light btn-xs" href={c.link_url} target="_blank" rel="noreferrer">
                          Link
                        </a>
                      ) : null}
                      {c.link_instagram ? (
                        <a className="btn btn-light btn-xs" href={c.link_instagram} target="_blank" rel="noreferrer">
                          Instagram
                        </a>
                      ) : null}
                      {c.link_facebook ? (
                        <a className="btn btn-light btn-xs" href={c.link_facebook} target="_blank" rel="noreferrer">
                          Facebook
                        </a>
                      ) : null}
                      {podeEditar && (
                        <button type="button" className="btn-icon" onClick={() => openEdit(c)} title="Editar">
                          ✏️
                        </button>
                      )}
                      {podeEditar && (
                        <button type="button" className="btn-icon" onClick={() => setConfirmArchivar(c)} title="Arquivar">
                          📁
                        </button>
                      )}
                      {podeExcluir && (
                        <button type="button" className="btn-icon btn-danger" onClick={() => setConfirmDelete(c)} title="Excluir">
                          🗑️
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {arquivadas.length > 0 && (
          <div className="card-base" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setArchivedOpen((o) => !o)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 16px", background: "#f1f5f9", border: "none", cursor: "pointer",
                fontWeight: 700, fontSize: 14, color: "#475569", borderRadius: archivedOpen ? "8px 8px 0 0" : 8,
              }}
            >
              <span>{archivedOpen ? "▼" : "▶"}</span>
              <span>📁 Arquivadas</span>
              <span style={{ background: "#e2e8f0", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 800, color: "#64748b" }}>
                {arquivadas.length}
              </span>
            </button>
            {archivedOpen && (
              <div style={{ display: "grid", gap: 8, padding: 12, background: "#f8fafc" }}>
                {arquivadas.map((c) => (
                  <div key={c.id} className="card-base" style={{ opacity: 0.75, display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                        <strong style={{ fontSize: 16, textDecoration: "line-through", color: "#475569" }}>{c.titulo}</strong>
                        <span
                          className="todo-badge"
                          style={{ ...statusStyle(c.status), padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 800 }}
                        >
                          {c.status}
                        </span>
                      </div>
                      <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <button className="btn btn-light" style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => restaurarCampanha(c.id)}>
                          Restaurar
                        </button>
                        {podeExcluir && (
                          <button type="button" className="btn-icon btn-danger" onClick={() => setConfirmDelete(c)} title="Excluir">
                            🗑️
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        </>
      )}

      {modalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setModalOpen(false)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 820, width: "95vw", background: "#f8fafc" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title" style={{ fontWeight: 800 }}>
                {editing ? "Editar campanha" : "Nova campanha"}
              </div>
              <button className="modal-close" onClick={() => setModalOpen(false)} aria-label="Fechar">
                {"×"}
              </button>
            </div>
            <form onSubmit={salvarCampanha}>
              <div className="modal-body" style={{ display: "grid", gap: 12 }}>
                {isMaster ? (
                  <div className="form-row mobile-stack" style={{ gap: 10 }}>
                    <div className="form-group" style={{ flex: 1, minWidth: 240 }}>
                      <label className="form-label">Filial</label>
                      {editing ? (
                        <input
                          className="form-input"
                          value={getCompanyLabel(editing.company_id, masterScope.empresasAprovadas)}
                          disabled
                        />
                      ) : (
                        <select
                          className="form-select"
                          value={empresaDestinoId}
                          onChange={(e) => setEmpresaDestinoId(e.target.value)}
                          disabled={aplicarEmTodasFiliais}
                        >
                          <option value="">Selecione</option>
                          {masterScope.empresasAprovadas.map((empresa) => (
                            <option key={empresa.id} value={empresa.id}>
                              {empresa.nome_fantasia}
                            </option>
                          ))}
                        </select>
                      )}
                      {!editing ? (
                        <small style={{ color: "#64748b" }}>
                          Selecione a filial ou marque “todas as filiais”.
                        </small>
                      ) : null}
                    </div>
                    {!editing ? (
                      <div className="form-group" style={{ minWidth: 260 }}>
                        <label className="form-label">Atribuir</label>
                        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <input
                            type="checkbox"
                            checked={aplicarEmTodasFiliais}
                            onChange={(e) => setAplicarEmTodasFiliais(e.target.checked)}
                          />
                          <span>Todas as filiais (somente Master)</span>
                        </label>
                        {aplicarEmTodasFiliais ? (
                          <small style={{ color: "#64748b" }}>
                            Serão criadas {masterScope.empresasAprovadas.length} campanha(s), uma por filial.
                          </small>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="form-row" style={{ gap: 10 }}>
                  <div className="form-group" style={{ flex: 2, minWidth: 240 }}>
                    <label className="form-label">Título *</label>
                    <input className="form-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
                  </div>
                  <div className="form-group" style={{ minWidth: 160 }}>
                    <label className="form-label">Data *</label>
                    <input
                      type="date"
                      className="form-input"
                      value={dataCampanha}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => {
                        const next = e.target.value;
                        setDataCampanha(next);
                        setValidadeAte((prev) => boundDateEndISO(next, prev));
                      }}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ minWidth: 160 }}>
                    <label className="form-label">Validade</label>
                    <input
                      type="date"
                      className="form-input"
                      value={validadeAte}
                      min={dataCampanha || undefined}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => setValidadeAte(boundDateEndISO(dataCampanha, e.target.value))}
                    />
                  </div>
                  <div className="form-group" style={{ minWidth: 160 }}>
                    <label className="form-label">Status</label>
                    <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value as CampanhaStatus)}>
                      <option value="ativa">Ativa</option>
                      <option value="inativa">Inativa</option>
                      <option value="cancelada">Cancelada</option>
                    </select>
                  </div>
                </div>

                <div className="form-row" style={{ gap: 10 }}>
                  <div className="form-group" style={{ flex: 1, minWidth: 220 }}>
                    <label className="form-label">Link</label>
                    <input className="form-input" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: 220 }}>
                    <label className="form-label">Instagram</label>
                    <input
                      className="form-input"
                      value={linkInstagram}
                      onChange={(e) => setLinkInstagram(e.target.value)}
                      placeholder="https://instagram.com/..."
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1, minWidth: 220 }}>
                    <label className="form-label">Facebook</label>
                    <input
                      className="form-input"
                      value={linkFacebook}
                      onChange={(e) => setLinkFacebook(e.target.value)}
                      placeholder="https://facebook.com/..."
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Regras</label>
                  <textarea className="form-input" rows={4} value={regras} onChange={(e) => setRegras(e.target.value)} />
                </div>

                <div className="form-group">
                  <label className="form-label">Anexo (imagem ou PDF)</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="form-input"
                    onChange={(e) => setImagemFile(e.target.files?.[0] || null)}
                  />
                  {editing?.imagem_url && !imagemFile && (
                    <small style={{ color: "#64748b" }}>Anexo atual configurado (faça upload para substituir).</small>
                  )}
                </div>
              </div>
              <div className="modal-footer mobile-stack-buttons" style={{ justifyContent: "flex-end" }}>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </button>
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={() => {
                    setModalOpen(false);
                    setEditing(null);
                    resetForm();
                  }}
                  disabled={saving}
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {preview && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setPreview(null)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 980, width: "95vw", background: "#f8fafc" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title" style={{ fontWeight: 800 }}>
                {preview.title}
              </div>
              <button className="modal-close" onClick={() => setPreview(null)} aria-label="Fechar">
                {"×"}
              </button>
            </div>
            <div className="modal-body" style={{ paddingTop: 10 }}>
              {preview.kind === "image" ? (
                <div
                  style={{
                    width: "100%",
                    maxHeight: "70vh",
                    borderRadius: 12,
                    overflow: "hidden",
                    background: "#0f172a",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <img
                    src={preview.url}
                    alt={preview.title}
                    style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", display: "block" }}
                  />
                </div>
              ) : preview.kind === "pdf" ? (
                <iframe
                  src={preview.url}
                  title={`Pré-visualização: ${preview.title}`}
                  style={{
                    width: "100%",
                    height: "70vh",
                    border: "1px solid #e2e8f0",
                    borderRadius: 12,
                    background: "#fff",
                  }}
                />
              ) : (
                <div style={{ color: "#475569" }}>
                  Este anexo não possui pré-visualização embutida. Use “Abrir” ou “Baixar”.
                </div>
              )}
            </div>
            <div className="modal-footer mobile-stack-buttons" style={{ justifyContent: "flex-end" }}>
              <a className="btn btn-light" href={preview.url} target="_blank" rel="noreferrer">
                Abrir
              </a>
              <a className="btn btn-primary" href={preview.url} target="_blank" rel="noreferrer" download={preview.downloadName}>
                Baixar
              </a>
              <button type="button" className="btn btn-light" onClick={() => setPreview(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          open={true}
          title="Excluir campanha"
          message={`Deseja excluir a campanha "${confirmDelete.titulo}"?`}
          confirmLabel="Excluir"
          cancelLabel="Cancelar"
          confirmVariant="danger"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={excluirCampanha}
        />
      )}
      {confirmArchivar && (
        <ConfirmDialog
          open={true}
          title="Arquivar campanha"
          message={`Arquivar "${confirmArchivar.titulo}"? Poderá restaurar depois.`}
          confirmLabel="Arquivar"
          cancelLabel="Cancelar"
          onCancel={() => setConfirmArchivar(null)}
          onConfirm={() => arquivarCampanha(confirmArchivar)}
        />
      )}
    </div>
  );
}
