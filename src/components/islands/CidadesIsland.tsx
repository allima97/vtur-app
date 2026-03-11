import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { registrarLog } from "../../lib/logs";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { normalizeText as baseNormalizeText } from "../../lib/normalizeText";
import { useCrudResource } from "../../lib/useCrudResource";
import { fetchReferenceData } from "../../lib/referenceData";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import DataTable from "../ui/DataTable";
import ConfirmDialog from "../ui/ConfirmDialog";
import TableActions from "../ui/TableActions";
import EmptyState from "../ui/EmptyState";
import AlertMessage from "../ui/AlertMessage";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";
const normalizeText = (value: string) =>
  baseNormalizeText(value, { collapseWhitespace: true, trim: true });

type Pais = {
  id: string;
  nome: string;
};

type Subdivisao = {
  id: string;
  nome: string;
  pais_id: string;
  codigo_admin1?: string | null;
  tipo?: string | null;
};

type SubdivisaoOpcao = Subdivisao & { label: string; pais_nome: string };

type Cidade = {
  id: string;
  nome: string;
  subdivisao_id?: string;
  descricao?: string | null;
  created_at?: string | null;
  subdivisao_nome?: string | null;
  pais_nome?: string | null;
};

const initialForm = {
  nome: "",
  subdivisao_id: "",
  descricao: "",
};

