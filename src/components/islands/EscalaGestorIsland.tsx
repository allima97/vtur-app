import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { useMasterScope } from "../../lib/useMasterScope";
import { formatarDataParaExibicao } from "../../lib/formatDate";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import {
  fetchGestorEquipeBaseId,
  fetchGestorEquipeGestorIds,
  fetchGestorEquipeVendedorIds,
} from "../../lib/gestorEquipe";
import { buildMonthOptionsYYYYMM, formatMonthYearBR } from "../../lib/format";
import { registrarLog } from "../../lib/logs";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";

type Papel = "GESTOR" | "MASTER" | "OUTRO";

type Usuario = {
  id: string;
  nome_completo: string;
  company_id: string | null;
  user_types?: { name: string | null } | null;
  companies?: { nome_fantasia: string | null } | null;
};

type EscalaMes = {
  id: string;
  status: string | null;
};

type EscalaDia = {
  id: string;
  escala_mes_id: string;
  usuario_id: string;
  data: string;
  tipo: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  observacao: string | null;
};

type FeriadoCustom = {
  id: string;
  data: string;
  nome: string;
  tipo: string;
};

type FeriadoNacional = {
  date: string;
  name: string;
  type: string;
};

type HorarioUsuario = {
  usuario_id: string;
  seg_inicio: string | null;
  seg_fim: string | null;
  ter_inicio: string | null;
  ter_fim: string | null;
  qua_inicio: string | null;
  qua_fim: string | null;
  qui_inicio: string | null;
  qui_fim: string | null;
  sex_inicio: string | null;
  sex_fim: string | null;
  sab_inicio: string | null;
  sab_fim: string | null;
  dom_inicio: string | null;
  dom_fim: string | null;
  feriado_inicio: string | null;
  feriado_fim: string | null;
  auto_aplicar: boolean;
};

type CelulaSelecionada = {
  usuario_id: string;
  nome: string;
  data: string;
  registro?: EscalaDia | null;
};

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const TIPOS_TRABALHO = new Set(["TRABALHO", "PLANTAO"]);
const TIPOS_FOLGA = new Set(["FOLGA", "FERIAS", "LICENCA"]);
const HORARIO_SEMANA_KEYS = [
  { inicio: "dom_inicio", fim: "dom_fim" },
  { inicio: "seg_inicio", fim: "seg_fim" },
  { inicio: "ter_inicio", fim: "ter_fim" },
  { inicio: "qua_inicio", fim: "qua_fim" },
  { inicio: "qui_inicio", fim: "qui_fim" },
  { inicio: "sex_inicio", fim: "sex_fim" },
  { inicio: "sab_inicio", fim: "sab_fim" },
] as const;

const TIPO_OPCOES = [
  { value: "", label: "Sem registro" },
  { value: "TRABALHO", label: "Trabalho" },
  { value: "PLANTAO", label: "Plantão" },
  { value: "FOLGA", label: "Folga" },
  { value: "FERIAS", label: "Férias" },
  { value: "LICENCA", label: "Licença" },
  { value: "FERIADO", label: "Feriado" },
  { value: "PENDENCIA", label: "Pendencia" },
];

const TIPO_CODIGO: Record<string, string> = {
  TRABALHO: "T",
  PLANTAO: "P",
  FOLGA: "F",
  FERIAS: "X",
  LICENCA: "L",
  FERIADO: "H",
  PENDENCIA: "!",
};

const TIPO_LABEL: Record<string, string> = {
  TRABALHO: "Trabalho",
  PLANTAO: "Plantão",
  FOLGA: "Folga",
  FERIAS: "Férias",
  LICENCA: "Licença",
  FERIADO: "Feriado",
  PENDENCIA: "Pendência",
};

function formatNome(valor?: string | null) {
  const trimmed = (valor || "").trim();
  return trimmed ? titleCaseWithExceptions(trimmed) : "";
}

function normalizeSortText(valor?: string | null) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function buildIsoDate(year: number, monthIndex: number, day: number) {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function formatTimeRange(inicio?: string | null, fim?: string | null) {
  if (!inicio || !fim) return "";
  return `${inicio.slice(0, 5)}-${fim.slice(0, 5)}`;
}

function formatTipoLabel(tipo?: string | null) {
  if (!tipo) return "";
  return TIPO_LABEL[tipo] || tipo;
}

function capitalizeFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatarResumoFeriado(dataIso: string, nomes: string[]) {
  const date = new Date(`${dataIso}T00:00:00`);
  const diaMes = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  })
    .format(date)
    .replace(".", "");
  const semana = capitalizeFirst(
    new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date)
  );
  const nomesLabel = nomes.filter(Boolean).join(" / ");
  return `${diaMes} - ${semana}${nomesLabel ? ` de ${nomesLabel}` : ""}`;
}

