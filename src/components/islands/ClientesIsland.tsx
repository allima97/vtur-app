import React, { useEffect, useMemo, useState } from "react";
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
import ConfirmDialog from "../ui/ConfirmDialog";
import PaginationControls from "../ui/PaginationControls";

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
      <div className="card-base card-config">
        <strong>Acesso negado ao módulo de Clientes.</strong>
      </div>
    );
  }

  const acompanhantesCard = (
    <div className="card-base mb-2">
      <h4 style={{ marginBottom: 8 }}>Acompanhantes do cliente</h4>
      {acompErro && (
        <div style={{ color: "red", marginBottom: 8 }}>{acompErro}</div>
      )}
      <div className="table-container overflow-x-auto">
        <table className="table-default table-header-blue table-mobile-cards min-w-[720px]">
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF</th>
              <th>Telefone</th>
              <th>Parentesco</th>
              <th>Ativo</th>
              {!modoVisualizacao && (podeEditar || podeExcluir) && (
                <th className="th-actions">Ações</th>
              )}
            </tr>
          </thead>
          <tbody>
            {acompLoading && (
              <tr>
                <td colSpan={6}>Carregando acompanhantes...</td>
              </tr>
            )}
            {!acompLoading && acompanhantes.length === 0 && (
              <tr>
                <td colSpan={6}>Nenhum acompanhante cadastrado.</td>
              </tr>
            )}
            {!acompLoading &&
              acompanhantes.map((a) => (
                <tr key={a.id}>
                  <td data-label="Nome">{a.nome_completo}</td>
                  <td data-label="CPF">{a.cpf || "-"}</td>
                  <td data-label="Telefone">{a.telefone || "-"}</td>
                  <td data-label="Parentesco">{a.grau_parentesco || "-"}</td>
                  <td data-label="Ativo">{a.ativo ? "Sim" : "Não"}</td>
                  {!modoVisualizacao && (podeEditar || podeExcluir) && (
                    <td className="th-actions" data-label="Ações">
                      <div className="action-buttons">
                        {podeEditar && (
                          <button className="btn-icon" type="button" onClick={() => iniciarEdicaoAcomp(a)} title="Editar">
                            ✏️
                          </button>
                        )}
                        {podeExcluir && (
                          <button
                            className="btn-icon btn-danger"
                            type="button"
                            onClick={() => solicitarExclusaoAcompanhante(a)}
                            disabled={acompExcluindo === a.id}
                            title="Excluir"
                          >
                            {acompExcluindo === a.id ? "..." : "🗑️"}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!modoVisualizacao && podeCriar && (
        <div className="card-base" style={{ marginTop: 12, border: "1px dashed #cbd5e1", background: "#f8fafc" }}>
          {acompEditId && (
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Editar acompanhante</div>
          )}
          {!mostrarFormAcomp && !acompEditId && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                resetAcompForm();
                setMostrarFormAcomp(true);
              }}
            >
              Adicionar acompanhante
            </button>
          )}
          {(mostrarFormAcomp || acompEditId) && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Nome completo</label>
                  <input
                    className="form-input"
                    value={acompForm.nome_completo}
                    onChange={(e) => setAcompForm((prev) => ({ ...prev, nome_completo: e.target.value }))}
                    onBlur={(e) =>
                      setAcompForm((prev) => ({
                        ...prev,
                        nome_completo: titleCaseAllWords(e.target.value || ""),
                      }))
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">CPF</label>
                  <input
                    className="form-input"
                    value={acompForm.cpf}
                    onChange={(e) => setAcompForm((prev) => ({ ...prev, cpf: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Telefone</label>
                  <input
                    className="form-input"
                    value={acompForm.telefone}
                    onChange={(e) => setAcompForm((prev) => ({ ...prev, telefone: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Parentesco</label>
                  <select
                    className="form-select"
                    value={acompForm.grau_parentesco}
                    onChange={(e) => setAcompForm((prev) => ({ ...prev, grau_parentesco: e.target.value }))}
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
                    value={acompForm.rg}
                    onChange={(e) => setAcompForm((prev) => ({ ...prev, rg: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Data nascimento</label>
                  <input
                    type="date"
                    className="form-input"
                    value={acompForm.data_nascimento}
                    onFocus={selectAllInputOnFocus}
                    onChange={(e) => setAcompForm((prev) => ({ ...prev, data_nascimento: e.target.value }))}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Observações</label>
                  <input
                    className="form-input"
                    value={acompForm.observacoes}
                    onChange={(e) => setAcompForm((prev) => ({ ...prev, observacoes: e.target.value }))}
                  />
                </div>
                <div className="form-group" style={{ alignSelf: "flex-end" }}>
                  <label className="form-label">Ativo</label>
                  <input
                    type="checkbox"
                    checked={acompForm.ativo}
                    onChange={(e) => setAcompForm((prev) => ({ ...prev, ativo: e.target.checked }))}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary" type="button" onClick={salvarAcompanhante} disabled={acompSalvando}>
                  {acompSalvando ? "Salvando..." : acompEditId ? "Salvar alterações" : "Salvar"}
                </button>
                <button
                  className="btn btn-light"
                  type="button"
                  onClick={() => resetAcompForm(true)}
                  disabled={acompSalvando}
                >
                  Cancelar
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  // =====================================
  // UI
  // =====================================
  return (
    <>
    <div className={`clientes-page${podeCriar ? " has-mobile-actionbar" : ""}`}>

      {/* FORMULÁRIO */}
      {mostrarFormCliente && (
        <div className="card-base card-blue mb-3">
          <h3>{modoVisualizacao ? "Visualizar cliente" : editId ? "Editar cliente" : "Novo cliente"}</h3>
          {editId && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className={`btn w-full sm:w-auto ${abaFormCliente === "dados" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setAbaFormCliente("dados")}
              >
                Dados do cliente
              </button>
              <button
                type="button"
                className={`btn w-full sm:w-auto ${abaFormCliente === "acompanhantes" ? "btn-primary" : "btn-outline"}`}
                onClick={() => setAbaFormCliente("acompanhantes")}
              >
                Acompanhantes
              </button>
            </div>
          )}
          {(!editId || abaFormCliente === "dados") && (
          <form onSubmit={salvar}>
            <fieldset disabled={modoVisualizacao} style={{ border: "none", padding: 0, margin: 0 }}>
            <div
              className="form-row mobile-stack"
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns:
                  form.tipo_pessoa === "PJ"
                    ? "minmax(0, 2fr) repeat(4, minmax(0, 1fr))"
                    : "minmax(0, 2fr) repeat(6, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              <div className="form-group">
                <label className="form-label">Nome completo *</label>
                <input
                  className="form-input"
                  value={form.nome || ""}
                  onChange={(e) => handleChange("nome", e.target.value)}
                  onBlur={(e) => handleChange("nome", titleCaseWithExceptions(e.target.value))}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo pessoa *</label>
                <select
                  className="form-select"
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
                >
                  <option value="PF">Pessoa Física</option>
                  <option value="PJ">Pessoa Jurídica</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">{form.tipo_pessoa === "PJ" ? "CNPJ *" : "CPF *"}</label>
                <input
                  className="form-input"
                  value={form.cpf || ""}
                  onChange={(e) => handleChange("cpf", formatDocumento(e.target.value, form.tipo_pessoa || "PF"))}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">{form.tipo_pessoa === "PJ" ? "Inscrição Estadual" : "RG"}</label>
                <input
                  className="form-input"
                  value={form.rg || ""}
                  onChange={(e) => handleChange("rg", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  {form.tipo_pessoa === "PJ" ? "Data de Fundação" : "Nascimento"}
                </label>
                <input
                  type="date"
                  className="form-input"
                  value={form.nascimento || ""}
                  onFocus={selectAllInputOnFocus}
                  onChange={(e) => handleChange("nascimento", e.target.value)}
                />
              </div>
              {form.tipo_pessoa !== "PJ" && (
                <div className="form-group">
                  <label className="form-label">Gênero</label>
                  <select
                    className="form-select"
                    value={form.genero || ""}
                    onChange={(e) => handleChange("genero", e.target.value)}
                  >
                    <option value="">Selecione</option>
                    <option value="Masculino">Masculino</option>
                    <option value="Feminino">Feminino</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>
              )}
              {form.tipo_pessoa !== "PJ" && (
                <div className="form-group">
                  <label className="form-label">Nacionalidade</label>
                  <input
                    className="form-input"
                    list="listaNacionalidades"
                    value={form.nacionalidade || ""}
                    onChange={(e) => handleChange("nacionalidade", e.target.value)}
                  />
                  <datalist id="listaNacionalidades">
                    {nacionalidades.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
              )}
            </div>

            <div
              className="form-row mobile-stack"
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              <div className="form-group">
                <label className="form-label">Telefone *</label>
                <input
                  className="form-input"
                  value={form.telefone || ""}
                  onChange={(e) => handleChange("telefone", formatTelefone(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Whatsapp</label>
                <input
                  className="form-input"
                  value={form.whatsapp || ""}
                  onChange={(e) => handleChange("whatsapp", formatTelefone(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">E-mail</label>
                <input
                  className="form-input"
                  value={form.email || ""}
                  onChange={(e) => handleChange("email", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Classificação</label>
                <select
                  className="form-select"
                  value={form.classificacao || ""}
                  onChange={(e) => handleChange("classificacao", e.target.value)}
                >
                  <option value="">Selecione</option>
                  <option value="A" title="Cliente frequente">A</option>
                  <option value="B" title="Compra mas não é frequente">B</option>
                  <option value="C" title="Já comprou, mas não é fiel">C</option>
                  <option value="D" title="Busca preço e a maioria das vezes compra na Internet">D</option>
                  <option value="E" title="Cliente de internet, nunca compra">E</option>
                </select>
              </div>
            </div>

            <div
              className="form-row mobile-stack"
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns:
                  "minmax(0, 0.75fr) minmax(0, 1.7fr) minmax(0, 0.8fr) minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 0.9fr)",
                gap: 12,
              }}
            >
              <div className="form-group">
                <label className="form-label">CEP</label>
                <input
                  className="form-input"
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
                />
                <small style={{ color: cepStatus?.includes("Não foi") ? "#b91c1c" : "#475569" }}>
                  {cepStatus || "Preencha para auto-preencher endereço."}
                </small>
              </div>
              <div className="form-group">
                <label className="form-label">Endereço</label>
                <input
                  className="form-input"
                  value={form.endereco || ""}
                  onChange={(e) => handleChange("endereco", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Número</label>
                <input
                  className="form-input"
                  value={form.numero || ""}
                  onChange={(e) => handleChange("numero", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Complemento</label>
                <input
                  className="form-input"
                  value={form.complemento || ""}
                  onChange={(e) => handleChange("complemento", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Cidade</label>
                <input
                  className="form-input"
                  value={form.cidade || ""}
                  onChange={(e) => handleChange("cidade", e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Estado</label>
                <input
                  className="form-input"
                  value={form.estado || ""}
                  onChange={(e) => handleChange("estado", e.target.value)}
                />
              </div>
            </div>

            <div className="form-row" style={{ marginTop: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Notas</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={form.notas || ""}
                  onChange={(e) => handleChange("notas", e.target.value)}
                  placeholder="Informações adicionais"
                />
              </div>
            </div>

            </fieldset>

            <div className="mt-2 mobile-stack-buttons">
              {modoVisualizacao ? (
                <>
                  {podeEditar && (
                    <button
                      key="btn-view-editar"
                      type="button"
                      className="btn btn-primary w-full sm:w-auto"
                      onClick={() => setModoVisualizacao(false)}
                    >
                      Editar cliente
                    </button>
                  )}
                  <button
                    key="btn-view-fechar"
                    type="button"
                    className="btn btn-light w-full sm:w-auto"
                    onClick={fecharFormularioCliente}
                  >
                    Fechar
                  </button>
                </>
              ) : (
                <>
                  <button
                    key="btn-edit-salvar"
                    className="btn btn-primary w-full sm:w-auto"
                    disabled={salvando}
                    type="submit"
                  >
                    {salvando ? "Salvando..." : editId ? "Salvar alterações" : "Salvar"}
                  </button>
                  <button
                    key="btn-edit-cancelar"
                    type="button"
                    className="btn btn-light w-full sm:w-auto"
                    onClick={fecharFormularioCliente}
                    disabled={salvando}
                  >
                    Cancelar
                  </button>
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
        </div>
      )}

      {msg && (
        <div className="card-base card-green mb-3">
          <strong>{msg}</strong>
        </div>
      )}

      {!mostrarFormCliente && (
        <>
          {/* BUSCA */}
          <div className="card-base mb-3 list-toolbar-sticky">
            <div
              className="form-row mobile-stack"
              style={{ gap: 12, gridTemplateColumns: "minmax(240px, 1fr) auto", alignItems: "flex-end" }}
            >
              <div className="form-group">
                <label className="form-label">Buscar cliente</label>
                <input
                  className="form-input"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Nome, CPF/CNPJ ou e-mail"
                />
              </div>
              {podeCriar && (
                <div className="hidden sm:flex" style={{ alignItems: "flex-end" }}>
                  <div className="form-group">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={iniciarNovoCliente}
                      disabled={mostrarFormCliente}
                    >
                      Adicionar cliente
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ERRO */}
          {erro && (
            <div className="card-base card-config mb-3">
              <strong>{erro}</strong>
            </div>
          )}

          {!carregouTodos && !erro && (
            <div className="card-base card-config mb-3">
              Use a paginação para navegar. Digite na busca para filtrar todos.
            </div>
          )}

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

          {/* LISTA */}
          <div
            className="table-container overflow-x-auto"
            style={{ maxHeight: "65vh", overflowY: "auto" }}
          >
            <table className="table-default table-header-blue clientes-table table-mobile-cards min-w-[820px]">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>CPF/CNPJ</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  {exibeColunaAcoes && (
                    <th className="th-actions" style={{ textAlign: "center" }}>
                      Ações
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={6}>Carregando...</td>
                  </tr>
                )}

                {!loading && clientesExibidos.length === 0 && (
                  <tr>
                    <td colSpan={6}>Nenhum cliente encontrado.</td>
                  </tr>
                )}

                {!loading &&
                  clientesExibidos.map((c) => (
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

                      {exibeColunaAcoes && (
                        <td className="th-actions" data-label="Ações">
                          <div className="action-buttons">
                            {(() => {
                              const whatsappLink = construirLinkWhatsApp(c.whatsapp);
                              if (!whatsappLink) return null;
                              return (
                                <a
                                  className="btn-icon"
                                  href={whatsappLink}
                                  title="Abrir WhatsApp"
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  💬
                                </a>
                              );
                            })()}
                            <button
                              className="btn-icon"
                              onClick={() => abrirHistorico(c)}
                              title="Histórico"
                            >
                              🗂️
                            </button>
                            <button
                              className="btn-icon"
                              onClick={() => abrirModalAviso(c)}
                              title="Enviar template"
                            >
                              📨
                            </button>
                            {podeEditar && (
                              <button
                                className="btn-icon"
                                onClick={() => iniciarEdicao(c)}
                                title="Editar"
                              >
                                ✏️
                              </button>
                            )}

                            {podeExcluir && (
                              <button
                                className="btn-icon btn-danger"
                                onClick={() => solicitarExclusaoCliente(c)}
                                disabled={excluindoId === c.id}
                                title="Excluir"
                              >
                                {excluindoId === c.id ? "..." : "🗑️"}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {podeCriar && (
            <div className="mobile-actionbar sm:hidden">
              <button
                type="button"
                className="btn btn-primary"
                onClick={iniciarNovoCliente}
                disabled={mostrarFormCliente}
              >
                Adicionar cliente
              </button>
            </div>
          )}
        </>
      )}
    </div>
    {modalAvisoCliente && (
      <div className="modal-backdrop">
        <div className="modal-panel" style={{ maxWidth: 960, width: "95vw" }}>
          <div className="modal-header">
            <div>
              <div className="modal-title" style={{ color: "#1d4ed8", fontWeight: 800 }}>
                Enviar mensagem personalizada
              </div>
              <small style={{ color: "#64748b" }}>Cliente: {modalAvisoCliente.nome}</small>
            </div>
            <button className="btn-ghost" onClick={fecharModalAviso}>✕</button>
          </div>
          <div className="modal-body">
            {erroAviso && <div style={{ color: "#b91c1c", marginBottom: 8 }}>{erroAviso}</div>}
            {msgAviso && <div style={{ color: "#166534", marginBottom: 8 }}>{msgAviso}</div>}
            <div className="form-row mobile-stack" style={{ gap: 12 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Destinatário</label>
                <select
                  className="form-select"
                  value={formAviso.recipientId}
                  onChange={(e) => setFormAviso((p) => ({ ...p, recipientId: e.target.value }))}
                >
                  {recipientsAviso.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ width: 180 }}>
                <label className="form-label">Canal</label>
                <select
                  className="form-select"
                  value={formAviso.canal}
                  onChange={(e) => setFormAviso((p) => ({ ...p, canal: e.target.value as "whatsapp" | "email" }))}
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">E-mail</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Template</label>
              <select
                className="form-select"
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
              >
                {templatesAviso.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.nome}
                  </option>
                ))}
              </select>
              {templatesAviso.length === 0 && (
                <small style={{ color: "#b45309" }}>
                  Nenhum template ativo. Cadastre em <strong>Parâmetros &gt; Avisos</strong>.
                </small>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Arte</label>
              <select
                className="form-select"
                value={formAviso.themeId}
                onChange={(e) => setFormAviso((p) => ({ ...p, themeId: e.target.value }))}
              >
                <option value="">Sem arte</option>
                {themesDisponiveisAviso.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.categoria} • {theme.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="card-base card-config" style={{ marginTop: 8 }}>
              <div className="mobile-stack-buttons" style={{ marginBottom: 8, justifyContent: "space-between" }}>
                <strong>Prévia operacional (mensagem + cartão)</strong>
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={gerarPreviewAviso}
                  disabled={renderingPreviewAviso || templatesAviso.length === 0}
                >
                  {renderingPreviewAviso ? "Gerando prévia..." : "Gerar prévia"}
                </button>
              </div>

              {previewAviso ? (
                <>
                  <div className="form-row mobile-stack" style={{ gap: 12, gridTemplateColumns: "2fr 1fr" }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">Mensagem pronta</label>
                      <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{previewAviso.text}</pre>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">
                        Cartão {previewAviso.cardMime === "image/png" ? "PNG" : "SVG"}
                      </label>
                      <img
                        src={previewAviso.cardUrl}
                        alt="Prévia do cartão"
                        style={{ width: "100%", maxWidth: 260, borderRadius: 10, border: "1px solid #cbd5e1" }}
                      />
                      {previewAviso.cardMime !== "image/png" && (
                        <small style={{ color: "#92400e" }}>
                          PNG indisponível no runtime atual. Use o SVG ou ajuste o ambiente para PNG no servidor.
                        </small>
                      )}
                    </div>
                  </div>
                  <div className="mobile-stack-buttons" style={{ marginTop: 8 }}>
                    <button type="button" className="btn btn-light" onClick={copiarMensagemAviso}>
                      Copiar mensagem
                    </button>
                    <button type="button" className="btn btn-light" onClick={baixarCartaoAviso}>
                      Baixar cartão
                    </button>
                    <button type="button" className="btn btn-light" onClick={abrirCartaoAviso}>
                      Abrir cartão
                    </button>
                  </div>
                </>
              ) : (
                <small style={{ color: "#64748b" }}>
                  Clique em <strong>Gerar prévia</strong> para renderizar o cartão e preparar a mensagem.
                </small>
              )}
            </div>
          </div>
          <div className="modal-footer">
            <button
              className="btn btn-light"
              onClick={fecharModalAviso}
              disabled={sendingAviso || renderingPreviewAviso || openingWhatsappAviso}
            >
              Cancelar
            </button>
            {formAviso.canal === "whatsapp" ? (
              <button
                className="btn btn-primary"
                onClick={abrirWhatsAppAviso}
                disabled={openingWhatsappAviso || renderingPreviewAviso || !previewAviso}
              >
                {openingWhatsappAviso ? "Abrindo..." : "Abrir WhatsApp"}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={enviarTemplateClienteEmail}
                disabled={sendingAviso || templatesAviso.length === 0}
              >
                {sendingAviso ? "Enviando..." : "Enviar e-mail"}
              </button>
            )}
          </div>
        </div>
      </div>
    )}

    {historicoCliente && (
      <div className="modal-backdrop">
        <div className="modal-panel historico-viagens-modal" style={{ maxWidth: 1100, width: "95vw" }}>
          <div className="modal-header">
            <div>
              <div
                className="modal-title"
                style={{ color: "#1d4ed8", fontSize: "1.2rem", fontWeight: 800 }}
              >
                Histórico de {historicoCliente.nome}
              </div>
              <small style={{ color: "#64748b" }}>Vendas e orçamentos do cliente</small>
            </div>
            <button className="btn-ghost" onClick={fecharHistorico}>✕</button>
          </div>

          <div className="modal-body">
            {loadingHistorico && <p>Carregando histórico...</p>}

            {!loadingHistorico && (
              <>
                {acompanhantesCard}

                <div className="mb-2">
                  <h4 style={{ marginBottom: 8 }}>Vendas</h4>
                  <small style={{ display: "block", marginBottom: 8, color: "#475569" }}>
                    Resumo de viagens: {resumoHistoricoVendas.totalViagens} • Valor{" "}
                    {formatCurrencyBRL(resumoHistoricoVendas.totalValor)} • Taxas{" "}
                    {formatCurrencyBRL(resumoHistoricoVendas.totalTaxas)}
                  </small>
                  <div className="table-container overflow-x-auto">
                    <table className="table-default table-header-blue table-mobile-cards min-w-[820px]">
                      <thead>
                        <tr>
                          <th>Data Lançamento</th>
                          <th>Destino</th>
                          <th>Embarque</th>
                          <th>Vínculo</th>
                          <th>Valor</th>
                          <th>Taxas</th>
                          <th className="th-actions" style={{ textAlign: "center" }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicoVendas.length === 0 && (
                          <tr>
                            <td colSpan={7}>Nenhuma venda encontrada.</td>
                          </tr>
                        )}
                        {historicoVendas.map((v) => (
                          <tr key={v.id}>
                            <td data-label="Data Lançamento">
                              {v.data_lancamento
                                ? formatDateBR(v.data_lancamento)
                                : "-"}
                            </td>
                            <td data-label="Destino">{v.destino_cidade_nome || "-"}</td>
                            <td data-label="Embarque">
                              {v.data_embarque
                                ? formatDateBR(v.data_embarque)
                                : "-"}
                            </td>
                            <td data-label="Vínculo">
                              {v.origem_vinculo === "passageiro" ? "Passageiro" : "Titular"}
                            </td>
                            <td data-label="Valor">
                              {formatCurrencyBRL(v.valor_total)}
                            </td>
                            <td data-label="Taxas">
                              {formatCurrencyBRL(v.valor_taxas)}
                            </td>
                            <td className="th-actions" data-label="Ações">
                              <div className="action-buttons">
                                <button
                                  className="btn-icon"
                                  type="button"
                                  onClick={() => verDetalheVenda(v)}
                                  title="Visualizar recibos completos"
                                >
                                  👁️
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mb-2">
                  <h4 style={{ marginBottom: 8 }}>Orçamentos do cliente</h4>
                  <div className="table-container overflow-x-auto">
                    <table className="table-default table-header-blue table-mobile-cards min-w-[760px]">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Status</th>
                          <th>Destino</th>
                          <th>Produto</th>
                          <th>Valor</th>
                          <th>Venda</th>
                          <th className="th-actions" style={{ textAlign: "center" }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicoOrcamentos.length === 0 && (
                          <tr>
                            <td colSpan={7}>Nenhum orçamento encontrado.</td>
                          </tr>
                        )}
                        {historicoOrcamentos.map((o) => (
                          <tr key={o.id}>
                            <td data-label="Data">
                              {o.data_orcamento
                                ? formatDateBR(o.data_orcamento).replaceAll("/", "-")
                                : "-"}
                            </td>
                            <td data-label="Status" style={{ textTransform: "capitalize" }}>{o.status || "-"}</td>
                            <td data-label="Destino">{o.destino_cidade_nome || "-"}</td>
                            <td data-label="Produto">{o.produto_nome || "-"}</td>
                            <td data-label="Valor">
                              {formatCurrencyBRL(o.valor ?? 0)}
                            </td>
                            <td data-label="Venda">{o.numero_venda || "-"}</td>
                            <td className="th-actions" data-label="Ações">
                              <div className="action-buttons">
                                <button
                                  className="btn-icon"
                                  type="button"
                                  onClick={() => verDetalheOrcamento(o)}
                                  title="Ver detalhes"
                                >
                                  👁️
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button className="btn btn-outline" onClick={fecharHistorico}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Detalhe da venda */}
    {detalheVenda && (
      <div className="modal-backdrop">
        <div className="modal-panel" style={{ maxWidth: 720 }}>
          <div className="modal-header">
            <div>
              <div
                className="modal-title"
                style={{ color: "#16a34a", fontSize: "1.15rem", fontWeight: 800 }}
              >
                Detalhes da venda
              </div>
            </div>
            <button className="btn-ghost" onClick={() => { setDetalheVenda(null); setDetalheRecibos([]); }}>
              ✕
            </button>
          </div>
          <div className="modal-body">
              <div
                style={{
                  display: "grid",
                  gap: 6,
                  lineHeight: 1.4,
                marginBottom: 8,
              }}
              >
                <div>
                  <strong>Recibo:</strong>{" "}
                  {detalheRecibos.length > 0
                    ? detalheRecibos.map((r) => r.numero_recibo || "-").join(", ")
                    : "—"}
                </div>
                <div>
                  <strong>Destino:</strong> {detalheVenda.destino_cidade_nome || "-"}
                </div>
                <div>
                  <strong>Lançamento:</strong>{" "}
                  {formatDateBR(detalheVenda.data_lancamento)}
                </div>
              <div>
                <strong>Embarque:</strong>{" "}
                {detalheVenda.data_embarque
                  ? formatDateBR(detalheVenda.data_embarque)
                  : "-"}
              </div>
              <div>
                <strong>Valor:</strong>{" "}
                {formatCurrencyBRL(detalheVenda.valor_total)}
              </div>
              <div>
                <strong>Taxas:</strong>{" "}
                {detalheVenda.valor_taxas === 0
                  ? "-"
                  : formatCurrencyBRL(detalheVenda.valor_taxas)}
              </div>
            </div>

            <h4 style={{ marginBottom: 8, textAlign: "center" }}>Recibos</h4>
            {carregandoRecibos ? (
              <p>Carregando recibos...</p>
            ) : (
              <div className="table-container overflow-x-auto">
                <table className="table-default table-header-blue table-mobile-cards" style={{ minWidth: 520 }}>
                  <thead>
                    <tr>
                      <th>Número</th>
                      <th>Produto</th>
                      <th style={{ textAlign: "center" }}>Início</th>
                      <th style={{ textAlign: "center" }}>Fim</th>
                      <th>Valor</th>
                      <th>Taxas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalheRecibos.length === 0 && (
                      <tr>
                        <td colSpan={4}>Nenhum recibo encontrado.</td>
                      </tr>
                    )}
                    {detalheRecibos.map((r, idx) => {
                      const formatarData = (value: string | null | undefined) =>
                        value ? formatDateBR(value) : "-";
                      return (
                        <tr key={idx}>
                          <td data-label="Número">{r.numero_recibo || "-"}</td>
                          <td data-label="Produto">{r.produto_nome || "-"}</td>
                          <td data-label="Início" style={{ textAlign: "center" }}>{formatarData(r.data_inicio)}</td>
                          <td data-label="Fim" style={{ textAlign: "center" }}>{formatarData(r.data_fim)}</td>
                          <td data-label="Valor">
                            {formatCurrencyBRL(r.valor_total || 0)}
                          </td>
                          <td data-label="Taxas">
                            {formatCurrencyBRL(r.valor_taxas || 0)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button
              className="btn btn-outline"
              onClick={() => { setDetalheVenda(null); setDetalheRecibos([]); }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Detalhe do orçamento */}
    {detalheOrcamento && (
      <div className="modal-backdrop">
        <div className="modal-panel orcamento-detalhe-modal" style={{ maxWidth: 640 }}>
          <div className="modal-header">
            <div className="orcamento-detalhe-header">
              <div className="modal-title orcamento-detalhe-nome">
                {historicoCliente?.nome || form.nome || "-"}
              </div>
              <div className="orcamento-detalhe-status">
                Status: {detalheOrcamento.status || "-"}
              </div>
            </div>
            <button className="btn-ghost" onClick={() => setDetalheOrcamento(null)}>
              ✕
            </button>
          </div>
          <div className="modal-body">
            <div className="card-base" style={{ marginBottom: 12, textAlign: "center" }}>
              <div className="orcamento-detalhe-subtitle">Visualizar orçamento</div>
            </div>
            <div
              style={{
                display: "grid",
                gap: 6,
                lineHeight: 1.4,
                marginBottom: 4,
              }}
            >
              <div>
                <strong>Data:</strong>{" "}
                {detalheOrcamento.data_orcamento
                  ? formatDateBR(detalheOrcamento.data_orcamento)
                  : "-"}
              </div>
              <div>
                <strong>Status:</strong> {detalheOrcamento.status || "-"}
              </div>
              <div>
                <strong>Valor:</strong>{" "}
                {formatCurrencyBRL(detalheOrcamento.valor || 0)}
              </div>
              <div>
                <strong>Venda vinculada:</strong> {detalheOrcamento.numero_venda || "-"}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-outline" onClick={() => setDetalheOrcamento(null)}>
              Fechar
            </button>
          </div>
        </div>
      </div>
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
    </>
  );
}
