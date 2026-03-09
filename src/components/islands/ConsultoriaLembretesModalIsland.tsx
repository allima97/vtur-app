import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import {
  getConsultoriaLembreteLabel,
  getConsultoriaLembreteMinutes,
} from "../../lib/consultoriaLembretes";
import { formatDateTimeBR } from "../../lib/format";

type ConsultoriaRow = {
  id: string;
  cliente_nome: string;
  data_hora: string;
  lembrete: string;
  destino: string | null;
  orcamento_id: string | null;
};

type ConsultoriaReminder = {
  id: string;
  clienteNome: string;
  dataHoraLocal: string;
  lembreteLabel: string;
  lembreteAtLocal: string;
  consultaAt: number;
  lembreteAt: number;
  destino: string | null;
  orcamentoId: string | null;
  storageKey: string;
};

const STORAGE_KEY = "consultoria_lembretes_vistos";
const BADGE_KEY = "consultoria_lembretes_badge";
const REFRESH_MS = 5 * 60 * 1000;
const BADGE_WINDOW_MS = 24 * 60 * 60 * 1000;

function formatarTempoRestante(ms: number) {
  if (ms <= 0) return "Agora";
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 60) return `Em ${totalMin} min`;
  const horas = Math.ceil(totalMin / 60);
  if (horas < 24) return `Em ${horas}h`;
  const dias = Math.ceil(horas / 24);
  return `Em ${dias}d`;
}

function formatarDataHoraLocal(value: string | number | Date) {
  if (value instanceof Date) {
    return formatDateTimeBR(value.toISOString());
  }
  return formatDateTimeBR(String(value));
}

function readLembretesVistos() {
  if (typeof window === "undefined") return {} as Record<string, number>;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

function limparLembretesVistos(map: Record<string, number>, agora: number) {
  const limite = agora - 1000 * 60 * 60 * 24 * 30;
  const cleaned: Record<string, number> = {};
  Object.entries(map).forEach(([key, ts]) => {
    if (typeof ts === "number" && ts >= limite) cleaned[key] = ts;
  });
  return cleaned;
}

function saveLembretesVistos(map: Record<string, number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // sem storage disponível
  }
}

