import React, { useEffect, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import timeGridPlugin from "@fullcalendar/timegrid";
import scrollGridPlugin from "@fullcalendar/scrollgrid";
import { supabaseBrowser } from "../../lib/supabase-browser";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { boundDateEndISO, selectAllInputOnFocus } from "../../lib/inputNormalization";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import ConfirmDialog from "../ui/ConfirmDialog";

type EventItem = {
  id: string;
  title: string;
  start: string;
  end?: string | null;
  descricao?: string | null;
  allDay?: boolean;
  display?: "auto" | "background" | "block" | "list-item";
  backgroundColor?: string;
  textColor?: string;
  className?: string;
};

const today = new Date().toISOString().split("T")[0];

type EventEditForm = {
  title: string;
  startDate: string;
  endDate: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  descricao: string;
};

export default function AgendaCalendar() {
  const supabase = supabaseBrowser;
  const { userId } = usePermissoesStore();
  const fullCalendarRef = React.useRef<FullCalendar | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [viewportReady, setViewportReady] = useState(false);
  const [currentViewType, setCurrentViewType] = useState("listWeek");
  const [currentMonthKey, setCurrentMonthKey] = useState(() => today.slice(0, 7));
  const [currentMonthTitle, setCurrentMonthTitle] = useState(() => formatMonthTitle(new Date()));
  const [visibleRange, setVisibleRange] = useState<{ inicio: string; fim: string } | null>(null);
  const visibleRangeRef = React.useRef<{ inicio: string; fim: string } | null>(null);
  const rangeCacheRef = React.useRef<Map<string, { expiresAt: number; items: EventItem[] }>>(new Map());
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEvent, setNewEvent] = useState({ title: "", start: today, end: today, allDay: true });
  const [newEventNota, setNewEventNota] = useState("");
  const [newEventStartTime, setNewEventStartTime] = useState("09:00");
  const [newEventEndTime, setNewEventEndTime] = useState("10:00");
  const [modalEvent, setModalEvent] = useState<EventItem | null>(null);
  const [editForm, setEditForm] = useState<EventEditForm | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [holidayEvents, setHolidayEvents] = useState<EventItem[]>([]);
  const [deleteConfirmEvent, setDeleteConfirmEvent] = useState<EventItem | null>(null);
  const calendarWrapRef = React.useRef<HTMLDivElement | null>(null);
  const fetchedYearsRef = React.useRef<Set<number>>(new Set());
  const weekdayShortFormatter = React.useMemo(
    () => new Intl.DateTimeFormat("pt-BR", { weekday: "short" }),
    []
  );
  const dayMonthFormatter = React.useMemo(
    () => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }),
    []
  );

  function formatWeekdayShort(date: Date) {
    const raw = weekdayShortFormatter.format(date);
    const cleaned = raw.replace(".", "").trim();
    if (!cleaned) return "";
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  function formatDayMonth(date: Date) {
    return dayMonthFormatter.format(date);
  }

  function formatMonthTitle(date: Date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const raw = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(date);
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
  }

  function splitDateTime(value: string | null | undefined) {
    if (!value) return { date: "", time: "" };
    const [date, timePart] = value.split("T");
    return { date, time: timePart ? timePart.slice(0, 5) : "" };
  }

  function formatDate(date: Date) {
    const d = String(date.getDate()).padStart(2, "0");
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const y = date.getFullYear();
    return `${d}-${m}-${y}`;
  }

  function formatDateTime(date: Date) {
    const hh = String(date.getHours()).padStart(2, "0");
    const mm = String(date.getMinutes()).padStart(2, "0");
    return `${formatDate(date)} ${hh}:${mm}`;
  }

  function parseISODateLocal(value: string) {
    const [y, m, d] = value.split("-").map((n) => Number(n));
    if (!y || !m || !d) return new Date(value);
    return new Date(y, m - 1, d);
  }

  function toISODateLocal(date: Date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function parseEventDate(value: string) {
    if (!value) return new Date();
    return value.includes("T") ? new Date(value) : parseISODateLocal(value);
  }

  function formatEventRange(ev: EventItem) {
    const hasTime = ev.start.includes("T") || ev.end?.includes("T");
    const start = parseEventDate(ev.start);
    const end = ev.end ? parseEventDate(ev.end) : start;
    const startLabel = hasTime ? formatDateTime(start) : formatDate(start);
    const endLabel = hasTime ? formatDateTime(end) : formatDate(end);
    if (endLabel === startLabel) return startLabel;
    return `${startLabel} → ${endLabel}`;
  }

  function tooltipText(ev: EventItem) {
    const primary = ev.title || ev.descricao || "Evento";
    const parts = [primary];
    parts.push(formatEventRange(ev));
    if (ev.descricao && ev.descricao !== primary) parts.push(ev.descricao);
    return parts.join("\n");
  }

  function openDetailsModal(ev: EventItem) {
    setModalEvent(ev);
    setEditForm(null);
  }

  function runAgendaCommand(action: "today" | "prev" | "next" | "dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek") {
    const api = fullCalendarRef.current?.getApi();
    if (!api) return;
    if (action === "today") {
      api.today();
    } else if (action === "prev") {
      api.prev();
    } else if (action === "next") {
      api.next();
    } else {
      api.changeView(action);
    }
    requestAnimationFrame(applyMobileCalendarTooltips);
  }

  function applyMobileCalendarTooltips() {
    if (!isMobile) return;
    const container = calendarWrapRef.current;
    if (!container) return;

    const tooltips: Array<{ selector: string; title: string }> = [
      { selector: ".fc-listWeek-button", title: "Lista" },
      { selector: ".fc-timeGridDay-button", title: "Dia" },
      { selector: ".fc-timeGridWeek-button", title: "Semana" },
      { selector: ".fc-dayGridMonth-button", title: "Mês" },
      { selector: ".fc-today-button", title: "Hoje" },
      { selector: ".fc-prev-button", title: "Anterior" },
      { selector: ".fc-next-button", title: "Próximo" },
    ];

    tooltips.forEach(({ selector, title }) => {
      const el = container.querySelector(selector);
      if (el instanceof HTMLElement) {
        el.setAttribute("title", title);
      }
    });
  }

  function startEditing(ev: EventItem) {
    const { date: startDate, time: startTime } = splitDateTime(ev.start);
    const { date: endDate, time: endTime } = splitDateTime(ev.end || ev.start);
    const allDay = ev.allDay ?? !startTime;
    setEditForm({
      title: ev.title,
      startDate: startDate || today,
      endDate: endDate || startDate || today,
      allDay,
      startTime: startTime || "09:00",
      endTime: endTime || startTime || "10:00",
      descricao: ev.descricao || "",
    });
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia ? window.matchMedia("(max-width: 768px)") : null;
    const updateViewport = () => setIsMobile(mediaQuery ? mediaQuery.matches : window.innerWidth <= 768);
    updateViewport();
    setViewportReady(true);

    if (!mediaQuery) return;
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", updateViewport);
      return () => mediaQuery.removeEventListener("change", updateViewport);
    }
    mediaQuery.addListener(updateViewport);
    return () => mediaQuery.removeListener(updateViewport);
  }, []);

  useEffect(() => {
    visibleRangeRef.current = visibleRange;
  }, [visibleRange]);

  useEffect(() => {
    if (typeof window === "undefined" || !isMobile) return;
    const handler = (event: Event) => {
      const action = (event as CustomEvent).detail?.action;
      if (
        action === "today" ||
        action === "dayGridMonth" ||
        action === "timeGridWeek" ||
        action === "timeGridDay" ||
        action === "listWeek"
      ) {
        runAgendaCommand(action);
      }
    };
    window.addEventListener("sgtur:agenda:setView", handler as EventListener);
    return () => window.removeEventListener("sgtur:agenda:setView", handler as EventListener);
  }, [isMobile]);

  useEffect(() => {
    if (typeof window === "undefined" || !currentViewType) return;
    window.dispatchEvent(
      new CustomEvent("sgtur:agenda:viewChanged", {
        detail: {
          view: currentViewType,
        },
      })
    );
  }, [currentViewType]);

  function intersectsRange(ev: EventItem, range: { inicio: string; fim: string }) {
    const startDate = (ev.start || "").split("T")[0];
    const endDate = (ev.end || ev.start || "").split("T")[0];
    if (!startDate) return false;
    const endValue = endDate || startDate;
    return startDate <= range.fim && endValue >= range.inicio;
  }

  const lastFetchedRangeRef = React.useRef<{ inicio: string; fim: string } | null>(null);

  function syncRangeCache(nextEvents: EventItem[]) {
    const range = visibleRangeRef.current;
    if (!range) return;
    const cacheKey = `${range.inicio}|${range.fim}`;
    rangeCacheRef.current.set(cacheKey, { expiresAt: Date.now() + 15_000, items: nextEvents });
    if (rangeCacheRef.current.size > 24) {
      const firstKey = rangeCacheRef.current.keys().next().value;
      if (firstKey) rangeCacheRef.current.delete(firstKey);
    }
  }

  useEffect(() => {
    if (!visibleRange?.inicio || !visibleRange?.fim) return;

    const prev = lastFetchedRangeRef.current;
    if (prev && prev.inicio === visibleRange.inicio && prev.fim === visibleRange.fim) {
      return;
    }

    lastFetchedRangeRef.current = { inicio: visibleRange.inicio, fim: visibleRange.fim };
    const controller = new AbortController();
    let active = true;

    async function loadRange() {
      const cacheKey = `${visibleRange.inicio}|${visibleRange.fim}`;
      const cached = rangeCacheRef.current.get(cacheKey);
      const hasFreshCache = Boolean(cached && cached.expiresAt > Date.now());
      if (hasFreshCache) {
        setError(null);
        setLoading(false);
        setEvents(cached!.items);
      } else {
        setLoading(true);
        setError(null);
        setEvents([]);
      }
      try {
        const params = new URLSearchParams({ inicio: visibleRange.inicio, fim: visibleRange.fim });
        const resp = await fetch(`/api/v1/agenda/range?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!resp.ok) throw new Error("range");
        const json = (await resp.json()) as { items?: EventItem[] };
        if (!active) return;
        const evs =
          (json.items || []).map((row: any) => ({
            id: row.id,
            title: row.title,
            start: row.start,
            end: row.end ?? null,
            descricao: row.descricao ?? null,
            allDay: row.allDay ?? (!String(row.start || "").includes("T")),
          })) || [];
        rangeCacheRef.current.set(cacheKey, { expiresAt: Date.now() + 15_000, items: evs });
        if (rangeCacheRef.current.size > 24) {
          const firstKey = rangeCacheRef.current.keys().next().value;
          if (firstKey) rangeCacheRef.current.delete(firstKey);
        }
        setEvents(evs);
        setLoading(false);
      } catch (err: any) {
        if (!active) return;
        if (err?.name === "AbortError") return;
        if (!hasFreshCache) {
          setError("Erro ao carregar agenda.");
          setLoading(false);
        }
      }
    }

    loadRange();
    return () => {
      active = false;
      controller.abort();
    };
  }, [visibleRange?.inicio, visibleRange?.fim]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`agenda-itens-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "agenda_itens", filter: `user_id=eq.${userId}` },
        (payload: any) => {
          const range = visibleRangeRef.current;
          const eventType = String(payload?.eventType || "").toUpperCase();
          const row = payload?.new || payload?.old || null;
          if (!row) return;
          if (row.tipo && String(row.tipo) !== "evento") return;

          const mapped: EventItem = {
            id: row.id,
            title: row.titulo,
            start: row.start_at || row.start_date || today,
            end: row.end_at || row.end_date || row.start_at || row.start_date || null,
            descricao: row.descricao || null,
            allDay: row.all_day ?? !row.start_at,
          };

          setEvents((prev) => {
            const existsIdx = prev.findIndex((e) => e.id === mapped.id);
            if (eventType === "DELETE") {
              if (existsIdx === -1) return prev;
              const next = prev.filter((e) => e.id !== mapped.id);
              syncRangeCache(next);
              return next;
            }

            if (range && !intersectsRange(mapped, range)) {
              if (existsIdx === -1) return prev;
              const next = prev.filter((e) => e.id !== mapped.id);
              syncRangeCache(next);
              return next;
            }

            if (existsIdx === -1) {
              const next = [...prev, mapped].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
              syncRangeCache(next);
              return next;
            }
            const next = prev.slice();
            next[existsIdx] = { ...next[existsIdx], ...mapped };
            const sorted = next.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
            syncRangeCache(sorted);
            return sorted;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!newEvent.title.trim() || !newEvent.start) return;
    const start = newEvent.start;
    const end = newEvent.end || newEvent.start;
    const hasTime = !newEvent.allDay;
    const startAt = hasTime ? `${start}T${newEventStartTime}:00` : null;
    const endAt = hasTime ? `${end}T${newEventEndTime || newEventStartTime}:00` : null;
    const range = visibleRangeRef.current;
    fetch("/api/v1/agenda/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        titulo: newEvent.title.trim(),
        start_date: start,
        end_date: end,
        all_day: newEvent.allDay,
        descricao: newEventNota.trim() || null,
        start_at: startAt,
        end_at: endAt,
        range_inicio: range?.inicio || "",
        range_fim: range?.fim || "",
      }),
    })
      .then(async (resp) => {
        if (!resp.ok) throw new Error(await resp.text());
        const json = (await resp.json()) as { item?: any };
        if (!json.item) throw new Error("Sem retorno");
        const data = json.item;
        setEvents((prev) => {
          const next = [
            ...prev,
            {
              id: data.id,
              title: data.titulo,
              start: data.start_at || data.start_date || start,
              end: data.end_at || data.end_date || end,
              descricao: data.descricao || null,
              allDay: data.all_day ?? !hasTime,
            },
          ];
          syncRangeCache(next);
          return next;
        });
        setNewEvent({ title: "", start: today, end: today, allDay: true });
        setNewEventNota("");
        setNewEventStartTime("09:00");
        setNewEventEndTime("10:00");
        setCreateModalOpen(false);
      })
      .catch(() => setError("Erro ao salvar evento."));
  }

  async function removeEvent(id: string) {
    setEvents((prev) => {
      const next = prev.filter((ev) => ev.id !== id);
      syncRangeCache(next);
      return next;
    });
    const range = visibleRangeRef.current;
    const params = new URLSearchParams({ id });
    if (range?.inicio && range?.fim) {
      params.set("range_inicio", range.inicio);
      params.set("range_fim", range.fim);
    }
    try {
      const resp = await fetch(`/api/v1/agenda/delete?${params.toString()}`, {
        method: "DELETE",
      });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao excluir evento.");
    }
  }

  async function updateEventLocalAndRemote(id: string, changes: Partial<EventItem>) {
    setEvents((prev) => {
      const next = prev.map((ev) => (ev.id === id ? { ...ev, ...changes } : ev));
      syncRangeCache(next);
      return next;
    });

    const payload: any = { id };
    if (changes.title !== undefined) payload.title = changes.title;
    if (changes.descricao !== undefined) payload.descricao = changes.descricao;
    if (changes.allDay !== undefined) payload.allDay = changes.allDay;
    if (changes.start !== undefined) payload.start = changes.start;
    if (changes.end !== undefined) payload.end = changes.end;

    const range = visibleRangeRef.current;
    if (range?.inicio && range?.fim) {
      payload.range_inicio = range.inicio;
      payload.range_fim = range.fim;
    }

    if (Object.keys(payload).length <= 1) return;

    try {
      const resp = await fetch("/api/v1/agenda/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao atualizar evento.");
    }
  }

  function handleEventClick(info: any) {
    const id = info?.event?.id;
    if (!id) return;
    const ev = events.find((e) => e.id === id);
    if (!ev) return;
    openDetailsModal(ev);
  }

  function handleEditFromModal(ev: EventItem) {
    if (!editForm) startEditing(ev);
  }

  function handleSaveEdit(ev: EventItem) {
    if (!editForm) return;
    const hasTime = !editForm.allDay;
    const startISO = hasTime ? `${editForm.startDate}T${editForm.startTime}:00` : editForm.startDate;
    const endISO = hasTime ? `${editForm.endDate || editForm.startDate}T${editForm.endTime || editForm.startTime}:00` : (editForm.endDate || editForm.startDate);
    void updateEventLocalAndRemote(ev.id, {
      title: editForm.title.trim() || ev.title,
      descricao: editForm.descricao.trim() || null,
      allDay: editForm.allDay,
      start: startISO,
      end: endISO,
    });
    const updated = {
      ...ev,
      title: editForm.title.trim() || ev.title,
      descricao: editForm.descricao.trim() || null,
      allDay: editForm.allDay,
      start: startISO,
      end: endISO,
    };
    setModalEvent(updated);
    setEditForm(null);
  }

  function handleDeleteFromModal(ev: EventItem) {
    setDeleteConfirmEvent(ev);
  }

  function confirmDeleteEvent() {
    if (!deleteConfirmEvent) return;
    void removeEvent(deleteConfirmEvent.id);
    setDeleteConfirmEvent(null);
    setModalEvent(null);
  }

  async function fetchHolidays(year: number) {
    if (!year || fetchedYearsRef.current.has(year)) return;
    fetchedYearsRef.current.add(year);
    try {
      const resp = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
      if (!resp.ok) throw new Error("falha feriados");
      const data: { date: string; name: string }[] = await resp.json();
      const mapped: EventItem[] = (data || []).map((f) => ({
        id: `feriado-${f.date}`,
        title: "",
        start: f.date,
        end: null,
        allDay: true,
        display: "background",
        backgroundColor: "#fff2cc",
        descricao: f.name,
        className: "agenda-feriado-bg",
      }));
      setHolidayEvents((prev) => {
        const existingIds = new Set(prev.map((h) => h.id));
        const merged = [...prev];
        mapped.forEach((h) => {
          if (!existingIds.has(h.id)) merged.push(h);
        });
        return merged;
      });
    } catch (e) {
      console.error("Erro ao carregar feriados", e);
    }
  }

  const calendarEvents = React.useMemo(() => {
    const isListView = currentViewType.startsWith("list");
    return isListView ? events : [...events, ...holidayEvents];
  }, [events, holidayEvents, currentViewType]);
  const feriadosDoMes = React.useMemo(() => {
    const monthPrefix = `${currentMonthKey}-`;
    return holidayEvents
      .filter((h) => h.id.startsWith("feriado-") && h.start.startsWith(monthPrefix))
      .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  }, [holidayEvents, currentMonthKey]);

  function formatHolidayLine(dateISO: string, name: string) {
    const [, month, day] = dateISO.split("-");
    if (!month || !day) return `${dateISO} - ${name}`;
    return `${day}/${month} - ${name}`;
  }

  function openCreateModal() {
    setNewEvent({ title: "", start: today, end: today, allDay: true });
    setNewEventNota("");
    setNewEventStartTime("09:00");
    setNewEventEndTime("10:00");
    setModalEvent(null);
    setEditForm(null);
    setCreateModalOpen(true);
  }

  function openCreateModalAt(date: Date, allDay: boolean) {
    const dateISO = toISODateLocal(date);
    if (!dateISO) {
      openCreateModal();
      return;
    }

    if (allDay) {
      setNewEvent({ title: "", start: dateISO, end: dateISO, allDay: true });
      setNewEventStartTime("09:00");
      setNewEventEndTime("10:00");
    } else {
      const hh = String(date.getHours()).padStart(2, "0");
      const mm = String(date.getMinutes()).padStart(2, "0");
      const startTime = `${hh}:${mm}`;

      const endCandidate = new Date(date.getTime() + 60 * 60 * 1000);
      const endSameDay = toISODateLocal(endCandidate) === dateISO;
      const endHH = String(endCandidate.getHours()).padStart(2, "0");
      const endMM = String(endCandidate.getMinutes()).padStart(2, "0");
      const endTime = endSameDay ? `${endHH}:${endMM}` : "23:59";

      setNewEvent({ title: "", start: dateISO, end: dateISO, allDay: false });
      setNewEventStartTime(startTime);
      setNewEventEndTime(endTime);
    }

    setNewEventNota("");
    setModalEvent(null);
    setEditForm(null);
    setCreateModalOpen(true);
  }

  return (
    <div className="agenda-page" style={{ display: "grid", gap: 16 }}>
      {viewportReady && isMobile && (
        <div className="agenda-month-card" aria-label={`Mês atual: ${currentMonthTitle}`}>
          <AppButton
            type="button"
            variant="ghost"
            className="agenda-month-nav-btn"
            onClick={() => runAgendaCommand("prev")}
            aria-label="Ir para período anterior"
            title="Anterior"
          >
            <i className="pi pi-angle-left" aria-hidden="true" />
          </AppButton>
          <div className="agenda-month-title">{currentMonthTitle}</div>
          <AppButton
            type="button"
            variant="ghost"
            className="agenda-month-nav-btn"
            onClick={() => runAgendaCommand("next")}
            aria-label="Ir para próximo período"
            title="Próximo"
          >
            <i className="pi pi-angle-right" aria-hidden="true" />
          </AppButton>
        </div>
      )}

      <div className="agenda-calendar-shell">
        {viewportReady && !isMobile && (
          <AppCard
            className="agenda-top-card"
            tone="info"
            title="Agenda (Eventos)"
            actions={
              <div className="mobile-stack-buttons vtur-actions-end">
                <AppButton
                  type="button"
                  variant="primary"
                  className="agenda-add-btn"
                  onClick={openCreateModal}
                >
                  Adicionar evento
                </AppButton>
              </div>
            }
          />
        )}

        <div
          ref={calendarWrapRef}
          className={isMobile ? "agenda-calendar-mobile" : "agenda-calendar-desktop"}
        >
          {viewportReady ? (
            <FullCalendar
              ref={fullCalendarRef}
              plugins={[dayGridPlugin, interactionPlugin, listPlugin, timeGridPlugin, scrollGridPlugin]}
              initialView={isMobile ? "listWeek" : "dayGridMonth"}
              height="auto"
              events={calendarEvents}
              dayMinWidth={0}
              headerToolbar={
                isMobile
                  ? false
                  : { left: "prev,next today", center: "title", right: "dayGridMonth,timeGridWeek,timeGridDay,listMonth" }
              }
              views={
                isMobile
                  ? {
                      timeGridWeek: {
                        dayHeaderContent: (args: any) => (
                          <>
                            <span className="agenda-week-header-weekday">{formatWeekdayShort(args.date)}</span>
                            <span className="agenda-week-header-date">{formatDayMonth(args.date)}</span>
                          </>
                        ),
                      },
                      timeGridDay: { dayHeaderFormat: { weekday: "short", day: "2-digit" } },
                      dayGridMonth: { dayHeaderFormat: { weekday: "narrow" } },
                    }
                  : undefined
              }
              buttonText={{
                today: "Hoje",
                month: "Mês",
                week: "Semana",
                day: "Dia",
                list: "Lista",
              }}
              editable
              eventDurationEditable
              eventResizableFromStart
              dateClick={(arg) => {
                if (!arg?.date) return;
                openCreateModalAt(arg.date, Boolean((arg as any).allDay));
              }}
              navLinks={!isMobile}
              slotDuration="00:30:00"
              slotLabelFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
              allDayText={isMobile ? "Dia" : undefined}
              locale="pt-br"
              datesSet={(arg) => {
                const ref = (arg as any)?.view?.currentStart || arg.start;
                const viewType = (arg as any)?.view?.type;
                if (typeof viewType === "string") {
                  setCurrentViewType(viewType);
                }
                if (ref) {
                  setCurrentMonthTitle(formatMonthTitle(ref));
                  setCurrentMonthKey(`${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`);
                }
                if (arg.start && arg.end) {
                  const endInclusive = new Date(arg.end);
                  endInclusive.setDate(endInclusive.getDate() - 1);
                  const inicio = toISODateLocal(arg.start);
                  const fim = toISODateLocal(endInclusive);
                  if (inicio && fim) {
                    const prev = visibleRangeRef.current;
                    if (!prev || prev.inicio !== inicio || prev.fim !== fim) {
                      setVisibleRange({ inicio, fim });
                    }
                  }
                }
                const startYear = arg.start?.getFullYear?.();
                const endYear = arg.end?.getFullYear?.();
                if (startYear) fetchHolidays(startYear);
                if (endYear && endYear !== startYear) fetchHolidays(endYear);
                requestAnimationFrame(applyMobileCalendarTooltips);
              }}
              eventDidMount={(info) => {
                const ev = calendarEvents.find((e) => e.id === info.event.id);
                if (ev) info.el.setAttribute("title", tooltipText(ev));
              }}
              eventDrop={(info) => {
                const id = info.event.id;
                const startISO = info.event.startStr;
                const endISO = info.event.endStr || startISO;
                const startTime = startISO.includes("T") ? startISO.split("T")[1] : null;
                if (!id) return;
                setEvents((prev) =>
                  prev.map((ev) => (ev.id === id ? { ...ev, start: startISO, end: endISO, allDay: !startTime } : ev))
                );
                const range = visibleRangeRef.current;
                fetch("/api/v1/agenda/update", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id,
                    start: startISO,
                    end: endISO,
                    allDay: !startTime,
                    range_inicio: range?.inicio || "",
                    range_fim: range?.fim || "",
                  }),
                }).catch(() => setError("Erro ao atualizar evento."));
              }}
              eventResize={(info) => {
                const id = info.event.id;
                const startISO = info.event.startStr;
                const endISO = info.event.endStr || startISO;
                const startTime = startISO.includes("T") ? startISO.split("T")[1] : null;
                if (!id) return;
                setEvents((prev) =>
                  prev.map((ev) => (ev.id === id ? { ...ev, start: startISO, end: endISO, allDay: !startTime } : ev))
                );
                const range = visibleRangeRef.current;
                fetch("/api/v1/agenda/update", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    id,
                    start: startISO,
                    end: endISO,
                    allDay: !startTime,
                    range_inicio: range?.inicio || "",
                    range_fim: range?.fim || "",
                  }),
                }).catch(() => setError("Erro ao atualizar evento."));
              }}
              eventClick={handleEventClick}
            />
          ) : (
            <div>Carregando agenda...</div>
          )}
        </div>
        {error && <AlertMessage variant="error">{error}</AlertMessage>}
        {feriadosDoMes.length > 0 && (
          <div className="escala-feriados-resumo" style={{ marginTop: 12 }}>
            <strong className="escala-feriados-title">Feriados do Mês</strong>
            <ul>
              {feriadosDoMes.map((h) => (
                <li key={h.id}>{formatHolidayLine(h.start, h.descricao || h.title)}</li>
              ))}
            </ul>
          </div>
        )}
        {!isMobile && (
          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            {events.length === 0 && !loading && <EmptyState title="Nenhum evento" />}
            {events.map((ev) => (
              <AppCard
                key={ev.id}
                tone="default"
                className="agenda-event-item"
                title={ev.title}
                subtitle={`${ev.start}${ev.end && ev.end !== ev.start ? ` → ${ev.end}` : ""}`}
                actions={
                  <AppButton type="button" variant="secondary" onClick={() => removeEvent(ev.id)}>
                    Remover
                  </AppButton>
                }
              >
                {ev.descricao ? (
                  <div style={{ color: "#0f172a", whiteSpace: "pre-wrap" }}>{ev.descricao}</div>
                ) : null}
              </AppCard>
            ))}
          </div>
        )}
      </div>

      {viewportReady && isMobile && !createModalOpen && !modalEvent && (
        <AppButton
          type="button"
          variant="primary"
          className="agenda-fab"
          onClick={openCreateModal}
          aria-label="Adicionar evento"
          title="Adicionar evento"
        >
          +
        </AppButton>
      )}

      {createModalOpen && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setCreateModalOpen(false)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 520, width: "95vw", background: "#f8fafc" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title" style={{ fontWeight: 800 }}>Novo evento</div>
              <AppButton type="button" variant="ghost" onClick={() => setCreateModalOpen(false)} aria-label="Fechar">
                ×
              </AppButton>
            </div>
            <form onSubmit={handleAddEvent}>
              <div className="modal-body" style={{ display: "grid", gap: 8 }}>
                <AppField
                  wrapperClassName="form-group"
                  label="Titulo do evento"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent((prev) => ({ ...prev, title: e.target.value }))}
                  required
                />
                <div className="form-row mobile-stack" style={{ gap: 8 }}>
                  <div style={{ minWidth: 150 }}>
                    <AppField
                      as="input"
                      type="date"
                      wrapperClassName="form-group"
                      label="Data Início"
                      value={newEvent.start}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => {
                        const nextStart = e.target.value;
                        setNewEvent((prev) => ({
                          ...prev,
                          start: nextStart,
                          end: boundDateEndISO(nextStart, prev.end || ""),
                        }));
                      }}
                      required
                    />
                  </div>
                  <div style={{ minWidth: 150 }}>
                    <AppField
                      as="input"
                      type="date"
                      wrapperClassName="form-group"
                      label="Data Final"
                      value={newEvent.end}
                      min={newEvent.start || undefined}
                      onFocus={selectAllInputOnFocus}
                      onChange={(e) => {
                        const nextEnd = e.target.value;
                        setNewEvent((prev) => ({
                          ...prev,
                          end: boundDateEndISO(prev.start, nextEnd),
                        }));
                      }}
                    />
                  </div>
                </div>
                {!newEvent.allDay && (
                  <div className="form-row mobile-stack" style={{ gap: 8 }}>
                    <div style={{ minWidth: 140 }}>
                      <AppField
                        as="input"
                        type="time"
                        wrapperClassName="form-group"
                        label="Hora inicio"
                        value={newEventStartTime}
                        onChange={(e) => setNewEventStartTime(e.target.value)}
                      />
                    </div>
                    <div style={{ minWidth: 140 }}>
                      <AppField
                        as="input"
                        type="time"
                        wrapperClassName="form-group"
                        label="Hora fim"
                        value={newEventEndTime}
                        onChange={(e) => setNewEventEndTime(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={newEvent.allDay}
                    onChange={(e) => setNewEvent((prev) => ({ ...prev, allDay: e.target.checked }))}
                  />
                  Dia inteiro
                </label>
                <AppField
                  as="textarea"
                  rows={3}
                  wrapperClassName="form-group"
                  label="Notas (opcional)"
                  value={newEventNota}
                  onChange={(e) => setNewEventNota(e.target.value)}
                />
                {error && <AlertMessage variant="error">{error}</AlertMessage>}
              </div>
              <div className="modal-footer mobile-stack-buttons vtur-actions-end">
                <AppButton type="submit" variant="primary">
                  Salvar
                </AppButton>
                <AppButton type="button" variant="secondary" onClick={() => setCreateModalOpen(false)}>
                  Cancelar
                </AppButton>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalEvent && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setModalEvent(null)}>
          <div
            className="modal-panel"
            style={{ maxWidth: 520, width: "95vw", background: "#f8fafc" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <div className="modal-title" style={{ fontWeight: 800 }}>Detalhes do evento</div>
              <AppButton type="button" variant="ghost" onClick={() => setModalEvent(null)} aria-label="Fechar">
                ×
              </AppButton>
            </div>
            <div className="modal-body" style={{ display: "grid", gap: 8 }}>
              {!editForm && (
                <>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{modalEvent.title}</div>
                  <div style={{ color: "#475569" }}>{formatEventRange(modalEvent)}</div>
                  {modalEvent.descricao ? (
                    <div style={{ whiteSpace: "pre-wrap", color: "#0f172a" }}>{modalEvent.descricao}</div>
                  ) : (
                    <div style={{ color: "#94a3b8" }}>Sem notas.</div>
                  )}
                  <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#475569" }}>
                    <input type="checkbox" checked={modalEvent.allDay ?? false} readOnly /> Dia inteiro
                  </div>
                </>
              )}
              {editForm && (
                <>
                  <AppField
                    wrapperClassName="form-group"
                    label="Titulo"
                    value={editForm.title}
                    onChange={(e) => setEditForm((prev) => prev && ({ ...prev, title: e.target.value }))}
                  />
                  <div className="form-row mobile-stack" style={{ gap: 8 }}>
                    <div style={{ minWidth: 150 }}>
                      <AppField
                        as="input"
                        type="date"
                        wrapperClassName="form-group"
                        label="Data Início"
                        value={editForm.startDate}
                        onFocus={selectAllInputOnFocus}
                        onChange={(e) => {
                          const nextStart = e.target.value;
                          setEditForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  startDate: nextStart,
                                  endDate: boundDateEndISO(nextStart, prev.endDate),
                                }
                              : prev
                          );
                        }}
                      />
                    </div>
                    <div style={{ minWidth: 150 }}>
                      <AppField
                        as="input"
                        type="date"
                        wrapperClassName="form-group"
                        label="Data Final"
                        value={editForm.endDate}
                        min={editForm.startDate || undefined}
                        onFocus={selectAllInputOnFocus}
                        onChange={(e) => {
                          const nextEnd = e.target.value;
                          setEditForm((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  endDate: boundDateEndISO(prev.startDate, nextEnd),
                                }
                              : prev
                          );
                        }}
                      />
                    </div>
                  </div>
                  {!editForm.allDay && (
                    <div className="form-row mobile-stack" style={{ gap: 8 }}>
                      <div style={{ minWidth: 140 }}>
                        <AppField
                          as="input"
                          type="time"
                          wrapperClassName="form-group"
                          label="Hora inicio"
                          value={editForm.startTime}
                          onChange={(e) => setEditForm((prev) => prev && ({ ...prev, startTime: e.target.value }))}
                        />
                      </div>
                      <div style={{ minWidth: 140 }}>
                        <AppField
                          as="input"
                          type="time"
                          wrapperClassName="form-group"
                          label="Hora fim"
                          value={editForm.endTime}
                          onChange={(e) => setEditForm((prev) => prev && ({ ...prev, endTime: e.target.value }))}
                        />
                      </div>
                    </div>
                  )}
                  <label className="flex items-center gap-2" style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={editForm.allDay}
                      onChange={(e) => setEditForm((prev) => prev && ({ ...prev, allDay: e.target.checked }))}
                    />
                    Dia inteiro
                  </label>
                  <AppField
                    as="textarea"
                    rows={3}
                    wrapperClassName="form-group"
                    label="Notas"
                    value={editForm.descricao}
                    onChange={(e) => setEditForm((prev) => prev && ({ ...prev, descricao: e.target.value }))}
                  />
                </>
              )}
            </div>
            <div className="modal-footer mobile-stack-buttons vtur-actions-end">
              {!editForm ? (
                <>
                  <AppButton
                    type="button"
                    variant="danger"
                    onClick={() => handleDeleteFromModal(modalEvent)}
                  >
                    Excluir
                  </AppButton>
                  <AppButton
                    type="button"
                    variant="primary"
                    onClick={() => handleEditFromModal(modalEvent)}
                  >
                    Editar
                  </AppButton>
                  <AppButton type="button" variant="secondary" onClick={() => setModalEvent(null)}>
                    Fechar
                  </AppButton>
                </>
              ) : (
                <>
                  <AppButton type="button" variant="primary" onClick={() => handleSaveEdit(modalEvent)}>
                    Salvar
                  </AppButton>
                  <AppButton type="button" variant="secondary" onClick={() => setEditForm(null)}>
                    Cancelar
                  </AppButton>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleteConfirmEvent)}
        title="Remover evento"
        message="Remover este evento?"
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        onConfirm={confirmDeleteEvent}
        onCancel={() => setDeleteConfirmEvent(null)}
      />
    </div>
  );
}
