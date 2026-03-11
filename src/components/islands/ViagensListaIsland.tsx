import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { formatarDataParaExibicao } from "../../lib/formatDate";
import { formatCurrencyBRL } from "../../lib/format";
import { construirLinkWhatsApp } from "../../lib/whatsapp";
import { normalizeText } from "../../lib/normalizeText";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";
import AlertMessage from "../ui/AlertMessage";
import ConfirmDialog from "../ui/ConfirmDialog";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import TableActions from "../ui/TableActions";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppToolbar from "../ui/primer/AppToolbar";

type Viagem = {
  id: string;
  venda_id?: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  status: string | null;
  origem: string | null;
  destino: string | null;
  responsavel_user_id: string | null;
  cliente_id: string | null;
  clientes?: { nome: string | null; whatsapp?: string | null } | null;
  responsavel?: { nome_completo?: string | null } | null;
  recibo?: {
    id: string;
    valor_total: number | null;
    valor_taxas: number | null;
    data_inicio: string | null;
    data_fim: string | null;
    numero_recibo?: string | null;
    produto_id: string | null;
    tipo_produtos?: { id: string; nome?: string | null; tipo?: string | null } | null;
  } | null;
};
type ViagemExibicao = Viagem & { recibos: NonNullable<Viagem["recibo"]>[] };

const STATUS_OPCOES = [
  { value: "", label: "Todas" },
  { value: "planejada", label: "Planejada" },
  { value: "confirmada", label: "Confirmada" },
  { value: "em_viagem", label: "Em viagem" },
  { value: "concluida", label: "Concluída" },
  { value: "cancelada", label: "Cancelada" },
];