export default function EscalaGestorIsland() {
  const { can, loading: loadingPerms, ready, userType } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Escalas") || can("Parametros");
  const podeEditar =
    can("Escalas", "edit") ||
    can("Escalas", "delete") ||
    can("Escalas", "admin") ||
    can("Parametros", "edit") ||
    can("Parametros", "delete") ||
    can("Parametros", "admin");
  const isMaster = /MASTER/i.test(String(userType || ""));
  const masterScope = useMasterScope(Boolean(isMaster && ready));

  const [papel, setPapel] = useState<Papel>("OUTRO");
  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyNome, setCompanyNome] = useState<string | null>(null);
  const [equipeIds, setEquipeIds] = useState<string[]>([]);
  const [equipeNomes, setEquipeNomes] = useState<Record<string, string>>({});

  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7));
  const periodoOptions = useMemo(() => {
    const options = buildMonthOptionsYYYYMM({ yearsBack: 10, yearsForward: 2, order: "desc" });
    if (periodo && !options.includes(periodo)) return [periodo, ...options];
    return options;
  }, [periodo]);
  const [escalaMesId, setEscalaMesId] = useState<string | null>(null);
  const [escalaDias, setEscalaDias] = useState<EscalaDia[]>([]);
  const [feriadosNacionais, setFeriadosNacionais] = useState<FeriadoNacional[]>([]);
  const [feriadosCustom, setFeriadosCustom] = useState<FeriadoCustom[]>([]);
  const [horariosUsuario, setHorariosUsuario] = useState<Record<string, HorarioUsuario>>({});

  const [erro, setErro] = useState<string | null>(null);
  const [modalErro, setModalErro] = useState<string | null>(null);
  const [feriadosErro, setFeriadosErro] = useState<string | null>(null);
  const [loadingDados, setLoadingDados] = useState(false);

  const [celulaSelecionada, setCelulaSelecionada] = useState<CelulaSelecionada | null>(null);
  const [formTipo, setFormTipo] = useState<string>("");
  const [formInicio, setFormInicio] = useState<string>("");
  const [formFim, setFormFim] = useState<string>("");
  const [formObs, setFormObs] = useState<string>("");
  const [salvandoCelula, setSalvandoCelula] = useState(false);

  const [multiAtivo, setMultiAtivo] = useState(false);
  const [multiUsuarioId, setMultiUsuarioId] = useState<string | null>(null);
  const [multiDatas, setMultiDatas] = useState<string[]>([]);
  const [multiTipo, setMultiTipo] = useState<string>("");
  const [multiInicio, setMultiInicio] = useState<string>("");
  const [multiFim, setMultiFim] = useState<string>("");
  const [multiErro, setMultiErro] = useState<string | null>(null);
  const [multiAplicando, setMultiAplicando] = useState(false);

  const [novoFeriadoData, setNovoFeriadoData] = useState("");
  const [novoFeriadoNome, setNovoFeriadoNome] = useState("");
  const [novoFeriadoTipo, setNovoFeriadoTipo] = useState("MUNICIPAL");
  const [salvandoFeriado, setSalvandoFeriado] = useState(false);

  const gestorSelecionadoRaw =
    papel === "GESTOR"
      ? userId
      : papel === "MASTER" && masterScope.gestorSelecionado !== "all"
      ? masterScope.gestorSelecionado
      : null;

  const [gestorSelecionadoEfetivo, setGestorSelecionadoEfetivo] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function resolveGestorBase() {
      if (!gestorSelecionadoRaw) {
        setGestorSelecionadoEfetivo(null);
        return;
      }
      setGestorSelecionadoEfetivo(null);
      try {
        const baseId = await fetchGestorEquipeBaseId(gestorSelecionadoRaw);
        if (!mounted) return;
        setGestorSelecionadoEfetivo(baseId || gestorSelecionadoRaw);
      } catch (e) {
        console.error(e);
        if (!mounted) return;
        setGestorSelecionadoEfetivo(gestorSelecionadoRaw);
      }
    }

    resolveGestorBase();

    return () => {
      mounted = false;
    };
  }, [gestorSelecionadoRaw]);

  useEffect(() => {
    setEscalaMesId(null);
    setEscalaDias([]);
    setFeriadosCustom([]);
    setHorariosUsuario({});
  }, [companyId, gestorSelecionadoEfetivo, periodo]);

  const anoSelecionado = Number(periodo.split("-")[0] || "");
  const mesSelecionadoIndex = Number(periodo.split("-")[1] || "1") - 1;
  const diasNoMes =
    Number.isFinite(anoSelecionado) && mesSelecionadoIndex >= 0
      ? new Date(anoSelecionado, mesSelecionadoIndex + 1, 0).getDate()
      : 0;

  const diasMes = useMemo(() => {
    if (!Number.isFinite(anoSelecionado) || mesSelecionadoIndex < 0) return [];
    return Array.from({ length: diasNoMes }, (_, idx) => {
      const dia = idx + 1;
      const data = buildIsoDate(anoSelecionado, mesSelecionadoIndex, dia);
      const semana = new Date(anoSelecionado, mesSelecionadoIndex, dia).getDay();
      return { dia, data, semana };
    });
  }, [anoSelecionado, mesSelecionadoIndex, diasNoMes]);

  const periodoInicio = diasMes[0]?.data || "";
  const periodoFim = diasMes[diasMes.length - 1]?.data || "";

  useEffect(() => {
    if (loadingPerm) return;
    async function loadUser() {
      try {
        setErro(null);
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          setErro("Usuario nao autenticado.");
          return;
        }
        setUserId(auth.user.id);
        const { data: usuarioDb, error: usuarioErr } = await supabase
          .from("users")
          .select("id, nome_completo, company_id, user_types(name), companies(nome_fantasia)")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (usuarioErr) throw usuarioErr;

        const tipo = String((usuarioDb as Usuario | null)?.user_types?.name || "").toUpperCase();
        let nextPapel: Papel = "OUTRO";
        if (tipo.includes("MASTER")) nextPapel = "MASTER";
        else if (tipo.includes("GESTOR")) nextPapel = "GESTOR";
        else if (podeVer) nextPapel = "GESTOR";
        setPapel(nextPapel);

        const companyIdLocal = usuarioDb?.company_id || null;
        setCompanyId(companyIdLocal);
        setCompanyNome(usuarioDb?.companies?.nome_fantasia || null);

        if (nextPapel === "GESTOR") {
          const [gestoresGrupo, vendedoresIds] = await Promise.all([
            fetchGestorEquipeGestorIds(auth.user.id),
            fetchGestorEquipeVendedorIds(auth.user.id),
          ]);
          const equipe = Array.from(new Set([...gestoresGrupo, ...vendedoresIds].filter(Boolean)));
          const { data: nomes, error: nomesErr } = await supabase
            .from("users")
            .select("id, nome_completo")
            .in("id", equipe);
          if (nomesErr) throw nomesErr;
          const map: Record<string, string> = {};
          const gestoresSet = new Set(gestoresGrupo);
          (nomes || []).forEach((n: any) => {
            map[n.id] = formatNome(n.nome_completo) || (gestoresSet.has(n.id) ? "Gestor" : "Vendedor");
          });
          equipe.forEach((id) => {
            if (!map[id]) map[id] = "Usuário";
          });
          const sortByName = (a: string, b: string) => {
            const ka = normalizeSortText(map[a]) || "\uffff";
            const kb = normalizeSortText(map[b]) || "\uffff";
            const cmp = ka.localeCompare(kb, "pt-BR");
            if (cmp !== 0) return cmp;
            return a.localeCompare(b);
          };
          setEquipeIds([...equipe].sort(sortByName));
          setEquipeNomes(map);
        }
      } catch (e) {
        console.error(e);
        setErro("Erro ao carregar contexto do usuario.");
      }
    }
    loadUser();
  }, [loadingPerm, podeVer]);

  useEffect(() => {
    if (!isMaster) return;
    let mounted = true;

    async function syncEquipe() {
      const vendedoresIds = masterScope.vendedorIds || [];
      const gestorId =
        masterScope.gestorSelecionado !== "all" ? masterScope.gestorSelecionado : null;
      const gestoresGrupo = gestorId ? await fetchGestorEquipeGestorIds(gestorId) : [];
      const equipe = Array.from(new Set([...gestoresGrupo, ...vendedoresIds].filter(Boolean)));

      const map: Record<string, string> = {};
      masterScope.vendedoresDisponiveis.forEach((v) => {
        if (vendedoresIds.includes(v.id)) map[v.id] = formatNome(v.nome_completo) || "Vendedor";
      });

      const gestoresDisponiveis = masterScope.gestoresDisponiveis;
      gestoresGrupo.forEach((gid) => {
        const gestor = gestoresDisponiveis.find((g) => g.id === gid) || null;
        if (gestor) map[gid] = formatNome(gestor.nome_completo) || "Gestor";
      });
      if (gestorId && !map[gestorId]) map[gestorId] = "Gestor";

      equipe.forEach((id) => {
        if (!map[id]) map[id] = "Usuário";
      });
      const sortByName = (a: string, b: string) => {
        const ka = normalizeSortText(map[a]) || "\uffff";
        const kb = normalizeSortText(map[b]) || "\uffff";
        const cmp = ka.localeCompare(kb, "pt-BR");
        if (cmp !== 0) return cmp;
        return a.localeCompare(b);
      };
      const idsFinal = [...equipe].sort(sortByName);

      if (!mounted) return;
      setEquipeIds(idsFinal);
      setEquipeNomes(map);

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
    }

    syncEquipe().catch((e) => {
      console.error(e);
    });

    return () => {
      mounted = false;
    };
  }, [
    isMaster,
    masterScope.empresaSelecionada,
    masterScope.empresasAprovadas,
    masterScope.vendedorIds,
    masterScope.vendedoresDisponiveis,
    masterScope.gestorSelecionado,
    masterScope.gestoresDisponiveis,
  ]);

  useEffect(() => {
    async function loadFeriadosNacionais() {
      if (!Number.isFinite(anoSelecionado)) return;
      try {
        setFeriadosErro(null);
        const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${anoSelecionado}`);
        if (!resp.ok) throw new Error("Falha ao carregar feriados nacionais.");
        const data = (await resp.json()) as FeriadoNacional[];
        setFeriadosNacionais(data || []);
      } catch (e) {
        console.error(e);
        setFeriadosErro("Nao foi possivel carregar feriados nacionais.");
      }
    }
    loadFeriadosNacionais();
  }, [anoSelecionado]);

  useEffect(() => {
    async function loadEscala() {
      if (!periodoInicio || !periodoFim) return;
      if (papel !== "GESTOR" && papel !== "MASTER") return;
      if (papel === "MASTER" && (!companyId || !gestorSelecionadoRaw)) {
        setEscalaMesId(null);
        setEscalaDias([]);
        setFeriadosCustom([]);
        setHorariosUsuario({});
        return;
      }
      if (papel === "GESTOR" && !companyId) return;
      if (!gestorSelecionadoEfetivo) {
        setEscalaMesId(null);
        setEscalaDias([]);
        setFeriadosCustom([]);
        setHorariosUsuario({});
        return;
      }

      try {
        setLoadingDados(true);
        setErro(null);

        const periodoDate = `${periodo}-01`;
        const { data: escalaMesData, error: escalaErr } = await supabase
          .from("escala_mes")
          .select("id, status")
          .eq("company_id", companyId)
          .eq("gestor_id", gestorSelecionadoEfetivo)
          .eq("periodo", periodoDate)
          .maybeSingle();
        if (escalaErr) throw escalaErr;

        const escalaMes = escalaMesData as EscalaMes | null;
        setEscalaMesId(escalaMes?.id || null);

        if (escalaMes?.id) {
          let query = supabase
            .from("escala_dia")
            .select(
              "id, escala_mes_id, usuario_id, data, tipo, hora_inicio, hora_fim, observacao"
            )
            .eq("escala_mes_id", escalaMes.id);
          if (equipeIds.length > 0) query = query.in("usuario_id", equipeIds);
          const { data: diasData, error: diasErr } = await query;
          if (diasErr) throw diasErr;
          setEscalaDias((diasData || []) as EscalaDia[]);
        } else {
          setEscalaDias([]);
        }

        if (companyId) {
          const { data: feriadosData, error: feriadosErr } = await supabase
            .from("feriados")
            .select("id, data, nome, tipo")
            .eq("company_id", companyId)
            .gte("data", periodoInicio)
            .lte("data", periodoFim)
            .order("data", { ascending: true });
          if (feriadosErr) throw feriadosErr;
          setFeriadosCustom((feriadosData || []) as FeriadoCustom[]);
        } else {
          setFeriadosCustom([]);
        }

        if (companyId && equipeIds.length > 0) {
          const { data: horariosData, error: horariosErr } = await supabase
            .from("escala_horario_usuario")
            .select(
              "usuario_id, seg_inicio, seg_fim, ter_inicio, ter_fim, qua_inicio, qua_fim, qui_inicio, qui_fim, sex_inicio, sex_fim, sab_inicio, sab_fim, dom_inicio, dom_fim, feriado_inicio, feriado_fim, auto_aplicar"
            )
            .eq("company_id", companyId)
            .in("usuario_id", equipeIds);
          if (horariosErr) throw horariosErr;
          const map: Record<string, HorarioUsuario> = {};
          (horariosData || []).forEach((row: any) => {
            map[row.usuario_id] = {
              ...row,
              auto_aplicar: Boolean(row.auto_aplicar),
            };
          });
          setHorariosUsuario(map);
        } else {
          setHorariosUsuario({});
        }
      } catch (e) {
        console.error(e);
        setErro("Erro ao carregar escala.");
      } finally {
        setLoadingDados(false);
      }
    }
    loadEscala();
  }, [
    periodo,
    periodoInicio,
    periodoFim,
    papel,
    companyId,
    gestorSelecionadoRaw,
    gestorSelecionadoEfetivo,
    equipeIds,
  ]);

  useEffect(() => {
    if (!multiAtivo) {
      setMultiDatas([]);
      setMultiUsuarioId(null);
      setMultiTipo("");
      setMultiInicio("");
      setMultiFim("");
      setMultiErro(null);
    }
  }, [multiAtivo]);

  useEffect(() => {
    setMultiDatas([]);
    setMultiUsuarioId(null);
    setMultiInicio("");
    setMultiFim("");
    setMultiErro(null);
  }, [periodo, gestorSelecionadoEfetivo, companyId, equipeIds]);

  useEffect(() => {
    if (multiAtivo && celulaSelecionada) {
      fecharCelula();
    }
  }, [multiAtivo, celulaSelecionada]);

  const feriadosPorData = useMemo(() => {
    const map: Record<string, { nome: string; origem: string }[]> = {};
    feriadosNacionais.forEach((f) => {
      if (!f?.date) return;
      if (!f.date.startsWith(periodo)) return;
      if (!map[f.date]) map[f.date] = [];
      map[f.date].push({ nome: f.name, origem: "nacional" });
    });
    feriadosCustom.forEach((f) => {
      if (!f?.data) return;
      if (!map[f.data]) map[f.data] = [];
      map[f.data].push({ nome: f.nome, origem: "custom" });
    });
    return map;
  }, [feriadosNacionais, feriadosCustom, periodo]);

  const resumoFeriadosLista = useMemo(() => {
    const entries = Object.entries(feriadosPorData);
    if (entries.length === 0) return [];
    return entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([data, itens]) => {
        const nomes = Array.from(new Set(itens.map((i) => i.nome)));
        const origens = Array.from(new Set(itens.map((i) => i.origem)));
        return {
          data,
          texto: formatarResumoFeriado(data, nomes),
          origens,
        };
      });
  }, [feriadosPorData]);

  const registrosMap = useMemo(() => {
    const map: Record<string, EscalaDia> = {};
    escalaDias.forEach((r) => {
      map[`${r.usuario_id}_${r.data}`] = r;
    });
    return map;
  }, [escalaDias]);

  const resumoPorUsuario = useMemo(() => {
    const resumo: Record<string, { trabalhados: number; folgas: number }> = {};
    equipeIds.forEach((id) => {
      resumo[id] = { trabalhados: 0, folgas: 0 };
    });
    escalaDias.forEach((r) => {
      const item = resumo[r.usuario_id] || { trabalhados: 0, folgas: 0 };
      if (TIPOS_TRABALHO.has(r.tipo)) item.trabalhados += 1;
      if (TIPOS_FOLGA.has(r.tipo)) item.folgas += 1;
      resumo[r.usuario_id] = item;
    });
    return resumo;
  }, [equipeIds, escalaDias]);

  function isFeriadoEspecial(dataIso: string) {
    const [, mes, dia] = dataIso.split("-").map((v) => Number(v));
    return mes === 12 && (dia === 24 || dia === 31);
  }

  function resolveHorarioAuto(usuarioId: string, dataIso: string) {
    const horario = horariosUsuario[usuarioId];
    if (!horario?.auto_aplicar) return null;
    const isFeriado = Boolean(feriadosPorData[dataIso]?.length) || isFeriadoEspecial(dataIso);
    let inicio: string | null = null;
    let fim: string | null = null;
    if (isFeriado) {
      inicio = horario.feriado_inicio || null;
      fim = horario.feriado_fim || null;
    }
    if (!inicio || !fim) {
      const dayIndex = new Date(`${dataIso}T00:00:00`).getDay();
      const keys = HORARIO_SEMANA_KEYS[dayIndex];
      const inicioSemana = horario[keys.inicio as keyof HorarioUsuario] as string | null;
      const fimSemana = horario[keys.fim as keyof HorarioUsuario] as string | null;
      inicio = inicio || inicioSemana || null;
      fim = fim || fimSemana || null;
    }
    if (inicio && fim) {
      return { inicio, fim };
    }
    return null;
  }

  function abrirCelula(usuario_id: string, data: string) {
    if (!podeEditar) {
      setErro("Voce nao tem permissao para editar a escala.");
      return;
    }
    setErro(null);
    setModalErro(null);
    const registro = registrosMap[`${usuario_id}_${data}`];
    setCelulaSelecionada({
      usuario_id,
      nome: equipeNomes[usuario_id] || "Vendedor",
      data,
      registro: registro || null,
    });
    setFormTipo(registro?.tipo || "");
    setFormInicio(registro?.hora_inicio || "");
    setFormFim(registro?.hora_fim || "");
    setFormObs(registro?.observacao || "");
  }

  function limparSelecaoMultipla(manterTipo = false) {
    setMultiDatas([]);
    setMultiUsuarioId(null);
    setMultiErro(null);
    if (!manterTipo) setMultiTipo("");
  }

  function alternarSelecaoMultipla(usuario_id: string, data: string) {
    setMultiErro(null);
    setMultiDatas((prev) => {
      if (multiUsuarioId && multiUsuarioId !== usuario_id) {
        setMultiErro("Selecione datas de apenas um vendedor por vez.");
        return prev;
      }
      const existe = prev.includes(data);
      const next = existe ? prev.filter((d) => d !== data) : [...prev, data];
      if (next.length === 0) {
        setMultiUsuarioId(null);
      } else if (!multiUsuarioId) {
        setMultiUsuarioId(usuario_id);
      }
      return next;
    });
  }

  function fecharCelula() {
    setCelulaSelecionada(null);
    setFormTipo("");
    setFormInicio("");
    setFormFim("");
    setFormObs("");
    setModalErro(null);
  }

  async function ensureEscalaMes() {
    if (!companyId || !gestorSelecionadoEfetivo) {
      throw new Error("Escala sem contexto.");
    }
    if (escalaMesId) return escalaMesId;
    const periodoDate = `${periodo}-01`;
    const { data: existente, error: existeErr } = await supabase
      .from("escala_mes")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("gestor_id", gestorSelecionadoEfetivo)
      .eq("periodo", periodoDate)
      .maybeSingle();
    if (existeErr) throw existeErr;
    if (existente?.id) {
      setEscalaMesId(existente.id);
      return existente.id;
    }

    const { data, error } = await supabase
      .from("escala_mes")
      .insert({
        company_id: companyId,
        gestor_id: gestorSelecionadoEfetivo,
        periodo: periodoDate,
        status: "rascunho",
      })
      .select("id, status")
      .single();
    if (error) {
      const code = String((error as any)?.code || "");
      if (code === "23505") {
        const { data: existente2, error: existeErr2 } = await supabase
          .from("escala_mes")
          .select("id, status")
          .eq("company_id", companyId)
          .eq("gestor_id", gestorSelecionadoEfetivo)
          .eq("periodo", periodoDate)
          .maybeSingle();
        if (existeErr2) throw existeErr2;
        if (existente2?.id) {
          setEscalaMesId(existente2.id);
          return existente2.id;
        }
      }
      throw error;
    }
    const escalaMes = data as EscalaMes;
    setEscalaMesId(escalaMes.id);
    return escalaMes.id;
  }

  async function salvarCelula() {
    if (!podeEditar) {
      setModalErro("Voce nao tem permissao para editar a escala.");
      return;
    }
    if (!celulaSelecionada) return;
    try {
      setSalvandoCelula(true);
      setErro(null);
      setModalErro(null);
      const escalaId = await ensureEscalaMes();

      if (!formTipo) {
        if (celulaSelecionada.registro?.id) {
          const { error } = await supabase
            .from("escala_dia")
            .delete()
            .eq("id", celulaSelecionada.registro.id);
          if (error) throw error;
          setEscalaDias((prev) =>
            prev.filter((r) => r.id !== celulaSelecionada.registro?.id)
          );
          void registrarLog({
            acao: "escala_dia_removida",
            modulo: "Escalas",
            detalhes: {
              company_id: companyId,
              gestor_id: gestorSelecionadoEfetivo,
              gestor_raw_id: gestorSelecionadoRaw,
              papel,
              escala_dia_id: celulaSelecionada.registro.id,
              escala_mes_id: celulaSelecionada.registro.escala_mes_id,
              usuario_id: celulaSelecionada.usuario_id,
              data: celulaSelecionada.data,
              tipo_anterior: celulaSelecionada.registro.tipo,
              hora_inicio_anterior: celulaSelecionada.registro.hora_inicio,
              hora_fim_anterior: celulaSelecionada.registro.hora_fim,
              observacao_anterior: celulaSelecionada.registro.observacao,
            },
          });
        }
        fecharCelula();
        return;
      }

      const precisaHorario = TIPOS_TRABALHO.has(formTipo);
      let horaInicioFinal = formInicio || null;
      let horaFimFinal = formFim || null;
      if (precisaHorario) {
        if ((formInicio && !formFim) || (!formInicio && formFim)) {
          setModalErro("Informe inicio e fim para o horario.");
          return;
        }
        if (!formInicio && !formFim) {
          const autoHorario = resolveHorarioAuto(
            celulaSelecionada.usuario_id,
            celulaSelecionada.data
          );
          if (autoHorario) {
            horaInicioFinal = autoHorario.inicio;
            horaFimFinal = autoHorario.fim;
          } else {
            setModalErro("Informe inicio e fim do horario.");
            return;
          }
        }
      } else {
        horaInicioFinal = null;
        horaFimFinal = null;
      }

      const payload = {
        escala_mes_id: escalaId,
        usuario_id: celulaSelecionada.usuario_id,
        data: celulaSelecionada.data,
        tipo: formTipo,
        hora_inicio: horaInicioFinal,
        hora_fim: horaFimFinal,
        observacao: formObs || null,
      };

      const { data, error } = await supabase
        .from("escala_dia")
        .upsert(payload, { onConflict: "escala_mes_id,usuario_id,data" })
        .select("id, escala_mes_id, usuario_id, data, tipo, hora_inicio, hora_fim, observacao")
        .single();
      if (error) throw error;

      const registroSalvo = data as EscalaDia;
      setEscalaDias((prev) => {
        const idx = prev.findIndex((r) => r.id === registroSalvo.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = registroSalvo;
          return next;
        }
        return [...prev, registroSalvo];
      });
      void registrarLog({
        acao: "escala_dia_salva",
        modulo: "Escalas",
        detalhes: {
          company_id: companyId,
          gestor_id: gestorSelecionadoEfetivo,
          gestor_raw_id: gestorSelecionadoRaw,
          papel,
          operacao: celulaSelecionada.registro?.id ? "update" : "insert",
          escala_dia_id: registroSalvo.id,
          escala_mes_id: registroSalvo.escala_mes_id,
          usuario_id: registroSalvo.usuario_id,
          data: registroSalvo.data,
          tipo: registroSalvo.tipo,
          hora_inicio: registroSalvo.hora_inicio,
          hora_fim: registroSalvo.hora_fim,
          observacao: registroSalvo.observacao,
        },
      });
      fecharCelula();
    } catch (e) {
      console.error(e);
      setModalErro(e instanceof Error ? e.message : "Erro ao salvar escala.");
    } finally {
      setSalvandoCelula(false);
    }
  }

  async function aplicarSelecaoMultipla() {
    if (!podeEditar) {
      setMultiErro("Voce nao tem permissao para editar a escala.");
      return;
    }
    if (!multiAtivo) return;
    if (!multiUsuarioId || multiDatas.length === 0) {
      setMultiErro("Selecione ao menos uma data.");
      return;
    }
    if ((multiInicio && !multiFim) || (!multiInicio && multiFim)) {
      setMultiErro("Informe inicio e fim para o horario.");
      return;
    }

    try {
      setMultiAplicando(true);
      setMultiErro(null);

      if (!multiTipo) {
        if (escalaMesId) {
          const { error } = await supabase
            .from("escala_dia")
            .delete()
            .eq("escala_mes_id", escalaMesId)
            .eq("usuario_id", multiUsuarioId)
            .in("data", multiDatas);
          if (error) throw error;
          setEscalaDias((prev) =>
            prev.filter(
              (r) => !(r.usuario_id === multiUsuarioId && multiDatas.includes(r.data))
            )
          );
          void registrarLog({
            acao: "escala_dia_lote_removido",
            modulo: "Escalas",
            detalhes: {
              company_id: companyId,
              gestor_id: gestorSelecionadoEfetivo,
              gestor_raw_id: gestorSelecionadoRaw,
              papel,
              escala_mes_id: escalaMesId,
              usuario_id: multiUsuarioId,
              datas: multiDatas,
              total: multiDatas.length,
            },
          });
        }
        limparSelecaoMultipla(true);
        return;
      }

      const escalaId = await ensureEscalaMes();
      const informouHorario = Boolean(multiInicio || multiFim);
      const payload = multiDatas.map((data) => {
        const existente = registrosMap[`${multiUsuarioId}_${data}`];
        let horaInicio = existente?.hora_inicio || null;
        let horaFim = existente?.hora_fim || null;
        if (informouHorario) {
          horaInicio = multiInicio || null;
          horaFim = multiFim || null;
        } else if (TIPOS_TRABALHO.has(multiTipo)) {
          const autoHorario = resolveHorarioAuto(multiUsuarioId, data);
          if (autoHorario) {
            horaInicio = autoHorario.inicio;
            horaFim = autoHorario.fim;
          }
        } else {
          horaInicio = null;
          horaFim = null;
        }
        return {
          escala_mes_id: escalaId,
          usuario_id: multiUsuarioId,
          data,
          tipo: multiTipo,
          hora_inicio: horaInicio,
          hora_fim: horaFim,
          observacao: existente?.observacao || null,
        };
      });

      const { data, error } = await supabase
        .from("escala_dia")
        .upsert(payload, { onConflict: "escala_mes_id,usuario_id,data" })
        .select("id, escala_mes_id, usuario_id, data, tipo, hora_inicio, hora_fim, observacao");
      if (error) throw error;

      const atualizados = (data || []) as EscalaDia[];
      setEscalaDias((prev) => {
        const map = new Map(prev.map((r) => [r.id, r]));
        atualizados.forEach((r) => {
          map.set(r.id, r);
        });
        return Array.from(map.values());
      });
      void registrarLog({
        acao: "escala_dia_lote_salvo",
        modulo: "Escalas",
        detalhes: {
          company_id: companyId,
          gestor_id: gestorSelecionadoEfetivo,
          gestor_raw_id: gestorSelecionadoRaw,
          papel,
          escala_mes_id: escalaId,
          usuario_id: multiUsuarioId,
          datas: multiDatas,
          total: multiDatas.length,
          tipo: multiTipo,
          horario_informado: Boolean(multiInicio || multiFim),
          hora_inicio: multiInicio || null,
          hora_fim: multiFim || null,
        },
      });
      limparSelecaoMultipla(true);
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar escala.");
    } finally {
      setMultiAplicando(false);
    }
  }

  async function removerCelula() {
    if (!podeEditar) {
      setModalErro("Voce nao tem permissao para remover registros da escala.");
      return;
    }
    if (!celulaSelecionada?.registro?.id) return;
    try {
      setSalvandoCelula(true);
      const { error } = await supabase
        .from("escala_dia")
        .delete()
        .eq("id", celulaSelecionada.registro.id);
      if (error) throw error;
      setEscalaDias((prev) =>
        prev.filter((r) => r.id !== celulaSelecionada.registro?.id)
      );
      void registrarLog({
        acao: "escala_dia_removida",
        modulo: "Escalas",
        detalhes: {
          company_id: companyId,
          gestor_id: gestorSelecionadoEfetivo,
          gestor_raw_id: gestorSelecionadoRaw,
          papel,
          escala_dia_id: celulaSelecionada.registro.id,
          escala_mes_id: celulaSelecionada.registro.escala_mes_id,
          usuario_id: celulaSelecionada.usuario_id,
          data: celulaSelecionada.data,
          tipo_anterior: celulaSelecionada.registro.tipo,
          hora_inicio_anterior: celulaSelecionada.registro.hora_inicio,
          hora_fim_anterior: celulaSelecionada.registro.hora_fim,
          observacao_anterior: celulaSelecionada.registro.observacao,
        },
      });
      fecharCelula();
    } catch (e) {
      console.error(e);
      setErro("Erro ao remover escala.");
    } finally {
      setSalvandoCelula(false);
    }
  }

  async function adicionarFeriado(e: React.FormEvent) {
    e.preventDefault();
    if (!podeEditar) {
      setErro("Voce nao tem permissao para cadastrar feriados.");
      return;
    }
    if (!companyId || !novoFeriadoData || !novoFeriadoNome) return;
    try {
      setSalvandoFeriado(true);
      const { data, error } = await supabase
        .from("feriados")
        .insert({
          company_id: companyId,
          data: novoFeriadoData,
          nome: novoFeriadoNome.trim(),
          tipo: novoFeriadoTipo,
        })
        .select("id, data, nome, tipo")
        .single();
      if (error) throw error;
      setFeriadosCustom((prev) => [...prev, data as FeriadoCustom]);
      setNovoFeriadoData("");
      setNovoFeriadoNome("");
    } catch (e) {
      console.error(e);
      setErro("Erro ao cadastrar feriado.");
    } finally {
      setSalvandoFeriado(false);
    }
  }

  async function removerFeriado(id: string) {
    if (!podeEditar) {
      setErro("Voce nao tem permissao para remover feriados.");
      return;
    }
    try {
      const { error } = await supabase.from("feriados").delete().eq("id", id);
      if (error) throw error;
      setFeriadosCustom((prev) => prev.filter((f) => f.id !== id));
    } catch (e) {
      console.error(e);
      setErro("Erro ao remover feriado.");
    }
  }

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer) return <div>Voce nao possui acesso a este modulo.</div>;

  const precisaFiltroMaster =
    papel === "MASTER" && (!companyId || !gestorSelecionadoRaw);

  const carregandoContextoEscala =
    (papel === "GESTOR" || papel === "MASTER") &&
    Boolean(gestorSelecionadoRaw) &&
    !gestorSelecionadoEfetivo;

  const loadingEscala = loadingDados || carregandoContextoEscala;

  return (
    <div className="escala-page">
      {papel === "MASTER" && (
        <div className="card-base card-purple mb-3 list-toolbar-sticky">
          <div className="form-row mobile-stack" style={{ gap: 12 }}>
            <div className="form-group">
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
            </div>
            <div className="form-group">
              <label className="form-label">Equipe</label>
              <select
                className="form-select"
                value={masterScope.gestorSelecionado}
                onChange={(e) => masterScope.setGestorSelecionado(e.target.value)}
              >
                <option value="all">Selecione</option>
                {masterScope.gestoresDisponiveis.map((gestor) => (
                  <option key={gestor.id} value={gestor.id}>
                    {gestor.nome_completo}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Vendedor</label>
              <select
                className="form-select"
                value={masterScope.vendedorSelecionado}
                onChange={(e) => masterScope.setVendedorSelecionado(e.target.value)}
              >
                <option value="all">Todos</option>
                {masterScope.vendedoresDisponiveis.map((vendedor) => (
                  <option key={vendedor.id} value={vendedor.id}>
                    {vendedor.nome_completo || "Vendedor"}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="card-base card-teal mb-3 escala-toolbar">
        <div>
          <div className="escala-title">
            Escala {companyNome ? `- ${companyNome}` : ""}
          </div>
          <div className="escala-subtitle">
            Mês: <strong>{formatMonthYearBR(periodo)}</strong>
          </div>
        </div>
        <div className="escala-toolbar-actions">
          <div className="form-group">
            <label className="form-label sr-only">Mês</label>
            <select className="form-select" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              {periodoOptions.map((value) => (
                <option key={value} value={value}>
                  {formatMonthYearBR(value)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {precisaFiltroMaster && (
        <div className="card-base card-config mb-3">
          Selecione uma filial e uma equipe para editar a escala.
        </div>
      )}

      {erro && (
        <div className="card-base card-config mb-3">
          <strong>{erro}</strong>
        </div>
      )}

      {feriadosErro && (
        <div className="card-base card-config mb-3">
          <strong>{feriadosErro}</strong>
        </div>
      )}

      {loadingEscala && (
        <div className="card-base card-config mb-3">Carregando escala...</div>
      )}

      {!loadingEscala && !precisaFiltroMaster && (
        <div className="card-base card-config mb-3">
          <div className="form-row mobile-stack" style={{ gap: 12, alignItems: "flex-end" }}>
            <div className="form-group" style={{ minWidth: 220 }}>
              <label className="form-label">Selecao multipla</label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={multiAtivo}
                  onChange={(e) => setMultiAtivo(e.target.checked)}
                  disabled={!podeEditar}
                />
                Ativar para selecionar varias datas
              </label>
              <small style={{ color: "#64748b" }}>
                Clique nas datas do mesmo vendedor e aplique um tipo.
              </small>
              {!podeEditar && (
                <div className="text-xs" style={{ color: "#64748b", marginTop: 4 }}>
                  Somente leitura
                </div>
              )}
            </div>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select
                className="form-select"
                value={multiTipo}
                onChange={(e) => setMultiTipo(e.target.value)}
                disabled={!podeEditar || !multiAtivo}
              >
                {TIPO_OPCOES.map((opt) => (
                  <option key={opt.value || "none"} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Inicio</label>
              <input
                type="time"
                className="form-input"
                value={multiInicio}
                onChange={(e) => setMultiInicio(e.target.value)}
                disabled={!podeEditar || !multiAtivo}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Fim</label>
              <input
                type="time"
                className="form-input"
                value={multiFim}
                onChange={(e) => setMultiFim(e.target.value)}
                disabled={!podeEditar || !multiAtivo}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Selecionados</label>
              <div style={{ fontWeight: 600 }}>
                {multiUsuarioId ? equipeNomes[multiUsuarioId] || "Vendedor" : "Nenhum"} ·{" "}
                {multiDatas.length} dia(s)
              </div>
            </div>
            <div className="form-group escala-multi-actions">
              <button
                type="button"
                className="btn btn-light"
                onClick={() => limparSelecaoMultipla(true)}
                disabled={!podeEditar || !multiAtivo || multiDatas.length === 0}
              >
                Limpar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={aplicarSelecaoMultipla}
                disabled={!podeEditar || !multiAtivo || multiDatas.length === 0 || multiAplicando}
              >
                {multiAplicando ? "Aplicando..." : "Aplicar"}
              </button>
            </div>
          </div>
          {multiErro && (
            <div style={{ marginTop: 8, color: "#b91c1c", fontWeight: 600 }}>
              {multiErro}
            </div>
          )}
        </div>
      )}

      {!loadingEscala && !precisaFiltroMaster && (
        <div className="card-base escala-grid-card mb-3">
          <div className="table-container">
            <table className="escala-table">
              <thead>
                <tr>
                  <th className="escala-col-nome">Usuário</th>
                  {diasMes.map((dia) => (
                    <th
                      key={`d-${dia.dia}`}
                      className={dia.semana === 0 || dia.semana === 6 ? "escala-col-weekend" : ""}
                    >
                      {dia.dia}
                    </th>
                  ))}
                  <th className="escala-col-total">Dias Trabalhados</th>
                  <th className="escala-col-total">Folgas/Ferias</th>
                </tr>
                <tr>
                  <th className="escala-col-nome"> </th>
                  {diasMes.map((dia) => (
                    <th
                      key={`w-${dia.dia}`}
                      className={dia.semana === 0 || dia.semana === 6 ? "escala-col-weekend" : ""}
                    >
                      {DIAS_SEMANA[dia.semana]}
                    </th>
                  ))}
                  <th className="escala-col-total"> </th>
                  <th className="escala-col-total"> </th>
                </tr>
              </thead>
              <tbody>
                {equipeIds.length === 0 && (
                  <tr>
                    <td colSpan={diasMes.length + 3}>Nenhum usuário disponível.</td>
                  </tr>
                )}
                {equipeIds.map((uid) => {
                  const resumo = resumoPorUsuario[uid] || { trabalhados: 0, folgas: 0 };
                  return (
                    <tr key={uid}>
                      <td className="escala-col-nome">{equipeNomes[uid] || "Usuário"}</td>
                      {diasMes.map((dia) => {
                        const registro = registrosMap[`${uid}_${dia.data}`];
                        const tipo = registro?.tipo || "";
                        const feriadoDia = feriadosPorData[dia.data] || [];
                        const isWeekend = dia.semana === 0 || dia.semana === 6;
                        const weekendTrabalho = isWeekend && tipo === "TRABALHO";
                        const autoFeriado = !tipo && feriadoDia.length > 0;
                        const labelFeriado = feriadoDia.map((f) => f.nome).join(" / ");
                        const selecionado =
                          multiAtivo && multiUsuarioId === uid && multiDatas.includes(dia.data);
                        const tooltip = [
                          registro?.tipo ? `Tipo: ${formatTipoLabel(registro.tipo)}` : null,
                          registro?.hora_inicio && registro?.hora_fim
                            ? `Horario: ${formatTimeRange(registro.hora_inicio, registro.hora_fim)}`
                            : null,
                          registro?.observacao ? `Obs: ${registro.observacao}` : null,
                          autoFeriado ? `Feriado: ${labelFeriado}` : null,
                        ]
                          .filter(Boolean)
                          .join(" | ");
                        return (
                          <td
                            key={`${uid}-${dia.data}`}
                            className={[
                              "escala-cell",
                              tipo ? `escala-cell-${tipo.toLowerCase()}` : "",
                              autoFeriado ? "escala-cell-feriado-auto" : "",
                              isWeekend ? "escala-cell-weekend" : "",
                              weekendTrabalho ? "escala-cell-weekend-trabalho" : "",
                              selecionado ? "escala-cell-selected" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            title={tooltip}
                            onClick={() => {
                              if (multiAtivo) {
                                alternarSelecaoMultipla(uid, dia.data);
                                return;
                              }
                              if (!podeEditar) return;
                              abrirCelula(uid, dia.data);
                            }}
                          >
                            <div className="escala-cell-content">
                              {tipo === "FERIAS" ? (
                                <span
                                  className="escala-cell-icon escala-icon-ferias"
                                  aria-label="Férias"
                                />
                              ) : tipo === "FOLGA" ? (
                                <span className="escala-cell-folga-label">Folga</span>
                              ) : (
                                <span className="escala-cell-code">
                                  {TIPO_CODIGO[tipo] || (autoFeriado ? "H" : "")}
                                </span>
                              )}
                              {registro?.hora_inicio && registro?.hora_fim && (
                                <span className="escala-cell-time">
                                  {formatTimeRange(registro.hora_inicio, registro.hora_fim)}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="escala-col-total">{resumo.trabalhados}</td>
                      <td className="escala-col-total">{resumo.folgas}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="escala-legenda">
            <div className="escala-legenda-item escala-cell-trabalho">T - Trabalho</div>
            <div className="escala-legenda-item escala-cell-plantao">P - Plantão</div>
            <div className="escala-legenda-item escala-cell-folga">F - Folga</div>
            <div className="escala-legenda-item escala-cell-ferias">
              <span className="escala-legenda-icon escala-icon-ferias" aria-hidden="true" />
              - Férias
            </div>
            <div className="escala-legenda-item escala-cell-licenca">L - Licença</div>
            <div className="escala-legenda-item escala-cell-feriado">H - Feriado</div>
            <div className="escala-legenda-item escala-cell-pendencia">! - Pendência</div>
          </div>
          {resumoFeriadosLista.length > 0 && (
            <div className="escala-feriados-resumo">
              <strong className="escala-feriados-title">Feriados do Mês:</strong>
              <ul>
                {resumoFeriadosLista.map((item) => {
                  const isLocal = item.origens.some((o) => o !== "nacional");
                  return (
                    <li key={item.data} className={isLocal ? "feriado-local" : ""}>
                      {item.texto}{" "}
                      <span className="feriado-origem">
                        ({isLocal ? "local" : "nacional"})
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {!precisaFiltroMaster && (
        <div className="card-base card-blue">
          <div className="escala-feriados-header">Feriados locais</div>
          <form className="escala-feriados-form" onSubmit={adicionarFeriado}>
            <div className="form-group">
              <label className="form-label">Data</label>
              <input
                type="date"
                className="form-input"
                value={novoFeriadoData}
                onFocus={selectAllInputOnFocus}
                onChange={(e) => setNovoFeriadoData(e.target.value)}
                required
                disabled={!podeEditar}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Nome</label>
              <input
                type="text"
                className="form-input"
                value={novoFeriadoNome}
                onChange={(e) => setNovoFeriadoNome(e.target.value)}
                required
                placeholder="Ex: Aniversario da cidade"
                disabled={!podeEditar}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <select
                className="form-select"
                value={novoFeriadoTipo}
                onChange={(e) => setNovoFeriadoTipo(e.target.value)}
                disabled={!podeEditar}
              >
                <option value="MUNICIPAL">Municipal</option>
                <option value="ESTADUAL">Estadual</option>
                <option value="NACIONAL">Nacional (extra)</option>
              </select>
            </div>
            <div className="form-group">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={salvandoFeriado || !podeEditar}
              >
                {salvandoFeriado ? "Salvando..." : "Adicionar"}
              </button>
            </div>
          </form>

          {feriadosCustom.length === 0 && (
            <div className="escala-feriados-empty">
              Nenhum feriado local cadastrado para este mes.
            </div>
          )}
          {feriadosCustom.length > 0 && (
            <div className="table-container">
              <table className="table-default table-mobile-cards">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Nome</th>
                    <th>Tipo</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {feriadosCustom.map((f) => (
                    <tr key={f.id}>
                      <td data-label="Data">{formatarDataParaExibicao(f.data)}</td>
                      <td data-label="Nome">{f.nome}</td>
                      <td data-label="Tipo">{f.tipo}</td>
                      <td data-label="Acoes">
                        <button
                          type="button"
                          className="btn btn-light"
                          onClick={() => removerFeriado(f.id)}
                          disabled={!podeEditar}
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {celulaSelecionada && (
        <div className="modal-backdrop">
          <div className="modal-panel escala-modal">
            <div className="modal-header">
              <div className="modal-title">Editar escala</div>
            </div>
            <div className="modal-body">
              <div className="escala-modal-title">
                {celulaSelecionada.nome} - {formatarDataParaExibicao(celulaSelecionada.data)}
              </div>
              <div className="form-row mobile-stack" style={{ marginTop: 12 }}>
                <div className="form-group">
                  <label className="form-label">Tipo</label>
                  <select
                    className="form-select"
                    value={formTipo}
                    onChange={(e) => setFormTipo(e.target.value)}
                    disabled={!podeEditar}
                  >
                    {TIPO_OPCOES.map((opt) => (
                      <option key={opt.value || "none"} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Inicio</label>
                  <input
                    type="time"
                    className="form-input"
                    value={formInicio}
                    onChange={(e) => setFormInicio(e.target.value)}
                    disabled={!podeEditar}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Fim</label>
                  <input
                    type="time"
                    className="form-input"
                    value={formFim}
                    onChange={(e) => setFormFim(e.target.value)}
                    disabled={!podeEditar}
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginTop: 12 }}>
                <label className="form-label">Observacao</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={formObs}
                  onChange={(e) => setFormObs(e.target.value)}
                  disabled={!podeEditar}
                />
              </div>
              {modalErro && (
                <div style={{ marginTop: 10, color: "#b91c1c", fontWeight: 600 }}>
                  {modalErro}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-light"
                onClick={removerCelula}
                disabled={salvandoCelula || !celulaSelecionada.registro || !podeEditar}
              >
                Remover
              </button>
              <button type="button" className="btn btn-light" onClick={fecharCelula}>
                Fechar
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={salvarCelula}
                disabled={salvandoCelula || !podeEditar}
              >
                {salvandoCelula ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