export default function CidadesIsland() {
  // PERMISSOES
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const carregando = loadingPerms || !ready;
  const isAdmin = can("Cidades", "admin") || can("Cadastros", "admin");
  const podeVer = can("Cidades") || can("Cadastros");
  const podeCriar = can("Cidades", "create") || can("Cadastros", "create");
  const podeEditar = can("Cidades", "edit") || can("Cadastros", "edit");
  const podeExcluir = can("Cidades", "delete") || can("Cadastros", "delete");

  // STATES
  const [paises, setPaises] = useState<Pais[]>([]);
  const [subdivisoes, setSubdivisoes] = useState<Subdivisao[]>([]);
  const [loadingPaises, setLoadingPaises] = useState(false);
  const [loadingSubdivisoes, setLoadingSubdivisoes] = useState(false);
  const [subdivisaoOpcoes, setSubdivisaoOpcoes] = useState<SubdivisaoOpcao[]>([]);
  const [buscandoSubdivisao, setBuscandoSubdivisao] = useState(false);

  const {
    items: cidades,
    loading: loadingCidades,
    saving: salvando,
    deletingId: excluindoId,
    error: erro,
    setError: setErro,
    load: loadCidades,
    setItems: setCidades,
    create,
    update,
    remove,
  } = useCrudResource<Cidade>({
    table: "cidades",
    select: "id, nome, subdivisao_id, descricao, created_at",
  });

  const [busca, setBusca] = useState("");
  const [form, setForm] = useState(initialForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [cidadeParaExcluir, setCidadeParaExcluir] = useState<Cidade | null>(null);
  const [carregouTodos, setCarregouTodos] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [subdivisaoBusca, setSubdivisaoBusca] = useState("");
  const [mostrarSugestoesSubdivisao, setMostrarSugestoesSubdivisao] = useState(false);

  const loading = loadingCidades || loadingPaises || loadingSubdivisoes;

  // CARREGAR DADOS
  async function carregar(todos = false) {
    if (!podeVer) return;
    setErro(null);

    async function carregarCidades(): Promise<Cidade[]> {
      const selectPadrao = "id, nome, subdivisao_id, descricao, created_at";
      const selectFallback = "id, nome, subdivisao_id, descricao";
      if (todos) {
        const todas: Cidade[] = [];
        const pageSize = 1000;
        let from = 0;
        while (true) {
          try {
            const { data, error } = await supabase
              .from("cidades")
              .select(selectPadrao)
              .order("nome")
              .range(from, from + pageSize - 1);
            if (error) throw error;
            todas.push(...((data || []) as Cidade[]));
            if (!data || data.length < pageSize) break;
            from += pageSize;
          } catch (err) {
            console.warn("[Cidades] Falha na query principal, aplicando fallback.", err);
            try {
              const { data, error } = await supabase
                .from("cidades")
                .select(selectFallback)
                .order("nome")
                .range(from, from + pageSize - 1);
              if (error) throw error;
              todas.push(...((data || []) as Cidade[]));
              if (!data || data.length < pageSize) break;
              from += pageSize;
            } catch (fallbackErr) {
              console.warn("[Cidades] Fallback sem campo descricao.", fallbackErr);
              const { data, error } = await supabase
                .from("cidades")
                .select("id, nome, subdivisao_id")
                .order("nome")
                .range(from, from + pageSize - 1);
              if (error) throw error;
              todas.push(...((data || []) as Cidade[]));
              if (!data || data.length < pageSize) break;
              from += pageSize;
            }
          }
        }
        return todas;
      }

      try {
        const { data, error } = await supabase
          .from("cidades")
          .select(selectPadrao)
          .order("created_at", { ascending: false })
          .limit(5);
        if (error) throw error;
        return (data || []) as Cidade[];
      } catch (err) {
        console.warn("[Cidades] created_at indisponivel, ordenando por nome.", err);
        try {
          const { data, error } = await supabase
            .from("cidades")
            .select(selectFallback)
            .order("nome")
            .limit(5);
          if (error) throw error;
          return (data || []) as Cidade[];
        } catch (fallbackErr) {
          console.warn("[Cidades] Fallback sem descricao/nome.", fallbackErr);
          const { data, error } = await supabase
            .from("cidades")
            .select("id, nome, subdivisao_id")
            .order("nome")
            .limit(5);
          if (error) throw error;
          return (data || []) as Cidade[];
        }
      }
    }

    setLoadingPaises(true);
    setLoadingSubdivisoes(true);
    try {
      const payload = await fetchReferenceData({ include: ["paises", "subdivisoes"] });
      setPaises((payload.paises || []) as Pais[]);
      setSubdivisoes((payload.subdivisoes || []) as Subdivisao[]);
    } catch (err) {
      console.error(err);
      setErro("Erro ao carregar cidades.");
    } finally {
      setLoadingPaises(false);
      setLoadingSubdivisoes(false);
    }

    const cidadesRes = await loadCidades({
      fetcher: carregarCidades,
      errorMessage: "Erro ao carregar cidades.",
    });

    if (cidadesRes.error) {
      setErro("Erro ao carregar cidades.");
      return;
    }

    setCarregouTodos(todos);
  }

  useEffect(() => {
    if (carregando) return;
    if (!podeVer) return;
    carregar(false);
  }, [carregando, podeVer]);

  // Limpa para listagem inicial quando apaga a busca
  useEffect(() => {
    if (!busca.trim() && !carregando && podeVer) {
      carregar(false);
    }
  }, [busca, carregando, podeVer]);

  // Busca via RPC (mais leve) quando houver texto
  useEffect(() => {
    const termo = busca.trim();
    if (!termo || carregando || !podeVer) return;

    const controller = new AbortController();
    async function buscar() {
      setErro(null);
      try {
        const { data, error } = await supabase.rpc(
          "buscar_cidades",
          { q: termo, limite: 200 },
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        if (error) throw error;
        const lista = (data as any[]) || [];
        setCidades(
          lista.map((c) => ({
            id: c.id,
            nome: c.nome,
            subdivisao_id: c.subdivisao_id || "",
            descricao: c.descricao || null,
            created_at: c.created_at || null,
            subdivisao_nome: c.subdivisao_nome || "",
            pais_nome: c.pais_nome || "",
          }))
        );
        setCarregouTodos(true);
      } catch (e) {
        if (controller.signal.aborted) return;
        console.warn("[Cidades] RPC falhou, tentando fallback direto.", e);
        try {
          const { data, error } = await supabase
            .from("cidades")
            .select("id, nome, subdivisao_id, descricao, created_at")
            .ilike("nome", `%${termo}%`)
            .order("nome");
          if (error) throw error;
          setCidades((data as Cidade[]) || []);
          setCarregouTodos(true);
        } catch (errFinal) {
          console.error(errFinal);
          const msg = errFinal instanceof Error ? errFinal.message : "";
          setErro(`Erro ao buscar cidades.${msg ? ` Detalhe: ${msg}` : ""}`);
        }
      }
    }

    buscar();
    return () => controller.abort();
  }, [busca, carregando, podeVer]);

  // FILTRO
  const cidadesEnriquecidas = useMemo(() => {
    const subdivisaoMap = new Map(subdivisoes.map((s) => [s.id, s]));
    const paisMap = new Map(paises.map((p) => [p.id, p]));

    return cidades.map((c) => {
      const subdivisao = c.subdivisao_id ? subdivisaoMap.get(c.subdivisao_id) : undefined;
      const pais = subdivisao ? paisMap.get(subdivisao.pais_id) : undefined;
      return {
        ...c,
        subdivisao_nome: subdivisao?.nome || c.subdivisao_nome || "",
        pais_nome: pais?.nome || c.pais_nome || "",
      };
    });
  }, [cidades, subdivisoes, paises]);

  const filtradas = useMemo(() => {
    if (!busca.trim()) return cidadesEnriquecidas;

    const t = normalizeText(busca);
    // Primeiro, cidades cujo nome bate exatamente ou contém o termo
    const cidadesNome = cidadesEnriquecidas.filter(
      (c) => normalizeText(c.nome).includes(t)
    );
    // Depois, cidades que batem pela subdivisão ou país, mas não já incluídas
    const cidadesOutros = cidadesEnriquecidas.filter(
      (c) =>
        !normalizeText(c.nome).includes(t) &&
        (normalizeText((c as any).subdivisao_nome || "").includes(t) ||
         normalizeText((c as any).pais_nome || "").includes(t))
    );
    return [...cidadesNome, ...cidadesOutros];
  }, [busca, cidadesEnriquecidas]);
  const resumoLista = busca.trim()
    ? `${filtradas.length} cidade(s) encontradas para a busca atual.`
    : carregouTodos
      ? `${filtradas.length} cidade(s) carregadas para consulta completa.`
      : "Ultimas 5 cidades cadastradas. Digite na busca para consultar todas.";

  // Busca direta de subdivisoes no Supabase (debounced) — sem depender de cache
  useEffect(() => {
    const termo = subdivisaoBusca.trim();
    if (termo.length < 2) {
      setSubdivisaoOpcoes([]);
      return;
    }

    setBuscandoSubdivisao(true);
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("subdivisoes")
          .select("id, nome, pais_id, codigo_admin1, tipo, paises(nome)")
          .ilike("nome", `%${termo}%`)
          .order("nome")
          .limit(50);
        if (error) throw error;
        const paisMap = new Map(paises.map((p) => [p.id, p.nome]));
        const opcoes: SubdivisaoOpcao[] = (data || []).map((s: any) => {
          const paisNome = s.paises?.nome || paisMap.get(s.pais_id) || "";
          const codigo = s.codigo_admin1 ? ` (${s.codigo_admin1})` : "";
          return {
            id: s.id,
            nome: s.nome,
            pais_id: s.pais_id,
            codigo_admin1: s.codigo_admin1 || null,
            tipo: s.tipo || null,
            pais_nome: paisNome,
            label: `${s.nome}${codigo}${paisNome ? ` - ${paisNome}` : ""}`,
          };
        });
        setSubdivisaoOpcoes(opcoes);
      } catch (err) {
        console.error("[CidadesIsland] Erro ao buscar subdivisoes:", err);
        setSubdivisaoOpcoes([]);
      } finally {
        setBuscandoSubdivisao(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      setBuscandoSubdivisao(false);
    };
  }, [subdivisaoBusca]);

  // CHANGE
  function handleChange(campo: string, valor: any) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function handleSubdivisaoBusca(valor: string) {
    setSubdivisaoBusca(valor);
    if (!valor.trim()) {
      handleChange("subdivisao_id", "");
      return;
    }
    const termo = normalizeText(valor);
    const match = subdivisaoOpcoes.find(
      (s) =>
        normalizeText(s.label) === termo ||
        normalizeText(s.nome) === termo
    );
    if (match) {
      handleChange("subdivisao_id", match.id);
      return;
    }
    if (form.subdivisao_id) {
      handleChange("subdivisao_id", "");
    }
  }

  // EDITAR
  function iniciarEdicao(c: Cidade) {
    if (!podeEditar) return;

    async function prepararEdicao() {
      try {
        let alvo = c;
        if (!c.subdivisao_id) {
          const { data, error } = await supabase
            .from("cidades")
            .select("id, nome, subdivisao_id, descricao")
            .eq("id", c.id)
            .maybeSingle();
          if (error) throw error;
          if (data) {
            alvo = {
              ...c,
              subdivisao_id: (data as any).subdivisao_id || "",
              descricao: (data as any).descricao || "",
            };
          }
        }

        setEditId(alvo.id);
        setForm({
          nome: alvo.nome,
          subdivisao_id: alvo.subdivisao_id || "",
          descricao: alvo.descricao || "",
        });
        if (alvo.subdivisao_id) {
          // Busca direto no Supabase para garantir label correto independente de cache
          const { data: sdData } = await supabase
            .from("subdivisoes")
            .select("id, nome, pais_id, codigo_admin1, paises(nome)")
            .eq("id", alvo.subdivisao_id)
            .maybeSingle();
          if (sdData) {
            const d = sdData as any;
            const paisNome = d.paises?.nome || paises.find((p) => p.id === d.pais_id)?.nome || "";
            const codigo = d.codigo_admin1 ? ` (${d.codigo_admin1})` : "";
            const label = `${d.nome}${codigo}${paisNome ? ` - ${paisNome}` : ""}`;
            setSubdivisaoBusca(label);
            setSubdivisaoOpcoes([{
              id: d.id,
              nome: d.nome,
              pais_id: d.pais_id,
              codigo_admin1: d.codigo_admin1 || null,
              tipo: d.tipo || null,
              pais_nome: paisNome,
              label,
            }]);
          } else {
            setSubdivisaoBusca("");
          }
        } else {
          setSubdivisaoBusca("");
        }
      } catch (err) {
        console.error(err);
        setErro("Nao foi possivel carregar dados da cidade para edicao.");
      }
    }

    prepararEdicao();
    setMostrarFormulario(true);
  }

  function iniciarNovo() {
    setEditId(null);
    setForm(initialForm);
    setSubdivisaoBusca("");
  }

  function abrirFormulario() {
    if (!podeCriar) return;
    iniciarNovo();
    setMostrarFormulario(true);
  }

  function fecharFormulario() {
    iniciarNovo();
    setMostrarFormulario(false);
  }

  // SALVAR
  async function salvar(e: React.FormEvent) {
    e.preventDefault();

    if (!podeCriar && !podeEditar) return;

    if (!form.subdivisao_id) {
      setErro("Subdivisao e obrigatoria.");
      return;
    }
    if (!form.nome.trim()) {
      setErro("Nome e obrigatorio.");
      return;
    }

    setErro(null);

    const payload = {
      nome: titleCaseWithExceptions(form.nome),
      subdivisao_id: form.subdivisao_id,
      descricao: form.descricao || null,
    };

    const result = editId
      ? await update(editId, payload, { errorMessage: "Erro ao salvar cidade." })
      : await create(payload, { errorMessage: "Erro ao salvar cidade." });

    if (result.error) return;

    try {
      if (editId) {
        await registrarLog({
          user_id: null,
          acao: "cidade_editada",
          modulo: "Cadastros",
          detalhes: { id: editId, payload },
        });
      } else {
        await registrarLog({
          user_id: null,
          acao: "cidade_criada",
          modulo: "Cadastros",
          detalhes: payload,
        });
      }
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar cidade.");
      return;
    }

    carregar(carregouTodos);
    fecharFormulario();
  }

  // EXCLUIR
  async function excluir(id: string) {
    if (!podeExcluir) return;

    setErro(null);

    const result = await remove(id, {
      errorMessage: "Erro ao excluir cidade (provavelmente usada em produtos/destinos).",
    });

    if (result.error) return;

    try {
      await registrarLog({
        user_id: null,
        acao: "cidade_excluida",
        modulo: "Cadastros",
        detalhes: { id },
      });
    } catch (e) {
      console.error(e);
      setErro("Erro ao excluir cidade (provavelmente usada em produtos/destinos).");
      return;
    }

    carregar(carregouTodos);
  }

  function solicitarExclusao(cidade: Cidade) {
    if (!podeExcluir) return;
    setCidadeParaExcluir(cidade);
  }

  async function confirmarExclusao() {
    if (!cidadeParaExcluir) return;
    await excluir(cidadeParaExcluir.id);
    setCidadeParaExcluir(null);
  }

  if (!podeVer && !isAdmin) {
    if (carregando) {
      return <LoadingUsuarioContext className="mb-3" />;
    }
    return <div className="auth-error">Voce nao possui permissao para visualizar Cidades.</div>;
  }

  return (
    <AppPrimerProvider>
      <div className="cidades-page">
      {!mostrarFormulario && (
        <AppToolbar
          sticky
          tone="config"
          className="mb-3 list-toolbar-sticky"
          title="Consulta de cidades"
          subtitle={resumoLista}
          actions={
            podeCriar ? (
              <AppButton
                type="button"
                variant="primary"
                onClick={abrirFormulario}
                disabled={mostrarFormulario}
              >
                Adicionar cidade
              </AppButton>
            ) : null
          }
        >
          <div className="vtur-toolbar-grid">
            <AppField
              label="Buscar cidade"
              placeholder="Nome, subdivisao ou pais..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </AppToolbar>
      )}

      {(podeCriar || podeEditar) && mostrarFormulario && (
        <AppCard
          className="form-card mb-3"
          title={editId ? "Editar cidade" : "Nova cidade"}
          subtitle="Mantenha cidades e vinculos com subdivisoes consistentes para destinos, produtos e operacao."
          tone="info"
        >
          <form onSubmit={salvar}>
            <div className="vtur-form-grid vtur-form-grid-2">
              <AppField
                label="Nome *"
                value={form.nome}
                onChange={(e) => handleChange("nome", e.target.value)}
                onBlur={(e) => handleChange("nome", titleCaseWithExceptions(e.target.value))}
                required
                validation={!form.nome.trim() && erro ? "Nome e obrigatorio." : undefined}
              />

              <div className="form-group vtur-subdivisao-picker">
                <AppField
                  label="Subdivisao *"
                  placeholder="Digite a subdivisao"
                  value={subdivisaoBusca}
                  onChange={(e) => handleSubdivisaoBusca(e.target.value)}
                  onFocus={() => setMostrarSugestoesSubdivisao(true)}
                  onBlur={() => setTimeout(() => setMostrarSugestoesSubdivisao(false), 150)}
                  required
                  validation={!form.subdivisao_id && erro ? "Subdivisao e obrigatoria." : undefined}
                />
                {mostrarSugestoesSubdivisao && (
                  <AppCard className="vtur-subdivisao-dropdown">
                    {buscandoSubdivisao && (
                      <div className="vtur-subdivisao-helper">Buscando...</div>
                    )}
                    {!buscandoSubdivisao && subdivisaoBusca.trim().length < 2 && (
                      <div className="vtur-subdivisao-helper">Digite ao menos 2 caracteres...</div>
                    )}
                    {!buscandoSubdivisao && subdivisaoBusca.trim().length >= 2 && subdivisaoOpcoes.length === 0 && (
                      <div className="vtur-subdivisao-helper">Nenhuma subdivisao encontrada.</div>
                    )}
                    {subdivisaoOpcoes.map((s) => (
                      <AppButton
                        key={s.id}
                        type="button"
                        variant={form.subdivisao_id === s.id ? "primary" : "secondary"}
                        className="vtur-subdivisao-option"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleChange("subdivisao_id", s.id);
                          setSubdivisaoBusca(s.label);
                          setMostrarSugestoesSubdivisao(false);
                        }}
                      >
                        {s.label}
                      </AppButton>
                    ))}
                  </AppCard>
                )}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <AppField
                as="textarea"
                label="Descricao"
                rows={3}
                value={form.descricao}
                onChange={(e) => handleChange("descricao", e.target.value)}
              />
            </div>

            <div className="vtur-form-actions mobile-stack-buttons" style={{ marginTop: 12 }}>
              <AppButton type="submit" variant="primary" disabled={salvando} loading={salvando}>
                {salvando ? "Salvando..." : "Salvar cidade"}
              </AppButton>
              <AppButton type="button" variant="secondary" onClick={fecharFormulario} disabled={salvando}>
                Cancelar
              </AppButton>
            </div>
          </form>
        </AppCard>
      )}

      {!mostrarFormulario && carregando && <LoadingUsuarioContext className="mb-3" />}
      {!mostrarFormulario && !carregando && erro && (
        <AlertMessage variant="error" className="mb-3">
          {erro}
        </AlertMessage>
      )}
      {!mostrarFormulario && !carregouTodos && !erro && (
        <AlertMessage variant="info" className="mb-3">
          Ultimas cidades cadastradas (5). Digite na busca para consultar todas.
        </AlertMessage>
      )}

      {!mostrarFormulario && (
        <DataTable
          shellClassName="mb-3"
          className="table-default table-header-blue table-mobile-cards min-w-[720px]"
          containerStyle={{ maxHeight: "65vh", overflowY: "auto" }}
          headers={
            <tr>
              <th>Cidade</th>
              <th>Subdivisao</th>
              <th>Pais</th>
              <th>Criada em</th>
              {(podeEditar || podeExcluir) && <th className="th-actions">Ações</th>}
            </tr>
          }
          loading={loading}
          loadingMessage="Carregando cidades..."
          empty={!loading && filtradas.length === 0}
          emptyMessage={
            <EmptyState
              title="Nenhuma cidade encontrada"
              description={
                busca.trim()
                  ? "Tente ajustar a busca ou cadastre uma nova cidade."
                  : "Cadastre uma cidade para comecar."
              }
            />
          }
          colSpan={podeEditar || podeExcluir ? 5 : 4}
        >
          {filtradas.map((c) => (
            <tr key={c.id}>
              <td data-label="Cidade">{c.nome}</td>
              <td data-label="Subdivisao">{(c as any).subdivisao_nome || "-"}</td>
              <td data-label="Pais">{(c as any).pais_nome || "-"}</td>
              <td data-label="Criada em">{c.created_at ? c.created_at.slice(0, 10) : "-"}</td>
              {(podeEditar || podeExcluir) && (
                <td className="th-actions" data-label="Ações">
                  <TableActions
                    show={podeEditar || podeExcluir}
                    actions={[
                      ...(podeEditar
                        ? [
                          {
                              key: "edit",
                              label: "Editar",
                              onClick: () => iniciarEdicao(c),
                            },
                          ]
                        : []),
                      ...(podeExcluir
                        ? [
                            {
                              key: "delete",
                              label: "Excluir",
                              onClick: () => solicitarExclusao(c),
                              variant: "danger" as const,
                              disabled: excluindoId === c.id,
                            },
                          ]
                        : []),
                    ]}
                  />
                </td>
              )}
            </tr>
          ))}
        </DataTable>
      )}

      <ConfirmDialog
        open={Boolean(cidadeParaExcluir)}
        title="Excluir cidade"
        message={`Excluir ${cidadeParaExcluir?.nome || "esta cidade"}?`}
        confirmLabel={excluindoId ? "Excluindo..." : "Excluir"}
        confirmVariant="danger"
        confirmDisabled={Boolean(excluindoId)}
        onCancel={() => setCidadeParaExcluir(null)}
        onConfirm={confirmarExclusao}
      />
      </div>
    </AppPrimerProvider>
  );
}
