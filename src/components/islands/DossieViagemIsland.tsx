import React, { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import { formatarDataParaExibicao } from "../../lib/formatDate";
import { formatCurrency, formatCurrencyBRL } from "../../lib/format";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";
import { construirLinkWhatsApp } from "../../lib/whatsapp";
import { parentescoOptions } from "../../lib/parentescoOptions";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

type ViagemAcompanhante = {
  id: string;
  acompanhante_id?: string | null;
  papel: string | null;
  documento_url: string | null;
  observacoes: string | null;
  cliente_acompanhantes?: {
    nome_completo?: string | null;
    cpf?: string | null;
    rg?: string | null;
    telefone?: string | null;
    grau_parentesco?: string | null;
    data_nascimento?: string | null;
  } | null;
};

type ViagemServico = {
  id: string;
  tipo: string | null;
  fornecedor: string | null;
  descricao: string | null;
  status: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  valor: number | null;
  moeda: string | null;
  voucher_url: string | null;
  observacoes: string | null;
};

type ViagemDocumento = {
  id: string;
  titulo: string | null;
  tipo: string | null;
  url: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  created_at?: string | null;
};

type ReciboVenda = {
  id: string;
  numero_recibo?: string | null;
  valor_total: number | null;
  valor_taxas: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  produto_id: string | null;
  produto_resolvido_id?: string | null;
  tipo_produtos?: { id: string; nome?: string | null; tipo?: string | null } | null;
  produto_resolvido?: { id: string; nome?: string | null } | null;
};

type ViagemResumo = {
  id: string;
  recibo_id?: string | null;
  origem: string | null;
  destino: string | null;
  status: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  observacoes: string | null;
};

type ViagemDetalhe = {
  id: string;
  company_id?: string | null;
  venda_id?: string | null;
  orcamento_id?: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: string | null;
  origem: string | null;
  destino: string | null;
  responsavel_user_id: string | null;
  responsavel?: { nome_completo?: string | null } | null;
  observacoes: string | null;
  follow_up_text?: string | null;
  follow_up_fechado?: boolean | null;
  venda?: {
    id: string;
    cliente_id: string | null;
    clientes?: { nome?: string | null; telefone?: string | null; whatsapp?: string | null } | null;
    destino_id?: string | null;
    vendas_recibos?: ReciboVenda[] | null;
  } | null;
  viagem_acompanhantes?: ViagemAcompanhante[];
  viagem_servicos?: ViagemServico[];
  viagem_documentos?: ViagemDocumento[];
};

interface Props {
  viagemId?: string;
}

const STORAGE_BUCKET = "viagens";

function sanitizeFileName(filename: string) {
  return filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseStorageRef(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("storage://")) {
    const rest = url.slice("storage://".length);
    const [bucket, ...pathParts] = rest.split("/");
    if (!bucket || pathParts.length === 0) return null;
    return { bucket, path: pathParts.join("/") };
  }
  const signedMatch = url.match(/\/storage\/v1\/object\/sign\/([^/]+)\/(.+?)(?:\?|$)/i);
  if (signedMatch) {
    return { bucket: signedMatch[1], path: decodeURIComponent(signedMatch[2]) };
  }
  const publicMatch = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/i);
  if (publicMatch) {
    return { bucket: publicMatch[1], path: decodeURIComponent(publicMatch[2]) };
  }
  if (!url.includes("://")) {
    return { bucket: STORAGE_BUCKET, path: url };
  }
  return null;
}

