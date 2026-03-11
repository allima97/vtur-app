import { Dialog } from "@primer/react";
import React, { useEffect, useMemo, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { buildQueryLiteKey, queryLite } from "../../lib/queryLite";
import { supabase } from "../../lib/supabase";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import IslandErrorBoundary from "../ui/IslandErrorBoundary";
import { formatarDataParaExibicao } from "../../lib/formatDate";
import { formatCurrencyBRL, formatDateBR } from "../../lib/format";
import { useMasterScope } from "../../lib/useMasterScope";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import TableActions from "../ui/TableActions";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";
import {
  construirLinkWhatsAppComTexto,
  construirUrlCartaoAniversario,
  montarMensagemAniversario,
  montarMensagemFollowUp,
} from "../../lib/whatsapp";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
} from "recharts";

type Papel = "ADMIN" | "MASTER" | "GESTOR" | "VENDEDOR" | "OUTRO";
type GestorWidgetId =
  | "kpis"
  | "ranking"
  | "vendas_consultor"
  | "evolucao"
  | "aniversariantes_clientes"
  | "orcamentos"
  | "viagens"
  | "follow_up";
type GestorKpiId =
  | "kpi_vendas"
  | "kpi_qtd_vendas"
  | "kpi_ticket_medio"
  | "kpi_meta"
  | "kpi_atingimento";

