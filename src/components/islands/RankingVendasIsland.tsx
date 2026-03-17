import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { useMasterScope } from "../../lib/useMasterScope";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { formatCurrencyBRL, formatNumberBR } from "../../lib/format";
import { fetchGestorEquipeVendedorIds } from "../../lib/gestorEquipe";
import AlertMessage from "../ui/AlertMessage";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

type Papel = "GESTOR" | "MASTER" | "OUTRO" | "VIEWER";

type RankingVendasProps = {
  viewOnly?: boolean;
};

type VendaRecibo = {
  valor_total: number | null;
  valor_taxas: number | null;
  produto_id: string | null;
  tipo_produtos?: { id: string; nome: string | null } | null;
};

type Venda = {
  id: string;
  data_venda: string;
  vendedor_id: string | null;
  vendas_recibos?: VendaRecibo[];
};

type Meta = {
  id: string;
  vendedor_id: string;
  meta_geral: number;
  scope?: string | null;
};

type MetaProduto = {
  meta_vendedor_id: string;
  produto_id: string;
  valor: number;
};

type Usuario = {
  id: string;
  nome_completo: string;
  company_id: string | null;
  participa_ranking?: boolean | null;
  user_types?: { name: string | null } | null;
  companies?: { nome_fantasia: string | null } | null;
};

type ParametrosComissao = {
  usar_taxas_na_meta: boolean;
  foco_valor?: "bruto" | "liquido";
};

const DEFAULT_PARAMS: ParametrosComissao = {
  usar_taxas_na_meta: true,
  foco_valor: "bruto",
};

const MESES = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

function formatNome(valor?: string | null) {
  const trimmed = (valor || "").trim();
  return trimmed ? titleCaseWithExceptions(trimmed) : "";
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return "—";
  return formatCurrencyBRL(value);
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return "—";
  return `${formatNumberBR(value, 2)}%`;
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toMonthValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function monthLabel(value: string) {
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return value;
  const date = new Date(y, m - 1, 1);
  const label = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    date
  );
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : value;
}

function getMonthBounds(value: string) {
  const [y, m] = value.split("-").map(Number);
  if (!y || !m) return null;
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 0);
  const now = new Date();
  const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1;
  return {
    inicio: toIsoDate(start),
    fim: toIsoDate(isCurrent ? now : end),
  };
}

function parseIsoDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function calcularBaseMeta(bruto: number, liquido: number, params: ParametrosComissao) {
  if (params.foco_valor === "liquido") return liquido;
  if (params.usar_taxas_na_meta) return bruto;
  return liquido;
}

async function fetchRankingDados(params: {
  inicio: string;
  fim: string;
  vendedorIds: string[];
  companyId?: string | null;
  noCache?: boolean;
  viewOnly?: boolean;
}) {
  const qs = new URLSearchParams();
  qs.set("inicio", params.inicio);
  qs.set("fim", params.fim);
  qs.set("vendedor_ids", params.vendedorIds.join(","));
  if (params.companyId) qs.set("company_id", params.companyId);
  if (params.noCache) qs.set("no_cache", "1");
  if (params.viewOnly) qs.set("view", "1");

  const resp = await fetch(`/api/v1/relatorios/ranking-vendas?${qs.toString()}`);
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  return resp.json() as Promise<{
    params?: ParametrosComissao;
    vendas?: Venda[];
    metas?: Meta[];
    metasProduto?: MetaProduto[];
    produtosMeta?: { id: string; nome: string }[];
  }>;
}

