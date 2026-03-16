import { Dialog, Select } from "../ui/primer/legacyCompat";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import {
  buildQueryLiteKey,
  invalidateQueryLiteByPrefix,
  queryLite,
} from "../../lib/queryLite";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { formatarDataParaExibicao } from "../../lib/formatDate";
import { formatCurrencyBRL, formatDateTimeBR } from "../../lib/format";
import { boundDateEndISO, selectAllInputOnFocus } from "../../lib/inputNormalization";
import {
  getConsultoriaLembreteLabel,
  getConsultoriaLembreteMinutes,
} from "../../lib/consultoriaLembretes";
import {
  construirLinkWhatsAppComTexto,
  construirUrlCartaoAniversario,
  montarMensagemAniversario,
  montarMensagemFollowUp,
} from "../../lib/whatsapp";
import CalculatorModal from "../ui/CalculatorModal";
import { Chart } from "primereact/chart";
import IslandErrorBoundary from "../ui/IslandErrorBoundary";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import TableActions from "../ui/TableActions";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

// ----------------- TIPOS -----------------

type PapelUsuario = "ADMINISTRADOR" | "ADMIN" | "GESTOR" | "VENDEDOR" | "OUTRO";

type UserContext = {
  usuarioId: string;
  nome: string | null;
  papel: PapelUsuario;
  vendedorIds: string[]; // se GESTOR: ele + equipe | se VENDEDOR: só ele | se ADMIN: vazio = todos
};

type Venda = {
  id: string;
  data_venda: string;
  data_embarque: string | null;
  cancelada: boolean | null;
  vendedor_id: string | null;
  valor_total?: number | null;
  clientes?: { id: string; nome: string | null } | null;
  destinos?: { id: string; nome: string | null } | null;
  vendas_recibos?: {
    id: string;
    valor_total: number | null;
    valor_taxas: number | null;
    produtos?: {
      id: string;
      nome: string | null;
      regra_comissionamento: string | null;
      exibe_kpi_comissao?: boolean | null;
    } | null;
  }[];
};

type VendasAgg = {
  totalVendas: number;
  totalTaxas: number;
  totalLiquido: number;
  totalSeguro: number;
  qtdVendas: number;
  ticketMedio: number;
  timeline: Array<{ date: string; value: number }>;
  topDestinos: Array<{ name: string; value: number }>;
  porProduto: Array<{ id: string; name: string; value: number }>;
  porVendedor: Array<{ vendedor_id: string; total: number; qtd: number }>;
};

type TipoProdutoKpi = {
  id: string;
  nome: string | null;
  exibe_kpi_comissao?: boolean | null;
};

type Orcamento = {
  id: string;
  created_at: string;
  status: string | null;
  status_negociacao?: string | null;
  total: number | null;
  cliente?: { id: string; nome?: string | null } | null;
  quote_item?: {
    id?: string;
    title?: string | null;
    product_name?: string | null;
    item_type?: string | null;
    city_name?: string | null;
  }[] | null;
};

type MetaVendedor = {
  id: string;
  vendedor_id: string;
  periodo: string; // date
  meta_geral: number;
  meta_diferenciada: number;
  ativo: boolean;
  scope?: string | null;
};

type Cliente = {
  id: string;
  nome: string;
  nascimento: string | null;
  telefone: string | null;
  pessoa_tipo?: "cliente" | "acompanhante";
  cliente_id?: string | null;
};

type Viagem = {
  id: string;
  venda_id?: string | null;
  produtos_tipos?: string[] | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: string | null;
  origem: string | null;
  destino: string | null;
  responsavel_user_id: string | null;
  clientes?: { id: string; nome: string | null } | null;
  recibo?: {
    id: string;
    venda_id: string | null;
    valor_total: number | null;
    valor_taxas: number | null;
    numero_recibo?: string | null;
    produto_id: string | null;
    tipo_produtos?: { id: string; nome?: string | null; tipo?: string | null } | null;
  } | null;
};

type FollowUpVenda = {
  id: string;
  venda_id: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  follow_up_fechado?: boolean | null;
  venda?: {
    id: string;
    data_embarque: string | null;
    data_final: string | null;
    vendedor_id: string | null;
    cancelada?: boolean | null;
    clientes?: { id: string; nome: string | null; whatsapp?: string | null; telefone?: string | null } | null;
    destino_cidade?: { id: string; nome: string | null } | null;
  } | null;
};

type ConsultoriaOnline = {
  id: string;
  cliente_nome: string;
  data_hora: string;
  lembrete: string;
  destino: string | null;
  orcamento_id: string | null;
};

type ConsultoriaReminder = {
  id: string;
  clienteNome: string;
  dataHora: string;
  dataHoraLocal: string;
  lembrete: string;
  lembreteLabel: string;
  lembreteAt: number;
  lembreteAtLocal: string;
  consultaAt: number;
  destino: string | null;
  orcamentoId: string | null;
  msUntil: number;
  statusLabel: string;
  storageKey: string;
};

type PresetPeriodo = "mes_atual" | "ultimos_30" | "personalizado";

type WidgetId =
  | "kpis"
  | "vendas_destino"
  | "vendas_produto"
  | "timeline"
  | "aniversariantes_clientes"
  | "consultorias"
  | "orcamentos"
  | "viagens"
  | "follow_up";

type KpiId = string;

type ChartType = "pie" | "bar" | "line";

const ALL_WIDGETS: { id: WidgetId; titulo: string }[] = [
  { id: "kpis", titulo: "KPIs principais" },
  { id: "vendas_destino", titulo: "Vendas por destino" },
  { id: "vendas_produto", titulo: "Vendas por produto" },
  { id: "timeline", titulo: "Evolução das vendas" },
  { id: "aniversariantes_clientes", titulo: "Aniversariantes (clientes e acompanhantes)" },
  { id: "orcamentos", titulo: "Orçamentos recentes" },
  { id: "consultorias", titulo: "Lembretes de consultoria" },
  { id: "viagens", titulo: "Próximas viagens" },
  { id: "follow_up", titulo: "Follow-Up" },
];

const BASE_KPIS: { id: KpiId; titulo: string }[] = [
  { id: "kpi_vendas_total", titulo: "Vendas no período" },
  { id: "kpi_qtd_vendas", titulo: "Qtd. vendas" },
  { id: "kpi_ticket_medio", titulo: "Ticket médio" },
  { id: "kpi_orcamentos", titulo: "Orçamentos" },
  { id: "kpi_conversao", titulo: "Conv. Orç → Vendas" },
  { id: "kpi_meta", titulo: "Meta do mês" },
  { id: "kpi_meta_diaria", titulo: "Meta diária" },
  { id: "kpi_atingimento", titulo: "Atingimento meta" },
  { id: "kpi_dias_restantes", titulo: "Dias restantes" },
];

// ----------------- HELPERS -----------------

function formatCurrency(value: number) {
  return formatCurrencyBRL(value);
}

function formatarTempoRestante(ms: number) {
  if (ms <= 0) return "Agora";
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 60) return `Em ${totalMin} min`;
  const horas = Math.ceil(totalMin / 60);
  if (horas < 24) return `Em ${horas}h`;
  const dias = Math.ceil(horas / 24);
  return `Em ${dias}d`;
}

function formatarDataHoraLocal(value: string | number | Date) {
  if (value instanceof Date) return formatDateTimeBR(value.toISOString());
  return formatDateTimeBR(String(value));
}

function getOrcamentoDestino(orc?: Orcamento | null) {
  const item = (orc?.quote_item || [])[0];
  if (!item) return "-";
  return (
    item.city_name ||
    item.product_name ||
    item.title ||
    item.item_type ||
    "-"
  );
}

function getMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const toISO = (d: Date) => d.toISOString().substring(0, 10);
  return { inicio: toISO(start), fim: toISO(end) };
}

function getLastNDaysBounds(n: number) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - (n - 1));
  const toISO = (d: Date) => d.toISOString().substring(0, 10);
  return { inicio: toISO(start), fim: toISO(end) };
}

function normalizeKpiOrder(order: KpiId[], ids: KpiId[]) {
  const filtered = order.filter((id) => ids.includes(id));
  const missing = ids.filter((id) => !filtered.includes(id));
  return [...filtered, ...missing];
}

function normalizeWidgetOrder(order: WidgetId[]) {
  const ids = ALL_WIDGETS.map((w) => w.id);
  const filtered = order.filter((id) => ids.includes(id));
  const missing = ids.filter((id) => !filtered.includes(id));
  return [...filtered, ...missing];
}

function readWidgetVisibilityFromStorage(storageKey: string, ids: WidgetId[]) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { visible?: Record<string, boolean> };
    if (!parsed?.visible) return null;
    const result: Record<WidgetId, boolean> = {} as Record<WidgetId, boolean>;
    ids.forEach((id) => {
      if (typeof parsed.visible?.[id] === "boolean") {
        result[id] = parsed.visible[id] as boolean;
      }
    });
    return Object.keys(result).length > 0 ? result : null;
  } catch {
    return null;
  }
}

const COLORS_PURPLE = ["#2563eb", "#3b82f6", "#6366f1", "#ec4899", "#22c55e"];

function chartTokens() {
  if (typeof window === "undefined") {
    return {
      text: "#475569",
      textSecondary: "#64748b",
      border: "#e2e8f0",
    };
  }
  const ds = getComputedStyle(document.documentElement);
  return {
    text: ds.getPropertyValue("--text-color")?.trim() || "#475569",
    textSecondary: ds.getPropertyValue("--text-color-secondary")?.trim() || "#64748b",
    border: ds.getPropertyValue("--surface-border")?.trim() || "#e2e8f0",
  };
}

function toPieChartConfig(items: Array<{ name: string; value: number }>) {
  const tk = chartTokens();
  return {
    data: {
      labels: items.map((item) => item.name),
      datasets: [
        {
          data: items.map((item) => Number(item.value || 0)),
          backgroundColor: items.map((_, idx) => COLORS_PURPLE[idx % COLORS_PURPLE.length]),
          hoverBackgroundColor: items.map((_, idx) => COLORS_PURPLE[idx % COLORS_PURPLE.length]),
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false, labels: { color: tk.text } },
      },
    },
  };
}

function toBarChartConfig(
  items: Array<{ label: string; value: number }>,
  formatter: (value: number) => string,
  hideXAxis = false
) {
  const tk = chartTokens();
  return {
    data: {
      labels: items.map((item) => item.label),
      datasets: [
        {
          data: items.map((item) => Number(item.value || 0)),
          backgroundColor: items.map((_, idx) => COLORS_PURPLE[idx % COLORS_PURPLE.length]),
          borderRadius: 6,
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context: any) => formatter(Number(context?.parsed?.y ?? context?.parsed ?? 0)),
          },
        },
      },
      scales: {
        x: {
          ticks: { color: tk.textSecondary, display: !hideXAxis },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          ticks: { color: tk.textSecondary },
          grid: { color: tk.border },
          border: { display: false },
        },
      },
    },
  };
}

