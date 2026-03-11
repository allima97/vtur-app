import React, { useEffect, useMemo, useRef, useState } from "react";
import { readPermissoesCache } from "../../lib/permissoesCache";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";

const PRIORITIES = [
  { value: "alta", label: "Alta", color: "#ef4444" },
  { value: "media", label: "Media", color: "#f59e0b" },
  { value: "baixa", label: "Baixa", color: "#10b981" },
];

// Paleta (conforme imagem enviada em 16/02/2026)
const PALETTE = [
  { hex: "#d1007a", label: "Magenta" },
  { hex: "#7a008f", label: "Violeta" },
  { hex: "#8b005d", label: "Magenta-arroxeado" },
  { hex: "#d97706", label: "Laranja" },
  { hex: "#d02a1e", label: "Magenta-alaranjado" },
  { hex: "#facc15", label: "Amarelo" },
  { hex: "#2e7d32", label: "Verde" },
  { hex: "#b7c300", label: "Amarelo-esverdeado" },
  { hex: "#f59e0b", label: "Amarelo-alaranjado" },
  { hex: "#2d9cdb", label: "Azul cian" },
  { hex: "#0f766e", label: "Azul-esverdeado" },
  { hex: "#1e3a8a", label: "Azul-arroxeado" },
];

const PRIORITY_COLOR: Record<string, string> = {
  alta: "#ef4444",
  media: "#f59e0b",
  baixa: "#2563eb",
};

const STATUS_COLS = [
  { value: "novo", label: "A Fazer", color: "#2563eb", body: "#eef7ff", icon: "\u2192", order: 1 },
  { value: "agendado", label: "Fazendo", color: "#f5a524", body: "#fff8e6", icon: "\u2192", order: 2 },
  { value: "em_andamento", label: "Feito", color: "#27ae60", body: "#e9f7ef", icon: "\u2192", order: 3 },
];

const FALLBACK_COLORS = [
  "#fca5a5",
  "#f9a8d4",
  "#fcd34d",
  "#a5b4fc",
  "#93c5fd",
  "#6ee7b7",
  "#f97316",
  "#c084fc",
];

type Categoria = {
  id: string;
  nome: string;
  cor?: string | null;
};

type TodoItem = {
  id: string;
  titulo: string;
  descricao?: string | null;
  done: boolean;
  categoria_id?: string | null;
  prioridade?: "alta" | "media" | "baixa" | null;
  status?: "novo" | "agendado" | "em_andamento" | "concluido" | null;
  arquivo?: string | null;
};

type VisibleStatus = "novo" | "agendado" | "em_andamento";
type ViewMode = "kanban" | "lista";
type TodoNavTab = VisibleStatus | "categorias";
type MobilePanel = "tarefas" | "categorias";

const TODO_MOBILE_TAB_STORAGE_KEY = "sgtur_todo_tab";
const TODO_BOARD_CACHE_KEY = "sgtur_todo_board_cache_v2";
const TODO_BOARD_CACHE_TTL_MS = 15_000;

type TodoBoardCache = {
  userId: string;
  expiresAt: number;
  categorias: Categoria[];
  itens: TodoItem[];
};