const STATUS_LABELS: Record<string, string> = {
  planejada: "Planejada",
  confirmada: "Confirmada",
  em_viagem: "Em viagem",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

function obterStatusPorPeriodo(inicio?: string | null, fim?: string | null): string | null {
  if (!inicio) return null;
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataInicio = new Date(inicio);
  const dataFim = fim ? new Date(fim) : null;

  if (dataFim && dataFim < hoje) return "concluida";
  if (dataInicio > hoje) return "confirmada";
  if (dataFim && hoje > dataFim) return "concluida";
  return "em_viagem";
}

function formatarMoeda(valor?: number | null) {
  if (valor == null || Number.isNaN(valor)) return "-";
  return formatCurrencyBRL(valor);
}

function obterMinData(datas: Array<string | null | undefined>) {
  let minTs: number | null = null;
  let minStr: string | null = null;
  datas.forEach((data) => {
    if (!data) return;
    const ts = Date.parse(data);
    if (Number.isNaN(ts)) return;
    if (minTs === null || ts < minTs) {
      minTs = ts;
      minStr = data;
    }
  });
  return minStr;
}

function obterMaxData(datas: Array<string | null | undefined>) {
  let maxTs: number | null = null;
  let maxStr: string | null = null;
  datas.forEach((data) => {
    if (!data) return;
    const ts = Date.parse(data);
    if (Number.isNaN(ts)) return;
    if (maxTs === null || ts > maxTs) {
      maxTs = ts;
      maxStr = data;
    }
  });
  return maxStr;
}

const initialCadastroForm = {
  origem: "",
  destino: "",
  data_inicio: "",
  data_fim: "",
  status: "planejada",
  cliente_id: "",
};

export default function ViagensListaIsland() {
  const { can, loading: loadingPerms, ready, userType, isSystemAdmin } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Operacao");
  const podeCriar = can("Operacao", "create");
  const podeEditar = can("Operacao", "edit");
  const podeExcluir = can("Operacao", "delete");
  const tipoNorm = String(userType || "").toUpperCase();
  const isAdminRole = isSystemAdmin || tipoNorm.includes("ADMIN");
  const isGestorRole = tipoNorm.includes("GESTOR");
  const isMasterRole = tipoNorm.includes("MASTER");

  const [statusFiltro, setStatusFiltro] = useState<string>("");
  const [inicio, setInicio] = useState<string>("");
  const [fim, setFim] = useState<string>("");
  const [busca, setBusca] = useState<string>("");
  const [viagens, setViagens] = useState<Viagem[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [savingViagem, setSavingViagem] = useState(false);
  const [cadastroForm, setCadastroForm] = useState(() => ({ ...initialCadastroForm }));
  type CidadeSugestao = {
    nome: string;
    subdivisao_nome?: string | null;
    pais_nome?: string | null;
  };
  const [cidades, setCidades] = useState<CidadeSugestao[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [usoIndividual, setUsoIndividual] = useState<boolean>(false);
  const deveRestringirResponsavel = usoIndividual || (!isAdminRole && !isGestorRole && !isMasterRole);
  const [clientes, setClientes] = useState<{ id: string; nome: string; cpf?: string | null }[]>([]);
  const [clientesErro, setClientesErro] = useState<string | null>(null);
  const [deletandoViagemId, setDeletandoViagemId] = useState<string | null>(null);
  const [viagemParaExcluir, setViagemParaExcluir] = useState<ViagemExibicao | null>(null);
  const [buscandoCidades, setBuscandoCidades] = useState(false);
  const [erroCidades, setErroCidades] = useState<string | null>(null);
  const cidadesAbort = useRef<AbortController | null>(null);
  const cidadesTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formatCidadeLabel = (cidade: CidadeSugestao) => {
    const partes = [cidade.nome];
    if (cidade.subdivisao_nome) partes.push(cidade.subdivisao_nome);
    if (cidade.pais_nome) partes.push(cidade.pais_nome);
    return partes.join(" • ");
  };

  async function carregarClientes() {
    try {
      setClientesErro(null);
      const response = await fetch("/api/v1/viagens/clientes");
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao carregar clientes.");
      }
      const data = (await response.json()) as { id: string; nome: string; cpf?: string | null }[];
      setClientes(data || []);
    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
      setClientesErro("Não foi possível carregar os clientes.");
    }
  }

  useEffect(() => {
    if (!loadingPerm && podeVer) {
      buscar();
    }
  }, [loadingPerm, podeVer, statusFiltro, inicio, fim]);

  useEffect(() => {
    if (!loadingPerm && podeVer) {
      carregarClientes();
    }
  }, [loadingPerm, podeVer]);

  useEffect(() => {
    carregarSugestoes("");
    return () => {
      if (cidadesAbort.current) {
        cidadesAbort.current.abort();
      }
      if (cidadesTimeout.current) {
        clearTimeout(cidadesTimeout.current);
      }
    };
  }, []);

  async function carregarSugestoes(term: string) {
    if (cidadesAbort.current) {
      cidadesAbort.current.abort();
    }
    const controller = new AbortController();
    cidadesAbort.current = controller;
    try {
      setBuscandoCidades(true);
      setErroCidades(null);
      const search = term.trim();
      const limite = search.length === 0 ? 200 : 50;
      const query = new URLSearchParams();
      if (search) query.set("q", search);
      query.set("limite", String(limite));
      const response = await fetch(`/api/v1/viagens/cidades-busca?${query.toString()}`,
        { signal: controller.signal }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao carregar cidades.");
      }
      const cidadesData = (await response.json()) as CidadeSugestao[];

      if (controller.signal.aborted) return;

      const unique = new Map<string, CidadeSugestao>();
      cidadesData.forEach((cidade) => {
        if (!cidade?.nome) return;
        const key = `${cidade.nome}|${cidade.pais_nome || ""}|${cidade.subdivisao_nome || ""}`;
        if (!unique.has(key)) unique.set(key, cidade);
      });
      setCidades(Array.from(unique.values()));
    } catch (e) {
      if (!controller.signal.aborted) {
        console.error("Erro ao buscar cidades:", e);
        setErroCidades("Não foi possível carregar as cidades.");
      }
    } finally {
      if (!controller.signal.aborted) {
        setBuscandoCidades(false);
      }
    }
  }

  function agendarBuscaCidades(term: string) {
    if (cidadesTimeout.current) {
      clearTimeout(cidadesTimeout.current);
    }
    cidadesTimeout.current = setTimeout(() => {
      carregarSugestoes(term);
    }, 250);
  }

  function resetCadastroForm() {
    setCadastroForm({ ...initialCadastroForm });
    setFormError(null);
  }

  function abrirFormularioViagem() {
    resetCadastroForm();
    setShowForm(true);
  }

  function fecharFormularioViagem() {
    resetCadastroForm();
    setShowForm(false);
  }

  async function buscar() {
    try {
      setLoading(true);
      setErro(null);

      const params = new URLSearchParams();
      if (statusFiltro) params.set("status", statusFiltro);
      if (inicio) params.set("inicio", inicio);
      if (fim) params.set("fim", fim);

      const response = await fetch(`/api/v1/viagens/list?${params.toString()}`);
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao carregar viagens.");
      }
      const payload = (await response.json()) as {
        items: Viagem[];
        context?: {
          userId?: string | null;
          companyId?: string | null;
          usoIndividual?: boolean;
        };
      };
      setViagens((payload.items || []) as Viagem[]);
      if (payload.context) {
        setUserId(payload.context.userId || null);
        setUsoIndividual(Boolean(payload.context.usoIndividual));
      }
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar viagens.");
    } finally {
      setLoading(false);
    }
  }

  async function criarViagem() {
    if (!podeCriar) return;
    if (!cadastroForm.cliente_id) {
      setFormError("Selecione o cliente responsável.");
      return;
    }
    if (!cadastroForm.origem || !cadastroForm.destino || !cadastroForm.data_inicio) {
      setFormError("Origem, destino e data de início são obrigatórios.");
      return;
    }

    try {
      setSavingViagem(true);
      setFormError(null);

      const origemLabel = cadastroForm.origem.trim();
      const destinoLabel = cadastroForm.destino.trim();

      const payload = {
        cliente_id: cadastroForm.cliente_id,
        origem: origemLabel,
        destino: destinoLabel,
        data_inicio: cadastroForm.data_inicio,
        data_fim: cadastroForm.data_fim || null,
        status: cadastroForm.status,
      };
      const response = await fetch("/api/v1/viagens/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao criar viagem.");
      }

      resetCadastroForm();
      setShowForm(false);
      buscar();
    } catch (e: unknown) {
      console.error(e);
      const errorMessage =
        e && typeof e === "object" && e !== null && "message" in e && typeof (e as { message?: string }).message === "string"
          ? (e as { message?: string }).message
          : null;
      setFormError(errorMessage || "Erro ao criar viagem.");
    } finally {
      setSavingViagem(false);
    }
  }

  async function excluirViagem(v: ViagemExibicao) {
    if (!podeExcluir) return;
    if (deveRestringirResponsavel && userId && v.responsavel_user_id !== userId) {
      setErro("Você não tem permissão para excluir esta viagem.");
      return;
    }
    try {
      setDeletandoViagemId(v.id);
      setErro(null);
      setSucesso(null);
      const response = await fetch("/api/v1/viagens/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: v.id, venda_id: v.venda_id || null }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Erro ao excluir viagem.");
      }
      setSucesso("Viagem excluída.");
      await buscar();
    } catch (err: unknown) {
      console.error(err);
      const message =
        err && typeof err === "object" && "message" in err && typeof err.message === "string"
          ? err.message
          : "Erro ao excluir viagem.";
      setErro(message);
    } finally {
      setDeletandoViagemId(null);
    }
  }

  function solicitarExclusaoViagem(viagem: ViagemExibicao) {
    if (!podeExcluir) return;
    setViagemParaExcluir(viagem);
  }

  async function confirmarExclusaoViagem() {
    if (!viagemParaExcluir) return;
    await excluirViagem(viagemParaExcluir);
    setViagemParaExcluir(null);
  }

  function obterStatusExibicao(viagem: Viagem) {
    const periodoStatus = obterStatusPorPeriodo(
      viagem.data_inicio,
      viagem.data_fim,
    );
    if (periodoStatus) {
      return STATUS_LABELS[periodoStatus] || periodoStatus;
    }
    if (viagem.status) {
      return STATUS_LABELS[viagem.status] || viagem.status;
    }
    return "-";
  }

  const viagensAgrupadas = useMemo<ViagemExibicao[]>(() => {
    const grupos = new Map<string, { base: Viagem; recibos: NonNullable<Viagem["recibo"]>[] }>();

    viagens.forEach((viagem) => {
      const chave = viagem.venda_id || viagem.id;
      const recibosAtual = viagem.recibo ? [viagem.recibo] : [];
      const existente = grupos.get(chave);
      if (!existente) {
        const dataInicio = obterMinData([viagem.data_inicio, viagem.recibo?.data_inicio]);
        const dataFim = obterMaxData([viagem.data_fim, viagem.recibo?.data_fim]);
        grupos.set(chave, {
          base: {
            ...viagem,
            data_inicio: dataInicio || viagem.data_inicio,
            data_fim: dataFim || viagem.data_fim,
          },
          recibos: [...recibosAtual],
        });
        return;
      }

      existente.recibos.push(...recibosAtual);
      const datasInicio = [
        existente.base.data_inicio,
        viagem.data_inicio,
        viagem.recibo?.data_inicio,
      ];
      const datasFim = [
        existente.base.data_fim,
        viagem.data_fim,
        viagem.recibo?.data_fim,
      ];
      existente.base.data_inicio = obterMinData(datasInicio) || existente.base.data_inicio;
      existente.base.data_fim = obterMaxData(datasFim) || existente.base.data_fim;
    });

    return Array.from(grupos.values()).map(({ base, recibos }) => ({ ...base, recibos }));
  }, [viagens]);

  const mensagemExclusaoViagem = viagemParaExcluir
    ? (viagemParaExcluir.recibos || []).length > 1
      ? "Tem certeza que deseja excluir esta viagem e seus itens vinculados?"
      : "Tem certeza que deseja excluir esta viagem?"
    : "";

  const proximasViagens = useMemo(() => {
    return [...viagensAgrupadas].sort((a, b) => {
      const da = a.data_inicio || "";
      const db = b.data_inicio || "";
      if (da === db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? -1 : 1;
    });
  }, [viagensAgrupadas]);
  const viagensFiltradas = useMemo(() => {
    const termo = normalizeText(busca.trim());
    if (!termo) return proximasViagens;
    return proximasViagens.filter((viagem) => {
      const clienteNome = viagem.clientes?.nome || "";
      const produtos = (viagem.recibos || [])
        .map((recibo) =>
          [
            recibo.tipo_produtos?.nome,
            recibo.tipo_produtos?.tipo,
            recibo.produto_id,
          ]
            .filter(Boolean)
            .join(" ")
        )
        .join(" ");
      const haystack = normalizeText([clienteNome, produtos].filter(Boolean).join(" "));
      return haystack.includes(termo);
    });
  }, [proximasViagens, busca]);
  const viagensExibidas = useMemo(() => {
    const mostrarTodos = Boolean(busca.trim() || statusFiltro || inicio || fim);
    return mostrarTodos ? viagensFiltradas : viagensFiltradas.slice(0, 5);
  }, [viagensFiltradas, busca, statusFiltro, inicio, fim]);
  const compactDateFieldStyle = { flex: "0 0 140px", minWidth: 125 };
  const totalColunasTabela = 7;

  if (loadingPerm) {
    return <LoadingUsuarioContext />;
  }

  if (!podeVer) {
    return (
      <AppCard tone="config">
        Você não possui acesso ao módulo de Operação/Viagens.
      </AppCard>
    );
  }

  return (
    <div
      className={`page-content-wrap viagens-page${podeCriar && !showForm ? " has-mobile-actionbar" : ""}`}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {showForm && (
          <AppCard tone="info" className="form-card viagens-form" title="Nova viagem">
            <datalist id="cidades-list">
              {cidades.map((cidade) => (
                <option
                  key={`${cidade.nome}-${cidade.subdivisao_nome || ""}-${cidade.pais_nome || ""}`}
                  value={cidade.nome}
                  label={formatCidadeLabel(cidade)}
                />
              ))}
            </datalist>
            {buscandoCidades && <AlertMessage variant="info">Buscando cidades...</AlertMessage>}
            {erroCidades && <AlertMessage variant="error">{erroCidades}</AlertMessage>}
            <AppField
              as="select"
              wrapperClassName="form-group"
              label="Cliente"
              value={cadastroForm.cliente_id}
              onChange={(e) =>
                setCadastroForm((prev) => ({ ...prev, cliente_id: e.target.value }))
              }
              options={[
                { value: "", label: "Selecione um cliente" },
                ...clientes.map((cliente) => ({
                  value: cliente.id,
                  label: `${cliente.nome}${cliente.cpf ? ` (${cliente.cpf})` : ""}`,
                })),
              ]}
            />
            {clientesErro && <AlertMessage variant="error">{clientesErro}</AlertMessage>}
            <div className="form-row mobile-stack">
              <AppField
                wrapperClassName="form-group"
                label="Origem"
                list="cidades-list"
                value={cadastroForm.origem}
                onChange={(e) => {
                  const value = e.target.value;
                  setCadastroForm((prev) => ({ ...prev, origem: value }));
                  agendarBuscaCidades(value);
                }}
                placeholder="Cidade de origem"
              />
              <AppField
                wrapperClassName="form-group"
                label="Destino"
                list="cidades-list"
                value={cadastroForm.destino}
                onChange={(e) => {
                  const value = e.target.value;
                  setCadastroForm((prev) => ({ ...prev, destino: value }));
                  agendarBuscaCidades(value);
                }}
                placeholder="Cidade de destino"
              />
              <AppField
                as="input"
                type="date"
                wrapperClassName="form-group"
                label="Data Início"
                value={cadastroForm.data_inicio}
                onFocus={selectAllInputOnFocus}
                onChange={(e) =>
                  setCadastroForm((prev) => {
                    const nextInicio = e.target.value;
                    const nextFim =
                      prev.data_fim && nextInicio && prev.data_fim < nextInicio
                        ? nextInicio
                        : prev.data_fim;
                    return { ...prev, data_inicio: nextInicio, data_fim: nextFim };
                  })
                }
              />
              <AppField
                as="input"
                type="date"
                wrapperClassName="form-group"
                label="Data Final"
                value={cadastroForm.data_fim}
                min={cadastroForm.data_inicio || undefined}
                onFocus={selectAllInputOnFocus}
                onChange={(e) =>
                  setCadastroForm((prev) => {
                    const nextFim = e.target.value;
                    const boundedFim =
                      prev.data_inicio && nextFim && nextFim < prev.data_inicio
                        ? prev.data_inicio
                        : nextFim;
                    return { ...prev, data_fim: boundedFim };
                  })
                }
              />
              <AppField
                as="select"
                wrapperClassName="form-group"
                label="Status"
                value={cadastroForm.status}
                onChange={(e) => setCadastroForm((prev) => ({ ...prev, status: e.target.value }))}
                options={[
                  { value: "planejada", label: "Planejada" },
                  { value: "confirmada", label: "Confirmada" },
                  { value: "em_viagem", label: "Em viagem" },
                  { value: "concluida", label: "Concluida" },
                  { value: "cancelada", label: "Cancelada" },
                ]}
              />
            </div>
            <div className="mobile-stack-buttons" style={{ marginTop: 12 }}>
              <AppButton
                type="button"
                variant="primary"
                onClick={criarViagem}
                disabled={savingViagem}
              >
                {savingViagem ? "Salvando..." : "Salvar viagem"}
              </AppButton>
              <AppButton
                type="button"
                variant="secondary"
                onClick={fecharFormularioViagem}
                disabled={savingViagem}
              >
                Cancelar
              </AppButton>
            </div>
            {formError && <AlertMessage variant="error">{formError}</AlertMessage>}
          </AppCard>
        )}

        {!showForm && (
          <AppToolbar tone="info" sticky className="list-toolbar-sticky" title="Filtros">
            <div className="flex flex-col gap-2 sm:hidden">
              <AppField
                wrapperClassName="form-group"
                label="Buscar cliente"
                placeholder="Cliente ou produto..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <AppButton type="button" variant="secondary" onClick={() => setShowFilters(true)}>
                Filtros
              </AppButton>
            </div>
            <div className="hidden sm:block">
              <div
                className="form-row mobile-stack"
                style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}
              >
                <div style={{ flex: "1 1 220px", minWidth: 200 }}>
                  <AppField
                    wrapperClassName="form-group"
                    label="Buscar cliente"
                    placeholder="Cliente ou produto..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
                <div style={{ flex: "1 1 180px" }}>
                  <AppField
                    as="select"
                    wrapperClassName="form-group"
                    label="Status"
                    value={statusFiltro}
                    onChange={(e) => setStatusFiltro(e.target.value)}
                    options={STATUS_OPCOES.map((op) => ({ value: op.value, label: op.label }))}
                  />
                </div>
                <div style={compactDateFieldStyle}>
                  <AppField
                    as="input"
                    type="date"
                    wrapperClassName="form-group"
                    label="Data Início"
                    value={inicio}
                    onFocus={selectAllInputOnFocus}
                    onChange={(e) => {
                      const nextInicio = e.target.value;
                      setInicio(nextInicio);
                      if (fim && nextInicio && fim < nextInicio) {
                        setFim(nextInicio);
                      }
                    }}
                  />
                </div>
                <div style={compactDateFieldStyle}>
                  <AppField
                    as="input"
                    type="date"
                    wrapperClassName="form-group"
                    label="Final"
                    value={fim}
                    min={inicio || undefined}
                    onFocus={selectAllInputOnFocus}
                    onChange={(e) => {
                      const nextFim = e.target.value;
                      const boundedFim = inicio && nextFim && nextFim < inicio ? inicio : nextFim;
                      setFim(boundedFim);
                    }}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ visibility: "hidden" }}>
                    Ações
                  </label>
                  <div className="viagens-actions mobile-stack-buttons">
                    <AppButton type="button" variant="secondary" onClick={buscar} disabled={loading}>
                      {loading ? "Atualizando..." : "Atualizar"}
                    </AppButton>
                    {podeCriar && (
                      <AppButton
                        type="button"
                        variant="primary"
                        onClick={abrirFormularioViagem}
                        disabled={showForm}
                      >
                        Nova viagem
                      </AppButton>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </AppToolbar>
        )}

        {!showForm && showFilters && (
          <div className="mobile-drawer-backdrop" onClick={() => setShowFilters(false)}>
            <div
              className="mobile-drawer-panel"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <strong>Filtros</strong>
                <AppButton type="button" variant="ghost" onClick={() => setShowFilters(false)}>
                  <i className="pi pi-times" aria-hidden="true" />
                </AppButton>
              </div>
              <AppField
                as="select"
                wrapperClassName="form-group"
                label="Status"
                value={statusFiltro}
                onChange={(e) => setStatusFiltro(e.target.value)}
                options={STATUS_OPCOES.map((op) => ({ value: op.value, label: op.label }))}
              />
              <AppField
                as="input"
                type="date"
                wrapperClassName="form-group"
                label="Data Início"
                value={inicio}
                onFocus={selectAllInputOnFocus}
                onChange={(e) => {
                  const nextInicio = e.target.value;
                  setInicio(nextInicio);
                  if (fim && nextInicio && fim < nextInicio) {
                    setFim(nextInicio);
                  }
                }}
              />
              <AppField
                as="input"
                type="date"
                wrapperClassName="form-group"
                label="Final"
                value={fim}
                min={inicio || undefined}
                onFocus={selectAllInputOnFocus}
                onChange={(e) => {
                  const nextFim = e.target.value;
                  const boundedFim = inicio && nextFim && nextFim < inicio ? inicio : nextFim;
                  setFim(boundedFim);
                }}
              />
              <AppButton
                type="button"
                variant="primary"
                block
                onClick={() => {
                  buscar();
                  setShowFilters(false);
                }}
              >
                Aplicar filtros
              </AppButton>
            </div>
          </div>
        )}

        {!showForm && erro && <AlertMessage variant="error">{erro}</AlertMessage>}
        {!showForm && sucesso && <AlertMessage variant="success">{sucesso}</AlertMessage>}

        {!showForm && (
          <AppCard tone="info" title="Lista de viagens">
            <DataTable
              className="table-header-teal table-mobile-cards min-w-[760px]"
              containerStyle={{ maxHeight: "65vh", overflowY: "auto" }}
              headers={
                <tr>
                  <th>Cliente</th>
                  <th>Data Início</th>
                  <th>Data Final</th>
                  <th>Status</th>
                  <th>Produto</th>
                  <th>Valor</th>
                  <th className="th-actions">Ações</th>
                </tr>
              }
              loading={loading}
              loadingMessage="Carregando viagens..."
              empty={!loading && viagensExibidas.length === 0}
              emptyMessage={
                <EmptyState
                  title="Nenhuma viagem encontrada"
                  description="Ajuste os filtros ou cadastre uma nova viagem."
                />
              }
              colSpan={totalColunasTabela}
            >
              {viagensExibidas.map((v) => {
                const statusLabel = obterStatusExibicao(v);
                const recibos = v.recibos || [];
                const produtoLabel =
                  recibos.length > 1
                    ? `Multiplos (${recibos.length})`
                    : recibos[0]?.tipo_produtos?.nome ||
                      recibos[0]?.tipo_produtos?.tipo ||
                      recibos[0]?.produto_id ||
                      "-";
                const valorTotal = recibos.reduce((total, r) => total + (r.valor_total || 0), 0);
                const valorLabel = recibos.length > 0 ? formatarMoeda(valorTotal) : "-";
                const whatsappLink = construirLinkWhatsApp(v.clientes?.whatsapp || null);

                return (
                  <tr key={v.id}>
                    <td data-label="Cliente">{v.clientes?.nome || "-"}</td>
                    <td data-label="Data Início">{formatarDataParaExibicao(v.data_inicio)}</td>
                    <td data-label="Data Final">{formatarDataParaExibicao(v.data_fim)}</td>
                    <td data-label="Status">{statusLabel}</td>
                    <td data-label="Produto">{produtoLabel}</td>
                    <td data-label="Valor">{valorLabel}</td>
                    <td className="th-actions" data-label="Ações">
                      <TableActions
                        className="viagens-action-buttons"
                        actions={[
                          {
                            key: "view",
                            label: "Ver viagem",
                            icon: <i className="pi pi-eye" aria-hidden="true" />,
                            onClick: () => {
                              window.location.href = `/operacao/viagens/${v.id}`;
                            },
                          },
                          ...(whatsappLink
                            ? [
                                {
                                  key: "whatsapp",
                                  label: "Enviar WhatsApp",
                                  icon: <i className="pi pi-comments" aria-hidden="true" />,
                                  onClick: () => window.open(whatsappLink, "_blank", "noreferrer"),
                                },
                              ]
                            : []),
                          ...(podeEditar
                            ? [
                                {
                                  key: "edit",
                                  label: "Editar viagem",
                                  icon: <i className="pi pi-pencil" aria-hidden="true" />,
                                  onClick: () => {
                                    window.location.href = `/operacao/viagens/${v.id}?modo=editar`;
                                  },
                                },
                              ]
                            : []),
                          ...(podeExcluir
                            ? [
                                {
                                  key: "delete",
                                  label: "Excluir viagem",
                                  icon:
                                    deletandoViagemId === v.id
                                      ? "..."
                                      : <i className="pi pi-trash" aria-hidden="true" />,
                                  variant: "danger",
                                  disabled: deletandoViagemId === v.id,
                                  onClick: () => solicitarExclusaoViagem(v),
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
        )}

        {!showForm && podeCriar && (
          <div className="mobile-actionbar sm:hidden">
            <AppButton type="button" variant="primary" onClick={abrirFormularioViagem}>
              Nova viagem
            </AppButton>
          </div>
        )}
        <ConfirmDialog
          open={Boolean(viagemParaExcluir)}
          title="Excluir viagem"
          message={mensagemExclusaoViagem}
          confirmLabel={deletandoViagemId ? "Excluindo..." : "Excluir"}
          confirmVariant="danger"
          confirmDisabled={Boolean(deletandoViagemId)}
          onCancel={() => setViagemParaExcluir(null)}
          onConfirm={confirmarExclusaoViagem}
        />
      </div>
    </div>
  );
}
