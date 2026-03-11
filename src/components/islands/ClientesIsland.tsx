import React, { useEffect, useMemo, useState } from "react";
import { Dialog } from "../ui/primer/legacyCompat";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { registrarLog } from "../../lib/logs";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import {
  construirLinkWhatsApp,
  construirLinkWhatsAppComTexto,
  getPrimeiroNome,
} from "../../lib/whatsapp";
import { parentescoOptions } from "../../lib/parentescoOptions";
import { formatCurrencyBRL, formatDateBR, formatNumberBR } from "../../lib/format";
import { matchesCpfSearch } from "../../lib/searchNormalization";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";
import { renderTemplateText } from "../../lib/messageTemplates";
import { resolveThemeAssetMeta } from "../../lib/cards/officialLibrary";
import AlertMessage from "../ui/AlertMessage";
import ConfirmDialog from "../ui/ConfirmDialog";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import PaginationControls from "../ui/PaginationControls";
import TableActions from "../ui/TableActions";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

function titleCaseAllWords(valor: string) {
  const trimmed = (valor || "").trim();
  if (!trimmed) return "";
  return trimmed
    .split(/\s+/)
    .map((palavra) => {
      const lower = palavra.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function onlyDigits(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function isValidCnpj(value: string) {
  const digits = onlyDigits(value);
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  const calc = (base: string, factors: number[]) => {
    const sum = base
      .split("")
      .reduce((acc, num, index) => acc + Number(num) * factors[index], 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };

  const d1 = calc(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return digits === `${digits.slice(0, 12)}${d1}${d2}`;
}

type Cliente = {
  id: string;
  nome: string;
  nascimento: string | null;
  cpf: string;
  tipo_pessoa?: "PF" | "PJ" | null;
  telefone: string;
  whatsapp: string | null;
  email: string | null;
  classificacao: string | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  cidade: string | null;
  estado: string | null;
  cep: string | null;
  rg: string | null;
  genero: string | null;
  nacionalidade: string | null;
  tags: string[] | null;
  tipo_cliente: string | null;
  notas: string | null;
  ativo: boolean;
  active: boolean;
  created_at: string | null;
  updated_at: string | null;
  company_id?: string | null;
};

type Acompanhante = {
  id: string;
  nome_completo: string;
  cpf: string | null;
  telefone: string | null;
  grau_parentesco: string | null;
  rg?: string | null;
  data_nascimento?: string | null;
  observacoes?: string | null;
  ativo: boolean;
};

type AvisoPreviewState = {
  cardUrl: string;
  cardPngUrl: string;
  cardSvgUrl: string;
  cardMime: "image/png" | "image/svg+xml";
  text: string;
  subject: string;
  recipientId: string;
  recipientNome: string;
  recipientTelefone: string | null;
  templateId: string;
  themeId: string;
};

const initialForm = {
  nome: "",
  nascimento: "",
  cpf: "",
  tipo_pessoa: "PF" as "PF" | "PJ",
  telefone: "",
  whatsapp: "",
  email: "",
  classificacao: "",
  endereco: "",
  numero: "",
  complemento: "",
  cidade: "",
  estado: "",
  cep: "",
  rg: "",
  genero: "",
  nacionalidade: "Brasileira",
  tags: "",
  tipo_cliente: "passageiro",
  company_id: "",
  notas: "",
  ativo: true,
  active: true,
};

export default function ClientesIsland() {
  // =====================================
  // PERMISSÕES
  // =====================================
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadPerm = loadingPerms || !ready;

  const podeVer = can("Clientes");
  const podeCriar = can("Clientes", "create");
  const podeEditar = can("Clientes", "edit");
  const podeExcluir = false;
  const exibeColunaAcoes = podeVer;
  const modoSomenteLeitura = !podeCriar && !podeEditar;

  // =====================================
  // STATES
  // =====================================
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [usoIndividual, setUsoIndividual] = useState<boolean>(false);
  const [usuariosIndividuais, setUsuariosIndividuais] = useState<string[]>([]);
  const [carregouTodos, setCarregouTodos] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalClientesDb, setTotalClientesDb] = useState(0);

  const [form, setForm] = useState(initialForm);
  const [nacionalidades, setNacionalidades] = useState<string[]>(["Brasileira"]);

  async function fetchCompanyIdViaRpc() {
    try {
      const { data, error } = await supabase.rpc("current_company_id");
      if (error) throw error;
      const cid = data ? String(data) : null;
      if (cid) setCompanyId(cid);
      return cid;
    } catch (e) {
      console.error("Erro ao resolver company_id via rpc(current_company_id):", e);
      return null;
    }
  }

  useEffect(() => {
    let active = true;

    async function loadNacionalidades() {
      try {
        const trySelect = async (select: string, order: string) =>
          supabase.from("paises").select(select).order(order, { ascending: true }).limit(500);

        // Busca apenas 'nome' da tabela 'paises' e usa como nacionalidade
        const resp = await supabase.from("paises").select("nome").order("nome", { ascending: true }).limit(500);
        let values: string[] = [];
        if (!resp.error) {
          values = (resp.data || []).map((row: any) => String(row?.nome || "").trim()).filter(Boolean);
        }
        const merged = ["Brasileira", ...values];
        const deduped = Array.from(new Set(merged.map((v) => v.trim()).filter(Boolean)));
        if (active) setNacionalidades(deduped);
      } catch (e) {
        console.warn("Não foi possível carregar nacionalidades:", e);
        if (active) setNacionalidades(["Brasileira"]);
      }
    }

    loadNacionalidades();
    return () => {
      active = false;
    };
  }, []);
  const [editId, setEditId] = useState<string | null>(null);
  const [modoVisualizacao, setModoVisualizacao] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [clienteParaExcluir, setClienteParaExcluir] = useState<Cliente | null>(null);
  const [historicoCliente, setHistoricoCliente] = useState<Cliente | null>(null);
  const [cepStatus, setCepStatus] = useState<string | null>(null);
  const [mostrarFormAcomp, setMostrarFormAcomp] = useState(false);
  const [abaFormCliente, setAbaFormCliente] = useState<"dados" | "acompanhantes">("dados");
  const [msg, setMsg] = useState<string | null>(null);
  const [mostrarFormCliente, setMostrarFormCliente] = useState(false);
  const [historicoVendas, setHistoricoVendas] = useState<
    {
      id: string;
      data_lancamento: string;
      data_embarque: string | null;
      destino_nome: string;
      destino_cidade_id?: string | null;
      destino_cidade_nome?: string;
      valor_total: number;
      valor_taxas: number;
      produtos?: string[];
      origem_vinculo?: "titular" | "passageiro";
    }[]
  >([]);
  const [historicoOrcamentos, setHistoricoOrcamentos] = useState<
    {
      id: string;
      data_orcamento: string | null;
      status: string | null;
      valor: number | null;
      numero_venda: string | null;
      destino_nome: string | null;
      destino_cidade_nome?: string | null;
      produto_nome?: string | null;
    }[]
  >([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [detalheVenda, setDetalheVenda] = useState<{
    id: string;
    data_lancamento: string;
    data_embarque: string | null;
    destino_nome: string;
    destino_cidade_id?: string | null;
    destino_cidade_nome?: string;
    valor_total: number;
    valor_taxas: number;
  } | null>(null);
  const [detalheRecibos, setDetalheRecibos] = useState<
    {
      id?: string;
      numero_recibo: string | null;
      valor_total: number | null;
      valor_taxas: number | null;
      produto_nome: string | null;
      produto_id?: string | null;
    }[]
  >([]);
  const [carregandoRecibos, setCarregandoRecibos] = useState(false);
  const [detalheOrcamento, setDetalheOrcamento] = useState<{
    id: string;
    data_orcamento: string | null;
    status: string | null;
    destino_nome: string | null;
    valor: number | null;
    numero_venda: string | null;
  } | null>(null);
  const [templatesAviso, setTemplatesAviso] = useState<
    {
      id: string;
      nome: string;
      categoria: string | null;
      assunto: string | null;
      titulo: string;
      corpo: string;
      assinatura: string | null;
      theme_id: string | null;
      title_style?: Record<string, any> | null;
      body_style?: Record<string, any> | null;
      signature_style?: Record<string, any> | null;
      ativo: boolean;
    }[]
  >([]);
  const [themesAviso, setThemesAviso] = useState<
    { id: string; nome: string; categoria: string; asset_url: string; width_px: number; height_px: number }[]
  >([]);
  const [sendingAviso, setSendingAviso] = useState(false);
  const [erroAviso, setErroAviso] = useState<string | null>(null);
  const [msgAviso, setMsgAviso] = useState<string | null>(null);
  const [previewAviso, setPreviewAviso] = useState<AvisoPreviewState | null>(null);
  const [renderingPreviewAviso, setRenderingPreviewAviso] = useState(false);
  const [openingWhatsappAviso, setOpeningWhatsappAviso] = useState(false);
  const [modalAvisoCliente, setModalAvisoCliente] = useState<Cliente | null>(null);
  const [recipientsAviso, setRecipientsAviso] = useState<{ id: string; nome: string; telefone: string | null; email: string | null }[]>([]);
  const [formAviso, setFormAviso] = useState({
    recipientId: "",
    canal: "whatsapp" as "whatsapp" | "email",
    templateId: "",
    themeId: "",
  });

  const resumoHistoricoVendas = useMemo(() => {
    const totalViagens = historicoVendas.length;
    const totalValor = historicoVendas.reduce((acc, item) => acc + Number(item.valor_total || 0), 0);
    const totalTaxas = historicoVendas.reduce((acc, item) => acc + Number(item.valor_taxas || 0), 0);
    return { totalViagens, totalValor, totalTaxas };
  }, [historicoVendas]);

  useEffect(() => {
    let isMounted = true;

    async function resolveCompany() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const sessionUser = sessionData?.session?.user;
        const user =
          sessionUser || (await supabase.auth.getUser()).data?.user || null;
        if (!user || !isMounted) return;

        const { data, error } = await supabase
          .from("users")
          .select("company_id, uso_individual")
          .eq("id", user.id)
          .maybeSingle();
        if (!isMounted) return;
        if (error) {
          console.error("Erro ao buscar company_id dos clientes:", error);
          // Fallback: tenta resolver via RPC (security definer / row_security off)
          const cid = await fetchCompanyIdViaRpc();
          setUserId(user.id);
          if (!cid) return;
          return;
        }
        setUserId(user.id);
        setUsoIndividual(Boolean(data?.uso_individual));
        setCompanyId(data?.company_id || null);
      } catch (error) {
        console.error("Erro ao determinar company_id dos clientes:", error);
      }
    }

    resolveCompany();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function carregarUsuariosIndividuais() {
      try {
        // Regra atual (03/2026): qualquer usuário da mesma company pode ver/editar clientes.
        // Mantemos o state apenas para compatibilidade com código legado.
        if (mounted) setUsuariosIndividuais([]);
      } catch (e) {
        console.error("Erro ao carregar usuários individuais:", e);
        if (mounted) setUsuariosIndividuais([]);
      }
    }
    carregarUsuariosIndividuais();
    return () => {
      mounted = false;
    };
  }, [companyId, podeVer]);

  useEffect(() => {
    let mounted = true;
    async function carregarTemplatesAviso() {
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (!uid) return;
        const { data, error } = await supabase
          .from("user_message_templates")
          .select("id, nome, categoria, assunto, titulo, corpo, assinatura, theme_id, title_style, body_style, signature_style, ativo")
          .eq("user_id", uid)
          .eq("ativo", true)
          .order("nome");
        if (error) throw error;
        if (mounted) setTemplatesAviso((data || []) as any[]);

        const themeResp = await supabase
          .from("user_message_template_themes")
          .select("id, nome, categoria, asset_url, width_px, height_px")
          .eq("user_id", uid)
          .eq("ativo", true)
          .order("categoria")
          .order("nome");
        if (themeResp.error) throw themeResp.error;
        if (mounted) setThemesAviso((themeResp.data || []) as any[]);
      } catch (e) {
        console.error("Erro ao carregar templates de aviso:", e);
      }
    }
    if (!loadPerm && podeVer) carregarTemplatesAviso();
    return () => {
      mounted = false;
    };
  }, [loadPerm, podeVer]);

  // Acompanhantes
  const [acompanhantes, setAcompanhantes] = useState<Acompanhante[]>([]);
  const [acompLoading, setAcompLoading] = useState(false);
  const [acompErro, setAcompErro] = useState<string | null>(null);
  const [acompForm, setAcompForm] = useState({
    nome_completo: "",
    cpf: "",
    telefone: "",
    grau_parentesco: "",
    rg: "",
    data_nascimento: "",
    observacoes: "",
    ativo: true,
  });
  const [acompEditId, setAcompEditId] = useState<string | null>(null);
  const [acompSalvando, setAcompSalvando] = useState(false);
  const [acompExcluindo, setAcompExcluindo] = useState<string | null>(null);
  const [acompanhanteParaExcluir, setAcompanhanteParaExcluir] = useState<Acompanhante | null>(null);
  // =====================================
  // CARREGAR CLIENTES
  // =====================================
  async function carregar(todos = false, pageOverride?: number) {
    if (!podeVer) return;

    const cid = companyId || (await fetchCompanyIdViaRpc());
    if (!cid) return;

    try {
      setLoading(true);
      setErro(null);

      const paginaAtual = Math.max(1, pageOverride ?? page);
      const tamanhoPagina = Math.max(1, pageSize);
      const inicio = (paginaAtual - 1) * tamanhoPagina;
      const fim = inicio + tamanhoPagina - 1;

      let query = supabase
        .from("clientes")
        .select("*, company_id, created_by", { count: "exact" });

      query = query.order(todos ? "nome" : "created_at", { ascending: todos });
      if (!todos) {
        query = query.range(inicio, fim);
      }
      const { data, error, count } = await query;

      if (error) throw error;

      setClientes((data || []) as Cliente[]);
      setAcompanhantes([]);
      setAcompErro(null);
      setCarregouTodos(todos);
      if (todos) {
        setTotalClientesDb((data || []).length);
      } else {
        setTotalClientesDb(count ?? (data || []).length);
      }
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar clientes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!loadPerm && podeVer && companyId && !carregouTodos && !busca.trim()) {
      carregar(false);
    }
  }, [
    loadPerm,
    podeVer,
    companyId,
    page,
    pageSize,
    busca,
    carregouTodos,
    usoIndividual,
    userId,
    usuariosIndividuais,
  ]);
  useEffect(() => {
    if (!loadPerm && busca.trim() && !carregouTodos && podeVer && companyId) {
      setPage(1);
      carregar(true, 1);
    } else if (!loadPerm && !busca.trim() && carregouTodos && podeVer && companyId) {
      setPage(1);
      carregar(false, 1);
    }
  }, [
    busca,
    carregouTodos,
    podeVer,
    companyId,
    loadPerm,
    usoIndividual,
    userId,
    usuariosIndividuais,
  ]);

  // =====================================
  // FILTRO
  // =====================================
  const filtrados = useMemo(() => {
    if (!busca.trim()) return clientes;
    const t = busca.toLowerCase();
    return clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(t) ||
        matchesCpfSearch(c.cpf || "", busca) ||
        (c.email || "").toLowerCase().includes(t)
    );
  }, [clientes, busca]);
  const usaPaginacaoServidor = !busca.trim() && !carregouTodos;
  const totalClientes = usaPaginacaoServidor ? totalClientesDb : filtrados.length;
  const totalPaginas = Math.max(1, Math.ceil(totalClientes / Math.max(pageSize, 1)));
  const paginaAtual = Math.min(page, totalPaginas);
  const clientesExibidos = useMemo(() => {
    if (usaPaginacaoServidor) return clientes;
    const inicio = (paginaAtual - 1) * pageSize;
    return filtrados.slice(inicio, inicio + pageSize);
  }, [usaPaginacaoServidor, clientes, filtrados, paginaAtual, pageSize]);

  useEffect(() => {
    if (page > totalPaginas) {
      setPage(totalPaginas);
    }
  }, [page, totalPaginas]);

  // =====================================
  // FORM HANDLER
  // =====================================
  function handleChange(campo: string, valor: any) {
    const nextValue =
      campo === "email" && typeof valor === "string"
        ? valor.toLowerCase()
        : valor;
    setForm((prev) => ({ ...prev, [campo]: nextValue }));
  }

  function formatDocumento(value: string, tipoPessoa: "PF" | "PJ" = "PF") {
    const max = tipoPessoa === "PJ" ? 14 : 11;
    const digits = value.replace(/\D/g, "").slice(0, max);
    if (tipoPessoa === "PJ") {
      return digits
        .replace(/^(\d{2})(\d)/, "$1.$2")
        .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
        .replace(/\.(\d{3})(\d)/, ".$1/$2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    }
    return digits
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function formatTelefone(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 10) {
      return digits
        .replace(/(\d{2})(\d)/, "($1) $2")
        .replace(/(\d{4})(\d)/, "$1-$2");
    }
    return digits
      .replace(/(\d{2})(\d)/, "($1) $2")
      .replace(/(\d{5})(\d)/, "$1-$2");
  }

  function formatCep(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, 8);
    return digits.replace(/(\d{5})(\d)/, "$1-$2");
  }

  async function buscarCepIfNeeded(cepRaw: string) {
    const digits = (cepRaw || "").replace(/\D/g, "");
    if (digits.length !== 8) {
      setCepStatus(null);
      return;
    }
    try {
      setCepStatus("Buscando endereço...");
      const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { mode: "cors" });
      if (!resp.ok) throw new Error("CEP inválido ou indisponível.");
      const data = await resp.json();
      if (data.erro) throw new Error("CEP não encontrado.");

      setForm((prev) => ({
        ...prev,
        cep: formatCep(digits),
        endereco: data.logradouro || "",
        cidade: data.localidade || "",
        estado: data.uf || "",
      }));
      setCepStatus("Endereço carregado pelo CEP.");
    } catch (e) {
      console.error("Erro ao buscar CEP:", e);
      setCepStatus("Não foi possível carregar o CEP.");
    }
  }

  function iniciarNovo() {
    if (!podeCriar) return;
    setEditId(null);
    setForm(initialForm);
    setAcompanhantes([]);
    setAcompErro(null);
    setAcompEditId(null);
    setAbaFormCliente("dados");
    setMostrarFormAcomp(false);
    setMostrarFormCliente(false);
    setMsg(null);
  }

  function fecharFormularioCliente() {
    setMostrarFormCliente(false);
    setModoVisualizacao(false);
    setForm(initialForm);
    setEditId(null);
    setAbaFormCliente("dados");
    resetAcompForm(true);
    setMsg(null);
  }

  function fecharModalAviso() {
    setModalAvisoCliente(null);
    setRecipientsAviso([]);
    setFormAviso({
      recipientId: "",
      canal: "whatsapp",
      templateId: "",
      themeId: "",
    });
    setErroAviso(null);
    setMsgAviso(null);
    setPreviewAviso(null);
    setSendingAviso(false);
    setRenderingPreviewAviso(false);
    setOpeningWhatsappAviso(false);
  }

  async function abrirModalAviso(cliente: Cliente) {
    setErroAviso(null);
    setMsgAviso(null);
    setPreviewAviso(null);
    setModalAvisoCliente(cliente);
    const baseRecipients: { id: string; nome: string; telefone: string | null; email: string | null }[] = [
      {
        id: `cliente:${cliente.id}`,
        nome: cliente.nome,
        telefone: cliente.whatsapp || cliente.telefone || null,
        email: cliente.email || null,
      },
    ];
    try {
      const { data } = await supabase
        .from("cliente_acompanhantes")
        .select("id, nome_completo, telefone")
        .eq("cliente_id", cliente.id)
        .eq("ativo", true)
        .order("nome_completo", { ascending: true });
      (data || []).forEach((a: any) => {
        baseRecipients.push({
          id: `acomp:${a.id}`,
          nome: a.nome_completo || "Acompanhante",
          telefone: a.telefone || cliente.whatsapp || cliente.telefone || null,
          email: cliente.email || null,
        });
      });
    } catch (e) {
      console.error("Erro ao carregar acompanhantes para aviso:", e);
    }
    setRecipientsAviso(baseRecipients);
    const tplDefault = templatesAviso[0];
    setFormAviso({
      recipientId: baseRecipients[0]?.id || "",
      canal: "whatsapp",
      templateId: tplDefault?.id || "",
      themeId: tplDefault?.theme_id || "",
    });
  }

  const themesDisponiveisAviso = useMemo(() => {
    const tpl = templatesAviso.find((t) => t.id === formAviso.templateId);
    if (!tpl) return themesAviso;
    const categoria = (tpl.categoria || "").trim().toLowerCase();
    if (!categoria) return themesAviso;
    const daCategoria = themesAviso.filter((t) => (t.categoria || "").trim().toLowerCase() === categoria);
    return daCategoria.length > 0 ? daCategoria : themesAviso;
  }, [templatesAviso, themesAviso, formAviso.templateId]);

  useEffect(() => {
    const tpl = templatesAviso.find((t) => t.id === formAviso.templateId);
    if (!tpl) return;
    const fallback = tpl.theme_id || themesDisponiveisAviso[0]?.id || "";
    if (fallback && fallback !== formAviso.themeId) {
      setFormAviso((prev) => ({ ...prev, themeId: fallback }));
    }
  }, [formAviso.templateId, templatesAviso, themesDisponiveisAviso, formAviso.themeId]);

  useEffect(() => {
    setPreviewAviso(null);
    setErroAviso(null);
    setMsgAviso(null);
  }, [formAviso.recipientId, formAviso.templateId, formAviso.themeId, formAviso.canal, modalAvisoCliente?.id]);

  async function montarContextoAviso() {
    if (!modalAvisoCliente) throw new Error("Cliente não selecionado.");
    const tpl = templatesAviso.find((t) => t.id === formAviso.templateId);
    if (!tpl) throw new Error("Selecione um template.");
    const recipient = recipientsAviso.find((r) => r.id === formAviso.recipientId);
    if (!recipient) throw new Error("Selecione o destinatário.");

    const { data: authData } = await supabase.auth.getUser();
    const { data: userData } = await supabase
      .from("users")
      .select("nome_completo")
      .eq("id", authData?.user?.id || "")
      .maybeSingle();

    const assinatura = String(tpl.assinatura || userData?.nome_completo || "").trim();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    if (!origin) throw new Error("Não foi possível determinar a URL de origem.");

    const selectedThemeId = formAviso.themeId || tpl.theme_id || "";
    const selectedTheme = themesAviso.find((theme) => theme.id === selectedThemeId) || null;
    const resolvedThemeAsset = resolveThemeAssetMeta(selectedTheme);
    const nomeCard = String(recipient.nome || "Cliente").trim() || "Cliente";
    const cardParams = new URLSearchParams({
      template_id: tpl.id,
      nome: nomeCard,
      titulo: tpl.titulo || "",
      corpo: tpl.corpo || "",
      assinatura,
      v: String(Date.now()),
    });
    if (selectedThemeId) cardParams.set("theme_id", selectedThemeId);
    if (resolvedThemeAsset.asset_url) cardParams.set("theme_asset_url", resolvedThemeAsset.asset_url);
    if (resolvedThemeAsset.width_px) cardParams.set("width", String(resolvedThemeAsset.width_px));
    if (resolvedThemeAsset.height_px) cardParams.set("height", String(resolvedThemeAsset.height_px));
    if (tpl.title_style?.fontSize) cardParams.set("title_font_size", String(tpl.title_style.fontSize));
    if (tpl.title_style?.color) cardParams.set("title_color", String(tpl.title_style.color));
    if (tpl.body_style?.fontSize) cardParams.set("body_font_size", String(tpl.body_style.fontSize));
    if (tpl.body_style?.color) cardParams.set("body_color", String(tpl.body_style.color));
    if (tpl.signature_style?.fontSize) cardParams.set("signature_font_size", String(tpl.signature_style.fontSize));
    if (tpl.signature_style?.color) cardParams.set("signature_color", String(tpl.signature_style.color));
    if (tpl.signature_style?.italic !== undefined) cardParams.set("signature_italic", tpl.signature_style.italic ? "1" : "0");

    const subject = renderTemplateText(tpl.assunto || tpl.titulo || tpl.nome, {
      nomeCompleto: recipient.nome,
      assinatura,
    });
    const text = renderTemplateText(String(tpl.corpo || tpl.titulo || tpl.nome || ""), {
      nomeCompleto: recipient.nome,
      assinatura,
    });
    const cardQuery = cardParams.toString();
    const cardPngUrl = `${origin}/api/v1/cards/render.png?${cardQuery}`;
    const cardSvgUrl = `${origin}/api/v1/cards/render.svg?${cardQuery}`;
    return {
      cardPngUrl,
      cardSvgUrl,
      recipient,
      selectedThemeId,
      subject,
      text,
      templateId: tpl.id,
    };
  }

  async function validarPngServidor(cardPngUrl: string) {
    const response = await fetch(cardPngUrl, {
      method: "GET",
      headers: { Accept: "image/png" },
      cache: "no-store",
    });
    if (response.ok) {
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("image/png")) {
        return {
          ok: true as const,
        };
      }
      return {
        ok: false as const,
        reason: "not_png" as const,
        message: "A rota /render.png não retornou PNG real.",
      };
    }

    let payload: any = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
    const apiError = String(payload?.error || "").trim().toLowerCase();
    if (apiError === "png_render_unavailable" || response.status === 503) {
      return {
        ok: false as const,
        reason: "png_unavailable" as const,
        message: "PNG indisponível no runtime atual do servidor.",
      };
    }

    const textDetail = await response.text().catch(() => "");
    const detail = String(payload?.message || payload?.error || textDetail || "").trim();
    throw new Error(detail || "Falha ao renderizar cartão PNG.");
  }

  async function gerarPreviewAviso() {
    try {
      setRenderingPreviewAviso(true);
      setErroAviso(null);
      setMsgAviso(null);
      const payload = await montarContextoAviso();
      let cardUrl = payload.cardPngUrl;
      let cardMime: "image/png" | "image/svg+xml" = "image/png";
      let previewMsg = "Prévia do cartão gerada. Agora você pode copiar/baixar e abrir o WhatsApp.";

      const pngStatus = await validarPngServidor(payload.cardPngUrl);
      if (!pngStatus.ok) {
        cardUrl = payload.cardSvgUrl;
        cardMime = "image/svg+xml";
        previewMsg = "PNG indisponível no runtime atual. Prévia gerada em SVG (fiel ao template).";
      }
      setPreviewAviso({
        cardUrl,
        cardPngUrl: payload.cardPngUrl,
        cardSvgUrl: payload.cardSvgUrl,
        cardMime,
        text: payload.text,
        subject: payload.subject,
        recipientId: payload.recipient.id,
        recipientNome: payload.recipient.nome,
        recipientTelefone: payload.recipient.telefone,
        templateId: payload.templateId,
        themeId: payload.selectedThemeId,
      });
      setMsgAviso(previewMsg);
    } catch (e: any) {
      setErroAviso(e?.message || "Erro ao gerar prévia do cartão.");
    } finally {
      setRenderingPreviewAviso(false);
    }
  }

  async function abrirWhatsAppAviso() {
    try {
      setOpeningWhatsappAviso(true);
      setErroAviso(null);
      setMsgAviso(null);
      if (!previewAviso) throw new Error("Gere a prévia antes de abrir o WhatsApp.");
      const link = construirLinkWhatsAppComTexto(previewAviso.recipientTelefone, previewAviso.text);
      if (!link) throw new Error("Destinatário sem telefone/WhatsApp.");
      window.open(link, "_blank", "noopener,noreferrer");
      setMsgAviso("WhatsApp aberto com mensagem pré-preenchida.");
    } catch (e: any) {
      setErroAviso(e?.message || "Erro ao abrir WhatsApp.");
    } finally {
      setOpeningWhatsappAviso(false);
    }
  }

  async function copiarMensagemAviso() {
    try {
      setErroAviso(null);
      setMsgAviso(null);
      if (!previewAviso) throw new Error("Gere a prévia antes de copiar a mensagem.");
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(previewAviso.text);
      } else {
        const el = document.createElement("textarea");
        el.value = previewAviso.text;
        el.style.position = "fixed";
        el.style.left = "-99999px";
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
      setMsgAviso("Mensagem copiada para a área de transferência.");
    } catch (e: any) {
      setErroAviso(e?.message || "Não foi possível copiar a mensagem.");
    }
  }

  function baixarCartaoAviso() {
    if (!previewAviso) {
      setErroAviso("Gere a prévia antes de baixar o cartão.");
      return;
    }
    setErroAviso(null);
    setMsgAviso(null);
    const link = document.createElement("a");
    const slug = (getPrimeiroNome(previewAviso.recipientNome) || "cliente")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .toLowerCase();
    const ext = previewAviso.cardMime === "image/png" ? "png" : "svg";
    link.href = previewAviso.cardUrl;
    link.download = `cartao-${slug}-${Date.now()}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setMsgAviso("Download do cartão iniciado.");
  }

  function abrirCartaoAviso() {
    if (!previewAviso) {
      setErroAviso("Gere a prévia antes de abrir o cartão.");
      return;
    }
    setErroAviso(null);
    setMsgAviso(null);
    const opened = window.open(previewAviso.cardUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      setErroAviso("O navegador bloqueou a abertura da aba. Permita pop-up para este site.");
    }
  }

  async function enviarTemplateClienteEmail() {
    if (!modalAvisoCliente) return;
    try {
      setSendingAviso(true);
      setErroAviso(null);
      setMsgAviso(null);
      const payload = await montarContextoAviso();
      if (!payload.recipient.email) throw new Error("Destinatário sem e-mail.");
      const resp = await fetch("/api/clientes/templates/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId: modalAvisoCliente.id,
          templateId: payload.templateId,
          canal: "email",
          nomeDestinatario: payload.recipient.nome,
          emailDestinatario: payload.recipient.email,
          themeId: payload.selectedThemeId || null,
          subject: payload.subject,
        }),
      });
      if (!resp.ok) {
        const msgErr = await resp.text().catch(() => "");
        throw new Error(msgErr || "Falha no envio por e-mail.");
      }
      setMsgAviso("E-mail enviado com sucesso.");
    } catch (e: any) {
      setErroAviso(e?.message || "Erro ao enviar e-mail.");
    } finally {
      setSendingAviso(false);
    }
  }

  async function abrirHistorico(cliente: Cliente) {
    setHistoricoCliente(cliente);
    setLoadingHistorico(true);
    const cidadesMap: Record<string, string> = {};
    const produtoIdsSet: Set<string> = new Set();
    try {
      const { data: viagens } = await supabase
        .from("historico_viagens_real")
        .select("id, data_viagem, valor_total, notas, destinos:produtos!destino_id (nome)")
        .eq("cliente_id", cliente.id)
        .order("data_viagem", { ascending: false });

      const viagensFmt =
        viagens?.map((v: any) => ({
          id: v.id,
          data_viagem: v.data_viagem,
          destino_nome: v.destinos?.nome || "",
          valor_total: v.valor_total ?? null,
          notas: v.notas || null,
        })) || [];

      // Vendas e recibos (titular + passageiro vinculado em viagem_passageiros)
      const { data: viagensComoPassageiro } = await supabase
        .from("viagem_passageiros")
        .select("viagem_id")
        .eq("cliente_id", cliente.id);

      const viagemIdsPassageiro = Array.from(
        new Set(
          (viagensComoPassageiro || [])
            .map((row: any) => String(row?.viagem_id || "").trim())
            .filter(Boolean)
        )
      );

      let vendaIdsPassageiro: string[] = [];
      if (viagemIdsPassageiro.length > 0) {
        const { data: viagensRows } = await supabase
          .from("viagens")
          .select("id, venda_id")
          .in("id", viagemIdsPassageiro);
        vendaIdsPassageiro = Array.from(
          new Set(
            (viagensRows || [])
              .map((row: any) => String(row?.venda_id || "").trim())
              .filter(Boolean)
          )
        );
      }

      const vendaSelect =
        "id, cliente_id, data_lancamento, data_embarque, destino_id, destino_cidade_id, destinos:produtos!destino_id (nome, cidade_id)";

      const { data: vendasTitular } = await supabase
        .from("vendas")
        .select(vendaSelect)
        .eq("cliente_id", cliente.id);

      let vendasPassageiro: any[] = [];
      if (vendaIdsPassageiro.length > 0) {
        const { data: vendasPassData } = await supabase
          .from("vendas")
          .select(vendaSelect)
          .in("id", vendaIdsPassageiro);
        vendasPassageiro = vendasPassData || [];
      }

      const vendasMap = new Map<string, any>();
      (vendasTitular || []).forEach((v: any) => {
        vendasMap.set(v.id, { ...v, origem_vinculo: "titular" as const });
      });
      vendasPassageiro.forEach((v: any) => {
        if (!vendasMap.has(v.id)) vendasMap.set(v.id, { ...v, origem_vinculo: "passageiro" as const });
      });
      const vendasData = Array.from(vendasMap.values()).sort((a, b) =>
        String(b?.data_lancamento || "").localeCompare(String(a?.data_lancamento || ""))
      );

      let vendasFmt = [];
      let cidadesMap: Record<string, string> = {};

      if (vendasData.length > 0) {
        const vendaIds = vendasData.map((v: any) => v.id);
        const cidadeIds = Array.from(
          new Set(
            vendasData
              .map((v: any) => v.destino_cidade_id || v.destinos?.cidade_id)
              .filter((id: string | null | undefined): id is string => Boolean(id))
          )
        );
        if (cidadeIds.length > 0) {
          const { data: cidadesData, error: cidadesErr } = await supabase
            .from("cidades")
            .select("id, nome")
            .in("id", cidadeIds);
          if (!cidadesErr) {
            cidadesMap = Object.fromEntries((cidadesData || []).map((c: any) => [c.id, c.nome || ""]));
          } else {
            console.error(cidadesErr);
          }
        }
        const { data: recs } = await supabase
          .from("vendas_recibos")
          .select("venda_id, valor_total, valor_taxas, produto_id")
          .in("venda_id", vendaIds);

        (recs || []).forEach((r: any) => {
          if (r.produto_id) produtoIdsSet.add(r.produto_id);
        });

        let produtosLista: any[] = [];
        let tipoProdMap: Record<string, string> = {};
        if (produtoIdsSet.size > 0) {
          const idsArr = Array.from(produtoIdsSet);
          const { data: produtosData, error: prodErr } = await supabase
            .from("produtos")
            .select("id, nome, cidade_id, tipo_produto, todas_as_cidades")
            .in("tipo_produto", idsArr);
          if (!prodErr && produtosData) produtosLista = produtosData as any[];
          else if (prodErr) console.error(prodErr);

          const { data: tiposData, error: tipoErr } = await supabase
            .from("tipo_produtos")
            .select("id, nome")
            .in("id", idsArr);
          if (!tipoErr && tiposData) {
            tipoProdMap = Object.fromEntries(
              (tiposData as any[]).map((t) => [t.id, t.nome || "Produto"])
            );
          } else if (tipoErr) {
            console.error(tipoErr);
          }
        }

        const resolveProdutoNome = (produtoId?: string | null, cidadeVenda?: string | null) => {
          if (!produtoId) return "";
          const candidato = produtosLista.find((p) => {
            const ehGlobal = !!p?.todas_as_cidades;
            return p.tipo_produto === produtoId && (ehGlobal || !cidadeVenda || p.cidade_id === cidadeVenda);
          });
          const tipoInfo = tipoProdMap[produtoId] || {};
          return candidato?.nome || tipoInfo || "Produto";
        };

        vendasFmt = vendasData.map((v: any) => {
          const recForVenda = (recs || []).filter((r: any) => r.venda_id === v.id);
          const total = recForVenda.reduce(
            (acc, r: any) => acc + (r.valor_total || 0),
            0
          );
          const taxas = recForVenda.reduce(
            (acc, r: any) => acc + (r.valor_taxas || 0),
            0
          );
          const cidadeVendaId = v.destino_cidade_id || v.destinos?.cidade_id || null;
          const produtosVenda = recForVenda
            .map((r: any) => resolveProdutoNome(r.produto_id, cidadeVendaId || undefined))
            .filter(Boolean);
          const cidadeVendaNome = cidadeVendaId ? cidadesMap[cidadeVendaId] || "" : "";
          return {
            id: v.id,
            data_lancamento: v.data_lancamento,
            data_embarque: v.data_embarque,
            destino_nome: v.destinos?.nome || "",
            destino_cidade_id: cidadeVendaId,
            destino_cidade_nome: cidadeVendaNome,
            valor_total: total,
            valor_taxas: taxas,
            produtos: produtosVenda,
            origem_vinculo: v.origem_vinculo || "titular",
          };
        });
      }

      const orc: any[] = [];

      const extraCidadeIds =
        orc
          ?.map((o: any) => o.destinos?.cidade_id)
          .filter((id: string | null | undefined): id is string => Boolean(id)) || [];
      const novasCidades = extraCidadeIds.filter((id) => !(id in (cidadesMap || {})));
      if (novasCidades.length > 0) {
        const { data: cidadesExtras, error: cidadeExtraErr } = await supabase
          .from("cidades")
          .select("id, nome")
          .in("id", novasCidades);
        if (!cidadeExtraErr) {
          (cidadesExtras || []).forEach((c: any) => {
            cidadesMap[c.id] = c.nome || "";
          });
        } else {
          console.error(cidadeExtraErr);
        }
      }

      const produtoIdsOrc =
        orc
          ?.map((o: any) => o.produto_id)
          .filter((id: string | null | undefined): id is string => Boolean(id)) || [];
      produtoIdsOrc.forEach((id) => produtoIdsSet.add(id as string));

      let produtosListaPorTipo: any[] = [];
      let produtosListaPorId: any[] = [];
      const produtoByIdMap: Record<string, string> = {};
      const produtoObjById: Record<string, any> = {};
      const tipoIdsSet: Set<string> = new Set();
      let tipoProdMap: Record<string, string> = {};
      if (produtoIdsSet.size > 0) {
        const idsArr = Array.from(produtoIdsSet);
        const { data: produtosData, error: prodErr } = await supabase
          .from("produtos")
          .select("id, nome, cidade_id, tipo_produto, todas_as_cidades")
          .in("tipo_produto", idsArr);
        if (!prodErr && produtosData) produtosListaPorTipo = produtosData as any[];
        else if (prodErr) console.error(prodErr);

        const { data: produtosPorId, error: prodIdErr } = await supabase
          .from("produtos")
          .select("id, nome, cidade_id, tipo_produto, todas_as_cidades")
          .in("id", idsArr);
        if (!prodIdErr && produtosPorId) {
          produtosListaPorId = produtosPorId as any[];
          produtosPorId.forEach((p: any) => {
            if (p.id) {
              produtoByIdMap[p.id] = p.nome || "Produto";
              produtoObjById[p.id] = p;
            }
            if (p.tipo_produto) tipoIdsSet.add(p.tipo_produto);
          });
        } else if (prodIdErr) {
          console.error(prodIdErr);
        }

        produtosListaPorTipo.forEach((p: any) => {
          if (p.tipo_produto) tipoIdsSet.add(p.tipo_produto);
        });
        idsArr.forEach((id) => tipoIdsSet.add(id)); // cobre caso o recibo guarde o id do tipo direto

        const { data: tiposData, error: tipoErr } = await supabase
          .from("tipo_produtos")
          .select("id, nome")
          .in("id", Array.from(tipoIdsSet));
        if (!tipoErr && tiposData) {
          tipoProdMap = Object.fromEntries(
            (tiposData as any[]).map((t) => [t.id, t.nome || "Produto"])
          );
        } else if (tipoErr) {
          console.error(tipoErr);
        }
      }

      const resolveProdutoNome = (produtoId?: string | null, cidadeVenda?: string | null) => {
        if (!produtoId) return "";
        if (produtoObjById[produtoId]) {
          const p = produtoObjById[produtoId];
          const ehGlobal = !!p?.todas_as_cidades;
          if (ehGlobal || !cidadeVenda || p.cidade_id === cidadeVenda) return p.nome || "Produto";
        }
        if (produtoByIdMap[produtoId]) return produtoByIdMap[produtoId];
        const candidato = produtosListaPorTipo.find((p) => {
          const ehGlobal = !!p?.todas_as_cidades;
          return p.tipo_produto === produtoId && (ehGlobal || !cidadeVenda || p.cidade_id === cidadeVenda);
        });
        const tipoNome = tipoProdMap[produtoId] || "Produto";
        return candidato?.nome || tipoNome;
      };

      if (vendasFmt.length > 0) {
        vendasFmt = vendasFmt.map((v) => ({
          ...v,
          produtos: (v.produtos || []).map((pid) => resolveProdutoNome(pid, v.destino_cidade_id)).filter(Boolean),
        }));
      }

      const orcFmt =
        orc?.map((o: any) => ({
          id: o.id,
          data_orcamento: o.data_orcamento,
          status: o.status,
          valor: o.valor ?? null,
          numero_venda: o.numero_venda ?? null,
          destino_nome: o.destinos?.nome || null,
          destino_cidade_nome: o.destinos?.cidade_id ? cidadesMap[o.destinos?.cidade_id] || "" : null,
          produto_nome: resolveProdutoNome(o.produto_id, o.destinos?.cidade_id),
        })) || [];

      setHistoricoVendas(vendasFmt);
      setHistoricoOrcamentos(orcFmt);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar histórico do cliente.");
    } finally {
      setLoadingHistorico(false);
      carregarAcompanhantes(cliente.id);
    }
  }

  async function carregarAcompanhantes(clienteId: string) {
    try {
      setAcompLoading(true);
      setAcompErro(null);
      const { data, error } = await supabase
        .from("cliente_acompanhantes")
        .select(
          "id, nome_completo, cpf, telefone, grau_parentesco, rg, data_nascimento, observacoes, ativo"
        )
        .eq("cliente_id", clienteId)
        .order("nome_completo", { ascending: true });
      if (error) throw error;
      setAcompanhantes((data || []) as Acompanhante[]);
    } catch (e) {
      console.error(e);
      setAcompErro("Erro ao carregar acompanhantes.");
      setAcompanhantes([]);
    } finally {
      setAcompLoading(false);
    }
  }

  function fecharHistorico() {
    setHistoricoCliente(null);
    setHistoricoVendas([]);
    setHistoricoOrcamentos([]);
    setDetalheVenda(null);
    setDetalheRecibos([]);
    setDetalheOrcamento(null);
    setAcompanhantes([]);
    setAcompErro(null);
    resetAcompForm(true);
  }

  async function verDetalheVenda(v: {
    id: string;
    data_lancamento: string;
    data_embarque: string | null;
    destino_nome: string;
    destino_cidade_id?: string | null;
    destino_cidade_nome?: string;
    valor_total: number;
    valor_taxas: number;
  }) {
    setDetalheVenda(v);
    setCarregandoRecibos(true);
    setDetalheRecibos([]);
    try {
      const { data } = await supabase
        .from("vendas_recibos")
        .select("id, numero_recibo, valor_total, valor_taxas, produto_id, data_inicio, data_fim")
        .eq("venda_id", v.id);
      const recsBase =
        (data || []).map((r: any) => ({
          id: r.id,
          numero_recibo: r.numero_recibo,
          valor_total: r.valor_total,
          valor_taxas: r.valor_taxas,
          produto_id: r.produto_id,
          produto_nome: null as string | null,
          data_inicio: r.data_inicio,
          data_fim: r.data_fim,
        })) || [];

      const produtoIds = Array.from(
        new Set(
          recsBase
            .map((r) => r.produto_id)
            .filter((id): id is string => Boolean(id))
        )
      );

      const cidadeVenda = v.destino_cidade_id || "";
      let produtosListaPorTipo: any[] = [];
      let tipoProdMap: Record<string, string> = {};

      if (produtoIds.length > 0) {
        const { data: produtosData, error: prodErr } = await supabase
          .from("produtos")
          .select("id, nome, cidade_id, tipo_produto, todas_as_cidades")
          .in("tipo_produto", produtoIds);
        if (!prodErr && produtosData) produtosListaPorTipo = produtosData as any[];
        else if (prodErr) console.error(prodErr);

        const { data: tiposData, error: tipoErr } = await supabase
          .from("tipo_produtos")
          .select("id, nome")
          .in("id", produtoIds);
        if (!tipoErr && tiposData) {
          tipoProdMap = Object.fromEntries(
            (tiposData as any[]).map((t) => [t.id, t.nome || "Produto"])
          );
        } else if (tipoErr) {
          console.error(tipoErr);
        }
      }

      const resolveProdutoNome = (produtoId?: string | null) => {
        if (!produtoId) return "";
        const candidato = produtosListaPorTipo.find((p) => {
          const ehGlobal = !!p?.todas_as_cidades;
          return p.tipo_produto === produtoId && (ehGlobal || !cidadeVenda || p.cidade_id === cidadeVenda);
        });
        const tipoNome = tipoProdMap[produtoId] || "Produto";
        return candidato?.nome || tipoNome;
      };

      setDetalheRecibos(
        recsBase.map((r) => ({
          ...r,
          produto_nome: resolveProdutoNome(r.produto_id),
        }))
      );
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar recibos da venda.");
    } finally {
      setCarregandoRecibos(false);
    }
  }

  function verDetalheOrcamento(o: {
    id: string;
    data_orcamento: string | null;
    status: string | null;
    valor: number | null;
    numero_venda: string | null;
    destino_nome: string | null;
  }) {
    setDetalheOrcamento(o);
  }

  function iniciarEdicao(c: Cliente) {
    if (!podeEditar) return;

    const tipoPessoa = c.tipo_pessoa || ((c.cpf || "").replace(/\D/g, "").length > 11 ? "PJ" : "PF");
    setEditId(c.id);
    setForm({
      nome: c.nome,
      nascimento: c.nascimento || "",
      cpf: formatDocumento(c.cpf || "", tipoPessoa),
      tipo_pessoa: tipoPessoa,
      telefone: c.telefone,
      whatsapp: c.whatsapp || "",
      email: c.email || "",
      classificacao: c.classificacao || "",
      endereco: c.endereco || "",
      numero: c.numero || "",
      complemento: c.complemento || "",
      cidade: c.cidade || "",
      estado: c.estado || "",
      cep: c.cep || "",
      rg: c.rg || "",
      genero: c.genero || "",
      nacionalidade: c.nacionalidade || "Brasileira",
      tags: (c.tags || []).join(", "),
      tipo_cliente: c.tipo_cliente || "passageiro",
      company_id: c.company_id || "",
      notas: c.notas || "",
      ativo: c.ativo,
      active: c.active,
    });
    setAbaFormCliente("dados");
    resetAcompForm(true);
    carregarAcompanhantes(c.id);
    setMostrarFormCliente(true);
  }

  function iniciarVisualizacao(c: Cliente) {
    const tipoPessoa = c.tipo_pessoa || ((c.cpf || "").replace(/\D/g, "").length > 11 ? "PJ" : "PF");
    setEditId(c.id);
    setForm({
      nome: c.nome,
      nascimento: c.nascimento || "",
      cpf: formatDocumento(c.cpf || "", tipoPessoa),
      tipo_pessoa: tipoPessoa,
      telefone: c.telefone,
      whatsapp: c.whatsapp || "",
      email: c.email || "",
      classificacao: c.classificacao || "",
      endereco: c.endereco || "",
      numero: c.numero || "",
      complemento: c.complemento || "",
      cidade: c.cidade || "",
      estado: c.estado || "",
      cep: c.cep || "",
      rg: c.rg || "",
      genero: c.genero || "",
      nacionalidade: c.nacionalidade || "Brasileira",
      tags: (c.tags || []).join(", "),
      tipo_cliente: c.tipo_cliente || "passageiro",
      company_id: c.company_id || "",
      notas: c.notas || "",
      ativo: c.ativo,
      active: c.active,
    });
    setAbaFormCliente("dados");
    resetAcompForm(true);
    carregarAcompanhantes(c.id);
    setModoVisualizacao(true);
    setMostrarFormCliente(true);
  }

  // =====================================
  // SALVAR CLIENTE
  // =====================================
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeCriar && !podeEditar) return;

    try {
      setSalvando(true);
      setErro(null);
      setMsg(null);

      const tipoPessoa = form.tipo_pessoa || "PF";
      const documentoDigits = onlyDigits(form.cpf || "");

      if (tipoPessoa === "PJ") {
        if (!isValidCnpj(documentoDigits)) {
          setErro("CNPJ inválido. Informe os 14 dígitos corretamente.");
          setMsg(null);
          setSalvando(false);
          return;
        }
      } else if (documentoDigits.length !== 11) {
        setErro("CPF inválido. Informe os 11 dígitos corretamente.");
        setMsg(null);
        setSalvando(false);
        return;
      }

      const nomeNormalizado = titleCaseWithExceptions(form.nome);

      const payload = {
        nome: nomeNormalizado,
        nascimento: form.nascimento || null,
        // Banco aceita até 14 chars neste campo; persiste sem máscara.
        cpf: documentoDigits,
        tipo_pessoa: tipoPessoa,
        telefone: form.telefone.trim(),
        whatsapp: form.whatsapp.trim() || null,
        email: form.email.trim().toLowerCase() || null,
        classificacao: form.classificacao.trim() || null,
        endereco: form.endereco.trim() || null,
        numero: form.numero.trim() || null,
        complemento: form.complemento.trim() || null,
        cidade: form.cidade.trim() || null,
        estado: form.estado.trim() || null,
        cep: form.cep.trim() || null,
        rg: form.rg.trim() || null,
        genero: tipoPessoa === "PJ" ? null : form.genero.trim() || null,
        nacionalidade: tipoPessoa === "PJ" ? null : form.nacionalidade.trim() || null,
        tags: form.tags
          ? form.tags.split(",").map((x) => x.trim())
          : [],
        tipo_cliente: form.tipo_cliente,
        notas: form.notas || null,
        ativo: form.ativo,
        active: form.active,
      };
      if (!editId) {
        // Para RLS (especialmente em uso_individual), created_by precisa bater auth.uid().
        // O state `userId` pode ainda nao ter carregado; nesse caso, consulta direto no auth.
        let createdBy = userId;
        if (!createdBy) {
          const { data: authData } = await supabase.auth.getUser();
          createdBy = authData?.user?.id || null;
        }
        if (createdBy) {
          (payload as any).created_by = createdBy;
        }
      } else {
        // Nunca envie created_by no update, pois RLS pode bloquear
        if ('created_by' in payload) {
          delete (payload as any).created_by;
        }
      }

      // Importante: o escopo de visibilidade de clientes agora é controlado por RLS
      // via tabela public.clientes_company (vínculo cliente<->empresa). Portanto,
      // nao force company_id como critério de permissão/visibilidade.

      const cid = companyId || (await fetchCompanyIdViaRpc());
      if (!cid) {
        setErro("Seu usuário precisa estar vinculado a uma empresa para salvar clientes.");
        setMsg(null);
        setSalvando(false);
        return;
      }

      if (editId) {
        // Validação: confere se o cliente existe (RLS ja garante o escopo)
        const { data: clienteExistente, error: erroBusca } = await supabase
          .from("clientes")
          .select("id, company_id, created_by")
          .eq("id", editId)
          .maybeSingle();
        if (erroBusca) throw erroBusca;
        if (!clienteExistente) {
          setErro("Você não tem permissão para editar este cliente ou ele não existe.");
          setMsg(null);
          setSalvando(false);
          return;
        }
        const { data: updated, error } = await supabase
          .from("clientes")
          .update(payload)
          .eq("id", editId)
          .select("id")
          .maybeSingle();

        if (error) throw error;
        if (!updated?.id) {
          setErro("Não foi possível atualizar o cliente (sem permissão ou nenhuma alteração aplicada).");
          setMsg(null);
          return;
        }

        await registrarLog({
          acao: "cliente_editado",
          modulo: "Clientes",
          detalhes: { id: editId, payload },
        });
      } else {
        const { error } = await supabase.from("clientes").insert(payload);

        if (error) {
          // CPF único global: se já existir em outra empresa, reutiliza o cadastro.
          if ((error as any)?.code === "23505") {
            const { data: linkedId, error: linkErr } = await supabase
              .rpc("clientes_link_by_cpf", { p_cpf: (payload as any).cpf });
            if (linkErr) throw linkErr;

            const existingId = String(linkedId || "").trim();
            if (!existingId) {
              throw error;
            }

            // Atualiza o cadastro existente com os dados informados (agora vinculado).
            const updatePayload: any = { ...payload };
            delete updatePayload.created_by;
            delete updatePayload.company_id;

            const { error: updErr } = await supabase
              .from("clientes")
              .update(updatePayload)
              .eq("id", existingId);
            if (updErr) throw updErr;
          } else {
            throw error;
          }
        }

        await registrarLog({
          acao: "cliente_criado",
          modulo: "Clientes",
          detalhes: payload,
        });
      }

      setForm(initialForm);
      setEditId(null);
      setMostrarFormCliente(false);
      setMsg(editId ? "Cliente atualizado com sucesso." : "Cliente criado com sucesso.");
      await carregar(Boolean(busca.trim()));
    } catch (e) {
      console.error(e);
      const msgErr = (e as any)?.message ? String((e as any).message) : null;
      setErro(msgErr ? `Erro ao salvar cliente: ${msgErr}` : "Erro ao salvar cliente.");
      setMsg(null);
    } finally {
      setSalvando(false);
    }
  }

  // =====================================
  // EXCLUIR CLIENTE
  // =====================================
  async function excluir(id: string) {
    if (!podeExcluir) return;

    try {
      setExcluindoId(id);

      const { error } = await supabase
        .from("clientes")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await registrarLog({
        acao: "cliente_excluido",
        modulo: "Clientes",
        detalhes: { id },
      });

      await carregar(Boolean(busca.trim()));
    } catch {
      setErro("Não foi possível excluir este cliente.");
    } finally {
      setExcluindoId(null);
    }
  }

  function solicitarExclusaoCliente(cliente: Cliente) {
    if (!podeExcluir) return;
    setClienteParaExcluir(cliente);
  }

  async function confirmarExclusaoCliente() {
    if (!clienteParaExcluir) return;
    await excluir(clienteParaExcluir.id);
    setClienteParaExcluir(null);
  }

  // =====================================
  // ACOMPANHANTES (CRUD)
  // =====================================
  function resetAcompForm(hideForm = false) {
    setAcompForm({
      nome_completo: "",
      cpf: "",
      telefone: "",
      grau_parentesco: "",
      rg: "",
      data_nascimento: "",
      observacoes: "",
      ativo: true,
    });
    setAcompEditId(null);
    if (hideForm) {
      setMostrarFormAcomp(false);
    }
  }

  function iniciarEdicaoAcomp(a: Acompanhante) {
    setAcompEditId(a.id);
    setAcompForm({
      nome_completo: a.nome_completo || "",
      cpf: a.cpf || "",
      telefone: a.telefone || "",
      grau_parentesco: a.grau_parentesco || "",
      rg: a.rg || "",
      data_nascimento: a.data_nascimento || "",
      observacoes: a.observacoes || "",
      ativo: a.ativo,
    });
    setMostrarFormAcomp(true);
  }

  async function salvarAcompanhante() {
    const clienteId = historicoCliente?.id || editId;
    const companyIdSelecionado =
      (historicoCliente as any)?.company_id ||
      form.company_id?.trim() ||
      clientes.find((c) => c.id === editId)?.company_id ||
      companyId ||
      null;

    if (!clienteId) {
      setAcompErro("Selecione um cliente antes de salvar acompanhante.");
      return;
    }
    if (!companyIdSelecionado) {
      setAcompErro("Cliente sem company_id definido para salvar acompanhante.");
      return;
    }
    const nomeNormalizado = titleCaseAllWords(acompForm.nome_completo || "");
    const payload: any = {
      cliente_id: clienteId,
      company_id: companyIdSelecionado,
      nome_completo: nomeNormalizado.trim(),
      cpf: acompForm.cpf?.trim() || null,
      telefone: acompForm.telefone?.trim() || null,
      grau_parentesco: acompForm.grau_parentesco?.trim() || null,
      rg: acompForm.rg?.trim() || null,
      data_nascimento: acompForm.data_nascimento || null,
      observacoes: acompForm.observacoes?.trim() || null,
      ativo: acompForm.ativo,
    };
    if (!payload.nome_completo) {
      setAcompErro("Informe o nome completo do acompanhante.");
      return;
    }

    try {
      setAcompSalvando(true);
      setAcompErro(null);
      if (acompEditId) {
        const { error } = await supabase
          .from("cliente_acompanhantes")
          .update(payload)
          .eq("id", acompEditId)
          .eq("cliente_id", clienteId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("cliente_acompanhantes")
          .insert(payload);
        if (error) throw error;
      }
      resetAcompForm(true);
      await carregarAcompanhantes(clienteId);
    } catch (e) {
      console.error(e);
      setAcompErro("Erro ao salvar acompanhante.");
    } finally {
      setAcompSalvando(false);
    }
  }

  async function excluirAcompanhante(id: string) {
    const clienteId = historicoCliente?.id || editId;
    if (!podeExcluir || !clienteId) return;
    try {
      setAcompExcluindo(id);
      setAcompErro(null);
      const { error } = await supabase
        .from("cliente_acompanhantes")
        .delete()
        .eq("id", id)
        .eq("cliente_id", clienteId);
      if (error) throw error;
      if (acompEditId === id) resetAcompForm(true);
      await carregarAcompanhantes(clienteId);
    } catch (e) {
      console.error(e);
      setAcompErro("Erro ao remover acompanhante.");
    } finally {
      setAcompExcluindo(null);
    }
  }

  function solicitarExclusaoAcompanhante(acompanhante: Acompanhante) {
    if (!podeExcluir) return;
    setAcompanhanteParaExcluir(acompanhante);
  }

  async function confirmarExclusaoAcompanhante() {
    if (!acompanhanteParaExcluir) return;
    await excluirAcompanhante(acompanhanteParaExcluir.id);
    setAcompanhanteParaExcluir(null);
  }

  const iniciarNovoCliente = () => {
    setForm(initialForm);
    setEditId(null);
    setAcompanhantes([]);
    setAcompErro(null);
    resetAcompForm(true);
    setAbaFormCliente("dados");
    setMsg(null);
    setMostrarFormCliente(true);
  };

  useEffect(() => {
    if (loadPerm || !podeVer) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const clienteId = params.get("id");
    if (!clienteId) return;

    let active = true;
    (async () => {
      try {
        setErro(null);
        const { data, error } = await supabase
          .from("clientes")
          .select("*, company_id, created_by")
          .eq("id", clienteId)
          .maybeSingle();
        if (error) throw error;
        if (!data) {
          if (active) setErro("Cliente não encontrado.");
          return;
        }
        if (!active) return;
        iniciarVisualizacao(data as Cliente);
        const url = new URL(window.location.href);
        url.searchParams.delete("id");
        window.history.replaceState({}, "", url.toString());
      } catch (e) {
        console.error("Erro ao carregar cliente:", e);
        if (active) setErro("Erro ao carregar cliente.");
      }
    })();

    return () => {
      active = false;
    };
  }, [loadPerm, podeVer, companyId]);

  useEffect(() => {
    if (loadPerm || modoSomenteLeitura) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("novo") !== "1") return;
    iniciarNovoCliente();
    const url = new URL(window.location.href);
    url.searchParams.delete("novo");
    window.history.replaceState({}, "", url.toString());
  }, [loadPerm, modoSomenteLeitura]);

  // =====================================
  // RESTRIÇÃO TOTAL DE MÓDULO
  // =====================================
  if (loadPerm) {
    return <LoadingUsuarioContext />;
  }

  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <div className="page-content-wrap clientes-page">
          <AppCard tone="config">
            <strong>Acesso negado ao modulo de Clientes.</strong>
          </AppCard>
        </div>
      </AppPrimerProvider>
    );
  }

  const acompanhantesCard = (
    <AppCard
      title="Acompanhantes do cliente"
      subtitle="Gerencie passageiros vinculados ao titular e mantenha os dados de viagem consolidados."
      tone="info"
      className="vtur-sales-embedded-card"
      actions={
        !modoVisualizacao && podeCriar && !mostrarFormAcomp && !acompEditId ? (
          <AppButton
            type="button"
            variant="primary"
            onClick={() => {
              resetAcompForm();
              setMostrarFormAcomp(true);
            }}
          >
            Adicionar acompanhante
          </AppButton>
        ) : undefined
      }
    >
      {acompErro && <AlertMessage variant="error" className="mb-3">{acompErro}</AlertMessage>}

      {!acompLoading && acompanhantes.length === 0 ? (
        <EmptyState
          title="Nenhum acompanhante cadastrado"
          description="Cadastre acompanhantes para reutilizar dados em orcamentos, vendas e historico."
        />
      ) : (
        <DataTable
          headers={
            <tr>
              <th>Nome</th>
              <th>CPF</th>
              <th>Telefone</th>
              <th>Parentesco</th>
              <th>Ativo</th>
              {!modoVisualizacao && (podeEditar || podeExcluir) ? (
                <th className="th-actions">Acoes</th>
              ) : null}
            </tr>
          }
          loading={acompLoading}
          loadingMessage="Carregando acompanhantes..."
          empty={false}
          colSpan={!modoVisualizacao && (podeEditar || podeExcluir) ? 6 : 5}
          className="table-mobile-cards"
        >
          {acompanhantes.map((a) => (
            <tr key={a.id}>
              <td data-label="Nome">{a.nome_completo}</td>
              <td data-label="CPF">{a.cpf || "-"}</td>
              <td data-label="Telefone">{a.telefone || "-"}</td>
              <td data-label="Parentesco">{a.grau_parentesco || "-"}</td>
              <td data-label="Ativo">{a.ativo ? "Sim" : "Nao"}</td>
              {!modoVisualizacao && (podeEditar || podeExcluir) ? (
                <td className="th-actions" data-label="Acoes">
                  <TableActions
                    actions={[
                      ...(podeEditar
                        ? [{
                            key: `editar-${a.id}`,
                            label: "Editar",
                            onClick: () => iniciarEdicaoAcomp(a),
                            variant: "ghost" as const,
                          }]
                        : []),
                      ...(podeExcluir
                        ? [{
                            key: `excluir-${a.id}`,
                            label: acompExcluindo === a.id ? "Removendo..." : "Excluir",
                            onClick: () => solicitarExclusaoAcompanhante(a),
                            disabled: acompExcluindo === a.id,
                            variant: "danger" as const,
                          }]
                        : []),
                    ]}
                  />
                </td>
              ) : null}
            </tr>
          ))}
        </DataTable>
      )}

      {!modoVisualizacao && podeCriar && (mostrarFormAcomp || acompEditId) && (
        <AppCard
          title={acompEditId ? "Editar acompanhante" : "Novo acompanhante"}
          tone="config"
          style={{ marginTop: 16 }}
        >
          <div className="vtur-form-grid vtur-form-grid-4">
            <AppField
              label="Nome completo"
              value={acompForm.nome_completo}
              onChange={(e) => setAcompForm((prev) => ({ ...prev, nome_completo: e.target.value }))}
              onBlur={(e) =>
                setAcompForm((prev) => ({
                  ...prev,
                  nome_completo: titleCaseAllWords(e.target.value || ""),
                }))
              }
            />
            <AppField
              label="CPF"
              value={acompForm.cpf}
              onChange={(e) => setAcompForm((prev) => ({ ...prev, cpf: e.target.value }))}
            />
            <AppField
              label="Telefone"
              value={acompForm.telefone}
              onChange={(e) => setAcompForm((prev) => ({ ...prev, telefone: e.target.value }))}
            />
            <AppField
              as="select"
              label="Parentesco"
              value={acompForm.grau_parentesco}
              onChange={(e) => setAcompForm((prev) => ({ ...prev, grau_parentesco: e.target.value }))}
              options={[
                { value: "", label: "Selecione" },
                ...parentescoOptions.map((opt) => ({ value: opt, label: opt })),
              ]}
            />
            <AppField
              label="RG"
              value={acompForm.rg}
              onChange={(e) => setAcompForm((prev) => ({ ...prev, rg: e.target.value }))}
            />
            <AppField
              type="date"
              label="Data nascimento"
              value={acompForm.data_nascimento}
              onFocus={selectAllInputOnFocus}
              onChange={(e) => setAcompForm((prev) => ({ ...prev, data_nascimento: e.target.value }))}
            />
            <AppField
              label="Observacoes"
              value={acompForm.observacoes}
              onChange={(e) => setAcompForm((prev) => ({ ...prev, observacoes: e.target.value }))}
            />
            <AppField
              as="select"
              label="Ativo"
              value={acompForm.ativo ? "sim" : "nao"}
              onChange={(e) => setAcompForm((prev) => ({ ...prev, ativo: e.target.value === "sim" }))}
              options={[
                { value: "sim", label: "Sim" },
                { value: "nao", label: "Nao" },
              ]}
            />
          </div>
          <div className="vtur-form-actions">
            <AppButton type="button" variant="primary" onClick={salvarAcompanhante} disabled={acompSalvando}>
              {acompSalvando ? "Salvando..." : acompEditId ? "Salvar alteracoes" : "Salvar"}
            </AppButton>
            <AppButton
              type="button"
              variant="ghost"
              onClick={() => resetAcompForm(true)}
              disabled={acompSalvando}
            >
              Cancelar
            </AppButton>
          </div>
        </AppCard>
      )}
    </AppCard>
  );

  // =====================================
  // UI
  // =====================================
  return (
    <AppPrimerProvider>
    <div className={`page-content-wrap clientes-page${podeCriar ? " has-mobile-actionbar" : ""}`}>

      {/* FORMULÁRIO */}
      {mostrarFormCliente && (
        <AppCard
          title={modoVisualizacao ? "Visualizar cliente" : editId ? "Editar cliente" : "Novo cliente"}
          subtitle="Centralize dados cadastrais, contato, endereco e acompanhantes em um unico fluxo do CRM."
          tone="info"
          actions={
            editId ? (
              <div className="vtur-form-actions" style={{ marginTop: 0 }}>
                <AppButton
                  type="button"
                  variant={abaFormCliente === "dados" ? "primary" : "ghost"}
                  onClick={() => setAbaFormCliente("dados")}
                >
                  Dados do cliente
                </AppButton>
                <AppButton
                  type="button"
                  variant={abaFormCliente === "acompanhantes" ? "primary" : "ghost"}
                  onClick={() => setAbaFormCliente("acompanhantes")}
                >
                  Acompanhantes
                </AppButton>
              </div>
            ) : undefined
          }
        >
          {(!editId || abaFormCliente === "dados") && (
          <form onSubmit={salvar}>
            <fieldset disabled={modoVisualizacao} style={{ border: "none", padding: 0, margin: 0 }}>
            <div className="vtur-form-grid vtur-form-grid-4" style={{ marginTop: 12 }}>
              <AppField
                label="Nome completo *"
                value={form.nome || ""}
                onChange={(e) => handleChange("nome", e.target.value)}
                onBlur={(e) => handleChange("nome", titleCaseWithExceptions(e.target.value))}
                required
                wrapperClassName="md:col-span-2"
              />
              <AppField
                as="select"
                label="Tipo pessoa *"
                value={form.tipo_pessoa || "PF"}
                onChange={(e) => {
                  const tipo = (e.target.value as "PF" | "PJ") || "PF";
                  setForm((prev) => ({
                    ...prev,
                    tipo_pessoa: tipo,
                    cpf: formatDocumento(prev.cpf || "", tipo),
                    genero: tipo === "PJ" ? "" : prev.genero,
                    nacionalidade: tipo === "PJ" ? "" : prev.nacionalidade || "Brasileira",
                  }));
                }}
                options={[
                  { value: "PF", label: "Pessoa Fisica" },
                  { value: "PJ", label: "Pessoa Juridica" },
                ]}
              />
              <AppField
                label={form.tipo_pessoa === "PJ" ? "CNPJ *" : "CPF *"}
                value={form.cpf || ""}
                onChange={(e) => handleChange("cpf", formatDocumento(e.target.value, form.tipo_pessoa || "PF"))}
                required
              />
              <AppField
                label={form.tipo_pessoa === "PJ" ? "Inscricao Estadual" : "RG"}
                value={form.rg || ""}
                onChange={(e) => handleChange("rg", e.target.value)}
              />
              <AppField
                type="date"
                label={form.tipo_pessoa === "PJ" ? "Data de Fundacao" : "Nascimento"}
                value={form.nascimento || ""}
                onFocus={selectAllInputOnFocus}
                onChange={(e) => handleChange("nascimento", e.target.value)}
              />
              {form.tipo_pessoa !== "PJ" && (
                <AppField
                  as="select"
                  label="Genero"
                  value={form.genero || ""}
                  onChange={(e) => handleChange("genero", e.target.value)}
                  options={[
                    { value: "", label: "Selecione" },
                    { value: "Masculino", label: "Masculino" },
                    { value: "Feminino", label: "Feminino" },
                    { value: "Outros", label: "Outros" },
                  ]}
                />
              )}
              {form.tipo_pessoa !== "PJ" && (
                <AppField
                  label="Nacionalidade"
                  list="listaNacionalidades"
                  value={form.nacionalidade || ""}
                  onChange={(e) => handleChange("nacionalidade", e.target.value)}
                />
              )}
              {form.tipo_pessoa !== "PJ" && (
                <datalist id="listaNacionalidades">
                  {nacionalidades.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              )}
            </div>

            <div className="vtur-form-grid vtur-form-grid-4" style={{ marginTop: 12 }}>
              <AppField
                label="Telefone *"
                value={form.telefone || ""}
                onChange={(e) => handleChange("telefone", formatTelefone(e.target.value))}
              />
              <AppField
                label="Whatsapp"
                value={form.whatsapp || ""}
                onChange={(e) => handleChange("whatsapp", formatTelefone(e.target.value))}
              />
              <AppField
                label="E-mail"
                value={form.email || ""}
                onChange={(e) => handleChange("email", e.target.value)}
              />
              <AppField
                as="select"
                label="Classificacao"
                value={form.classificacao || ""}
                onChange={(e) => handleChange("classificacao", e.target.value)}
                options={[
                  { value: "", label: "Selecione" },
                  { value: "A", label: "A" },
                  { value: "B", label: "B" },
                  { value: "C", label: "C" },
                  { value: "D", label: "D" },
                  { value: "E", label: "E" },
                ]}
              />
            </div>

            <div className="vtur-form-grid vtur-form-grid-4" style={{ marginTop: 12 }}>
              <AppField
                label="CEP"
                value={form.cep || ""}
                onChange={(e) => handleChange("cep", formatCep(e.target.value))}
                onBlur={(e) => {
                  const val = formatCep(e.target.value);
                  handleChange("cep", val);
                  if (val.replace(/\D/g, "").length === 8) {
                    buscarCepIfNeeded(val);
                  } else {
                    setCepStatus(null);
                  }
                }}
                caption={cepStatus || "Preencha para auto-preencher endereco."}
              />
              <AppField
                label="Endereco"
                value={form.endereco || ""}
                onChange={(e) => handleChange("endereco", e.target.value)}
                wrapperClassName="md:col-span-2"
              />
              <AppField
                label="Numero"
                value={form.numero || ""}
                onChange={(e) => handleChange("numero", e.target.value)}
              />
              <AppField
                label="Complemento"
                value={form.complemento || ""}
                onChange={(e) => handleChange("complemento", e.target.value)}
              />
              <AppField
                label="Cidade"
                value={form.cidade || ""}
                onChange={(e) => handleChange("cidade", e.target.value)}
              />
              <AppField
                label="Estado"
                value={form.estado || ""}
                onChange={(e) => handleChange("estado", e.target.value)}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <AppField
                as="textarea"
                label="Notas"
                rows={3}
                value={form.notas || ""}
                onChange={(e) => handleChange("notas", e.target.value)}
                placeholder="Informacoes adicionais"
              />
            </div>

            </fieldset>

            <div className="vtur-form-actions">
              {modoVisualizacao ? (
                <>
                  {podeEditar && (
                    <AppButton
                      key="btn-view-editar"
                      type="button"
                      variant="primary"
                      onClick={() => setModoVisualizacao(false)}
                    >
                      Editar cliente
                    </AppButton>
                  )}
                  <AppButton
                    key="btn-view-fechar"
                    type="button"
                    variant="ghost"
                    onClick={fecharFormularioCliente}
                  >
                    Fechar
                  </AppButton>
                </>
              ) : (
                <>
                  <AppButton
                    key="btn-edit-salvar"
                    disabled={salvando}
                    type="submit"
                    variant="primary"
                  >
                    {salvando ? "Salvando..." : editId ? "Salvar alteracoes" : "Salvar"}
                  </AppButton>
                  <AppButton
                    key="btn-edit-cancelar"
                    type="button"
                    variant="ghost"
                    onClick={fecharFormularioCliente}
                    disabled={salvando}
                  >
                    Cancelar
                  </AppButton>
                </>
              )}
            </div>
          </form>
          )}
          {editId && abaFormCliente === "acompanhantes" && (
            <div style={{ marginTop: 12 }}>
              {acompanhantesCard}
            </div>
          )}
        </AppCard>
      )}

      {msg && (
        <AlertMessage variant="success" className="mb-3">
          <strong>{msg}</strong>
        </AlertMessage>
      )}

      {!mostrarFormCliente && (
        <>
          {/* BUSCA */}
          <AppToolbar
            title="Clientes"
            subtitle="Consulte, edite e acione contatos com uma visao centralizada da carteira."
            tone="info"
            sticky
            actions={
              podeCriar ? (
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={iniciarNovoCliente}
                  disabled={mostrarFormCliente}
                >
                  Adicionar cliente
                </AppButton>
              ) : undefined
            }
          >
            <div className="vtur-form-grid vtur-form-grid-2">
              <AppField
                label="Buscar cliente"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Nome, CPF/CNPJ ou e-mail"
                caption="Digite para consultar toda a carteira."
              />
            </div>
          </AppToolbar>

          {/* ERRO */}
          {erro && (
            <AlertMessage variant="error" className="mb-3">
              <strong>{erro}</strong>
            </AlertMessage>
          )}

          {!carregouTodos && !erro && (
            <AppCard tone="config" className="mb-3">
              Use a paginação para navegar. Digite na busca para filtrar todos.
            </AppCard>
          )}

          <AppCard
            title="Carteira de clientes"
            subtitle={`${totalClientes} cliente(s) no escopo atual.`}
            tone="info"
            actions={
              <PaginationControls
                page={paginaAtual}
                pageSize={pageSize}
                totalItems={totalClientes}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size);
                  setPage(1);
                }}
              />
            }
          >
          {!loading && clientesExibidos.length === 0 ? (
            <EmptyState
              title="Nenhum cliente encontrado"
              description="Ajuste a busca ou cadastre um novo cliente para iniciar a carteira."
              action={
                podeCriar ? (
                  <AppButton
                    type="button"
                    variant="primary"
                    onClick={iniciarNovoCliente}
                    disabled={mostrarFormCliente}
                  >
                    Adicionar cliente
                  </AppButton>
                ) : undefined
              }
            />
          ) : (
            <DataTable
              containerStyle={{ maxHeight: "65vh", overflowY: "auto" }}
              headers={
                <tr>
                  <th>Nome</th>
                  <th>CPF/CNPJ</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  {exibeColunaAcoes ? (
                    <th className="th-actions" style={{ textAlign: "center" }}>
                      Acoes
                    </th>
                  ) : null}
                </tr>
              }
              loading={loading}
              loadingMessage="Carregando clientes..."
              empty={false}
              colSpan={exibeColunaAcoes ? 5 : 4}
              className="clientes-table table-mobile-cards min-w-[820px]"
            >
              {clientesExibidos.map((c) => (
                <tr key={c.id}>
                  <td data-label="Nome">{c.nome}</td>
                  <td data-label="CPF/CNPJ">
                    {formatDocumento(
                      c.cpf || "",
                      c.tipo_pessoa === "PJ" || onlyDigits(c.cpf || "").length > 11 ? "PJ" : "PF"
                    )}
                  </td>
                  <td data-label="Telefone">{c.telefone}</td>
                  <td data-label="E-mail">{c.email || "-"}</td>

                  {exibeColunaAcoes ? (
                    <td className="th-actions" data-label="Acoes">
                      <TableActions
                        actions={[
                          ...(construirLinkWhatsApp(c.whatsapp)
                            ? [{
                                key: `whatsapp-${c.id}`,
                                label: "WhatsApp",
                                onClick: () => window.open(construirLinkWhatsApp(c.whatsapp) || "", "_blank", "noopener,noreferrer"),
                                variant: "ghost" as const,
                              }]
                            : []),
                          {
                            key: `historico-${c.id}`,
                            label: "Historico",
                            onClick: () => abrirHistorico(c),
                            variant: "ghost" as const,
                          },
                          {
                            key: `template-${c.id}`,
                            label: "Template",
                            onClick: () => abrirModalAviso(c),
                            variant: "ghost" as const,
                          },
                          ...(podeEditar
                            ? [{
                                key: `editar-${c.id}`,
                                label: "Editar",
                                onClick: () => iniciarEdicao(c),
                                variant: "ghost" as const,
                              }]
                            : []),
                          ...(podeExcluir
                            ? [{
                                key: `excluir-${c.id}`,
                                label: excluindoId === c.id ? "Excluindo..." : "Excluir",
                                onClick: () => solicitarExclusaoCliente(c),
                                disabled: excluindoId === c.id,
                                variant: "danger" as const,
                              }]
                            : []),
                        ]}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </DataTable>
          )}
          </AppCard>
          {podeCriar && (
            <div className="mobile-actionbar sm:hidden">
              <AppButton
                type="button"
                variant="primary"
                onClick={iniciarNovoCliente}
                disabled={mostrarFormCliente}
                block
              >
                Adicionar cliente
              </AppButton>
            </div>
          )}
        </>
      )}
    </div>
    {modalAvisoCliente && (
      <Dialog
        title="Enviar mensagem personalizada"
        width="xlarge"
        onClose={fecharModalAviso}
        footerButtons={[
          {
            content: "Cancelar",
            buttonType: "default",
            onClick: fecharModalAviso,
            disabled: sendingAviso || renderingPreviewAviso || openingWhatsappAviso,
          },
          formAviso.canal === "whatsapp"
            ? {
                content: openingWhatsappAviso ? "Abrindo..." : "Abrir WhatsApp",
                buttonType: "primary",
                onClick: abrirWhatsAppAviso,
                disabled: openingWhatsappAviso || renderingPreviewAviso || !previewAviso,
                loading: openingWhatsappAviso,
              }
            : {
                content: sendingAviso ? "Enviando..." : "Enviar e-mail",
                buttonType: "primary",
                onClick: enviarTemplateClienteEmail,
                disabled: sendingAviso || templatesAviso.length === 0,
                loading: sendingAviso,
              },
        ]}
      >
        <div className="vtur-modal-body-stack">
          <AppCard
            title={`Cliente: ${modalAvisoCliente.nome}`}
            subtitle="Monte a mensagem, selecione a arte e gere a previa operacional antes do envio."
            tone="info"
          >
            {erroAviso && <AlertMessage variant="error" className="mb-3">{erroAviso}</AlertMessage>}
            {msgAviso && <AlertMessage variant="success" className="mb-3">{msgAviso}</AlertMessage>}

            <div className="vtur-form-grid vtur-form-grid-4">
              <AppField
                as="select"
                label="Destinatario"
                value={formAviso.recipientId}
                onChange={(e) => setFormAviso((p) => ({ ...p, recipientId: e.target.value }))}
                options={recipientsAviso.map((r) => ({ value: r.id, label: r.nome }))}
              />
              <AppField
                as="select"
                label="Canal"
                value={formAviso.canal}
                onChange={(e) => setFormAviso((p) => ({ ...p, canal: e.target.value as "whatsapp" | "email" }))}
                options={[
                  { value: "whatsapp", label: "WhatsApp" },
                  { value: "email", label: "E-mail" },
                ]}
              />
              <AppField
                as="select"
                label="Template"
                value={formAviso.templateId}
                onChange={(e) => {
                  const templateId = e.target.value;
                  const tpl = templatesAviso.find((t) => t.id === templateId);
                  setFormAviso((p) => ({
                    ...p,
                    templateId,
                    themeId: tpl?.theme_id || "",
                  }));
                }}
                caption={
                  templatesAviso.length === 0
                    ? "Nenhum template ativo. Cadastre em Parametros > Avisos."
                    : undefined
                }
                options={templatesAviso.map((tpl) => ({ value: tpl.id, label: tpl.nome }))}
              />
              <AppField
                as="select"
                label="Arte"
                value={formAviso.themeId}
                onChange={(e) => setFormAviso((p) => ({ ...p, themeId: e.target.value }))}
                options={[
                  { value: "", label: "Sem arte" },
                  ...themesDisponiveisAviso.map((theme) => ({
                    value: theme.id,
                    label: `${theme.categoria} • ${theme.nome}`,
                  })),
                ]}
              />
            </div>
          </AppCard>

          <AppCard
            title="Previa operacional"
            subtitle="Mensagem renderizada e cartao usado no envio."
            tone="config"
            actions={
              <AppButton
                type="button"
                variant="secondary"
                onClick={gerarPreviewAviso}
                disabled={renderingPreviewAviso || templatesAviso.length === 0}
              >
                {renderingPreviewAviso ? "Gerando previa..." : "Gerar previa"}
              </AppButton>
            }
          >
            {previewAviso ? (
              <>
                <div className="vtur-form-grid vtur-form-grid-2">
                  <div className="form-group">
                    <label className="form-label">Mensagem pronta</label>
                    <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{previewAviso.text}</pre>
                  </div>
                  <div className="form-group">
                    <label className="form-label">
                      Cartao {previewAviso.cardMime === "image/png" ? "PNG" : "SVG"}
                    </label>
                    <img
                      src={previewAviso.cardUrl}
                      alt="Previa do cartao"
                      style={{ width: "100%", maxWidth: 260, borderRadius: 10, border: "1px solid #cbd5e1" }}
                    />
                    {previewAviso.cardMime !== "image/png" && (
                      <div className="vtur-inline-note">
                        PNG indisponivel no runtime atual. Use o SVG ou ajuste o ambiente para PNG no servidor.
                      </div>
                    )}
                  </div>
                </div>
                <div className="vtur-form-actions">
                  <AppButton type="button" variant="ghost" onClick={copiarMensagemAviso}>
                    Copiar mensagem
                  </AppButton>
                  <AppButton type="button" variant="ghost" onClick={baixarCartaoAviso}>
                    Baixar cartao
                  </AppButton>
                  <AppButton type="button" variant="ghost" onClick={abrirCartaoAviso}>
                    Abrir cartao
                  </AppButton>
                </div>
              </>
            ) : (
              <div className="vtur-inline-note">
                Clique em <strong>Gerar previa</strong> para renderizar o cartao e preparar a mensagem.
              </div>
            )}
          </AppCard>
        </div>
      </Dialog>
    )}

    {historicoCliente && (
      <Dialog
        title={`Historico de ${historicoCliente.nome}`}
        width="xlarge"
        onClose={fecharHistorico}
        footerButtons={[
          {
            content: "Fechar",
            buttonType: "primary",
            onClick: fecharHistorico,
          },
        ]}
      >
        <div className="vtur-modal-body-stack">
          {loadingHistorico ? (
            <AppCard tone="info">Carregando historico...</AppCard>
          ) : (
            <>
              {acompanhantesCard}

              <AppCard
                title="Vendas"
                subtitle={`Resumo de viagens: ${resumoHistoricoVendas.totalViagens} • Valor ${formatCurrencyBRL(
                  resumoHistoricoVendas.totalValor
                )} • Taxas ${formatCurrencyBRL(resumoHistoricoVendas.totalTaxas)}`}
                tone="info"
              >
                <DataTable
                  headers={
                    <tr>
                      <th>Data Lancamento</th>
                      <th>Destino</th>
                      <th>Embarque</th>
                      <th>Vinculo</th>
                      <th>Valor</th>
                      <th>Taxas</th>
                      <th className="th-actions" style={{ textAlign: "center" }}>Acoes</th>
                    </tr>
                  }
                  empty={historicoVendas.length === 0}
                  emptyMessage="Nenhuma venda encontrada."
                  colSpan={7}
                  className="table-mobile-cards min-w-[820px]"
                >
                  {historicoVendas.map((v) => (
                    <tr key={v.id}>
                      <td data-label="Data Lancamento">{v.data_lancamento ? formatDateBR(v.data_lancamento) : "-"}</td>
                      <td data-label="Destino">{v.destino_cidade_nome || "-"}</td>
                      <td data-label="Embarque">{v.data_embarque ? formatDateBR(v.data_embarque) : "-"}</td>
                      <td data-label="Vinculo">{v.origem_vinculo === "passageiro" ? "Passageiro" : "Titular"}</td>
                      <td data-label="Valor">{formatCurrencyBRL(v.valor_total)}</td>
                      <td data-label="Taxas">{formatCurrencyBRL(v.valor_taxas)}</td>
                      <td className="th-actions" data-label="Acoes">
                        <TableActions
                          actions={[
                            {
                              key: `detalhe-venda-${v.id}`,
                              label: "Detalhes",
                              onClick: () => verDetalheVenda(v),
                              variant: "ghost",
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </AppCard>

              <AppCard title="Orcamentos do cliente" subtitle="Orcamentos vinculados ao titular ou passageiros.">
                <DataTable
                  headers={
                    <tr>
                      <th>Data</th>
                      <th>Status</th>
                      <th>Destino</th>
                      <th>Produto</th>
                      <th>Valor</th>
                      <th>Venda</th>
                      <th className="th-actions" style={{ textAlign: "center" }}>Acoes</th>
                    </tr>
                  }
                  empty={historicoOrcamentos.length === 0}
                  emptyMessage="Nenhum orcamento encontrado."
                  colSpan={7}
                  className="table-mobile-cards min-w-[760px]"
                >
                  {historicoOrcamentos.map((o) => (
                    <tr key={o.id}>
                      <td data-label="Data">
                        {o.data_orcamento ? formatDateBR(o.data_orcamento).replaceAll("/", "-") : "-"}
                      </td>
                      <td data-label="Status" style={{ textTransform: "capitalize" }}>{o.status || "-"}</td>
                      <td data-label="Destino">{o.destino_cidade_nome || "-"}</td>
                      <td data-label="Produto">{o.produto_nome || "-"}</td>
                      <td data-label="Valor">{formatCurrencyBRL(o.valor ?? 0)}</td>
                      <td data-label="Venda">{o.numero_venda || "-"}</td>
                      <td className="th-actions" data-label="Acoes">
                        <TableActions
                          actions={[
                            {
                              key: `detalhe-orc-${o.id}`,
                              label: "Detalhes",
                              onClick: () => verDetalheOrcamento(o),
                              variant: "ghost",
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </AppCard>
            </>
          )}
        </div>
      </Dialog>
    )}

    {detalheVenda && (
      <Dialog
        title="Detalhes da venda"
        width="large"
        onClose={() => { setDetalheVenda(null); setDetalheRecibos([]); }}
        footerButtons={[
          {
            content: "Fechar",
            buttonType: "primary",
            onClick: () => { setDetalheVenda(null); setDetalheRecibos([]); },
          },
        ]}
      >
        <div className="vtur-modal-body-stack">
          <AppCard title="Resumo da venda" tone="info">
            <div className="vtur-modal-detail-grid">
              <div><strong>Recibo:</strong> {detalheRecibos.length > 0 ? detalheRecibos.map((r) => r.numero_recibo || "-").join(", ") : "—"}</div>
              <div><strong>Destino:</strong> {detalheVenda.destino_cidade_nome || "-"}</div>
              <div><strong>Lancamento:</strong> {formatDateBR(detalheVenda.data_lancamento)}</div>
              <div><strong>Embarque:</strong> {detalheVenda.data_embarque ? formatDateBR(detalheVenda.data_embarque) : "-"}</div>
              <div><strong>Valor:</strong> {formatCurrencyBRL(detalheVenda.valor_total)}</div>
              <div><strong>Taxas:</strong> {detalheVenda.valor_taxas === 0 ? "-" : formatCurrencyBRL(detalheVenda.valor_taxas)}</div>
            </div>
          </AppCard>

          <AppCard title="Recibos" subtitle="Recibos vinculados a esta venda.">
            {carregandoRecibos ? (
              <div className="vtur-inline-note">Carregando recibos...</div>
            ) : (
              <DataTable
                headers={
                  <tr>
                    <th>Numero</th>
                    <th>Produto</th>
                    <th style={{ textAlign: "center" }}>Inicio</th>
                    <th style={{ textAlign: "center" }}>Fim</th>
                    <th>Valor</th>
                    <th>Taxas</th>
                  </tr>
                }
                empty={detalheRecibos.length === 0}
                emptyMessage="Nenhum recibo encontrado."
                colSpan={6}
                className="table-mobile-cards"
              >
                {detalheRecibos.map((r, idx) => {
                  const formatarData = (value: string | null | undefined) => (value ? formatDateBR(value) : "-");
                  return (
                    <tr key={idx}>
                      <td data-label="Numero">{r.numero_recibo || "-"}</td>
                      <td data-label="Produto">{r.produto_nome || "-"}</td>
                      <td data-label="Inicio" style={{ textAlign: "center" }}>{formatarData(r.data_inicio)}</td>
                      <td data-label="Fim" style={{ textAlign: "center" }}>{formatarData(r.data_fim)}</td>
                      <td data-label="Valor">{formatCurrencyBRL(r.valor_total || 0)}</td>
                      <td data-label="Taxas">{formatCurrencyBRL(r.valor_taxas || 0)}</td>
                    </tr>
                  );
                })}
              </DataTable>
            )}
          </AppCard>
        </div>
      </Dialog>
    )}

    {detalheOrcamento && (
      <Dialog
        title="Detalhes do orcamento"
        width="medium"
        onClose={() => setDetalheOrcamento(null)}
        footerButtons={[
          {
            content: "Fechar",
            buttonType: "primary",
            onClick: () => setDetalheOrcamento(null),
          },
        ]}
      >
        <div className="vtur-modal-body-stack">
          <AppCard
            title={historicoCliente?.nome || form.nome || "-"}
            subtitle={`Status: ${detalheOrcamento.status || "-"}`}
            tone="info"
          >
            <div className="vtur-modal-detail-grid">
              <div><strong>Data:</strong> {detalheOrcamento.data_orcamento ? formatDateBR(detalheOrcamento.data_orcamento) : "-"}</div>
              <div><strong>Status:</strong> {detalheOrcamento.status || "-"}</div>
              <div><strong>Valor:</strong> {formatCurrencyBRL(detalheOrcamento.valor || 0)}</div>
              <div><strong>Venda vinculada:</strong> {detalheOrcamento.numero_venda || "-"}</div>
            </div>
          </AppCard>
        </div>
      </Dialog>
    )}
    <ConfirmDialog
      open={Boolean(clienteParaExcluir)}
      title="Excluir cliente"
      message={`Excluir ${clienteParaExcluir?.nome || "este cliente"}?`}
      confirmLabel={excluindoId ? "Excluindo..." : "Excluir"}
      confirmVariant="danger"
      confirmDisabled={Boolean(excluindoId)}
      onCancel={() => setClienteParaExcluir(null)}
      onConfirm={confirmarExclusaoCliente}
    />
    <ConfirmDialog
      open={Boolean(acompanhanteParaExcluir)}
      title="Remover acompanhante"
      message={`Remover ${acompanhanteParaExcluir?.nome_completo || "este acompanhante"}?`}
      confirmLabel={acompExcluindo ? "Removendo..." : "Remover"}
      confirmVariant="danger"
      confirmDisabled={Boolean(acompExcluindo)}
      onCancel={() => setAcompanhanteParaExcluir(null)}
      onConfirm={confirmarExclusaoAcompanhante}
    />
    </AppPrimerProvider>
  );
}