function readTodoBoardCache(userId: string | null) {
  if (typeof window === "undefined") return null;
  if (!userId) return null;
  try {
    const raw = window.sessionStorage.getItem(TODO_BOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TodoBoardCache;
    if (!parsed || parsed.userId !== userId) return null;
    if (!parsed.expiresAt || parsed.expiresAt <= Date.now()) return null;
    return {
      categorias: (parsed.categorias || []) as Categoria[],
      itens: (parsed.itens || []) as TodoItem[],
    };
  } catch {
    return null;
  }
}

function writeTodoBoardCache(userId: string | null, payload: { categorias: Categoria[]; itens: TodoItem[] }) {
  if (typeof window === "undefined") return;
  if (!userId) return;
  try {
    const cache: TodoBoardCache = {
      userId,
      expiresAt: Date.now() + TODO_BOARD_CACHE_TTL_MS,
      categorias: payload.categorias,
      itens: payload.itens,
    };
    window.sessionStorage.setItem(TODO_BOARD_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

function normalizeStatus(status?: string | null): VisibleStatus {
  if (status === "agendado") return "agendado";
  if (status === "em_andamento" || status === "concluido") return "em_andamento";
  return "novo";
}

function textColorFor(bg: string) {
  if (!bg) return "#0f172a";
  const hex = bg.replace("#", "");
  const num = parseInt(hex.length === 3 ? hex.replace(/(.)/g, "$1$1") : hex, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#0f172a" : "#f8fafc";
}

export default function TodoBoard() {
  const cacheUserId =
    typeof window !== "undefined" ? readPermissoesCache()?.userId ?? null : null;
  const [isMobile, setIsMobile] = useState(false);
  const [mobileStatus, setMobileStatus] = useState<VisibleStatus>("novo");
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>("tarefas");
  const [mobileReady, setMobileReady] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [catNome, setCatNome] = useState("");
  const [catCor, setCatCor] = useState<string>(PALETTE[0].hex);
  const [todoTitulo, setTodoTitulo] = useState("");
  const [todoDesc, setTodoDesc] = useState("");
  const [todoCat, setTodoCat] = useState<string | null>(null);
  const [todoPrio, setTodoPrio] = useState<"alta" | "media" | "baixa">("media");
  const [showCatColor, setShowCatColor] = useState(false);
  const catColorListRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createCategoryOpen, setCreateCategoryOpen] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Categoria | null>(null);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);
  const pendingBatchRef = useRef<Map<string, { id: string; status?: string; done?: boolean; categoria_id?: string | null }>>(
    new Map()
  );
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushingRef = useRef(false);

  useEffect(() => {
    if (!showCatColor) return;
    requestAnimationFrame(() => {
      catColorListRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [showCatColor]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const updateViewport = () => setIsMobile(mediaQuery.matches);
    updateViewport();
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", updateViewport);
      return () => mediaQuery.removeEventListener("change", updateViewport);
    }
    mediaQuery.addListener(updateViewport);
    return () => mediaQuery.removeListener(updateViewport);
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setMobileReady(false);
      setMobilePanel("tarefas");
      return;
    }

    setViewMode("lista");
    let storedTab: TodoNavTab | null = null;
    try {
      const raw = window.localStorage.getItem(TODO_MOBILE_TAB_STORAGE_KEY);
      if (raw === "novo" || raw === "agendado" || raw === "em_andamento" || raw === "categorias") {
        storedTab = raw as TodoNavTab;
      }
    } catch {}

    if (storedTab === "categorias") {
      setMobilePanel("categorias");
    } else if (storedTab) {
      setMobilePanel("tarefas");
      setMobileStatus(storedTab as VisibleStatus);
    }
    setMobileReady(true);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile || !mobileReady) return;
    const tab: TodoNavTab = mobilePanel === "categorias" ? "categorias" : mobileStatus;
    try {
      window.localStorage.setItem(TODO_MOBILE_TAB_STORAGE_KEY, tab);
    } catch {}
    window.dispatchEvent(new CustomEvent("sgtur:todo:tabChanged", { detail: { tab } }));
  }, [isMobile, mobileReady, mobilePanel, mobileStatus]);

  useEffect(() => {
    if (!isMobile) return;
    const onSetTab = (event: Event) => {
      const tab = (event as CustomEvent).detail?.tab;
      if (tab === "categorias") {
        setMobilePanel("categorias");
        return;
      }
      if (tab === "novo" || tab === "agendado" || tab === "em_andamento") {
        setMobilePanel("tarefas");
        setMobileStatus(tab as VisibleStatus);
      }
    };
    window.addEventListener("sgtur:todo:setTab", onSetTab as EventListener);
    return () => window.removeEventListener("sgtur:todo:setTab", onSetTab as EventListener);
  }, [isMobile]);

  useEffect(() => {
    let active = true;
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const cached = readTodoBoardCache(cacheUserId);
        if (cached && active) {
          setCategorias(cached.categorias);
          setTodos(cached.itens);
          setLoading(false);
          return;
        }
        const resp = await fetch("/api/v1/todo/board", { credentials: "same-origin" });
        if (!resp.ok) {
          const msg = await resp.text().catch(() => "");
          throw new Error(msg || `HTTP ${resp.status}`);
        }
        const data = await resp.json();
        if (!active) return;
        const categoriasData = ((data?.categorias as Categoria[]) || []) as Categoria[];
        const itensData = ((data?.itens as TodoItem[]) || []) as TodoItem[];
        setCategorias(categoriasData);
        setTodos(itensData);
        writeTodoBoardCache(cacheUserId, { categorias: categoriasData, itens: itensData });
        setLoading(false);
      } catch (err) {
        console.error(err);
        if (!active) return;
        setError("Erro ao carregar tarefas.");
        setLoading(false);
      }
    }
    loadData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!cacheUserId) return;
    if (loading) return;
    const timer = setTimeout(() => {
      writeTodoBoardCache(cacheUserId, { categorias, itens: todos });
    }, 400);
    return () => clearTimeout(timer);
  }, [cacheUserId, categorias, todos, loading]);

  const flushBatchUpdates = async () => {
    if (flushingRef.current) return;
    const pending = Array.from(pendingBatchRef.current.values());
    if (pending.length === 0) return;
    pendingBatchRef.current.clear();
    flushingRef.current = true;
    try {
      const resp = await fetch("/api/v1/todo/batch", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: pending }),
      });
      if (!resp.ok && resp.status !== 207) {
        const msg = await resp.text().catch(() => "");
        throw new Error(msg || `HTTP ${resp.status}`);
      }
      const json = await resp.json().catch(() => null);
      if (json?.errors?.length) {
        setError("Algumas tarefas não puderam ser atualizadas. Recarregue a página.");
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao atualizar tarefas.");
    } finally {
      flushingRef.current = false;
      // Se chegaram novas mudanças enquanto flushava, agenda novo flush
      if (pendingBatchRef.current.size > 0) {
        if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
        flushTimerRef.current = setTimeout(() => {
          flushBatchUpdates();
        }, 350);
      }
    }
  };

  const scheduleBatchUpdate = (update: { id: string; status?: string; done?: boolean; categoria_id?: string | null }) => {
    const current = pendingBatchRef.current.get(update.id) || { id: update.id };
    const next = { ...current, ...update, id: update.id };
    pendingBatchRef.current.set(update.id, next);
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      flushBatchUpdates();
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      // best-effort flush (não bloqueia unmount)
      if (pendingBatchRef.current.size > 0) {
        flushBatchUpdates();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addCategoria(e: React.FormEvent) {
    e.preventDefault();
    if (!catNome.trim()) return;
    if (editingCategory) {
      const resp = await fetch("/api/v1/todo/category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingCategory.id, nome: catNome.trim(), cor: catCor }),
      });
      if (!resp.ok) {
        setError("Erro ao atualizar categoria.");
        return;
      }
      const json = (await resp.json()) as { item?: Categoria };
      if (!json.item) {
        setError("Erro ao atualizar categoria.");
        return;
      }
      setCategorias((prev) => prev.map((c) => (c.id === editingCategory.id ? json.item! : c)));
    } else {
      const resp = await fetch("/api/v1/todo/category", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: catNome.trim(), cor: catCor }),
      });
      if (!resp.ok) {
        setError("Erro ao criar categoria.");
        return;
      }
      const json = (await resp.json()) as { item?: Categoria };
      if (!json.item) {
        setError("Erro ao criar categoria.");
        return;
      }
      setCategorias((prev) => [...prev, json.item!]);
    }
    setCatNome("");
    setCatCor(PALETTE[0].hex);
    setEditingCategory(null);
    setCreateCategoryOpen(false);
  }

  async function addTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!todoTitulo.trim()) return;
    
    if (editingTodo) {
      const resp = await fetch("/api/v1/todo/item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingTodo.id,
          titulo: todoTitulo.trim(),
          descricao: todoDesc.trim() || null,
          categoria_id: todoCat,
          prioridade: todoPrio,
          status: editingTodo.status,
        }),
      });
      if (!resp.ok) {
        setError("Erro ao salvar tarefa.");
        return;
      }
      const json = (await resp.json()) as { item?: TodoItem };
      if (!json.item) {
        setError("Erro ao salvar tarefa.");
        return;
      }
      setTodos((prev) => prev.map((t) => (t.id === editingTodo.id ? json.item! : t)));
    } else {
      const resp = await fetch("/api/v1/todo/item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: todoTitulo.trim(),
          descricao: todoDesc.trim() || null,
          categoria_id: todoCat,
          prioridade: todoPrio,
          status: "novo",
        }),
      });
      if (!resp.ok) {
        setError("Erro ao salvar tarefa.");
        return;
      }
      const json = (await resp.json()) as { item?: TodoItem };
      if (!json.item) {
        setError("Erro ao salvar tarefa.");
        return;
      }
      setTodos((prev) => [...prev, json.item!]);
    }
    setTodoTitulo("");
    setTodoDesc("");
    setEditingTodo(null);
    setCreateOpen(false);
  }

  async function removeCategoria(categoriaId: string) {
    const hasLinkedTodo = todos.some((t) => t.categoria_id === categoriaId);
    if (hasLinkedTodo) {
      setError("Não é possível excluir categoria com tarefa vinculada.");
      return;
    }

    const params = new URLSearchParams({ id: categoriaId });
    const resp = await fetch(`/api/v1/todo/category?${params.toString()}`, {
      method: "DELETE",
    });
    if (!resp.ok) {
      setError("Erro ao excluir categoria.");
      return;
    }

    setCategorias((prev) => prev.filter((c) => c.id !== categoriaId));
    if (todoCat === categoriaId) setTodoCat(null);
    if (editingCategory?.id === categoriaId) {
      setEditingCategory(null);
      setCatNome("");
    }
  }

  async function toggleDone(id: string, next: boolean) {
    const card = todos.find((t) => t.id === id);
    const current = normalizeStatus(card?.status);
    const nextStatus: VisibleStatus = next ? "em_andamento" : current === "em_andamento" ? "agendado" : current;
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: nextStatus, done: nextStatus === "em_andamento" } : t))
    );
    scheduleBatchUpdate({ id, status: nextStatus, done: nextStatus === "em_andamento" });
  }

  async function removeTodo(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    const params = new URLSearchParams({ id });
    const resp = await fetch(`/api/v1/todo/item?${params.toString()}`, {
      method: "DELETE",
    });
    if (!resp.ok) {
      setError("Erro ao excluir tarefa.");
    }
  }

  async function archiveTodo(id: string) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, arquivo: new Date().toISOString() } : t)));
    await fetch("/api/v1/todo/item", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "archive" }),
    });
  }

  async function restoreTodo(id: string) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, arquivo: null } : t)));
    await fetch("/api/v1/todo/item", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "restore" }),
    });
  }

  async function setStatus(id: string, status: VisibleStatus) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, status, done: status === "em_andamento" } : t)));
    scheduleBatchUpdate({ id, status, done: status === "em_andamento" });
  }

  function moveStatus(id: string, direction: -1 | 1) {
    const card = todos.find((t) => t.id === id);
    const current = STATUS_COLS.findIndex((s) => s.value === normalizeStatus(card?.status));
    const next = current + direction;
    if (next < 0 || next >= STATUS_COLS.length) return;
    setStatus(id, STATUS_COLS[next].value as VisibleStatus);
  }

  function toggleExpand(id: string) {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }

  const cards = useMemo(() => {
    return todos
      .filter((t) => !t.arquivo)
      .map((t) => {
        const cat = categorias.find((c) => c.id === t.categoria_id);
        const catColor = cat?.cor || PRIORITIES.find(p => p.value === t.prioridade)?.color || FALLBACK_COLORS[0];
        const prio = PRIORITIES.find((p) => p.value === t.prioridade);
        return {
          ...t,
          catNome: cat?.nome || "Sem categoria",
          catColor,
          prioLabel: prio?.label || "-",
          prioColor: PRIORITY_COLOR[t.prioridade || ""] || "#475569",
          status: normalizeStatus(t.status),
        } as any;
      })
      .sort((a, b) => {
        const orderA = STATUS_COLS.findIndex((s) => s.value === a.status);
        const orderB = STATUS_COLS.findIndex((s) => s.value === b.status);
        if (orderA !== orderB) return orderA - orderB;
        const prioWeight = (p?: string | null) => {
          if (p === "alta") return 0;
          if (p === "media") return 1;
          if (p === "baixa") return 2;
          return 3;
        };
        const prioA = prioWeight(a.prioridade);
        const prioB = prioWeight(b.prioridade);
        if (prioA !== prioB) return prioA - prioB;
        if ((a.created_at || "") === (b.created_at || "")) return 0;
        return (a.created_at || "") > (b.created_at || "") ? -1 : 1;
      });
  }, [todos, categorias]);

  const archivedCards = useMemo(() => {
    return todos
      .filter((t) => !!t.arquivo)
      .map((t) => {
        const cat = categorias.find((c) => c.id === t.categoria_id);
        const catColor = cat?.cor || PRIORITIES.find((p) => p.value === t.prioridade)?.color || FALLBACK_COLORS[0];
        return {
          ...t,
          catNome: cat?.nome || "Sem categoria",
          catColor,
        } as any;
      });
  }, [todos, categorias]);

  const cardsByCategory = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    cards.forEach((card: any) => {
      const key = card.categoria_id || "sem_categoria";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(card);
    });
    return grouped;
  }, [cards]);

  const statusCounts = useMemo(() => {
    const counts: Record<VisibleStatus, number> = { novo: 0, agendado: 0, em_andamento: 0 };
    (cards as any[]).forEach((c) => {
      const key = c?.status as VisibleStatus;
      if (key && counts[key] !== undefined) counts[key] += 1;
    });
    return counts;
  }, [cards]);

  const categoriasComTodo = useMemo(() => {
    return new Set(todos.map((t) => t.categoria_id).filter(Boolean) as string[]);
  }, [todos]);

  const renderTodoCard = (card: any, col: any) => {
    const isExpanded = expandedItems.has(card.id);
    const hasDetails = card.descricao;
    const currentIndex = STATUS_COLS.findIndex((s) => s.value === card.status);

    if (viewMode === "lista") {
      return (
        <div
          key={card.id}
          className="todo-list-item"
          style={{ ["--todo-accent" as any]: card.catColor } as React.CSSProperties}
        >
          <div
            className="todo-row"
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              flexWrap: "wrap",
            }}
          >
            <div
              className="todo-content"
              style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 260px" }}
            >
              <input
                type="checkbox"
                checked={card.done}
                onChange={(e) => toggleDone(card.id, e.target.checked)}
                aria-label="Concluir"
                style={{ width: 16, height: 16, flexShrink: 0 }}
              />
              <span
                className="todo-title"
                style={{
                  fontWeight: 700,
                  fontSize: 14,
                  color: "#0f172a",
                  textDecoration: card.done ? "line-through" : "none",
                  opacity: card.done ? 0.6 : 1,
                }}
              >
                {card.titulo}
              </span>
            </div>

            <div className="todo-meta" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span
                className="todo-badge"
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: card.catColor,
                  color: textColorFor(card.catColor),
                  fontSize: 11,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                {card.catNome}
              </span>
              <span className="todo-badge" style={{ fontSize: 11, color: card.prioColor, fontWeight: 800, flexShrink: 0 }}>
                ● {card.prioLabel}
              </span>
            </div>

            <div className="todo-card-actions" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {hasDetails && (
                <AppButton
                  type="button"
                  variant="ghost"
                  style={{
                    background: card.catColor,
                    color: textColorFor(card.catColor),
                    border: "none",
                    borderRadius: "50%",
                    width: 22,
                    height: 22,
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                  onClick={() => toggleExpand(card.id)}
                  aria-label={isExpanded ? "Ocultar detalhes" : "Exibir detalhes"}
                >
                  {isExpanded ? "−" : "+"}
                </AppButton>
              )}

              <AppButton
                type="button"
                className="icon-action-btn"
                variant="ghost"
                style={{ padding: "2px 6px", flexShrink: 0, fontSize: 12 }}
                disabled={currentIndex === 0}
                onClick={() => moveStatus(card.id, -1)}
                aria-label="Mover para coluna anterior"
                title="Mover para trás"
              >
                {"◀"}
              </AppButton>
              <AppButton
                type="button"
                className="icon-action-btn"
                variant="ghost"
                style={{ padding: "2px 6px", flexShrink: 0, fontSize: 12 }}
                disabled={currentIndex === STATUS_COLS.length - 1}
                onClick={() => moveStatus(card.id, 1)}
                aria-label="Mover para próxima coluna"
                title="Mover para frente"
              >
                {"▶"}
              </AppButton>

              <AppButton
                type="button"
                className="icon-action-btn"
                variant="ghost"
                style={{ padding: "2px 6px", flexShrink: 0, fontSize: 13 }}
                onClick={() => {
                  setCreateOpen(true);
                  setTodoTitulo(card.titulo);
                  setTodoDesc(card.descricao || "");
                  setTodoCat(card.categoria_id || null);
                  setTodoPrio((card.prioridade as any) || "media");
                  setEditingTodo(card);
                }}
                aria-label="Editar tarefa"
              >
                <i className="pi pi-pencil" aria-hidden="true" />
              </AppButton>
              <AppButton
                type="button"
                className="icon-action-btn"
                variant="ghost"
                style={{ padding: "2px 6px", flexShrink: 0, fontSize: 13 }}
                onClick={() => archiveTodo(card.id)}
                aria-label="Arquivar tarefa"
                title="Arquivar"
              >
                <i className="pi pi-folder" aria-hidden="true" />
              </AppButton>
              <AppButton
                type="button"
                className="icon-action-btn danger no-border"
                variant="danger"
                style={{ padding: "2px 6px", flexShrink: 0, fontSize: 13 }}
                onClick={() => removeTodo(card.id)}
                aria-label="Excluir tarefa"
              >
                <i className="pi pi-trash" aria-hidden="true" />
              </AppButton>
            </div>
          </div>

          {/* Detalhes expansíveis */}
          {isExpanded && hasDetails && (
            <div
              style={{
                padding: "8px 12px",
                paddingTop: 6,
                borderTop: "1px solid #e2e8f0",
                fontSize: 12,
                color: "#475569",
                whiteSpace: "pre-wrap",
              }}
            >
              {card.descricao}
            </div>
          )}
        </div>
      );
    }

    // MODO KANBAN
    return (
      <div
        key={card.id}
        className="todo-card"
        style={{
          background: "#fff",
          color: "#0f172a",
          borderLeft: `4px solid ${card.catColor}`,
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          padding: 10,
          marginBottom: 8,
        }}
      >
        {/* Cabeçalho com título e botões na mesma linha */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <span style={{ fontWeight: 700, fontSize: 14, flex: 1, color: "#0f172a" }}>{card.titulo}</span>
          
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {/* Botão expandir */}
            {hasDetails && (
              <AppButton
                type="button"
                variant="ghost"
                style={{
                  background: card.catColor,
                  color: textColorFor(card.catColor),
                  border: "none",
                  borderRadius: "50%",
                  width: 22,
                  height: 22,
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
                onClick={() => toggleExpand(card.id)}
                aria-label={isExpanded ? "Ocultar detalhes" : "Exibir detalhes"}
              >
                {isExpanded ? "−" : "+"}
              </AppButton>
            )}

            {/* Botões de movimentação */}
            <AppButton
              type="button"
              className="icon-action-btn"
              variant="ghost"
              style={{ fontSize: 11, padding: "2px 5px" }}
              disabled={col.value === STATUS_COLS[0].value}
              onClick={() => moveStatus(card.id, -1)}
              aria-label="Mover para coluna anterior"
              title="Mover para trás"
            >
              {"◀"}
            </AppButton>
            <AppButton
              type="button"
              className="icon-action-btn"
              variant="ghost"
              style={{ fontSize: 11, padding: "2px 5px" }}
              disabled={col.value === STATUS_COLS[STATUS_COLS.length - 1].value}
              onClick={() => moveStatus(card.id, 1)}
              aria-label="Mover para próxima coluna"
              title="Mover para frente"
            >
              {"▶"}
            </AppButton>

            {/* Checkbox */}
            <input
              type="checkbox"
              checked={card.done}
              onChange={(e) => toggleDone(card.id, e.target.checked)}
              aria-label="Concluir"
              style={{ width: 15, height: 15 }}
            />

            {/* Editar */}
            <AppButton
              type="button"
              className="icon-action-btn"
              variant="ghost"
              style={{ fontSize: 11, padding: "2px 5px" }}
              onClick={() => {
                setCreateOpen(true);
                setTodoTitulo(card.titulo);
                setTodoDesc(card.descricao || "");
                setTodoCat(card.categoria_id || null);
                setTodoPrio((card.prioridade as any) || "media");
                setEditingTodo(card);
              }}
              aria-label="Editar tarefa"
            >
              <i className="pi pi-pencil" aria-hidden="true" />
            </AppButton>

            {/* Arquivar */}
            <AppButton
              type="button"
              className="icon-action-btn"
              variant="ghost"
              style={{ fontSize: 11, padding: "2px 5px" }}
              onClick={() => archiveTodo(card.id)}
              aria-label="Arquivar tarefa"
              title="Arquivar"
            >
              <i className="pi pi-folder" aria-hidden="true" />
            </AppButton>

            {/* Excluir */}
            <AppButton
              type="button"
              className="icon-action-btn danger no-border"
              variant="danger"
              style={{ fontSize: 11, padding: "2px 5px" }}
              onClick={() => removeTodo(card.id)}
              aria-label="Excluir tarefa"
            >
              <i className="pi pi-trash" aria-hidden="true" />
            </AppButton>
          </div>
        </div>

        {/* Detalhes expansíveis */}
        {isExpanded && hasDetails && (
          <div style={{ marginBottom: 6, paddingTop: 6, borderTop: "1px solid #e2e8f0" }}>
            {card.descricao && (
              <div style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "#475569" }}>
                {card.descricao}
              </div>
            )}
          </div>
        )}

        {/* Categoria e Prioridade */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11 }}>
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 12,
              background: card.catColor,
              color: textColorFor(card.catColor),
              fontWeight: 700,
            }}
          >
            {card.catNome}
          </span>
          <span style={{ color: card.prioColor, fontWeight: 700 }}>● {card.prioLabel}</span>
        </div>
      </div>
    );
  };

  const mobileStatusCol = STATUS_COLS.find((c) => c.value === mobileStatus) || STATUS_COLS[0];
  const mobileStatusCount = statusCounts[mobileStatus] || 0;
  const mobileCards = (cards as any[]).filter((c) => c.status === mobileStatus);
  const semCategoriaCount = ((cardsByCategory as any)["sem_categoria"] || []).length as number;

  return (
    <AppPrimerProvider>
      <div className={`todo-board${isMobile ? " todo-mobile" : ""} vtur-legacy-module`}>
      {/* Título e subtítulo (apenas desktop) */}
      {!isMobile && (
        <AppToolbar
          className="mb-4"
          tone="config"
          title="Tarefas"
          subtitle="Crie e acompanhe suas tarefas de forma rápida e inteligente."
          actions={
            <AppButton type="button" variant="primary" onClick={() => setCreateOpen(true)}>
              + Nova tarefa
            </AppButton>
          }
        />
      )}
      {isMobile ? (
        <div className="todo-mobile-shell">
          <AppCard className="todo-mobile-title-card">
            <div className="todo-mobile-title">Tarefas</div>
          </AppCard>

          <div
            className="todo-mobile-sectionbar"
            style={{ background: mobilePanel === "categorias" ? "#2563eb" : mobileStatusCol.color }}
          >
            <span className="todo-mobile-sectionbar-title">
              {mobilePanel === "categorias" ? "Categorias" : mobileStatusCol.label}
            </span>
            <div className="todo-mobile-sectionbar-right">
              <span className="todo-mobile-sectionbar-count">
                {mobilePanel === "categorias" ? categorias.length : mobileStatusCount}
              </span>
            </div>
          </div>

          {loading && <div className="todo-mobile-hint">Carregando...</div>}
          {error && <div className="todo-mobile-error">{error}</div>}

          {mobilePanel === "categorias" ? (
            <div className="todo-mobile-category-list">
              <div className="todo-category-row todo-category-row-static">
                <div className="todo-category-main">
                  <span className="todo-category-dot" style={{ background: "#cbd5e1" }} aria-hidden="true" />
                  <span className="todo-category-name">Sem categoria</span>
                </div>
                <span className="todo-category-count">{semCategoriaCount}</span>
              </div>

              {categorias.length === 0 && (
                <div className="todo-mobile-hint">Crie categorias para organizar suas tarefas.</div>
              )}

              {categorias.map((c) => {
                const count = (((cardsByCategory as any)[c.id] || []) as any[]).length;
                return (
                  <div key={c.id} className="todo-category-row">
                    <div className="todo-category-main">
                      <span className="todo-category-dot" style={{ background: c.cor || "#e2e8f0" }} aria-hidden="true" />
                      <span className="todo-category-name">{c.nome}</span>
                    </div>
                    <span className="todo-category-count">{count}</span>
                    <div className="todo-category-actions">
                      <AppButton
                        type="button"
                        className="icon-action-btn"
                        variant="ghost"
                        onClick={() => {
                          setEditingCategory(c);
                          setCatNome(c.nome);
                          setCatCor(c.cor || PALETTE[0].hex);
                          setCreateCategoryOpen(true);
                        }}
                        aria-label="Editar categoria"
                        title="Editar"
                      >
                        <i className="pi pi-pencil" aria-hidden="true" />
                      </AppButton>
                      <AppButton
                        type="button"
                        className="icon-action-btn danger no-border"
                        variant="danger"
                        disabled={categoriasComTodo.has(c.id)}
                        onClick={() => removeCategoria(c.id)}
                        aria-label="Excluir categoria"
                        title={categoriasComTodo.has(c.id) ? "Remova as tarefas dessa categoria para excluir." : "Excluir"}
                      >
                        <i className="pi pi-trash" aria-hidden="true" />
                      </AppButton>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div className="todo-mobile-list">
                {mobileCards.map((card: any) => renderTodoCard(card, mobileStatusCol))}
                {mobileCards.length === 0 && (
                  <div className="todo-mobile-hint">Nenhuma tarefa por aqui.</div>
                )}
              </div>
              {archivedCards.length > 0 && (
                <div style={{ margin: "8px 0 0 0", borderRadius: 8, overflow: "hidden" }}>
                  <AppButton
                    type="button"
                    variant="secondary"
                    onClick={() => setArchivedOpen((o) => !o)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 16px", background: "#f1f5f9", border: "none", cursor: "pointer",
                      fontWeight: 700, fontSize: 14, color: "#475569",
                    }}
                  >
                    <span>{archivedOpen ? "▼" : "▶"}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <i className="pi pi-folder" aria-hidden="true" />
                      <span>Arquivados</span>
                    </span>
                    <span style={{ background: "#e2e8f0", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 800, color: "#64748b" }}>
                      {archivedCards.length}
                    </span>
                  </AppButton>
                  {archivedOpen && (
                    <div style={{ display: "grid", gap: 8, padding: 12, background: "#f8fafc" }}>
                      {archivedCards.map((card: any) => (
                        <div key={card.id} className="todo-list-item" style={{ opacity: 0.75, ["--todo-accent" as any]: card.catColor }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", flexWrap: "wrap" }}>
                            <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: "#475569", textDecoration: "line-through" }}>
                              {card.titulo}
                            </span>
                            <AppButton variant="secondary" style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => restoreTodo(card.id)}>
                              Restaurar
                            </AppButton>
                            <AppButton variant="danger" className="icon-action-btn danger no-border" onClick={() => removeTodo(card.id)} aria-label="Excluir">
                              <i className="pi pi-trash" aria-hidden="true" />
                            </AppButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <>
      {/* Categorias */}
      <AppCard
        style={{ marginBottom: 16 }}
        title="Categorias"
        actions={
          <AppButton type="button" variant="default" onClick={() => setCreateCategoryOpen(true)}>
            Nova categoria
          </AppButton>
        }
      >
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {categorias.length === 0 && <span style={{ color: "#94a3b8" }}>Nenhuma categoria.</span>}
          {categorias.map((c) => (
            <span
              key={c.id}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                background: c.cor || "#e2e8f0",
                color: textColorFor(c.cor || "#e2e8f0"),
                fontWeight: 700,
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {c.nome}
              <AppButton
                type="button"
                variant="default"
                style={{ padding: "2px 6px", minHeight: 24, fontSize: 11, lineHeight: 1 }}
                onClick={() => {
                  setEditingCategory(c);
                  setCatNome(c.nome);
                  setCatCor(c.cor || PALETTE[0].hex);
                  setCreateCategoryOpen(true);
                }}
                aria-label="Editar categoria"
              >
                <i className="pi pi-pencil" aria-hidden="true" />
              </AppButton>
              <AppButton
                type="button"
                className="icon-action-btn danger no-border"
                variant="danger"
                style={{ padding: "2px 6px", minHeight: 24, fontSize: 11, lineHeight: 1 }}
                disabled={categoriasComTodo.has(c.id)}
                onClick={() => removeCategoria(c.id)}
                aria-label="Excluir categoria"
                title={categoriasComTodo.has(c.id) ? "Remova as tarefas dessa categoria para excluir." : "Excluir categoria"}
              >
                <i className="pi pi-trash" aria-hidden="true" />
              </AppButton>
            </span>
          ))}
        </div>
      </AppCard>

      {/* Lista de tarefas */}
      <AppCard title="Lista de tarefas">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {loading && <span style={{ color: "#94a3b8" }}>Carregando...</span>}
            <AppField
              as="select"
              label="Visualização"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as ViewMode)}
              wrapperClassName="vtur-todo-viewmode-field"
              options={[
                { label: "Kanban", value: "kanban" },
                { label: "Lista simples", value: "lista" },
              ]}
            />
          </div>
        </div>
        {error && <AlertMessage variant="error">{error}</AlertMessage>}
        {!loading && cards.length === 0 && viewMode === "lista" && !archivedCards.length ? (
          <EmptyState
            title="Nenhuma tarefa cadastrada"
            description="Crie a primeira tarefa para começar a organizar seu fluxo."
            action={
              <AppButton type="button" variant="primary" onClick={() => setCreateOpen(true)}>
                Nova tarefa
              </AppButton>
            }
          />
        ) : null}
        {isMobile && (
          <div className="todo-mobile-tabs" aria-label="Filtrar status">
            {STATUS_COLS.map((col) => {
              const count = statusCounts[col.value as VisibleStatus] || 0;
              const active = mobileStatus === col.value;
              return (
                <AppButton
                  key={`tab-${col.value}`}
                  type="button"
                  variant={active ? "primary" : "default"}
                  onClick={() => setMobileStatus(col.value as VisibleStatus)}
                >
                  {col.label} ({count})
                </AppButton>
              );
            })}
          </div>
        )}

        {viewMode === "lista" ? (
          <div style={{ marginTop: 12 }}>
            {STATUS_COLS.filter((col) => !isMobile || col.value === mobileStatus).map((col) => (
              <div key={col.value} style={{ marginBottom: 20 }}>
                <div
                  style={{
                    background: col.color,
                    color: "#fff",
                    padding: "8px 12px",
                    borderRadius: "4px 4px 0 0",
                    fontWeight: 800,
                    fontSize: 14,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>{col.label}</span>
                  <span
                    style={{
                      background: "rgba(255,255,255,0.25)",
                      padding: "2px 8px",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  >
                    {cards.filter((c) => c.status === col.value).length}
                  </span>
                </div>
                <div style={{ background: col.body, padding: "8px 6px", borderRadius: "0 0 4px 4px", display: "grid", gap: 8 }}>
                  {cards
                    .filter((c) => c.status === col.value)
                    .map((card) => renderTodoCard(card, col))}
                  {cards.filter((c) => c.status === col.value).length === 0 && (
                    <div style={{ padding: 12, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                      Nenhum item
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="todo-columns">
            {STATUS_COLS.filter((col) => !isMobile || col.value === mobileStatus).map((col) => (
              <div key={col.value} className="todo-column">
                <div className="todo-column-header" style={{ background: col.color, color: "#fff", padding: "8px 12px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 800, fontSize: 14 }}>
                    <span className="todo-status-number">{col.order}</span>
                    {col.label}
                  </span>
                  <span className="todo-badge" style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}>
                    {cards.filter((c) => c.status === col.value).length}
                  </span>
                </div>
                <div className="todo-column-body" style={{ background: col.body, padding: 8 }}>
                  {Object.entries(cardsByCategory).map(([catKey, catCards]) => {
                    const filtered = (catCards as any[]).filter((c) => c.status === col.value);
                    if (filtered.length === 0) return null;
                    const cat = categorias.find((c) => c.id === catKey) || { nome: "Sem categoria", cor: "#cbd5e1" };
                    return (
                      <div key={catKey} style={{ marginBottom: 12 }}>
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            color: textColorFor(cat.cor || "#cbd5e1"),
                            background: cat.cor || "#cbd5e1",
                            padding: "4px 8px",
                            borderRadius: 4,
                            marginBottom: 6,
                            textTransform: "uppercase",
                            letterSpacing: 0.5,
                          }}
                        >
                          {cat.nome}
                        </div>
                        {filtered.map((card: any) => renderTodoCard(card, col))}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </AppCard>
      {archivedCards.length > 0 && (
        <AppCard style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
          <AppButton
            type="button"
            variant="secondary"
            onClick={() => setArchivedOpen((o) => !o)}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 10,
              padding: "10px 16px", background: "#f1f5f9", border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 14, color: "#475569", borderRadius: archivedOpen ? "8px 8px 0 0" : 8,
            }}
          >
            <span>{archivedOpen ? "▼" : "▶"}</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <i className="pi pi-folder" aria-hidden="true" />
              <span>Arquivados</span>
            </span>
            <span style={{ background: "#e2e8f0", borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 800, color: "#64748b" }}>
              {archivedCards.length}
            </span>
          </AppButton>
          {archivedOpen && (
            <div style={{ display: "grid", gap: 8, padding: 12, background: "#f8fafc" }}>
              {archivedCards.map((card: any) => (
                <div key={card.id} className="todo-list-item" style={{ opacity: 0.75, ["--todo-accent" as any]: card.catColor }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", flexWrap: "wrap" }}>
                    <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: "#475569", textDecoration: "line-through" }}>
                      {card.titulo}
                    </span>
                    <span className="todo-badge" style={{ padding: "2px 8px", borderRadius: 999, background: card.catColor, color: textColorFor(card.catColor), fontSize: 11, fontWeight: 800 }}>
                      {card.catNome}
                    </span>
                    <AppButton variant="secondary" style={{ fontSize: 12, padding: "3px 10px" }} onClick={() => restoreTodo(card.id)}>
                      Restaurar
                    </AppButton>
                    <AppButton variant="danger" className="icon-action-btn danger no-border" onClick={() => removeTodo(card.id)} aria-label="Excluir">
                      <i className="pi pi-trash" aria-hidden="true" />
                    </AppButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AppCard>
      )}
        </>
      )}

      {createOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setCreateOpen(false)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 720, width: "95vw", background: "#f8fafc" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title" style={{ fontWeight: 800 }}>{editingTodo ? "Editar" : "Nova"} tarefa</div>
              <AppButton className="modal-close" variant="ghost" onClick={() => setCreateOpen(false)} aria-label="Fechar">
                {"×"}
              </AppButton>
            </div>
            <form onSubmit={addTodo}>
              <div className="modal-body" style={{ display: "grid", gap: 10 }}>
                <div className="form-row" style={{ gap: 10, flexWrap: "wrap" }}>
                  <input
                    className="form-input"
                    style={{ minWidth: 260, flex: 1 }}
                    placeholder="Título da tarefa"
                    value={todoTitulo}
                    onChange={(e) => setTodoTitulo(e.target.value)}
                    required
                  />
                  <select
                    className="form-select"
                    value={todoPrio}
                    onChange={(e) => setTodoPrio(e.target.value as any)}
                    style={{ minWidth: 140 }}
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p.value} value={p.value}>
                        Prioridade: {p.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="form-select"
                    value={todoCat || ""}
                    onChange={(e) => setTodoCat(e.target.value || null)}
                    style={{ minWidth: 180 }}
                  >
                    <option value="">(Sem categoria)</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Descrição (opcional)</label>
                  <textarea
                    className="form-input"
                    rows={3}
                    placeholder="Detalhes, datas, links..."
                    value={todoDesc}
                    onChange={(e) => setTodoDesc(e.target.value)}
                  />
                </div>
                {error && <div style={{ color: "#b91c1c" }}>{error}</div>}
              </div>
              <div className="modal-footer mobile-stack-buttons" style={{ justifyContent: "flex-end" }}>
                <AppButton type="submit" variant="primary">
                  Salvar
                </AppButton>
                <AppButton type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </AppButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {createCategoryOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setCreateCategoryOpen(false)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 520, width: "95vw", background: "#f8fafc" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title" style={{ fontWeight: 800 }}>{editingCategory ? "Editar" : "Nova"} Categoria</div>
              <AppButton className="modal-close" variant="ghost" onClick={() => setCreateCategoryOpen(false)} aria-label="Fechar">
                {"×"}
              </AppButton>
            </div>
            <form onSubmit={addCategoria}>
              <div className="modal-body" style={{ display: "grid", gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Nome da categoria</label>
                  <input
                    className="form-input"
                    value={catNome}
                    onChange={(e) => setCatNome(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ position: "relative" }}>
                  <label className="form-label">Cor da categoria</label>
                  <AppButton
                    type="button"
                    variant="ghost"
                    className="color-select-toggle"
                    onClick={() => setShowCatColor((v) => !v)}
                  >
                    <span className="color-dot" style={{ background: catCor }} />
                    <span>Selecionar cor</span>
                    <span className="color-caret">{"▾"}</span>
                  </AppButton>
                  {showCatColor && (
                    <div className="color-select-list" ref={catColorListRef}>
                      <div className="palette-grid">
                        {PALETTE.map((c) => (
                          <AppButton
                            key={c.hex}
                            type="button"
                            variant="ghost"
                            className={`palette-swatch ${catCor === c.hex ? "active" : ""}`}
                            style={{ background: c.hex }}
                            onClick={() => {
                              setCatCor(c.hex);
                              setShowCatColor(false);
                            }}
                            aria-label={`Cor ${c.label || c.hex}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-footer mobile-stack-buttons" style={{ justifyContent: "flex-end" }}>
                <AppButton type="submit" variant="primary">
                  Salvar
                </AppButton>
                <AppButton type="button" variant="secondary" onClick={() => setCreateCategoryOpen(false)}>
                  Cancelar
                </AppButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {isMobile && !createOpen && !createCategoryOpen && (
        <AppButton
          type="button"
          variant="primary"
          className="todo-fab"
          onClick={() =>
            mobilePanel === "categorias"
              ? setCreateCategoryOpen(true)
              : setCreateOpen(true)
          }
          aria-label={mobilePanel === "categorias" ? "Nova categoria" : "Nova tarefa"}
          title={mobilePanel === "categorias" ? "Nova categoria" : "Nova tarefa"}
        >
          +
        </AppButton>
      )}
      </div>
    </AppPrimerProvider>
  );
}
