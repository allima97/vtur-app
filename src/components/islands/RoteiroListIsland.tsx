import { useEffect, useMemo, useState } from "react";
import { normalizeText } from "../../lib/normalizeText";
import { formatDateBR } from "../../lib/format";
import ConfirmDialog from "../ui/ConfirmDialog";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import TableActions from "../ui/TableActions";
import SearchInput from "../ui/SearchInput";
import AppButton from "../ui/primer/AppButton";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

type Roteiro = {
  id: string;
  nome: string;
  duracao?: number | null;
  inicio_cidade?: string | null;
  fim_cidade?: string | null;
  created_at: string;
  updated_at: string;
};

export default function RoteiroListIsland() {
  const [roteiros, setRoteiros] = useState<Roteiro[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [roteiroParaExcluir, setRoteiroParaExcluir] = useState<Roteiro | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRoteiros();
  }, []);

  async function fetchRoteiros() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/roteiros/list");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setRoteiros(data.roteiros || []);
    } catch (err: any) {
      setError(err.message || "Erro ao carregar roteiros.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/roteiros/delete?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setRoteiros((prev) => prev.filter((r) => r.id !== id));
      setRoteiroParaExcluir(null);
    } catch (err: any) {
      setError(err.message || "Erro ao excluir roteiro.");
    } finally {
      setDeleting(false);
    }
  }

  const filtered = useMemo(() => {
    const term = normalizeText(busca.trim());
    if (!term) return roteiros;
    return roteiros.filter((r) => normalizeText(r.nome).includes(term));
  }, [roteiros, busca]);

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap orcamentos-consulta-page">
        <AppToolbar
          className="mb-3"
          sticky
          tone="info"
          title="Roteiros personalizados"
          subtitle="Busque, edite e remova roteiros salvos."
          actions={(
            <div className="mobile-stack-buttons" style={{ justifyContent: "flex-end" }}>
              <AppButton as="a" href="/orcamentos/personalizados/novo" variant="primary">
                Novo Roteiro
              </AppButton>
              <AppButton as="a" href="/orcamentos/consulta" variant="secondary">
                Voltar
              </AppButton>
            </div>
          )}
        >
          <div
            className="form-row mobile-stack"
            style={{ gap: 12, gridTemplateColumns: "minmax(240px, 1fr) auto", alignItems: "flex-end" }}
          >
            <div style={{ flex: "1 1 320px" }}>
              <SearchInput
                label="Buscar"
                value={busca}
                onChange={setBusca}
                placeholder="Nome do roteiro..."
                wrapperClassName="m-0"
              />
            </div>
          </div>
        </AppToolbar>

        {error && (
          <AlertMessage variant="error" className="mb-3">
            <strong>{error}</strong>
          </AlertMessage>
        )}

        {!loading && filtered.length === 0 && (
          <EmptyState
            icon={<i className="pi pi-list" aria-hidden="true" />}
            title="Nenhum roteiro encontrado"
            description="Ajuste a busca ou crie um novo roteiro."
            action={
              <AppButton as="a" href="/orcamentos/personalizados/novo" variant="primary">
                Criar primeiro roteiro
              </AppButton>
            }
          />
        )}

        {(loading || filtered.length > 0) && (
          <div className="table-container overflow-x-auto" style={{ maxHeight: "65vh", overflowY: "auto" }}>
            <table className="table-default table-header-blue table-mobile-cards min-w-[900px]">
              <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <tr>
                  <th>Nome</th>
                  <th>Duração</th>
                  <th>Origem → Destino</th>
                  <th>Criado em</th>
                  <th className="th-actions" style={{ width: 150, textAlign: "center" }}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={5}>Carregando...</td>
                  </tr>
                )}

                {!loading &&
                  filtered.map((r) => (
                    <tr key={r.id}>
                      <td data-label="Nome">
                        <strong>{r.nome}</strong>
                      </td>
                      <td data-label="Duração">{r.duracao ? `${r.duracao} dias` : "-"}</td>
                      <td data-label="Origem → Destino">
                        {r.inicio_cidade && r.fim_cidade
                          ? `${r.inicio_cidade} → ${r.fim_cidade}`
                          : r.inicio_cidade || r.fim_cidade || "-"}
                      </td>
                      <td data-label="Criado em">{r.created_at ? formatDateBR(r.created_at) : "-"}</td>
                      <td className="th-actions" data-label="Ações">
                        <TableActions
                          className="orcamentos-actions"
                          actions={[
                            {
                              key: "view",
                              label: "Visualizar",
                              icon: <i className="pi pi-eye" aria-hidden="true" />,
                              onClick: () => {
                                window.location.href = `/orcamentos/personalizados/visualizar/${r.id}`;
                              },
                            },
                            {
                              key: "edit",
                              label: "Editar",
                              icon: <i className="pi pi-pencil" aria-hidden="true" />,
                              onClick: () => {
                                window.location.href = `/orcamentos/personalizados/${r.id}`;
                              },
                            },
                            {
                              key: "delete",
                              label: "Excluir",
                              icon: <i className="pi pi-trash" aria-hidden="true" />,
                              variant: "danger",
                              onClick: () => setRoteiroParaExcluir(r),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}

        <ConfirmDialog
          open={Boolean(roteiroParaExcluir)}
          title="Excluir roteiro?"
          message={
            <>
              Esta ação não pode ser desfeita. O roteiro{" "}
              {roteiroParaExcluir?.nome ? <strong>{roteiroParaExcluir.nome}</strong> : null}
              {" "}e todos os seus dados serão removidos.
            </>
          }
          confirmLabel={deleting ? "Excluindo..." : "Excluir"}
          cancelLabel="Cancelar"
          confirmVariant="danger"
          confirmDisabled={deleting}
          onCancel={() => {
            if (deleting) return;
            setRoteiroParaExcluir(null);
          }}
          onConfirm={() => {
            if (!roteiroParaExcluir) return;
            void handleDelete(roteiroParaExcluir.id);
          }}
        />
      </div>
    </AppPrimerProvider>
  );
}
