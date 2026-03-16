import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import AlertMessage from "../ui/AlertMessage";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import { registrarLog } from "../../lib/logs";
import { formatDateTimeBR } from "../../lib/format";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";

type ParametrosSistema = {
  id?: string;
  company_id: string | null;
  owner_user_id?: string | null;
  owner_user_nome?: string | null;
  usar_taxas_na_meta: boolean;
  foco_valor: "bruto" | "liquido";
  modo_corporativo: boolean;
  politica_cancelamento: "cancelar_venda" | "estornar_recibos";
  foco_faturamento: "bruto" | "liquido";
  exportacao_pdf: boolean;
  exportacao_excel: boolean;
};


const DEFAULT_PARAMS: ParametrosSistema = {
  company_id: null,
  owner_user_id: null,
  usar_taxas_na_meta: false,
  foco_valor: "bruto",
  modo_corporativo: false,
  politica_cancelamento: "cancelar_venda",
  foco_faturamento: "bruto",
  exportacao_pdf: false,
  exportacao_excel: false,
};

export default function ParametrosSistemaIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Parametros");
  const podeAdministrar = can("Parametros", "edit");

  const [params, setParams] = useState<ParametrosSistema>(DEFAULT_PARAMS);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<string | null>(null);
  const [origemDados, setOrigemDados] = useState<"default" | "banco">("default");
  const [ownerNome, setOwnerNome] = useState<string | null>(null);
  const bloqueado = !podeVer || !podeAdministrar;

  useEffect(() => {
    carregar();
  }, []);

  const focoLabel = useMemo(
    () => (params.foco_valor === "bruto" ? "Valor bruto" : "Valor líquido"),
    [params.foco_valor],
  );

  async function carregar() {
    try {
      setLoading(true);
      setErro(null);
      setSucesso(null);

      const resp = await fetch("/api/v1/parametros/sistema");
      if (!resp.ok) throw new Error(await resp.text());
      const payload = (await resp.json()) as {
        params: ParametrosSistema;
        ultima_atualizacao: string | null;
        origem: "default" | "banco";
        owner_nome: string | null;
      };

      setParams(payload.params);
      setUltimaAtualizacao(payload.ultima_atualizacao || null);
      setOrigemDados(payload.origem || "default");
      setOwnerNome(payload.owner_nome || null);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar parâmetros.");
    } finally {
      setLoading(false);
    }
  }

  async function salvar() {
    if (bloqueado) return;
    try {
      setSalvando(true);
      setErro(null);
      setSucesso(null);

      const payload = {
        company_id: params.company_id,
        owner_user_id: params.owner_user_id,
        usar_taxas_na_meta: params.usar_taxas_na_meta,
        foco_valor: params.foco_valor,
        modo_corporativo: params.modo_corporativo,
        politica_cancelamento: params.politica_cancelamento,
        foco_faturamento: params.foco_faturamento,
        exportacao_pdf: params.exportacao_pdf,
        exportacao_excel: params.exportacao_excel,
      };

      const resp = await fetch("/api/v1/parametros/sistema", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error(await resp.text());
      const data = (await resp.json()) as { id?: string | null };
      if (data?.id) {
        setParams((prev) => ({ ...prev, id: data.id || undefined }));
      }

      await registrarLog({
        user_id: (await supabase.auth.getUser()).data.user?.id || null,
        acao: "parametros_sistema_salvos",
        modulo: "Parametros",
        detalhes: payload,
      });

      setSucesso("Parâmetros salvos com sucesso.");
      setUltimaAtualizacao(new Date().toISOString());
      setOrigemDados("banco");
      setOwnerNome(params.owner_user_nome || null);
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar parâmetros.");
    } finally {
      setSalvando(false);
    }
  }

  if (loading || loadingPerm) {
    return <LoadingUsuarioContext />;
  }

  if (!podeVer) {
    return <AppCard tone="config">Acesso ao modulo de Parametros bloqueado.</AppCard>;
  }

  return (
    <section className="parametros-sistema-page">
      <AppCard
        tone="config"
        className="mb-3"
        title="Parametros do Sistema"
        subtitle="Configuracoes gerais de metas, cancelamento, faturamento e exportacoes."
      />
      <AppCard tone="config">
      {erro && <AlertMessage variant="error">{erro}</AlertMessage>}
      {sucesso && <AlertMessage variant="success">{sucesso}</AlertMessage>}
      {ultimaAtualizacao && (
        <p style={{ marginTop: 0, color: "#64748b", fontSize: "0.9rem" }}>
          Ultima atualizacao: {formatDateTimeBR(ultimaAtualizacao)}
        </p>
      )}
      {origemDados && (
        <p style={{ marginTop: 4, color: "#94a3b8", fontSize: "0.85rem" }}>
          Origem dos dados: {origemDados === "banco" ? "Banco de dados" : "Valores padrao"}
        </p>
      )}
      {ownerNome && (
        <p style={{ marginTop: 4, color: "#94a3b8", fontSize: "0.85rem" }}>
          Ultima edicao por: {ownerNome}
        </p>
      )}

      <div className="form-row">
        <div className="form-group">
          <label className="form-label">Meta considera taxas?</label>
          <div>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={params.usar_taxas_na_meta}
                onChange={(e) =>
                  setParams((p) => ({ ...p, usar_taxas_na_meta: e.target.checked }))
                }
                disabled={bloqueado}
              />
              Incluir taxas no cálculo de meta
            </label>
          </div>
        </div>

        <div className="form-group">
          <AppField
            as="select"
            label="Foco das metas"
            value={params.foco_valor}
            onChange={(e) =>
              setParams((p) => ({
                ...p,
                foco_valor: e.target.value === "liquido" ? "liquido" : "bruto",
              }))
            }
            disabled={bloqueado}
            options={[
              { value: "bruto", label: "Valor bruto" },
              { value: "liquido", label: "Valor liquido" },
            ]}
          />
          <small style={{ color: "#64748b" }}>{focoLabel} será usado em metas e dashboards.</small>
        </div>

        <div className="form-group">
          <label className="form-label">Modo corporativo</label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={params.modo_corporativo}
              onChange={(e) =>
                setParams((p) => ({ ...p, modo_corporativo: e.target.checked }))
              }
              disabled={bloqueado}
            />
            Ativar modo corporativo (multi-empresa, controles extras)
          </label>
        </div>

        <div className="form-group">
          <AppField
            as="select"
            label="Politica de cancelamento"
            value={params.politica_cancelamento}
            onChange={(e) =>
              setParams((p) => ({
                ...p,
                politica_cancelamento:
                  e.target.value === "estornar_recibos"
                    ? "estornar_recibos"
                    : "cancelar_venda",
              }))
            }
            disabled={bloqueado}
            options={[
              { value: "cancelar_venda", label: "Cancelar venda (exclui venda)" },
              { value: "estornar_recibos", label: "Estornar recibos (manter venda)" },
            ]}
          />
          <small style={{ color: "#64748b" }}>
            Define comportamento padrão ao cancelar vendas.
          </small>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <AppField
            as="select"
            label="Foco de faturamento"
            value={params.foco_faturamento}
            onChange={(e) =>
              setParams((p) => ({
                ...p,
                foco_faturamento: e.target.value === "liquido" ? "liquido" : "bruto",
              }))
            }
            disabled={bloqueado}
            options={[
              { value: "bruto", label: "Valor bruto" },
              { value: "liquido", label: "Valor liquido" },
            ]}
          />
          <small style={{ color: "#64748b" }}>
            Define base para faturamento e relatórios financeiros.
          </small>
        </div>

        <div className="form-group">
          <label className="form-label">Exportações</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={params.exportacao_pdf}
                onChange={(e) =>
                  setParams((p) => ({ ...p, exportacao_pdf: e.target.checked }))
                }
                disabled={bloqueado}
              />
              Habilitar exportação em PDF
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={params.exportacao_excel}
                onChange={(e) =>
                  setParams((p) => ({ ...p, exportacao_excel: e.target.checked }))
                }
                disabled={bloqueado}
              />
              Habilitar exportação em Excel
            </label>
          </div>
          <small style={{ color: "#64748b" }}>
            Mantém coerência com os módulos de relatórios e orçamentos.
          </small>
        </div>
      </div>

      <div className="mobile-stack-buttons" style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <AppButton
          variant="primary"
          onClick={salvar}
          disabled={bloqueado || salvando}
        >
          {salvando ? "Salvando..." : "Salvar parametros"}
        </AppButton>
        <AppButton variant="secondary" onClick={carregar} disabled={salvando}>
          Recarregar
        </AppButton>
      </div>

      {bloqueado && (
        <p className="vtur-warning-note" style={{ marginTop: 12 }}>
          Voce nao tem permissao para editar. Solicite acesso ao administrador.
        </p>
      )}
      </AppCard>
    </section>
  );
}