export default function RankingVendasIsland({ viewOnly = false }: RankingVendasProps) {
  const { can, loading: loadingPerms, ready, userType } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const isMaster = /MASTER/i.test(String(userType || ""));
  const isGestor = /GESTOR/i.test(String(userType || ""));
  const effectiveViewOnly = viewOnly || (!isMaster && !isGestor);
  const podeVer = effectiveViewOnly
    ? can("Dashboard") || can("Ranking de vendas") || can("Relatorios")
    : can("Ranking de vendas") || can("Relatorios");
  const masterScope = useMasterScope(Boolean(isMaster && ready));
  const metaProdEnabled = import.meta.env.PUBLIC_META_PRODUTO_ENABLED !== "false";

  const [papel, setPapel] = useState<Papel>("OUTRO");
  const [userId, setUserId] = useState<string | null>(null);
  const [equipeIds, setEquipeIds] = useState<string[]>([]);
  const [equipeNomes, setEquipeNomes] = useState<Record<string, string>>({});
  const [gestoresNomes, setGestoresNomes] = useState<Record<string, string>>({});
  const [gestorRankingFlags, setGestorRankingFlags] = useState<Record<string, boolean>>({});
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyNome, setCompanyNome] = useState<string | null>(null);

  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [mesSelecionado, setMesSelecionado] = useState("");

  const [parametros, setParametros] = useState<ParametrosComissao>(DEFAULT_PARAMS);
  const [vendas, setVendas] = useState<Venda[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [metasProduto, setMetasProduto] = useState<MetaProduto[]>([]);
  const [produtosMeta, setProdutosMeta] = useState<{ id: string; nome: string }[]>([]);
  const [produtoSelecionado, setProdutoSelecionado] = useState<string>("");
  const [loadingDados, setLoadingDados] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    setInicio(toIsoDate(start));
    setFim(toIsoDate(end));
    setMesSelecionado(toMonthValue(now));
  }, []);

  useEffect(() => {
    if (!mesSelecionado) return;
    const bounds = getMonthBounds(mesSelecionado);
    if (!bounds) return;
    setInicio(bounds.inicio);
    setFim(bounds.fim);
  }, [mesSelecionado]);

  const mesOpcoes = useMemo(() => {
    const now = new Date();
    const options: string[] = [];
    for (let i = 0; i < 24; i += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      options.push(toMonthValue(date));
    }
    return options;
  }, []);

  useEffect(() => {
    if (loadingPerm) return;

    async function loadUser() {
      try {
        setErro(null);
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          setErro("Usuário não autenticado.");
          return;
        }
        setUserId(auth.user.id);

        const { data: usuarioDb, error: usuarioErr } = await supabase
          .from("users")
          .select(
            "id, nome_completo, company_id, participa_ranking, user_types(name), companies(nome_fantasia)"
          )
          .eq("id", auth.user.id)
          .maybeSingle();
        if (usuarioErr) throw usuarioErr;

        const tipo = String((usuarioDb as Usuario | null)?.user_types?.name || "").toUpperCase();
        const isGestorTipo = tipo.includes("GESTOR");
        let nextPapel: Papel = "OUTRO";
        if (tipo.includes("MASTER")) nextPapel = "MASTER";
        else if (isGestorTipo) nextPapel = "GESTOR";
        else if (effectiveViewOnly) nextPapel = "VIEWER";
        else if (podeVer) nextPapel = "GESTOR";
        setPapel(nextPapel);
        setCompanyId(usuarioDb?.company_id || null);
        setCompanyNome(usuarioDb?.companies?.nome_fantasia || null);

        if (nextPapel === "GESTOR") {
          const empresaId = usuarioDb?.company_id || null;
          const [gestoresGrupo, equipe] = await Promise.all([
            empresaId
              ? (async () => {
                  const { data, error } = await supabase
                    .from("users")
                    .select("id, nome_completo, participa_ranking, user_types(name)")
                    .eq("company_id", empresaId);
                  if (error) throw error;

                  const gestoresEmpresa = (data || [])
                    .filter((row: any) => {
                      const tipoNome = String(row?.user_types?.name || "").toUpperCase();
                      return tipoNome.includes("GESTOR");
                    })
                    .map((row: any) => ({
                      id: String(row?.id || "").trim(),
                      nome: formatNome(row?.nome_completo) || "Gestor",
                      participa: Boolean(row?.participa_ranking),
                    }))
                    .filter((row) => Boolean(row.id));

                  return gestoresEmpresa;
                })()
              : Promise.resolve([]),
            fetchGestorEquipeVendedorIds(auth.user.id),
          ]);
          setEquipeIds(equipe);

          const { data: nomes, error: nomesErr } = await supabase
            .from("users")
            .select("id, nome_completo")
            .in("id", equipe);
          if (nomesErr) throw nomesErr;

          const map: Record<string, string> = {};
          (nomes || []).forEach((n: any) => {
            map[n.id] = formatNome(n.nome_completo) || "Vendedor";
          });
          setEquipeNomes(map);

          const gestoresEmpresa = gestoresGrupo.length > 0
            ? gestoresGrupo
            : [{
                id: auth.user.id,
                nome: formatNome(usuarioDb?.nome_completo) || "Gestor",
                participa: Boolean((usuarioDb as Usuario | null)?.participa_ranking),
              }];
          const gestoresMap: Record<string, string> = {};
          const flagsMap: Record<string, boolean> = {};
          gestoresEmpresa.forEach((gestor) => {
            gestoresMap[gestor.id] = gestor.nome;
            flagsMap[gestor.id] = gestor.participa;
          });
          setGestoresNomes(gestoresMap);
          setGestorRankingFlags(flagsMap);
        }

        if (nextPapel === "VIEWER") {
          setGestorRankingFlags({});
          setGestoresNomes({});

          const empresaId = usuarioDb?.company_id || null;
          if (!empresaId) {
            setEquipeIds([]);
            setEquipeNomes({});
            return;
          }

          const { data: equipeData, error: equipeErr } = await supabase
            .from("users")
            .select("id, nome_completo, user_types(name), participa_ranking")
            .eq("company_id", empresaId);
          if (equipeErr) throw equipeErr;

          const ids: string[] = [];
          const nomes: Record<string, string> = {};
          (equipeData || []).forEach((row: any) => {
            const tipoNome = String(row?.user_types?.name || "").toUpperCase();
            const isVend = tipoNome.includes("VENDEDOR");
            const isGest = tipoNome.includes("GESTOR");
            if (!isVend && !(isGest && row?.participa_ranking)) return;
            const id = String(row?.id || "").trim();
            if (!id) return;
            ids.push(id);
            nomes[id] = formatNome(row?.nome_completo) || "Vendedor";
          });
          const uniqueIds = Array.from(new Set(ids));
          setEquipeIds(uniqueIds);
          setEquipeNomes(nomes);
        }
      } catch (e) {
        console.error(e);
        setErro("Erro ao carregar contexto do usuário.");
      }
    }

    loadUser();
  }, [effectiveViewOnly, loadingPerm, podeVer]);

  useEffect(() => {
    if (papel !== "MASTER") return;
    const ids = masterScope.vendedorIds || [];
    setEquipeIds(ids);
    const map: Record<string, string> = {};
    masterScope.vendedoresDisponiveis.forEach((v) => {
      map[v.id] = formatNome(v.nome_completo) || "Vendedor";
    });
    setEquipeNomes(map);

    const gestoresMap: Record<string, string> = {};
    masterScope.gestoresDisponiveis.forEach((g) => {
      gestoresMap[g.id] = formatNome(g.nome_completo) || "Gestor";
    });
    setGestoresNomes(gestoresMap);

    if (masterScope.empresaSelecionada !== "all") {
      setCompanyId(masterScope.empresaSelecionada);
      const empresa = masterScope.empresasAprovadas.find(
        (e) => e.id === masterScope.empresaSelecionada
      );
      setCompanyNome(empresa?.nome_fantasia || null);
    } else {
      setCompanyId(null);
      setCompanyNome(null);
    }
  }, [
    papel,
    masterScope.vendedorIds,
    masterScope.vendedoresDisponiveis,
    masterScope.empresaSelecionada,
    masterScope.empresasAprovadas,
    masterScope.gestoresDisponiveis,
  ]);

  useEffect(() => {
    if (papel !== "MASTER") return;
    const gestorIds = masterScope.gestoresDisponiveis.map((g) => g.id).filter(Boolean);
    if (gestorIds.length === 0) {
      setGestorRankingFlags({});
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("users")
          .select("id, participa_ranking")
          .in("id", gestorIds);
        if (error) throw error;

        const flags: Record<string, boolean> = {};
        gestorIds.forEach((id) => {
          flags[id] = false;
        });
        (data || []).forEach((row: any) => {
          flags[row.id] = Boolean(row.participa_ranking);
        });

        if (mounted) setGestorRankingFlags(flags);
      } catch (e) {
        console.error(e);
        if (mounted) setErro("Erro ao carregar configuracoes de gestores.");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [papel, masterScope.gestoresDisponiveis]);

  const gestoresSelecionados = useMemo(() => {
    if (papel === "GESTOR") {
      return Object.entries(gestorRankingFlags)
        .filter(([, flag]) => flag)
        .map(([id]) => id);
    }
    if (papel === "MASTER") {
      if (masterScope.vendedorSelecionado !== "all") return [];
      if (masterScope.gestorSelecionado !== "all") {
        return gestorRankingFlags[masterScope.gestorSelecionado]
          ? [masterScope.gestorSelecionado]
          : [];
      }
      return Object.entries(gestorRankingFlags)
        .filter(([, flag]) => flag)
        .map(([id]) => id);
    }
    return [];
  }, [
    papel,
    userId,
    gestorRankingFlags,
    masterScope.gestorSelecionado,
    masterScope.vendedorSelecionado,
  ]);

  const gestoresSet = useMemo(() => new Set(gestoresSelecionados), [gestoresSelecionados]);

  const equipeFiltroIds = useMemo(() => {
    const ids = [...equipeIds, ...gestoresSelecionados].filter(Boolean);
    return Array.from(new Set(ids));
  }, [equipeIds, gestoresSelecionados]);

  const nomesMap = useMemo(
    () => ({
      ...equipeNomes,
      ...gestoresNomes,
    }),
    [equipeNomes, gestoresNomes]
  );

  const gestoresParaConfig = useMemo(() => {
    if (papel === "MASTER") {
      return masterScope.gestoresDisponiveis.map((g) => ({
        id: g.id,
        nome: formatNome(g.nome_completo) || "Gestor",
      }));
    }
    if (papel === "GESTOR") {
      return Object.entries(gestoresNomes)
        .map(([id, nome]) => ({ id, nome: nome || "Gestor" }))
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    }
    return [];
  }, [papel, gestoresNomes, masterScope.gestoresDisponiveis]);

  useEffect(() => {
    if (!inicio || !fim) return;
    if (!podeVer) return;
    if (papel === "MASTER" && masterScope.loading) return;

    const equipeFiltro = equipeFiltroIds.length > 0 ? equipeFiltroIds : [];
    if (equipeFiltro.length === 0) {
      setVendas([]);
      setMetas([]);
      setMetasProduto([]);
      setProdutosMeta([]);
      setLoadingDados(false);
      return;
    }

    async function loadDados() {
      try {
        setLoadingDados(true);
        setErro(null);
        const payload = await fetchRankingDados({
          inicio,
          fim,
          vendedorIds: equipeFiltro,
          companyId,
          viewOnly: effectiveViewOnly,
        });

        const params = payload.params || DEFAULT_PARAMS;
        setParametros({
          usar_taxas_na_meta: Boolean(params.usar_taxas_na_meta),
          foco_valor: params.foco_valor === "liquido" ? "liquido" : "bruto",
        });
        setVendas(payload.vendas || []);
        setMetas(payload.metas || []);
        setMetasProduto(payload.metasProduto || []);
        setProdutosMeta(payload.produtosMeta || []);
      } catch (e) {
        console.error(e);
        setErro("Erro ao carregar dados do ranking.");
      } finally {
        setLoadingDados(false);
      }
    }

    loadDados();
  }, [
    inicio,
    fim,
    equipeFiltroIds,
    papel,
    companyId,
    masterScope.loading,
    masterScope.empresaSelecionada,
    masterScope.gestorSelecionado,
    masterScope.vendedorSelecionado,
  ]);

  async function atualizarGestorRanking(gestorId: string, value: boolean) {
    const prevValue = gestorRankingFlags[gestorId];
    setGestorRankingFlags((prev) => ({ ...prev, [gestorId]: value }));
    try {
      const { error } = await supabase
        .from("users")
        .update({ participa_ranking: value })
        .eq("id", gestorId);
      if (error) throw error;
    } catch (e) {
      console.error(e);
      setGestorRankingFlags((prev) => ({ ...prev, [gestorId]: prevValue }));
      setErro("Erro ao atualizar configuracao de ranking do gestor.");
    }
  }

  const monthInfo = useMemo(() => {
    const base = inicio ? parseIsoDate(inicio) : new Date();
    const now = new Date();
    const daysInMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    const sameMonth = base.getFullYear() === now.getFullYear() && base.getMonth() === now.getMonth();
    const diaAtual = sameMonth ? now.getDate() : daysInMonth;
    const diasRestantes = Math.max(0, daysInMonth - diaAtual);
    const idealPct = daysInMonth > 0 ? (diaAtual / daysInMonth) * 100 : 0;
    const mesLabel = MESES[base.getMonth()] || "";
    return { diaAtual, diasRestantes, idealPct, mesLabel, daysInMonth };
  }, [inicio]);

  const metaMaps = useMemo(() => {
    const metaPorVendedor: Record<string, number> = {};
    const metaIdToVendedor: Record<string, string> = {};
    metas.forEach((m) => {
      if (m.scope === "equipe") return;
      const valor = Number(m.meta_geral || 0);
      metaPorVendedor[m.vendedor_id] = (metaPorVendedor[m.vendedor_id] || 0) + valor;
      if (m.id) metaIdToVendedor[m.id] = m.vendedor_id;
    });

    const metaProdutoPorVendedor: Record<string, Record<string, number>> = {};
    const metaProdutoTotais: Record<string, number> = {};
    metasProduto.forEach((mp) => {
      const vid = metaIdToVendedor[mp.meta_vendedor_id];
      if (!vid || !mp.produto_id) return;
      metaProdutoPorVendedor[mp.produto_id] = metaProdutoPorVendedor[mp.produto_id] || {};
      metaProdutoPorVendedor[mp.produto_id][vid] =
        (metaProdutoPorVendedor[mp.produto_id][vid] || 0) + Number(mp.valor || 0);
      metaProdutoTotais[mp.produto_id] =
        (metaProdutoTotais[mp.produto_id] || 0) + Number(mp.valor || 0);
    });

    return { metaPorVendedor, metaProdutoPorVendedor, metaProdutoTotais };
  }, [metas, metasProduto]);

  const produtoNomeMap = useMemo(() => {
    const map: Record<string, string> = {};
    produtosMeta.forEach((p) => {
      map[p.id] = p.nome || "Produto";
    });
    return map;
  }, [produtosMeta]);

  const produtosComMeta = useMemo(() => {
    if (!metaProdEnabled) return [];
    return Object.keys(metaMaps.metaProdutoTotais)
      .map((id) => ({
        id,
        nome: produtoNomeMap[id] || "Produto",
        meta: metaMaps.metaProdutoTotais[id] || 0,
      }))
      .sort((a, b) => (a.meta < b.meta ? 1 : -1));
  }, [metaProdEnabled, metaMaps.metaProdutoTotais, produtoNomeMap]);

  useEffect(() => {
    if (produtosComMeta.length === 0) {
      setProdutoSelecionado("");
      return;
    }
    setProdutoSelecionado((prev) =>
      prev && produtosComMeta.some((p) => p.id === prev) ? prev : produtosComMeta[0].id
    );
  }, [produtosComMeta]);

  const totals = useMemo(() => {
    const totalsByVendor: Record<string, { bruto: number; liquido: number; baseMeta: number }> = {};
    const totalsProdutoByVendor: Record<string, Record<string, number>> = {};
    const params = parametros || DEFAULT_PARAMS;

    vendas.forEach((v) => {
      const vid = v.vendedor_id || "";
      if (!vid) return;
      (v.vendas_recibos || []).forEach((r) => {
        const bruto = Number(r.valor_total || 0);
        const taxas = Number(r.valor_taxas || 0);
        const liquido = bruto - taxas;
        const baseMeta = calcularBaseMeta(bruto, liquido, params);
        if (!totalsByVendor[vid]) {
          totalsByVendor[vid] = { bruto: 0, liquido: 0, baseMeta: 0 };
        }
        totalsByVendor[vid].bruto += bruto;
        totalsByVendor[vid].liquido += liquido;
        totalsByVendor[vid].baseMeta += baseMeta;

        const prodId = r.tipo_produtos?.id || r.produto_id || "";
        if (prodId) {
          totalsProdutoByVendor[prodId] = totalsProdutoByVendor[prodId] || {};
          totalsProdutoByVendor[prodId][vid] =
            (totalsProdutoByVendor[prodId][vid] || 0) + baseMeta;
        }
      });
    });

    return { totalsByVendor, totalsProdutoByVendor };
  }, [vendas, parametros]);

  const ranking = useMemo(() => {
    if (equipeFiltroIds.length === 0) return [];
    const rows = equipeFiltroIds.map((vid) => {
      const totalsVendor = totals.totalsByVendor[vid] || {
        bruto: 0,
        liquido: 0,
        baseMeta: 0,
      };
      const metaMensal = metaMaps.metaPorVendedor[vid] || 0;
      const atingimento = metaMensal > 0 ? (totalsVendor.baseMeta / metaMensal) * 100 : 0;
      const metaDiaria =
        monthInfo.diasRestantes > 0 && metaMensal > 0
          ? Math.max(0, metaMensal - totalsVendor.baseMeta) / monthInfo.diasRestantes
          : null;
      return {
        vendedor_id: vid,
        nome: nomesMap[vid] || "Vendedor",
        metaMensal,
        totalBruto: totalsVendor.bruto,
        totalLiquido: totalsVendor.liquido,
        baseMeta: totalsVendor.baseMeta,
        atingimento,
        metaDiaria,
      };
    });
    return rows.sort((a, b) => {
      const aGestor = gestoresSet.has(a.vendedor_id);
      const bGestor = gestoresSet.has(b.vendedor_id);
      if (aGestor !== bGestor) return aGestor ? 1 : -1;
      if (a.baseMeta === b.baseMeta) return a.nome.localeCompare(b.nome);
      return a.baseMeta < b.baseMeta ? 1 : -1;
    });
  }, [
    equipeFiltroIds,
    nomesMap,
    metaMaps.metaPorVendedor,
    totals,
    monthInfo.diasRestantes,
    gestoresSet,
  ]);

  const totalLoja = useMemo(() => {
    const total = ranking.reduce(
      (acc, row) => {
        acc.meta += row.metaMensal;
        acc.bruto += row.totalBruto;
        acc.liquido += row.totalLiquido;
        acc.base += row.baseMeta;
        return acc;
      },
      { meta: 0, bruto: 0, liquido: 0, base: 0 }
    );
    const atingimento = total.meta > 0 ? (total.base / total.meta) * 100 : 0;
    const metaDiaria =
      monthInfo.diasRestantes > 0 && total.meta > 0
        ? Math.max(0, total.meta - total.base) / monthInfo.diasRestantes
        : null;
    return { ...total, atingimento, metaDiaria };
  }, [ranking, monthInfo.diasRestantes]);

  const rankingProduto = useMemo(() => {
    if (!produtoSelecionado || equipeFiltroIds.length === 0) return [];
    const byVendor = totals.totalsProdutoByVendor[produtoSelecionado] || {};
    return equipeFiltroIds
      .map((vid) => ({
        vendedor_id: vid,
        nome: nomesMap[vid] || "Vendedor",
        total: byVendor[vid] || 0,
      }))
      .sort((a, b) => {
        const aGestor = gestoresSet.has(a.vendedor_id);
        const bGestor = gestoresSet.has(b.vendedor_id);
        if (aGestor !== bGestor) return aGestor ? 1 : -1;
        if (a.total === b.total) return a.nome.localeCompare(b.nome);
        return a.total < b.total ? 1 : -1;
      });
  }, [produtoSelecionado, equipeFiltroIds, nomesMap, totals.totalsProdutoByVendor, gestoresSet]);

  const totalProdutoGeral = useMemo(
    () => rankingProduto.reduce((acc, row) => acc + row.total, 0),
    [rankingProduto]
  );

  const tituloPrincipal = companyNome ? `Ranking da filial ${companyNome}` : "Ranking de Vendas";

  const produtoSelecionadoNome = produtoSelecionado
    ? produtoNomeMap[produtoSelecionado] || "Produto"
    : "";
  const tituloProduto = produtoSelecionadoNome
    ? produtoSelecionadoNome.toLowerCase().includes("seguro")
      ? "Ranking de Seguro"
      : `Ranking de ${produtoSelecionadoNome}`
    : "Ranking por produto";

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">Você não possui acesso a este relatório.</AppCard>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
    <div className="ranking-vendas-page vtur-legacy-module page-content-wrap">
      {!effectiveViewOnly && papel === "MASTER" && (
        <AppCard
          title="Ranking de vendas"
          subtitle="Compare desempenho por mês, equipe e produto."
          tone="info"
          className="mb-3 list-toolbar-sticky"
        >
          <div className="vtur-form-grid vtur-form-grid-3">
            <AppField as="select" label="Filial" value={masterScope.empresaSelecionada} onChange={(e) => masterScope.setEmpresaSelecionada(e.target.value)} options={[{ label: "Todas", value: "all" }, ...masterScope.empresasAprovadas.map((empresa) => ({ label: empresa.nome_fantasia, value: empresa.id }))]} />
            <AppField as="select" label="Equipe" value={masterScope.gestorSelecionado} onChange={(e) => masterScope.setGestorSelecionado(e.target.value)} options={[{ label: "Todas", value: "all" }, ...masterScope.gestoresDisponiveis.map((gestor) => ({ label: formatNome(gestor.nome_completo) || "Gestor", value: gestor.id }))]} />
            <AppField as="select" label="Vendedor" value={masterScope.vendedorSelecionado} onChange={(e) => masterScope.setVendedorSelecionado(e.target.value)} options={[{ label: "Todos", value: "all" }, ...masterScope.vendedoresDisponiveis.map((vendedor) => ({ label: formatNome(vendedor.nome_completo) || "Vendedor", value: vendedor.id }))]} />
          </div>
        </AppCard>
      )}

      {!effectiveViewOnly && gestoresParaConfig.length > 0 && (
        <AppCard
          title="Gestores no ranking"
          subtitle="Defina quais gestores corporativos aparecem no ranking compartilhado da empresa."
          tone="config"
          className="card-config mb-3"
        >
          <div className="table-container">
            <table className="table-default table-header-blue table-mobile-cards">
              <thead>
                <tr>
                  <th>Gestor</th>
                  <th>Exibir no ranking</th>
                </tr>
              </thead>
              <tbody>
                {gestoresParaConfig.map((gestor) => (
                  <tr key={gestor.id}>
                    <td data-label="Gestor">{gestor.nome}</td>
                    <td data-label="Exibir no ranking">
                      <select
                        className="form-select"
                        value={gestorRankingFlags[gestor.id] ? "true" : "false"}
                        onChange={(e) => atualizarGestorRanking(gestor.id, e.target.value === "true")}
                      >
                        <option value="false">Não</option>
                        <option value="true">Sim</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AppCard>
      )}

      {erro && <AlertMessage variant="error"><strong>{erro}</strong></AlertMessage>}

      {loadingDados && (
        <AppCard tone="config">Carregando dados...</AppCard>
      )}

      {!loadingDados && equipeFiltroIds.length === 0 && (
        <AppCard tone="config">
          Nenhum vendedor vinculado para exibir ranking.
        </AppCard>
      )}

      {!loadingDados && equipeFiltroIds.length > 0 && (
        <>
          {effectiveViewOnly && (
            <AppCard tone="config" className="card-config mb-3">
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label className="form-label">Mes</label>
                <select
                  className="form-select"
                  value={mesSelecionado}
                  onChange={(e) => setMesSelecionado(e.target.value)}
                  style={{ width: "100%" }}
                >
                  {mesOpcoes.map((mes) => (
                    <option key={mes} value={mes}>
                      {monthLabel(mes)}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ color: "#64748b", fontSize: "0.9rem" }}>
                Utilize o abaixo filtro para navegar em outros meses.
              </div>
            </AppCard>
          )}

          <div className="ranking-layout">
            <section className="ranking-main">
              <div className="ranking-board">
                <div className="ranking-board-title">{tituloPrincipal}</div>

              {!effectiveViewOnly && (
                <div className="ranking-summary">
                  <div className="summary-label">Vendas até</div>
                  <div className="summary-value">{monthInfo.diaAtual}</div>
                  <div className="summary-label">Dias restantes</div>
                  <div className="summary-value">{monthInfo.diasRestantes}</div>
                  <div className="summary-label">Mês</div>
                  <div className="summary-value">{monthInfo.mesLabel}</div>
                  <div className="summary-label">Ideal para hoje</div>
                  <div className="summary-value">{formatPercent(monthInfo.idealPct)}</div>
                </div>
              )}

              <div className="table-container">
                <table className="ranking-table ranking-table-main table-mobile-cards">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Vendedor</th>
                      <th>Meta mensal</th>
                      <th>Total bruto</th>
                      <th>Total líquido</th>
                      <th>Meta diária</th>
                      <th>% atingimento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.length === 0 && (
                      <tr>
                        <td colSpan={7}>Sem vendas no período.</td>
                      </tr>
                    )}
                    {ranking.map((row, idx) => {
                      const isGestor = gestoresSet.has(row.vendedor_id);
                      const bateuMeta = row.atingimento >= 100;
                      const rowClass = isGestor
                        ? "ranking-row-gestor"
                        : bateuMeta
                        ? "ranking-row-hit"
                        : "ranking-row-miss";
                      return (
                      <tr
                        key={row.vendedor_id}
                        className={rowClass}
                      >
                        <td className="rank-pos" data-label="Posição">{idx + 1}</td>
                        <td data-label="Vendedor">{row.nome}</td>
                        <td data-label="Meta mensal">{formatCurrency(row.metaMensal)}</td>
                        <td data-label="Total bruto">{formatCurrency(row.totalBruto)}</td>
                        <td data-label="Total líquido">{formatCurrency(row.totalLiquido)}</td>
                        <td data-label="Meta diária">{row.metaDiaria != null ? formatCurrency(row.metaDiaria) : "—"}</td>
                        <td data-label="% atingimento">{formatPercent(row.atingimento)}</td>
                      </tr>
                      );
                    })}
                    {ranking.length > 0 && (
                      <tr className="total-row">
                        <td colSpan={2} data-label="Resumo">TOTAL LOJA</td>
                        <td data-label="Meta mensal">{formatCurrency(totalLoja.meta)}</td>
                        <td data-label="Total bruto">{formatCurrency(totalLoja.bruto)}</td>
                        <td data-label="Total líquido">{formatCurrency(totalLoja.liquido)}</td>
                        <td data-label="Meta diária">{totalLoja.metaDiaria != null ? formatCurrency(totalLoja.metaDiaria) : "—"}</td>
                        <td data-label="% atingimento">{formatPercent(totalLoja.atingimento)}</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            </section>

            <aside className="ranking-side">
            {metaProdEnabled && produtosComMeta.length > 0 && (
              <div className="ranking-board">
                <div className="ranking-board-title ranking-board-title-inline ranking-board-title-center">
                  <span>{tituloProduto}</span>
                  {!effectiveViewOnly && produtosComMeta.length > 1 && (
                    <select
                      className="ranking-select"
                      value={produtoSelecionado}
                      onChange={(e) => setProdutoSelecionado(e.target.value)}
                    >
                      {produtosComMeta.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nome}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="table-container">
                  <table className="ranking-table ranking-table-side table-mobile-cards">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Vendedor</th>
                        <th>Total até o período</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingProduto.length === 0 && (
                        <tr>
                          <td colSpan={3}>Sem vendas no período.</td>
                        </tr>
                      )}
                      {rankingProduto.map((row, idx) => {
                        const isGestor = gestoresSet.has(row.vendedor_id);
                        const metaProd =
                          metaMaps.metaProdutoPorVendedor[produtoSelecionado]?.[row.vendedor_id] ||
                          0;
                        const bateuMeta = metaProd > 0 ? row.total >= metaProd : false;
                        const rowClass = isGestor
                          ? "ranking-row-gestor"
                          : bateuMeta
                          ? "ranking-row-hit"
                          : "ranking-row-miss";
                        return (
                        <tr key={`${row.vendedor_id}-${idx}`} className={rowClass}>
                          <td className="rank-pos" data-label="Posição">{idx + 1}</td>
                          <td data-label="Vendedor">{row.nome}</td>
                          <td data-label="Total até o período">{formatCurrency(row.total)}</td>
                        </tr>
                        );
                      })}
                      {rankingProduto.length > 0 && (
                        <tr className="total-row">
                          <td colSpan={2} data-label="Resumo">TOTAL LOJA</td>
                          <td data-label="Total até o período">{formatCurrency(totalProdutoGeral)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {(!metaProdEnabled || produtosComMeta.length === 0) && (
              <AppCard tone="config">
                {metaProdEnabled
                  ? "Nenhuma meta diferenciada por produto no período."
                  : "Ranking por produto desativado nos parâmetros."}
              </AppCard>
            )}
            </aside>
          </div>
        </>
      )}
    </div>
    </AppPrimerProvider>
  );
}
