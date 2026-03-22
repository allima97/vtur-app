import React, { useEffect, useState } from "react";
import { isPersistentCacheEnabled } from "../../lib/cachePolicy";
import { buildQueryLiteKey, queryLite } from "../../lib/queryLite";
import {
  readPersistentCache,
  removePersistentCache,
  writePersistentCache,
} from "../../lib/offline/persistentCache";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import ConfirmDialog from "../ui/ConfirmDialog";
import { ToastStack, useToastQueue } from "../ui/Toast";
import { formatNumberBR } from "../../lib/format";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

type FormaPagamento = {
  id: string;
  company_id: string;
  nome: string;
  descricao: string | null;
  paga_comissao: boolean;
  permite_desconto: boolean;
  desconto_padrao_pct: number | null;
  ativo: boolean;
  created_at: string | null;
};

const FORMAS_PAGAMENTO_CACHE_SCOPE = "formas-pagamento";
const FORMAS_PAGAMENTO_CACHE_KEY = "list-v1";
const FORMAS_PAGAMENTO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const initialForm = {
  nome: "",
  descricao: "",
  paga_comissao: true,
  permite_desconto: false,
  desconto_padrao_pct: "",
  ativo: true,
};

export default function FormasPagamentoIsland() {
  const { can, loading: loadingPerms, ready, userId } = usePermissoesStore();
  const loadPerm = loadingPerms || !ready;
  const podeVer = can("Formas de Pagamento");
  const podeCriar = can("Formas de Pagamento", "create");
  const podeEditar = can("Formas de Pagamento", "edit");
  const podeExcluir = can("Formas de Pagamento", "delete");

  const [formas, setFormas] = useState<FormaPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(initialForm);
  const [salvando, setSalvando] = useState(false);
  const [excluindoId, setExcluindoId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FormaPagamento | null>(null);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  async function fetchFormas(noCache = false) {
    const canUsePersistentCache = isPersistentCacheEnabled();
    const cacheIdentity = userId || "anon";
    const cacheKey = `${FORMAS_PAGAMENTO_CACHE_KEY}:${cacheIdentity}`;

    if (canUsePersistentCache && !noCache) {
      const cached = await readPersistentCache<FormaPagamento[]>(
        FORMAS_PAGAMENTO_CACHE_SCOPE,
        cacheKey
      );
      if (Array.isArray(cached) && cached.length > 0) {
        return cached;
      }
    }

    if (canUsePersistentCache && noCache) {
      await removePersistentCache(FORMAS_PAGAMENTO_CACHE_SCOPE, cacheKey);
    }

    const queryKey = buildQueryLiteKey([
      "formasPagamentoList",
      noCache ? "no-cache" : "cache",
    ]);

    const items = await queryLite(
      queryKey,
      async () => {
        const params = new URLSearchParams();
        if (noCache) params.set("no_cache", "1");
        const resp = await fetch(`/api/v1/formas-pagamento/list?${params.toString()}`);
        if (!resp.ok) {
          throw new Error(await resp.text());
        }
        const json = (await resp.json()) as { items?: FormaPagamento[] };
        return Array.isArray(json.items) ? json.items : [];
      },
      { ttlMs: noCache ? 0 : 60_000 }
    );

    if (canUsePersistentCache) {
      await writePersistentCache(
        FORMAS_PAGAMENTO_CACHE_SCOPE,
        cacheKey,
        items,
        FORMAS_PAGAMENTO_CACHE_TTL_MS
      );
    }

    return items;
  }

  async function carregar(noCache = false) {
    if (!podeVer) return;
    setLoading(true);
    setErro(null);
    try {
      const items = await fetchFormas(noCache);
      setFormas(items as FormaPagamento[]);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar formas de pagamento.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (loadPerm) return;
    carregar();
  }, [loadPerm, podeVer, userId]);

  function resetForm() {
    setForm(initialForm);
    setEditId(null);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!podeCriar && !podeEditar) return;
    if (!form.nome.trim()) {
      setErro("Informe o nome da forma de pagamento.");
      return;
    }

    try {
      setSalvando(true);
      setErro(null);

      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || null,
        paga_comissao: Boolean(form.paga_comissao),
        permite_desconto: Boolean(form.permite_desconto),
        desconto_padrao_pct: form.desconto_padrao_pct
          ? Number(String(form.desconto_padrao_pct).replace(",", "."))
          : null,
        ativo: Boolean(form.ativo),
      } as any;

      if (!editId) {
        const resp = await fetch("/api/v1/formas-pagamento/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!resp.ok) throw new Error(await resp.text());
        showToast("Forma de pagamento criada.", "success");
      } else {
        const resp = await fetch("/api/v1/formas-pagamento/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, id: editId }),
        });
        if (!resp.ok) throw new Error(await resp.text());
        showToast("Forma de pagamento atualizada.", "success");
      }

      resetForm();
      await carregar(true);
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar forma de pagamento.");
      showToast("Erro ao salvar forma de pagamento.", "error");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    if (!podeExcluir) return;
    try {
      setExcluindoId(id);
      const params = new URLSearchParams({ id });
      const resp = await fetch(`/api/v1/formas-pagamento/delete?${params.toString()}`, {
        method: "DELETE",
      });
      if (!resp.ok) throw new Error(await resp.text());
      showToast("Forma de pagamento excluída.", "success");
      await carregar(true);
    } catch (e) {
      console.error(e);
      showToast("Erro ao excluir forma de pagamento.", "error");
    } finally {
      setExcluindoId(null);
    }
  }

  if (loadPerm) return <LoadingUsuarioContext />;

  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">
          <strong>Acesso negado ao módulo de Formas de Pagamento.</strong>
        </AppCard>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap">
        <AppCard
          title={editId ? "Editar forma de pagamento" : "Cadastro"}
          subtitle="Estruture comissão, desconto e disponibilidade da forma de pagamento com o padrão visual novo do VTUR."
          tone="config"
        >
        <form onSubmit={salvar}>
          <div className="vtur-form-grid vtur-form-grid-2">
            <AppField
              label="Nome *"
              value={form.nome}
              onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
              required
              validation={!form.nome.trim() && erro ? "Informe o nome da forma de pagamento." : undefined}
            />
            <AppField
              label="Descricao"
              value={form.descricao}
              onChange={(e) => setForm((prev) => ({ ...prev, descricao: e.target.value }))}
            />
          </div>
          <div className="vtur-form-grid vtur-form-grid-4">
            <AppField
              as="select"
              label="Paga comissao"
              value={form.paga_comissao ? "sim" : "nao"}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, paga_comissao: e.target.value === "sim" }))
              }
              options={[
                { value: "sim", label: "Sim" },
                { value: "nao", label: "Nao" },
              ]}
            />
            <AppField
              as="select"
              label="Permite desconto"
              value={form.permite_desconto ? "sim" : "nao"}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, permite_desconto: e.target.value === "sim" }))
              }
              options={[
                { value: "sim", label: "Sim" },
                { value: "nao", label: "Nao" },
              ]}
            />
            <AppField
              label="Desconto padrao (%)"
              inputMode="decimal"
              placeholder="0"
              value={form.desconto_padrao_pct}
              onChange={(e) => setForm((prev) => ({ ...prev, desconto_padrao_pct: e.target.value }))}
            />
            <AppField
              as="select"
              label="Ativo"
              value={form.ativo ? "sim" : "nao"}
              onChange={(e) => setForm((prev) => ({ ...prev, ativo: e.target.value === "sim" }))}
              options={[
                { value: "sim", label: "Sim" },
                { value: "nao", label: "Nao" },
              ]}
            />
          </div>
          {erro && <div className="vtur-inline-feedback">{erro}</div>}
          <div className="vtur-form-actions">
            <AppButton variant="primary" type="submit" disabled={salvando} loading={salvando}>
              {salvando ? "Salvando..." : editId ? "Atualizar" : "Salvar"}
            </AppButton>
            {editId && (
              <AppButton variant="secondary" type="button" onClick={resetForm}>
                Cancelar
              </AppButton>
            )}
          </div>
        </form>
        </AppCard>

        <AppCard
          title="Formas cadastradas"
          subtitle="Consulte, edite e revise rapidamente as configuracoes financeiras disponiveis para a franquia."
        >
        {loading ? (
          <p>Carregando...</p>
        ) : formas.length === 0 ? (
          <p>Nenhuma forma cadastrada.</p>
        ) : (
          <div className="table-container overflow-x-auto">
            <table className="table-default table-header-blue table-mobile-cards">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Comissão</th>
                  <th>Desconto</th>
                  <th>Ativo</th>
                  <th className="th-actions">Ações</th>
                </tr>
              </thead>
              <tbody>
                {formas.map((f) => (
                  <tr key={f.id}>
                    <td data-label="Nome">{f.nome}</td>
                    <td data-label="Comissão">{f.paga_comissao ? "Sim" : "Não"}</td>
                    <td data-label="Desconto">
                      {f.permite_desconto
                        ? f.desconto_padrao_pct
                          ? `${formatNumberBR(f.desconto_padrao_pct, 2)}%`
                          : "Sim"
                        : "Não"}
                    </td>
                    <td data-label="Ativo">{f.ativo ? "Sim" : "Não"}</td>
                    <td className="th-actions" data-label="Ações">
                      <div className="vtur-table-actions">
                        {(podeEditar || podeCriar) && (
                          <AppButton
                            type="button"
                            variant="ghost"
                            className="vtur-table-action"
                            title="Editar"
                            aria-label="Editar"
                            onClick={() => {
                              setEditId(f.id);
                              setForm({
                                nome: f.nome || "",
                                descricao: f.descricao || "",
                                paga_comissao: Boolean(f.paga_comissao),
                                permite_desconto: Boolean(f.permite_desconto),
                                desconto_padrao_pct: f.desconto_padrao_pct?.toString() || "",
                                ativo: Boolean(f.ativo),
                              });
                            }}
                          >
                            <i className="pi pi-pencil" aria-hidden="true" />
                          </AppButton>
                        )}
                        {podeExcluir && (
                          <AppButton
                            type="button"
                            variant="danger"
                            className="vtur-table-action"
                            disabled={excluindoId === f.id}
                            title={excluindoId === f.id ? "Excluindo" : "Excluir"}
                            aria-label={excluindoId === f.id ? "Excluindo" : "Excluir"}
                            onClick={() => setDeleteTarget(f)}
                          >
                            <i className={excluindoId === f.id ? "pi pi-spin pi-spinner" : "pi pi-trash"} aria-hidden="true" />
                          </AppButton>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </AppCard>
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Excluir forma de pagamento"
          message={
            deleteTarget
              ? `Voce esta prestes a excluir "${deleteTarget.nome}". Esta acao nao pode ser desfeita.`
              : undefined
          }
          confirmLabel={excluindoId === deleteTarget?.id ? "Excluindo..." : "Excluir"}
          cancelLabel="Cancelar"
          confirmVariant="danger"
          confirmDisabled={Boolean(excluindoId)}
          onCancel={() => {
            if (!excluindoId) setDeleteTarget(null);
          }}
          onConfirm={async () => {
            if (!deleteTarget) return;
            await excluir(deleteTarget.id);
            setDeleteTarget(null);
          }}
        />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AppPrimerProvider>
  );
}
