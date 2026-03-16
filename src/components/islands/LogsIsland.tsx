import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import AlertMessage from "../ui/AlertMessage";
import DataTable from "../ui/DataTable";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { formatDateTimeBR } from "../../lib/format";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";

type LogEntry = {
  id: string;
  user_id: string;
  acao: string;
  modulo: string | null;
  detalhes: any;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  users?: { nome_completo: string | null } | null;
};

export default function LogsIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("AdminDashboard");

  const [isAdmin, setIsAdmin] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Filtros
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [filtroModulo, setFiltroModulo] = useState("");
  const [filtroAcao, setFiltroAcao] = useState("");
  const [busca, setBusca] = useState("");

  // Modal
  const [logSelecionado, setLogSelecionado] = useState<LogEntry | null>(null);

  // ---------------------------------------------------------------
  // VALIDAR SE É ADMIN
  // ---------------------------------------------------------------
  useEffect(() => {
    async function validar() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;

      const { data: u } = await supabase
        .from("users")
        .select("id, user_types(name)")
        .eq("id", auth.user.id)
        .maybeSingle();

      const tipo = u?.user_types?.name?.toUpperCase() || "";
      setIsAdmin(tipo.includes("ADMIN"));
    }

    validar();
  }, []);

  // ---------------------------------------------------------------
  // CARREGAR LOGS
  // ---------------------------------------------------------------
  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setErro(null);

        const { data: logsData, error: logsErr } = await supabase
          .from("logs")
          .select(
            `
            *,
            users:users (nome_completo)
          `
          )
          .order("created_at", { ascending: false });

        if (logsErr) throw logsErr;

        setLogs(logsData || []);

        const { data: uData } = await supabase
          .from("users")
          .select("id, nome_completo")
          .order("nome_completo");

        setUsuarios(uData || []);
      } catch (e: any) {
        console.error(e);
        setErro("Erro ao carregar logs.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  // ---------------------------------------------------------------
  // FILTRAGEM
  // ---------------------------------------------------------------
  const logsFiltrados = useMemo(() => {
    let result = logs;

    if (filtroUsuario) {
      result = result.filter((l) => l.user_id === filtroUsuario);
    }

    if (filtroModulo) {
      result = result.filter((l) => (l.modulo || "") === filtroModulo);
    }

    if (filtroAcao) {
      result = result.filter((l) => l.acao === filtroAcao);
    }

    if (busca.trim()) {
      const t = busca.toLowerCase();
      result = result.filter((l) => {
        const texto =
          JSON.stringify(l).toLowerCase() +
          (l.users?.nome_completo || "").toLowerCase();
        return texto.includes(t);
      });
    }

    return result;
  }, [logs, filtroUsuario, filtroModulo, filtroAcao, busca]);

  if (loadingPerm) return <LoadingUsuarioContext />;

  if (!podeVer || !isAdmin)
    return (
      <AppCard tone="config" className="logs-admin-page admin-page">
        Apenas administradores podem acessar os logs.
      </AppCard>
    );

  // ---------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------

  return (
    <div className="logs-admin-page admin-page">
      <AppCard
        tone="config"
        title="Logs de Auditoria"
        subtitle="Todas as acoes executadas no sistema."
      />
      {erro && <AlertMessage variant="error">{erro}</AlertMessage>}

      {/* FILTROS */}
      <AppCard tone="config" title="Filtros">

        <div className="form-row">
          <AppField
            as="select"
            label="Usuario"
            wrapperClassName="form-group"
            value={filtroUsuario}
            onChange={(e) => setFiltroUsuario(e.target.value)}
            options={[
              { value: "", label: "Todos" },
              ...usuarios.map((u) => ({ value: u.id, label: u.nome_completo })),
            ]}
          />

          <AppField
            as="select"
            label="Modulo"
            wrapperClassName="form-group"
            value={filtroModulo}
            onChange={(e) => setFiltroModulo(e.target.value)}
            options={[
              { value: "", label: "Todos" },
              { value: "permissoes", label: "Permissoes" },
              { value: "vendas", label: "Vendas" },
              { value: "clientes", label: "Clientes" },
              { value: "cadastros", label: "Cadastros" },
              { value: "login", label: "Login" },
            ]}
          />

          <AppField
            as="select"
            label="Acao"
            wrapperClassName="form-group"
            value={filtroAcao}
            onChange={(e) => setFiltroAcao(e.target.value)}
            options={[
              { value: "", label: "Todas" },
              ...Array.from(new Set(logs.map((l) => l.acao))).map((a) => ({ value: a, label: a })),
            ]}
          />
        </div>

        <div className="form-row mt-2">
          <AppField
            as="input"
            type="text"
            label="Busca livre"
            placeholder="Buscar em qualquer campo..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            wrapperClassName="form-group"
          />
        </div>
      </AppCard>

      {/* TABELA */}
      <AppCard tone="config" title={`Registros (${logsFiltrados.length})`}>
        <DataTable
          containerClassName="vtur-scroll-y-65"
          className="table-mobile-cards min-w-[820px]"
          headers={
            <tr>
              <th className="min-w-[150px]">Data</th>
              <th>Usuario</th>
              <th>Acao</th>
              <th>Modulo</th>
              <th>IP</th>
              <th className="th-actions">Ações</th>
            </tr>
          }
          colSpan={6}
          loading={loading}
          empty={logsFiltrados.length === 0}
          emptyMessage="Nenhum log encontrado."
        >
          {logsFiltrados.map((l) => (
            <tr key={l.id}>
              <td data-label="Data">{formatDateTimeBR(l.created_at)}</td>
              <td data-label="Usuario">{l.users?.nome_completo || "Desconhecido"}</td>
              <td data-label="Acao">{l.acao}</td>
              <td data-label="Modulo">{l.modulo || "-"}</td>
              <td data-label="IP">{l.ip || "-"}</td>
              <td className="th-actions" data-label="Ações">
                <div className="action-buttons">
                  <AppButton
                    type="button"
                    variant="secondary"
                    onClick={() => setLogSelecionado(l)}
                    title="Ver detalhes"
                    aria-label="Ver detalhes"
                  >
                    <i className="pi pi-eye" aria-hidden="true" />
                  </AppButton>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </AppCard>

      {/* MODAL DETALHES */}
      {logSelecionado && (
        <div className="fixed inset-0 bg-black/60 flex justify-center items-center z-[100]">
          <AppCard
            tone="config"
            className="w-[95%] max-w-[700px] max-h-[90vh] overflow-y-auto"
            title="Detalhes do log"
            actions={
              <AppButton
                type="button"
                variant="secondary"
                onClick={() => setLogSelecionado(null)}
              >
                Fechar
              </AppButton>
            }
          >
            <p>
              <strong>Usuário:</strong> {logSelecionado.users?.nome_completo}
            </p>
            <p>
              <strong>Ação:</strong> {logSelecionado.acao}
            </p>
            <p>
              <strong>Módulo:</strong> {logSelecionado.modulo}
            </p>
            <p>
              <strong>Data:</strong> {formatDateTimeBR(logSelecionado.created_at)}
            </p>
            <p>
              <strong>IP:</strong> {logSelecionado.ip || "-"}
            </p>
            <p className="mt-3">
              <strong>Detalhes:</strong>
            </p>
            <pre className="bg-slate-900 p-3 rounded text-xs whitespace-pre-wrap">
              {JSON.stringify(logSelecionado.detalhes, null, 2)}
            </pre>
          </AppCard>
        </div>
      )}
    </div>
  );
}
