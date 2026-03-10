import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { formatarDataParaExibicao } from "../../lib/formatDate";
import AlertMessage from "../ui/AlertMessage";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

type EscalaDia = {
  id: string;
  data: string;
  tipo: string;
  hora_inicio: string | null;
  hora_fim: string | null;
  observacao: string | null;
  usuario_id?: string;
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

const DIAS_SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];
const TIPOS_TRABALHO = new Set(["TRABALHO", "PLANTAO"]);
const TIPOS_FOLGA = new Set(["FOLGA", "FERIAS", "LICENCA"]);
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

function normalizeSortText(valor?: string | null) {
  return String(valor || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function renderTipoCell(tipo?: string | null) {
  if (tipo === "FERIAS") {
    return (
      <span
        className="escala-inline-icon escala-icon-ferias"
        aria-label="Férias"
        title="Férias"
      />
    );
  }
  if (tipo === "FOLGA") {
    return "Dia de Folga";
  }
  return formatTipoLabel(tipo) || "-";
}

function formatWeekdayLabel(dataIso: string) {
  const date = new Date(`${dataIso}T00:00:00`);
  const label = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date);
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "";
}

function formatarResumoFeriado(dataIso: string, nomes: string[]) {
  const date = new Date(`${dataIso}T00:00:00`);
  const diaMes = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
  })
    .format(date)
    .replace(".", "");
  const semana = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date);
  const semanaLabel = semana ? semana.charAt(0).toUpperCase() + semana.slice(1) : "";
  const nomesLabel = nomes.filter(Boolean).join(" / ");
  return `${diaMes} - ${semanaLabel}${nomesLabel ? ` de ${nomesLabel}` : ""}`;
}

function formatPeriodoLabel(valor: string) {
  const [ano, mes] = String(valor || "").split("-");
  if (!ano || !mes) return valor;
  const mesNumero = Number(mes);
  if (!Number.isFinite(mesNumero) || mesNumero < 1 || mesNumero > 12) return valor;
  const dataRef = new Date(Number(ano), mesNumero - 1, 1);
  const mesExtenso = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(dataRef);
  const mesLabel = mesExtenso ? mesExtenso.charAt(0).toUpperCase() + mesExtenso.slice(1) : mes;
  return `${mesLabel}/${ano}`;
}