// ---------- Types ----------
type Venda = {
  id: string;
  data_venda: string;
  vendedor_id: string | null;
  clientes?: { nome: string | null } | null;
  destinos?: { nome: string | null } | null;
  vendas_recibos?: {
    id: string;
    valor_total: number | null;
    produtos?: { nome: string | null } | null;
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

type Meta = {
  vendedor_id: string;
  meta_geral: number;
  scope?: string | null;
};

type Usuario = {
  id: string;
  nome_completo: string;
};

type Orcamento = {
  id: string;
  created_at: string;
  status: string | null;
  total: number | null;
  cliente?: { nome?: string | null } | null;
  quote_item?: {
    id?: string;
    title?: string | null;
    product_name?: string | null;
    item_type?: string | null;
    city_name?: string | null;
  }[] | null;
};

type Viagem = {
  id: string;
  venda_id?: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: string | null;
  destino: string | null;
  clientes?: { id: string; nome: string | null } | null;
};

type FollowUpVenda = {
  id: string;
  venda_id: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  follow_up_fechado?: boolean | null;
  venda?: {
    vendedor_id: string | null;
    cancelada?: boolean | null;
    data_embarque?: string | null;
    data_final?: string | null;
    clientes?: { id: string; nome: string | null; whatsapp?: string | null; telefone?: string | null } | null;
    destino_cidade?: { nome: string | null } | null;
  } | null;
};

type Cliente = {
  id: string;
  nome: string;
  nascimento: string | null;
  telefone: string | null;
  pessoa_tipo?: "cliente" | "acompanhante";
  cliente_id?: string | null;
};

// ---------- Helpers ----------
function formatCurrency(v: number) {
  return formatCurrencyBRL(v);
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

const COLORS = ["#2563eb", "#3b82f6", "#818cf8", "#ec4899", "#22c55e"];
const GESTOR_WIDGETS: { id: GestorWidgetId; titulo: string }[] = [
  { id: "kpis", titulo: "KPIs principais" },
  { id: "ranking", titulo: "Ranking da equipe" },
  { id: "vendas_consultor", titulo: "Vendas por consultor" },
  { id: "evolucao", titulo: "Evolução de vendas" },
  { id: "aniversariantes_clientes", titulo: "Aniversariantes (clientes e acompanhantes)" },
  { id: "orcamentos", titulo: "Orçamentos recentes" },
  { id: "viagens", titulo: "Próximas viagens" },
  { id: "follow_up", titulo: "Follow-up" },
];
const GESTOR_KPIS: { id: GestorKpiId; titulo: string }[] = [
  { id: "kpi_vendas", titulo: "Vendas da equipe" },
  { id: "kpi_qtd_vendas", titulo: "Qtd. Vendas" },
  { id: "kpi_ticket_medio", titulo: "Ticket médio" },
  { id: "kpi_meta", titulo: "Meta da equipe" },
  { id: "kpi_atingimento", titulo: "Atingimento" },
];

function normalizeOrder<T extends string>(order: T[], allIds: T[]) {
  const filtered = order.filter((id) => allIds.includes(id));
  const missing = allIds.filter((id) => !filtered.includes(id));
  return [...filtered, ...missing];
}

function readGestorWidgetVisibility(storageKey: string, ids: GestorWidgetId[]) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { visible?: Record<string, boolean> };
    if (!parsed?.visible) return null;
    const result: Record<GestorWidgetId, boolean> = {} as Record<GestorWidgetId, boolean>;
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

// =====================================================================
// DASHBOARD DO GESTOR
// =====================================================================

export default function DashboardGestorIsland() {
  return (
    <IslandErrorBoundary name="DashboardGestorIsland">
      <DashboardGestorIslandInner />
    </IslandErrorBoundary>
  );
}

function DashboardGestorIslandInner() {
  const { can, loading: loadingPerms, ready, userType, userId } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Dashboard");
  const podeVerOperacao = can("Operacao");

  const [papel, setPapel] = useState<Papel>("OUTRO");
  const [assinaturaUsuario, setAssinaturaUsuario] = useState("André Lima");
  const [widgetOrder, setWidgetOrder] = useState<GestorWidgetId[]>(
    GESTOR_WIDGETS.map((w) => w.id)
  );
  const [widgetVisible, setWidgetVisible] = useState<Record<GestorWidgetId, boolean>>(
    () =>
      GESTOR_WIDGETS.reduce(
        (acc, w) => ({ ...acc, [w.id]: true }),
        {} as Record<GestorWidgetId, boolean>
      )
  );
  const [kpiOrder, setKpiOrder] = useState<GestorKpiId[]>(GESTOR_KPIS.map((k) => k.id));
  const [kpiVisible, setKpiVisible] = useState<Record<GestorKpiId, boolean>>(
    () =>
      GESTOR_KPIS.reduce(
        (acc, k) => ({ ...acc, [k.id]: true }),
        {} as Record<GestorKpiId, boolean>
      )
  );
  const [showCustomize, setShowCustomize] = useState(false);

  const [equipeNomes, setEquipeNomes] = useState<Record<string, string>>({});
  const isMaster = papel === "MASTER";
  const masterScope = useMasterScope(Boolean(isMaster && ready));

  // período
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");

  // dados
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [vendasAgg, setVendasAgg] = useState<VendasAgg | null>(null);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpVenda[]>([]);
  const [clientesAniversariantes, setClientesAniversariantes] = useState<Cliente[]>([]);
  const [clientesAniversariantesMonth, setClientesAniversariantesMonth] = useState<number>(
    () => new Date().getMonth() + 1
  );
  const [loadingDados, setLoadingDados] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [mobileWidgetOpen, setMobileWidgetOpen] = useState<Record<GestorWidgetId, boolean>>(() =>
    GESTOR_WIDGETS.reduce(
      (acc, w) => ({ ...acc, [w.id]: false }),
      {} as Record<GestorWidgetId, boolean>
    )
  );

  // INIT período
  useEffect(() => {
    const { inicio, fim } = getMonthBounds();
    setInicio(inicio);
    setFim(fim);
  }, []);

  useEffect(() => {
    const tipo = String(userType || "").toUpperCase();
    let next: Papel = "OUTRO";
    if (tipo.includes("ADMIN")) next = "ADMIN";
    else if (tipo.includes("MASTER")) next = "MASTER";
    else if (tipo.includes("GESTOR")) next = "GESTOR";
    else if (tipo.includes("VENDEDOR")) next = "VENDEDOR";
    setPapel(next);
  }, [userType]);

  useEffect(() => {
    let active = true;
    async function loadAssinatura() {
      if (!userId) return;
      try {
        const { data: userRow } = await supabase
          .from("users")
          .select("nome_completo")
          .eq("id", userId)
          .maybeSingle();
        if (!active) return;
        const nomeDb = String((userRow as any)?.nome_completo || "").trim();
        if (nomeDb) {
          setAssinaturaUsuario(nomeDb);
          return;
        }
        const { data: authData } = await supabase.auth.getUser();
        const nomeMeta = String(
          authData?.user?.user_metadata?.nome_completo ||
            authData?.user?.user_metadata?.full_name ||
            ""
        ).trim();
        if (nomeMeta) setAssinaturaUsuario(nomeMeta);
      } catch {
        // mantém fallback padrão
      }
    }
    loadAssinatura();
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const savedWidgets = window.localStorage.getItem("dashboard_gestor_widgets");
      if (savedWidgets) {
        const parsed = JSON.parse(savedWidgets) as {
          order?: GestorWidgetId[];
          visible?: Record<GestorWidgetId, boolean>;
        };
        if (parsed?.order) {
          const allIds = GESTOR_WIDGETS.map((w) => w.id);
          setWidgetOrder(normalizeOrder(parsed.order, allIds));
        }
        if (parsed?.visible) {
          setWidgetVisible((prev) => ({ ...prev, ...parsed.visible }));
        }
      }
      const savedKpis = window.localStorage.getItem("dashboard_gestor_kpis");
      if (savedKpis) {
        const parsed = JSON.parse(savedKpis) as {
          order?: GestorKpiId[];
          visible?: Record<GestorKpiId, boolean>;
        };
        if (parsed?.order) {
          const allIds = GESTOR_KPIS.map((k) => k.id);
          setKpiOrder(normalizeOrder(parsed.order, allIds));
        }
        if (parsed?.visible) {
          setKpiVisible((prev) => ({ ...prev, ...parsed.visible }));
        }
      }
    } catch (e) {
      console.warn("Não foi possível carregar preferências do dashboard do gestor.", e);
    }
  }, []);

  const salvarPreferencias = (
    nextWidgetOrder: GestorWidgetId[],
    nextWidgetVisible: Record<GestorWidgetId, boolean>,
    nextKpiOrder: GestorKpiId[],
    nextKpiVisible: Record<GestorKpiId, boolean>
  ) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "dashboard_gestor_widgets",
      JSON.stringify({ order: nextWidgetOrder, visible: nextWidgetVisible })
    );
    window.localStorage.setItem(
      "dashboard_gestor_kpis",
      JSON.stringify({ order: nextKpiOrder, visible: nextKpiVisible })
    );
  };

  const widgetAtivo = (id: GestorWidgetId) => widgetVisible[id] !== false;
  const kpiAtivo = (id: GestorKpiId) => kpiVisible[id] !== false;
  const toggleMobileWidget = (id: GestorWidgetId) =>
    setMobileWidgetOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleWidget = (id: GestorWidgetId) => {
    const nextVisible = { ...widgetVisible, [id]: !widgetVisible[id] };
    setWidgetVisible(nextVisible);
    salvarPreferencias(widgetOrder, nextVisible, kpiOrder, kpiVisible);
  };

  const toggleKpi = (id: GestorKpiId) => {
    const nextVisible = { ...kpiVisible, [id]: !kpiVisible[id] };
    setKpiVisible(nextVisible);
    salvarPreferencias(widgetOrder, widgetVisible, kpiOrder, nextVisible);
  };

  const moverWidget = (id: GestorWidgetId, direction: "up" | "down") => {
    const idx = widgetOrder.indexOf(id);
    if (idx === -1) return;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= widgetOrder.length) return;
    const nextOrder = [...widgetOrder];
    [nextOrder[idx], nextOrder[swapWith]] = [nextOrder[swapWith], nextOrder[idx]];
    setWidgetOrder(nextOrder);
    salvarPreferencias(nextOrder, widgetVisible, kpiOrder, kpiVisible);
  };

  const moverKpi = (id: GestorKpiId, direction: "up" | "down") => {
    const idx = kpiOrder.indexOf(id);
    if (idx === -1) return;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= kpiOrder.length) return;
    const nextOrder = [...kpiOrder];
    [nextOrder[idx], nextOrder[swapWith]] = [nextOrder[swapWith], nextOrder[idx]];
    setKpiOrder(nextOrder);
    salvarPreferencias(widgetOrder, widgetVisible, nextOrder, kpiVisible);
  };

  // =====================================================================
  // Carregar papel + equipe do gestor
  // =====================================================================

  useEffect(() => {
    if (!isMaster) return;
    const ids = masterScope.vendedorIds || [];
    const map: Record<string, string> = {};
    masterScope.vendedoresDisponiveis.forEach((v) => {
      map[v.id] = v.nome_completo;
    });
    setEquipeNomes(map);
  }, [isMaster, masterScope.vendedorIds, masterScope.vendedoresDisponiveis]);

  // =====================================================================
  // CARREGAR DADOS (VENDAS + METAS)
  // =====================================================================

  useEffect(() => {
    if (!inicio || !fim || (papel !== "GESTOR" && papel !== "ADMIN" && papel !== "MASTER"))
      return;

    async function loadAll() {
      try {
        setLoadingDados(true);
        setErro(null);
        if (papel === "MASTER") {
          if (masterScope.loading) return;
          if (masterScope.vendedorIds.length === 0) {
            setVendas([]);
            setMetas([]);
            setOrcamentos([]);
            setViagens([]);
            setFollowUps([]);
            return;
          }
        }

        const params = new URLSearchParams({ mode: "gestor", inicio, fim });
        params.set("include_clientes", "0");
        const storedVisibility = readGestorWidgetVisibility(
          "dashboard_gestor_widgets",
          GESTOR_WIDGETS.map((w) => w.id)
        );
        const includeOrcamentos = storedVisibility?.orcamentos !== false;
        params.set("include_orcamentos", includeOrcamentos ? "1" : "0");
        params.set("include_viagens", "0");
        params.set("include_followups", "0");
        if (papel === "MASTER") {
          if (masterScope.empresaSelecionada && masterScope.empresaSelecionada !== "all") {
            params.set("company_id", masterScope.empresaSelecionada);
          }
          if (masterScope.vendedorIds.length > 0) {
            params.set("vendedor_ids", masterScope.vendedorIds.join(","));
          }
        }

        const cacheKey = buildQueryLiteKey(["dashboardSummary", "gestor", userId || "", params.toString()]);
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

        setVendas((payload?.vendas || []) as Venda[]);
        setVendasAgg((payload?.vendasAgg || null) as VendasAgg | null);
        setMetas((payload?.metas || []) as Meta[]);
        setOrcamentos((payload?.orcamentos || []) as Orcamento[]);
        setViagens((payload?.viagens || []) as Viagem[]);
        setFollowUps([]);

        const nomesPayload = (payload?.equipeNomes || null) as Record<string, string> | null;
        if (papel === "MASTER") {
          if (nomesPayload) {
            setEquipeNomes((prev) => ({ ...nomesPayload, ...prev }));
          }
        } else {
          if (nomesPayload) {
            setEquipeNomes(nomesPayload);
          }
        }
      } catch (e: any) {
        console.error(e);
        setErro("Erro ao carregar dados do dashboard do gestor.");
      } finally {
        setLoadingDados(false);
      }
    }

    loadAll();
  }, [
    inicio,
    fim,
    papel,
    userId,
    podeVerOperacao,
    masterScope.empresaSelecionada,
    masterScope.gestorSelecionado,
    masterScope.vendedorSelecionado,
  ]);

  useEffect(() => {
    if (!userId) return;
    if (!widgetAtivo("viagens") || !podeVerOperacao) {
      setViagens([]);
      return;
    }

    if (papel === "MASTER" && masterScope.vendedorIds.length === 0) {
      setViagens([]);
      return;
    }

    let active = true;
    const params = new URLSearchParams({ mode: "gestor" });
    if (papel === "MASTER") {
      if (masterScope.empresaSelecionada && masterScope.empresaSelecionada !== "all") {
        params.set("company_id", masterScope.empresaSelecionada);
      }
      if (masterScope.vendedorIds.length > 0) {
        params.set("vendedor_ids", masterScope.vendedorIds.join(","));
      }
    }

    const cacheKey = buildQueryLiteKey([
      "dashboardViagens",
      "gestor",
      userId,
      params.get("company_id") || "",
      params.get("vendedor_ids") || "",
    ]);

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
  }, [userId, widgetVisible, papel, masterScope.empresaSelecionada, masterScope.vendedorIds, podeVerOperacao]);

  useEffect(() => {
    if (!userId) return;
    if (!widgetAtivo("follow_up")) {
      setFollowUps([]);
      return;
    }

    if (papel === "MASTER" && masterScope.vendedorIds.length === 0) {
      setFollowUps([]);
      return;
    }

    let active = true;
    const params = new URLSearchParams({ mode: "gestor", inicio, fim });
    if (papel === "MASTER") {
      if (masterScope.empresaSelecionada && masterScope.empresaSelecionada !== "all") {
        params.set("company_id", masterScope.empresaSelecionada);
      }
      if (masterScope.vendedorIds.length > 0) {
        params.set("vendedor_ids", masterScope.vendedorIds.join(","));
      }
    }

    const cacheKey = buildQueryLiteKey([
      "dashboardFollowUps",
      "gestor",
      userId,
      inicio,
      fim,
      params.get("company_id") || "",
      params.get("vendedor_ids") || "",
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
  }, [userId, widgetVisible, papel, masterScope.empresaSelecionada, masterScope.vendedorIds, inicio, fim]);

  useEffect(() => {
    if (!userId) return;
    if (!widgetAtivo("aniversariantes_clientes")) {
      setClientesAniversariantes([]);
      return;
    }

    if (papel === "MASTER" && masterScope.vendedorIds.length === 0) {
      setClientesAniversariantes([]);
      return;
    }

    let active = true;
    const month = new Date().getMonth() + 1;
    const params = new URLSearchParams({ mode: "gestor", month: String(month) });

    if (papel === "MASTER") {
      if (masterScope.empresaSelecionada && masterScope.empresaSelecionada !== "all") {
        params.set("company_id", masterScope.empresaSelecionada);
      }
      if (masterScope.vendedorIds.length > 0) {
        params.set("vendedor_ids", masterScope.vendedorIds.join(","));
      }
    } else if (papel === "GESTOR") {
      const ids = Object.keys(equipeNomes);
      if (ids.length > 0) {
        params.set("vendedor_ids", ids.join(","));
      }
    }

    const cacheKey = buildQueryLiteKey([
      "dashboardAniversariantesClientes",
      "gestor",
      userId,
      String(month),
      params.get("company_id") || "",
      params.get("vendedor_ids") || "",
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
  }, [userId, widgetVisible, papel, masterScope.empresaSelecionada, masterScope.vendedorIds, equipeNomes]);

  // =====================================================================
  // KPIs DERIVADOS DO GESTOR
  // =====================================================================

  const {
    totalTeamSales,
    totalTeamDeals,
    ticketMedioEquipe,
    metaEquipe,
    atingimentoEquipe,
    rankingEquipe,
  } = useMemo(() => {
    let totalTeamSales = 0;
    let totalTeamDeals = 0;
    const porVendedor: Record<string, number> = {};
    let metaEquipeAgregada = 0;

    if (vendasAgg) {
      totalTeamSales = Number(vendasAgg.totalVendas || 0);
      totalTeamDeals = Number(vendasAgg.qtdVendas || 0);
      (vendasAgg.porVendedor || []).forEach((row) => {
        const id = String((row as any)?.vendedor_id || "unknown");
        const tot = Number((row as any)?.total || 0);
        porVendedor[id] = (porVendedor[id] || 0) + tot;
      });
    } else {
      vendas.forEach((v) => {
        const totalVenda = (v.vendas_recibos || []).reduce(
          (acc, r) => acc + Number(r.valor_total || 0),
          0
        );

        totalTeamSales += totalVenda;

        const vid = v.vendedor_id || "0";
        porVendedor[vid] = (porVendedor[vid] || 0) + totalVenda;
      });
      totalTeamDeals = vendas.length;
    }

    // ✅ CORREÇÃO: Lógica de cálculo de meta de equipe
    const metasEquipe = metas.filter((m) => m.scope === "equipe");
    if (metasEquipe.length > 0) {
      // Cenário 1: Existe meta de equipe explícita
      metaEquipeAgregada = metasEquipe.reduce(
        (acc, m) => acc + Number(m.meta_geral || 0),
        0
      );
    } else if (metas.length > 0) {
      // Cenário 2: Não existe meta de equipe, calcula MÉDIA das metas individuais
      // ✅ FIX: Antes somava tudo, agora divide pela quantidade
      const somaMetasIndividuais = metas.reduce(
        (acc, m) => acc + Number(m.meta_geral || 0),
        0
      );
      metaEquipeAgregada = somaMetasIndividuais / metas.length;
    } else {
      // Cenário 3: Nenhuma meta configurada
      metaEquipeAgregada = 0;
    }

    const ticketMedioEquipe =
      totalTeamDeals > 0 ? totalTeamSales / totalTeamDeals : 0;

    const atingimento =
      metaEquipeAgregada > 0 ? (totalTeamSales / metaEquipeAgregada) * 100 : 0;

    const ranking = Object.entries(porVendedor)
      .map(([id, tot]) => ({
        vendedor_id: id,
        nome: equipeNomes[id] || "Vendedor",
        total: tot,
      }))
      .sort((a, b) => (a.total < b.total ? 1 : -1));

    return {
      totalTeamSales,
      totalTeamDeals,
      ticketMedioEquipe,
      metaEquipe: metaEquipeAgregada,
      atingimentoEquipe: atingimento,
      rankingEquipe: ranking,
    };
  }, [vendasAgg, vendas, metas, equipeNomes]);

  const evolucaoTimeline = useMemo(() => {
    const toLabel = (date: string) => {
      const [year, month, day] = String(date || "").slice(0, 10).split("-");
      return year && month && day ? `${day}/${month}` : String(date || "");
    };

    if (vendasAgg) {
      return (vendasAgg.timeline || [])
        .filter((row) => Boolean((row as any)?.date))
        .map((row) => {
          const date = String((row as any)?.date || "").slice(0, 10);
          return { date, label: toLabel(date), value: Number((row as any)?.value || 0) };
        });
    }

    const map = new Map<string, number>();
    vendas.forEach((v) => {
      const dia = String(v.data_venda || "").slice(0, 10);
      if (!dia) return;
      const totalVenda = (v.vendas_recibos || []).reduce((acc, r) => acc + Number(r.valor_total || 0), 0);
      map.set(dia, (map.get(dia) || 0) + totalVenda);
    });

    return Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, value]) => ({ date, label: toLabel(date), value }));
  }, [vendasAgg, vendas]);

  const orcamentosRecentes = useMemo(() => {
    return [...orcamentos]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 5);
  }, [orcamentos]);

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
      .slice(0, 5);
  }, [followUps]);

  const viagensProximas = useMemo(() => {
    const seen = new Map<string, Viagem>();
    [...viagens]
      .filter((v) => (v.status || "").toLowerCase() !== "cancelada")
      .forEach((v) => {
        const key = v.venda_id || v.id;
        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, v);
          return;
        }
        // Mantém a viagem com maior data_fim (recibo principal)
        if ((v.data_fim || "") > (existing.data_fim || "")) {
          seen.set(key, v);
        }
      });
    return Array.from(seen.values())
      .sort((a, b) => (a.data_inicio || "").localeCompare(b.data_inicio || ""))
      .slice(0, 5);
  }, [viagens]);

  const renderWidget = (id: GestorWidgetId, options?: { hideTitle?: boolean }) => {
    if (!widgetAtivo(id)) return null;
    const hideTitle = Boolean(options?.hideTitle);

    if (id === "kpis") {
      return (
        <AppCard
          title={hideTitle ? undefined : "Indicadores da equipe"}
          subtitle={hideTitle ? undefined : "Resumo comercial consolidado do escopo atual."}
          tone="info"
        >
          <div className="vtur-dashboard-kpi-grid">
            {kpiOrder
              .filter((kpiId) => kpiAtivo(kpiId))
              .map((kpiId) => {
                if (kpiId === "kpi_vendas") {
                  return (
                    <div className="vtur-dashboard-kpi-card" key={kpiId}>
                      <div className="vtur-dashboard-kpi-copy">
                        <div className="vtur-dashboard-kpi-label">Vendas da equipe</div>
                        <div className="vtur-dashboard-kpi-value">{formatCurrency(totalTeamSales)}</div>
                      </div>
                    </div>
                  );
                }
                if (kpiId === "kpi_qtd_vendas") {
                  return (
                    <div className="vtur-dashboard-kpi-card" key={kpiId}>
                      <div className="vtur-dashboard-kpi-copy">
                        <div className="vtur-dashboard-kpi-label">Qtd. Vendas</div>
                        <div className="vtur-dashboard-kpi-value">{totalTeamDeals}</div>
                      </div>
                    </div>
                  );
                }
                if (kpiId === "kpi_ticket_medio") {
                  return (
                    <div className="vtur-dashboard-kpi-card" key={kpiId}>
                      <div className="vtur-dashboard-kpi-copy">
                        <div className="vtur-dashboard-kpi-label">Ticket medio</div>
                        <div className="vtur-dashboard-kpi-value">{formatCurrency(ticketMedioEquipe)}</div>
                      </div>
                    </div>
                  );
                }
                if (kpiId === "kpi_meta") {
                  return (
                    <div className="vtur-dashboard-kpi-card" key={kpiId}>
                      <div className="vtur-dashboard-kpi-copy">
                        <div className="vtur-dashboard-kpi-label">Meta da equipe</div>
                        <div className="vtur-dashboard-kpi-value">{formatCurrency(metaEquipe)}</div>
                      </div>
                    </div>
                  );
                }
                if (kpiId === "kpi_atingimento") {
                  return (
                    <div className="vtur-dashboard-kpi-card" key={kpiId}>
                      <div className="vtur-dashboard-kpi-copy">
                        <div className="vtur-dashboard-kpi-label">Atingimento</div>
                        <div className="vtur-dashboard-kpi-value">{atingimentoEquipe.toFixed(1)}%</div>
                      </div>
                    </div>
                  );
                }
                return null;
              })}
          </div>
        </AppCard>
      );
    }

    if (id === "ranking") {
      return (
        <AppCard
          title={hideTitle ? undefined : "Ranking da equipe"}
          subtitle={hideTitle ? undefined : `${rankingEquipe.length} consultor(es) no escopo selecionado.`}
          tone="info"
        >
          <DataTable
            headers={
              <tr>
                <th>Vendedor</th>
                <th>Total vendido</th>
              </tr>
            }
            empty={rankingEquipe.length === 0}
            emptyMessage="Sem vendas no periodo."
            colSpan={2}
            className="table-mobile-cards table-header-blue min-w-[480px]"
          >
            {rankingEquipe.map((item, idx) => (
              <tr key={item.vendedor_id}>
                <td data-label="Vendedor">
                  #{idx + 1} - {item.nome}
                </td>
                <td data-label="Total vendido">{formatCurrency(item.total)}</td>
              </tr>
            ))}
          </DataTable>
        </AppCard>
      );
    }

    if (id === "vendas_consultor") {
      return (
        <AppCard
          title={hideTitle ? undefined : "Vendas por consultor"}
          subtitle={hideTitle ? undefined : "Compare distribuicao da equipe em grafico de pizza e barras."}
          tone="info"
        >
          <div
            className="vtur-dashboard-chart-grid"
          >
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={rankingEquipe.map((r) => ({ name: r.nome, total: r.total }))}
                    dataKey="total"
                    nameKey="name"
                    outerRadius={90}
                  >
                    {rankingEquipe.map((_, idx) => (
                      <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: any) => formatCurrency(Number(value || 0))}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div style={{ width: "100%", height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={rankingEquipe.map((r) => ({ name: r.nome, total: r.total }))}>
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip
                    formatter={(value: any) => formatCurrency(Number(value || 0))}
                  />
                  <Bar dataKey="total" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </AppCard>
      );
    }

    if (id === "evolucao") {
      return (
        <AppCard
          title={hideTitle ? undefined : "Evolucao de vendas da equipe"}
          subtitle={hideTitle ? undefined : "Linha temporal de vendas consolidadas no periodo."}
          tone="info"
        >
          <div style={{ width: "100%", height: 260 }}>
            {evolucaoTimeline.length === 0 ? (
              <div style={{ fontSize: "0.9rem" }}>Sem dados para o período.</div>
            ) : (
              <ResponsiveContainer>
                <LineChart data={evolucaoTimeline}>
                  <XAxis dataKey="label" />
                  <YAxis />
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                  <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </AppCard>
      );
    }

    if (id === "orcamentos") {
      return (
        <AppCard
          title={hideTitle ? undefined : `Orcamentos recentes (${orcamentosRecentes.length})`}
          subtitle={hideTitle ? undefined : "Ultimas propostas geradas pela equipe."}
          tone="info"
        >
          <DataTable
            headers={
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Destino</th>
                <th>Total</th>
              </tr>
            }
            empty={orcamentosRecentes.length === 0}
            emptyMessage="Nenhum orcamento no periodo."
            colSpan={4}
            className="table-mobile-cards table-header-blue min-w-[520px]"
          >
            {orcamentosRecentes.map((o) => (
              <tr key={o.id}>
                <td data-label="Data">{formatarDataParaExibicao(o.created_at)}</td>
                <td data-label="Cliente">{o.cliente?.nome || "—"}</td>
                <td data-label="Destino">{getOrcamentoDestino(o)}</td>
                <td data-label="Total">{formatCurrency(Number(o.total || 0))}</td>
              </tr>
            ))}
          </DataTable>
        </AppCard>
      );
    }

    if (id === "aniversariantes_clientes") {
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
      const items = [...clientesAniversariantes]
        .filter((c) => Boolean(c?.id))
        .sort((a, b) => {
          const da = String(a.nascimento || "").split("-");
          const db = String(b.nascimento || "").split("-");
          const dayA = da.length >= 3 ? Number(da[2]) : 0;
          const dayB = db.length >= 3 ? Number(db[2]) : 0;
          return dayA - dayB;
        })
        .slice(0, 20);

      return (
        <AppCard
          title={hideTitle ? undefined : `Aniversariantes - ${monthLabel} (${items.length})`}
          subtitle={hideTitle ? undefined : "Clientes e acompanhantes do escopo atual."}
          tone="info"
        >
          <DataTable
            headers={
              <tr>
                <th>Cliente</th>
                <th>Nascimento</th>
                <th>Telefone</th>
                <th className="th-actions">Acoes</th>
              </tr>
            }
            empty={items.length === 0}
            emptyMessage="Nenhum aniversariante de cliente/acompanhante este mes."
            colSpan={4}
            className="table-mobile-cards table-header-blue min-w-[520px]"
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
                      <span aria-hidden="true">{c.pessoa_tipo === "acompanhante" ? "🧑‍🤝‍🧑" : "👤"}</span>
                      <span>{c.nome || "-"}</span>
                    </span>
                  </td>
                  <td data-label="Nascimento">
                    {c.nascimento ? formatarDataParaExibicao(c.nascimento) : "-"}
                  </td>
                  <td data-label="Telefone">{c.telefone || "-"}</td>
                  <td className="th-actions" data-label="Acoes">
                    <TableActions
                      actions={[
                        ...(whatsappLink
                          ? [
                              {
                                key: "whatsapp",
                                label: "WhatsApp",
                                title: "Enviar cartão de aniversario no WhatsApp",
                                onClick: () => window.open(whatsappLink, "_blank", "noopener,noreferrer"),
                                icon: "🎂",
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
                                icon: "👤",
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

    if (id === "viagens") {
      return (
        <AppCard
          title={hideTitle ? undefined : `Proximas viagens (${viagensProximas.length})`}
          subtitle={hideTitle ? undefined : "Viagens futuras vinculadas ao escopo da equipe."}
          tone="info"
        >
          <DataTable
            headers={
              <tr>
                <th>Inicio</th>
                <th>Cliente</th>
                <th>Destino</th>
                <th>Status</th>
                <th className="th-actions">Acoes</th>
              </tr>
            }
            empty={viagensProximas.length === 0}
            emptyMessage="Nenhuma viagem nos proximos dias."
            colSpan={5}
            className="table-mobile-cards table-header-blue min-w-[520px]"
          >
            {viagensProximas.map((v) => (
              <tr key={v.id}>
                <td data-label="Inicio">{formatarDataParaExibicao(v.data_inicio)}</td>
                <td data-label="Cliente">{v.clientes?.nome || "—"}</td>
                <td data-label="Destino">{v.destino || "—"}</td>
                <td data-label="Status">{v.status || "—"}</td>
                <td className="th-actions" data-label="Acoes">
                  <TableActions
                    actions={
                      v.clientes?.id
                        ? [
                            {
                              key: "cliente",
                              label: "Cliente",
                              title: "Ver cliente",
                              onClick: () => {
                                window.location.href = `/clientes/cadastro?id=${v.clientes?.id}`;
                              },
                              icon: "👤",
                              variant: "ghost",
                            },
                          ]
                        : []
                    }
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        </AppCard>
      );
    }

    if (id === "follow_up") {
      return (
        <AppCard
          title={hideTitle ? undefined : `Follow-up (${followUpsRecentes.length})`}
          subtitle={hideTitle ? undefined : "Clientes que ja retornaram e demandam contato da equipe."}
          tone="info"
        >
          <DataTable
            headers={
              <tr>
                <th>Retorno</th>
                <th>Cliente</th>
                <th>Destino</th>
                <th className="th-actions">Acoes</th>
              </tr>
            }
            empty={followUpsRecentes.length === 0}
            emptyMessage="Nenhum follow-up no periodo."
            colSpan={4}
            className="table-mobile-cards table-header-blue min-w-[520px]"
          >
            {followUpsRecentes.map((f) => {
              const mensagem = montarMensagemFollowUp(f.venda?.clientes?.nome, assinaturaUsuario);
              const whatsappLink = construirLinkWhatsAppComTexto(
                f.venda?.clientes?.whatsapp || f.venda?.clientes?.telefone || null,
                mensagem,
                "55"
              );
              return (
                <tr key={f.id}>
                  <td data-label="Retorno">
                    {formatarDataParaExibicao(f.data_fim || f.venda?.data_final || "")}
                  </td>
                  <td data-label="Cliente">{f.venda?.clientes?.nome || "—"}</td>
                  <td data-label="Destino">{f.venda?.destino_cidade?.nome || "—"}</td>
                  <td className="th-actions" data-label="Acoes">
                    <TableActions
                      actions={[
                        ...(f.venda?.clientes?.id
                          ? [
                              {
                                key: "cliente",
                                label: "Cliente",
                                title: "Ver cliente",
                                onClick: () => {
                                  window.location.href = `/clientes/cadastro?id=${f.venda?.clientes?.id}`;
                                },
                                icon: "👤",
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
                                icon: "💬",
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

    return null;
  };

  // =====================================================================
  // RENDER
  // =====================================================================

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <div className="page-content-wrap dashboard-geral-page gestor-page">
          <AppCard tone="config">Voce nao possui acesso ao Dashboard.</AppCard>
        </div>
      </AppPrimerProvider>
    );
  }

  if (papel !== "GESTOR" && papel !== "ADMIN" && papel !== "MASTER") {
    return (
      <AppPrimerProvider>
        <div className="page-content-wrap dashboard-geral-page gestor-page">
          <AppCard tone="config">Somente Gestores ou Masters podem acessar este dashboard.</AppCard>
        </div>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap dashboard-geral-page gestor-page vtur-dashboard-shell">
        <AppToolbar
          title={`Dashboard ${isMaster ? "do master" : "do gestor"}`}
          subtitle={`Periodo: ${formatDateBR(inicio)} ate ${formatDateBR(fim)}.`}
          tone="info"
          sticky
          actions={
            <AppButton type="button" variant="primary" onClick={() => setShowCustomize(true)}>
              Personalizar dashboard
            </AppButton>
          }
        >
          <div className="vtur-form-grid vtur-form-grid-4">
            <AppField
              label="Data inicio"
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
            <AppField
              label="Data fim"
              type="date"
              min={inicio || undefined}
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
            {isMaster && (
              <>
                <AppField
                  as="select"
                  label="Filial"
                  value={masterScope.empresaSelecionada}
                  onChange={(e) => masterScope.setEmpresaSelecionada(e.target.value)}
                  options={[
                    { value: "all", label: "Todas" },
                    ...masterScope.empresasAprovadas.map((empresa) => ({
                      value: empresa.id,
                      label: empresa.nome_fantasia,
                    })),
                  ]}
                />
                <AppField
                  as="select"
                  label="Equipe"
                  value={masterScope.gestorSelecionado}
                  onChange={(e) => masterScope.setGestorSelecionado(e.target.value)}
                  options={[
                    { value: "all", label: "Todas" },
                    ...masterScope.gestoresDisponiveis.map((gestor) => ({
                      value: gestor.id,
                      label: gestor.nome_completo,
                    })),
                  ]}
                />
                <AppField
                  as="select"
                  label="Vendedor"
                  value={masterScope.vendedorSelecionado}
                  onChange={(e) => masterScope.setVendedorSelecionado(e.target.value)}
                  options={[
                    { value: "all", label: "Todos" },
                    ...masterScope.vendedoresDisponiveis.map((vendedor) => ({
                      value: vendedor.id,
                      label: vendedor.nome_completo || "Vendedor",
                    })),
                  ]}
                />
              </>
            )}
          </div>
        </AppToolbar>

        {isMaster && masterScope.loading && (
          <AppCard tone="config">Carregando escopo master...</AppCard>
        )}

        {widgetOrder.map((id) => {
          const isMobileCollapsible =
            id === "aniversariantes_clientes" || id === "orcamentos" || id === "viagens" || id === "follow_up";
          const node = renderWidget(id);
          if (!node) return null;

          if (!isMobileCollapsible) {
            return <React.Fragment key={id}>{node}</React.Fragment>;
          }

          const meta = GESTOR_WIDGETS.find((w) => w.id === id);
          const aberto = mobileWidgetOpen[id];
          const label = (() => {
            if (id === "aniversariantes_clientes") {
              return `Aniversariantes (${clientesAniversariantes.length})`;
            }
            if (id === "orcamentos") return `Orcamentos recentes (${orcamentosRecentes.length})`;
            if (id === "viagens") return `Proximas viagens (${viagensProximas.length})`;
            if (id === "follow_up") return `Follow-up (${followUpsRecentes.length})`;
            return meta?.titulo || id;
          })();

          return (
            <React.Fragment key={id}>
              <div className="mobile-only">
                <AppButton type="button" variant={aberto ? "primary" : "secondary"} block onClick={() => toggleMobileWidget(id)}>
                  {label}
                </AppButton>
                {aberto && <div style={{ marginTop: 12 }}>{renderWidget(id, { hideTitle: true })}</div>}
              </div>
              <div className="hidden sm:block">{node}</div>
            </React.Fragment>
          );
        })}

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
              <AppCard title="Widgets" subtitle="Defina a visibilidade e a ordem dos blocos do dashboard.">
                <div className="vtur-dashboard-config-list">
                  {widgetOrder.map((id, idx) => {
                    const meta = GESTOR_WIDGETS.find((w) => w.id === id);
                    if (!meta) return null;
                    return (
                      <div key={id} className="vtur-dashboard-config-item">
                        <label className="vtur-dashboard-checkbox-row">
                          <input type="checkbox" checked={widgetAtivo(id)} onChange={() => toggleWidget(id)} />
                          <span>{meta.titulo}</span>
                        </label>
                        <div className="vtur-dashboard-config-actions">
                          <AppButton type="button" variant="ghost" onClick={() => moverWidget(id, "up")} disabled={idx === 0}>
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

              <AppCard title="KPIs" subtitle="Escolha os indicadores exibidos no topo do dashboard.">
                <div className="vtur-dashboard-config-list">
                  {kpiOrder.map((id, idx) => {
                    const meta = GESTOR_KPIS.find((k) => k.id === id);
                    if (!meta) return null;
                    return (
                      <div key={id} className="vtur-dashboard-config-item">
                        <label className="vtur-dashboard-checkbox-row">
                          <input type="checkbox" checked={kpiAtivo(id)} onChange={() => toggleKpi(id)} />
                          <span>{meta.titulo}</span>
                        </label>
                        <div className="vtur-dashboard-config-actions">
                          <AppButton type="button" variant="ghost" onClick={() => moverKpi(id, "up")} disabled={idx === 0}>
                            ↑
                          </AppButton>
                          <AppButton
                            type="button"
                            variant="ghost"
                            onClick={() => moverKpi(id, "down")}
                            disabled={idx === kpiOrder.length - 1}
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

        {loadingDados && <AppCard tone="config">Carregando dados...</AppCard>}
        {erro && <AlertMessage variant="error">{erro}</AlertMessage>}
      </div>
    </AppPrimerProvider>
  );
}
