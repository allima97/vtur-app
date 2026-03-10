import React, { useEffect, useMemo, useState } from "react";
import { Dialog } from "@primer/react";
import { matchesCpfSearch } from "../../lib/searchNormalization";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { useMasterScope } from "../../lib/useMasterScope";
import { construirLinkWhatsApp } from "../../lib/whatsapp";
import ConfirmDialog from "../ui/ConfirmDialog";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import TableActions from "../ui/TableActions";
import { ToastStack, useToastQueue } from "../ui/Toast";
import PaginationControls from "../ui/PaginationControls";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

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

  if (loadingPerm) {
    return (
      <AppPrimerProvider>
        <div className="page-content-wrap clientes-page">
          <AppCard tone="config">Carregando contexto...</AppCard>
        </div>
      </AppPrimerProvider>
    );
  }

  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <div className="page-content-wrap clientes-page">
          <AppCard tone="config">Voce nao possui acesso ao modulo de Clientes.</AppCard>
        </div>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className={`page-content-wrap clientes-page${podeCriar ? " has-mobile-actionbar" : ""}`}>
        <AppToolbar
          title="Clientes"
          subtitle="Consulte contatos, aplique filtros por filial/equipe e acompanhe o historico comercial de cada cliente."
          tone="info"
          sticky
          actions={
            podeCriar ? (
              <AppButton as="a" href="/clientes/cadastro?novo=1" variant="primary">
                Adicionar cliente
              </AppButton>
            ) : null
          }
        >
          <div className="vtur-form-grid vtur-form-grid-4">
            <AppField
              label="Buscar cliente"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, CPF ou e-mail"
              caption="Digite para consultar toda a base de clientes."
              wrapperClassName={isMaster ? "min-w-[220px]" : "md:col-span-2"}
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
                      label: vendedor.nome_completo,
                    })),
                  ]}
                />
              </>
            )}
          </div>
        </AppToolbar>

        {erro && <AlertMessage variant="error" className="mb-3">{erro}</AlertMessage>}

        {!carregouTodos && !erro && (
          <AppCard tone="config" className="mb-3">
            Use a paginacao para navegar. Digite na busca para filtrar toda a base.
          </AppCard>
        )}

        <AppCard
          title="Base de clientes"
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
              description="Ajuste a busca ou os filtros para localizar clientes dentro do escopo atual."
              action={
                podeCriar ? (
                  <AppButton as="a" href="/clientes/cadastro?novo=1" variant="primary">
                    Cadastrar cliente
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
                  <th>CPF</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  <th className="th-actions" style={{ textAlign: "center" }}>Acoes</th>
                </tr>
              }
              loading={loading}
              loadingMessage="Carregando clientes..."
              empty={false}
              colSpan={5}
              className="clientes-table table-mobile-cards"
            >
              {clientesExibidos.map((c) => {
                const whatsappLink = construirLinkWhatsApp(c.whatsapp || c.telefone || "");
                const actions = [
                  {
                    key: "historico",
                    label: "Historico",
                    onClick: () => abrirHistorico(c.id, c.nome),
                    variant: "ghost" as const,
                  },
                ];
                if (podeEditar) {
                  actions.push({
                    key: "editar",
                    label: "Editar",
                    onClick: () => editarCliente(c.id),
                    variant: "ghost" as const,
                  });
                }
                if (podeExcluir) {
                  actions.push({
                    key: "excluir",
                    label: "Excluir",
                    onClick: () => solicitarExclusao(c),
                    variant: "danger" as const,
                  });
                }

                return (
                  <tr key={c.id}>
                    <td data-label="Nome">{c.nome}</td>
                    <td data-label="CPF">{c.cpf}</td>
                    <td data-label="Telefone">{c.telefone || "-"}</td>
                    <td data-label="E-mail">{c.email || "-"}</td>
                    <td className="th-actions" data-label="Acoes">
                      <div className="action-buttons vtur-table-actions">
                        {whatsappLink ? (
                          <AppButton
                            as="a"
                            href={whatsappLink}
                            target="_blank"
                            rel="noreferrer"
                            type="button"
                            variant="ghost"
                            className="vtur-table-action"
                            title="Abrir WhatsApp"
                            aria-label="Abrir WhatsApp"
                          >
                            WhatsApp
                          </AppButton>
                        ) : null}
                        <TableActions actions={actions} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </DataTable>
          )}
        </AppCard>

        {podeCriar && (
          <div className="mobile-actionbar sm:hidden">
            <AppButton as="a" href="/clientes/cadastro?novo=1" variant="primary" block>
              Adicionar cliente
            </AppButton>
          </div>
        )}
      </div>

      {historicoCliente && (
        <Dialog
          title={historicoCliente.nome}
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
            <AppCard
              title="Resumo do cliente"
              subtitle="Contato principal e visao consolidada do historico comercial."
              tone="info"
            >
              <div className="vtur-form-grid vtur-form-grid-4">
                <AppField label="Nome" value={historicoCliente.nome} readOnly />
                <AppField label="CPF" value={historicoCliente.cpf || "-"} readOnly />
                <AppField label="Telefone" value={historicoCliente.telefone || "-"} readOnly />
                <AppField label="E-mail" value={historicoCliente.email || "-"} readOnly />
              </div>
            </AppCard>

            {loadingHistorico ? (
              <AppCard tone="info">Carregando historico...</AppCard>
            ) : (
              <>
                <AppCard title="Vendas" subtitle="Vendas vinculadas a este cliente.">
                  <DataTable
                    headers={
                      <tr>
                        <th>Data Lancamento</th>
                        <th>Destino</th>
                        <th>Embarque</th>
                        <th>Valor</th>
                        <th>Taxas</th>
                      </tr>
                    }
                    empty={historicoVendas.length === 0}
                    emptyMessage="Nenhuma venda encontrada."
                    colSpan={5}
                    className="table-mobile-cards"
                  >
                    {historicoVendas.map((v) => (
                      <tr key={v.id}>
                        <td data-label="Data Lancamento">
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
                  </DataTable>
                </AppCard>

                <AppCard title="Orcamentos" subtitle="Orcamentos criados para este cliente.">
                  <DataTable
                    headers={
                      <tr>
                        <th>Data</th>
                        <th>Status</th>
                        <th>Produto</th>
                        <th>Valor</th>
                      </tr>
                    }
                    empty={historicoOrcamentos.length === 0}
                    emptyMessage="Nenhum orcamento encontrado."
                    colSpan={4}
                    className="table-mobile-cards"
                  >
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
                  </DataTable>
                </AppCard>
              </>
            )}
          </div>
        </Dialog>
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
    </AppPrimerProvider>
  );
}