export default function ConsultoriaLembretesModalIsland() {
  const { can, ready, loading } = usePermissoesStore();
  const podeVerConsultoria = can("Consultoria Online") || can("Consultoria");
  const [consultorias, setConsultorias] = useState<ConsultoriaRow[]>([]);
  const [agora, setAgora] = useState(() => Date.now());
  const [modalOpen, setModalOpen] = useState(false);
  const [lembretesModal, setLembretesModal] = useState<ConsultoriaReminder[]>([]);
  const [lembretesVistos, setLembretesVistos] = useState<Record<string, number>>(() => {
    const base = readLembretesVistos();
    const cleaned = limparLembretesVistos(base, Date.now());
    if (typeof window !== "undefined") saveLembretesVistos(cleaned);
    return cleaned;
  });

  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!ready || loading) return;
    if (!podeVerConsultoria) {
      setConsultorias([]);
      return;
    }

    let active = true;
    const fetchConsultorias = async () => {
      try {
        const agoraIso = new Date().toISOString();
        const limite = new Date();
        limite.setDate(limite.getDate() + 30);
        const { data, error } = await supabase
          .from("consultorias_online")
          .select("id, cliente_nome, data_hora, lembrete, destino, orcamento_id")
          .eq("fechada", false)
          .gte("data_hora", agoraIso)
          .lte("data_hora", limite.toISOString())
          .order("data_hora", { ascending: true })
          .limit(50);
        if (error) throw error;
        if (active) setConsultorias((data || []) as ConsultoriaRow[]);
      } catch (err) {
        console.warn("Nao foi possivel carregar lembretes de consultoria:", err);
        if (active) setConsultorias([]);
      }
    };

    fetchConsultorias();
    const refreshId = setInterval(fetchConsultorias, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(refreshId);
    };
  }, [podeVerConsultoria, ready, loading]);

  const reminders = useMemo<ConsultoriaReminder[]>(() => {
    if (!consultorias.length) return [];
    const now = agora;
    return consultorias
      .map((consulta) => {
        const consultaAt = new Date(consulta.data_hora).getTime();
        if (!Number.isFinite(consultaAt)) return null;
        const minutos = getConsultoriaLembreteMinutes(consulta.lembrete);
        if (!minutos) return null;
        const lembreteAt = consultaAt - minutos * 60 * 1000;
        return {
          id: consulta.id,
          clienteNome: consulta.cliente_nome,
          dataHoraLocal: formatarDataHoraLocal(consulta.data_hora),
          lembreteLabel: getConsultoriaLembreteLabel(consulta.lembrete),
          lembreteAtLocal: formatarDataHoraLocal(lembreteAt),
          consultaAt,
          lembreteAt,
          destino: consulta.destino,
          orcamentoId: consulta.orcamento_id,
          storageKey: `${consulta.id}-${consulta.lembrete}-${lembreteAt}`,
        } as ConsultoriaReminder;
      })
      .filter((item): item is ConsultoriaReminder => Boolean(item))
      .filter((item) => item.consultaAt > now)
      .sort((a, b) => a.lembreteAt - b.lembreteAt);
  }, [consultorias, agora]);

  const badgeCount = useMemo(() => {
    if (!podeVerConsultoria) return 0;
    const limite = agora + BADGE_WINDOW_MS;
    return reminders.filter((item) => item.lembreteAt <= limite && item.consultaAt > agora).length;
  }, [reminders, agora, podeVerConsultoria]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BADGE_KEY, String(badgeCount));
    window.dispatchEvent(
      new CustomEvent("consultoria-lembretes-badge", {
        detail: { count: badgeCount },
      })
    );
  }, [badgeCount]);

  const lembretesPendentes = useMemo(() => {
    if (!reminders.length) return [];
    return reminders.filter((item) => {
      if (item.lembreteAt > agora || item.consultaAt <= agora) return false;
      return !lembretesVistos[item.storageKey];
    });
  }, [reminders, lembretesVistos, agora]);

  useEffect(() => {
    if (modalOpen) return;
    if (!lembretesPendentes.length) return;
    setLembretesModal(lembretesPendentes);
    setModalOpen(true);
  }, [lembretesPendentes, modalOpen]);

  const fecharModal = () => {
    if (lembretesModal.length) {
      const agoraLocal = Date.now();
      setLembretesVistos((prev) => {
        const atualizado = { ...prev };
        lembretesModal.forEach((item) => {
          atualizado[item.storageKey] = agoraLocal;
        });
        const limpo = limparLembretesVistos(atualizado, agoraLocal);
        saveLembretesVistos(limpo);
        return limpo;
      });
    }
    setLembretesModal([]);
    setModalOpen(false);
  };

  if (!modalOpen || lembretesModal.length === 0) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel" style={{ maxWidth: 560, width: "95vw", background: "#f8fafc" }}>
        <div className="modal-header">
          <div className="modal-title" style={{ color: "#b45309", fontWeight: 800 }}>
            Lembrete de consultoria
          </div>
          <button className="btn-ghost" onClick={fecharModal}>
            ✖
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: "grid", gap: 12 }}>
            {lembretesModal.map((item) => (
              <div key={item.storageKey} className="card-base" style={{ padding: 12 }}>
                <div style={{ fontWeight: 700 }}>{item.clienteNome}</div>
                <div>
                  <strong>Agendamento:</strong> {item.dataHoraLocal}
                </div>
                <div>
                  <strong>Lembrete:</strong> {item.lembreteLabel} ({item.lembreteAtLocal})
                </div>
                <div>
                  <strong>Destino:</strong> {item.destino || "-"}
                </div>
                <div>
                  <strong>Status:</strong> {formatarTempoRestante(item.lembreteAt - agora)}
                </div>
                <div>
                  <a className="link" href={`/api/consultorias/ics?id=${item.id}`} target="_blank" rel="noreferrer">
                    Adicionar ao calendario
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer mobile-stack-buttons">
          <a className="btn btn-light w-full sm:w-auto" href="/consultoria-online">
            Abrir consultorias
          </a>
          <button className="btn btn-primary w-full sm:w-auto" onClick={fecharModal}>
            Ok
          </button>
        </div>
      </div>
    </div>
  );
}
