import { formatDatePtBrInTimeZone } from "./dateTime";

export function formatarDataParaExibicao(
  value?: string | Date | null,
  fallback = "-"
) {
  return formatDatePtBrInTimeZone(value, fallback);
}
