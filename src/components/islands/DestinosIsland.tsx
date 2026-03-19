import React, { useEffect, useMemo, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { normalizeText } from "../../lib/normalizeText";
import { useCrudResource } from "../../lib/useCrudResource";
import { fetchReferenceData } from "../../lib/referenceData";
import { formatDateBR } from "../../lib/format";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import DataTable from "../ui/DataTable";
import ConfirmDialog from "../ui/ConfirmDialog";
import TableActions from "../ui/TableActions";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import { ToastStack, useToastQueue } from "../ui/Toast";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

type Pais = {
  id: string;
  nome: string;
};

type Subdivisao = {
  id: string;
  nome: string;
  pais_id: string;
};

type Cidade = {
  id: string;
  nome: string;
  subdivisao_id: string;
};

type Destino = {
  id: string;
  nome: string;
  cidade_id: string;
  informacoes_importantes: string | null;
  tipo: string | null;
  atracao_principal: string | null;
  melhor_epoca: string | null;
  duracao_sugerida: string | null;
  nivel_preco: string | null;
  imagem_url: string | null;
  ativo: boolean | null;
  created_at: string | null;
};

type FormState = {
  nome: string;
  pais_id: string;
  cidade_id: string;
  tipo: string;
  atracao_principal: string;
  melhor_epoca: string;
  duracao_sugerida: string;
  nivel_preco: string;
  imagem_url: string;
  informacoes_importantes: string;
  ativo: boolean;
};

const initialForm: FormState = {
  nome: "",
  pais_id: "",
  cidade_id: "",
  tipo: "",
  atracao_principal: "",
  melhor_epoca: "",
  duracao_sugerida: "",
  nivel_preco: "",
  imagem_url: "",
  informacoes_importantes: "",
  ativo: true,
};

export default function DestinosIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Destinos");
  const podeCriar = can("Destinos", "create");
  const podeEditar = can("Destinos", "edit");
  const podeExcluir = can("Destinos", "admin");
  const modoSomenteLeitura = !podeCriar && !podeEditar;

  const [paises, setPaises] = useState<Pais[]>([]);
  const [subdivisoes, setSubdivisoes] = useState<Subdivisao[]>([]);
  const [cidades, setCidades] = useState<Cidade[]>([]);
  const [loadingPaises, setLoadingPaises] = useState(false);
  const [loadingSubdivisoes, setLoadingSubdivisoes] = useState(false);
  const [loadingCidades, setLoadingCidades] = useState(false);

  const {
    items: destinos,
    loading: loadingDestinos,
    saving: salvando,
    deletingId: excluindoId,
    error: erro,
    setError: setErro,
    load: loadDestinos,
    create,
    update,
    remove,
  } = useCrudResource<Destino>({
    table: "destinos",
    select:
      "id, nome, cidade_id, informacoes_importantes, tipo, atracao_principal, melhor_epoca, duracao_sugerida, nivel_preco, imagem_url, ativo, created_at",
  });

  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<FormState>(initialForm);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [destinoParaExcluir, setDestinoParaExcluir] = useState<Destino | null>(null);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  const loading =
    loadingPaises || loadingSubdivisoes || loadingCidades || loadingDestinos;

  async function carregarDadosIniciais() {
    const errorMessage =
      "Erro ao carregar destinos. Verifique se as tabelas 'paises', 'subdivisoes' e 'cidades' existem e se as colunas estao corretas.";

    setErro(null);

    setLoadingPaises(true);
    setLoadingSubdivisoes(true);
    setLoadingCidades(true);
    try {
      const payload = await fetchReferenceData({ include: ["paises", "subdivisoes", "cidades"] });
      setPaises((payload.paises || []) as Pais[]);
      setSubdivisoes((payload.subdivisoes || []) as Subdivisao[]);
      setCidades((payload.cidades || []) as Cidade[]);
    } catch (err) {
      console.error(err);
      setErro(errorMessage);
    } finally {
      setLoadingPaises(false);
      setLoadingSubdivisoes(false);
      setLoadingCidades(false);
    }

    const destinosRes = await loadDestinos({
      order: { column: "nome", ascending: true },
      errorMessage,
    });

    if (destinosRes.error) return;
  }

  useEffect(() => {
    carregarDadosIniciais();
  }, []);

  const subdivisaoMap = useMemo(() => new Map(subdivisoes.map((s) => [s.id, s])), [subdivisoes]);

  const cidadesFiltradas = useMemo(() => {
    if (!form.pais_id) return cidades;
    return cidades.filter((c) => {
      const subdivisao = subdivisaoMap.get(c.subdivisao_id);
      return subdivisao?.pais_id === form.pais_id;
    });
  }, [cidades, form.pais_id, subdivisaoMap]);

  const destinosEnriquecidos = useMemo(() => {
    const cidadeMap = new Map(cidades.map((c) => [c.id, c]));
    const paisMap = new Map(paises.map((p) => [p.id, p]));

    return destinos.map((d) => {
      const cidade = cidadeMap.get(d.cidade_id || "");
      const subdivisao = cidade ? subdivisaoMap.get(cidade.subdivisao_id) : undefined;
      const pais = subdivisao ? paisMap.get(subdivisao.pais_id) : undefined;
      return {
        ...d,
        cidade_nome: cidade?.nome || "",
        pais_nome: pais?.nome || "",
      };
    });
  }, [destinos, cidades, paises, subdivisaoMap]);

  const destinosFiltrados = useMemo(() => {
    if (!busca.trim()) return destinosEnriquecidos;
    const termo = normalizeText(busca);
    return destinosEnriquecidos.filter((d) => {
      return (
        normalizeText(d.nome).includes(termo) ||
        normalizeText(d.cidade_nome).includes(termo) ||
        normalizeText(d.pais_nome).includes(termo)
      );
    });
  }, [destinosEnriquecidos, busca]);
  const destinosExibidos = useMemo(() => {
    return busca.trim() ? destinosFiltrados : destinosFiltrados.slice(0, 5);
  }, [destinosFiltrados, busca]);
  const resumoLista = busca.trim()
    ? `${destinosFiltrados.length} destino(s) encontrados para a busca atual.`
    : `${destinos.length} destino(s) cadastrados. Exibindo ${destinosExibidos.length} item(ns) na listagem inicial.`;

  function handleChange<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((prev) => ({
      ...prev,
      [campo]: valor,
      ...(campo === "pais_id" ? { cidade_id: "" } : {}),
    }));
  }

  function iniciarNovo() {
    setEditandoId(null);
    setForm(initialForm);
  }

  function iniciarEdicao(destino: Destino & { cidade_nome?: string; pais_nome?: string }) {
    const cidade = cidades.find((c) => c.id === destino.cidade_id);
    const subdivisao = cidade ? subdivisaoMap.get(cidade.subdivisao_id) : undefined;
    const paisId = subdivisao?.pais_id || "";

    setEditandoId(destino.id);
    setForm({
      nome: destino.nome,
      pais_id: paisId,
      cidade_id: destino.cidade_id,
      tipo: destino.tipo || "",
      atracao_principal: destino.atracao_principal || "",
      melhor_epoca: destino.melhor_epoca || "",
      duracao_sugerida: destino.duracao_sugerida || "",
      nivel_preco: destino.nivel_preco || "",
      imagem_url: destino.imagem_url || "",
      informacoes_importantes: destino.informacoes_importantes || "",
      ativo: destino.ativo ?? true,
    });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();

    if (modoSomenteLeitura) {
      setErro("Voce nao tem permissao para salvar destinos.");
      return;
    }

    if (!form.nome.trim()) {
      setErro("Nome e obrigatorio.");
      return;
    }
    if (!form.cidade_id) {
      setErro("Cidade e obrigatoria.");
      return;
    }

    setErro(null);

    const payload = {
      nome: titleCaseWithExceptions(form.nome),
      cidade_id: form.cidade_id,
      tipo: form.tipo.trim() || null,
      atracao_principal: form.atracao_principal.trim() || null,
      melhor_epoca: form.melhor_epoca.trim() || null,
      duracao_sugerida: form.duracao_sugerida.trim() || null,
      nivel_preco: form.nivel_preco.trim() || null,
      imagem_url: form.imagem_url.trim() || null,
      informacoes_importantes: form.informacoes_importantes.trim() || null,
      ativo: form.ativo,
    };

    const result = editandoId
      ? await update(editandoId, payload, {
          errorMessage: "Erro ao salvar destino. Verifique os dados e tente novamente.",
        })
      : await create(payload, {
          errorMessage: "Erro ao salvar destino. Verifique os dados e tente novamente.",
        });

    if (result.error) return;

    setForm(initialForm);
    setEditandoId(null);
    await carregarDadosIniciais();
  }

  async function excluir(id: string) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir destinos.", "error");
      return;
    }

    setErro(null);

    const result = await remove(id, {
      errorMessage:
        "Nao foi possivel excluir o destino. Verifique se nao existem vendas vinculadas.",
    });

    if (result.error) return;

    await carregarDadosIniciais();
  }

  function solicitarExclusao(destino: Destino) {
    if (!podeExcluir) {
      showToast("Somente administradores podem excluir destinos.", "error");
      return;
    }
    setDestinoParaExcluir(destino);
  }

  async function confirmarExclusao() {
    if (!destinoParaExcluir) return;
    await excluir(destinoParaExcluir.id);
    setDestinoParaExcluir(null);
  }

  if (loadingPerm) {
    return <LoadingUsuarioContext />;
  }
  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">
          <strong>Voce nao possui acesso ao modulo de Cadastros.</strong>
        </AppCard>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="destinos-page page-content-wrap">
        <AppCard
          className="mb-3"
          tone="info"
          title={editandoId ? "Editar destino" : "Novo destino"}
          subtitle="Centralize cidade, pais, atributos comerciais e notas operacionais do destino em um unico cadastro."
        >
          <form onSubmit={salvar}>
            <div className="vtur-form-grid vtur-form-grid-3">
              <AppField
                label="Nome do destino *"
                value={form.nome}
                onChange={(e) => handleChange("nome", e.target.value)}
                onBlur={(e) => handleChange("nome", titleCaseWithExceptions(e.target.value))}
                placeholder="Ex: Orlando, Paris, Gramado..."
                disabled={modoSomenteLeitura}
              />
              <AppField
                as="select"
                label="Pais *"
                value={form.pais_id}
                onChange={(e) => handleChange("pais_id", e.target.value)}
                disabled={modoSomenteLeitura}
                options={[
                  { value: "", label: "Selecione um pais" },
                  ...paises.map((p) => ({ value: p.id, label: p.nome })),
                ]}
              />
              <AppField
                as="select"
                label="Cidade *"
                value={form.cidade_id}
                onChange={(e) => handleChange("cidade_id", e.target.value)}
                disabled={modoSomenteLeitura}
                options={[
                  { value: "", label: form.pais_id ? "Selecione uma cidade" : "Selecione um pais primeiro" },
                  ...cidadesFiltradas.map((c) => ({ value: c.id, label: c.nome })),
                ]}
              />
            </div>

            <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 16 }}>
              <AppField
                label="Tipo"
                value={form.tipo}
                onChange={(e) => handleChange("tipo", e.target.value)}
                placeholder="Ex: Cidade, Praia, Parque, Serra..."
                disabled={modoSomenteLeitura}
              />
              <AppField
                label="Atracao principal"
                value={form.atracao_principal}
                onChange={(e) => handleChange("atracao_principal", e.target.value)}
                placeholder="Ex: Disney, Torre Eiffel, Centro Historico..."
                disabled={modoSomenteLeitura}
              />
            </div>

            <div className="vtur-form-grid vtur-form-grid-3" style={{ marginTop: 16 }}>
              <AppField
                label="Melhor epoca"
                value={form.melhor_epoca}
                onChange={(e) => handleChange("melhor_epoca", e.target.value)}
                placeholder="Ex: Dezembro a Marco"
                disabled={modoSomenteLeitura}
              />
              <AppField
                label="Duracao sugerida"
                value={form.duracao_sugerida}
                onChange={(e) => handleChange("duracao_sugerida", e.target.value)}
                placeholder="Ex: 7 dias"
                disabled={modoSomenteLeitura}
              />
              <AppField
                label="Nivel de preco"
                value={form.nivel_preco}
                onChange={(e) => handleChange("nivel_preco", e.target.value)}
                placeholder="Ex: Economico, Intermediario, Premium"
                disabled={modoSomenteLeitura}
              />
            </div>

            <div className="vtur-form-grid vtur-form-grid-2" style={{ marginTop: 16 }}>
              <AppField
                label="Imagem (URL)"
                value={form.imagem_url}
                onChange={(e) => handleChange("imagem_url", e.target.value)}
                placeholder="URL de uma imagem do destino"
                disabled={modoSomenteLeitura}
              />
              <AppField
                as="select"
                label="Ativo"
                value={form.ativo ? "true" : "false"}
                onChange={(e) => handleChange("ativo", e.target.value === "true")}
                disabled={modoSomenteLeitura}
                options={[
                  { value: "true", label: "Sim" },
                  { value: "false", label: "Nao" },
                ]}
              />
            </div>

            <div style={{ marginTop: 16 }}>
              <AppField
                as="textarea"
                label="Informacoes importantes"
                rows={4}
                value={form.informacoes_importantes}
                onChange={(e) => handleChange("informacoes_importantes", e.target.value)}
                placeholder="Observacoes gerais, dicas, documentacao necessaria, etc."
                disabled={modoSomenteLeitura}
              />
            </div>

            <div className="vtur-form-actions">
              {!modoSomenteLeitura && (
                <AppButton type="submit" variant="primary" disabled={salvando} loading={salvando}>
                  {salvando
                    ? "Salvando..."
                    : editandoId
                      ? "Salvar alteracoes"
                      : "Adicionar destino"}
                </AppButton>
              )}
              {editandoId && !modoSomenteLeitura && (
                <AppButton type="button" variant="secondary" onClick={iniciarNovo}>
                  Cancelar edicao
                </AppButton>
              )}
            </div>
          </form>
        </AppCard>

        <AppCard
          tone="config"
          className="mb-3 list-toolbar-sticky"
          title="Destinos"
          subtitle={resumoLista}
        >
          <div className="vtur-form-grid vtur-form-grid-2">
            <AppField
              label="Buscar destino"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Busque por nome, cidade ou pais..."
              caption="Use a busca para localizar rapidamente destinos por geografia ou categoria."
            />
          </div>
        </AppCard>

        {erro && (
          <AlertMessage variant="error" className="mb-3">
            {erro}
          </AlertMessage>
        )}

        <AppCard
          tone="config"
          title="Base de destinos"
          subtitle="Visualize o portifolio geográfico com cidade, pais, faixa comercial e status operacional."
        >
          <DataTable
            className="table-header-blue table-mobile-cards min-w-[960px]"
            containerClassName="vtur-scroll-y-65"
            headers={
              <tr>
                <th>Destino</th>
                <th>Cidade</th>
                <th>Pais</th>
                <th>Tipo</th>
                <th>Nivel de preco</th>
                <th>Ativo</th>
                <th>Criado em</th>
                <th className="th-actions">Ações</th>
              </tr>
            }
            loading={loading}
            loadingMessage="Carregando destinos..."
            empty={!loading && destinosExibidos.length === 0}
            emptyMessage={
              <EmptyState
                title="Nenhum destino encontrado"
                description={
                  busca.trim()
                    ? "Ajuste o termo pesquisado para localizar destinos ja cadastrados."
                    : "Cadastre o primeiro destino para estruturar consultas, produtos e vendas com geografia consistente."
                }
              />
            }
            colSpan={8}
          >
            {destinosExibidos.map((d) => (
              <tr key={d.id}>
                <td data-label="Destino">{d.nome}</td>
                <td data-label="Cidade">{(d as any).cidade_nome || "-"}</td>
                <td data-label="Pais">{(d as any).pais_nome || "-"}</td>
                <td data-label="Tipo">{d.tipo || "-"}</td>
                <td data-label="Nivel de preco">{d.nivel_preco || "-"}</td>
                <td data-label="Ativo">{d.ativo ? "Sim" : "Nao"}</td>
                <td data-label="Criado em">
                  {d.created_at ? formatDateBR(d.created_at) : "-"}
                </td>
                <td className="th-actions" data-label="Ações">
                  <TableActions
                    show={!modoSomenteLeitura || podeExcluir}
                    actions={[
                      ...(!modoSomenteLeitura
                        ? [
                            {
                              key: "edit",
                              label: "Editar",
                              onClick: () => iniciarEdicao(d),
                              variant: "ghost" as const,
                            },
                          ]
                        : []),
                      ...(podeExcluir
                        ? [
                            {
                              key: "delete",
                              label: excluindoId === d.id ? "Excluindo..." : "Excluir",
                              onClick: () => solicitarExclusao(d),
                              variant: "danger" as const,
                              disabled: excluindoId === d.id,
                            },
                          ]
                        : []),
                    ]}
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        </AppCard>

        <ConfirmDialog
          open={Boolean(destinoParaExcluir)}
          title="Excluir destino"
          message={`Tem certeza que deseja excluir ${destinoParaExcluir?.nome || "este destino"}?`}
          confirmLabel={excluindoId ? "Excluindo..." : "Excluir"}
          confirmVariant="danger"
          confirmDisabled={Boolean(excluindoId)}
          onCancel={() => setDestinoParaExcluir(null)}
          onConfirm={confirmarExclusao}
        />
        <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AppPrimerProvider>
  );
}
