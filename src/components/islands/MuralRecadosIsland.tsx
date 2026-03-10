import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import AlertMessage from "../ui/AlertMessage";
import ConfirmDialog from "../ui/ConfirmDialog";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

type EmpresaOption = { id: string; nome_fantasia: string; status: string };

type UserMini = {
  id: string;
  nome_completo: string | null;
  email: string | null;
  user_types?: { name: string | null } | null;
};

type RecadoArquivoRow = {
  id: string;
  company_id: string;
  recado_id: string;
  uploaded_by: string | null;
  file_name: string;
  storage_bucket: string | null;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

type RecadoRow = {
  id: string;
  company_id: string;
  sender_id: string;
  receiver_id: string | null;
  assunto: string | null;
  conteudo: string;
  created_at: string;
  sender?: UserMini | null;
  receiver?: UserMini | null;
  sender_deleted: boolean;
  receiver_deleted: boolean;
  leituras?: RecadoLeituraRow[] | null;
  arquivos?: RecadoArquivoRow[] | null;
};

type Thread = {
  id: string;
  name: string;
  type: "company" | "user";
  subtitle: string;
  lastMessage?: string;
  lastAt?: string;
  unreadCount: number;
  isOnline?: boolean;
};

type RecadoLeituraRow = {
  read_at: string;
  user_id: string;
  user?: UserMini | null;
};

function formatarDataHora(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatThreadTime(value?: string | null) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  return sameDay
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function getNomeExibicao(u?: UserMini | null) {
  const nome = String(u?.nome_completo || "").trim();
  if (nome) return nome;
  const email = String(u?.email || "").trim();
  if (email) return email;
  return "Usuário";
}

function normalizeSortKey(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getInitials(value?: string | null) {
  const cleaned = String(value || "").trim();
  if (!cleaned) return "U";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  const initials = `${first}${last}`.toUpperCase();
  return initials || cleaned.slice(0, 2).toUpperCase();
}

const formatBadge = (count: number) => (count > 99 ? "99+" : String(count));
const STORAGE_BUCKET = "mural-recados";
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_UPLOAD_FILES = 5;

function sanitizeFileName(name: string) {
  return String(name || "arquivo")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .slice(0, 120);
}

function isImageMime(mime?: string | null) {
  return Boolean(mime && String(mime).toLowerCase().startsWith("image/"));
}

function formatBytes(bytes?: number | null) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let unit = 0;
  let n = value;
  while (n >= 1024 && unit < units.length - 1) {
    n /= 1024;
    unit += 1;
  }
  const decimals = unit === 0 ? 0 : unit === 1 ? 0 : 1;
  return `${n.toFixed(decimals)} ${units[unit]}`;
}

function buildRecadoPreview(recado?: RecadoRow | null) {
  if (!recado) return "";
  const assunto = String(recado.assunto || "").trim();
  if (assunto) return assunto;
  const texto = String(recado.conteudo || "").trim();
  if (texto) return texto.slice(0, 40);
  const arquivos = (recado.arquivos || []) as RecadoArquivoRow[];
  if (arquivos.length > 0) {
    const first = arquivos[0];
    const base = isImageMime(first.mime_type) ? "📷 Imagem" : `📎 ${first.file_name || "Arquivo"}`;
    return arquivos.length > 1 ? `${base} (+${arquivos.length - 1})` : base;
  }
  return "";
}

async function fetchMuralBootstrap(companyId?: string) {
  const qs = new URLSearchParams();
  if (companyId) qs.set("company_id", companyId);
  const resp = await fetch(`/api/v1/mural/bootstrap?${qs.toString()}`);
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  return resp.json();
}

async function fetchMuralCompany(companyId: string) {
  const qs = new URLSearchParams();
  qs.set("company_id", companyId);
  const resp = await fetch(`/api/v1/mural/company?${qs.toString()}`);
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  return resp.json();
}

async function fetchMuralRecados(companyId: string) {
  const qs = new URLSearchParams();
  qs.set("company_id", companyId);
  const resp = await fetch(`/api/v1/mural/recados?${qs.toString()}`);
  if (!resp.ok) {
    throw new Error(await resp.text());
  }
  return resp.json();
}

export default function MuralRecadosIsland() {
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [userId, setUserId] = useState<string | null>(null);
  const [userCompanyId, setUserCompanyId] = useState<string | null>(null);
  const [userTypeName, setUserTypeName] = useState<string>("");

  const isMaster = /MASTER/i.test(userTypeName);

  const [empresas, setEmpresas] = useState<EmpresaOption[]>([]);
  const [empresaSelecionada, setEmpresaSelecionada] = useState<string>("");

  const [usuariosEmpresa, setUsuariosEmpresa] = useState<UserMini[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(() => new Set());

  const [threadQuery, setThreadQuery] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [anexos, setAnexos] = useState<File[]>([]);
  const [supportsAttachments, setSupportsAttachments] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState("company");
  const [isMobile, setIsMobile] = useState(false);
  const [mobileScreen, setMobileScreen] = useState<"list" | "chat">("list");
  const [mobileTab, setMobileTab] = useState<"chats" | "contacts">("chats");

  const [recados, setRecados] = useState<RecadoRow[]>([]);
  const [recadosLoading, setRecadosLoading] = useState(false);

  const [marcandoLeituraId, setMarcandoLeituraId] = useState<string | null>(null);

  const [confirmDeleteRecado, setConfirmDeleteRecado] = useState<{
    open: boolean;
    recado: RecadoRow | null;
    deleteForAll: boolean;
  }>({ open: false, recado: null, deleteForAll: false });

  const reloadTimerRef = useRef<number | null>(null);
  const lastOpenedThreadRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const companyContextId = empresaSelecionada || userCompanyId || "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 1024px)");
    const apply = () => {
      const nextIsMobile = Boolean(mq.matches);
      setIsMobile(nextIsMobile);
      setMobileScreen(nextIsMobile ? "list" : "chat");
    };
    apply();
    const listener = () => apply();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    }
    mq.addListener(listener);
    return () => mq.removeListener(listener);
  }, []);

  const removeRecadoFromState = (recadoId: string) => {
    setRecados((prev) => prev.filter((recado) => recado.id !== recadoId));
  };

  const applyVisibilityFilter = useCallback(
    (rows: RecadoRow[], forceUserId?: string | null) => {
      const targetUserId = forceUserId ?? userId;
      if (!targetUserId) return rows;
      return rows.filter((recado) => {
        if (recado.sender_id === targetUserId && recado.sender_deleted) return false;
        if (recado.receiver_id && recado.receiver_id === targetUserId && recado.receiver_deleted)
          return false;
        return true;
      });
    },
    [userId]
  );

  const limparFeedback = () => {
    setErro(null);
    setFeedback(null);
  };

  const scheduleReloadRecados = () => {
    if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = window.setTimeout(() => {
      loadRecados();
    }, 350);
  };

  async function loadPerfilAndScope() {
    setLoading(true);
    setErro(null);
    try {
      const payload = await fetchMuralBootstrap();
      const resolvedUserId = payload?.userId ? String(payload.userId) : null;
      const resolvedCompanyId = payload?.companyId ? String(payload.companyId) : null;
      const resolvedType = String(payload?.userTypeName || "");

      setUserId(resolvedUserId);
      setUserCompanyId(resolvedCompanyId);
      setUserTypeName(resolvedType);
      setEmpresas((payload?.empresas || []) as EmpresaOption[]);
      setEmpresaSelecionada((prev) => prev || resolvedCompanyId || "");
      setUsuariosEmpresa((payload?.usuariosEmpresa || []) as UserMini[]);
      setSupportsAttachments(payload?.supportsAttachments !== false);

      const rows = (payload?.recados || []) as RecadoRow[];
      setRecados(applyVisibilityFilter(rows, resolvedUserId));
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao carregar perfil.");
    } finally {
      setLoading(false);
    }
  }

  async function loadCompanyData(companyId: string) {
    if (!companyId) {
      setUsuariosEmpresa([]);
      setRecados([]);
      return;
    }
    setRecadosLoading(true);
    try {
      const payload = await fetchMuralCompany(companyId);
      setUsuariosEmpresa((payload?.usuariosEmpresa || []) as UserMini[]);
      setSupportsAttachments(payload?.supportsAttachments !== false);

      const rows = (payload?.recados || []) as RecadoRow[];
      setRecados(applyVisibilityFilter(rows));
    } catch (e: any) {
      console.error("Falha ao carregar dados do mural", e);
      setRecados([]);
    } finally {
      setRecadosLoading(false);
    }
  }

  async function loadRecados() {
    const companyId = companyContextId;
    if (!companyId) {
      setRecados([]);
      return;
    }
    setRecadosLoading(true);
    try {
      const payload = await fetchMuralRecados(companyId);
      const rows = (payload?.recados || []) as RecadoRow[];
      setSupportsAttachments(payload?.supportsAttachments !== false);
      setRecados(applyVisibilityFilter(rows));
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Erro ao carregar recados.");
    } finally {
      setRecadosLoading(false);
    }
  }

  useEffect(() => {
    loadPerfilAndScope();
    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!companyContextId) return;
    loadCompanyData(companyContextId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyContextId]);

  useEffect(() => {
    const companyId = companyContextId;
    if (!companyId || !userId) return;

    const channel = supabase
      .channel(`mural-recados-${companyId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mural_recados", filter: `company_id=eq.${companyId}` },
        () => scheduleReloadRecados()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "mural_recados", filter: `company_id=eq.${companyId}` },
        () => scheduleReloadRecados()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "mural_recados_arquivos", filter: `company_id=eq.${companyId}` },
        () => scheduleReloadRecados()
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "mural_recados_arquivos", filter: `company_id=eq.${companyId}` },
        () => scheduleReloadRecados()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mural_recados_leituras",
        },
        () => scheduleReloadRecados()
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "mural_recados_leituras",
        },
        () => scheduleReloadRecados()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyContextId, userId]);

  useEffect(() => {
    const companyId = companyContextId;
    if (!companyId || !userId) {
      setOnlineUserIds(new Set());
      return;
    }

    let cancelled = false;
    const channel: any = supabase.channel(`mural-presence-${companyId}`, {
      config: { presence: { key: userId } },
    });

    const syncPresence = () => {
      if (cancelled) return;
      const state = (channel.presenceState && channel.presenceState()) || {};
      const ids = new Set<string>();
      Object.keys(state || {}).forEach((key) => {
        if (key) ids.add(key);
      });
      setOnlineUserIds(ids);
    };

    channel
      .on("presence", { event: "sync" }, syncPresence)
      .on("presence", { event: "join" }, syncPresence)
      .on("presence", { event: "leave" }, syncPresence)
      .subscribe(async (status: string) => {
        if (status !== "SUBSCRIBED") return;
        try {
          await channel.track({ online_at: new Date().toISOString() });
        } catch (e) {
          console.warn("Falha ao registrar presença:", e);
        }
      });

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [companyContextId, userId]);

  const threads = useMemo(() => {
    const result: Thread[] = [];
    const companyRecados = recados.filter((recado) => !recado.receiver_id);
    const companyUnread = companyRecados.filter(
      (recado) =>
        userId &&
        Boolean(recado.leituras?.some((entry) => entry.user_id === userId)) === false
    );
    const sortedCompany = [...companyRecados].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    const lastCompany = sortedCompany[0];
    result.push({
      id: "company",
      name: "Todos da empresa",
      type: "company",
      subtitle: buildRecadoPreview(lastCompany) || "Sem mensagens para toda a empresa",
      lastMessage: lastCompany?.conteudo || buildRecadoPreview(lastCompany),
      lastAt: lastCompany?.created_at,
      unreadCount: companyUnread.length,
    });

    const pessoas = usuariosEmpresa
      .filter((u) => u.id && u.id !== userId)
      .sort((a, b) =>
        normalizeSortKey(getNomeExibicao(a)).localeCompare(
          normalizeSortKey(getNomeExibicao(b)),
          "pt-BR",
          { sensitivity: "base" }
        )
      );
    const privateThreads = pessoas.map((pessoa) => {
      const relevant = recados.filter((recado) => {
        const isToPessoa = recado.receiver_id === pessoa.id && recado.sender_id === userId;
        const isFromPessoa = recado.sender_id === pessoa.id && recado.receiver_id === userId;
        return Boolean(isToPessoa || isFromPessoa);
      });
      const sorted = [...relevant].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const last = sorted[0];
      const unread = relevant.filter(
        (recado) =>
          recado.receiver_id === userId &&
          Boolean(recado.leituras?.some((entry) => entry.user_id === userId)) === false
      ).length;
      return {
        id: pessoa.id,
        name: getNomeExibicao(pessoa),
        type: "user" as const,
        subtitle: buildRecadoPreview(last) || "Sem mensagens ainda",
        lastMessage: last?.conteudo || buildRecadoPreview(last),
        lastAt: last?.created_at,
        unreadCount: unread,
        isOnline: onlineUserIds.has(pessoa.id),
      };
    });

    return [...result, ...privateThreads];
  }, [recados, usuariosEmpresa, userId, onlineUserIds]);

  const currentThread = threads.find((thread) => thread.id === selectedThreadId) ?? threads[0] ?? null;

  const orderedThreads = useMemo(() => {
    const company = threads.find((t) => t.id === "company");
    const others = threads.filter((t) => t.id !== "company");
    const byLastAtDesc = (a: Thread, b: Thread) => {
      const ta = a.lastAt ? new Date(a.lastAt).getTime() : 0;
      const tb = b.lastAt ? new Date(b.lastAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return normalizeSortKey(a.name).localeCompare(normalizeSortKey(b.name), "pt-BR", { sensitivity: "base" });
    };
    const sorted = others.slice().sort(byLastAtDesc);
    return company ? [company, ...sorted] : sorted;
  }, [threads]);

  const orderedFilteredThreads = useMemo(() => {
    const query = normalizeSortKey(threadQuery);
    if (!query) return orderedThreads;
    return orderedThreads.filter((thread) => {
      const haystack = `${thread.name} ${thread.subtitle}`.trim();
      return normalizeSortKey(haystack).includes(query);
    });
  }, [orderedThreads, threadQuery]);

  const orderedContacts = useMemo(() => {
    const people = usuariosEmpresa.filter((u) => u.id && u.id !== userId);
    const query = normalizeSortKey(threadQuery);
    const filtered = query
      ? people.filter((u) => normalizeSortKey(getNomeExibicao(u)).includes(query))
      : people;
    return filtered.sort((a, b) =>
      normalizeSortKey(getNomeExibicao(a)).localeCompare(normalizeSortKey(getNomeExibicao(b)), "pt-BR", {
        sensitivity: "base",
      })
    );
  }, [usuariosEmpresa, userId, threadQuery]);

  const renderThreadList = (onSelect?: () => void) => (
    <div className="mural-whatsapp-thread-list">
      {orderedFilteredThreads.length === 0 ? (
        <div className="mural-thread-empty">Nenhum contato encontrado.</div>
      ) : (
        orderedFilteredThreads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            className={`mural-whatsapp-thread ${currentThread?.id === thread.id ? "active" : ""}`}
            onClick={() => {
              setSelectedThreadId(thread.id);
              if (onSelect) onSelect();
            }}
          >
            <span
              className={
                thread.type === "company"
                  ? "mural-thread-avatar mural-thread-avatar--company"
                  : "mural-thread-avatar"
              }
              aria-hidden="true"
            >
              <span className="mural-thread-avatar-text">{getInitials(thread.name)}</span>
              {thread.type === "user" && (
                <span
                  className={`mural-thread-avatar-dot ${thread.isOnline ? "mural-thread-avatar-dot--online" : "mural-thread-avatar-dot--offline"}`}
                  aria-hidden="true"
                />
              )}
            </span>
            <span className="mural-thread-content">
              <span className="mural-whatsapp-thread-line">
                <span className="mural-whatsapp-thread-name">{thread.name}</span>
                {thread.lastAt ? (
                  <span className="mural-whatsapp-thread-time">{formatThreadTime(thread.lastAt)}</span>
                ) : null}
              </span>
              <span className="mural-whatsapp-thread-subtitle">{thread.subtitle}</span>
            </span>
            {thread.unreadCount > 0 ? (
              <span className="mural-thread-unread" aria-label={`${thread.unreadCount} não lidas`}>
                {formatBadge(thread.unreadCount)}
              </span>
            ) : null}
          </button>
        ))
      )}
    </div>
  );

  const renderContactsList = (onSelect?: () => void) => (
    <div className="mural-whatsapp-thread-list">
      {orderedContacts.length === 0 ? (
        <div className="mural-thread-empty">Nenhum contato encontrado.</div>
      ) : (
        orderedContacts.map((u) => {
          const id = String(u.id);
          const name = getNomeExibicao(u);
          const isOnline = onlineUserIds.has(id);
          return (
            <button
              key={id}
              type="button"
              className={`mural-whatsapp-thread ${currentThread?.id === id ? "active" : ""}`}
              onClick={() => {
                setSelectedThreadId(id);
                if (onSelect) onSelect();
              }}
            >
              <span className="mural-thread-avatar" aria-hidden="true">
                <span className="mural-thread-avatar-text">{getInitials(name)}</span>
                <span
                  className={`mural-thread-avatar-dot ${isOnline ? "mural-thread-avatar-dot--online" : "mural-thread-avatar-dot--offline"}`}
                  aria-hidden="true"
                />
              </span>
              <span className="mural-thread-content">
                <span className="mural-whatsapp-thread-line">
                  <span className="mural-whatsapp-thread-name">{name}</span>
                </span>
                <span className="mural-whatsapp-thread-subtitle">{isOnline ? "Online" : "Offline"}</span>
              </span>
            </button>
          );
        })
      )}
    </div>
  );

  useEffect(() => {
    if (!threads.length) return;
    if (!threads.some((thread) => thread.id === selectedThreadId)) {
      setSelectedThreadId(threads[0].id);
    }
  }, [threads, selectedThreadId]);

  useEffect(() => {
    if (!currentThread) return;
    setFormOpen((prev) => (prev ? prev : true));
  }, [currentThread?.id]);

  const conversation = useMemo(() => {
    if (!selectedThreadId) return [];
    return recados
      .filter((recado) => {
        if (selectedThreadId === "company") {
          return !recado.receiver_id;
        }
        return (
          (recado.receiver_id === selectedThreadId && recado.sender_id === userId) ||
          (recado.sender_id === selectedThreadId && recado.receiver_id === userId)
        );
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [recados, selectedThreadId, userId]);

  // Marcar como lido automaticamente ao abrir thread
  useEffect(() => {
    if (!userId || !conversation.length || !selectedThreadId) return;
    
    // Evita marcar novamente se for a mesma thread
    if (lastOpenedThreadRef.current === selectedThreadId) return;
    lastOpenedThreadRef.current = selectedThreadId;

    const unreadIds = conversation
      .filter(
        (recado) =>
          recado.receiver_id === userId &&
          Boolean(recado.leituras?.some((entry) => entry.user_id === userId)) === false
      )
      .map((recado) => recado.id);
    
    // Para thread de empresa, marcar TODOS os recados não lidos
    const companyUnreadIds = selectedThreadId === "company"
      ? conversation
          .filter(
            (recado) =>
              !recado.receiver_id &&
              Boolean(recado.leituras?.some((entry) => entry.user_id === userId)) === false
          )
          .map((recado) => recado.id)
      : [];

    const allUnreadIds = [...unreadIds, ...companyUnreadIds];
    
    if (!allUnreadIds.length) return;

    let cancelled = false;
    (async () => {
      try {
        await Promise.all(
          allUnreadIds.map((recadoId) =>
            supabase.rpc("mural_recados_mark_read", { target_id: recadoId }).then((result) => {
              if (result.error) {
                throw result.error;
              }
            })
          )
        );
        // Recarregar para atualizar contadores
        if (!cancelled) {
          scheduleReloadRecados();
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Falha ao marcar recados como lidos:", error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId, conversation.length, userId]);

  const clearMessageFields = () => {
    setConteudo("");
    setAnexos([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addAnexos = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files);
    setAnexos((prev) => {
      const merged = [...prev];
      for (const file of incoming) {
        if (!file) continue;
        if (file.size > MAX_UPLOAD_BYTES) continue;
        const key = `${file.name}|${file.size}|${file.lastModified}`;
        const exists = merged.some((f) => `${f.name}|${f.size}|${f.lastModified}` === key);
        if (exists) continue;
        merged.push(file);
      }
      return merged.slice(0, MAX_UPLOAD_FILES);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAnexoAt = (idx: number) => {
    setAnexos((prev) => prev.filter((_, i) => i !== idx));
  };

  const toggleFormOpen = () => {
    setFormOpen((prev) => {
      if (prev) {
        clearMessageFields();
        return false;
      }
      clearMessageFields();
      return true;
    });
  };

  const handleEnviar = async (event: React.FormEvent) => {
    event.preventDefault();
    limparFeedback();

    const companyId = companyContextId;
    const sender = userId;
    const body = conteudo.trim();
    const thread = currentThread;
    const anexosToSend = anexos;

    if (!sender) {
      setErro("Sessão inválida.");
      return;
    }
    if (!companyId) {
      setErro("Empresa não definida para envio.");
      return;
    }
    if (!thread) {
      setErro("Selecione uma conversa antes de enviar.");
      return;
    }
    if (!body && anexosToSend.length === 0) {
      setErro("Escreva um recado ou anexe um arquivo antes de enviar.");
      return;
    }
    if (anexosToSend.length > 0 && !supportsAttachments) {
      setErro("Envio de anexos ainda não está habilitado no banco. Aplique a migration do mural_recados_arquivos e tente novamente.");
      return;
    }

    setEnviando(true);
    try {
      const payload: any = {
        company_id: companyId,
        sender_id: sender,
        receiver_id: thread.type === "user" ? thread.id : null,
        conteudo: body || "",
      };

      const { data: recadoInserted, error: insertErr } = await supabase
        .from("mural_recados")
        .insert(payload)
        .select("id")
        .single();
      if (insertErr) throw insertErr;
      const recadoId = String((recadoInserted as any)?.id || "").trim();
      if (!recadoId) throw new Error("Não foi possível criar o recado.");

      const uploadedPaths: string[] = [];
      try {
        if (anexosToSend.length > 0) {
          const rows = [];
          for (const file of anexosToSend) {
            if (!file) continue;
            if (file.size > MAX_UPLOAD_BYTES) {
              throw new Error(`Arquivo muito grande: ${file.name} (máx. ${formatBytes(MAX_UPLOAD_BYTES)})`);
            }
            const safeName = sanitizeFileName(file.name || "arquivo");
            const path = `${companyId}/${recadoId}/${Date.now()}-${safeName}`;
            const upload = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
              cacheControl: "3600",
              upsert: false,
              contentType: file.type || undefined,
            });
            if (upload.error) throw upload.error;
            uploadedPaths.push(path);
            rows.push({
              company_id: companyId,
              recado_id: recadoId,
              uploaded_by: sender,
              file_name: file.name || safeName,
              storage_bucket: STORAGE_BUCKET,
              storage_path: path,
              mime_type: file.type || null,
              size_bytes: file.size || null,
            });
          }
          if (rows.length > 0) {
            const { error: anexosErr } = await supabase.from("mural_recados_arquivos").insert(rows);
            if (anexosErr) throw anexosErr;
          }
        }
      } catch (anexoError) {
        if (uploadedPaths.length > 0) {
          await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
        }
        // Rollback do recado (privado via RPC; empresa via delete direto)
        if (thread.type === "user") {
          await supabase.rpc("mural_recados_delete_private_unread", { target_id: recadoId });
        } else {
          await supabase.from("mural_recados").delete().eq("id", recadoId);
        }
        throw anexoError;
      }

      clearMessageFields();
      await loadRecados();
      scheduleReloadRecados();
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Falha ao enviar recado.");
    } finally {
      setEnviando(false);
    }
  };

  const marcarRecadoComoLido = async (recadoId: string, showFeedback = false) => {
    if (!recadoId) return;
    setMarcandoLeituraId(recadoId);
    try {
      const { error } = await supabase.rpc("mural_recados_mark_read", { target_id: recadoId });
      if (error) throw error;
      if (showFeedback) {
        setFeedback("Recado marcado como lido.");
      }
      await loadRecados();
    } catch (e: any) {
      console.error("Falha ao registrar leitura:", e);
      if (showFeedback) {
        setErro(e?.message || "Não foi possível marcar o recado como lido.");
      }
    } finally {
      setMarcandoLeituraId((prev) => (prev === recadoId ? null : prev));
    }
  };

  const handleDeleteRecado = async (recado: RecadoRow | null, deleteForAll = false) => {
    if (!recado) return;
    limparFeedback();
    try {
      const destinatarioLeu = Boolean(
        recado.receiver_id &&
          Boolean(
            (recado.leituras || []).some((entry) => entry.user_id === recado.receiver_id)
          )
      );
      const isSenderPrivate = Boolean(userId && recado.sender_id === userId && recado.receiver_id);
      const shouldDeleteAll = isSenderPrivate && deleteForAll && !destinatarioLeu;

      const removeAnexosStorage = async () => {
        const arquivos = (recado.arquivos || []) as RecadoArquivoRow[];
        if (!arquivos.length) return;
        const buckets = new Map<string, string[]>();
        arquivos.forEach((a) => {
          const bucket = String(a.storage_bucket || STORAGE_BUCKET);
          const path = String(a.storage_path || "").trim();
          if (!path) return;
          buckets.set(bucket, [...(buckets.get(bucket) || []), path]);
        });
        const entries = Array.from(buckets.entries());
        await Promise.all(entries.map(([bucket, paths]) => supabase.storage.from(bucket).remove(paths)));
      };

      if (shouldDeleteAll) {
        await removeAnexosStorage();
        const { error } = await supabase.rpc("mural_recados_delete_private_unread", {
          target_id: recado.id,
        });
        if (error) throw error;
        removeRecadoFromState(recado.id);
      } else if (isSenderPrivate) {
        const { error } = await supabase.rpc("mural_recados_hide_for_sender", {
          target_id: recado.id,
        });
        if (error) throw error;
        setFeedback("Recado removido do seu mural.");
        removeRecadoFromState(recado.id);
      } else {
        await removeAnexosStorage();
        const { error } = await supabase.from("mural_recados").delete().eq("id", recado.id);
        if (error) throw error;
        removeRecadoFromState(recado.id);
      }

      scheduleReloadRecados();
    } catch (e: any) {
      console.error(e);
      setErro(e?.message || "Falha ao apagar recado.");
    }
  };

  const canDeleteRecado = (r: RecadoRow) => {
    if (!userId) return false;
    if (r.receiver_id) return r.receiver_id === userId || r.sender_id === userId;
    return r.sender_id === userId;
  };

  if (loading) {
    return (
      <AppCard style={{ padding: 14 }}>
        Carregando mural...
      </AppCard>
    );
  }

  if (!userId) {
    return <AlertMessage variant="error">Sessão inválida. Faça login novamente.</AlertMessage>;
  }

  if (!companyContextId) {
    return (
      <AlertMessage variant="warning">
        Você ainda não está vinculado a uma empresa. Para usar o Mural, aceite um convite corporativo ou
        conclua o vínculo com a empresa.
      </AlertMessage>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="mural-recados mural-whatsapp">
      <AppToolbar
        className="mb-3"
        tone="info"
        title="Mural de recados"
        subtitle="Converse com sua empresa e contatos internos em tempo real."
      />
      {erro && (
        <div style={{ marginBottom: 12 }}>
          <AlertMessage variant="error">{erro}</AlertMessage>
        </div>
      )}
      {feedback && (
        <div style={{ marginBottom: 12 }}>
          <AlertMessage variant="success">{feedback}</AlertMessage>
        </div>
      )}
      {isMobile ? (
        <div className="mural-wa-mobile">
          {mobileScreen === "list" ? (
            <div className="mural-wa-mobile-list">
              <div className="mural-wa-mobile-topbar">
                <div className="mural-wa-mobile-title">Recados</div>
                <AppButton
                  type="button"
                  variant={formOpen ? "secondary" : "primary"}
                  onClick={() => {
                    toggleFormOpen();
                    setMobileScreen("chat");
                  }}
                >
                  {formOpen ? "Cancelar" : "Nova"}
                </AppButton>
              </div>
              <div className="mural-wa-mobile-tabs" role="tablist" aria-label="Seções">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === "chats"}
                  className={mobileTab === "chats" ? "mural-wa-tab active" : "mural-wa-tab"}
                  onClick={() => setMobileTab("chats")}
                >
                  CHATS
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mobileTab === "contacts"}
                  className={mobileTab === "contacts" ? "mural-wa-tab active" : "mural-wa-tab"}
                  onClick={() => setMobileTab("contacts")}
                >
                  CONTATOS
                </button>
              </div>
              <div className="mural-wa-mobile-search">
                <input
                  className="mural-whatsapp-search"
                  value={threadQuery}
                  onChange={(e) => setThreadQuery(e.target.value)}
                  placeholder={mobileTab === "chats" ? "Buscar chats..." : "Buscar contatos..."}
                  aria-label={mobileTab === "chats" ? "Buscar chats" : "Buscar contatos"}
                />
              </div>
              {mobileTab === "chats"
                ? renderThreadList(() => setMobileScreen("chat"))
                : renderContactsList(() => setMobileScreen("chat"))}
            </div>
          ) : (
            <section className="mural-whatsapp-chat mural-wa-mobile-chat">
              <div className="mural-wa-mobile-chat-header">
                <button
                  type="button"
                  className="mural-wa-back"
                  onClick={() => setMobileScreen("list")}
                  aria-label="Voltar"
                >
                  Voltar
                </button>
                <div className="mural-wa-mobile-chat-title" title={currentThread?.name || ""}>
                  {currentThread?.name || "Conversa"}
                </div>
                <AppButton
                  type="button"
                  variant={formOpen ? "secondary" : "primary"}
                  onClick={toggleFormOpen}
                >
                  {formOpen ? "Cancelar" : "Nova"}
                </AppButton>
              </div>

              <div className="mural-whatsapp-chat-body">
            {recadosLoading && recados.length === 0 ? (
              <div className="chat-empty">Carregando mensagens...</div>
            ) : conversation.length === 0 ? (
              <div className="chat-empty">Nenhuma mensagem nesta conversa.</div>
            ) : (
              conversation.map((recado) => {
                const isFromUser = recado.sender_id === userId;
                const leiturasList = recado.leituras || [];
                const minhaLeitura = leiturasList.find((entry) => entry.user_id === userId);
                const destinatarioLeu =
                  recado.receiver_id &&
                  leiturasList.some((entry) => entry.user_id === recado.receiver_id);
                const statusLabel = minhaLeitura
                  ? `Você leu em ${formatarDataHora(minhaLeitura.read_at)}`
                  : isFromUser
                  ? destinatarioLeu
                    ? `Lido por ${getNomeExibicao(recado.receiver)}`
                    : "Enviado"
                  : "Ainda não lido";
                const podeMarcarComoLido =
                  !isFromUser && Boolean(userId) && recado.receiver_id === userId && !minhaLeitura;
                const podeExcluirParaTodos =
                  Boolean(userId) &&
                  recado.sender_id === userId &&
                  Boolean(recado.receiver_id) &&
                  !destinatarioLeu;
                const arquivos = (recado.arquivos || []) as RecadoArquivoRow[];
                const imagens = arquivos.filter((a) => isImageMime(a.mime_type));
                const outrosArquivos = arquivos.filter((a) => !isImageMime(a.mime_type));

                return (
                  <div
                    key={recado.id}
                    className={`chat-bubble ${isFromUser ? "sent" : "received"}`}
                  >
                    <div className="chat-bubble-body">
                      <div className="chat-bubble-header">
                        <span>{isFromUser ? "Você" : getNomeExibicao(recado.sender)}</span>
                        <span className="chat-bubble-status">{statusLabel}</span>
                      </div>
                      {String(recado.conteudo || "").trim() ? (
                        <div className="chat-bubble-text">{recado.conteudo}</div>
                      ) : null}

                      {arquivos.length > 0 && (
                        <div className="chat-attachments">
                          {imagens.length > 0 && (
                            <div className="chat-attachments-grid">
                              {imagens.map((a) => {
                                const bucket = a.storage_bucket || STORAGE_BUCKET;
                                const url = supabase.storage.from(bucket).getPublicUrl(a.storage_path).data.publicUrl;
                                return (
                                  <a
                                    key={a.id}
                                    className="chat-attachment-image"
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={a.file_name}
                                  >
                                    <img src={url} alt={a.file_name} />
                                  </a>
                                );
                              })}
                            </div>
                          )}

                          {outrosArquivos.length > 0 && (
                            <div className="chat-attachments-files">
                              {outrosArquivos.map((a) => {
                                const bucket = a.storage_bucket || STORAGE_BUCKET;
                                const url = supabase.storage.from(bucket).getPublicUrl(a.storage_path).data.publicUrl;
                                const size = formatBytes(a.size_bytes);
                                return (
                                  <a
                                    key={a.id}
                                    className="chat-attachment-file"
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    title={a.file_name}
                                  >
                                    <span className="chat-attachment-file-icon">📎</span>
                                    <span className="chat-attachment-file-info">
                                      <span className="chat-attachment-file-name">{a.file_name}</span>
                                      {size ? <span className="chat-attachment-file-size">{size}</span> : null}
                                    </span>
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                      <div className="chat-bubble-meta">
                        <span>{formatarDataHora(recado.created_at)}</span>
                        <div className="chat-bubble-actions">
                          {podeMarcarComoLido && (
                            <button
                              type="button"
                              className="chat-inline-btn"
                              onClick={() => {
                                limparFeedback();
                                marcarRecadoComoLido(recado.id, true);
                              }}
                              disabled={marcandoLeituraId === recado.id}
                            >
                              {marcandoLeituraId === recado.id ? "Marcando..." : "Marcar como lido"}
                            </button>
                          )}
                          {canDeleteRecado(recado) && (
                            <button
                              type="button"
                              className="chat-inline-btn chat-inline-btn--danger"
                              onClick={() =>
                                setConfirmDeleteRecado({
                                  open: true,
                                  recado,
                                  deleteForAll: podeExcluirParaTodos,
                                })
                              }
                            >
                              Apagar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {formOpen && (
            <div className="mural-whatsapp-input">
              <form onSubmit={handleEnviar}>
                {supportsAttachments && (
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => addAnexos(e.target.files)}
                  />
                )}
                <div className="form-group">
                  <textarea
                    className="form-input"
                    value={conteudo}
                    onChange={(e) => setConteudo(e.target.value)}
                    placeholder="Escreva aqui..."
                    rows={3}
                    style={{ resize: "vertical" }}
                  />
                </div>

                {!supportsAttachments && (
                  <small style={{ color: "#64748b" }}>
                    Anexos indisponíveis: aplique a migration `20260216_mural_recados_arquivos.sql` no Supabase.
                  </small>
                )}

                {supportsAttachments && anexos.length > 0 && (
                  <div className="mural-attachments-preview" style={{ marginTop: 10 }}>
                    {anexos.map((file, idx) => (
                      <div key={`${file.name}-${file.size}-${file.lastModified}`} className="mural-attachment-chip">
                        <span className="mural-attachment-chip-icon">{isImageMime(file.type) ? "🖼️" : "📎"}</span>
                        <span className="mural-attachment-chip-name">{file.name}</span>
                        <span className="mural-attachment-chip-size">{formatBytes(file.size)}</span>
                        <button
                          type="button"
                          className="mural-attachment-chip-remove"
                          onClick={() => removeAnexoAt(idx)}
                          aria-label="Remover anexo"
                          disabled={enviando}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                  <div className="mobile-stack-buttons" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                    {supportsAttachments && (
                    <AppButton
                      type="button"
                      variant="secondary"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={enviando || anexos.length >= MAX_UPLOAD_FILES}
                      title={
                        anexos.length >= MAX_UPLOAD_FILES
                          ? `Limite de ${MAX_UPLOAD_FILES} anexos por recado.`
                          : "Anexar arquivo"
                      }
                    >
                      📎 Anexar
                    </AppButton>
                  )}
                  <AppButton type="button" variant="secondary" onClick={clearMessageFields} disabled={enviando}>
                    Limpar
                  </AppButton>
                  <AppButton type="submit" variant="primary" disabled={(!conteudo.trim() && anexos.length === 0) || enviando}>
                    {enviando ? "Enviando..." : "Enviar recado"}
                  </AppButton>
                </div>
              </form>
            </div>
          )}
            </section>
          )}
        </div>
      ) : (
        <div className="mural-whatsapp-shell">
          <aside className="mural-whatsapp-sidebar">
            <div className="mural-whatsapp-sidebar-head">
              <div className="mural-whatsapp-sidebar-title">
                <div>
                  <h4>Conversas</h4>
                  <span className="mural-muted">{threads.length} contatos</span>
                </div>
              </div>
              <input
                className="mural-whatsapp-search"
                value={threadQuery}
                onChange={(e) => setThreadQuery(e.target.value)}
                placeholder="Buscar..."
                aria-label="Buscar conversas"
              />
            </div>
            {renderThreadList()}
          </aside>

          <section className="mural-whatsapp-chat">
            <div className="mural-whatsapp-chat-header">
              <div className="mural-chat-header-left">
                <span
                  className={
                    currentThread?.type === "company"
                      ? "mural-thread-avatar mural-thread-avatar--company mural-chat-avatar"
                      : "mural-thread-avatar mural-chat-avatar"
                  }
                  aria-hidden="true"
                >
                  <span className="mural-thread-avatar-text">{getInitials(currentThread?.name || "")}</span>
                  {currentThread?.type === "user" ? (
                    <span
                      className={`mural-thread-avatar-dot ${currentThread?.isOnline ? "mural-thread-avatar-dot--online" : "mural-thread-avatar-dot--offline"}`}
                      aria-hidden="true"
                    />
                  ) : null}
                </span>
                <div className="mural-chat-header-info">
                  <div className="mural-chat-title">{currentThread?.name || "Sem conversa selecionada"}</div>
                  <div className="mural-chat-subtitle">
                    {currentThread?.type === "company"
                      ? "Mensagem para toda a empresa"
                      : currentThread?.isOnline
                      ? "Online"
                      : "Offline"}
                  </div>
                </div>
              </div>
              <AppButton
                type="button"
                variant={formOpen ? "secondary" : "primary"}
                onClick={toggleFormOpen}
              >
                {formOpen ? "Cancelar" : "Nova mensagem"}
              </AppButton>
            </div>

            <div className="mural-whatsapp-chat-body">
              {recadosLoading && recados.length === 0 ? (
                <div className="chat-empty">Carregando mensagens...</div>
              ) : conversation.length === 0 ? (
                <div className="chat-empty">Nenhuma mensagem nesta conversa.</div>
              ) : (
                conversation.map((recado) => {
                  const isFromUser = recado.sender_id === userId;
                  const leiturasList = recado.leituras || [];
                  const minhaLeitura = leiturasList.find((entry) => entry.user_id === userId);
                  const destinatarioLeu =
                    recado.receiver_id &&
                    leiturasList.some((entry) => entry.user_id === recado.receiver_id);
                  const statusLabel = minhaLeitura
                    ? `Você leu em ${formatarDataHora(minhaLeitura.read_at)}`
                    : isFromUser
                    ? destinatarioLeu
                      ? `Lido por ${getNomeExibicao(recado.receiver)}`
                      : "Enviado"
                    : "Ainda não lido";
                  const podeMarcarComoLido =
                    !isFromUser && Boolean(userId) && recado.receiver_id === userId && !minhaLeitura;
                  const podeExcluirParaTodos =
                    Boolean(userId) &&
                    recado.sender_id === userId &&
                    Boolean(recado.receiver_id) &&
                    !destinatarioLeu;
                  const arquivos = (recado.arquivos || []) as RecadoArquivoRow[];
                  const imagens = arquivos.filter((a) => isImageMime(a.mime_type));
                  const outrosArquivos = arquivos.filter((a) => !isImageMime(a.mime_type));

                  return (
                    <div
                      key={recado.id}
                      className={`chat-bubble ${isFromUser ? "sent" : "received"}`}
                    >
                      <div className="chat-bubble-body">
                        <div className="chat-bubble-header">
                          <span>{isFromUser ? "Você" : getNomeExibicao(recado.sender)}</span>
                          <span className="chat-bubble-status">{statusLabel}</span>
                        </div>
                        {String(recado.conteudo || "").trim() ? (
                          <div className="chat-bubble-text">{recado.conteudo}</div>
                        ) : null}

                        {arquivos.length > 0 && (
                          <div className="chat-attachments">
                            {imagens.length > 0 && (
                              <div className="chat-attachments-grid">
                                {imagens.map((a) => {
                                  const bucket = a.storage_bucket || STORAGE_BUCKET;
                                  const url = supabase.storage.from(bucket).getPublicUrl(a.storage_path).data.publicUrl;
                                  return (
                                    <a
                                      key={a.id}
                                      className="chat-attachment-image"
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      title={a.file_name}
                                    >
                                      <img src={url} alt={a.file_name} />
                                    </a>
                                  );
                                })}
                              </div>
                            )}

                            {outrosArquivos.length > 0 && (
                              <div className="chat-attachments-files">
                                {outrosArquivos.map((a) => {
                                  const bucket = a.storage_bucket || STORAGE_BUCKET;
                                  const url = supabase.storage.from(bucket).getPublicUrl(a.storage_path).data.publicUrl;
                                  const size = formatBytes(a.size_bytes);
                                  return (
                                    <a
                                      key={a.id}
                                      className="chat-attachment-file"
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      title={a.file_name}
                                    >
                                      <span className="chat-attachment-file-icon">📎</span>
                                      <span className="chat-attachment-file-info">
                                        <span className="chat-attachment-file-name">{a.file_name}</span>
                                        {size ? <span className="chat-attachment-file-size">{size}</span> : null}
                                      </span>
                                    </a>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="chat-bubble-meta">
                          <span>{formatarDataHora(recado.created_at)}</span>
                          <div className="chat-bubble-actions">
                            {podeMarcarComoLido && (
                              <button
                                type="button"
                                className="chat-inline-btn"
                                onClick={() => {
                                  limparFeedback();
                                  marcarRecadoComoLido(recado.id, true);
                                }}
                                disabled={marcandoLeituraId === recado.id}
                              >
                                {marcandoLeituraId === recado.id ? "Marcando..." : "Marcar como lido"}
                              </button>
                            )}
                            {canDeleteRecado(recado) && (
                              <button
                                type="button"
                                className="chat-inline-btn chat-inline-btn--danger"
                                onClick={() =>
                                  setConfirmDeleteRecado({
                                    open: true,
                                    recado,
                                    deleteForAll: podeExcluirParaTodos,
                                  })
                                }
                              >
                                Apagar
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {formOpen && (
              <div className="mural-whatsapp-input">
                <form onSubmit={handleEnviar}>
                  {supportsAttachments && (
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      style={{ display: "none" }}
                      onChange={(e) => addAnexos(e.target.files)}
                    />
                  )}
                  <div className="form-group">
                    <textarea
                      className="form-input"
                      value={conteudo}
                      onChange={(e) => setConteudo(e.target.value)}
                      placeholder="Escreva aqui..."
                      rows={3}
                      style={{ resize: "vertical" }}
                    />
                  </div>

                  {!supportsAttachments && (
                    <small style={{ color: "#64748b" }}>
                      Anexos indisponíveis: aplique a migration `20260216_mural_recados_arquivos.sql` no Supabase.
                    </small>
                  )}

                  {supportsAttachments && anexos.length > 0 && (
                    <div className="mural-attachments-preview" style={{ marginTop: 10 }}>
                      {anexos.map((file, idx) => (
                        <div key={`${file.name}-${file.size}-${file.lastModified}`} className="mural-attachment-chip">
                          <span className="mural-attachment-chip-icon">{isImageMime(file.type) ? "🖼️" : "📎"}</span>
                          <span className="mural-attachment-chip-name">{file.name}</span>
                          <span className="mural-attachment-chip-size">{formatBytes(file.size)}</span>
                          <button
                            type="button"
                            className="mural-attachment-chip-remove"
                            onClick={() => removeAnexoAt(idx)}
                            aria-label="Remover anexo"
                            disabled={enviando}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mobile-stack-buttons" style={{ justifyContent: "flex-end", marginTop: 12 }}>
                    {supportsAttachments && (
                      <AppButton
                        type="button"
                        variant="secondary"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={enviando || anexos.length >= MAX_UPLOAD_FILES}
                        title={
                          anexos.length >= MAX_UPLOAD_FILES
                            ? `Limite de ${MAX_UPLOAD_FILES} anexos por recado.`
                            : "Anexar arquivo"
                        }
                      >
                        📎 Anexar
                      </AppButton>
                    )}
                    <AppButton type="button" variant="secondary" onClick={clearMessageFields} disabled={enviando}>
                      Limpar
                    </AppButton>
                    <AppButton type="submit" variant="primary" disabled={(!conteudo.trim() && anexos.length === 0) || enviando}>
                      {enviando ? "Enviando..." : "Enviar recado"}
                    </AppButton>
                  </div>
                </form>
              </div>
            )}
          </section>
        </div>
      )}

      <ConfirmDialog
        open={confirmDeleteRecado.open}
        title="Apagar recado"
        message={
          confirmDeleteRecado.deleteForAll
            ? "Este recado ainda não foi lido pelo destinatário. Ele será removido para todos."
            : "Tem certeza que deseja apagar este recado? Esta ação não pode ser desfeita."
        }
        confirmLabel="Apagar"
        confirmVariant="danger"
        onCancel={() => setConfirmDeleteRecado({ open: false, recado: null, deleteForAll: false })}
        onConfirm={() => {
          const recado = confirmDeleteRecado.recado;
          const deleteForAll = confirmDeleteRecado.deleteForAll;
          setConfirmDeleteRecado({ open: false, recado: null, deleteForAll: false });
          handleDeleteRecado(recado, deleteForAll);
        }}
      />
      </div>
    </AppPrimerProvider>
  );
}
