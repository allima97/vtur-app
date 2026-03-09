import React, { useEffect, useMemo, useState } from "react";
import { matchesCpfSearch } from "../../lib/searchNormalization";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { useMasterScope } from "../../lib/useMasterScope";
import { construirLinkWhatsApp } from "../../lib/whatsapp";
import ConfirmDialog from "../ui/ConfirmDialog";
import AlertMessage from "../ui/AlertMessage";
import { ToastStack, useToastQueue } from "../ui/Toast";
import PaginationControls from "../ui/PaginationControls";

type Cliente = {
  id: string;
  nome: string;
  cpf: string;
  telefone: string | null;
  email: string | null;
  whatsapp?: string | null;
  company_id?: string | null;
  created_by?: string | null;
};

async function fetchClientesList(params: {
  page: number;
  pageSize: number;
  all?: boolean;
  busca?: string;
  empresaId?: string;
  vendedorIds?: string[];
  noCache?: boolean;
}) {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  if (params.all) qs.set("all", "1");
  if (params.busca) qs.set("busca", params.busca);
  if (params.empresaId) qs.set("empresa_id", params.empresaId);
  if (params.vendedorIds && params.vendedorIds.length > 0) {
    qs.set("vendedor_ids", params.vendedorIds.join(","));
  }
  if (params.noCache) qs.set("no_cache", "1");

  const resp = await fetch(`/api/v1/clientes/list?${qs.toString()}`);
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  const payload = await resp.json();
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    total: typeof payload?.total === "number" ? payload.total : 0,
  } as { items: Cliente[]; total: number };
}

async function fetchClienteHistorico(clienteId: string) {
  const qs = new URLSearchParams();
  qs.set("cliente_id", clienteId);
  const resp = await fetch(`/api/v1/clientes/historico?${qs.toString()}`);
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  return resp.json() as Promise<{
    vendas: {
      id: string;
      data_lancamento: string | null;
      data_embarque: string | null;
      destino_nome: string;
      destino_cidade_nome?: string;
      valor_total: number;
      valor_taxas: number;
    }[];
    orcamentos: {
      id: string;
      data_orcamento: string | null;
      status: string | null;
      valor: number | null;
      produto_nome?: string | null;
    }[];
  }>;
}

async function deleteCliente(clienteId: string) {
  const resp = await fetch(`/api/v1/clientes/delete?id=${encodeURIComponent(clienteId)}`,
    { method: "DELETE" }
  );
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  return resp.json();
}

