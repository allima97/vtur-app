import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import {
  CONSULTORIA_LEMBRETES,
  getConsultoriaLembreteLabel,
} from "../../lib/consultoriaLembretes";
import { formatDateTimeBR } from "../../lib/format";
import TableActions from "../ui/TableActions";

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
    const confirmar = window.confirm(`Fechar a consultoria de ${consulta.cliente_nome}?`);
    if (!confirmar) return;
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

  return (
    <div className="consultoria-page">
      <div className="card-base mb-3 list-toolbar-sticky">
        <div
          className="form-row mobile-stack"
          style={{ gap: 12, gridTemplateColumns: "minmax(240px, 1fr) auto", alignItems: "flex-end" }}
        >
          <div className="form-group" style={{ flex: "1 1 320px" }}>
            <label className="form-label">Buscar consultoria</label>
            <input
              className="form-input"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Busque por cliente, destino, orçamento ou observações"
            />
          </div>
          <div className="form-group" style={{ alignItems: "flex-end" }}>
            <button
              type="button"
              className="btn btn-primary w-full sm:w-auto"
              onClick={abrirFormulario}
              disabled={mostrarFormulario}
            >
              Adicionar nova consultoria
            </button>
          </div>
        </div>
      </div>

      {mostrarFormulario && (
        <div className="card-base card-blue mb-3" id="consultoria-form">
          <div className="card-base-header">
            <div>
              <h3>{editandoId ? "Editar consultoria" : "Nova consultoria"}</h3>
              <p>Preencha os dados para agendar um atendimento.</p>
            </div>
          </div>
          <form className="grid gap-4 lg:grid-cols-2" onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Cliente</label>
              <select
                className="form-input"
                value={form.clienteId}
                onChange={(event) => handleSelectCliente(event.target.value)}
              >
                <option value="">Selecionar (opcional)</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nome}
                  </option>
                ))}
              </select>
              <input
                className="form-input"
                type="text"
                value={form.clienteNome}
                placeholder="Nome do cliente"
                onChange={(event) => handleInputChange("clienteNome", event.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Data e hora</label>
              <input
                className="form-input"
                type="datetime-local"
                value={form.dataHora}
                onChange={(event) => handleInputChange("dataHora", event.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Lembrete</label>
              <select
                className="form-input"
                value={form.lembrete}
                onChange={(event) => handleInputChange("lembrete", event.target.value)}
              >
                {CONSULTORIA_LEMBRETES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Destino</label>
              <input
                className="form-input"
                type="text"
                value={form.destino}
                onChange={(ev) => handleInputChange("destino", ev.target.value)}
                placeholder="Cidade, país ou produto"
              />
            </div>
            <div className="form-group">
              <label>Quantidade de pessoas</label>
              <input
                className="form-input"
                type="number"
                min={1}
                value={form.quantidadePessoas}
                onChange={(event) => handleInputChange("quantidadePessoas", event.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Orçamento sugerido</label>
              <input
                type="text"
                className="form-input"
                value={form.orcamentoId}
                placeholder="Cole o ID do orçamento"
                onChange={(event) => handleInputChange("orcamentoId", event.target.value)}
              />
              <small style={{ display: "block", marginTop: 4 }}>
                <a href="/orcamentos/consulta" className="link">
                  Buscar orçamento no sistema
                </a>
              </small>
            </div>
            <div className="form-group">
              <label>Taxa de consultoria (R$)</label>
              <input
                className="form-input"
                type="number"
                min={0}
                step={0.01}
                value={form.taxaConsultoria}
                onChange={(event) => handleInputChange("taxaConsultoria", event.target.value)}
              />
            </div>
            <div className="form-group md:col-span-2">
              <label>Notas</label>
              <textarea
                className="form-input"
                rows={3}
                value={form.notas}
                onChange={(event) => handleInputChange("notas", event.target.value)}
                placeholder="Observações, links úteis ou detalhes da consultoria"
              />
            </div>
            {error && (
              <div className="alert alert-danger md:col-span-2">
                {error}
              </div>
            )}
            {message && (
              <div className="alert alert-success md:col-span-2">
                {message}
              </div>
            )}
            <div className="mobile-stack-buttons" style={{ marginTop: 8, justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-light" onClick={cancelarFormulario} disabled={submitting}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Salvando..." : editandoId ? "Salvar alterações" : "Agendar consultoria"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card-base">
        <section>
          <h3>Consultorias agendadas</h3>
          {loadingConsultas && <p>Carregando...</p>}
          {!loadingConsultas && consultas.length === 0 && <p>Nenhuma consultoria agendada ainda.</p>}
          {!loadingConsultas && consultas.length > 0 && tableRows.length === 0 && (
            <p>
              {busca.trim()
                ? "Nenhuma consultoria encontrada para a busca atual."
                : "Nenhuma consultoria em aberto no momento."}
            </p>
          )}
          {!loadingConsultas && tableRows.length > 0 && (
            <div className="table-container overflow-x-auto">
              <table className="table-default table-header-blue table-mobile-cards min-w-[920px]">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Data/Hora</th>
                    <th>Lembrete</th>
                    <th>Destino</th>
                    <th>Orçamento</th>
                    <th>Status</th>
                    <th className="th-actions">Ações</th>
                  </tr>
                </thead>
                <tbody>
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
                              icon: "✏️",
                            },
                            {
                              key: "interacao",
                              label: "Interação",
                              onClick: () => abrirInteracao(consulta),
                              icon: "📝",
                            },
                            {
                              key: "fechar",
                              label: consulta.fechada ? "Fechada" : "Fechar",
                              onClick: () => fecharConsultoria(consulta),
                              icon: "✅",
                              disabled: Boolean(consulta.fechada) || fechandoId === consulta.id,
                              variant: "light",
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
        </section>
      </div>

      {interacaoModal && (
        <div className="modal-backdrop">
          <div className="modal-panel" style={{ maxWidth: 640, width: "92vw" }}>
            <div className="modal-header">
              <div className="modal-title">Registrar interação</div>
              <button className="btn-ghost" onClick={() => setInteracaoModal(null)}>
                Fechar
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 8, fontWeight: 700 }}>
                {interacaoModal.cliente_nome || "Consultoria"} •{" "}
                {formatDateTimeBR(interacaoModal.data_hora)}
              </div>
              <div className="form-group">
                <label className="form-label">Descrição</label>
                <textarea
                  className="form-input"
                  rows={4}
                  value={interacaoTexto}
                  onChange={(e) => setInteracaoTexto(e.target.value)}
                  placeholder="Descreva a interação realizada"
                />
              </div>
              {interacaoErro && (
                <div className="alert alert-danger" style={{ marginTop: 10 }}>
                  {interacaoErro}
                </div>
              )}
              <div className="mobile-stack-buttons" style={{ marginTop: 12 }}>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={salvarInteracao}
                  disabled={salvandoInteracao}
                >
                  {salvandoInteracao ? "Salvando..." : "Salvar interação"}
                </button>
                <button
                  className="btn btn-light"
                  type="button"
                  onClick={() => setInteracaoModal(null)}
                  disabled={salvandoInteracao}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