export default function DossieViagemIsland({ viagemId }: Props) {
  const { can, loading: loadingPerms, ready, userType, isSystemAdmin } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Operacao");
  const podeCriar = can("Operacao", "create");
  const podeExcluir = can("Operacao", "delete");

  const tipoNorm = String(userType || "").toUpperCase();
  const isAdminRole = isSystemAdmin || tipoNorm.includes("ADMIN");
  const isGestorRole = tipoNorm.includes("GESTOR");
  const isMasterRole = tipoNorm.includes("MASTER");

  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [usoIndividual, setUsoIndividual] = useState<boolean>(false);
  const deveRestringirResponsavel = usoIndividual || (!isAdminRole && !isGestorRole && !isMasterRole);

  const [viagem, setViagem] = useState<ViagemDetalhe | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [acompanhantesCliente, setAcompanhantesCliente] = useState<
    {
      id: string;
      nome_completo: string;
      cpf?: string | null;
      telefone?: string | null;
      grau_parentesco?: string | null;
      data_nascimento?: string | null;
    }[]
  >([]);
  const [novoAcomp, setNovoAcomp] = useState<{ acompanhante_id: string; papel: string; documento_url: string; observacoes: string }>({
    acompanhante_id: "",
    papel: "passageiro",
    documento_url: "",
    observacoes: "",
  });
  const [savingAcomp, setSavingAcomp] = useState(false);

  const emptyServico = {
    tipo: "aereo",
    fornecedor: "",
    descricao: "",
    status: "ativo",
    data_inicio: "",
    data_fim: "",
    valor: "",
    moeda: "BRL",
    voucher_url: "",
    observacoes: "",
  };
  const [servicoForm, setServicoForm] = useState<typeof emptyServico>(emptyServico);
  const [editServicoId, setEditServicoId] = useState<string | null>(null);
  const [savingServico, setSavingServico] = useState(false);
  const [removendoServicoId, setRemovendoServicoId] = useState<string | null>(null);

  const [docTitulo, setDocTitulo] = useState("");
  const [docTipo, setDocTipo] = useState("voucher");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [savingDoc, setSavingDoc] = useState(false);
  const [removendoDocId, setRemovendoDocId] = useState<string | null>(null);
  const [abrindoDocId, setAbrindoDocId] = useState<string | null>(null);
  const [followUpForm, setFollowUpForm] = useState({ texto: "", fechado: false });
  const [savingFollowUp, setSavingFollowUp] = useState(false);
  const [followUpFeedback, setFollowUpFeedback] = useState<string | null>(null);
  const [viagensVenda, setViagensVenda] = useState<ViagemResumo[]>([]);
  const [abaAtiva, setAbaAtiva] = useState<"dados" | "acompanhantes" | "servicos" | "documentos">("dados");
  const [mostrarCadastroAcomp, setMostrarCadastroAcomp] = useState(false);
  const [mostrarVinculoAcomp, setMostrarVinculoAcomp] = useState(false);
  const [editAcompId, setEditAcompId] = useState<string | null>(null);
  const [mostrarServicoForm, setMostrarServicoForm] = useState(false);
  const [mostrarDocumentoForm, setMostrarDocumentoForm] = useState(false);
  const [salvandoCadastroAcomp, setSalvandoCadastroAcomp] = useState(false);
  const [erroCadastroAcomp, setErroCadastroAcomp] = useState<string | null>(null);
  const [cadastroAcompForm, setCadastroAcompForm] = useState({
    nome_completo: "",
    cpf: "",
    telefone: "",
    grau_parentesco: "",
    rg: "",
    data_nascimento: "",
    observacoes: "",
    ativo: true,
  });

  const servicos = viagem?.viagem_servicos || [];
  const documentos = viagem?.viagem_documentos || [];
  const recibos = viagem?.venda?.vendas_recibos || [];
  const clienteNome = viagem?.venda?.clientes?.nome || "";
  const clienteTelefone = viagem?.venda?.clientes?.telefone || null;
  const clienteWhatsapp = viagem?.venda?.clientes?.whatsapp || null;
  const clienteWhatsappLink = construirLinkWhatsApp(clienteWhatsapp || clienteTelefone);
  const clienteBaseId = viagem?.venda?.cliente_id || null;
  const acompanhanteSelecionado = React.useMemo(
    () => acompanhantesCliente.find((a) => a.id === novoAcomp.acompanhante_id) || null,
    [acompanhantesCliente, novoAcomp.acompanhante_id]
  );
  const reciboPrincipal = React.useMemo(() => {
    const destinoId = viagem?.venda?.destino_id;
    if (!destinoId) return recibos[0] || null;
    return (
      recibos.find(
        (r) =>
          r.produto_resolvido_id === destinoId ||
          r.produto_id === destinoId ||
          r.tipo_produtos?.id === destinoId
      ) ||
      recibos[0] ||
      null
    );
  }, [recibos, viagem?.venda?.destino_id]);
  const recibosOrdenados = React.useMemo(() => {
    if (!reciboPrincipal) return recibos;
    const restantes = recibos.filter((r) => r.id !== reciboPrincipal.id);
    return [reciboPrincipal, ...restantes];
  }, [recibos, reciboPrincipal]);
  const viagemPrincipalDados = React.useMemo(() => {
    if (!reciboPrincipal) return null;
    return viagensVenda.find((v) => v.recibo_id === reciboPrincipal.id) || null;
  }, [viagensVenda, reciboPrincipal]);
  const dadosViagem = viagemPrincipalDados || viagem;
  const dataEmbarqueIso = (dadosViagem?.data_inicio || viagem?.data_inicio || "").slice(0, 10);
  const hojeIso = new Date().toISOString().slice(0, 10);
  const followUpLiberado = Boolean(dataEmbarqueIso && dataEmbarqueIso <= hojeIso);
  const followUpDisabled = !podeCriar || !followUpLiberado || savingFollowUp;
  const dataEmbarqueLabel = dataEmbarqueIso ? formatarDataParaExibicao(dataEmbarqueIso) : "";

  const applyDossiePayload = (payload: any) => {
    if (!payload) return;
    if (payload.context) {
      setUserId(payload.context.userId || null);
      setCompanyId(payload.context.companyId || null);
      setUsoIndividual(Boolean(payload.context.usoIndividual));
    }
    const detalhe = payload.viagem || null;
    setViagem(detalhe);
    setViagensVenda((payload.viagensVenda || []) as ViagemResumo[]);
    setAcompanhantesCliente(
      ((payload.acompanhantesCliente || []) as any[]).map((a) => ({
        id: a.id,
        nome_completo: a.nome_completo,
        cpf: a.cpf,
        telefone: a.telefone,
        grau_parentesco: a.grau_parentesco,
        data_nascimento: a.data_nascimento,
      }))
    );
    setFollowUpForm({
      texto: detalhe?.follow_up_text || "",
      fechado: detalhe?.follow_up_fechado ?? false,
    });
    setFollowUpFeedback(null);
  };

  const callDossieAction = async (action: string, data?: Record<string, any>) => {
    const resp = await fetch("/api/v1/viagens/dossie-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viagemId, action, data }),
    });
    if (!resp.ok) {
      throw new Error(await resp.text());
    }
    return resp.json();
  };

  function resetCadastroAcompanhante(hideForm = false) {
    setCadastroAcompForm({
      nome_completo: "",
      cpf: "",
      telefone: "",
      grau_parentesco: "",
      rg: "",
      data_nascimento: "",
      observacoes: "",
      ativo: true,
    });
    setErroCadastroAcomp(null);
    if (hideForm) {
      setMostrarCadastroAcomp(false);
    }
  }

  function resetVinculoAcompanhante(hideForm = false) {
    setNovoAcomp({ acompanhante_id: "", papel: "passageiro", documento_url: "", observacoes: "" });
    setEditAcompId(null);
    if (hideForm) {
      setMostrarVinculoAcomp(false);
    }
  }

  useEffect(() => {
    if (!viagemId) return;
    if (!loadingPerm && podeVer) {
      carregar();
    }
  }, [viagemId, loadingPerm, podeVer]);

  async function carregar() {
    if (!viagemId) return;
    try {
      setLoading(true);
      setErro(null);
      const resp = await fetch(`/api/v1/viagens/dossie?viagem_id=${viagemId}`);
      if (!resp.ok) {
        const msg = await resp.text();
        throw new Error(msg || "Erro ao carregar dossie.");
      }
      const payload = await resp.json();
      if (!payload?.viagem) {
        setErro("Viagem não encontrada ou sem permissão para acessar.");
        setViagem(null);
        setViagensVenda([]);
        return;
      }
      applyDossiePayload(payload);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar dossiê da viagem.");
      setViagem(null);
      setViagensVenda([]);
    } finally {
      setLoading(false);
    }
  }

  if (loadingPerm) {
    return <LoadingUsuarioContext />;
  }

  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">
          <strong>Você não possui acesso ao módulo de Operação/Viagens.</strong>
        </AppCard>
      </AppPrimerProvider>
    );
  }

  if (!viagemId) {
    return (
      <AppPrimerProvider>
        <EmptyState
          title="Nenhuma viagem selecionada"
          description="Selecione uma viagem para abrir o dossiê."
          action={
            <AppButton type="button" variant="primary" onClick={() => window.location.assign("/operacao/viagens")}>
              Voltar para viagens
            </AppButton>
          }
        />
      </AppPrimerProvider>
    );
  }

  function iniciarEdicaoAcompanhante(acomp: ViagemAcompanhante) {
    setEditAcompId(acomp.id);
    setNovoAcomp({
      acompanhante_id: acomp.acompanhante_id || "",
      papel: acomp.papel || "passageiro",
      documento_url: acomp.documento_url || "",
      observacoes: acomp.observacoes || "",
    });
    setMostrarVinculoAcomp(true);
    setMostrarCadastroAcomp(false);
  }

  async function adicionarAcompanhante() {
    if (!viagem || !podeCriar) return;
    if (!novoAcomp.acompanhante_id) {
      setErro("Selecione um acompanhante para vincular.");
      return;
    }
    try {
      setSavingAcomp(true);
      setErro(null);
      const payload = await callDossieAction("acompanhante_save", {
        id: editAcompId,
        acompanhante_id: novoAcomp.acompanhante_id,
        papel: novoAcomp.papel || null,
        documento_url: novoAcomp.documento_url || null,
        observacoes: novoAcomp.observacoes || null,
      });
      resetVinculoAcompanhante(true);
      applyDossiePayload(payload);
    } catch (e) {
      console.error(e);
      setErro(editAcompId ? "Erro ao atualizar acompanhante." : "Erro ao adicionar acompanhante.");
    } finally {
      setSavingAcomp(false);
    }
  }

  async function removerAcompanhante(id: string) {
    if (!podeExcluir) return;
    try {
      setSavingAcomp(true);
      setErro(null);
      const payload = await callDossieAction("acompanhante_delete", { id });
      if (editAcompId === id) {
        resetVinculoAcompanhante(true);
      }
      applyDossiePayload(payload);
    } catch (e) {
      console.error(e);
      setErro("Erro ao remover acompanhante.");
    } finally {
      setSavingAcomp(false);
    }
  }

  async function salvarCadastroAcompanhante() {
    if (!viagem || !podeCriar) return;
    if (!clienteBaseId) {
      setErroCadastroAcomp("Cliente não identificado para este dossiê.");
      return;
    }
    if (!cadastroAcompForm.nome_completo.trim()) {
      setErroCadastroAcomp("Informe o nome completo do acompanhante.");
      return;
    }
    try {
      setSalvandoCadastroAcomp(true);
      setErroCadastroAcomp(null);
      const payload = await callDossieAction("cliente_acompanhante_create", {
        cliente_id: clienteBaseId,
        nome_completo: cadastroAcompForm.nome_completo.trim(),
        cpf: cadastroAcompForm.cpf?.trim() || null,
        telefone: cadastroAcompForm.telefone?.trim() || null,
        grau_parentesco: cadastroAcompForm.grau_parentesco?.trim() || null,
        rg: cadastroAcompForm.rg?.trim() || null,
        data_nascimento: cadastroAcompForm.data_nascimento || null,
        observacoes: cadastroAcompForm.observacoes?.trim() || null,
        ativo: cadastroAcompForm.ativo,
      });
      resetCadastroAcompanhante(true);
      applyDossiePayload(payload);
    } catch (e) {
      console.error(e);
      setErroCadastroAcomp("Erro ao cadastrar acompanhante.");
    } finally {
      setSalvandoCadastroAcomp(false);
    }
  }

  function iniciarEdicaoServico(servico: ViagemServico) {
    setMostrarServicoForm(true);
    setEditServicoId(servico.id);
    setServicoForm({
      tipo: servico.tipo || "aereo",
      fornecedor: servico.fornecedor || "",
      descricao: servico.descricao || "",
      status: servico.status || "ativo",
      data_inicio: servico.data_inicio || "",
      data_fim: servico.data_fim || "",
      valor: servico.valor !== null && servico.valor !== undefined ? String(servico.valor) : "",
      moeda: servico.moeda || "BRL",
      voucher_url: servico.voucher_url || "",
      observacoes: servico.observacoes || "",
    });
  }

  function resetServico() {
    setEditServicoId(null);
    setServicoForm(emptyServico);
  }

  async function salvarServico() {
    if (!viagem) return;
    try {
      setSavingServico(true);
      setErro(null);
      const payload = await callDossieAction("servico_save", {
        id: editServicoId,
        tipo: servicoForm.tipo || "outro",
        fornecedor: servicoForm.fornecedor || null,
        descricao: servicoForm.descricao || null,
        status: servicoForm.status || null,
        data_inicio: servicoForm.data_inicio || null,
        data_fim: servicoForm.data_fim || null,
        valor: servicoForm.valor ? Number(servicoForm.valor) : null,
        moeda: servicoForm.moeda || "BRL",
        voucher_url: servicoForm.voucher_url || null,
        observacoes: servicoForm.observacoes || null,
      });
      resetServico();
      applyDossiePayload(payload);
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar serviço.");
    } finally {
      setSavingServico(false);
    }
  }

  async function removerServico(id: string) {
    if (!podeExcluir) return;
    try {
      setRemovendoServicoId(id);
      setErro(null);
      const payload = await callDossieAction("servico_delete", { id });
      if (editServicoId === id) resetServico();
      applyDossiePayload(payload);
    } catch (e) {
      console.error(e);
      setErro("Erro ao remover serviço.");
    } finally {
      setRemovendoServicoId(null);
    }
  }

  async function salvarDocumento() {
    if (!viagem) return;
    if (!docFile) {
      setErro("Selecione um arquivo para enviar.");
      return;
    }
    if (!docTitulo.trim()) {
      setErro("Informe um título para o documento.");
      return;
    }
    try {
      setSavingDoc(true);
      setErro(null);
      const safeName = sanitizeFileName(docFile.name);
      const path = `${viagem.id}/${Date.now()}-${safeName}`;
      const { data: uploadData, error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, docFile, {
          cacheControl: "3600",
          upsert: false,
          contentType: docFile.type || undefined,
          metadata: { mimetype: docFile.type || "application/octet-stream" },
        });
      if (uploadErr) throw uploadErr;
      const publicUrl =
        supabase.storage.from(STORAGE_BUCKET).getPublicUrl(uploadData.path).data.publicUrl;
      const storageRef = `storage://${STORAGE_BUCKET}/${uploadData.path}`;

      const payload = await callDossieAction("documento_create", {
        titulo: docTitulo,
        tipo: docTipo || "outro",
        url: storageRef || publicUrl,
        mime_type: docFile.type || null,
        size_bytes: docFile.size || null,
      });

      setDocTitulo("");
      setDocTipo("voucher");
      setDocFile(null);
      applyDossiePayload(payload);
    } catch (e) {
      console.error(e);
      const message =
        e instanceof Error
          ? e.message
          : "Erro ao salvar documento. Verifique se o bucket de Storage existe e é público.";
      setErro(message);
    } finally {
      setSavingDoc(false);
    }
  }

  async function salvarFollowUp() {
    if (!viagem) return;
    if (!podeCriar) return;
    if (!followUpLiberado) {
      setErro("Follow-up disponível após a data de embarque.");
      return;
    }
    try {
      setSavingFollowUp(true);
      setErro(null);
      setFollowUpFeedback(null);
      const payload = await callDossieAction("followup_save", {
        texto: followUpForm.texto.trim() || null,
        fechado: Boolean(followUpForm.fechado),
      });
      applyDossiePayload(payload);
      setFollowUpFeedback("Follow-up atualizado.");
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar follow-up.");
    } finally {
      setSavingFollowUp(false);
    }
  }

  async function removerDocumento(id: string) {
    if (!podeExcluir) return;
    try {
      setRemovendoDocId(id);
      setErro(null);
      const payload = await callDossieAction("documento_delete", { id });
      applyDossiePayload(payload);
    } catch (e) {
      console.error(e);
      setErro("Erro ao remover documento.");
    } finally {
      setRemovendoDocId(null);
    }
  }

  async function abrirDocumento(doc: ViagemDocumento) {
    if (!doc.url) return;
    const storageRef = parseStorageRef(doc.url);
    if (!storageRef) {
      window.open(doc.url, "_blank", "noreferrer");
      return;
    }
    try {
      setAbrindoDocId(doc.id);
      setErro(null);
      const { data, error } = await supabase.storage
        .from(storageRef.bucket)
        .createSignedUrl(storageRef.path, 60 * 10);
      if (error || !data?.signedUrl) {
        throw error || new Error("URL assinada indisponível.");
      }
      window.open(data.signedUrl, "_blank", "noreferrer");
    } catch (e) {
      console.error(e);
      setErro("Erro ao abrir documento. Verifique o bucket de Storage.");
    } finally {
      setAbrindoDocId(null);
    }
  }

  return (
    <AppPrimerProvider>
    <div className="page-content-wrap dossie-viagem-page">
      <AppToolbar
        tone="info"
        className="mb-3 list-toolbar-sticky hidden sm:block"
        title={clienteNome ? `Dossiê da viagem • ${clienteNome}` : "Dossiê da viagem"}
        subtitle="Acompanhe recibos, acompanhantes, serviços, documentos e follow-up."
        actions={
          <div className="mobile-stack-buttons" style={{ justifyContent: "flex-end" }}>
            <AppButton
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={() => window.location.assign("/operacao/viagens")}
            >
              Voltar
            </AppButton>
            <AppButton
              variant="primary"
              type="button"
              onClick={carregar}
              disabled={loading}
              className="w-full sm:w-auto"
            >
              {loading ? "Atualizando..." : "Atualizar"}
            </AppButton>
          </div>
        }
      >
        {clienteTelefone || clienteWhatsapp ? (
          <div style={{ display: "flex", gap: 12, fontSize: 13, color: "#475569", flexWrap: "wrap" }}>
            {clienteTelefone && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <i className="pi pi-phone" aria-hidden="true" />
                <span>{clienteTelefone}</span>
              </span>
            )}
            {clienteWhatsappLink ? (
              <a href={clienteWhatsappLink} target="_blank" rel="noreferrer" style={{ color: "#16a34a", textDecoration: "none" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <i className="pi pi-comments" aria-hidden="true" />
                  <span>{clienteWhatsapp || clienteTelefone}</span>
                </span>
              </a>
            ) : clienteWhatsapp ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <i className="pi pi-comments" aria-hidden="true" />
                <span>{clienteWhatsapp}</span>
              </span>
            ) : null}
          </div>
        ) : null}
      </AppToolbar>

      {erro && <AlertMessage variant="error">{erro}</AlertMessage>}

      {!erro && viagem && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {clienteNome && (
            <div className="vtur-surface-panel card-purple sm:hidden" style={{ padding: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#0f172a",
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                  }}
                >
                  <span style={{ color: "#1d4ed8" }}>Cliente:</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {clienteNome}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 13, color: "#475569", flexWrap: "wrap" }}>
                  {clienteTelefone && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <i className="pi pi-phone" aria-hidden="true" />
                      <span>{clienteTelefone}</span>
                    </span>
                  )}
                  {clienteWhatsappLink ? (
                    <a href={clienteWhatsappLink} target="_blank" rel="noreferrer" style={{ color: "#16a34a", textDecoration: "none" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <i className="pi pi-comments" aria-hidden="true" />
                        <span>{clienteWhatsapp || clienteTelefone}</span>
                      </span>
                    </a>
                  ) : clienteWhatsapp ? (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <i className="pi pi-comments" aria-hidden="true" />
                      <span>{clienteWhatsapp}</span>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "grid", gap: 12 }}>
              <AppButton
                type="button"
                variant="ghost"
                className="vtur-surface-panel"
                onClick={() => setAbaAtiva("dados")}
                aria-pressed={abaAtiva === "dados"}
                style={{
                  border: "1px solid #e2e8f0",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <h3
                  className="text-center sm:text-left"
                  style={{ margin: 0, color: abaAtiva === "dados" ? "#1d4ed8" : "#0f172a" }}
                >
                  Dados da viagem
                </h3>
              </AppButton>

              {abaAtiva === "dados" && (
                <div style={{ display: "grid", gap: 12 }}>
                  {recibosOrdenados.length === 0 ? (
                    <div>-</div>
                  ) : (
                    <div className="table-container overflow-x-auto">
                      <table className="table-default table-mobile-cards min-w-[720px]">
                        <thead>
                          <tr>
                            <th>Recibo</th>
                            <th>Tipo Produto</th>
                            <th>Produto</th>
                            <th>De</th>
                            <th>Até</th>
                            <th>Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recibosOrdenados.map((r) => {
                            const isPrincipal = reciboPrincipal?.id === r.id;
                            const tipoLabel = r.tipo_produtos?.nome || r.tipo_produtos?.tipo || "-";
                            const produtoNome = r.produto_resolvido?.nome || r.produto_id || "-";
                            const valorTotal =
                              r.valor_total !== null && r.valor_total !== undefined
                                ? formatCurrencyBRL(Number(r.valor_total))
                                : "-";
                            return (
                              <tr key={r.id}>
                                <td data-label="Recibo">
                                  {r.numero_recibo ? `Recibo ${r.numero_recibo}` : "Recibo"}
                                  {isPrincipal ? " (Principal)" : ""}
                                </td>
                                <td data-label="Tipo Produto">{tipoLabel || "-"}</td>
                                <td data-label="Produto">{produtoNome || "-"}</td>
                                <td data-label="De">{formatarDataParaExibicao(r.data_inicio)}</td>
                                <td data-label="Até">{formatarDataParaExibicao(r.data_fim)}</td>
                                <td data-label="Valor">{valorTotal}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="vtur-surface-panel" style={{ border: "1px solid #e2e8f0" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Follow-up do cliente</div>
                    <div style={{ color: "#64748b", fontSize: 13, marginBottom: 10 }}>
                      Parecer do cliente após o retorno da viagem.
                    </div>
                    {!followUpLiberado && (
                      <div className="vtur-warning-text" style={{ fontSize: 13, marginBottom: 10 }}>
                        Disponível após a data de embarque{dataEmbarqueLabel ? `: ${dataEmbarqueLabel}` : ""}.
                      </div>
                    )}
                    {followUpFeedback && (
                      <div style={{ color: "#166534", fontSize: 13, marginBottom: 10 }}>
                        {followUpFeedback}
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label">Follow-up</label>
                      <textarea
                        className="form-textarea"
                        value={followUpForm.texto}
                        onChange={(e) => {
                          setFollowUpForm((prev) => ({ ...prev, texto: e.target.value }));
                          setFollowUpFeedback(null);
                        }}
                        disabled={followUpDisabled}
                        placeholder="Escreva o parecer do cliente..."
                      />
                    </div>
                    <div className="followup-actions-row">
                      <div className="form-group followup-status-group">
                        <label className="form-label">Status</label>
                        <select
                          className="form-select"
                          value={followUpForm.fechado ? "fechado" : "aberto"}
                          onChange={(e) => {
                            setFollowUpForm((prev) => ({ ...prev, fechado: e.target.value === "fechado" }));
                            setFollowUpFeedback(null);
                          }}
                          disabled={followUpDisabled}
                        >
                          <option value="aberto">Aberto</option>
                          <option value="fechado">Fechado</option>
                        </select>
                      </div>
                      {podeCriar && (
                        <div className="form-group followup-action-group">
                          <AppButton
                            type="button"
                            variant="secondary"
                            className="w-full sm:w-auto"
                            onClick={salvarFollowUp}
                            disabled={followUpDisabled}
                            style={{
                              backgroundColor: "#dcfce7",
                              color: "#166534",
                              borderColor: "#86efac",
                            }}
                          >
                            {savingFollowUp ? "Salvando..." : "Salvar follow-up"}
                          </AppButton>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <AppButton
                type="button"
                variant="ghost"
                className="vtur-surface-panel"
                onClick={() => setAbaAtiva("acompanhantes")}
                aria-pressed={abaAtiva === "acompanhantes"}
                style={{
                  border: "1px solid #e2e8f0",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <h3
                  className="text-center sm:text-left"
                  style={{ margin: 0, color: abaAtiva === "acompanhantes" ? "#1d4ed8" : "#0f172a" }}
                >
                  Acompanhantes ({viagem.viagem_acompanhantes?.length || 0})
                </h3>
              </AppButton>

              {abaAtiva === "acompanhantes" && (
            <div style={{ display: "grid", gap: 12 }}>
              <div className="table-container overflow-x-auto">
                <table className="table-default table-mobile-cards min-w-[620px]">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>CPF</th>
                      <th>Nascimento</th>
                      <th>Telefone</th>
                      <th>Parentesco</th>
                      <th>Papel</th>
                      <th>Documento</th>
                      {podeExcluir && <th className="th-actions">Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(viagem.viagem_acompanhantes || []).length === 0 && (
                      <tr>
                        <td colSpan={podeExcluir ? 8 : 7}>Nenhum acompanhante vinculado.</td>
                      </tr>
                    )}
                    {(viagem.viagem_acompanhantes || []).map((a) => (
                      <tr key={a.id}>
                        <td data-label="Nome">{a.cliente_acompanhantes?.nome_completo || "-"}</td>
                        <td data-label="CPF">{a.cliente_acompanhantes?.cpf || "-"}</td>
                        <td data-label="Nascimento">
                          {a.cliente_acompanhantes?.data_nascimento
                            ? formatarDataParaExibicao(a.cliente_acompanhantes.data_nascimento)
                            : "-"}
                        </td>
                        <td data-label="Telefone">{a.cliente_acompanhantes?.telefone || "-"}</td>
                        <td data-label="Parentesco">{a.cliente_acompanhantes?.grau_parentesco || "-"}</td>
                        <td data-label="Papel">{a.papel || "-"}</td>
                        <td data-label="Documento">
                          {a.documento_url ? (
                            <AppButton type="button" variant="secondary" onClick={() => window.open(a.documento_url!, "_blank", "noopener,noreferrer")}>
                              Abrir
                            </AppButton>
                          ) : (
                            "-"
                          )}
                        </td>
                        {podeExcluir && (
                          <td className="th-actions" data-label="Ações">
                            <div className="action-buttons">
                              <AppButton
                                type="button"
                                variant="ghost"
                                icon="pi pi-pencil"
                                className="p-button-rounded p-button-sm"
                                title="Editar acompanhante"
                                aria-label="Editar acompanhante"
                                onClick={() => iniciarEdicaoAcompanhante(a)}
                                disabled={savingAcomp}
                              />
                              <AppButton
                                type="button"
                                variant="danger"
                                icon="pi pi-trash"
                                className="p-button-rounded p-button-sm"
                                title="Excluir acompanhante"
                                aria-label="Excluir acompanhante"
                                onClick={() => removerAcompanhante(a.id)}
                                disabled={savingAcomp}
                              />
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {podeCriar && (
                <div className="mobile-stack-buttons" style={{ justifyContent: "flex-start" }}>
                  <AppButton
                    type="button"
                    variant="primary"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      resetCadastroAcompanhante();
                      setMostrarCadastroAcomp(true);
                      setMostrarVinculoAcomp(false);
                    }}
                  >
                    Cadastrar acompanhante
                  </AppButton>
                  <AppButton
                    type="button"
                    variant="primary"
                    className="w-full sm:w-auto"
                    onClick={() =>
                      setMostrarVinculoAcomp((prev) => {
                        if (prev) {
                          resetVinculoAcompanhante();
                        }
                        setMostrarCadastroAcomp(false);
                        return !prev;
                      })
                    }
                  >
                    Vincular acompanhante
                  </AppButton>
                </div>
              )}

              {podeCriar && mostrarCadastroAcomp && (
                <div
                  className="vtur-surface-panel"
                  style={{ marginBottom: 12, border: "1px dashed #cbd5e1", background: "#f8fafc" }}
                >
                  {erroCadastroAcomp && (
                    <div style={{ color: "red", marginBottom: 8 }}>{erroCadastroAcomp}</div>
                  )}
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Nome completo</label>
                      <input
                        className="form-input"
                        value={cadastroAcompForm.nome_completo}
                        onChange={(e) =>
                          setCadastroAcompForm((prev) => ({
                            ...prev,
                            nome_completo: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">CPF</label>
                      <input
                        className="form-input"
                        value={cadastroAcompForm.cpf}
                        onChange={(e) =>
                          setCadastroAcompForm((prev) => ({ ...prev, cpf: e.target.value }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Telefone</label>
                      <input
                        className="form-input"
                        value={cadastroAcompForm.telefone}
                        onChange={(e) =>
                          setCadastroAcompForm((prev) => ({ ...prev, telefone: e.target.value }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Parentesco</label>
                      <select
                        className="form-select"
                        value={cadastroAcompForm.grau_parentesco}
                        onChange={(e) =>
                          setCadastroAcompForm((prev) => ({
                            ...prev,
                            grau_parentesco: e.target.value,
                          }))
                        }
                      >
                        <option value="">Selecione</option>
                        {parentescoOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">RG</label>
                      <input
                        className="form-input"
                        value={cadastroAcompForm.rg}
                        onChange={(e) =>
                          setCadastroAcompForm((prev) => ({ ...prev, rg: e.target.value }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Data nascimento</label>
                      <input
                        type="date"
                        className="form-input"
                        value={cadastroAcompForm.data_nascimento}
                        onFocus={selectAllInputOnFocus}
                        onChange={(e) =>
                          setCadastroAcompForm((prev) => ({
                            ...prev,
                            data_nascimento: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Observações</label>
                      <input
                        className="form-input"
                        value={cadastroAcompForm.observacoes}
                        onChange={(e) =>
                          setCadastroAcompForm((prev) => ({
                            ...prev,
                            observacoes: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="form-group" style={{ alignSelf: "flex-end" }}>
                      <label className="form-label">Ativo</label>
                      <input
                        type="checkbox"
                        checked={cadastroAcompForm.ativo}
                        onChange={(e) =>
                          setCadastroAcompForm((prev) => ({
                            ...prev,
                            ativo: e.target.checked,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="mobile-stack-buttons">
                    <AppButton
                      variant="secondary"
                      className="w-full sm:w-auto"
                      type="button"
                      onClick={salvarCadastroAcompanhante}
                      disabled={salvandoCadastroAcomp}
                      style={{
                        backgroundColor: "#dcfce7",
                        color: "#166534",
                        borderColor: "#86efac",
                      }}
                    >
                      {salvandoCadastroAcomp ? "Salvando..." : "Salvar acompanhante"}
                    </AppButton>
                    <AppButton
                      variant="secondary"
                      className="w-full sm:w-auto"
                      type="button"
                      onClick={() => resetCadastroAcompanhante(true)}
                      disabled={salvandoCadastroAcomp}
                      style={{
                        backgroundColor: "#fee2e2",
                        color: "#b91c1c",
                        borderColor: "#fecaca",
                      }}
                    >
                      Cancelar
                    </AppButton>
                  </div>
                </div>
              )}

              {podeCriar && mostrarVinculoAcomp && (
                <div
                  className="vtur-surface-panel"
                  style={{ marginBottom: 12, border: "1px dashed #cbd5e1", background: "#f8fafc" }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 8 }}>
                    {editAcompId ? "Editar acompanhante" : "Vincular acompanhante existente"}
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Acompanhante</label>
                      <select
                        className="form-select"
                        value={novoAcomp.acompanhante_id}
                        onChange={(e) => setNovoAcomp((prev) => ({ ...prev, acompanhante_id: e.target.value }))}
                      >
                        <option value="">Selecione</option>
                        {acompanhantesCliente.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.nome_completo}
                            {a.cpf ? ` • ${a.cpf}` : ""}
                            {a.data_nascimento ? ` • Nasc. ${formatarDataParaExibicao(a.data_nascimento)}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Data nascimento</label>
                      <input
                        type="text"
                        className="form-input"
                        value={
                          acompanhanteSelecionado?.data_nascimento
                            ? formatarDataParaExibicao(acompanhanteSelecionado.data_nascimento)
                            : ""
                        }
                        placeholder="Selecione um acompanhante"
                        readOnly
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Papel</label>
                      <select
                        className="form-select"
                        value={novoAcomp.papel}
                        onChange={(e) => setNovoAcomp((prev) => ({ ...prev, papel: e.target.value }))}
                      >
                        <option value="passageiro">Passageiro</option>
                        <option value="responsavel">Responsável</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Documento URL</label>
                      <input
                        type="url"
                        className="form-input"
                        value={novoAcomp.documento_url}
                        onChange={(e) => setNovoAcomp((prev) => ({ ...prev, documento_url: e.target.value }))}
                        placeholder="https://"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Observações</label>
                    <textarea
                      className="form-textarea"
                      value={novoAcomp.observacoes}
                      onChange={(e) => setNovoAcomp((prev) => ({ ...prev, observacoes: e.target.value }))}
                    />
                  </div>
                  <div className="mobile-stack-buttons">
                    <AppButton
                      variant="secondary"
                      className="w-full sm:w-auto"
                      type="button"
                      onClick={adicionarAcompanhante}
                      disabled={savingAcomp}
                      style={{
                        backgroundColor: "#dcfce7",
                        color: "#166534",
                        borderColor: "#86efac",
                      }}
                    >
                      {savingAcomp ? "Salvando..." : "Salvar vínculo"}
                    </AppButton>
                    <AppButton
                      variant="secondary"
                      className="w-full sm:w-auto"
                      type="button"
                      onClick={() => {
                        resetVinculoAcompanhante();
                        setMostrarVinculoAcomp(false);
                      }}
                      disabled={savingAcomp}
                      style={{
                        backgroundColor: "#fee2e2",
                        color: "#b91c1c",
                        borderColor: "#fecaca",
                      }}
                    >
                      Cancelar
                    </AppButton>
                  </div>
                </div>
              )}
            </div>
          )}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <AppButton
                type="button"
                variant="ghost"
                className="vtur-surface-panel"
                onClick={() => {
                  setAbaAtiva("servicos");
                  setMostrarServicoForm(false);
                  setEditServicoId(null);
                }}
                aria-pressed={abaAtiva === "servicos"}
                style={{
                  border: "1px solid #e2e8f0",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <h3
                  className="text-center sm:text-left"
                  style={{ margin: 0, color: abaAtiva === "servicos" ? "#1d4ed8" : "#0f172a" }}
                >
                  Serviços da viagem ({servicos.length})
                </h3>
              </AppButton>

              {abaAtiva === "servicos" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <div className="table-container overflow-x-auto">
                    <table className="table-default table-mobile-cards min-w-[720px]">
                      <thead>
                        <tr>
                          <th>Tipo</th>
                          <th>Fornecedor</th>
                          <th>Descrição</th>
                          <th>Status</th>
                          <th>De</th>
                          <th>Até</th>
                          <th>Valor</th>
                          <th>Voucher</th>
                          {podeExcluir && <th className="th-actions">Ações</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {servicos.length === 0 && (
                          <tr>
                            <td colSpan={podeExcluir ? 9 : 8}>Nenhum serviço cadastrado.</td>
                          </tr>
                        )}
                        {servicos.map((s) => (
                          <tr key={s.id}>
                            <td data-label="Tipo">{s.tipo || "-"}</td>
                            <td data-label="Fornecedor">{s.fornecedor || "-"}</td>
                            <td data-label="Descrição">{s.descricao || "-"}</td>
                            <td data-label="Status">{s.status || "-"}</td>
                            <td data-label="De">{formatarDataParaExibicao(s.data_inicio)}</td>
                            <td data-label="Até">{formatarDataParaExibicao(s.data_fim)}</td>
                            <td data-label="Valor">
                              {s.valor !== null && s.valor !== undefined
                                ? formatCurrency(Number(s.valor), s.moeda || "BRL")
                                : "-"}
                            </td>
                            <td data-label="Voucher">
                              {s.voucher_url ? (
                                <AppButton type="button" variant="secondary" onClick={() => window.open(s.voucher_url!, "_blank", "noopener,noreferrer")}>
                                  Abrir
                                </AppButton>
                              ) : (
                                "-"
                              )}
                            </td>
                            {podeExcluir && (
                              <td className="th-actions" data-label="Ações">
                                <div className="action-buttons">
                                  <AppButton
                                    variant="secondary"
                                    type="button"
                                    onClick={() => iniciarEdicaoServico(s)}
                                    title="Editar serviço"
                                    aria-label="Editar serviço"
                                  >
                                    <i className="pi pi-pencil" aria-hidden="true" />
                                  </AppButton>
                                  <AppButton
                                    variant="secondary"
                                    type="button"
                                    onClick={() => removerServico(s.id)}
                                    disabled={removendoServicoId === s.id}
                                    title={removendoServicoId === s.id ? "Removendo serviço" : "Remover serviço"}
                                    aria-label={removendoServicoId === s.id ? "Removendo serviço" : "Remover serviço"}
                                  >
                                    <i className={removendoServicoId === s.id ? "pi pi-spin pi-spinner" : "pi pi-trash"} aria-hidden="true" />
                                  </AppButton>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {podeCriar && (
                    <div className="mobile-stack-buttons" style={{ justifyContent: "flex-start" }}>
                      <AppButton
                        type="button"
                        variant="primary"
                        className="w-full sm:w-auto"
                        onClick={() => {
                          resetServico();
                          setMostrarServicoForm(true);
                        }}
                      >
                        Adicionar serviço
                      </AppButton>
                    </div>
                  )}

                  {podeCriar && mostrarServicoForm && (
                    <div
                      className="vtur-surface-panel"
                      style={{ marginBottom: 12, border: "1px dashed #cbd5e1", background: "#f8fafc" }}
                    >
                      <div style={{ fontWeight: 600, marginBottom: 8 }}>
                        {editServicoId ? "Editar serviço" : "Adicionar serviço"}
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Tipo</label>
                          <select
                            className="form-select"
                            value={servicoForm.tipo}
                            onChange={(e) => setServicoForm((prev) => ({ ...prev, tipo: e.target.value }))}
                          >
                            <option value="aereo">Aéreo</option>
                            <option value="hotel">Hotel</option>
                            <option value="terrestre">Terrestre</option>
                            <option value="seguro">Seguro</option>
                            <option value="passeio">Passeio</option>
                            <option value="outro">Outro</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Fornecedor</label>
                          <input
                            className="form-input"
                            value={servicoForm.fornecedor}
                            onChange={(e) => setServicoForm((prev) => ({ ...prev, fornecedor: e.target.value }))}
                            placeholder="Nome do fornecedor"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Status</label>
                          <select
                            className="form-select"
                            value={servicoForm.status}
                            onChange={(e) => setServicoForm((prev) => ({ ...prev, status: e.target.value }))}
                          >
                            <option value="ativo">Ativo</option>
                            <option value="pendente">Pendente</option>
                            <option value="cancelado">Cancelado</option>
                            <option value="concluido">Concluído</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Voucher URL</label>
                          <input
                            className="form-input"
                            value={servicoForm.voucher_url}
                            onChange={(e) => setServicoForm((prev) => ({ ...prev, voucher_url: e.target.value }))}
                            placeholder="https://"
                          />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Data Início</label>
                          <input
                            type="date"
                            className="form-input w-full"
                            value={servicoForm.data_inicio}
                            onFocus={selectAllInputOnFocus}
                            onChange={(e) =>
                              setServicoForm((prev) => {
                                const nextInicio = e.target.value;
                                const nextFim =
                                  prev.data_fim && nextInicio && prev.data_fim < nextInicio
                                    ? nextInicio
                                    : prev.data_fim;
                                return { ...prev, data_inicio: nextInicio, data_fim: nextFim };
                              })
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Data Final</label>
                          <input
                            type="date"
                            className="form-input"
                            value={servicoForm.data_fim}
                            min={servicoForm.data_inicio || undefined}
                            onFocus={selectAllInputOnFocus}
                            onChange={(e) =>
                              setServicoForm((prev) => {
                                const nextFim = e.target.value;
                                const boundedFim =
                                  prev.data_inicio && nextFim && nextFim < prev.data_inicio
                                    ? prev.data_inicio
                                    : nextFim;
                                return { ...prev, data_fim: boundedFim };
                              })
                            }
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Valor</label>
                          <input
                            type="number"
                            className="form-input"
                            value={servicoForm.valor}
                            onChange={(e) => setServicoForm((prev) => ({ ...prev, valor: e.target.value }))}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Moeda</label>
                          <select
                            className="form-select"
                            value={servicoForm.moeda}
                            onChange={(e) => setServicoForm((prev) => ({ ...prev, moeda: e.target.value }))}
                          >
                            <option value="BRL">BRL</option>
                            <option value="USD">USD</option>
                            <option value="EUR">EUR</option>
                          </select>
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Descrição</label>
                        <textarea
                          className="form-textarea"
                          value={servicoForm.descricao}
                          onChange={(e) => setServicoForm((prev) => ({ ...prev, descricao: e.target.value }))}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Observações</label>
                        <textarea
                          className="form-textarea"
                          value={servicoForm.observacoes}
                          onChange={(e) => setServicoForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                        />
                      </div>
                      <div className="mobile-stack-buttons">
                        <AppButton
                          variant="secondary"
                          className="w-full sm:w-auto"
                          type="button"
                          onClick={salvarServico}
                          disabled={savingServico}
                          style={{
                            backgroundColor: "#dcfce7",
                            color: "#166534",
                            borderColor: "#86efac",
                          }}
                        >
                          {savingServico ? "Salvando..." : "Salvar serviço"}
                        </AppButton>
                        <AppButton
                          variant="secondary"
                          className="w-full sm:w-auto"
                          type="button"
                          onClick={() => {
                            resetServico();
                            setMostrarServicoForm(false);
                            setEditServicoId(null);
                          }}
                          disabled={savingServico}
                          style={{
                            backgroundColor: "#fee2e2",
                            color: "#b91c1c",
                            borderColor: "#fecaca",
                          }}
                        >
                          Cancelar
                        </AppButton>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <AppButton
                type="button"
                variant="ghost"
                className="vtur-surface-panel"
                onClick={() => {
                  setAbaAtiva("documentos");
                  setMostrarDocumentoForm(false);
                }}
                aria-pressed={abaAtiva === "documentos"}
                style={{
                  border: "1px solid #e2e8f0",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <h3
                  className="text-center sm:text-left"
                  style={{ margin: 0, color: abaAtiva === "documentos" ? "#1d4ed8" : "#0f172a" }}
                >
                  Documentos / vouchers ({documentos.length})
                </h3>
              </AppButton>

              {abaAtiva === "documentos" && (
                <div style={{ display: "grid", gap: 12 }}>
                  <div className="table-container overflow-x-auto">
                    <table className="table-default table-mobile-cards min-w-[640px]">
                      <thead>
                        <tr>
                          <th>Título</th>
                          <th>Tipo</th>
                          <th>Arquivo</th>
                          <th>Tamanho</th>
                          <th>Criado em</th>
                          {podeExcluir && <th className="th-actions">Ações</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {documentos.length === 0 && (
                          <tr>
                            <td colSpan={podeExcluir ? 6 : 5}>Nenhum documento.</td>
                          </tr>
                        )}
                        {documentos.map((d) => (
                          <tr key={d.id}>
                            <td data-label="Título">{d.titulo || "-"}</td>
                            <td data-label="Tipo">{d.tipo || "-"}</td>
                            <td data-label="Arquivo">
                              {d.url ? (
                                <AppButton
                                  variant="secondary"
                                  type="button"
                                  onClick={() => abrirDocumento(d)}
                                  disabled={abrindoDocId === d.id}
                                >
                                  {abrindoDocId === d.id ? "Abrindo..." : "Abrir"}
                                </AppButton>
                              ) : (
                                "-"
                              )}
                            </td>
                            <td data-label="Tamanho">
                              {d.size_bytes
                                ? `${(Number(d.size_bytes) / 1024).toFixed(1)} KB`
                                : "-"}
                            </td>
                            <td data-label="Criado em">{formatarDataParaExibicao(d.created_at)}</td>
                            {podeExcluir && (
                              <td className="th-actions" data-label="Ações">
                                <div className="action-buttons">
                                  <AppButton
                                    variant="danger"
                                    icon="pi pi-trash"
                                    className="p-button-rounded p-button-sm"
                                    type="button"
                                    onClick={() => removerDocumento(d.id)}
                                    disabled={removendoDocId === d.id}
                                    title="Remover"
                                    aria-label="Remover documento"
                                  >
                                    {removendoDocId === d.id ? "..." : null}
                                  </AppButton>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {podeCriar && (
                    <div className="mobile-stack-buttons" style={{ justifyContent: "flex-start" }}>
                      <AppButton
                        type="button"
                        variant="primary"
                        className="w-full sm:w-auto"
                        onClick={() => setMostrarDocumentoForm(true)}
                      >
                        Enviar documento
                      </AppButton>
                    </div>
                  )}

                  {podeCriar && mostrarDocumentoForm && (
                    <div className="vtur-surface-panel mb-3 border border-dashed border-slate-300 bg-slate-50">
                      <div className="font-semibold mb-2">Enviar documento</div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Título</label>
                          <input
                            className="form-input"
                            value={docTitulo}
                            onChange={(e) => setDocTitulo(e.target.value)}
                            placeholder="Ex: Voucher do hotel"
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Tipo</label>
                          <select
                            className="form-select"
                            value={docTipo}
                            onChange={(e) => setDocTipo(e.target.value)}
                          >
                            <option value="voucher">Voucher</option>
                            <option value="bilhete">Bilhete</option>
                            <option value="roteiro">Roteiro</option>
                            <option value="seguro">Seguro</option>
                            <option value="passaporte">Passaporte</option>
                            <option value="cpf">CPF</option>
                            <option value="rg">RG</option>
                            <option value="cnh">CNH</option>
                            <option value="outro">Outro</option>
                          </select>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Arquivo</label>
                          <input
                            type="file"
                            className="form-input"
                            onChange={(e) => setDocFile(e.target.files?.[0] || null)}
                          />
                        </div>
                      </div>
                      <div className="mobile-stack-buttons">
                        <AppButton
                          variant="secondary"
                          className="w-full sm:w-auto"
                          type="button"
                          onClick={salvarDocumento}
                          disabled={savingDoc}
                          style={{
                            backgroundColor: "#dcfce7",
                            color: "#166534",
                            borderColor: "#86efac",
                          }}
                        >
                          {savingDoc ? "Enviando..." : "Enviar documento"}
                        </AppButton>
                        <AppButton
                          variant="secondary"
                          className="w-full sm:w-auto"
                          type="button"
                          onClick={() => {
                            setDocTitulo("");
                            setDocTipo("voucher");
                            setDocFile(null);
                            setMostrarDocumentoForm(false);
                          }}
                          disabled={savingDoc}
                          style={{
                            backgroundColor: "#fee2e2",
                            color: "#b91c1c",
                            borderColor: "#fecaca",
                          }}
                        >
                          Cancelar
                        </AppButton>
                      </div>
                      <div className="text-xs text-slate-500 mt-2">
                        Bucket sugerido: {STORAGE_BUCKET} (público ou via URL assinada).
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mobile-stack-buttons" style={{ justifyContent: "flex-end", marginTop: 12 }}>
            <AppButton
              type="button"
              variant="primary"
              className="w-full sm:w-auto"
              onClick={() => window.location.assign("/operacao/viagens")}
            >
              Fechar
            </AppButton>
          </div>
        </div>
      )}

      {!erro && !viagem && !loading && (
        <EmptyState
          title="Viagem não encontrada"
          description="A viagem pode não existir mais ou você não possui permissão para acessá-la."
        />
      )}
    </div>
    </AppPrimerProvider>
  );
}
