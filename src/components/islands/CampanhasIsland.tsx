import { Dialog } from "@primer/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { useMasterScope } from "../../lib/useMasterScope";
import { boundDateEndISO, selectAllInputOnFocus } from "../../lib/inputNormalization";
import AlertMessage from "../ui/AlertMessage";
import ConfirmDialog from "../ui/ConfirmDialog";
import EmptyState from "../ui/EmptyState";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import TableActions from "../ui/TableActions";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

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

function formatDateLabel(date?: string | null) {
  const raw = String(date || "").trim();
  if (!raw) return "-";
  const [year, month, day] = raw.split("-");
  if (!year || !month || !day) return raw;
  return `${day}/${month}/${year}`;
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
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todas" | CampanhaStatus>("todas");

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

  async function salvarCampanha(e?: React.FormEvent) {
    e?.preventDefault();
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

  const campanhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return campanhas.filter((campanha) => {
      if (filtroStatus !== "todas" && campanha.status !== filtroStatus) return false;
      if (!termo) return true;

      const searchable = [
        campanha.titulo,
        campanha.regras,
        campanha.link_url,
        campanha.link_instagram,
        campanha.link_facebook,
        getCompanyLabel(campanha.company_id, masterScope.empresasAprovadas),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(termo);
    });
  }, [busca, campanhas, filtroStatus, masterScope.empresasAprovadas]);

  const ativas = campanhasFiltradas.filter((c) => !c.arquivada_em);
  const arquivadas = campanhasFiltradas.filter((c) => !!c.arquivada_em);
  const contextEmpresa = isMaster
    ? scopedCompanyId
      ? `Filial ${getCompanyLabel(scopedCompanyId, masterScope.empresasAprovadas)} selecionada para consulta e publicacao.`
      : "Selecione uma filial para visualizar e publicar campanhas."
    : "Campanhas vinculadas a sua filial atual, com acessos controlados por permissao.";
  const campanhasComAnexo = campanhasFiltradas.filter((c) => Boolean(c.imagem_url)).length;

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    resetForm();
  }

  function openExternalUrl(url?: string | null) {
    if (!url || typeof window === "undefined") return;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function downloadExternalUrl(url?: string | null, downloadName?: string) {
    if (!url || typeof document === "undefined") return;
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noreferrer";
    if (downloadName) link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function renderCampanhaCard(campanha: Campanha, archived = false) {
    const anexoUrl = campanha.imagem_url || null;
    const anexoNome = getAttachmentNameFromPath(campanha.imagem_path);
    const anexoKind = detectAttachmentKind(campanha.imagem_path || campanha.imagem_url) || "file";
    const empresaLabel = getCompanyLabel(campanha.company_id, masterScope.empresasAprovadas);
    const openPreview = () => {
      if (!anexoUrl) return;
      setPreview({
        url: anexoUrl,
        title: campanha.titulo,
        kind: anexoKind,
        downloadName: anexoNome,
      });
    };

    const actionItems = [
      anexoUrl
        ? {
            key: `preview-${campanha.id}`,
            label: "Preview",
            variant: "ghost" as const,
            onClick: openPreview,
          }
        : null,
      archived
        ? {
            key: `restore-${campanha.id}`,
            label: "Restaurar",
            variant: "light" as const,
            onClick: () => restaurarCampanha(campanha.id),
          }
        : podeEditar
          ? {
              key: `edit-${campanha.id}`,
              label: "Editar",
              variant: "ghost" as const,
              onClick: () => openEdit(campanha),
            }
          : null,
      !archived && podeEditar
        ? {
            key: `archive-${campanha.id}`,
            label: "Arquivar",
            variant: "light" as const,
            onClick: () => setConfirmArchivar(campanha),
          }
        : null,
      podeExcluir
        ? {
            key: `delete-${campanha.id}`,
            label: "Excluir",
            variant: "danger" as const,
            onClick: () => setConfirmDelete(campanha),
          }
        : null,
    ].filter(Boolean);

    return (
      <div
        key={campanha.id}
        className={`vtur-campaign-card ${archived ? "is-archived" : ""}`.trim()}
      >
        <div className="vtur-campaign-media">
          {anexoUrl ? (
            anexoKind === "image" ? (
              <button type="button" className="vtur-campaign-media-button" onClick={openPreview} title="Pre-visualizar anexo">
                <img src={anexoUrl} alt={campanha.titulo} className="vtur-campaign-media-image" />
              </button>
            ) : (
              <button
                type="button"
                className="vtur-campaign-media-button vtur-campaign-media-file"
                onClick={openPreview}
                title={anexoKind === "pdf" ? "Pre-visualizar PDF" : "Pre-visualizar anexo"}
              >
                <span className="vtur-campaign-file-icon">{anexoKind === "pdf" ? "PDF" : "Anexo"}</span>
                <span className="vtur-campaign-file-name">{anexoNome}</span>
              </button>
            )
          ) : (
            <div className="vtur-campaign-media-empty">Sem anexo</div>
          )}
        </div>

        <div className="vtur-campaign-content">
          <div className="vtur-campaign-head">
            <div className="vtur-campaign-title-group">
              <strong className="vtur-campaign-title">{campanha.titulo}</strong>
              <span
                className="vtur-campaign-status"
                style={statusStyle(campanha.status)}
              >
                {campanha.status}
              </span>
            </div>
            <TableActions actions={actionItems as any[]} className="vtur-campaign-actions" />
          </div>

          <div className="vtur-campaign-meta">
            <span>
              <strong>Publicacao:</strong> {formatDateLabel(campanha.data_campanha)}
            </span>
            {campanha.validade_ate ? (
              <span>
                <strong>Validade:</strong> {formatDateLabel(campanha.validade_ate)}
              </span>
            ) : null}
            {isMaster && empresaLabel ? (
              <span>
                <strong>Filial:</strong> {empresaLabel}
              </span>
            ) : null}
          </div>

          {campanha.regras ? <div className="vtur-campaign-rules">{campanha.regras}</div> : null}

          <div className="vtur-campaign-links">
            {anexoUrl ? (
              <>
                <AppButton type="button" variant="secondary" onClick={openPreview}>
                  Visualizar anexo
                </AppButton>
                <AppButton
                  type="button"
                  variant="ghost"
                  onClick={() => downloadExternalUrl(anexoUrl, anexoNome)}
                >
                  Baixar
                </AppButton>
              </>
            ) : null}
            {campanha.link_url ? (
              <AppButton type="button" variant="ghost" onClick={() => openExternalUrl(campanha.link_url)}>
                Site
              </AppButton>
            ) : null}
            {campanha.link_instagram ? (
              <AppButton type="button" variant="ghost" onClick={() => openExternalUrl(campanha.link_instagram)}>
                Instagram
              </AppButton>
            ) : null}
            {campanha.link_facebook ? (
              <AppButton type="button" variant="ghost" onClick={() => openExternalUrl(campanha.link_facebook)}>
                Facebook
              </AppButton>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppPrimerProvider>
      <div>
        <AppToolbar
          className="mb-3"
          sticky
          tone="config"
          title="Campanhas promocionais"
          subtitle={contextEmpresa}
          actions={
            <div className="vtur-quote-top-actions">
              <AppButton type="button" variant="secondary" onClick={() => void carregar()} disabled={loading}>
                {loading ? "Atualizando..." : "Atualizar"}
              </AppButton>
              {podeCriar ? (
                <AppButton type="button" variant="primary" onClick={openCreate} disabled={isMaster && masterScope.loading}>
                  Nova campanha
                </AppButton>
              ) : null}
            </div>
          }
        >
          <div className="vtur-form-grid vtur-form-grid-3">
            {isMaster ? (
              <AppField
                as="select"
                label="Filial"
                value={masterScope.empresaSelecionada}
                onChange={(e) => masterScope.setEmpresaSelecionada(e.target.value)}
                options={[
                  { label: "Selecione", value: "all" },
                  ...masterScope.empresasAprovadas.map((empresa) => ({
                    label: empresa.nome_fantasia,
                    value: empresa.id,
                  })),
                ]}
              />
            ) : null}
            <AppField
              label="Buscar campanha"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Titulo, regra, link ou filial"
            />
            <AppField
              as="select"
              label="Status"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as "todas" | CampanhaStatus)}
              options={[
                { label: "Todos os status", value: "todas" },
                { label: "Ativa", value: "ativa" },
                { label: "Inativa", value: "inativa" },
                { label: "Cancelada", value: "cancelada" },
              ]}
            />
          </div>

          <div className="vtur-quote-summary-grid" style={{ marginTop: 16 }}>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Ativas</span>
              <strong>{ativas.length}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Arquivadas</span>
              <strong>{arquivadas.length}</strong>
            </div>
            <div className="vtur-quote-summary-item">
              <span className="vtur-quote-summary-label">Com anexo</span>
              <strong>{campanhasComAnexo}</strong>
            </div>
          </div>

          {masterScope.erro ? (
            <div style={{ marginTop: 16 }}>
              <AlertMessage variant="error">{masterScope.erro}</AlertMessage>
            </div>
          ) : null}
        </AppToolbar>

        {erro ? (
          <AlertMessage variant="error" className="mb-3">
            {erro}
          </AlertMessage>
        ) : null}
        {feedback ? (
          <AlertMessage variant="success" className="mb-3">
            {feedback}
          </AlertMessage>
        ) : null}

        {!scopedCompanyId && isMaster ? (
          <AppCard tone="config">
            <EmptyState
              title="Selecione uma filial"
              description="O contexto Master precisa estar apontando para uma filial especifica antes de listar ou publicar campanhas."
            />
          </AppCard>
        ) : loading ? (
          <AppCard tone="info">Carregando campanhas...</AppCard>
        ) : (
          <div className="vtur-modal-body-stack">
            <AppCard
              title="Campanhas ativas"
              subtitle="Materiais promocionais em circulacao para a filial selecionada."
            >
              {ativas.length === 0 ? (
                <EmptyState
                  title="Nenhuma campanha ativa"
                  description="Publique a primeira campanha deste contexto ou ajuste os filtros para localizar registros arquivados."
                  action={
                    podeCriar ? (
                      <AppButton type="button" variant="primary" onClick={openCreate}>
                        Criar campanha
                      </AppButton>
                    ) : undefined
                  }
                />
              ) : (
                <div className="vtur-campaign-list">{ativas.map((campanha) => renderCampanhaCard(campanha))}</div>
              )}
            </AppCard>

            <AppCard
              title="Campanhas arquivadas"
              subtitle="Historico promocional da filial, com possibilidade de restaurar e reusar materiais."
              actions={
                <AppButton
                  type="button"
                  variant="ghost"
                  onClick={() => setArchivedOpen((value) => !value)}
                  disabled={arquivadas.length === 0}
                >
                  {archivedOpen ? "Ocultar" : "Mostrar"} arquivadas
                </AppButton>
              }
            >
              {arquivadas.length === 0 ? (
                <EmptyState
                  title="Nenhuma campanha arquivada"
                  description="Quando campanhas forem arquivadas, elas aparecerao aqui para consulta e restauracao."
                />
              ) : archivedOpen ? (
                <div className="vtur-campaign-list">{arquivadas.map((campanha) => renderCampanhaCard(campanha, true))}</div>
              ) : (
                <div className="vtur-inline-note">
                  {arquivadas.length} campanha(s) arquivada(s) pronta(s) para restauracao quando necessario.
                </div>
              )}
            </AppCard>
          </div>
        )}

        {modalOpen ? (
          <Dialog
            title={editing ? "Editar campanha" : "Nova campanha"}
            width="xlarge"
            onClose={closeModal}
            footerButtons={[
              {
                content: "Cancelar",
                buttonType: "default",
                onClick: closeModal,
                disabled: saving,
              },
              {
                content: saving ? "Salvando..." : editing ? "Salvar alteracoes" : "Publicar campanha",
                buttonType: "primary",
                onClick: () => void salvarCampanha(),
                disabled: saving,
              },
            ]}
          >
            <form onSubmit={salvarCampanha}>
              <div className="vtur-modal-body-stack">
                {isMaster ? (
                  <AppCard
                    tone="config"
                    title="Escopo de publicacao"
                    subtitle="Defina em qual filial a campanha sera criada ou atualizada."
                  >
                    <div className="vtur-form-grid vtur-form-grid-2">
                      {editing ? (
                        <AppField
                          label="Filial"
                          value={getCompanyLabel(editing.company_id, masterScope.empresasAprovadas)}
                          disabled
                        />
                      ) : (
                        <AppField
                          as="select"
                          label="Filial"
                          value={empresaDestinoId}
                          onChange={(e) => setEmpresaDestinoId(e.target.value)}
                          disabled={aplicarEmTodasFiliais}
                          caption="Selecione uma filial especifica ou habilite a distribuicao para todas."
                          options={[
                            { label: "Selecione", value: "" },
                            ...masterScope.empresasAprovadas.map((empresa) => ({
                              label: empresa.nome_fantasia,
                              value: empresa.id,
                            })),
                          ]}
                        />
                      )}

                      {!editing ? (
                        <div>
                          <label className={`vtur-modal-checkbox-card ${aplicarEmTodasFiliais ? "is-selected" : ""}`}>
                            <input
                              type="checkbox"
                              checked={aplicarEmTodasFiliais}
                              onChange={(e) => setAplicarEmTodasFiliais(e.target.checked)}
                            />
                            <div>
                              <strong>Todas as filiais</strong>
                              <div className="vtur-inline-note">
                                Cria uma campanha por filial aprovada neste contexto Master.
                              </div>
                              {aplicarEmTodasFiliais ? (
                                <div className="vtur-inline-note">
                                  Serão criadas {masterScope.empresasAprovadas.length} campanha(s).
                                </div>
                              ) : null}
                            </div>
                          </label>
                        </div>
                      ) : null}
                    </div>
                  </AppCard>
                ) : null}

                <AppCard
                  title="Conteudo da campanha"
                  subtitle="Defina titulo, periodo de publicacao, status e instrucoes de uso."
                >
                  <div className="vtur-form-grid vtur-form-grid-4">
                    <AppField
                      label="Titulo"
                      value={titulo}
                      onChange={(e) => setTitulo(e.target.value)}
                      required
                    />
                    <AppField
                      label="Data"
                      type="date"
                      value={dataCampanha}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => {
                        const next = e.target.value;
                        setDataCampanha(next);
                        setValidadeAte((prev) => boundDateEndISO(next, prev));
                      }}
                      required
                    />
                    <AppField
                      label="Validade"
                      type="date"
                      value={validadeAte}
                      min={dataCampanha || undefined}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => setValidadeAte(boundDateEndISO(dataCampanha, e.target.value))}
                    />
                    <AppField
                      as="select"
                      label="Status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as CampanhaStatus)}
                      options={[
                        { label: "Ativa", value: "ativa" },
                        { label: "Inativa", value: "inativa" },
                        { label: "Cancelada", value: "cancelada" },
                      ]}
                    />
                  </div>

                  <div className="vtur-form-grid" style={{ marginTop: 16 }}>
                    <AppField
                      as="textarea"
                      label="Regras e observacoes"
                      rows={4}
                      value={regras}
                      onChange={(e) => setRegras(e.target.value)}
                      placeholder="Descreva elegibilidade, janela de uso, restricoes ou orientacoes comerciais."
                    />
                  </div>
                </AppCard>

                <AppCard
                  title="Canais e anexo"
                  subtitle="Anexe criativos e links publicos para apoiar a divulgacao comercial."
                >
                  <div className="vtur-form-grid vtur-form-grid-3">
                    <AppField
                      label="Link principal"
                      value={linkUrl}
                      onChange={(e) => setLinkUrl(e.target.value)}
                      placeholder="https://..."
                    />
                    <AppField
                      label="Instagram"
                      value={linkInstagram}
                      onChange={(e) => setLinkInstagram(e.target.value)}
                      placeholder="https://instagram.com/..."
                    />
                    <AppField
                      label="Facebook"
                      value={linkFacebook}
                      onChange={(e) => setLinkFacebook(e.target.value)}
                      placeholder="https://facebook.com/..."
                    />
                  </div>

                  <div className="vtur-campaign-upload-block">
                    <label className="form-label">Anexo (imagem ou PDF)</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*,application/pdf"
                      className="form-input vtur-campaign-file-input"
                      onChange={(e) => setImagemFile(e.target.files?.[0] || null)}
                    />
                    {editing?.imagem_url && !imagemFile ? (
                      <div className="vtur-inline-note">
                        O anexo atual permanece ativo ate que um novo arquivo seja enviado.
                      </div>
                    ) : null}
                  </div>
                </AppCard>
              </div>
            </form>
          </Dialog>
        ) : null}

        {preview ? (
          <Dialog
            title={preview.title}
            width="xlarge"
            onClose={() => setPreview(null)}
            footerButtons={[
              {
                content: "Fechar",
                buttonType: "default",
                onClick: () => setPreview(null),
              },
              {
                content: "Abrir",
                buttonType: "default",
                onClick: () => openExternalUrl(preview.url),
              },
              {
                content: "Baixar",
                buttonType: "primary",
                onClick: () => downloadExternalUrl(preview.url, preview.downloadName),
              },
            ]}
          >
            <div className="vtur-modal-body-stack">
              <AppCard
                tone="info"
                title="Pre-visualizacao do anexo"
                subtitle={preview.downloadName}
              >
                {preview.kind === "image" ? (
                  <div className="vtur-campaign-preview-frame">
                    <img src={preview.url} alt={preview.title} className="vtur-campaign-preview-image" />
                  </div>
                ) : preview.kind === "pdf" ? (
                  <iframe
                    src={preview.url}
                    title={`Pre-visualizacao: ${preview.title}`}
                    className="vtur-campaign-preview-pdf"
                  />
                ) : (
                  <EmptyState
                    title="Sem pre-visualizacao embutida"
                    description="Use abrir ou baixar para consultar o arquivo completo em uma nova aba."
                  />
                )}
              </AppCard>
            </div>
          </Dialog>
        ) : null}

        {confirmDelete ? (
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
        ) : null}
        {confirmArchivar ? (
          <ConfirmDialog
            open={true}
            title="Arquivar campanha"
            message={`Arquivar "${confirmArchivar.titulo}"? Podera restaurar depois.`}
            confirmLabel="Arquivar"
            cancelLabel="Cancelar"
            onCancel={() => setConfirmArchivar(null)}
            onConfirm={() => arquivarCampanha(confirmArchivar)}
          />
        ) : null}
      </div>
    </AppPrimerProvider>
  );
}
