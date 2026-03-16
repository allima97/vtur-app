import { Dialog } from "../ui/primer/legacyCompat";
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  CONSULTORIA_LEMBRETES,
  getConsultoriaLembreteLabel,
} from "../../lib/consultoriaLembretes";
import { formatDateTimeBR } from "../../lib/format";
import AlertMessage from "../ui/AlertMessage";
import ConfirmDialog from "../ui/ConfirmDialog";
import DataTable from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import TableActions from "../ui/TableActions";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

type ClienteOption = {
  id: string;
  nome: string;
};

type ConsultoriaRegistro = {
  id: string;
  cliente_id: string | null;
  cliente_nome: string;
  data_hora: string;
  lembrete: string;
  destino: string | null;
  quantidade_pessoas: number;
  orcamento_id: string | null;
  taxa_consultoria: string | number;
  notas: string | null;
  fechada?: boolean | null;
  fechada_em?: string | null;
  created_at: string;
};

const initialFormState = {
  clienteId: "",
  clienteNome: "",
  dataHora: "",
  lembrete: "15min",
  destino: "",
  quantidadePessoas: 1,
  orcamentoId: "",
  taxaConsultoria: "",
  notas: "",
};

export default function ConsultoriaOnlineIsland() {
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [form, setForm] = useState(initialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consultas, setConsultas] = useState<ConsultoriaRegistro[]>([]);
  const [loadingConsultas, setLoadingConsultas] = useState(false);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [busca, setBusca] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [interacaoModal, setInteracaoModal] = useState<ConsultoriaRegistro | null>(null);
  const [interacaoTexto, setInteracaoTexto] = useState("");
  const [interacaoErro, setInteracaoErro] = useState<string | null>(null);
  const [salvandoInteracao, setSalvandoInteracao] = useState(false);
  const [fechandoId, setFechandoId] = useState<string | null>(null);
  const [consultaParaFechar, setConsultaParaFechar] = useState<ConsultoriaRegistro | null>(null);

  useEffect(() => {
    const loadClientes = async () => {
      try {
        const { data, error } = await supabase
          .from("clientes")
          .select("id, nome")
          .order("nome", { ascending: true })
          .limit(120);
        if (error) throw error;
        setClientes(
          (data ?? []).map((item: any) => ({
            id: item.id,
            nome: item.nome || "Cliente sem nome",
          }))
        );
      } catch (err) {
        console.error("Falha ao carregar clientes", err);
      }
    };
    loadClientes();
    fetchConsultas();
  }, []);

  const handleInputChange = (campo: keyof typeof initialFormState, valor: string | number) => {
    if (campo === "quantidadePessoas") {
      const quantidade = Number(valor);
      setForm((prev) => ({ ...prev, quantidadePessoas: Number.isNaN(quantidade) ? 1 : quantidade }));
      return;
    }
    setForm((prev) => ({ ...prev, [campo]: valor }));
  };

  const handleSelectCliente = (clienteId: string) => {
    const cliente = clientes.find((item) => item.id === clienteId);

    setForm((prev) => ({
      ...prev,
      clienteId,
      clienteNome: cliente?.nome ?? prev.clienteNome,
    }));
  };

  const formatarInputDateTime = (value?: string | null) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 16);
  };

  const fetchConsultas = async () => {
    setLoadingConsultas(true);
    try {
      const resp = await fetch("/api/consultorias", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      const data = (await resp.json()) as ConsultoriaRegistro[];
      setConsultas(data);
    } catch (err) {
      console.error("Não foi possível buscar consultorias", err);
    } finally {
      setLoadingConsultas(false);
    }
  };

  const abrirFormulario = () => {
    setMostrarFormulario(true);
    setEditandoId(null);
    setError(null);
    setMessage(null);
  };

  const cancelarFormulario = () => {
    setMostrarFormulario(false);
    setForm({ ...initialFormState });
    setEditandoId(null);
    setError(null);
    setMessage(null);
  };

  const abrirEdicao = (consulta: ConsultoriaRegistro) => {
    setForm({
      clienteId: consulta.cliente_id || "",
      clienteNome: consulta.cliente_nome || "",
      dataHora: formatarInputDateTime(consulta.data_hora),
      lembrete: consulta.lembrete || "15min",
      destino: consulta.destino || "",
      quantidadePessoas: consulta.quantidade_pessoas || 1,
      orcamentoId: consulta.orcamento_id || "",
      taxaConsultoria: consulta.taxa_consultoria ?? "",
      notas: consulta.notas || "",
    });
    setEditandoId(consulta.id);
    setMostrarFormulario(true);
    setMessage(null);
    setError(null);
  };

  const abrirInteracao = (consulta: ConsultoriaRegistro) => {
    setInteracaoModal(consulta);
    setInteracaoTexto("");
    setInteracaoErro(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (!form.clienteNome.trim()) {
      setError("Informe o cliente.");
      return;
    }
    if (!form.dataHora) {
      setError("Informe a data e hora do agendamento.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        clienteId: form.clienteId || null,
        clienteNome: form.clienteNome.trim(),
        dataHora: form.dataHora,
        lembrete: form.lembrete,
        destino: form.destino.trim() || null,
        quantidadePessoas: form.quantidadePessoas,
        orcamentoId: form.orcamentoId.trim() || null,
        taxaConsultoria: form.taxaConsultoria ? Number(form.taxaConsultoria) : 0,
        notas: form.notas.trim() || null,
      };

      const resp = await fetch("/api/consultorias", {
        method: editandoId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          editandoId
            ? {
                id: editandoId,
                clienteId: payload.clienteId,
                clienteNome: payload.clienteNome,
                dataHora: payload.dataHora,
                lembrete: payload.lembrete,
                destino: payload.destino,
                quantidadePessoas: payload.quantidadePessoas,
                orcamentoId: payload.orcamentoId,
                taxaConsultoria: payload.taxaConsultoria,
                notas: payload.notas,
              }
            : payload
        ),
      });

      if (!resp.ok) {
        throw new Error(await resp.text());
      }

      setMessage(editandoId ? "Consultoria atualizada com sucesso." : "Consultoria agendada com sucesso.");
      setForm({ ...initialFormState });
      setEditandoId(null);
      setMostrarFormulario(false);
      fetchConsultas();
    } catch (err: any) {
      console.error("Falha ao agendar consultoria", err);
      setError(err?.message ?? "Não foi possível agendar a consultoria.");
    } finally {
      setSubmitting(false);
    }
  };

  const salvarInteracao = async () => {
    if (!interacaoModal) return;
    const texto = interacaoTexto.trim();
    if (!texto) {
      setInteracaoErro("Descreva a interação.");
      return;
    }
    setSalvandoInteracao(true);
    setInteracaoErro(null);
    try {
      const dataLabel = formatDateTimeBR(new Date().toISOString());
      const entry = `${dataLabel} — ${texto}`;
      const notasAtual = interacaoModal.notas || "";
      const notas = notasAtual ? `${entry}\n${notasAtual}` : entry;
      const resp = await fetch("/api/consultorias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id: interacaoModal.id, notas }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      setInteracaoModal(null);
      setInteracaoTexto("");
      fetchConsultas();
    } catch (err: any) {
      setInteracaoErro(err?.message || "Não foi possível registrar a interação.");
    } finally {
      setSalvandoInteracao(false);
    }
  };

  const fecharConsultoria = async (consulta: ConsultoriaRegistro) => {
    if (!consulta.id || consulta.fechada) return;
    setFechandoId(consulta.id);
    try {
      const resp = await fetch("/api/consultorias", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: consulta.id,
          fechada: true,
          fechada_em: new Date().toISOString(),
        }),
      });
      if (!resp.ok) throw new Error(await resp.text());
      fetchConsultas();
    } catch (err: any) {
      console.error("Erro ao fechar consultoria", err);
      setError(err?.message || "Não foi possível fechar a consultoria.");
    } finally {
      setFechandoId(null);
    }
  };

  const consultasOrdenadas = useMemo(() => {
    return consultas
      .slice()
      .sort((a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime());
  }, [consultas]);

  const consultasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = termo
      ? consultasOrdenadas
      : consultasOrdenadas.filter((item) => !item.fechada);
    if (!termo) return base;
    return base.filter((item) => {
      const alvo = [
        item.cliente_nome,
        item.destino,
        item.orcamento_id,
        item.notas,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return alvo.includes(termo);
    });
  }, [consultasOrdenadas, busca]);

  const tableRows = useMemo(() => {
    const now = Date.now();
    return consultasFiltradas.map((item) => ({
      ...item,
      localDate: formatDateTimeBR(item.data_hora),
      proximidade: new Date(item.data_hora).getTime() - now >= 0 ? "A caminho" : "Passado",
      statusLabel: item.fechada ? "Fechada" : "Aberta",
    }));
  }, [consultasFiltradas]);
  const abertasCount = useMemo(() => consultas.filter((item) => !item.fechada).length, [consultas]);
  const fechadasCount = useMemo(() => consultas.filter((item) => item.fechada).length, [consultas]);
  const resumoLista = busca.trim()
    ? `${tableRows.length} consultoria(s) encontradas para a busca atual.`
    : `${abertasCount} consultoria(s) aberta(s) e ${fechadasCount} fechada(s) registradas no CRM.`;

  return (
    <AppPrimerProvider>
      <div className="consultoria-page">
        <AppCard
          tone="config"
          className="mb-3 list-toolbar-sticky"
          title={mostrarFormulario ? (editandoId ? "Editar consultoria" : "Nova consultoria") : "Consultoria online"}
          subtitle={
            mostrarFormulario
              ? "Preencha os dados para agendar um atendimento com contexto comercial e lembrete."
              : resumoLista
          }
          actions={
            <div className="vtur-quote-top-actions">
              {mostrarFormulario ? (
                <AppButton type="button" variant="secondary" onClick={cancelarFormulario} disabled={submitting}>
                  Voltar para lista
                </AppButton>
              ) : (
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={abrirFormulario}
                  disabled={mostrarFormulario}
                >
                  Adicionar consultoria
                </AppButton>
              )}
            </div>
          }
        >
          {!mostrarFormulario ? (
            <>
              <div className="vtur-toolbar-grid">
                <AppField
                  label="Buscar consultoria"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Busque por cliente, destino, orçamento ou observações"
                />
              </div>
              <div className="vtur-quote-summary-grid" style={{ marginTop: 16 }}>
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Abertas</span>
                  <strong>{abertasCount}</strong>
                </div>
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Fechadas</span>
                  <strong>{fechadasCount}</strong>
                </div>
                <div className="vtur-quote-summary-item">
                  <span className="vtur-quote-summary-label">Em tela</span>
                  <strong>{tableRows.length}</strong>
                </div>
              </div>
            </>
          ) : null}
        </AppCard>

        {error ? (
          <AlertMessage variant="error" className="mb-3">
            {error}
          </AlertMessage>
        ) : null}
        {message ? (
          <AlertMessage variant="success" className="mb-3">
            {message}
          </AlertMessage>
        ) : null}

        {mostrarFormulario ? (
          <AppCard
            className="mb-3"
            title={editandoId ? "Editar consultoria" : "Nova consultoria"}
            subtitle="Preencha os dados para agendar um atendimento e manter o histórico consultivo organizado."
          >
            <form className="vtur-form-grid" onSubmit={handleSubmit}>
              <div className="vtur-form-grid vtur-form-grid-2">
                <div>
                  <AppField
                    as="select"
                    label="Cliente"
                    value={form.clienteId}
                    onChange={(event) => handleSelectCliente(event.target.value)}
                    options={[
                      { label: "Selecionar (opcional)", value: "" },
                      ...clientes.map((cliente) => ({
                        label: cliente.nome,
                        value: cliente.id,
                      })),
                    ]}
                  />
                  <AppField
                    wrapperClassName="mt-2"
                    label="Nome do cliente"
                    type="text"
                    value={form.clienteNome}
                    placeholder="Nome do cliente"
                    onChange={(event) => handleInputChange("clienteNome", event.target.value)}
                    required
                  />
                </div>
                <AppField
                  label="Data e hora"
                  type="datetime-local"
                  value={form.dataHora}
                  onChange={(event) => handleInputChange("dataHora", event.target.value)}
                  required
                />
              </div>

              <div className="vtur-form-grid vtur-form-grid-3">
                <AppField
                  as="select"
                  label="Lembrete"
                  value={form.lembrete}
                  onChange={(event) => handleInputChange("lembrete", event.target.value)}
                  options={CONSULTORIA_LEMBRETES.map((item) => ({
                    label: item.label,
                    value: item.value,
                  }))}
                />
                <AppField
                  label="Destino"
                  type="text"
                  value={form.destino}
                  onChange={(event) => handleInputChange("destino", event.target.value)}
                  placeholder="Cidade, país ou produto"
                />
                <AppField
                  label="Quantidade de pessoas"
                  type="number"
                  min={1}
                  value={String(form.quantidadePessoas)}
                  onChange={(event) => handleInputChange("quantidadePessoas", event.target.value)}
                />
              </div>

              <div className="vtur-form-grid vtur-form-grid-2">
                <AppField
                  label="Orçamento sugerido"
                  type="text"
                  value={form.orcamentoId}
                  placeholder="Cole o ID do orçamento"
                  onChange={(event) => handleInputChange("orcamentoId", event.target.value)}
                  caption={
                    <a href="/orcamentos/consulta" className="link">
                      Buscar orçamento no sistema
                    </a>
                  }
                />
                <AppField
                  label="Taxa de consultoria (R$)"
                  type="number"
                  min={0}
                  step={0.01}
                  value={String(form.taxaConsultoria)}
                  onChange={(event) => handleInputChange("taxaConsultoria", event.target.value)}
                />
              </div>

              <AppField
                as="textarea"
                label="Notas"
                rows={4}
                value={form.notas}
                onChange={(event) => handleInputChange("notas", event.target.value)}
                placeholder="Observações, links úteis ou detalhes da consultoria"
              />

              <div className="vtur-form-actions">
                <AppButton type="button" variant="secondary" onClick={cancelarFormulario} disabled={submitting}>
                  Cancelar
                </AppButton>
                <AppButton type="submit" variant="primary" disabled={submitting}>
                  {submitting ? "Salvando..." : editandoId ? "Salvar alterações" : "Agendar consultoria"}
                </AppButton>
              </div>
            </form>
          </AppCard>
        ) : null}

        <AppCard
          title="Consultorias agendadas"
          subtitle="Agenda consultiva com status, destino, orçamento vinculado e acesso rápido às interações."
        >
          <DataTable
            headers={
              <tr>
                <th>Cliente</th>
                <th>Data/Hora</th>
                <th>Lembrete</th>
                <th>Destino</th>
                <th>Orçamento</th>
                <th>Status</th>
                <th className="th-actions">Ações</th>
              </tr>
            }
            loading={loadingConsultas}
            empty={!loadingConsultas && tableRows.length === 0}
            emptyMessage={
              <EmptyState
                title={consultas.length === 0 ? "Nenhuma consultoria agendada ainda" : "Nenhuma consultoria encontrada"}
                description={
                  busca.trim()
                    ? "Nenhuma consultoria encontrada para a busca atual."
                    : "Nenhuma consultoria em aberto no momento."
                }
                action={
                  !mostrarFormulario ? (
                    <AppButton type="button" variant="primary" onClick={abrirFormulario}>
                      Adicionar consultoria
                    </AppButton>
                  ) : undefined
                }
              />
            }
            colSpan={7}
            className="table-header-blue table-mobile-cards min-w-[920px]"
          >
            {tableRows.map((consulta) => (
              <tr key={consulta.id}>
                <td data-label="Cliente">{consulta.cliente_nome}</td>
                <td data-label="Data/Hora">
                  {consulta.localDate}
                  <br />
                  <small>{consulta.proximidade}</small>
                  <br />
                  <small>
                    <a className="link" href={`/api/consultorias/ics?id=${consulta.id}`} target="_blank" rel="noreferrer">
                      Adicionar ao calendario
                    </a>
                  </small>
                </td>
                <td data-label="Lembrete">{getConsultoriaLembreteLabel(consulta.lembrete)}</td>
                <td data-label="Destino">{consulta.destino || "-"}</td>
                <td data-label="Orcamento">
                  {consulta.orcamento_id ? (
                    <a href={`/orcamentos/${consulta.orcamento_id}`} className="link">
                      Abrir orçamento
                    </a>
                  ) : (
                    "-"
                  )}
                </td>
                <td data-label="Status">{consulta.statusLabel}</td>
                <td className="th-actions" data-label="Ações">
                  <TableActions
                    actions={[
                      {
                        key: "edit",
                        label: "Editar",
                        onClick: () => abrirEdicao(consulta),
                        icon: <i className="pi pi-pencil" aria-hidden="true" />,
                      },
                      {
                        key: "interacao",
                        label: "Interação",
                        onClick: () => abrirInteracao(consulta),
                        icon: <i className="pi pi-file-edit" aria-hidden="true" />,
                      },
                      {
                        key: "fechar",
                        label: consulta.fechada ? "Fechada" : "Fechar",
                        onClick: () => setConsultaParaFechar(consulta),
                        icon: <i className="pi pi-check-circle" aria-hidden="true" />,
                        disabled: Boolean(consulta.fechada) || fechandoId === consulta.id,
                        variant: "light",
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        </AppCard>

        {interacaoModal ? (
          <Dialog
            title="Registrar interação"
            width="large"
            onClose={() => setInteracaoModal(null)}
            footerButtons={[
              {
                content: "Cancelar",
                buttonType: "default",
                onClick: () => setInteracaoModal(null),
                disabled: salvandoInteracao,
              },
              {
                content: salvandoInteracao ? "Salvando..." : "Salvar interação",
                buttonType: "primary",
                onClick: salvarInteracao,
                disabled: salvandoInteracao,
              },
            ]}
          >
            <div className="vtur-modal-body-stack">
              <AppCard
                tone="info"
                title={interacaoModal.cliente_nome || "Consultoria"}
                subtitle={formatDateTimeBR(interacaoModal.data_hora)}
              >
                <AppField
                  as="textarea"
                  label="Descrição"
                  rows={5}
                  value={interacaoTexto}
                  onChange={(e) => setInteracaoTexto(e.target.value)}
                  placeholder="Descreva a interação realizada"
                />
                {interacaoErro ? (
                  <div style={{ marginTop: 12 }}>
                    <AlertMessage variant="error">{interacaoErro}</AlertMessage>
                  </div>
                ) : null}
              </AppCard>
            </div>
          </Dialog>
        ) : null}

        <ConfirmDialog
          open={Boolean(consultaParaFechar)}
          title="Fechar consultoria"
          message={
            consultaParaFechar
              ? `Fechar a consultoria de ${consultaParaFechar.cliente_nome}?`
              : "Fechar esta consultoria?"
          }
          confirmLabel={consultaParaFechar && fechandoId === consultaParaFechar.id ? "Fechando..." : "Fechar"}
          confirmDisabled={Boolean(consultaParaFechar && fechandoId === consultaParaFechar.id)}
          onCancel={() => setConsultaParaFechar(null)}
          onConfirm={async () => {
            if (!consultaParaFechar) return;
            const alvo = consultaParaFechar;
            setConsultaParaFechar(null);
            await fecharConsultoria(alvo);
          }}
        />
      </div>
    </AppPrimerProvider>
  );
}