function toLineChartConfig(
  items: Array<{ label: string; value: number }>,
  formatter: (value: number) => string
) {
  const tk = chartTokens();
  return {
    data: {
      labels: items.map((item) => item.label),
      datasets: [
        {
          data: items.map((item) => Number(item.value || 0)),
          borderColor: "#3b82f6",
          backgroundColor: "rgba(59,130,246,0.15)",
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context: any) => formatter(Number(context?.parsed?.y ?? context?.parsed ?? 0)),
          },
        },
      },
      scales: {
        x: {
          ticks: { color: tk.textSecondary },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          ticks: { color: tk.textSecondary },
          grid: { color: tk.border },
          border: { display: false },
        },
      },
    },
  };
}

// ----------------- COMPONENTE -----------------

  const DashboardGeralIslandInner: React.FC = () => {
  const [userCtx, setUserCtx] = useState<UserContext | null>(null);
  const [loadingUserCtx, setLoadingUserCtx] = useState(true);
  const { can, loading: loadingPerms, ready, userId } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVerDashboard = can("Dashboard");
  const podeVerOperacao = can("Operacao");
  const podeVerConsultoria = can("Consultoria Online") || can("Consultoria");
  const showRankingView = userCtx?.papel === "VENDEDOR";
  const assinaturaUsuario = useMemo(() => {
    const nome = String(userCtx?.nome || "").trim();
    return nome || "André Lima";
  }, [userCtx?.nome]);

  const [presetPeriodo, setPresetPeriodo] =
    useState<PresetPeriodo>("mes_atual");
  const [inicio, setInicio] = useState<string>("");
  const [fim, setFim] = useState<string>("");

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [vendasAgg, setVendasAgg] = useState<VendasAgg | null>(null);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [metas, setMetas] = useState<MetaVendedor[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clientesAniversariantes, setClientesAniversariantes] = useState<Cliente[]>([]);
  const [clientesAniversariantesMonth, setClientesAniversariantesMonth] = useState<number>(
    () => new Date().getMonth() + 1
  );
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpVenda[]>([]);
  const [consultoriasOnline, setConsultoriasOnline] = useState<ConsultoriaOnline[]>([]);
  const [kpiProdutos, setKpiProdutos] = useState<{ id: KpiId; titulo: string; produtoId: string }[]>([]);
  const [loadingDados, setLoadingDados] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [widgetOrder, setWidgetOrder] = useState<WidgetId[]>(ALL_WIDGETS.map((w) => w.id));
  const [widgetVisible, setWidgetVisible] = useState<Record<WidgetId, boolean>>(() =>
    ALL_WIDGETS.reduce((acc, w) => ({ ...acc, [w.id]: true }), {} as Record<WidgetId, boolean>)
  );
  const viagensScrollRef = useRef<HTMLDivElement | null>(null);
  const widgetIds = useMemo(() => ALL_WIDGETS.map((w) => w.id), []);
  const [showCustomize, setShowCustomize] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [mobileWidgetOpen, setMobileWidgetOpen] = useState<Record<WidgetId, boolean>>(() =>
    ALL_WIDGETS.reduce((acc, w) => ({ ...acc, [w.id]: false }), {} as Record<WidgetId, boolean>)
  );
  const [agora, setAgora] = useState(() => Date.now());
  const [kpiOrder, setKpiOrder] = useState<KpiId[]>(BASE_KPIS.map((k) => k.id));
  const [kpiVisible, setKpiVisible] = useState<Record<KpiId, boolean>>(() =>
    BASE_KPIS.reduce((acc, k) => ({ ...acc, [k.id]: true }), {} as Record<KpiId, boolean>)
  );
  const allKpis = useMemo(() => [...BASE_KPIS, ...kpiProdutos], [kpiProdutos]);
  const kpiOrderEffective = useMemo(() => {
    const ids = allKpis.map((k) => k.id);
    const filtered = kpiOrder.filter((id) => ids.includes(id));
    const missing = ids.filter((id) => !filtered.includes(id));
    return [...filtered, ...missing];
  }, [kpiOrder, allKpis]);
  const kpiVisibleEffective = useMemo(() => {
    const vis: Record<KpiId, boolean> = {};
    allKpis.forEach((k) => {
      vis[k.id] = kpiVisible[k.id] !== false;
    });
    return vis;
  }, [kpiVisible, allKpis]);
  const [chartPrefs, setChartPrefs] = useState<Record<WidgetId, ChartType>>({
    vendas_destino: "pie",
    vendas_produto: "bar",
    timeline: "line",
  } as Record<WidgetId, ChartType>);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 640px)");
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const chartPrefsEffective = useMemo(() => {
    if (!isMobile) return chartPrefs;
    return {
      ...chartPrefs,
      vendas_destino: "bar",
      vendas_produto: "bar",
    };
  }, [chartPrefs, isMobile]);

  // Garante que novos widgets entram no order/visibility mesmo com preferências antigas
  useEffect(() => {
    setWidgetOrder((prev) => {
      const next = normalizeWidgetOrder(prev);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
    setWidgetVisible((prev) => {
      const next = { ...prev };
      widgetIds.forEach((id) => {
        if (next[id] === undefined) next[id] = true;
      });
      Object.keys(next).forEach((id) => {
        if (!widgetIds.includes(id as WidgetId)) {
          delete next[id as WidgetId];
        }
      });
      return next;
    });
  }, [widgetIds]);

  const toggleWidget = (id: WidgetId) => {
    const updated = { ...widgetVisible, [id]: !widgetVisible[id] };
    setWidgetVisible(updated);
    salvarPreferencias(widgetOrder, updated, { order: kpiOrderEffective, visible: kpiVisibleEffective });
  };

  const toggleKpi = (id: KpiId) => {
    const updated = { ...kpiVisibleEffective, [id]: !kpiVisibleEffective[id] };
    setKpiVisible(updated);
    salvarPreferencias(widgetOrder, widgetVisible, { order: kpiOrderEffective, visible: updated });
  };

  const moverWidget = (id: WidgetId, direction: "up" | "down") => {
    const idx = widgetOrder.indexOf(id);
    if (idx === -1) return;
    const newOrder = [...widgetOrder];
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= newOrder.length) return;
    [newOrder[idx], newOrder[swapWith]] = [newOrder[swapWith], newOrder[idx]];
    setWidgetOrder(newOrder);
    salvarPreferencias(newOrder, widgetVisible, { order: kpiOrder, visible: kpiVisible }, chartPrefs);
  };

  const moverKpi = (id: KpiId, direction: "up" | "down") => {
    const idx = kpiOrder.indexOf(id);
    if (idx === -1) return;
    const newOrder = [...kpiOrder];
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= newOrder.length) return;
    [newOrder[idx], newOrder[swapWith]] = [newOrder[swapWith], newOrder[idx]];
    setKpiOrder(newOrder);
    salvarPreferencias(widgetOrder, widgetVisible, { order: newOrder, visible: kpiVisible }, chartPrefs);
  };

  const alterarChart = (widgetId: WidgetId, tipo: ChartType) => {
    const updated = { ...chartPrefs, [widgetId]: tipo };
    setChartPrefs(updated);
    salvarPreferencias(widgetOrder, widgetVisible, { order: kpiOrder, visible: kpiVisible }, updated);
  };

  const widgetAtivo = (id: WidgetId) => widgetVisible[id] !== false;
  const toggleMobileWidget = (id: WidgetId) => {
    setMobileWidgetOpen((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  function salvarKpiLocal(order: KpiId[], visible: Record<KpiId, boolean>, charts?: Record<WidgetId, ChartType>) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "dashboard_kpis",
        JSON.stringify({ order, visible })
      );
      if (charts) {
        window.localStorage.setItem(
          "dashboard_charts",
          JSON.stringify(charts)
        );
      }
    }
  }

  async function salvarPreferencias(
    order: WidgetId[],
    visible: Record<WidgetId, boolean>,
    kpiState?: { order: KpiId[]; visible: Record<KpiId, boolean> },
    charts?: Record<WidgetId, ChartType>
  ) {
    try {
      if (userCtx?.usuarioId) {
        const items = order.map((id) => ({
          widget: id,
          visivel: visible[id] !== false,
          // settings opcional para KPIs; se a coluna não existir, fallback localStorage cuidará
          settings:
            id === "kpis" && kpiState
              ? {
                  kpis: {
                    order: kpiState.order,
                    visible: kpiState.visible,
                  },
                  charts: charts || null,
                }
              : id === "vendas_destino" ||
                id === "vendas_produto" ||
                id === "timeline"
              ? {
                  charts: charts || null,
                }
              : null,
        }));

        const resp = await fetch("/api/v1/dashboard/widgets", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });

        if (!resp.ok) {
          const msg = await resp.text().catch(() => "");
          throw new Error(msg || `HTTP ${resp.status}`);
        }
      }
    } catch (e) {
      console.warn("Não foi possível salvar preferências no Supabase, mantendo localStorage.", e);
    } finally {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "dashboard_widgets",
          JSON.stringify({ order, visible })
        );
        if (kpiState) {
          salvarKpiLocal(kpiState.order, kpiState.visible, charts);
        }
        if (charts) {
          window.localStorage.setItem("dashboard_charts", JSON.stringify(charts));
        }
      }
      const cacheUserId = userCtx?.usuarioId || userId;
      if (cacheUserId) {
        invalidateQueryLiteByPrefix(buildQueryLiteKey(["dashboardSummary", "geral", cacheUserId]));
        invalidateQueryLiteByPrefix(buildQueryLiteKey(["dashboardSummary", "gestor", cacheUserId]));
      }
    }
  }

  // orçamentos – seleção em modal
  const [orcamentoSelecionado, setOrcamentoSelecionado] =
    useState<Orcamento | null>(null);

  // ----------------- INIT PERÍODO -----------------

  useEffect(() => {
    const { inicio: i, fim: f } = getMonthBounds();
    setInicio(i);
    setFim(f);
    setPresetPeriodo("mes_atual");
  }, []);

  function aplicarPreset(p: PresetPeriodo) {
    setPresetPeriodo(p);
    if (p === "mes_atual") {
      const { inicio: i, fim: f } = getMonthBounds();
      setInicio(i);
      setFim(f);
    } else if (p === "ultimos_30") {
      const { inicio: i, fim: f } = getLastNDaysBounds(30);
      setInicio(i);
      setFim(f);
    }
    // personalizado: usuário vai editar datas manualmente
  }

  // Ajusta ordem/visibilidade quando KPIs dinâmicos de produto mudam
  useEffect(() => {
    const ids = allKpis.map((k) => k.id);
    setKpiOrder((prev) => {
      const next = normalizeKpiOrder(prev, ids);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
    setKpiVisible((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        if (next[id] === undefined) next[id] = true;
      });
      Object.keys(next).forEach((id) => {
        if (!ids.includes(id)) delete next[id];
      });
      return next;
    });
  }, [allKpis]);

  // ----------------- CARREGAR DADOS DO DASHBOARD (BFF) -----------------

  useEffect(() => {
    if (!inicio || !fim || !userId) return;

    let cancelled = false;

    async function carregarDashboard() {
      try {
        setLoadingUserCtx(true);
        setLoadingDados(true);
        setErro(null);

        const params = new URLSearchParams({ mode: "geral", inicio, fim });
        params.set("include_clientes", "0");
        const storedVisibility = readWidgetVisibilityFromStorage(
          "dashboard_widgets",
          ALL_WIDGETS.map((w) => w.id)
        );
        const includeOrcamentos = storedVisibility?.orcamentos !== false;
        params.set("include_orcamentos", includeOrcamentos ? "1" : "0");
        params.set("include_consultorias", "0");
        params.set("include_viagens", "0");
        params.set("include_followups", "0");
        const cacheKey = buildQueryLiteKey(["dashboardSummary", "geral", userId, params.toString()]);
        const payload = await queryLite(
          cacheKey,
          async () => {
            const resp = await fetch(`/api/v1/dashboard/summary?${params.toString()}`, {
              credentials: "same-origin",
            });
            if (!resp.ok) {
              const msg = await resp.text().catch(() => "");
              throw new Error(msg || `HTTP ${resp.status}`);
            }
            return resp.json();
          },
          { ttlMs: 20_000 }
        );
        if (cancelled) return;

        setUserCtx((payload?.userCtx || null) as UserContext | null);

        const tiposData = (payload?.tiposProduto || []) as TipoProdutoKpi[];
        const produtosKpi =
          (tiposData || [])
            .filter((p: any) => p.exibe_kpi_comissao !== false)
            .map((p: any) => ({
              id: `kpi_prod_${p.id}` as KpiId,
              titulo: p.nome || "Produto",
              produtoId: p.id as string,
            })) || [];
        setKpiProdutos(produtosKpi);

        setVendas((payload?.vendas || []) as Venda[]);
        setVendasAgg((payload?.vendasAgg || null) as VendasAgg | null);
        setOrcamentos((payload?.orcamentos || []) as Orcamento[]);
        setMetas((payload?.metas || []) as MetaVendedor[]);
        setClientes((payload?.clientes || []) as Cliente[]);
        setFollowUps([]);
        setConsultoriasOnline((payload?.consultoriasOnline || []) as ConsultoriaOnline[]);
        setViagens((payload?.viagens || []) as Viagem[]);

        // Preferências do dashboard (vindas do servidor para evitar 1 query extra)
        try {
          const prefData = (payload?.widgetPrefs || []) as any[];
          if (prefData && prefData.length > 0) {
            const allKpiIds = new Set([...BASE_KPIS.map((k) => k.id), ...produtosKpi.map((k) => k.id)]);
            const ordem = prefData
              .map((p: any) => p.widget as WidgetId)
              .filter((id) => ALL_WIDGETS.some((w) => w.id === id));
            const normalizedOrder = normalizeWidgetOrder(ordem);
            const vis: Record<WidgetId, boolean> = { ...widgetVisible };
            let kpiFromDb: { order?: KpiId[]; visible?: Record<KpiId, boolean> } = {};
            let chartsFromDb: Record<WidgetId, ChartType> | null = null;
            prefData.forEach((p: any) => {
              const id = p.widget as WidgetId;
              if (ALL_WIDGETS.some((w) => w.id === id)) {
                vis[id] = p.visivel !== false;
              }
              if (id === "kpis" && p.settings?.kpis) {
                if (Array.isArray(p.settings.kpis.order)) {
                  kpiFromDb.order = p.settings.kpis.order.filter((kid: any) => allKpiIds.has(kid));
                }
                if (p.settings.kpis.visible) {
                  const filtered: Record<KpiId, boolean> = {};
                  Object.entries(p.settings.kpis.visible).forEach(([kid, val]) => {
                    if (allKpiIds.has(kid)) filtered[kid] = val as boolean;
                  });
                  kpiFromDb.visible = { ...kpiVisible, ...filtered };
                }
              }
              if (p.settings?.charts) {
                chartsFromDb = { ...(chartsFromDb || {}), ...(p.settings.charts as any) };
              }
            });
            if (normalizedOrder.length > 0) setWidgetOrder(normalizedOrder);
            setWidgetVisible(vis);
            const kpiIdArray = Array.from(allKpiIds);
            if (kpiFromDb.order && kpiFromDb.order.length > 0)
              setKpiOrder(normalizeKpiOrder(kpiFromDb.order, kpiIdArray));
            if (kpiFromDb.visible) setKpiVisible(kpiFromDb.visible);
            if (chartsFromDb) setChartPrefs((prev) => ({ ...prev, ...chartsFromDb }));

            const localWidgets = typeof window !== "undefined"
              ? window.localStorage.getItem("dashboard_widgets")
              : null;
            if (localWidgets) {
              const parsed = JSON.parse(localWidgets);
              if (parsed.order && parsed.visible) {
                const localOrder = normalizeWidgetOrder(parsed.order);
                if (localOrder.length > 0) setWidgetOrder(localOrder);
                setWidgetVisible((prev) => ({ ...prev, ...parsed.visible }));
              }
            }
          } else {
            const allKpiIds = new Set([...BASE_KPIS.map((k) => k.id), ...produtosKpi.map((k) => k.id)]);
            const local = typeof window !== "undefined"
              ? window.localStorage.getItem("dashboard_widgets")
              : null;
            if (local) {
              const parsed = JSON.parse(local);
              if (parsed.order && parsed.visible) {
                const normalized = normalizeWidgetOrder(parsed.order);
                if (normalized.length > 0) setWidgetOrder(normalized);
                setWidgetVisible(parsed.visible);
              }
            }
            const localKpi = typeof window !== "undefined"
              ? window.localStorage.getItem("dashboard_kpis")
              : null;
            if (localKpi) {
              const parsed = JSON.parse(localKpi);
              const kpiIdArray = Array.from(allKpiIds);
              if (parsed.order) {
                const cleaned = (parsed.order as KpiId[]).filter((kid: string) => allKpiIds.has(kid));
                if (cleaned.length > 0) setKpiOrder(normalizeKpiOrder(cleaned, kpiIdArray));
              }
              if (parsed.visible) {
                const filtered: Record<KpiId, boolean> = {};
                Object.entries(parsed.visible).forEach(([kid, val]) => {
                  if (allKpiIds.has(kid)) filtered[kid] = val as boolean;
                });
                setKpiVisible((prev) => ({ ...prev, ...filtered }));
              }
            }
            const localCharts = typeof window !== "undefined"
              ? window.localStorage.getItem("dashboard_charts")
              : null;
            if (localCharts) {
              const parsed = JSON.parse(localCharts);
              setChartPrefs((prev) => ({ ...prev, ...parsed }));
            }
          }
        } catch (e) {
          console.warn("Preferências do dashboard não carregadas, usando padrão.", e);
          const local = typeof window !== "undefined"
            ? window.localStorage.getItem("dashboard_widgets")
            : null;
          if (local) {
            const parsed = JSON.parse(local);
            if (parsed.order && parsed.visible) {
              const normalized = normalizeWidgetOrder(parsed.order);
              if (normalized.length > 0) setWidgetOrder(normalized);
              setWidgetVisible(parsed.visible);
            }
          }
        }
      } catch (e: any) {
        if (cancelled) return;
        console.error(e);
        setErro(e?.message || "Erro ao carregar dados do dashboard.");
      } finally {
        if (cancelled) return;
        setLoadingUserCtx(false);
        setLoadingDados(false);
      }
    }

    carregarDashboard();
    return () => {
      cancelled = true;
    };
  }, [inicio, fim, userId, podeVerConsultoria, podeVerOperacao]);


  useEffect(() => {
    if (!userId) return;
    if (!widgetAtivo("consultorias") || !podeVerConsultoria) {
      setConsultoriasOnline([]);
      return;
    }

    let active = true;
    const params = new URLSearchParams({ mode: "geral" });
    const cacheKey = buildQueryLiteKey(["dashboardConsultorias", "geral", userId]);

    queryLite(
      cacheKey,
      async () => {
        const resp = await fetch(`/api/v1/dashboard/consultorias?${params.toString()}`, {
          credentials: "same-origin",
        });
        if (!resp.ok) {
          const msg = await resp.text().catch(() => "");
          throw new Error(msg || `HTTP ${resp.status}`);
        }
        return resp.json();
      },
      { ttlMs: 300_000 }
    )
      .then((payload: any) => {
        if (!active) return;
        setConsultoriasOnline((payload?.items || []) as ConsultoriaOnline[]);
      })
      .catch((e) => {
        if (!active) return;
        console.warn("Falha ao carregar consultorias.", e);
        setConsultoriasOnline([]);
      });

    return () => {
      active = false;
    };
  }, [userId, widgetVisible, podeVerConsultoria]);

  useEffect(() => {
    if (!userId) return;
    if (!widgetAtivo("viagens") || !podeVerOperacao) {
      setViagens([]);
      return;
    }

    let active = true;
    const params = new URLSearchParams({ mode: "geral" });
    const cacheKey = buildQueryLiteKey(["dashboardViagens", "geral", userId]);

    queryLite(
      cacheKey,
      async () => {
        const resp = await fetch(`/api/v1/dashboard/viagens?${params.toString()}`, {
          credentials: "same-origin",
        });
        if (!resp.ok) {
          const msg = await resp.text().catch(() => "");
          throw new Error(msg || `HTTP ${resp.status}`);
        }
        return resp.json();
      },
      { ttlMs: 300_000 }
    )
      .then((payload: any) => {
        if (!active) return;
        setViagens((payload?.items || []) as Viagem[]);
      })
      .catch((e) => {
        if (!active) return;
        console.warn("Falha ao carregar viagens.", e);
        setViagens([]);
      });

    return () => {
      active = false;
    };
  }, [userId, widgetVisible, podeVerOperacao]);

  useEffect(() => {
    if (!userId) return;
    if (!widgetAtivo("follow_up")) {
      setFollowUps([]);
      return;
    }

    let active = true;
    const params = new URLSearchParams({ mode: "geral", inicio, fim });
    const cacheKey = buildQueryLiteKey([
      "dashboardFollowUps",
      "geral",
      userId,
      inicio,
      fim,
    ]);

    queryLite(
      cacheKey,
      async () => {
        const resp = await fetch(`/api/v1/dashboard/follow-ups?${params.toString()}`, {
          credentials: "same-origin",
        });
        if (!resp.ok) {
          const msg = await resp.text().catch(() => "");
          throw new Error(msg || `HTTP ${resp.status}`);
        }
        return resp.json();
      },
      { ttlMs: 300_000 }
    )
      .then((payload: any) => {
        if (!active) return;
        setFollowUps((payload?.items || []) as FollowUpVenda[]);
      })
      .catch((e) => {
        if (!active) return;
        console.warn("Falha ao carregar follow-ups.", e);
        setFollowUps([]);
      });

    return () => {
      active = false;
    };
  }, [userId, widgetVisible, inicio, fim]);

  useEffect(() => {
    if (!userId) return;
    if (!widgetAtivo("aniversariantes_clientes")) {
      setClientesAniversariantes([]);
      return;
    }

    let active = true;
    const month = new Date().getMonth() + 1;
    const params = new URLSearchParams({ mode: "geral", month: String(month) });

    const cacheKey = buildQueryLiteKey([
      "dashboardAniversariantesClientes",
      "geral",
      userId,
      String(month),
    ]);

    queryLite(
      cacheKey,
      async () => {
        const resp = await fetch(`/api/v1/dashboard/aniversariantes?${params.toString()}`, {
          credentials: "same-origin",
        });
        if (!resp.ok) {
          const msg = await resp.text().catch(() => "");
          throw new Error(msg || `HTTP ${resp.status}`);
        }
        return resp.json();
      },
      { ttlMs: 300_000 }
    )
      .then((payload: any) => {
        if (!active) return;
        setClientesAniversariantes((payload?.items || []) as Cliente[]);
        setClientesAniversariantesMonth(Number(payload?.month || month));
      })
      .catch((e) => {
        if (!active) return;
        console.warn("Falha ao carregar aniversariantes (clientes).", e);
        setClientesAniversariantes([]);
        setClientesAniversariantesMonth(month);
      });

    return () => {
      active = false;
    };
  }, [userId, widgetVisible]);

  // ----------------- DERIVADOS: KPI -----------------

  const {
    totalVendas,
    qtdVendas,
    ticketMedio,
    totalOrcamentos,
    conversao,
    metaSomada,
    atingimentoMeta,
    metaDiaria,
    valorPorProduto,
    diasRestantes,
  } = useMemo(() => {
    const valorPorProduto: Record<string, number> = {};
    let totalVendas = 0;
    let qtdVendas = 0;
    let ticketMedio = 0;

    if (vendasAgg) {
      totalVendas = Number(vendasAgg.totalVendas || 0);
      qtdVendas = Number(vendasAgg.qtdVendas || 0);
      ticketMedio =
        Number(vendasAgg.ticketMedio || 0) || (qtdVendas > 0 ? totalVendas / qtdVendas : 0);

      (vendasAgg.porProduto || []).forEach((p) => {
        if (!p?.id) return;
        valorPorProduto[p.id] = Number((p as any).value || 0);
      });
    } else {
      qtdVendas = vendas.length;

      const getFatorComissionavel = (v: Venda) => {
        const recibosVenda = v.vendas_recibos || [];
        const totalBrutoVenda = recibosVenda.reduce((acc, r) => acc + Number(r.valor_total || 0), 0);
        const valorVenda = Number(v.valor_total || 0);
        if (totalBrutoVenda > 0 && valorVenda > 0) {
          return Math.max(0, Math.min(1, valorVenda / totalBrutoVenda));
        }
        return 1;
      };

      vendas.forEach((v) => {
        const recibos = v.vendas_recibos || [];
        const fatorComissionavel = getFatorComissionavel(v);
        let somaVenda = 0;

        recibos.forEach((r) => {
          const valor = Number(r.valor_total || 0) * fatorComissionavel;
          somaVenda += valor;
          const pid = r.produtos?.id || "";
          if (pid) {
            valorPorProduto[pid] = (valorPorProduto[pid] || 0) + valor;
          }
        });

        totalVendas += somaVenda;
      });

      ticketMedio = qtdVendas > 0 ? totalVendas / qtdVendas : 0;
    }

    const totalOrcamentos = orcamentos.length;
    const conversao =
      totalOrcamentos > 0
        ? (qtdVendas / totalOrcamentos) * 100
        : 0;

    // metas somadas do período e escopo
    // Filtro para evitar somar meta da loja + meta do vendedor no dashboard individual
    const metaSomada = metas
      .filter((m) => {
        if (m.scope === "equipe") return false;
        // Se o dashboard é de um vendedor específico (não gestor/admin),
        // mostra apenas a meta dele, não a da loja
        if (userCtx && userCtx.papel === 'VENDEDOR' && userCtx.vendedorIds.length === 1) {
          return m.vendedor_id === userCtx.usuarioId;
        }
        return true; // Para gestores/admins, soma todas
      })
      .reduce((acc, m) => acc + Number(m.meta_geral || 0), 0);
    
    const atingimentoMeta =
      metaSomada > 0 ? (totalVendas / metaSomada) * 100 : 0;
    const hoje = new Date();
    const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    const diasRestantes = Math.max(0, ultimoDia.getDate() - hoje.getDate());
    const saldoMeta = metaSomada - totalVendas;
    const metaDiaria =
      diasRestantes > 0 ? saldoMeta / diasRestantes : saldoMeta;

    return {
      totalVendas,
      qtdVendas,
      ticketMedio,
      totalOrcamentos,
      conversao,
      metaSomada,
      atingimentoMeta,
      metaDiaria,
      valorPorProduto,
      diasRestantes,
    };
  }, [vendasAgg, vendas, orcamentos, metas, userCtx]);

  // ----------------- DERIVADOS: GRÁFICOS -----------------

  const vendasPorDestinoFull = useMemo(() => {
    if (vendasAgg) {
      return (vendasAgg.topDestinos || []).map((row) => ({
        name: String((row as any)?.name || "Sem destino"),
        value: Number((row as any)?.value || 0),
      }));
    }

    const map = new Map<string, number>();

    const getFatorComissionavel = (v: Venda) => {
      const recibosVenda = v.vendas_recibos || [];
      const totalBrutoVenda = recibosVenda.reduce((acc, r) => acc + Number(r.valor_total || 0), 0);
      const valorVenda = Number(v.valor_total || 0);
      if (totalBrutoVenda > 0 && valorVenda > 0) {
        return Math.max(0, Math.min(1, valorVenda / totalBrutoVenda));
      }
      return 1;
    };

    vendas.forEach((v) => {
      const destino = v.destinos?.nome || "Sem destino";
      const fatorComissionavel = getFatorComissionavel(v);
      const totalVenda = (v.vendas_recibos || []).reduce(
        (acc, r) => acc + Number(r.valor_total || 0) * fatorComissionavel,
        0
      );
      map.set(destino, (map.get(destino) || 0) + totalVenda);
    });

    return Array.from(map.entries())
      .map(([name, value]) => ({
        name,
        value,
      }))
      .sort((a, b) => b.value - a.value);
  }, [vendasAgg, vendas]);

  const top5Destinos = useMemo(() => vendasPorDestinoFull.slice(0, 5), [vendasPorDestinoFull]);

  const vendasPorProduto = useMemo(() => {
    if (vendasAgg) {
      return (vendasAgg.porProduto || []).map((row) => ({
        name: String((row as any)?.name || "Produto"),
        value: Number((row as any)?.value || 0),
      }));
    }

    const map = new Map<string, number>();

    const getFatorComissionavel = (v: Venda) => {
      const recibosVenda = v.vendas_recibos || [];
      const totalBrutoVenda = recibosVenda.reduce((acc, r) => acc + Number(r.valor_total || 0), 0);
      const valorVenda = Number(v.valor_total || 0);
      if (totalBrutoVenda > 0 && valorVenda > 0) {
        return Math.max(0, Math.min(1, valorVenda / totalBrutoVenda));
      }
      return 1;
    };

    vendas.forEach((v) => {
      const fatorComissionavel = getFatorComissionavel(v);
      (v.vendas_recibos || []).forEach((r) => {
        const nomeProd = r.produtos?.nome || "Sem produto";
        const valor = Number(r.valor_total || 0) * fatorComissionavel;
        map.set(nomeProd, (map.get(nomeProd) || 0) + valor);
      });
    });

    return Array.from(map.entries()).map(([name, value]) => ({
      name,
      value,
    }));
  }, [vendasAgg, vendas]);

  const vendasTimeline = useMemo(() => {
    if (vendasAgg) {
      return (vendasAgg.timeline || [])
        .filter((row) => Boolean((row as any)?.date))
        .map((row) => {
          const date = String((row as any)?.date || "").slice(0, 10);
          const [year, month, day] = date.split("-");
          const label =
            year && month && day
              ? `${day.padStart(2, "0")}/${month.padStart(2, "0")}`
              : date;
          return { date, label, value: Number((row as any)?.value || 0) };
        });
    }

    const map = new Map<string, number>();

    const getFatorComissionavel = (v: Venda) => {
      const recibosVenda = v.vendas_recibos || [];
      const totalBrutoVenda = recibosVenda.reduce((acc, r) => acc + Number(r.valor_total || 0), 0);
      const valorVenda = Number(v.valor_total || 0);
      if (totalBrutoVenda > 0 && valorVenda > 0) {
        return Math.max(0, Math.min(1, valorVenda / totalBrutoVenda));
      }
      return 1;
    };

	    vendas.forEach((v) => {
	      // Normaliza para o formato YYYY-MM-DD e ignora hora/fuso para evitar rótulos deslocados
	      const dia = (v.data_venda || "").slice(0, 10);
	      if (!dia) return;
	      const fatorComissionavel = getFatorComissionavel(v);
	      const totalVenda = (v.vendas_recibos || []).reduce(
	        (acc, r) => acc + Number(r.valor_total || 0) * fatorComissionavel,
	        0
      );
      map.set(dia, (map.get(dia) || 0) + totalVenda);
    });

    const arr = Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, value]) => {
        const [year, month, day] = date.split("-");
        const label =
          year && month && day
            ? `${day.padStart(2, "0")}/${month.padStart(2, "0")}`
            : date;
        return { date, label, value };
      });

    return arr;
  }, [vendasAgg, vendas]);

  // ----------------- DERIVADOS: LISTAS -----------------

  const orcamentosRecentes = useMemo(() => {
    const sorted = [...orcamentos].sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1
    );
    return sorted.slice(0, 10);
  }, [orcamentos]);

  // A API já entrega agrupado por venda (min data_inicio, max data_fim, todos os serviços).
  const proximasViagensAgrupadas = useMemo(() => {
    return viagens
      .filter((v) => (v.status || "").toLowerCase() !== "cancelada")
      .map((v) => ({
        key: v.venda_id || v.id,
        viagemId: v.id,
        clienteId: v.clientes?.id || null,
        clienteNome: v.clientes?.nome || null,
        origem: v.origem || null,
        destino: v.destino || null,
        status: v.status || null,
        dataInicio: v.data_inicio || null,
        dataFim: v.data_fim || null,
        produtos: v.produtos_tipos?.length
          ? v.produtos_tipos
          : v.recibo?.tipo_produtos?.nome
            ? [v.recibo.tipo_produtos.nome]
            : [],
      }))
      .sort((a, b) => {
        if (!a.dataInicio && !b.dataInicio) return 0;
        if (!a.dataInicio) return 1;
        if (!b.dataInicio) return -1;
        return a.dataInicio < b.dataInicio ? -1 : a.dataInicio > b.dataInicio ? 1 : 0;
      })
      .slice(0, 10);
  }, [viagens]);

  // A API já entrega agrupado por venda (data_fim = retorno real do cliente).
  const followUpsRecentes = useMemo(() => {
    return followUps
      .filter((item) => item.follow_up_fechado !== true)
      .filter((item) => {
        const cliente = String(item.venda?.clientes?.nome || "").trim();
        const destino = String(item.venda?.destino_cidade?.nome || "").trim();
        return Boolean(cliente) && Boolean(destino);
      })
      .sort((a, b) => {
        const da = a.data_fim || a.venda?.data_final || "";
        const db = b.data_fim || b.venda?.data_final || "";
        if (da === db) return 0;
        return da < db ? 1 : -1;
      })
      .slice(0, 10);
  }, [followUps]);

  const consultoriaReminders = useMemo<ConsultoriaReminder[]>(() => {
    if (!consultoriasOnline.length) return [];
    const now = agora;
    return consultoriasOnline
      .map((consulta) => {
        const consultaAt = new Date(consulta.data_hora).getTime();
        if (!Number.isFinite(consultaAt)) return null;
        const minutos = getConsultoriaLembreteMinutes(consulta.lembrete);
        if (!minutos) return null;
        const lembreteAt = consultaAt - minutos * 60 * 1000;
        return {
          id: consulta.id,
          clienteNome: consulta.cliente_nome,
          dataHora: consulta.data_hora,
          dataHoraLocal: formatarDataHoraLocal(consulta.data_hora),
          lembrete: consulta.lembrete,
          lembreteLabel: getConsultoriaLembreteLabel(consulta.lembrete),
          lembreteAt,
          lembreteAtLocal: formatarDataHoraLocal(lembreteAt),
          consultaAt,
          destino: consulta.destino,
          orcamentoId: consulta.orcamento_id,
          msUntil: lembreteAt - now,
          statusLabel: formatarTempoRestante(lembreteAt - now),
          storageKey: `${consulta.id}-${consulta.lembrete}-${lembreteAt}`,
        } as ConsultoriaReminder;
      })
      .filter((item): item is ConsultoriaReminder => Boolean(item))
      .filter((item) => item.consultaAt > now)
      .sort((a, b) => a.lembreteAt - b.lembreteAt);
  }, [consultoriasOnline, agora]);

  const lembretesDashboard = useMemo(() => consultoriaReminders.slice(0, 8), [consultoriaReminders]);

  useEffect(() => {
    if (proximasViagensAgrupadas.length <= 3) return;
    const id = window.requestAnimationFrame(() => {
      const el = viagensScrollRef.current;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
    });
    return () => window.cancelAnimationFrame(id);
  }, [proximasViagensAgrupadas.length]);

  const renderPieLegendList = (data: { name: string; value: number }[]) => {
    if (!data.length) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {data.map((entry, idx) => (
          <div key={`${entry.name}-${idx}`} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                display: "inline-block",
                width: 10,
                height: 10,
                borderRadius: 2,
                background: COLORS_PURPLE[idx % COLORS_PURPLE.length],
              }}
            />
            <div>
              <div style={{ fontWeight: 600, color: "#0f172a" }}>{entry.name}</div>
              <div style={{ color: "#475569" }}>{formatCurrency(Number(entry.value || 0))}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const tableScrollMaxHeight = 180;
  const tableWidgetIds: WidgetId[] = [
    "aniversariantes_clientes",
    "orcamentos",
    "consultorias",
    "viagens",
    "follow_up",
  ];

  const getTableWidgetLabel = (id: WidgetId) => {
    if (id === "aniversariantes_clientes") {
      return `Aniversariantes (clientes e acompanhantes) (${clientesAniversariantes.length})`;
    }
    if (id === "orcamentos") return `Orçamentos recentes (${orcamentosRecentes.length})`;
    if (id === "consultorias") return `Lembretes de consultoria (${lembretesDashboard.length})`;
    if (id === "viagens") return `Próximas viagens (${proximasViagensAgrupadas.length})`;
    if (id === "follow_up") return `Follow-Up (${followUpsRecentes.length})`;
    return ALL_WIDGETS.find((w) => w.id === id)?.titulo || id;
  };

  const renderChartSelect = (
    value: ChartType,
    onChange: (next: ChartType) => void,
    options: Array<{ value: ChartType; label: string }>
  ) => (
    <Select
      aria-label="Selecionar tipo de gráfico"
      value={value}
      onChange={(e: React.ChangeEvent<HTMLSelectElement>) => onChange(e.target.value as ChartType)}
      className="vtur-dashboard-select"
    >
      {options.map((option) => (
        <Select.Option key={option.value} value={option.value}>
          {option.label}
        </Select.Option>
      ))}
    </Select>
  );

  const renderWidget = (
    id: WidgetId,
    options?: { hideTitle?: boolean; variant?: "default" | "plain" }
  ) => {
    const hideTitle = options?.hideTitle;
    switch (id) {
      case "kpis":
        return (
          <AppCard
            title={hideTitle ? undefined : "Indicadores do período"}
            subtitle={hideTitle ? undefined : "KPIs configuráveis para vendas, metas e produtos comissionáveis."}
            tone="info"
          >
            <div className="vtur-dashboard-kpi-grid vtur-dashboard-kpi-grid-centered">
              {kpiOrderEffective
                .filter((id) => kpiVisibleEffective[id] !== false)
                .map((id) => {
                  if (id === "kpi_vendas_total") {
                    return (
                      <div
                        className="vtur-dashboard-kpi-card"
                        key={id}
                        style={{ color: "#ca8a04" }}
                      >
                        <div className="vtur-dashboard-kpi-copy">
                          <div className="vtur-dashboard-kpi-label">Vendas no período</div>
                          <div className="vtur-dashboard-kpi-value">{formatCurrency(totalVendas)}</div>
                        </div>
                      </div>
                    );
                  }
                  if (id === "kpi_qtd_vendas") {
                    return (
                      <div
                        className="vtur-dashboard-kpi-card"
                        key={id}
                        style={{ color: "#0ea5e9" }}
                      >
                        <div className="vtur-dashboard-kpi-copy">
                          <div className="vtur-dashboard-kpi-label">Qtd. vendas</div>
                          <div className="vtur-dashboard-kpi-value">{qtdVendas}</div>
                        </div>
                      </div>
                    );
                  }
                  if (id === "kpi_ticket_medio") {
                    return (
                      <div
                        className="vtur-dashboard-kpi-card"
                        key={id}
                        style={{ color: "#0ea5e9" }}
                      >
                        <div className="vtur-dashboard-kpi-copy">
                          <div className="vtur-dashboard-kpi-label">Ticket médio</div>
                          <div className="vtur-dashboard-kpi-value">{formatCurrency(ticketMedio)}</div>
                        </div>
                      </div>
                    );
                  }
                  if (id === "kpi_orcamentos") {
                    return (
                      <div
                        className="vtur-dashboard-kpi-card"
                        key={id}
                        style={{ color: "#16a34a" }}
                      >
                        <div className="vtur-dashboard-kpi-copy">
                          <div className="vtur-dashboard-kpi-label">Orçamentos</div>
                          <div className="vtur-dashboard-kpi-value">{totalOrcamentos}</div>
                        </div>
                      </div>
                    );
                  }
                  if (id === "kpi_conversao") {
                    return (
                      <div
                        className="vtur-dashboard-kpi-card"
                        key={id}
                        style={{ color: "#c2410c" }}
                      >
                        <div className="vtur-dashboard-kpi-copy">
                          <div className="vtur-dashboard-kpi-label">Conv. Orc → Vendas</div>
                          <div className="vtur-dashboard-kpi-value">{conversao.toFixed(1)}%</div>
                        </div>
                      </div>
                    );
                  }
                  if (id === "kpi_meta") {
                    return (
                      <div
                        className="vtur-dashboard-kpi-card"
                        key={id}
                        style={{ color: "#16a34a" }}
                      >
                        <div className="vtur-dashboard-kpi-copy">
                          <div className="vtur-dashboard-kpi-label">Meta do mês</div>
                          <div className="vtur-dashboard-kpi-value">{formatCurrency(metaSomada)}</div>
                        </div>
                      </div>
                    );
                  }
                  if (id === "kpi_meta_diaria") {
                    return (
                      <div
                        className="vtur-dashboard-kpi-card"
                        key={id}
                        style={{ color: "#0ea5e9" }}
                      >
                        <div className="vtur-dashboard-kpi-copy">
                          <div className="vtur-dashboard-kpi-label">Meta diária</div>
                          <div className="vtur-dashboard-kpi-value">{formatCurrency(metaDiaria)}</div>
                        </div>
                      </div>
                    );
                  }
                  if (id === "kpi_atingimento") {
                    return (
                      <div
                        className="vtur-dashboard-kpi-card"
                        key={id}
                        style={{ color: "#c2410c" }}
                      >
                        <div className="vtur-dashboard-kpi-copy">
                          <div className="vtur-dashboard-kpi-label">Atingimento meta</div>
                          <div className="vtur-dashboard-kpi-value">{atingimentoMeta.toFixed(1)}%</div>
                        </div>
                      </div>
                    );
                  }
                  if (id === "kpi_dias_restantes") {
                    return (
                      <div
                        className="vtur-dashboard-kpi-card"
                        key={id}
                        style={{ color: "#2563eb" }}
                      >
                        <div className="vtur-dashboard-kpi-copy">
                          <div className="vtur-dashboard-kpi-label">Dias restantes</div>
                          <div className="vtur-dashboard-kpi-value">{diasRestantes}</div>
                        </div>
                      </div>
                    );
                  }
                  if (id.startsWith("kpi_prod_")) {
                    const prod = kpiProdutos.find((k) => k.id === id);
                    const valor = prod ? valorPorProduto[prod.produtoId] || 0 : 0;
                    const titulo = prod?.titulo || "Produto";
                    const isSeguroViagem = titulo.toLowerCase().includes("seguro viagem");
                    return (
                      <div
                        className="vtur-dashboard-kpi-card"
                        key={id}
                        style={isSeguroViagem ? { color: "#6d28d9" } : undefined}
                      >
                        <div className="vtur-dashboard-kpi-copy">
                          <div className="vtur-dashboard-kpi-label">{titulo}</div>
                          <div className="vtur-dashboard-kpi-value">{formatCurrency(valor)}</div>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })}
            </div>
          </AppCard>
        );
      case "vendas_destino": {
        const tituloDestino =
          chartPrefsEffective.vendas_destino === "bar"
            ? "Vendas por Destino (Visão completa)"
            : "Vendas por destino (Top 5)";
        const destinoBarConfig = toBarChartConfig(
          vendasPorDestinoFull.map((item) => ({ label: item.name, value: item.value })),
          formatCurrency,
          true
        );
        const destinoPieConfig = toPieChartConfig(top5Destinos);
        return (
          <AppCard
            title={hideTitle ? undefined : tituloDestino}
            subtitle={hideTitle ? undefined : "Compare a distribuição geográfica das vendas no período."}
            tone="info"
            actions={
              renderChartSelect(chartPrefsEffective.vendas_destino || "bar", (next) => alterarChart("vendas_destino", next), [
                { value: "bar", label: "Barras" },
                ...(!isMobile ? [{ value: "pie" as ChartType, label: "Pizza" }] : []),
              ])
            }
          >
            <div style={{ width: "100%", height: 260 }}>
              {vendasPorDestinoFull.length === 0 ? (
                <div style={{ fontSize: "0.9rem" }}>Sem dados para o período.</div>
              ) : chartPrefsEffective.vendas_destino === "bar" ? (
                <Chart
                  type="bar"
                  data={destinoBarConfig.data}
                  options={destinoBarConfig.options as any}
                  style={{ width: "100%", height: "100%" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    minHeight: 220,
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      flex: "1 1 220px",
                      minWidth: 180,
                      maxWidth: 260,
                      height: 220,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Chart
                      type="pie"
                      data={destinoPieConfig.data}
                      options={destinoPieConfig.options as any}
                      style={{ width: "100%", height: "180px" }}
                    />
                  </div>
                  <div
                    style={{
                      flex: "0 0 180px",
                      minWidth: 140,
                      maxWidth: 200,
                      maxHeight: 220,
                      padding: 8,
                      boxSizing: "border-box",
                      overflowY: "auto",
                      borderRadius: 8,
                      background: "#0f172a10",
                      marginLeft: 8,
                    }}
                  >
                    {renderPieLegendList(top5Destinos)}
                  </div>
                </div>
              )}
            </div>
          </AppCard>
        );
      }
      case "vendas_produto":
        const produtoBarConfig = toBarChartConfig(
          vendasPorProduto.map((item) => ({ label: item.name, value: item.value })),
          formatCurrency,
          true
        );
        const produtoPieConfig = toPieChartConfig(vendasPorProduto);
        return (
          <AppCard
            title={hideTitle ? undefined : "Vendas por produto"}
            subtitle={hideTitle ? undefined : "Distribuição de receita por tipo de produto vendido."}
            tone="info"
            actions={
              renderChartSelect(chartPrefsEffective.vendas_produto || "bar", (next) => alterarChart("vendas_produto", next), [
                { value: "bar", label: "Barras" },
                ...(!isMobile ? [{ value: "pie" as ChartType, label: "Pizza" }] : []),
              ])
            }
          >
            <div style={{ width: "100%", height: 260 }}>
              {vendasPorProduto.length === 0 ? (
                <div style={{ fontSize: "0.9rem" }}>Sem dados para o período.</div>
              ) : chartPrefsEffective.vendas_produto === "pie" ? (
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: 220,
                    flexWrap: "wrap",
                  }}
                >
                  <div
                    style={{
                      flex: "1 1 220px",
                      minWidth: 180,
                      maxWidth: 260,
                      height: 220,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Chart
                      type="pie"
                      data={produtoPieConfig.data}
                      options={produtoPieConfig.options as any}
                      style={{ width: "100%", height: "180px" }}
                    />
                  </div>
                  <div
                    style={{
                      flex: "0 0 180px",
                      minWidth: 140,
                      maxWidth: 200,
                      maxHeight: 220,
                      padding: 8,
                      boxSizing: "border-box",
                      overflowY: "auto",
                      borderRadius: 8,
                      background: "#0f172a10",
                      marginLeft: 8,
                    }}
                  >
                    {renderPieLegendList(vendasPorProduto)}
                  </div>
                </div>
              ) : (
                <Chart
                  type="bar"
                  data={produtoBarConfig.data}
                  options={produtoBarConfig.options as any}
                  style={{ width: "100%", height: "100%" }}
                />
              )}
            </div>
          </AppCard>
        );
      case "timeline":
        const timelineBarConfig = toBarChartConfig(
          vendasTimeline.map((item) => ({ label: item.label, value: item.value })),
          formatCurrency
        );
        const timelineLineConfig = toLineChartConfig(
          vendasTimeline.map((item) => ({ label: item.label, value: item.value })),
          formatCurrency
        );
        return (
          <AppCard
            title={hideTitle ? undefined : "Evolução das vendas no período"}
            subtitle={hideTitle ? undefined : "Linha temporal para acompanhar o ritmo comercial."}
            tone="info"
            actions={renderChartSelect(chartPrefs.timeline || "line", (next) => alterarChart("timeline", next), [
              { value: "line", label: "Linha" },
              { value: "bar", label: "Barras" },
            ])}
          >
            <div style={{ width: "100%", height: 260 }}>
              {vendasTimeline.length === 0 ? (
                <div style={{ fontSize: "0.9rem" }}>Sem dados para o período.</div>
              ) : chartPrefs.timeline === "bar" ? (
                <Chart
                  type="bar"
                  data={timelineBarConfig.data}
                  options={timelineBarConfig.options as any}
                  style={{ width: "100%", height: "100%" }}
                />
              ) : (
                <Chart
                  type="line"
                  data={timelineLineConfig.data}
                  options={timelineLineConfig.options as any}
                  style={{ width: "100%", height: "100%" }}
                />
              )}
            </div>
          </AppCard>
        );
      case "aniversariantes_clientes": {
        const monthNames = [
          "Janeiro",
          "Fevereiro",
          "Março",
          "Abril",
          "Maio",
          "Junho",
          "Julho",
          "Agosto",
          "Setembro",
          "Outubro",
          "Novembro",
          "Dezembro",
        ];
        const monthLabel = monthNames[(clientesAniversariantesMonth || 1) - 1] || "Mês";
        const items = [...clientesAniversariantes].sort((a, b) => {
          const da = String(a.nascimento || "").split("-");
          const db = String(b.nascimento || "").split("-");
          const dayA = da.length >= 3 ? Number(da[2]) : 0;
          const dayB = db.length >= 3 ? Number(db[2]) : 0;
          return dayA - dayB;
        });

        const shouldScroll = items.length > 6;
        return (
          <AppCard
            className={hideTitle ? undefined : "dashboard-widget-table-card"}
            title={hideTitle ? undefined : `Aniversariantes - ${monthLabel} (${items.length})`}
            subtitle={hideTitle ? undefined : "Clientes e acompanhantes com aniversário neste mês."}
            tone="info"
          >
            <DataTable
              headers={
                <tr>
                  <th>Cliente</th>
                  <th>Nascimento</th>
                  <th>Telefone</th>
                  <th className="th-actions">Ações</th>
                </tr>
              }
              empty={items.length === 0}
              emptyMessage="Nenhum aniversariante de cliente/acompanhante este mês."
              colSpan={4}
              className="table-mobile-cards table-header-blue min-w-[640px]"
              containerStyle={{
                maxHeight: shouldScroll ? tableScrollMaxHeight : undefined,
                overflowY: shouldScroll ? "auto" : "visible",
              }}
            >
              {items.map((c) => {
                const cardUrl = construirUrlCartaoAniversario(c.nome, assinaturaUsuario);
                const mensagemBase = montarMensagemAniversario(c.nome, assinaturaUsuario);
                const mensagem = cardUrl ? `${mensagemBase}\n\nCartão: ${cardUrl}` : mensagemBase;
                const whatsappLink = construirLinkWhatsAppComTexto(c.telefone, mensagem, "55");
                return (
                  <tr key={c.id}>
                    <td data-label="Cliente">
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span aria-hidden="true">
                          <i className={c.pessoa_tipo === "acompanhante" ? "pi pi-users" : "pi pi-user"} />
                        </span>
                        <span>{c.nome || "-"}</span>
                      </span>
                    </td>
                    <td data-label="Nascimento">
                      {c.nascimento ? formatarDataParaExibicao(c.nascimento) : "-"}
                    </td>
                    <td data-label="Telefone">{c.telefone || "-"}</td>
                    <td className="th-actions" data-label="Ações">
                      <TableActions
                        actions={[
                          ...(whatsappLink
                            ? [
                                {
                                  key: "whatsapp",
                                  label: "WhatsApp",
                                  title: "Enviar cartão de aniversário no WhatsApp",
                                  onClick: () => window.open(whatsappLink, "_blank", "noopener,noreferrer"),
                                  icon: <i className="pi pi-gift" aria-hidden="true" />,
                                  variant: "ghost" as const,
                                },
                              ]
                            : []),
                          ...(c.cliente_id
                            ? [
                                {
                                  key: "cliente",
                                  label: "Cliente",
                                  title:
                                    c.pessoa_tipo === "acompanhante"
                                      ? "Ver cliente titular do acompanhante"
                                      : "Ver cliente",
                                  onClick: () => {
                                    window.location.href = `/clientes/cadastro?id=${c.cliente_id}`;
                                  },
                                  icon: <i className="pi pi-user" aria-hidden="true" />,
                                  variant: "ghost" as const,
                                },
                              ]
                            : []),
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </AppCard>
        );
      }
      case "orcamentos": {
        const shouldScrollOrcamentos = orcamentosRecentes.length > 3;
        return (
          <AppCard
            className={hideTitle ? undefined : "dashboard-widget-table-card"}
            title={hideTitle ? undefined : `Orçamentos recentes (${orcamentosRecentes.length})`}
            subtitle={hideTitle ? undefined : "Últimas propostas comerciais do período."}
            tone="info"
          >
            <DataTable
              headers={
                <tr>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Destino</th>
                  <th>Status</th>
                  <th>Valor</th>
                  <th className="th-actions">Ações</th>
                </tr>
              }
              empty={orcamentosRecentes.length === 0}
              emptyMessage="Nenhum orçamento no período."
              colSpan={6}
              className="table-mobile-cards table-header-blue min-w-[680px]"
              containerStyle={{
                maxHeight: shouldScrollOrcamentos ? tableScrollMaxHeight : undefined,
                overflowY: shouldScrollOrcamentos ? "auto" : "visible",
              }}
            >
              {orcamentosRecentes.map((o) => (
                <tr key={o.id}>
                  <td data-label="Data">{formatarDataParaExibicao(o.created_at)}</td>
                  <td data-label="Cliente">{o.cliente?.nome || "-"}</td>
                  <td data-label="Destino">{getOrcamentoDestino(o)}</td>
                  <td data-label="Status">{o.status_negociacao || o.status || "-"}</td>
                  <td data-label="Valor">{formatCurrency(Number(o.total || 0))}</td>
                  <td className="th-actions" data-label="Ações">
                    <TableActions
                      actions={[
                        {
                          key: "ver",
                          label: "Ver",
                          title: "Ver detalhes",
                          onClick: () => setOrcamentoSelecionado(o),
                          icon: <i className="pi pi-eye" aria-hidden="true" />,
                          variant: "ghost",
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </DataTable>
          </AppCard>
        );
      }
      case "consultorias": {
        const shouldScrollConsultorias = lembretesDashboard.length > 3;
        return (
          <AppCard
            title={hideTitle ? undefined : `Lembretes de consultoria (${lembretesDashboard.length})`}
            subtitle={hideTitle ? undefined : "Agendamentos futuros com janela de lembrete ativa."}
            tone="info"
          >
            {!podeVerConsultoria ? (
              <AlertMessage variant="warning">Você não possui acesso ao módulo de Consultoria.</AlertMessage>
            ) : (
              <DataTable
                headers={
                  <tr>
                    <th>Cliente</th>
                    <th>Lembrete</th>
                    <th>Agendamento</th>
                    <th>Destino</th>
                    <th className="th-actions">Ações</th>
                  </tr>
                }
                empty={lembretesDashboard.length === 0}
                emptyMessage="Nenhum lembrete de consultoria."
                colSpan={5}
                className="table-mobile-cards table-header-blue min-w-[720px]"
                containerStyle={{
                  maxHeight: shouldScrollConsultorias ? tableScrollMaxHeight : undefined,
                  overflowY: shouldScrollConsultorias ? "auto" : "visible",
                }}
              >
                {lembretesDashboard.map((item) => (
                  <tr key={item.storageKey}>
                    <td data-label="Cliente">{item.clienteNome}</td>
                    <td data-label="Lembrete">
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <span>{item.lembreteLabel}</span>
                        <small>{item.lembreteAtLocal}</small>
                        <small>{item.statusLabel}</small>
                      </div>
                    </td>
                    <td data-label="Agendamento">
                      {item.dataHoraLocal}
                      <br />
                      <small>
                        <a className="link" href={`/api/consultorias/ics?id=${item.id}`} target="_blank" rel="noreferrer">
                          Adicionar ao calendário
                        </a>
                      </small>
                    </td>
                    <td data-label="Destino">{item.destino || "-"}</td>
                    <td className="th-actions" data-label="Ações">
                      <TableActions
                        actions={[
                          item.orcamentoId
                            ? {
                                key: "orcamento",
                                label: "Orçamento",
                                title: "Abrir orçamento",
                                onClick: () => {
                                  window.location.href = `/orcamentos/${item.orcamentoId}`;
                                },
                                icon: <i className="pi pi-eye" aria-hidden="true" />,
                                variant: "ghost" as const,
                              }
                            : {
                                key: "consultoria",
                                label: "Consultoria",
                                title: "Abrir consultorias",
                                onClick: () => {
                                  window.location.href = "/consultoria-online";
                                },
                                icon: <i className="pi pi-calendar" aria-hidden="true" />,
                                variant: "ghost" as const,
                              },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </AppCard>
        );
      }
      case "viagens": {
        const shouldScrollViagens = proximasViagensAgrupadas.length > 3;
        return (
          <AppCard
            className={hideTitle ? undefined : "dashboard-widget-table-card"}
            title={hideTitle ? undefined : `Próximas viagens (${proximasViagensAgrupadas.length})`}
            subtitle={hideTitle ? undefined : "Embarques futuros agrupados por venda."}
            tone="info"
          >
            {!podeVerOperacao ? (
              <AlertMessage variant="warning">Você não possui acesso ao módulo de Operação/Viagens.</AlertMessage>
            ) : (
              <DataTable
                headers={
                  <tr>
                    <th>Cliente</th>
                    <th>Serviços</th>
                    <th>Embarque</th>
                    <th>Destino</th>
                    <th className="th-actions">Ações</th>
                  </tr>
                }
                empty={proximasViagensAgrupadas.length === 0}
                emptyMessage="Nenhuma viagem futura."
                colSpan={5}
                className="table-mobile-cards table-header-blue min-w-[760px]"
                containerStyle={{
                  maxHeight: shouldScrollViagens ? tableScrollMaxHeight : undefined,
                  overflowY: shouldScrollViagens ? "auto" : "visible",
                }}
                containerClassName="vtur-dashboard-scroll-table"
              >
                {proximasViagensAgrupadas.map((v) => (
                  <tr key={v.key}>
                    <td data-label="Cliente">{v.clienteNome || "-"}</td>
                    <td data-label="Serviços">
                      {v.produtos.length === 0 ? (
                        "-"
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {v.produtos.map((p, idx) => (
                            <span key={`${v.key}-prod-${idx}`}>{p}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td data-label="Embarque">{formatarDataParaExibicao(v.dataInicio)}</td>
                    <td data-label="Destino">{v.destino || "-"}</td>
                    <td className="th-actions" data-label="Ações">
                      <TableActions
                        actions={[
                          ...(v.clienteId
                            ? [
                                {
                                  key: "cliente",
                                  label: "Cliente",
                                  title: "Ver cliente",
                                  onClick: () => {
                                    window.location.href = `/clientes/cadastro?id=${v.clienteId}`;
                                  },
                                  icon: <i className="pi pi-user" aria-hidden="true" />,
                                  variant: "ghost" as const,
                                },
                              ]
                            : []),
                          {
                            key: "viagem",
                            label: "Viagem",
                            title: "Ver viagem",
                            onClick: () => {
                              window.location.href = `/operacao/viagens/${v.viagemId}`;
                            },
                            icon: <i className="pi pi-eye" aria-hidden="true" />,
                            variant: "ghost" as const,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </AppCard>
        );
      }
      case "follow_up": {
        const shouldScrollFollowUp = followUpsRecentes.length > 3;
        return (
          <AppCard
            className={hideTitle ? undefined : "dashboard-widget-table-card"}
            title={hideTitle ? undefined : `Follow-Up (${followUpsRecentes.length})`}
            subtitle={hideTitle ? undefined : "Clientes que já retornaram e precisam de contato."}
            tone="info"
          >
            <DataTable
              headers={
                <tr>
                  <th>Cliente</th>
                  <th>Destino</th>
                  <th>Embarque</th>
                  <th>Retorno</th>
                  <th className="th-actions">Ações</th>
                </tr>
              }
              empty={followUpsRecentes.length === 0}
              emptyMessage="Nenhum retorno no período."
              colSpan={5}
              className="table-mobile-cards table-header-blue min-w-[640px]"
              containerStyle={{
                maxHeight: shouldScrollFollowUp ? tableScrollMaxHeight : undefined,
                overflowY: shouldScrollFollowUp ? "auto" : "visible",
              }}
            >
              {followUpsRecentes.map((item) => {
                const mensagem = montarMensagemFollowUp(item.venda?.clientes?.nome, assinaturaUsuario);
                const whatsappLink = construirLinkWhatsAppComTexto(
                  item.venda?.clientes?.whatsapp || item.venda?.clientes?.telefone || null,
                  mensagem,
                  "55"
                );
                return (
                  <tr key={item.id}>
                    <td data-label="Cliente">{item.venda?.clientes?.nome || "-"}</td>
                    <td data-label="Destino">{item.venda?.destino_cidade?.nome || "-"}</td>
                    <td data-label="Embarque">
                      {formatarDataParaExibicao(item.data_inicio || item.venda?.data_embarque || "")}
                    </td>
                    <td data-label="Retorno">
                      {formatarDataParaExibicao(item.data_fim || item.venda?.data_final || "")}
                    </td>
                    <td className="th-actions" data-label="Ações">
                      <TableActions
                        actions={[
                          ...(item.venda?.clientes?.id
                            ? [
                                {
                                  key: "cliente",
                                  label: "Cliente",
                                  title: "Ver cliente",
                                  onClick: () => {
                                    window.location.href = `/clientes/cadastro?id=${item.venda?.clientes?.id}`;
                                  },
                                  icon: <i className="pi pi-user" aria-hidden="true" />,
                                  variant: "ghost" as const,
                                },
                              ]
                            : []),
                          ...(whatsappLink
                            ? [
                                {
                                  key: "whatsapp",
                                  label: "WhatsApp",
                                  title: "Enviar follow-up no WhatsApp",
                                  onClick: () => window.open(whatsappLink, "_blank", "noopener,noreferrer"),
                                  icon: <i className="pi pi-comments" aria-hidden="true" />,
                                  variant: "ghost" as const,
                                },
                              ]
                            : []),
                          {
                            key: "viagem",
                            label: "Viagem",
                            title: "Ver viagem",
                            onClick: () => {
                              window.location.href = `/operacao/viagens/${item.id}`;
                            },
                            icon: <i className="pi pi-eye" aria-hidden="true" />,
                            variant: "ghost" as const,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          </AppCard>
        );
      }
      default:
        return null;
    }
  };

  // ----------------- RENDER -----------------

  const tableWidgets = widgetOrder.filter(
    (id) => tableWidgetIds.includes(id) && widgetAtivo(id as WidgetId)
  );

  // Evita ficar preso no estado de carregamento caso o hook demore,
  // liberando a renderização assim que já houver contexto básico.

  if ((loadingUserCtx && !userCtx) || loadingPerm) {
    return <LoadingUsuarioContext />;
  }

  if (!podeVerDashboard) {
    return (
      <AppPrimerProvider>
        <div className="page-content-wrap dashboard-geral-page">
          <AppCard tone="config">Você não possui acesso ao módulo de Dashboard.</AppCard>
        </div>
      </AppPrimerProvider>
    );
  }


  return (
    <AppPrimerProvider>
      <div className="page-content-wrap dashboard-geral-page vtur-dashboard-shell">
        <AppCard
          className="dashboard-top-card"
          title="Dashboard comercial"
          subtitle="Acompanhe vendas, metas, orçamentos, consultorias, viagens e follow-up com personalização por widget."
          tone="info"
          actions={
            <div className="vtur-dashboard-toolbar-actions">
              <div className="vtur-dashboard-mobile-quick-actions sm:hidden">
                <AppButton
                  type="button"
                  variant="secondary"
                  className="dashboard-mobile-filter-btn"
                  onClick={() => setShowFilters(true)}
                >
                  Filtros
                </AppButton>
                <AppButton
                  type="button"
                  variant="secondary"
                  className="btn-calculator-trigger dashboard-mobile-calculator-btn"
                  onClick={() => setShowCalculator(true)}
                  aria-label="Calculadora"
                  title="Calculadora"
                >
                  <i className="pi pi-calculator" aria-hidden="true" />
                </AppButton>
              </div>
              <AppButton type="button" variant="primary" onClick={() => setShowCustomize(true)}>
                Personalizar dashboard
              </AppButton>
              {showRankingView && (
                <AppButton as="a" href="/relatorios/ranking-vendas/view" variant="secondary">
                  Ranking de vendas
                </AppButton>
              )}
              <AppButton
                type="button"
                variant="secondary"
                className="btn-calculator-trigger hidden sm:inline-flex"
                onClick={() => setShowCalculator(true)}
                aria-label="Calculadora"
                title="Calculadora"
              >
                <i className="pi pi-calculator" aria-hidden="true" />
              </AppButton>
            </div>
          }
        >
          <div className="hidden sm:block">
            <div className="vtur-dashboard-preset-row">
              <AppButton
                type="button"
                variant={presetPeriodo === "mes_atual" ? "primary" : "secondary"}
                onClick={() => aplicarPreset("mes_atual")}
              >
                Mês atual
              </AppButton>
              <AppButton
                type="button"
                variant={presetPeriodo === "ultimos_30" ? "primary" : "secondary"}
                onClick={() => aplicarPreset("ultimos_30")}
              >
                Últimos 30 dias
              </AppButton>
              <AppButton
                type="button"
                variant={presetPeriodo === "personalizado" ? "primary" : "secondary"}
                onClick={() => setPresetPeriodo("personalizado")}
              >
                Personalizado
              </AppButton>
            </div>
            <div className="vtur-form-grid vtur-form-grid-2">
              <AppField
                label="Data Início"
                type="date"
                value={inicio}
                onFocus={selectAllInputOnFocus}
                onChange={(e) => {
                  const nextInicio = e.target.value;
                  setPresetPeriodo("personalizado");
                  setInicio(nextInicio);
                  setFim((prev) => boundDateEndISO(nextInicio, prev));
                }}
              />
              <AppField
                label="Data Final"
                type="date"
                value={fim}
                min={inicio || undefined}
                onFocus={selectAllInputOnFocus}
                onChange={(e) => {
                  setPresetPeriodo("personalizado");
                  const nextFim = e.target.value;
                  setFim(boundDateEndISO(inicio, nextFim));
                }}
              />
            </div>
          </div>
        </AppCard>

        {showFilters && (
          <Dialog
            title="Filtros"
            onClose={() => setShowFilters(false)}
            footerButtons={[
              {
                content: "Aplicar filtros",
                buttonType: "primary",
                onClick: () => setShowFilters(false),
              },
            ]}
          >
            <div className="vtur-modal-body-stack">
              <AppCard title="Período" subtitle="Defina rapidamente o recorte temporal do dashboard.">
                <div className="vtur-form-grid vtur-form-grid-2">
                  <AppField
                    as="select"
                    label="Preset"
                    value={presetPeriodo}
                    onChange={(e) => aplicarPreset(e.target.value as PresetPeriodo)}
                    options={[
                      { value: "mes_atual", label: "Mês atual" },
                      { value: "ultimos_30", label: "Últimos 30 dias" },
                      { value: "personalizado", label: "Personalizado" },
                    ]}
                  />
                  {presetPeriodo === "personalizado" && (
                    <>
                      <AppField
                        label="Data Início"
                        type="date"
                        value={inicio}
                        onFocus={selectAllInputOnFocus}
                        onChange={(e) => {
                          const nextInicio = e.target.value;
                          setPresetPeriodo("personalizado");
                          setInicio(nextInicio);
                          setFim((prev) => boundDateEndISO(nextInicio, prev));
                        }}
                      />
                      <AppField
                        label="Data Final"
                        type="date"
                        value={fim}
                        min={inicio || undefined}
                        onFocus={selectAllInputOnFocus}
                        onChange={(e) => {
                          setPresetPeriodo("personalizado");
                          const nextFim = e.target.value;
                          setFim(boundDateEndISO(inicio, nextFim));
                        }}
                      />
                    </>
                  )}
                </div>
              </AppCard>
            </div>
          </Dialog>
        )}

        {widgetAtivo("kpis") && <div>{renderWidget("kpis")}</div>}

        <div className="vtur-dashboard-chart-grid">
          {widgetOrder
            .filter((id) => ["vendas_destino", "vendas_produto", "timeline"].includes(id) && widgetAtivo(id as WidgetId))
            .map((id) => (
              <div key={id}>{renderWidget(id as WidgetId)}</div>
            ))}
        </div>

        {tableWidgets.length > 0 && (
          <>
            {tableWidgets.map((id) => {
              const node = renderWidget(id as WidgetId);
              if (!node) return null;

              const aberto = mobileWidgetOpen[id];
              const label = getTableWidgetLabel(id as WidgetId);

              return (
                <React.Fragment key={id}>
                  <div className="mobile-only">
                    <AppButton
                      type="button"
                      variant={aberto ? "primary" : "secondary"}
                      block
                      onClick={() => toggleMobileWidget(id as WidgetId)}
                    >
                      {label}
                    </AppButton>
                    {aberto && (
                      <div style={{ marginTop: 12 }}>
                        {renderWidget(id as WidgetId, { hideTitle: true, variant: "plain" })}
                      </div>
                    )}
                  </div>
                  <div className="hidden sm:block">{node}</div>
                </React.Fragment>
              );
            })}
          </>
        )}

        {showCustomize && (
          <Dialog
            title="Personalizar dashboard"
            width="large"
            onClose={() => setShowCustomize(false)}
            footerButtons={[
              {
                content: "Fechar",
                buttonType: "primary",
                onClick: () => setShowCustomize(false),
              },
            ]}
          >
            <div className="vtur-modal-body-stack">
              <AppCard title="Widgets" subtitle="Defina a visibilidade e a ordem dos blocos.">
                <div className="vtur-dashboard-config-list">
                  {widgetOrder.map((id, idx) => {
                    const meta = ALL_WIDGETS.find((w) => w.id === id);
                    if (!meta) return null;
                    return (
                      <div key={id} className="vtur-dashboard-config-item">
                        <label className="vtur-dashboard-checkbox-row">
                          <input type="checkbox" checked={widgetAtivo(id)} onChange={() => toggleWidget(id)} />
                          <span>{meta.titulo}</span>
                        </label>
                        <div className="vtur-dashboard-config-actions">
                          <AppButton
                            type="button"
                            variant="ghost"
                            onClick={() => moverWidget(id, "up")}
                            disabled={idx === 0}
                          >
                            ↑
                          </AppButton>
                          <AppButton
                            type="button"
                            variant="ghost"
                            onClick={() => moverWidget(id, "down")}
                            disabled={idx === widgetOrder.length - 1}
                          >
                            ↓
                          </AppButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AppCard>

              <AppCard title="KPIs" subtitle="Escolha quais indicadores ficam visiveis e sua ordem.">
                <div className="vtur-dashboard-config-list">
                  {kpiOrderEffective.map((kid, kidx) => {
                    const metaKpi = allKpis.find((k) => k.id === kid);
                    if (!metaKpi) return null;
                    return (
                      <div key={kid} className="vtur-dashboard-config-item">
                        <label className="vtur-dashboard-checkbox-row">
                          <input
                            type="checkbox"
                            checked={kpiVisibleEffective[kid] !== false}
                            onChange={() => toggleKpi(kid)}
                          />
                          <span>{metaKpi.titulo}</span>
                        </label>
                        <div className="vtur-dashboard-config-actions">
                          <AppButton
                            type="button"
                            variant="ghost"
                            onClick={() => moverKpi(kid, "up")}
                            disabled={kidx === 0}
                          >
                            ↑
                          </AppButton>
                          <AppButton
                            type="button"
                            variant="ghost"
                            onClick={() => moverKpi(kid, "down")}
                            disabled={kidx === kpiOrderEffective.length - 1}
                          >
                            ↓
                          </AppButton>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </AppCard>
            </div>
          </Dialog>
        )}

        <CalculatorModal open={showCalculator} onClose={() => setShowCalculator(false)} />

        {orcamentoSelecionado && (
          <Dialog
            title={orcamentoSelecionado.cliente?.nome || "-"}
            width="large"
            onClose={() => setOrcamentoSelecionado(null)}
            footerButtons={[
              {
                content: "Fechar",
                buttonType: "primary",
                onClick: () => setOrcamentoSelecionado(null),
              },
            ]}
          >
            <div className="vtur-modal-body-stack">
              <AppCard
                tone="info"
                title="Resumo do orçamento"
                subtitle={`Status ${orcamentoSelecionado.status_negociacao || orcamentoSelecionado.status || "-"} · Total ${formatCurrency(Number(orcamentoSelecionado.total || 0))}`}
              >
                <div className="vtur-dashboard-detail-grid">
                  <div>
                    <strong>Destino:</strong> {getOrcamentoDestino(orcamentoSelecionado)}
                  </div>
                  <div>
                    <strong>Criado em:</strong> {formatarDataParaExibicao(orcamentoSelecionado.created_at)}
                  </div>
                  <div>
                    <strong>Status:</strong> {orcamentoSelecionado.status_negociacao || orcamentoSelecionado.status || "-"}
                  </div>
                  <div>
                    <strong>Valor:</strong> {formatCurrency(Number(orcamentoSelecionado.total || 0))}
                  </div>
                </div>
              </AppCard>

              <AppCard title="Itens do orçamento" subtitle="Resumo dos itens vinculados a esta proposta.">
                <DataTable
                  headers={
                    <tr>
                      <th>Item</th>
                      <th>Tipo</th>
                      <th>Cidade</th>
                    </tr>
                  }
                  empty={(orcamentoSelecionado.quote_item || []).length === 0}
                  emptyMessage="Nenhum item encontrado."
                  colSpan={3}
                  className="table-mobile-cards table-header-blue"
                >
                  {(orcamentoSelecionado.quote_item || []).map((item, idx) => (
                    <tr key={`${orcamentoSelecionado.id}-${item.id || idx}`}>
                      <td data-label="Item">{item.title || item.product_name || "-"}</td>
                      <td data-label="Tipo">{item.item_type || "-"}</td>
                      <td data-label="Cidade">{item.city_name || "-"}</td>
                    </tr>
                  ))}
                </DataTable>
              </AppCard>
            </div>
          </Dialog>
        )}

        {erro && <AlertMessage variant="error">{erro}</AlertMessage>}
        {loadingDados && <AppCard tone="config">Carregando dados do dashboard...</AppCard>}
      </div>
    </AppPrimerProvider>
  );
};

const DashboardGeralIsland: React.FC = () => {
  return (
    <IslandErrorBoundary name="DashboardGeralIsland">
      <DashboardGeralIslandInner />
    </IslandErrorBoundary>
  );
};

export default DashboardGeralIsland;