export default function ClientesConsultaIsland() {
  const { can, loading: loadingPerms, ready, userType } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Clientes");
  const podeCriar = can("Clientes", "create");
  const isMaster = /MASTER/i.test(String(userType || ""));
  const masterScope = useMasterScope(Boolean(isMaster && ready));

  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [carregouTodos, setCarregouTodos] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalClientesDb, setTotalClientesDb] = useState(0);
  const [historicoCliente, setHistoricoCliente] = useState<Cliente | null>(null);
  const [clienteParaExcluir, setClienteParaExcluir] = useState<Cliente | null>(null);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [historicoVendas, setHistoricoVendas] = useState<
    {
      id: string;
      data_lancamento: string | null;
      data_embarque: string | null;
      destino_nome: string;
      destino_cidade_nome?: string;
      valor_total: number;
      valor_taxas: number;
    }[]
  >([]);
  const [historicoOrcamentos, setHistoricoOrcamentos] = useState<
    {
      id: string;
      data_orcamento: string | null;
      status: string | null;
      valor: number | null;
      produto_nome?: string | null;
    }[]
  >([]);

  const isTodosFiltro = (value?: string) =>
    !value || value === "todos" || value === "all";

  async function carregar(todos = false, pageOverride?: number) {
    if (!podeVer) return;
    try {
      setLoading(true);
      setErro(null);
      const paginaAtual = Math.max(1, pageOverride ?? page);
      const tamanhoPagina = Math.max(1, pageSize);

      const filtroVendedorAtivo =
        isMaster &&
        (!isTodosFiltro(masterScope.vendedorSelecionado) ||
          masterScope.gestorSelecionado !== "all");
      const vendorIds = filtroVendedorAtivo ? masterScope.vendedorIds : [];
      const empresaId =
        isMaster && masterScope.empresaSelecionada !== "all"
          ? masterScope.empresaSelecionada
          : "";

      const { items, total } = await fetchClientesList({
        page: paginaAtual,
        pageSize: tamanhoPagina,
        all: todos,
        busca: busca.trim() ? busca.trim() : undefined,
        empresaId: empresaId || undefined,
        vendedorIds: vendorIds && vendorIds.length > 0 ? vendorIds : undefined,
      });

      setClientes(items);
      setCarregouTodos(todos);
      setTotalClientesDb(total || items.length);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar clientes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!loadingPerm && podeVer && !carregouTodos && !busca.trim()) {
      carregar(false);
    }
  }, [
    loadingPerm,
    podeVer,
    page,
    pageSize,
    busca,
    carregouTodos,
    masterScope.empresaSelecionada,
    masterScope.vendedorSelecionado,
    masterScope.gestorSelecionado,
    masterScope.vendedorIds,
  ]);
  useEffect(() => {
    if (!loadingPerm && busca.trim() && !carregouTodos && podeVer) {
      setPage(1);
      carregar(true, 1);
    } else if (!loadingPerm && !busca.trim() && carregouTodos && podeVer) {
      setPage(1);
      carregar(false, 1);
    }
  }, [
    busca,
    carregouTodos,
    podeVer,
    loadingPerm,
    masterScope.empresaSelecionada,
    masterScope.vendedorSelecionado,
    masterScope.gestorSelecionado,
    masterScope.vendedorIds,
  ]);

  const filtrados = useMemo(() => {
    const q = (busca || "").toLowerCase().trim();
    if (!q) return clientes;
    return clientes.filter((c) =>
      (c.nome || "").toLowerCase().includes(q) ||
      matchesCpfSearch(c.cpf || "", busca) ||
      (c.email || "").toLowerCase().includes(q)
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

  const podeEditar = can("Clientes", "edit");
  const podeExcluir = false;

  async function excluirCliente(id: string) {
    if (!podeExcluir) {
      showToast("Você não tem permissão para excluir clientes.", "error");
      return;
    }
    try {
      await deleteCliente(id);
      setClientes((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      console.error(e);
      showToast("Erro ao excluir cliente.", "error");
    }
  }

  function solicitarExclusao(cliente: Cliente) {
    if (!podeExcluir) {
      showToast("Você não tem permissão para excluir clientes.", "error");
      return;
    }
    setClienteParaExcluir(cliente);
  }

  async function confirmarExclusaoCliente() {
    if (!clienteParaExcluir) return;
    await excluirCliente(clienteParaExcluir.id);
    setClienteParaExcluir(null);
  }

  function editarCliente(id: string) {
    if (!podeEditar) {
      showToast("Você não tem permissão para editar clientes.", "error");
      return;
    }
    window.location.href = `/clientes/cadastro?id=${id}`;
  }

  function abrirHistorico(id: string, nome?: string) {
    const cliente = clientes.find((c) => c.id === id);
    if (!cliente) return;
    setHistoricoCliente(cliente);
    setHistoricoVendas([]);
    setHistoricoOrcamentos([]);
    setLoadingHistorico(true);
    (async () => {
      try {
        const payload = await fetchClienteHistorico(id);
        setHistoricoVendas(payload.vendas || []);
        setHistoricoOrcamentos(payload.orcamentos || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingHistorico(false);
      }
    })();
  }

  function fecharHistorico() {
    setHistoricoCliente(null);
    setHistoricoVendas([]);
    setHistoricoOrcamentos([]);
    setLoadingHistorico(false);
  }

  if (loadingPerm) return <div className="clientes-page"><div className="card-base card-config">Carregando contexto...</div></div>;
  if (!podeVer) return <div className="clientes-page">Você não possui acesso ao módulo de Clientes.</div>;

  return (
    <>
    <div className={`clientes-page${podeCriar ? " has-mobile-actionbar" : ""}`}>
      <div className="card-base card-blue mb-3 list-toolbar-sticky">
        <div className="form-row" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div className="form-group flex-1 min-w-0">
            <label className="form-label">Buscar cliente</label>
            <input className="form-input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, CPF ou e-mail" />
          </div>
          {podeCriar && (
            <div className="hidden sm:flex sm:ml-auto">
              <div className="form-group">
                <label className="form-label" style={{ visibility: "hidden" }}>
                  Ações
                </label>
                <a href="/clientes/cadastro?novo=1" className="btn btn-primary">
                  Adicionar cliente
                </a>
              </div>
            </div>
          )}
        </div>
        {isMaster && (
          <div className="form-row mobile-stack" style={{ gap: 12, marginTop: 12 }}>
            <div className="form-group flex-1 min-w-[180px]">
              <label className="form-label">Filial</label>
              <select
                className="form-select"
                value={masterScope.empresaSelecionada}
                onChange={(e) => masterScope.setEmpresaSelecionada(e.target.value)}
              >
                <option value="all">Todas</option>
                {masterScope.empresasAprovadas.map((empresa) => (
                  <option key={empresa.id} value={empresa.id}>
                    {empresa.nome_fantasia}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group flex-1 min-w-[180px]">
              <label className="form-label">Equipe</label>
              <select
                className="form-select"
                value={masterScope.gestorSelecionado}
                onChange={(e) => masterScope.setGestorSelecionado(e.target.value)}
              >
                <option value="all">Todas</option>
                {masterScope.gestoresDisponiveis.map((gestor) => (
                  <option key={gestor.id} value={gestor.id}>
                    {gestor.nome_completo}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group flex-1 min-w-[180px]">
              <label className="form-label">Vendedor</label>
              <select
                className="form-select"
                value={masterScope.vendedorSelecionado}
                onChange={(e) => masterScope.setVendedorSelecionado(e.target.value)}
              >
                <option value="all">Todos</option>
                {masterScope.vendedoresDisponiveis.map((vendedor) => (
                  <option key={vendedor.id} value={vendedor.id}>
                    {vendedor.nome_completo}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {erro && (
        <div className="mb-3">
          <AlertMessage variant="error">{erro}</AlertMessage>
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

      <div className="table-container overflow-x-auto" style={{ maxHeight: "65vh", overflowY: "auto" }}>
        <table className="table-default table-header-blue clientes-table table-mobile-cards">
          <thead>
            <tr>
              <th>Nome</th>
              <th>CPF</th>
              <th>Telefone</th>
              <th>E-mail</th>
              <th className="th-actions" style={{ textAlign: "center" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4}>Carregando...</td></tr>
            )}
            {!loading && clientesExibidos.length === 0 && (
              <tr><td colSpan={4}>Nenhum cliente encontrado.</td></tr>
            )}
            {!loading && clientesExibidos.map((c) => (
              <tr key={c.id}>
                <td data-label="Nome">{c.nome}</td>
                <td data-label="CPF">{c.cpf}</td>
                <td data-label="Telefone">{c.telefone || "-"}</td>
                <td data-label="E-mail">{c.email || "-"}</td>
                <td className="th-actions" data-label="Ações">
                  <div className="action-buttons">
                    {(() => {
                      const whatsappLink = construirLinkWhatsApp(c.whatsapp || c.telefone || "");
                      if (whatsappLink) {
                        return (
                          <a className="btn-icon" href={whatsappLink} title="Abrir WhatsApp" target="_blank" rel="noreferrer">💬</a>
                        );
                      }
                      return null;
                    })()}

                    <button className="btn-icon" onClick={() => abrirHistorico(c.id, c.nome)} title="Histórico">🗂️</button>

                    {podeEditar && (
                      <button className="btn-icon" onClick={() => editarCliente(c.id)} title="Editar">✏️</button>
                    )}

                    {podeExcluir && (
                      <button className="btn-icon btn-danger" onClick={() => solicitarExclusao(c)} title="Excluir">🗑️</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {podeCriar && (
        <div className="mobile-actionbar sm:hidden">
          <a href="/clientes/cadastro?novo=1" className="btn btn-primary">
            Adicionar cliente
          </a>
        </div>
      )}
    </div>
    {historicoCliente && (
      <div className="modal-backdrop">
        <div className="modal-panel historico-viagens-modal" style={{ maxWidth: 1000, width: "95vw" }}>
          <div className="modal-header">
            <div className="historico-viagens-header">
              <div
                className="modal-title"
                style={{ color: "#1d4ed8", fontSize: "1.2rem", fontWeight: 800 }}
              >
                {historicoCliente.nome}
              </div>
              <div className="historico-viagens-subtitle">
                Histórico de Viagens e Orçamentos
              </div>
            </div>
            <button className="btn-ghost" onClick={fecharHistorico}>✕</button>
          </div>

          <div className="modal-body">
            {loadingHistorico && <p>Carregando histórico...</p>}

            {!loadingHistorico && (
              <>
                <div className="mb-2">
                  <div className="card-base mb-2 historico-viagens-section-title" style={{ padding: "12px 16px" }}>
                    <h4 style={{ margin: 0 }}>Vendas</h4>
                  </div>
                  <div className="table-container overflow-x-auto">
                    <table className="table-default table-header-blue table-mobile-cards min-w-[720px]">
                      <thead>
                        <tr>
                          <th>Data Lançamento</th>
                          <th>Destino</th>
                          <th>Embarque</th>
                          <th>Valor</th>
                          <th>Taxas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicoVendas.length === 0 && (
                          <tr>
                            <td colSpan={5}>Nenhuma venda encontrada.</td>
                          </tr>
                        )}
                        {historicoVendas.map((v) => (
                          <tr key={v.id}>
                            <td data-label="Data Lançamento">
                              {v.data_lancamento
                                ? new Date(v.data_lancamento).toLocaleDateString("pt-BR")
                                : "-"}
                            </td>
                            <td data-label="Destino">{v.destino_nome || "-"}</td>
                            <td data-label="Embarque">
                              {v.data_embarque
                                ? new Date(v.data_embarque).toLocaleDateString("pt-BR")
                                : "-"}
                            </td>
                            <td data-label="Valor">
                              {v.valor_total.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </td>
                            <td data-label="Taxas">
                              {v.valor_taxas.toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mb-2">
                  <div className="card-base mb-2 historico-viagens-section-title" style={{ padding: "12px 16px" }}>
                    <h4 style={{ margin: 0 }}>Orçamentos</h4>
                  </div>
                  <div className="table-container overflow-x-auto">
                    <table className="table-default table-header-blue table-mobile-cards min-w-[720px]">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Status</th>
                          <th>Produto</th>
                          <th>Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historicoOrcamentos.length === 0 && (
                          <tr>
                            <td colSpan={4}>Nenhum orçamento encontrado.</td>
                          </tr>
                        )}
                        {historicoOrcamentos.map((o) => (
                          <tr key={o.id}>
                            <td data-label="Data">
                              {o.data_orcamento
                                ? new Date(o.data_orcamento).toLocaleDateString("pt-BR")
                                : "-"}
                            </td>
                            <td data-label="Status">{o.status || "-"}</td>
                            <td data-label="Produto">{o.produto_nome || "-"}</td>
                            <td data-label="Valor">
                              {o.valor !== null && o.valor !== undefined
                                ? o.valor.toLocaleString("pt-BR", {
                                    style: "currency",
                                    currency: "BRL",
                                  })
                                : "-"}
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

          <div className="modal-footer mobile-stack-buttons">
            <button className="btn btn-primary" onClick={fecharHistorico}>
              Fechar
            </button>
          </div>
        </div>
      </div>
    )}
    <ConfirmDialog
      open={Boolean(clienteParaExcluir)}
      title="Excluir cliente"
      message={`Tem certeza que deseja excluir ${clienteParaExcluir?.nome || "este cliente"}?`}
      confirmLabel="Excluir"
      confirmVariant="danger"
      onCancel={() => setClienteParaExcluir(null)}
      onConfirm={confirmarExclusaoCliente}
    />
    <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </>
  );
}