export default function MinhaEscalaIsland() {
  const { loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;

  const [userId, setUserId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userNome, setUserNome] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"minha" | "equipe">("minha");
  const [periodo, setPeriodo] = useState(() => new Date().toISOString().slice(0, 7));
  const [escalaDias, setEscalaDias] = useState<EscalaDia[]>([]);
  const [escalaEquipeDias, setEscalaEquipeDias] = useState<EscalaDia[]>([]);
  const [equipeIds, setEquipeIds] = useState<string[]>([]);
  const [equipeNomes, setEquipeNomes] = useState<Record<string, string>>({});
  const [feriadosNacionais, setFeriadosNacionais] = useState<FeriadoNacional[]>([]);
  const [feriadosCustom, setFeriadosCustom] = useState<FeriadoCustom[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [erroEquipe, setErroEquipe] = useState<string | null>(null);
  const [loadingDados, setLoadingDados] = useState(false);
  const [loadingEquipe, setLoadingEquipe] = useState(false);
  const opcoesPeriodo = useMemo(() => {
    const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const anoSelecionadoAtual = Number(periodo.split("-")[0] || anoAtual);
    const anoInicio = Math.min(anoAtual - 5, anoSelecionadoAtual - 1);
    const anoFim = Math.max(anoAtual + 5, anoSelecionadoAtual + 1);
    const opcoes: string[] = [];

    for (let ano = anoFim; ano >= anoInicio; ano -= 1) {
      for (let mes = 12; mes >= 1; mes -= 1) {
        opcoes.push(`${ano}-${String(mes).padStart(2, "0")}`);
      }
    }

    return opcoes;
  }, [periodo]);

  const anoSelecionado = Number(periodo.split("-")[0] || "");
  const mesSelecionadoIndex = Number(periodo.split("-")[1] || "1") - 1;
  const diasNoMes =
    Number.isFinite(anoSelecionado) && mesSelecionadoIndex >= 0
      ? new Date(anoSelecionado, mesSelecionadoIndex + 1, 0).getDate()
      : 0;

  const periodoInicio = buildIsoDate(anoSelecionado, mesSelecionadoIndex, 1);
  const periodoFim = buildIsoDate(anoSelecionado, mesSelecionadoIndex, diasNoMes || 1);

  const diasMes = useMemo(() => {
    if (!Number.isFinite(anoSelecionado) || mesSelecionadoIndex < 0 || diasNoMes <= 0) return [];
    const dias: Array<{ dia: number; data: string; semana: number }> = [];
    for (let dia = 1; dia <= diasNoMes; dia += 1) {
      const data = buildIsoDate(anoSelecionado, mesSelecionadoIndex, dia);
      const semana = new Date(`${data}T00:00:00`).getDay();
      dias.push({ dia, data, semana });
    }
    return dias;
  }, [anoSelecionado, mesSelecionadoIndex, diasNoMes]);

  useEffect(() => {
    if (loadingPerm) return;
    async function loadUser() {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          setErro("Usuario nao autenticado.");
          return;
        }
        setUserId(auth.user.id);
        const { data: usuarioDb, error: usuarioErr } = await supabase
          .from("users")
          .select("id, nome_completo, company_id")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (usuarioErr) throw usuarioErr;
        setCompanyId(usuarioDb?.company_id || null);
        setUserNome(usuarioDb?.nome_completo || null);
      } catch (e) {
        console.error(e);
        setErro("Erro ao carregar usuario.");
      }
    }
    loadUser();
  }, [loadingPerm]);

  useEffect(() => {
    async function loadFeriadosNacionais() {
      if (!Number.isFinite(anoSelecionado)) return;
      try {
        const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${anoSelecionado}`);
        if (!resp.ok) throw new Error("Falha ao carregar feriados nacionais.");
        const data = (await resp.json()) as FeriadoNacional[];
        setFeriadosNacionais(data || []);
      } catch (e) {
        console.error(e);
      }
    }
    loadFeriadosNacionais();
  }, [anoSelecionado]);

  useEffect(() => {
    async function loadEscala() {
      if (!userId || !periodoInicio || !periodoFim) return;
      try {
        setLoadingDados(true);
        setErro(null);
        const { data: escalaData, error: escalaErr } = await supabase
          .from("escala_dia")
          .select("id, data, tipo, hora_inicio, hora_fim, observacao")
          .eq("usuario_id", userId)
          .gte("data", periodoInicio)
          .lte("data", periodoFim)
          .order("data", { ascending: true });
        if (escalaErr) throw escalaErr;
        setEscalaDias((escalaData || []) as EscalaDia[]);

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
      } catch (e) {
        console.error(e);
        setErro("Erro ao carregar escala.");
      } finally {
        setLoadingDados(false);
      }
    }
    loadEscala();
  }, [userId, companyId, periodoInicio, periodoFim]);

  useEffect(() => {
    if (activeTab !== "equipe") return;
    if (!companyId || !periodoInicio || !periodoFim) return;

    let mounted = true;

    async function loadEscalaEquipe() {
      try {
        setLoadingEquipe(true);
        setErroEquipe(null);

        const { data: equipeData, error: equipeErr } = await supabase
          .from("users")
          .select("id, nome_completo")
          .eq("company_id", companyId);
        if (equipeErr) throw equipeErr;

        const nomesMap: Record<string, string> = {};
        const ids = (equipeData || [])
          .map((row: any) => {
            const id = String(row?.id || "").trim();
            if (id) {
              nomesMap[id] = row?.nome_completo || "Usuario";
            }
            return id;
          })
          .filter(Boolean)
          .sort((a: string, b: string) =>
            normalizeSortText(nomesMap[a]).localeCompare(normalizeSortText(nomesMap[b]))
          );

        if (!mounted) return;
        setEquipeIds(ids);
        setEquipeNomes(nomesMap);

        const periodoDate = `${periodo}-01`;
        const { data: escalaMesData, error: escalaErr } = await supabase
          .from("escala_mes")
          .select("id")
          .eq("company_id", companyId)
          .eq("periodo", periodoDate);
        if (escalaErr) throw escalaErr;

        const escalaMesIds = (escalaMesData || [])
          .map((row: any) => String(row?.id || "").trim())
          .filter(Boolean);

        if (escalaMesIds.length === 0) {
          setEscalaEquipeDias([]);
          return;
        }

        const { data: diasData, error: diasErr } = await supabase
          .from("escala_dia")
          .select("id, escala_mes_id, usuario_id, data, tipo, hora_inicio, hora_fim, observacao")
          .in("escala_mes_id", escalaMesIds);
        if (diasErr) throw diasErr;

        if (!mounted) return;
        setEscalaEquipeDias((diasData || []) as EscalaDia[]);
      } catch (e) {
        console.error(e);
        if (mounted) setErroEquipe("Erro ao carregar escala da equipe.");
      } finally {
        if (mounted) setLoadingEquipe(false);
      }
    }

    loadEscalaEquipe();
    return () => {
      mounted = false;
    };
  }, [activeTab, companyId, periodo, periodoInicio, periodoFim]);

  const registrosMap = useMemo(() => {
    const map: Record<string, EscalaDia> = {};
    escalaDias.forEach((r) => {
      map[r.data] = r;
    });
    return map;
  }, [escalaDias]);

  const registrosEquipeMap = useMemo(() => {
    const map: Record<string, EscalaDia> = {};
    escalaEquipeDias.forEach((r) => {
      map[`${r.usuario_id}_${r.data}`] = r;
    });
    return map;
  }, [escalaEquipeDias]);

  const resumoEquipePorUsuario = useMemo(() => {
    const resumo: Record<string, { trabalhados: number; folgas: number }> = {};
    escalaEquipeDias.forEach((registro) => {
      const uid = registro.usuario_id;
      if (!uid) return;
      if (!resumo[uid]) resumo[uid] = { trabalhados: 0, folgas: 0 };
      const tipo = registro.tipo || "";
      if (TIPOS_TRABALHO.has(tipo)) resumo[uid].trabalhados += 1;
      if (TIPOS_FOLGA.has(tipo)) resumo[uid].folgas += 1;
    });
    return resumo;
  }, [escalaEquipeDias]);

  const feriadosPorData = useMemo(() => {
    const map: Record<string, { nome: string; origem: string }[]> = {};
    feriadosNacionais.forEach((f) => {
      if (!f?.date) return;
      if (!map[f.date]) map[f.date] = [];
      map[f.date].push({ nome: f.name, origem: "nacional" });
    });
    feriadosCustom.forEach((f) => {
      if (!f?.data) return;
      if (!map[f.data]) map[f.data] = [];
      map[f.data].push({ nome: f.nome, origem: "custom" });
    });
    return map;
  }, [feriadosNacionais, feriadosCustom]);

  const resumoFeriadosLista = useMemo(() => {
    const entries = Object.entries(feriadosPorData).filter(([data]) =>
      data.startsWith(periodo)
    );
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
  }, [feriadosPorData, periodo]);

  const semanas = useMemo(() => {
    if (!Number.isFinite(anoSelecionado) || mesSelecionadoIndex < 0) return [];
    const firstWeekDay = new Date(anoSelecionado, mesSelecionadoIndex, 1).getDay();
    const totalSlots = Math.ceil((firstWeekDay + diasNoMes) / 7) * 7;
    const cells = Array.from({ length: totalSlots }, (_, idx) => {
      const dayNum = idx - firstWeekDay + 1;
      if (dayNum <= 0 || dayNum > diasNoMes) return null;
      return dayNum;
    });
    const weeks: Array<Array<number | null>> = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  }, [anoSelecionado, mesSelecionadoIndex, diasNoMes]);

  if (loadingPerm) return <LoadingUsuarioContext />;

  return (
    <AppPrimerProvider>
    <div className="page-content-wrap minha-escala-page vtur-legacy-module">
      <AppToolbar
        title={`Minha escala${userNome ? ` - ${userNome}` : ""}`}
        subtitle={`Mês: ${formatPeriodoLabel(periodo)}`}
        tone="info"
        sticky
        actions={
          <div className="vtur-card-toolbar-actions">
            <AppButton type="button" variant={activeTab === "minha" ? "primary" : "default"} onClick={() => setActiveTab("minha")}>
              Minha escala
            </AppButton>
            <AppButton type="button" variant={activeTab === "equipe" ? "primary" : "default"} onClick={() => setActiveTab("equipe")}>
              Escala equipe
            </AppButton>
          </div>
        }
      >
        <div className="vtur-form-grid vtur-form-grid-2">
          <AppField
            as="select"
            label="Mês"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            options={opcoesPeriodo.map((opcao) => ({ label: formatPeriodoLabel(opcao), value: opcao }))}
          />
        </div>
      </AppToolbar>

      {activeTab === "minha" && erro && (
        <AlertMessage variant="error"><strong>{erro}</strong></AlertMessage>
      )}

      {activeTab === "minha" && loadingDados && (
        <AppCard tone="config">Carregando escala...</AppCard>
      )}

      {activeTab === "minha" && !loadingDados && (
        <div className="card-base mb-3">
          <div className="table-container">
            <table className="escala-calendario">
              <thead>
                <tr>
                  {DIAS_SEMANA.map((label, i) => (
                    <th key={`weekday-${i}`}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {semanas.map((week, idx) => (
                  <tr key={`week-${idx}`}>
                    {week.map((dayNum, cIdx) => {
                      if (!dayNum) return <td key={`empty-${idx}-${cIdx}`} />;
                      const data = buildIsoDate(anoSelecionado, mesSelecionadoIndex, dayNum);
                      const registro = registrosMap[data];
                      const tipo = registro?.tipo || "";
                      const isWeekend = cIdx === 0 || cIdx === 6;
                      const weekendTrabalho = isWeekend && tipo === "TRABALHO";
                      const feriadoDia = feriadosPorData[data] || [];
                      const autoFeriado = !tipo && feriadoDia.length > 0;
                      const labelFeriado = feriadoDia.map((f) => f.nome).join(" / ");
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
                          key={`day-${data}`}
                          className={[
                            "escala-cell",
                            tipo ? `escala-cell-${tipo.toLowerCase()}` : "",
                            autoFeriado ? "escala-cell-feriado-auto" : "",
                            isWeekend ? "escala-cell-weekend" : "",
                            weekendTrabalho ? "escala-cell-weekend-trabalho" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          title={tooltip}
                        >
                          <div className="escala-cell-content">
                            <span className="escala-cell-day">{dayNum}</span>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="escala-legenda">
            <div className="escala-legenda-item escala-cell-trabalho">T - Trabalho</div>
            <div className="escala-legenda-item escala-cell-plantao">P - Plantão</div>
            <div className="escala-legenda-item escala-cell-folga">
              <span className="escala-legenda-icon escala-icon-folga" aria-hidden="true" />
              - Folga
            </div>
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

      {activeTab === "minha" && !loadingDados && escalaDias.length > 0 && (
        <div className="card-base">
          <div className="escala-list-title">Detalhes do mes</div>
          <div className="table-container">
            <table className="table-default table-mobile-cards">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Dia da semana</th>
                  <th>Tipo</th>
                  <th>Horario</th>
                  <th>Obs</th>
                </tr>
              </thead>
              <tbody>
                {escalaDias.map((r) => (
                  <tr
                    key={r.id}
                    className={
                      [
                        r.tipo === "TRABALHO" &&
                          [0, 6].includes(new Date(`${r.data}T00:00:00`).getDay())
                          ? "escala-row-weekend-trabalho"
                          : "",
                        r.tipo === "FERIAS" ? "escala-row-ferias" : "",
                        r.tipo === "FOLGA" ? "escala-row-folga" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")
                    }
                  >
                    <td data-label="Data">{formatarDataParaExibicao(r.data)}</td>
                    <td data-label="Dia da semana">{formatWeekdayLabel(r.data)}</td>
                    <td data-label="Tipo">{renderTipoCell(r.tipo)}</td>
                    <td data-label="Horario">
                      {r.hora_inicio && r.hora_fim
                        ? formatTimeRange(r.hora_inicio, r.hora_fim)
                        : "-"}
                    </td>
                    <td data-label="Obs">{r.observacao || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "equipe" && erroEquipe && (
        <AlertMessage variant="error"><strong>{erroEquipe}</strong></AlertMessage>
      )}

      {activeTab === "equipe" && loadingEquipe && (
        <AppCard tone="config">Carregando escala da equipe...</AppCard>
      )}

      {activeTab === "equipe" && !loadingEquipe && (
        <div className="card-base mb-3">
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
                  const resumo = resumoEquipePorUsuario[uid] || { trabalhados: 0, folgas: 0 };
                  return (
                    <tr key={uid}>
                      <td className="escala-col-nome">{equipeNomes[uid] || "Usuário"}</td>
                      {diasMes.map((dia) => {
                        const registro = registrosEquipeMap[`${uid}_${dia.data}`];
                        const tipo = registro?.tipo || "";
                        const feriadoDia = feriadosPorData[dia.data] || [];
                        const isWeekend = dia.semana === 0 || dia.semana === 6;
                        const weekendTrabalho = isWeekend && tipo === "TRABALHO";
                        const autoFeriado = !tipo && feriadoDia.length > 0;
                        const labelFeriado = feriadoDia.map((f) => f.nome).join(" / ");
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
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            title={tooltip}
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
            <div className="escala-legenda-item escala-cell-folga">
              <span className="escala-legenda-icon escala-icon-folga" aria-hidden="true" />
              - Folga
            </div>
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
    </div>
    </AppPrimerProvider>
  );
}
