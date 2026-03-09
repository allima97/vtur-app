export type ConsultoriaLembreteCodigo = "none" | "15min" | "30min" | "1h" | "2h" | "1d";

export const CONSULTORIA_LEMBRETES: { value: ConsultoriaLembreteCodigo; label: string; minutes: number }[] = [
  { value: "none", label: "Sem lembrete", minutes: 0 },
  { value: "15min", label: "15 minutos antes", minutes: 15 },
  { value: "30min", label: "30 minutos antes", minutes: 30 },
  { value: "1h", label: "1 hora antes", minutes: 60 },
  { value: "2h", label: "2 horas antes", minutes: 120 },
  { value: "1d", label: "1 dia antes", minutes: 1440 },
];

export const CONSULTORIA_LEMBRETE_MINUTES: Record<string, number> = CONSULTORIA_LEMBRETES.reduce(
  (acc, item) => {
    acc[item.value] = item.minutes;
    return acc;
  },
  {} as Record<string, number>
);

export const CONSULTORIA_LEMBRETE_LABELS: Record<string, string> = CONSULTORIA_LEMBRETES.reduce(
  (acc, item) => {
    acc[item.value] = item.label;
    return acc;
  },
  {} as Record<string, string>
);

export function getConsultoriaLembreteMinutes(value?: string | null) {
  if (!value) return 0;
  return CONSULTORIA_LEMBRETE_MINUTES[value] ?? 0;
}

export function getConsultoriaLembreteLabel(value?: string | null) {
  if (!value) return "Sem lembrete";
  return CONSULTORIA_LEMBRETE_LABELS[value] ?? value;
}
