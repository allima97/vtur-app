import { useState, useEffect, useRef, useCallback, useId, useMemo } from "react";
import { exportRoteiroPdf } from "../../lib/quote/roteiroPdf";
import { selectAllInputOnFocus } from "../../lib/inputNormalization";
import { extractPlainTextFromFile } from "../../lib/documentosViagens/extractPlainTextFromFile";
import {
  mergeImportedRoteiroHotels,
  normalizeImportedHotelRegime,
  normalizeImportedHotelTarifa,
  parseImportedRoteiroHotels,
} from "../../lib/roteiroHotelImport";
import {
  collectImportedRoteiroAereoAliasValues,
  mergeImportedRoteiroAereo,
  parseImportedRoteiroAereo,
} from "../../lib/roteiroAereoImport";
import { loadAirportCodeCityLookup } from "../../lib/airportCodeCityLookup";
import { mergeImportedRoteiroPasseios, parseImportedRoteiroPasseios } from "../../lib/roteiroPasseioImport";
import {
  buildItineraryTransferCities,
  generateAutomaticRoteiroDias,
  type ItineraryTransferCity,
} from "../../lib/roteiroItineraryBuilder";
import { toISODateLocal } from "../../lib/dateTime";
import {
  extractSeguroViagemIncludeLinesFromPasseios,
  isSeguroPasseioLike,
  mergeUniqueTextLines,
} from "../../lib/roteiroSeguro";
import AlertMessage from "../ui/AlertMessage";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppDialog from "../ui/primer/AppDialog";
import AppField from "../ui/primer/AppField";
import AppNoticeDialog from "../ui/primer/AppNoticeDialog";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

// ─── Types ────────────────────────────────────────────────────────────────────
type RotHotel = {
  id?: string;
  cidade: string;
  hotel: string;
  endereco: string;
  data_inicio: string;
  data_fim: string;
  noites: number;
  qtd_apto: number;
  apto: string;
  categoria: string;
  regime: string;
  tipo_tarifa: string;
  qtd_adultos: number;
  qtd_criancas: number;
  valor_original: number;
  valor_final: number;
  ordem: number;
};
type RotPasseio = {
  id?: string;
  cidade: string;
  passeio: string;
  fornecedor: string;
  data_inicio: string;
  data_fim: string;
  tipo: string;
  ingressos: string;
  qtd_adultos: number;
  qtd_criancas: number;
  valor_original: number;
  valor_final: number;
  ordem: number;
};
type RotTransporte = {
  id?: string;
  trecho: string;
  cia_aerea: string;
  data_voo: string;
  classe_reserva: string;
  hora_saida: string;
  aeroporto_saida: string;
  duracao_voo: string;
  tipo_voo: string;
  hora_chegada: string;
  aeroporto_chegada: string;
  tarifa_nome: string;
  reembolso_tipo: string;
  qtd_adultos: number;
  qtd_criancas: number;
  taxas: number;
  valor_total: number;
  tipo: string;
  fornecedor: string;
  descricao: string;
  data_inicio: string;
  data_fim: string;
  categoria: string;
  observacao: string;
  ordem: number;
};
type RotDia = {
  id?: string;
  percurso: string;
  cidade: string;
  data: string;
  descricao: string;
  ordem: number;
};
type RotInvestimento = {
  id?: string;
  tipo: string;
  valor_por_pessoa: number;
  qtd_apto: number;
  valor_por_apto: number;
  ordem: number;
};
type RotPagamento = {
  id?: string;
  servico: string;
  valor_total_com_taxas: number;
  taxas: number;
  forma_pagamento: string;
  ordem: number;
};
type Cliente = { id: string; nome: string; whatsapp?: string; email?: string };
type DiaBanco = { id: string; percurso?: string; cidade: string; descricao: string; data?: string };
type ItinerarioConfig = {
  traslados: ItineraryTransferCity[];
};
type PagamentoEditState = {
  mode: "categoria" | "forma";
  categoria: string;
  currentValue: string;
};
type PagamentoDeleteState = {
  mode: "categoria" | "forma";
  categoria: string;
  target: string;
};

type AbaId = "hoteis" | "passeios" | "transporte" | "itinerario" | "investimento" | "pagamento" | "inclusoes" | "informacoes";
type AbaMeta = {
  id: AbaId;
  label: string;
  shortLabel: string;
  hint: string;
  icon: string;
};

const ABAS: AbaMeta[] = [
  {
    id: "itinerario",
    label: "Itinerário Personalizado",
    shortLabel: "Itinerário",
    hint: "Dias, percurso e descrição detalhada.",
    icon: "pi pi-map",
  },
  {
    id: "hoteis",
    label: "Hotéis Sugeridos",
    shortLabel: "Hotéis",
    hint: "Hospedagem, datas, categoria e regime.",
    icon: "pi pi-building",
  },
  {
    id: "passeios",
    label: "Passeios e Serviços",
    shortLabel: "Passeios e Serviços",
    hint: "Serviços, passeios, fornecedor, datas e valores.",
    icon: "pi pi-camera",
  },
  {
    id: "transporte",
    label: "Passagem Aérea",
    shortLabel: "Passagem Aérea",
    hint: "Trechos aéreos, companhia, horários, tarifa e valor total.",
    icon: "pi pi-ticket",
  },
  {
    id: "investimento",
    label: "Investimento",
    shortLabel: "Investimento",
    hint: "Valores por pessoa, pax e apartamento.",
    icon: "pi pi-wallet",
  },
  {
    id: "pagamento",
    label: "Formas de Pagamento",
    shortLabel: "Pagamento",
    hint: "Serviços, taxas e forma de cobrança.",
    icon: "pi pi-credit-card",
  },
  {
    id: "inclusoes",
    label: "Incluído / Não Incluído",
    shortLabel: "Inclusões",
    hint: "Itens incluídos e excluídos da viagem.",
    icon: "pi pi-check-square",
  },
  {
    id: "informacoes",
    label: "Informações Importantes",
    shortLabel: "Informações",
    hint: "Regras e observações finais do roteiro.",
    icon: "pi pi-info-circle",
  },
];

const PAGAMENTO_SERVICO_OPTIONS_BASE = [
  "Pacote Completo",
  "Passagem Aérea",
  "Hospedagem",
  "Passeios e Serviços",
  "Seguro Viagem",
  "Demais Serviços",
] as const;

const PAGAMENTO_CATEGORIAS_BASE = ["Pagamento CVC", "Pagamento Cia Aérea"] as const;
const PAGAMENTO_FORMA_TIPO_PREFIX = "forma_pagamento_categoria::";
const PAGAMENTO_CATEGORIA_EXCLUIDA_TIPO = "pagamento_categoria_excluida";
const PAGAMENTO_FORMA_EXCLUIDA_TIPO_PREFIX = "forma_pagamento_categoria_excluida::";
const PAGAMENTO_FORMAS_BASE_POR_CATEGORIA: Record<string, string[]> = {
  "Pagamento CVC": [
    "Pagamento em até 12x sem juros no cartão de crédito",
    "Pagamento de 05x a 08x sem juros no cartão com 2% de desconto (fora taxas)",
    "Pagamento de 01x a 04x sem juros no cartão com 4% de desconto (fora taxas)",
    "Pagamento no PIX com 6% de desconto (fora taxas)",
    "Pagamento no débito com 3% de desconto (fora taxas)",
    "Pagamento no dinheiro com 3% de desconto (fora taxas)",
  ],
  "Pagamento Cia Aérea": [
    "Pagamento em até 12x sem juros no cartão de crédito",
    "Pagamento no PIX (consultar disponibilidade e regras da cia aérea)",
  ],
};
const PAGAMENTO_SERVICO_AEREO_BASE = "Passagem Aérea";

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  roteiroId: string;
  roteiro?: any | null;
  duplicateFromId?: string | null;
};

function buildDuplicateName(value: string, isDuplicate: boolean): string {
  const trimmed = String(value || "").trim();
  if (!isDuplicate || !trimmed) return trimmed;
  if (/\(cópia\)$/i.test(trimmed) || /\(copia\)$/i.test(trimmed)) return trimmed;
  return `${trimmed} (Cópia)`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function hojeISO(): string {
  return toISODateLocal(new Date());
}

function calcNoites(di: string, df: string): number {
  if (!di || !df) return 0;
  const a = new Date(di + "T12:00:00");
  const b = new Date(df + "T12:00:00");
  const diff = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Math.max(diff, 0);
}

function calcVpa(vpp: number, qtd: number): number {
  return vpp * Math.max(qtd, 1);
}

function calcAereoValor(valorTotal: number, taxas: number): number {
  const total = Number(valorTotal);
  const taxes = Number(taxas);
  const safeTotal = Number.isFinite(total) ? total : 0;
  const safeTaxes = Number.isFinite(taxes) ? taxes : 0;
  return Math.max(Number((safeTotal - safeTaxes).toFixed(2)), 0);
}

function normalizeDiaKey(d: Pick<RotDia, "cidade" | "percurso" | "data" | "descricao">): string {
  const cidade = String(d.cidade || "").trim().toLocaleLowerCase();
  const percurso = String(d.percurso || "").trim().toLocaleLowerCase();
  const data = String(d.data || "").trim();
  const descricao = String(d.descricao || "").trim().toLocaleLowerCase();
  return `${data}__${cidade}__${percurso}__${descricao}`;
}

function normalizeDiasForPersist(list: RotDia[]): RotDia[] {
  const sorted = (list || [])
    .slice()
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));

  const filtered = sorted
    .map((d) => ({
      ...d,
      percurso: String(d.percurso || "").trim(),
      cidade: String(d.cidade || "").trim(),
      data: String(d.data || "").trim(),
      descricao: String(d.descricao || "").trim(),
    }))
    .filter((d) => Boolean(d.percurso || d.cidade || d.data || d.descricao));

  const seen = new Set<string>();
  const unique: RotDia[] = [];
  for (const d of filtered) {
    const key = normalizeDiaKey(d);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...d, ordem: unique.length });
  }

  return unique;
}

function normalizeTextKey(value: string): string {
  return String(value || "").trim().toLocaleLowerCase();
}

function toSuggestionSlug(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .trim();
}

function splitPagamentoFormas(value: string): string[] {
  const unique = new Set<string>();
  return String(value || "")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      const key = normalizeTextKey(item);
      if (!key || unique.has(key)) return false;
      unique.add(key);
      return true;
    });
}

function joinPagamentoFormas(values: string[]): string {
  return values
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join("\n");
}

function replacePagamentoForma(values: string[], fromValue: string, toValue: string): string[] {
  const fromKey = normalizeTextKey(fromValue);
  const toNormalized = String(toValue || "").trim();
  const next: string[] = [];
  const seen = new Set<string>();

  values.forEach((item) => {
    const raw = String(item || "").trim();
    if (!raw) return;
    const mapped = normalizeTextKey(raw) === fromKey ? toNormalized : raw;
    if (!mapped) return;
    const mappedKey = normalizeTextKey(mapped);
    if (!mappedKey || seen.has(mappedKey)) return;
    seen.add(mappedKey);
    next.push(mapped);
  });

  return next;
}

const labelSt: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
  display: "block",
  marginBottom: 4,
};

const cardSt: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 16,
  marginBottom: 16,
};

const inputSt: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 14,
  outline: "none",
  backgroundColor: "#fff",
  color: "#4b5563",
  boxSizing: "border-box",
};

const tdSt: React.CSSProperties = {
  padding: "1rem",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "top",
  fontSize: 14,
  color: "#4b5563",
};

const actionBtnSt: React.CSSProperties = {
  padding: "4px 8px",
  background: "#fff",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
  color: "#374151",
};

function toUtcDateOrNull(value?: string | null) {
  const v = String(value || "").trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function addUtcDays(date: Date, days: number) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function toISODateUTC(date: Date) {
  return date.toISOString().slice(0, 10);
}

function minDatePlusOneDay(startDate?: string | null, fallbackDate?: string): string {
  const start = toUtcDateOrNull(startDate);
  if (!start) return String(fallbackDate || "");
  return toISODateUTC(addUtcDays(start, 1));
}

function normalizeItinerarioConfig(value: any): ItinerarioConfig {
  const traslados = Array.isArray(value?.traslados)
    ? value.traslados
        .map((item: any) => ({
          cidade: String(item?.cidade || "").trim(),
          chegada: Boolean(item?.chegada),
          saida: Boolean(item?.saida),
        }))
        .filter((item: ItineraryTransferCity) => Boolean(item.cidade))
    : [];
  return { traslados };
}

function newHotel(ordem: number): RotHotel {
  return {
    cidade: "",
    hotel: "",
    endereco: "",
    data_inicio: "",
    data_fim: "",
    noites: 0,
    qtd_apto: 0,
    apto: "",
    categoria: "",
    regime: "",
    tipo_tarifa: "",
    qtd_adultos: 0,
    qtd_criancas: 0,
    valor_original: 0,
    valor_final: 0,
    ordem,
  };
}

function normalizeHotelRow(hotel: any, ordemFallback: number): RotHotel {
  return {
    id: hotel?.id,
    cidade: String(hotel?.cidade || "").trim(),
    hotel: String(hotel?.hotel || "").trim(),
    endereco: String(hotel?.endereco || "").trim(),
    data_inicio: String(hotel?.data_inicio || "").trim(),
    data_fim: String(hotel?.data_fim || "").trim(),
    noites: Number.isFinite(Number(hotel?.noites)) ? Number(hotel.noites) : 0,
    qtd_apto: Number.isFinite(Number(hotel?.qtd_apto)) ? Number(hotel.qtd_apto) : 0,
    apto: String(hotel?.apto || "").trim(),
    categoria: String(hotel?.categoria || "").trim(),
    regime: normalizeImportedHotelRegime(hotel?.regime || ""),
    tipo_tarifa: normalizeImportedHotelTarifa(hotel?.tipo_tarifa || ""),
    qtd_adultos: Number.isFinite(Number(hotel?.qtd_adultos)) ? Number(hotel.qtd_adultos) : 0,
    qtd_criancas: Number.isFinite(Number(hotel?.qtd_criancas)) ? Number(hotel.qtd_criancas) : 0,
    valor_original: Number.isFinite(Number(hotel?.valor_original)) ? Number(hotel.valor_original) : 0,
    valor_final: Number.isFinite(Number(hotel?.valor_final)) ? Number(hotel.valor_final) : 0,
    ordem: Number.isFinite(Number(hotel?.ordem)) ? Number(hotel.ordem) : ordemFallback,
  };
}

function newPasseio(ordem: number): RotPasseio {
  return {
    cidade: "",
    passeio: "",
    fornecedor: "",
    data_inicio: "",
    data_fim: "",
    tipo: "Compartilhado",
    ingressos: "Inclui Ingressos",
    qtd_adultos: 0,
    qtd_criancas: 0,
    valor_original: 0,
    valor_final: 0,
    ordem,
  };
}

function normalizePasseioRow(passeio: any, ordemFallback: number): RotPasseio {
  return {
    id: passeio?.id,
    cidade: String(passeio?.cidade || "").trim(),
    passeio: String(passeio?.passeio || "").trim(),
    fornecedor: String(passeio?.fornecedor || "").trim(),
    data_inicio: String(passeio?.data_inicio || passeio?.data || "").trim(),
    data_fim: String(passeio?.data_fim || passeio?.data_inicio || passeio?.data || "").trim(),
    tipo: String(passeio?.tipo || "Compartilhado").trim(),
    ingressos: String(passeio?.ingressos || "Inclui Ingressos").trim(),
    qtd_adultos: Number.isFinite(Number(passeio?.qtd_adultos)) ? Number(passeio.qtd_adultos) : 0,
    qtd_criancas: Number.isFinite(Number(passeio?.qtd_criancas)) ? Number(passeio.qtd_criancas) : 0,
    valor_original: Number.isFinite(Number(passeio?.valor_original)) ? Number(passeio.valor_original) : 0,
    valor_final: Number.isFinite(Number(passeio?.valor_final)) ? Number(passeio.valor_final) : 0,
    ordem: Number.isFinite(Number(passeio?.ordem)) ? Number(passeio.ordem) : ordemFallback,
  };
}

function newTransporte(ordem: number): RotTransporte {
  return {
    trecho: "",
    cia_aerea: "",
    data_voo: "",
    classe_reserva: "",
    hora_saida: "",
    aeroporto_saida: "",
    duracao_voo: "",
    tipo_voo: "",
    hora_chegada: "",
    aeroporto_chegada: "",
    tarifa_nome: "",
    reembolso_tipo: "",
    qtd_adultos: 0,
    qtd_criancas: 0,
    taxas: 0,
    valor_total: 0,
    tipo: "",
    fornecedor: "",
    descricao: "",
    data_inicio: "",
    data_fim: "",
    categoria: "",
    observacao: "",
    ordem,
  };
}

function normalizeTransportRow(transporte: any, ordemFallback: number): RotTransporte {
  const dataVoo = String(transporte?.data_voo || transporte?.data_inicio || "").trim();
  return {
    id: transporte?.id,
    trecho: String(transporte?.trecho || "").trim(),
    cia_aerea: String(transporte?.cia_aerea || "").trim(),
    data_voo: dataVoo,
    classe_reserva: String(transporte?.classe_reserva || "").trim(),
    hora_saida: String(transporte?.hora_saida || "").trim(),
    aeroporto_saida: String(transporte?.aeroporto_saida || "").trim(),
    duracao_voo: String(transporte?.duracao_voo || "").trim(),
    tipo_voo: String(transporte?.tipo_voo || "").trim(),
    hora_chegada: String(transporte?.hora_chegada || "").trim(),
    aeroporto_chegada: String(transporte?.aeroporto_chegada || "").trim(),
    tarifa_nome: String(transporte?.tarifa_nome || "").trim(),
    reembolso_tipo: String(transporte?.reembolso_tipo || "").trim(),
    qtd_adultos: Number.isFinite(Number(transporte?.qtd_adultos)) ? Number(transporte.qtd_adultos) : 0,
    qtd_criancas: Number.isFinite(Number(transporte?.qtd_criancas)) ? Number(transporte.qtd_criancas) : 0,
    taxas: Number.isFinite(Number(transporte?.taxas)) ? Number(transporte.taxas) : 0,
    valor_total: Number.isFinite(Number(transporte?.valor_total)) ? Number(transporte.valor_total) : 0,
    tipo: String(transporte?.tipo || "").trim(),
    fornecedor: String(transporte?.fornecedor || "").trim(),
    descricao: String(transporte?.descricao || "").trim(),
    data_inicio: String(transporte?.data_inicio || dataVoo || "").trim(),
    data_fim: String(transporte?.data_fim || dataVoo || "").trim(),
    categoria: String(transporte?.categoria || "").trim(),
    observacao: String(transporte?.observacao || "").trim(),
    ordem: Number.isFinite(Number(transporte?.ordem)) ? Number(transporte.ordem) : ordemFallback,
  };
}

function newDia(ordem: number): RotDia {
  return {
    percurso: "",
    cidade: "",
    data: "",
    descricao: "",
    ordem,
  };
}

function newInvestimento(ordem: number): RotInvestimento {
  const valor_por_pessoa = 0;
  const qtd_apto = 1;
  return {
    tipo: "",
    valor_por_pessoa,
    qtd_apto,
    valor_por_apto: calcVpa(valor_por_pessoa, qtd_apto),
    ordem,
  };
}

function newPagamento(ordem: number): RotPagamento {
  return {
    servico: "",
    valor_total_com_taxas: 0,
    taxas: 0,
    forma_pagamento: "",
    ordem,
  };
}

function normalizePagamentoRow(pagamento: any, ordemFallback: number): RotPagamento {
  const valorTotal = Number(pagamento?.valor_total_com_taxas);
  const taxas = Number(pagamento?.taxas);
  return {
    id: pagamento?.id,
    servico: String(pagamento?.servico || "").trim(),
    valor_total_com_taxas: Number.isFinite(valorTotal) ? Math.max(valorTotal, 0) : 0,
    taxas: Number.isFinite(taxas) ? Math.max(taxas, 0) : 0,
    forma_pagamento: joinPagamentoFormas(splitPagamentoFormas(String(pagamento?.forma_pagamento || ""))),
    ordem: Number.isFinite(Number(pagamento?.ordem)) ? Number(pagamento.ordem) : ordemFallback,
  };
}

function hasMeaningfulPagamentoRow(pagamento: RotPagamento): boolean {
  return Boolean(
    String(pagamento.servico || "").trim() ||
      splitPagamentoFormas(String(pagamento.forma_pagamento || "")).length > 0 ||
      Number(pagamento.valor_total_com_taxas || 0) > 0 ||
      Number(pagamento.taxas || 0) > 0
  );
}

// ─── RowActions ───────────────────────────────────────────────────────────────
function RowActions({
  onAdd, onDelete, onUp, onDown,
}: {
  onAdd: () => void;
  onDelete: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  return (
    <td className="th-actions" data-label="Ações" style={{ ...tdSt, whiteSpace: "nowrap" }}>
      <div className="action-buttons action-buttons-center roteiro-row-actions">
        <AppButton
          type="button"
          onClick={onUp}
          variant="ghost"
          className="icon-action-btn vtur-table-action roteiro-action-btn"
          icon="pi pi-arrow-up"
          title="Subir"
          aria-label="Subir"
        />
        <AppButton
          type="button"
          onClick={onDown}
          variant="ghost"
          className="icon-action-btn vtur-table-action roteiro-action-btn"
          icon="pi pi-arrow-down"
          title="Descer"
          aria-label="Descer"
        />
        <AppButton
          type="button"
          onClick={onAdd}
          variant="ghost"
          className="icon-action-btn vtur-table-action roteiro-action-btn"
          icon="pi pi-plus"
          title="Adicionar abaixo"
          aria-label="Adicionar abaixo"
        />
        <AppButton
          type="button"
          onClick={onDelete}
          variant="danger"
          className="icon-action-btn danger vtur-table-action roteiro-action-btn"
          icon="pi pi-trash"
          title="Excluir"
          aria-label="Excluir"
        />
      </div>
    </td>
  );
}

// ─── AutocompleteInput ────────────────────────────────────────────────────────
function AutocompleteInput({
  value,
  onChange,
  onBlurSave,
  suggestions,
  placeholder,
  style,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlurSave?: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
}) {
  // Precisa ser estável entre SSR e hidratação (evita warning "Prop `list` did not match")
  const reactId = useId();
  const listId = useMemo(() => {
    const cleaned = String(reactId).replace(/[^a-zA-Z0-9_-]/g, "");
    return `ac-${cleaned || "id"}`;
  }, [reactId]);
  return (
    <>
      <input
        style={style ?? inputSt}
        list={listId}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && onBlurSave) onBlurSave(v);
        }}
      />
      <datalist id={listId}>
        {suggestions.map((s) => <option key={s} value={s} />)}
      </datalist>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function RoteiroEditIsland({ roteiroId, roteiro, duplicateFromId }: Props) {
  const isNew = roteiroId === "novo";
  const isDuplicate = isNew && Boolean(duplicateFromId) && Boolean(roteiro);
  const hoje = hojeISO();

  // ─── Info
  const [nome, setNome] = useState(buildDuplicateName(roteiro?.nome || "", isDuplicate));
  const [duracao, setDuracao] = useState<number | "">(roteiro?.duracao ?? "");
  const [inicioCidade, setInicioCidade] = useState(roteiro?.inicio_cidade || "");
  const [fimCidade, setFimCidade] = useState(roteiro?.fim_cidade || "");
  const [incluiTexto, setIncluiTexto] = useState(roteiro?.inclui_texto || "");
  const [naoIncluiTexto, setNaoIncluiTexto] = useState(roteiro?.nao_inclui_texto || "");
  const [informacoesImportantes, setInformacoesImportantes] = useState(roteiro?.informacoes_importantes || "");

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importingFile, setImportingFile] = useState(false);
  const [hotelImportText, setHotelImportText] = useState("");
  const [hotelImportMsg, setHotelImportMsg] = useState<string | null>(null);
  const [hotelImportError, setHotelImportError] = useState<string | null>(null);
  const [passeioImportText, setPasseioImportText] = useState("");
  const [passeioImportMsg, setPasseioImportMsg] = useState<string | null>(null);
  const [passeioImportError, setPasseioImportError] = useState<string | null>(null);
  const [aereoImportText, setAereoImportText] = useState("");
  const [aereoImportMsg, setAereoImportMsg] = useState<string | null>(null);
  const [aereoImportError, setAereoImportError] = useState<string | null>(null);

  // ─── Seções
  const [hoteis, setHoteis] = useState<RotHotel[]>(
    (roteiro?.roteiro_hotel || []).sort((a: any, b: any) => a.ordem - b.ordem).length > 0
      ? (roteiro?.roteiro_hotel || [])
          .sort((a: any, b: any) => a.ordem - b.ordem)
          .map((hotel: any, index: number) => normalizeHotelRow(hotel, index))
      : [newHotel(0)]
  );
  const [passeios, setPasseios] = useState<RotPasseio[]>(() => {
    const raw = (roteiro?.roteiro_passeio || []).sort((a: any, b: any) => a.ordem - b.ordem);
    if (raw.length === 0) return [newPasseio(0)];
    return raw.map((p: any, index: number) => normalizePasseioRow(p, index));
  });
  const [transportes, setTransportes] = useState<RotTransporte[]>(
    (roteiro?.roteiro_transporte || []).sort((a: any, b: any) => a.ordem - b.ordem).length > 0
      ? (roteiro?.roteiro_transporte || []).sort((a: any, b: any) => a.ordem - b.ordem).map((item: any, index: number) => normalizeTransportRow(item, index))
      : [newTransporte(0)]
  );
  const [dias, setDias] = useState<RotDia[]>(
    (roteiro?.roteiro_dia || []).sort((a: any, b: any) => a.ordem - b.ordem).length > 0
      ? (roteiro?.roteiro_dia || [])
          .sort((a: any, b: any) => a.ordem - b.ordem)
          .map((d: any) => ({
            ...d,
            percurso: String(d?.percurso || "").trim(),
            cidade: String(d?.cidade || "").trim(),
            data: String(d?.data || "").trim(),
            descricao: String(d?.descricao || "").trim(),
          }))
      : [newDia(0)]
  );
  const [investimentos, setInvestimentos] = useState<RotInvestimento[]>(
    (roteiro?.roteiro_investimento || []).sort((a: any, b: any) => a.ordem - b.ordem).length > 0
      ? (roteiro?.roteiro_investimento || []).sort((a: any, b: any) => a.ordem - b.ordem)
      : [newInvestimento(0)]
  );
  const [pagamentos, setPagamentos] = useState<RotPagamento[]>(() => {
    const raw = (roteiro?.roteiro_pagamento || []).sort((a: any, b: any) => a.ordem - b.ordem);
    if (raw.length === 0) return [];
    return raw
      .map((pagamento: any, index: number) => normalizePagamentoRow(pagamento, index))
      .filter((pagamento) => hasMeaningfulPagamentoRow(pagamento))
      .map((pagamento, index) => ({ ...pagamento, ordem: index }));
  });
  const [itinerarioConfig, setItinerarioConfig] = useState<ItinerarioConfig>(() => normalizeItinerarioConfig(roteiro?.itinerario_config));
  const [pagamentoPresetServicos, setPagamentoPresetServicos] = useState<string[]>(["Pacote Completo"]);
  const [pagamentoPresetCategoria, setPagamentoPresetCategoria] = useState<string>(PAGAMENTO_CATEGORIAS_BASE[0]);
  const [pagamentoPresetFormas, setPagamentoPresetFormas] = useState<string[]>([]);
  const [novoPagamentoCategoria, setNovoPagamentoCategoria] = useState("");
  const [novaPagamentoForma, setNovaPagamentoForma] = useState("");
  const [showPagamentoCategoriaManager, setShowPagamentoCategoriaManager] = useState(false);
  const [pagamentoCategoriaFiltro, setPagamentoCategoriaFiltro] = useState("");
  const [pagamentoFormaFiltro, setPagamentoFormaFiltro] = useState("");
  const [pagamentoEditState, setPagamentoEditState] = useState<PagamentoEditState | null>(null);
  const [pagamentoEditValue, setPagamentoEditValue] = useState("");
  const [pagamentoEditSaving, setPagamentoEditSaving] = useState(false);
  const [pagamentoDeleteState, setPagamentoDeleteState] = useState<PagamentoDeleteState | null>(null);
  const [pagamentoDeleteSaving, setPagamentoDeleteSaving] = useState(false);
  const [pagamentoNoticeMessage, setPagamentoNoticeMessage] = useState<string | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [confirmAutoItineraryOpen, setConfirmAutoItineraryOpen] = useState(false);
  const [confirmImportInfoOpen, setConfirmImportInfoOpen] = useState(false);

  // ─── UI state
  const [abaAtiva, setAbaAtiva] = useState<AbaId>("itinerario");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(isNew ? null : roteiroId);

  // ─── Sugestões autocomplete
  const [sugestoes, setSugestoes] = useState<Record<string, string[]>>({});

  useEffect(() => {
    fetch("/api/v1/roteiros/sugestoes-busca")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.sugestoes) setSugestoes(d.sugestoes); })
      .catch(() => {});
  }, []);

  const salvarSugestao = useCallback(async (tipo: string, valor: string) => {
    const v = valor.trim();
    if (!v) return;
    const existing = (sugestoes[tipo] || []).map((s) => s.toLowerCase());
    if (existing.includes(v.toLowerCase())) return;
    try {
      await fetch("/api/v1/roteiros/sugestoes-salvar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, valor: v }),
      });
      setSugestoes((prev) => ({ ...prev, [tipo]: [...(prev[tipo] || []), v] }));
    } catch {}
  }, [sugestoes]);

  const removerSugestao = useCallback(async (tipo: string, valor: string) => {
    const v = String(valor || "").trim();
    if (!tipo || !v) return;
    try {
      await fetch("/api/v1/roteiros/sugestoes-remover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, valor: v }),
      });
    } catch {}
    setSugestoes((prev) => ({
      ...prev,
      [tipo]: (prev[tipo] || []).filter((item) => normalizeTextKey(String(item || "")) !== normalizeTextKey(v)),
    }));
  }, []);

  // ─── Modal busca dias
  const [showDiasBusca, setShowDiasBusca] = useState(false);
  const [diasBuscaQ, setDiasBuscaQ] = useState("");
  const [diasBuscaCidade, setDiasBuscaCidade] = useState("");
  const [diasBuscaResults, setDiasBuscaResults] = useState<DiaBanco[]>([]);
  const [diasBuscaLoading, setDiasBuscaLoading] = useState(false);

  // ─── Modal gerar orçamento
  const [showGerarModal, setShowGerarModal] = useState(false);
  const [gerarClienteQ, setGerarClienteQ] = useState("");
  const [gerarClienteResults, setGerarClienteResults] = useState<Cliente[]>([]);
  const [gerarClienteSel, setGerarClienteSel] = useState<Cliente | null>(null);
  const [gerarClienteNome, setGerarClienteNome] = useState("");
  const [gerarLoading, setGerarLoading] = useState(false);
  const [gerarClienteLoading, setGerarClienteLoading] = useState(false);
  const clienteSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [exportingPdf, setExportingPdf] = useState(false);
  const [previewingPdf, setPreviewingPdf] = useState(false);
  const pdfBusy = exportingPdf || previewingPdf;

  const tabCounts = useMemo<Record<AbaId, number>>(() => {
    const nonEmptyLineCount = (text: string) =>
      String(text || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean).length;

    return {
      itinerario: dias.filter((d) => d.cidade || d.percurso || d.data || d.descricao).length,
      hoteis: hoteis.filter((h) =>
        h.cidade ||
        h.hotel ||
        h.endereco ||
        h.data_inicio ||
        h.data_fim ||
        h.qtd_apto ||
        h.apto ||
        h.categoria ||
        h.regime ||
        h.tipo_tarifa ||
        h.qtd_adultos ||
        h.qtd_criancas ||
        Number(h.valor_original || 0) > 0 ||
        Number(h.valor_final || 0) > 0
      ).length,
      passeios: passeios.filter((p) =>
        p.cidade ||
        p.passeio ||
        p.fornecedor ||
        p.data_inicio ||
        p.data_fim ||
        p.tipo ||
        p.ingressos ||
        p.qtd_adultos ||
        p.qtd_criancas ||
        Number(p.valor_original || 0) > 0 ||
        Number(p.valor_final || 0) > 0
      ).length,
      transporte: transportes.filter((t) =>
        t.trecho ||
        t.cia_aerea ||
        t.data_voo ||
        t.classe_reserva ||
        t.hora_saida ||
        t.aeroporto_saida ||
        t.duracao_voo ||
        t.tipo_voo ||
        t.hora_chegada ||
        t.aeroporto_chegada ||
        t.tarifa_nome ||
        t.reembolso_tipo ||
        t.qtd_adultos ||
        t.qtd_criancas ||
        Number(t.taxas || 0) > 0 ||
        Number(t.valor_total || 0) > 0
      ).length,
      investimento: investimentos.filter((i) => i.tipo || Number(i.valor_por_pessoa) > 0 || Number(i.valor_por_apto) > 0).length,
      pagamento: pagamentos.filter((p) => p.servico || p.forma_pagamento || Number(p.valor_total_com_taxas) > 0 || Number(p.taxas) > 0).length,
      inclusoes: nonEmptyLineCount(incluiTexto) + nonEmptyLineCount(naoIncluiTexto),
      informacoes: nonEmptyLineCount(informacoesImportantes),
    };
  }, [
    dias,
    hoteis,
    passeios,
    transportes,
    investimentos,
    pagamentos,
    incluiTexto,
    naoIncluiTexto,
    informacoesImportantes,
  ]);

  const pagamentoAereoCompanhias = useMemo(
    () => {
      const map = new Map<string, { nome: string; valor_total_com_taxas: number; taxas: number }>();
      transportes.forEach((item) => {
        const cia = String(item.cia_aerea || item.fornecedor || "").trim();
        const key = normalizeTextKey(cia);
        if (!key) return;
        const total = Number(item.valor_total || 0);
        const taxas = Number(item.taxas || 0);
        const safeTotal = Number.isFinite(total) ? Math.max(total, 0) : 0;
        const safeTaxas = Number.isFinite(taxas) ? Math.max(taxas, 0) : 0;
        const current = map.get(key);
        if (current) {
          current.valor_total_com_taxas += safeTotal;
          current.taxas += safeTaxas;
          return;
        }
        map.set(key, {
          nome: cia,
          valor_total_com_taxas: safeTotal,
          taxas: safeTaxas,
        });
      });

      return Array.from(map.values());
    },
    [transportes]
  );

  const pagamentoAereoServiceOptions = useMemo(
    () => pagamentoAereoCompanhias.map((cia) => `${PAGAMENTO_SERVICO_AEREO_BASE} - ${cia.nome}`),
    [pagamentoAereoCompanhias]
  );

  const pagamentoServiceOptions = useMemo(() => {
    const ordered: string[] = [];
    const seen = new Set<string>();
    const addOption = (value: string) => {
      const normalized = String(value || "").trim();
      if (!normalized) return;
      const key = normalizeTextKey(normalized);
      if (!key || seen.has(key)) return;
      seen.add(key);
      ordered.push(normalized);
    };

    PAGAMENTO_SERVICO_OPTIONS_BASE.forEach(addOption);
    pagamentoAereoServiceOptions.forEach(addOption);
    pagamentos
      .map((item) => String(item?.servico || "").trim())
      .forEach(addOption);

    return ordered;
  }, [pagamentos, pagamentoAereoServiceOptions]);

  const pagamentoCategoriasExcluidas = useMemo(
    () =>
      new Set(
        (sugestoes[PAGAMENTO_CATEGORIA_EXCLUIDA_TIPO] || [])
          .map((item) => normalizeTextKey(String(item || "")))
          .filter(Boolean)
      ),
    [sugestoes]
  );

  const pagamentoCategorias = useMemo(() => {
    const known = new Set<string>(Array.from(PAGAMENTO_CATEGORIAS_BASE));
    const fromSuggestions = (sugestoes["pagamento_categoria"] || [])
      .map((item) => String(item || "").trim())
      .filter((item) => item && !known.has(item));
    return [...PAGAMENTO_CATEGORIAS_BASE, ...fromSuggestions].filter(
      (item) => !pagamentoCategoriasExcluidas.has(normalizeTextKey(item))
    );
  }, [sugestoes, pagamentoCategoriasExcluidas]);

  const pagamentoFormasPorCategoria = useMemo(() => {
    const result: Record<string, string[]> = {};

    pagamentoCategorias.forEach((categoria) => {
      const values: string[] = [];
      const seen = new Set<string>();
      const add = (forma: string) => {
        const normalized = String(forma || "").trim();
        if (!normalized) return;
        const key = normalizeTextKey(normalized);
        if (!key || seen.has(key)) return;
        seen.add(key);
        values.push(normalized);
      };

      (PAGAMENTO_FORMAS_BASE_POR_CATEGORIA[categoria] || []).forEach(add);
      const suggestionType = `${PAGAMENTO_FORMA_TIPO_PREFIX}${toSuggestionSlug(categoria)}`;
      (sugestoes[suggestionType] || []).forEach(add);
      if (normalizeTextKey(categoria) === normalizeTextKey(PAGAMENTO_CATEGORIAS_BASE[0])) {
        (sugestoes["forma_pagamento"] || []).forEach(add);
      }

      const excludedType = `${PAGAMENTO_FORMA_EXCLUIDA_TIPO_PREFIX}${toSuggestionSlug(categoria)}`;
      const excludedSet = new Set(
        (sugestoes[excludedType] || [])
          .map((item) => normalizeTextKey(String(item || "")))
          .filter(Boolean)
      );

      result[categoria] = values.filter((forma) => !excludedSet.has(normalizeTextKey(forma)));
    });

    return result;
  }, [pagamentoCategorias, sugestoes]);

  const pagamentoFormasCategoriaAtual = useMemo(
    () => pagamentoFormasPorCategoria[pagamentoPresetCategoria] || [],
    [pagamentoFormasPorCategoria, pagamentoPresetCategoria]
  );

  const pagamentoCategoriasFiltradas = useMemo(() => {
    const filtro = normalizeTextKey(pagamentoCategoriaFiltro);
    if (!filtro) return pagamentoCategorias;
    return pagamentoCategorias.filter((categoria) => normalizeTextKey(categoria).includes(filtro));
  }, [pagamentoCategorias, pagamentoCategoriaFiltro]);

  const pagamentoFormasFiltradasCategoriaAtual = useMemo(() => {
    const filtro = normalizeTextKey(pagamentoFormaFiltro);
    if (!filtro) return pagamentoFormasCategoriaAtual;
    return pagamentoFormasCategoriaAtual.filter((forma) => normalizeTextKey(forma).includes(filtro));
  }, [pagamentoFormasCategoriaAtual, pagamentoFormaFiltro]);

  const pagamentoFormasByServico = useMemo(() => {
    const byService = new Map<string, string[]>();
    pagamentos.forEach((item) => {
      const serviceKey = normalizeTextKey(item?.servico);
      if (!serviceKey) return;
      const current = byService.get(serviceKey) || [];
      const next = [...current];
      splitPagamentoFormas(String(item?.forma_pagamento || "")).forEach((forma) => {
        if (!next.some((value) => normalizeTextKey(value) === normalizeTextKey(forma))) {
          next.push(forma);
        }
      });
      byService.set(serviceKey, next);
    });
    return byService;
  }, [pagamentos]);

  const pagamentoTotalsByServico = useMemo(() => {
    const sumBy = <T,>(items: T[], getter: (item: T) => number | string | null | undefined) =>
      items.reduce((sum, item) => {
        const value = Number(getter(item));
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0);

    const totalAereo = sumBy(transportes, (t) => t.valor_total);
    const taxasAereo = sumBy(transportes, (t) => t.taxas);
    const totalHospedagem = sumBy(hoteis, (h) => (Number(h.valor_final || 0) > 0 ? h.valor_final : h.valor_original));
    const totalPasseios = sumBy(
      passeios.filter((p) => !isSeguroPasseioLike(p)),
      (p) => (Number(p.valor_final || 0) > 0 ? p.valor_final : p.valor_original)
    );
    const totalSeguroViagem = sumBy(
      passeios.filter((p) => isSeguroPasseioLike(p)),
      (p) => (Number(p.valor_final || 0) > 0 ? p.valor_final : p.valor_original)
    );
    const totalInvestimentos = sumBy(investimentos, (inv) => (Number(inv.valor_por_apto || 0) > 0 ? inv.valor_por_apto : inv.valor_por_pessoa));
    const totalPacote = totalAereo + totalHospedagem + totalPasseios + totalSeguroViagem + totalInvestimentos;

    const byService: Record<string, { valor_total_com_taxas: number; taxas: number }> = {
      "Pacote Completo": { valor_total_com_taxas: totalPacote, taxas: taxasAereo },
      "Passagem Aérea": { valor_total_com_taxas: totalAereo, taxas: taxasAereo },
      Hospedagem: { valor_total_com_taxas: totalHospedagem, taxas: 0 },
      "Passeios e Serviços": { valor_total_com_taxas: totalPasseios, taxas: 0 },
      "Seguro Viagem": { valor_total_com_taxas: totalSeguroViagem, taxas: 0 },
      "Demais Serviços": { valor_total_com_taxas: 0, taxas: 0 },
    };

    pagamentoAereoCompanhias.forEach((cia) => {
      byService[`${PAGAMENTO_SERVICO_AEREO_BASE} - ${cia.nome}`] = {
        valor_total_com_taxas: cia.valor_total_com_taxas,
        taxas: cia.taxas,
      };
    });

    return byService;
  }, [transportes, hoteis, passeios, investimentos, pagamentoAereoCompanhias]);

  useEffect(() => {
    if (pagamentoCategorias.length === 0) return;
    const hasCurrent = pagamentoCategorias.some(
      (categoria) => normalizeTextKey(categoria) === normalizeTextKey(pagamentoPresetCategoria)
    );
    if (!hasCurrent) {
      setPagamentoPresetCategoria(pagamentoCategorias[0]);
    }
  }, [pagamentoCategorias, pagamentoPresetCategoria]);

  useEffect(() => {
    const available = pagamentoFormasCategoriaAtual;
    setPagamentoPresetFormas((prev) => {
      if (available.length === 0) return [];
      const filtered = prev.filter((item) =>
        available.some((forma) => normalizeTextKey(forma) === normalizeTextKey(item))
      );
      return filtered.length > 0 ? filtered : [...available];
    });
  }, [pagamentoPresetCategoria, pagamentoFormasCategoriaAtual]);

  useEffect(() => {
    const seguroLines = extractSeguroViagemIncludeLinesFromPasseios(passeios as any);
    if (seguroLines.length === 0) return;
    setIncluiTexto((prev) => mergeUniqueTextLines(prev, seguroLines));
  }, [passeios]);

  function togglePagamentoPresetValue(
    value: string,
    currentList: string[],
    setList: React.Dispatch<React.SetStateAction<string[]>>
  ) {
    const key = normalizeTextKey(value);
    if (!key) return;
    setList((prev) => {
      const exists = prev.some((item) => normalizeTextKey(item) === key);
      if (exists) {
        return prev.filter((item) => normalizeTextKey(item) !== key);
      }
      return [...prev, value];
    });
  }

  function appendSuggestionLocal(tipo: string, valor: string) {
    const v = String(valor || "").trim();
    if (!tipo || !v) return;
    setSugestoes((prev) => {
      const existing = prev[tipo] || [];
      if (existing.some((item) => normalizeTextKey(item) === normalizeTextKey(v))) return prev;
      return { ...prev, [tipo]: [...existing, v] };
    });
  }

  async function handleAdicionarPagamentoCategoria() {
    const categoria = String(novoPagamentoCategoria || "").trim();
    if (!categoria) return;
    const categoriaKey = normalizeTextKey(categoria);
    if (pagamentoCategoriasExcluidas.has(categoriaKey)) {
      await removerSugestao(PAGAMENTO_CATEGORIA_EXCLUIDA_TIPO, categoria);
    }
    const alreadyExists = pagamentoCategorias.some(
      (item) => normalizeTextKey(item) === categoriaKey
    );
    if (!alreadyExists) {
      appendSuggestionLocal("pagamento_categoria", categoria);
      await salvarSugestao("pagamento_categoria", categoria);
    }
    setPagamentoPresetCategoria(categoria);
    setNovoPagamentoCategoria("");
  }

  async function handleAdicionarFormaPagamentoCategoriaAtual() {
    const categoria = String(pagamentoPresetCategoria || "").trim();
    const forma = String(novaPagamentoForma || "").trim();
    if (!categoria) {
      setPagamentoNoticeMessage("Selecione uma categoria de pagamento.");
      return;
    }
    if (!forma) {
      setPagamentoNoticeMessage("Informe a nova forma de pagamento.");
      return;
    }

    const categorySlug = toSuggestionSlug(categoria);
    const suggestionType = `${PAGAMENTO_FORMA_TIPO_PREFIX}${categorySlug}`;
    const exclusionType = `${PAGAMENTO_FORMA_EXCLUIDA_TIPO_PREFIX}${categorySlug}`;
    await removerSugestao(exclusionType, forma);
    appendSuggestionLocal(suggestionType, forma);
    await salvarSugestao(suggestionType, forma);
    setPagamentoPresetFormas((prev) => {
      const hasValue = prev.some((item) => normalizeTextKey(item) === normalizeTextKey(forma));
      return hasValue ? prev : [...prev, forma];
    });
    setNovaPagamentoForma("");
  }

  function handleEditarPagamentoCategoria(categoria: string) {
    const atual = String(categoria || "").trim();
    if (!atual) return;
    setPagamentoEditState({
      mode: "categoria",
      categoria: atual,
      currentValue: atual,
    });
    setPagamentoEditValue(atual);
  }

  function handleEditarFormaPagamentoCategoriaAtual(forma: string) {
    const categoria = String(pagamentoPresetCategoria || "").trim();
    const atual = String(forma || "").trim();
    if (!categoria || !atual) return;
    setPagamentoEditState({
      mode: "forma",
      categoria,
      currentValue: atual,
    });
    setPagamentoEditValue(atual);
  }

  async function handleConfirmPagamentoEdit() {
    if (!pagamentoEditState) return;
    const novoNome = String(pagamentoEditValue || "").trim();
    if (!novoNome) return;
    if (normalizeTextKey(novoNome) === normalizeTextKey(pagamentoEditState.currentValue)) {
      setPagamentoEditState(null);
      setPagamentoEditValue("");
      return;
    }

    setPagamentoEditSaving(true);
    try {
      if (pagamentoEditState.mode === "categoria") {
        const atual = String(pagamentoEditState.currentValue || "").trim();
        const exists = pagamentoCategorias.some(
          (item) => normalizeTextKey(item) === normalizeTextKey(novoNome)
        );
        if (exists) {
          setPagamentoNoticeMessage("Já existe uma categoria com esse nome.");
          return;
        }

        const formasAtuais = pagamentoFormasPorCategoria[atual] || [];
        const novoSlug = toSuggestionSlug(novoNome);
        const novoTipoFormas = `${PAGAMENTO_FORMA_TIPO_PREFIX}${novoSlug}`;
        const novoTipoExclusaoFormas = `${PAGAMENTO_FORMA_EXCLUIDA_TIPO_PREFIX}${novoSlug}`;

        await removerSugestao(PAGAMENTO_CATEGORIA_EXCLUIDA_TIPO, novoNome);
        appendSuggestionLocal("pagamento_categoria", novoNome);
        await salvarSugestao("pagamento_categoria", novoNome);

        for (const forma of formasAtuais) {
          await removerSugestao(novoTipoExclusaoFormas, forma);
          appendSuggestionLocal(novoTipoFormas, forma);
          await salvarSugestao(novoTipoFormas, forma);
        }

        await salvarSugestao(PAGAMENTO_CATEGORIA_EXCLUIDA_TIPO, atual);
        await removerSugestao("pagamento_categoria", atual);

        if (normalizeTextKey(pagamentoPresetCategoria) === normalizeTextKey(atual)) {
          setPagamentoPresetCategoria(novoNome);
        }
      } else {
        const categoria = String(pagamentoEditState.categoria || "").trim();
        const atual = String(pagamentoEditState.currentValue || "").trim();
        const exists = pagamentoFormasCategoriaAtual.some(
          (item) => normalizeTextKey(item) === normalizeTextKey(novoNome)
        );
        if (exists) {
          setPagamentoNoticeMessage("Já existe uma forma com esse nome nessa categoria.");
          return;
        }

        const categorySlug = toSuggestionSlug(categoria);
        const suggestionType = `${PAGAMENTO_FORMA_TIPO_PREFIX}${categorySlug}`;
        const exclusionType = `${PAGAMENTO_FORMA_EXCLUIDA_TIPO_PREFIX}${categorySlug}`;

        await removerSugestao(exclusionType, novoNome);
        appendSuggestionLocal(suggestionType, novoNome);
        await salvarSugestao(suggestionType, novoNome);
        if (normalizeTextKey(categoria) === normalizeTextKey(PAGAMENTO_CATEGORIAS_BASE[0])) {
          appendSuggestionLocal("forma_pagamento", novoNome);
          await salvarSugestao("forma_pagamento", novoNome);
        }

        await salvarSugestao(exclusionType, atual);
        await removerSugestao(suggestionType, atual);
        if (normalizeTextKey(categoria) === normalizeTextKey(PAGAMENTO_CATEGORIAS_BASE[0])) {
          await removerSugestao("forma_pagamento", atual);
        }

        setPagamentoPresetFormas((prev) => replacePagamentoForma(prev, atual, novoNome));
        setPagamentos((prev) =>
          prev.map((item) => {
            const nextFormas = replacePagamentoForma(splitPagamentoFormas(String(item.forma_pagamento || "")), atual, novoNome);
            return {
              ...item,
              forma_pagamento: joinPagamentoFormas(nextFormas),
            };
          })
        );
      }

      setPagamentoEditState(null);
      setPagamentoEditValue("");
    } finally {
      setPagamentoEditSaving(false);
    }
  }

  function handleCancelPagamentoEdit() {
    if (pagamentoEditSaving) return;
    setPagamentoEditState(null);
    setPagamentoEditValue("");
  }

  async function handleExcluirPagamentoCategoria(categoria: string) {
    const target = String(categoria || "").trim();
    if (!target) return;
    setPagamentoDeleteState({
      mode: "categoria",
      categoria: "",
      target,
    });
  }

  async function handleConfirmExcluirPagamentoCategoria(target: string) {
    if (!target) return;

    const removedFormsSet = new Set(
      (pagamentoFormasPorCategoria[target] || [])
        .map((item) => normalizeTextKey(item))
        .filter(Boolean)
    );

    await salvarSugestao(PAGAMENTO_CATEGORIA_EXCLUIDA_TIPO, target);
    await removerSugestao("pagamento_categoria", target);

    const remaining = pagamentoCategorias.filter((item) => normalizeTextKey(item) !== normalizeTextKey(target));
    if (normalizeTextKey(pagamentoPresetCategoria) === normalizeTextKey(target)) {
      setPagamentoPresetCategoria(remaining[0] || "");
    }
    if (removedFormsSet.size > 0) {
      setPagamentoPresetFormas((prev) =>
        prev.filter((item) => !removedFormsSet.has(normalizeTextKey(item)))
      );
      setPagamentos((prev) =>
        prev.map((item) => {
          const nextFormas = splitPagamentoFormas(String(item.forma_pagamento || "")).filter(
            (value) => !removedFormsSet.has(normalizeTextKey(value))
          );
          return {
            ...item,
            forma_pagamento: joinPagamentoFormas(nextFormas),
          };
        })
      );
    }
  }

  async function handleExcluirFormaPagamentoCategoriaAtual(forma: string) {
    const categoria = String(pagamentoPresetCategoria || "").trim();
    const target = String(forma || "").trim();
    if (!categoria || !target) return;
    setPagamentoDeleteState({
      mode: "forma",
      categoria,
      target,
    });
  }

  async function handleConfirmExcluirFormaPagamentoCategoriaAtual(categoria: string, target: string) {
    if (!categoria || !target) return;

    const categorySlug = toSuggestionSlug(categoria);
    const suggestionType = `${PAGAMENTO_FORMA_TIPO_PREFIX}${categorySlug}`;
    const exclusionType = `${PAGAMENTO_FORMA_EXCLUIDA_TIPO_PREFIX}${categorySlug}`;

    await salvarSugestao(exclusionType, target);
    await removerSugestao(suggestionType, target);
    if (normalizeTextKey(categoria) === normalizeTextKey(PAGAMENTO_CATEGORIAS_BASE[0])) {
      await removerSugestao("forma_pagamento", target);
    }

    setPagamentoPresetFormas((prev) =>
      prev.filter((item) => normalizeTextKey(item) !== normalizeTextKey(target))
    );
    setPagamentos((prev) =>
      prev.map((item) => {
        const nextFormas = splitPagamentoFormas(String(item.forma_pagamento || "")).filter(
          (value) => normalizeTextKey(value) !== normalizeTextKey(target)
        );
        return {
          ...item,
          forma_pagamento: joinPagamentoFormas(nextFormas),
        };
      })
    );
  }

  async function handleConfirmPagamentoDelete() {
    if (!pagamentoDeleteState) return;
    setPagamentoDeleteSaving(true);
    try {
      if (pagamentoDeleteState.mode === "categoria") {
        await handleConfirmExcluirPagamentoCategoria(pagamentoDeleteState.target);
      } else {
        await handleConfirmExcluirFormaPagamentoCategoriaAtual(
          pagamentoDeleteState.categoria,
          pagamentoDeleteState.target
        );
      }
      setPagamentoDeleteState(null);
    } finally {
      setPagamentoDeleteSaving(false);
    }
  }

  function handleCancelPagamentoDelete() {
    if (pagamentoDeleteSaving) return;
    setPagamentoDeleteState(null);
  }

  function handleAplicarPagamentosSelecionados() {
    if (!pagamentoPresetCategoria) {
      setPagamentoNoticeMessage("Selecione uma categoria de pagamento.");
      return;
    }
    if (pagamentoPresetServicos.length === 0) {
      setPagamentoNoticeMessage("Selecione ao menos um serviço para aplicar.");
      return;
    }
    if (pagamentoPresetFormas.length === 0) {
      setPagamentoNoticeMessage("Selecione ao menos uma forma de pagamento.");
      return;
    }

    const formasTexto = joinPagamentoFormas(pagamentoPresetFormas);
    const selectedServicesRaw = pagamentoPresetServicos.flatMap((servico) => {
      const isAereoBase = normalizeTextKey(servico) === normalizeTextKey(PAGAMENTO_SERVICO_AEREO_BASE);
      if (!isAereoBase) return [servico];
      return pagamentoAereoServiceOptions.length > 0 ? [...pagamentoAereoServiceOptions] : [servico];
    });
    const selectedServices = Array.from(new Set(selectedServicesRaw.map((value) => String(value || "").trim()).filter(Boolean)));

    setPagamentos((prev) => {
      const next = (prev || []).slice();
      const byService = new Map<string, number>();
      next.forEach((item, index) => {
        const serviceKey = normalizeTextKey(item.servico);
        if (serviceKey && !byService.has(serviceKey)) byService.set(serviceKey, index);
      });

      selectedServices.forEach((servico) => {
        const serviceKey = normalizeTextKey(servico);
        const base = pagamentoTotalsByServico[servico] || { valor_total_com_taxas: 0, taxas: 0 };
        const existingIndex = byService.get(serviceKey);

        if (typeof existingIndex === "number") {
          const current = next[existingIndex];
          const currentTotal = Number(current?.valor_total_com_taxas || 0);
          const currentTaxas = Number(current?.taxas || 0);
          next[existingIndex] = {
            ...current,
            servico,
            forma_pagamento: formasTexto,
            valor_total_com_taxas: currentTotal > 0 ? currentTotal : base.valor_total_com_taxas,
            taxas: currentTaxas > 0 ? currentTaxas : base.taxas,
          };
          return;
        }

        next.push({
          ...newPagamento(next.length),
          servico,
          forma_pagamento: formasTexto,
          valor_total_com_taxas: base.valor_total_com_taxas,
          taxas: base.taxas,
          ordem: next.length,
        });
      });

      return next.map((item, index) => ({ ...item, ordem: index }));
    });
  }

  function handlePagamentoFormaToggle(rowIndex: number, forma: string, checked: boolean) {
    const existing = splitPagamentoFormas(String(pagamentos[rowIndex]?.forma_pagamento || ""));
    const targetKey = normalizeTextKey(forma);
    const filtered = existing.filter((item) => normalizeTextKey(item) !== targetKey);
    const nextValues = checked ? [...filtered, forma] : filtered;
    const ordered = nextValues.filter(
      (value, index, arr) =>
        arr.findIndex((candidate) => normalizeTextKey(candidate) === normalizeTextKey(value)) === index
    );
    pagamentoOps.update(rowIndex, { forma_pagamento: joinPagamentoFormas(ordered) });
  }

  function handleQuickOpenSection() {
    const firstEmpty = ABAS.find((aba) => tabCounts[aba.id] === 0);
    setAbaAtiva(firstEmpty?.id || "itinerario");
  }

  function goToAdjacentSection(offset: number) {
    const currentIndex = ABAS.findIndex((aba) => aba.id === abaAtiva);
    if (currentIndex === -1) return;
    const nextIndex = currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= ABAS.length) return;
    setAbaAtiva(ABAS[nextIndex].id);
  }

  // ─── Section list helpers ─────────────────────────────────────────────────
  function listOps<T extends { ordem: number }>(
    list: T[],
    setList: React.Dispatch<React.SetStateAction<T[]>>,
    newFn: (ordem: number) => T
  ) {
    const reorder = (arr: T[]) => arr.map((item, i) => ({ ...item, ordem: i }));
    return {
      update: (index: number, patch: Partial<T>) =>
        setList((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item))),
      add: (afterIndex: number) =>
        setList((prev) => {
          const next = [...prev];
          next.splice(afterIndex + 1, 0, newFn(afterIndex + 1));
          return reorder(next);
        }),
      remove: (index: number) =>
        setList((prev) => reorder(prev.filter((_, i) => i !== index))),
      moveUp: (index: number) =>
        setList((prev) => {
          if (index === 0) return prev;
          const next = [...prev];
          [next[index - 1], next[index]] = [next[index], next[index - 1]];
          return reorder(next);
        }),
      moveDown: (index: number) =>
        setList((prev) => {
          if (index === prev.length - 1) return prev;
          const next = [...prev];
          [next[index], next[index + 1]] = [next[index + 1], next[index]];
          return reorder(next);
        }),
    };
  }

  const hotelOps = listOps(hoteis, setHoteis, newHotel);
  const passeioOps = listOps(passeios, setPasseios, newPasseio);
  const transporteOps = listOps(transportes, setTransportes, newTransporte);
  const diaOps = listOps(dias, setDias, newDia);
  const investimentoOps = listOps(investimentos, setInvestimentos, newInvestimento);
  const pagamentoOps = listOps(pagamentos, setPagamentos, newPagamento);

  function handleHotelNumberChange(
    index: number,
    field: "qtd_apto" | "qtd_adultos" | "qtd_criancas" | "valor_original" | "valor_final",
    rawValue: string
  ) {
    const nextValue = rawValue === "" ? 0 : Number(rawValue);
    hotelOps.update(index, { [field]: Number.isFinite(nextValue) ? nextValue : 0 } as Partial<RotHotel>);
  }

  function handleImportHotelText() {
    setHotelImportMsg(null);
    setHotelImportError(null);
    try {
      const imported = parseImportedRoteiroHotels(hotelImportText, new Date());
      if (imported.length === 0) {
        throw new Error("Não encontrei hotéis válidos no texto informado.");
      }
      setHoteis((prev) => mergeImportedRoteiroHotels(prev as any, imported as any) as RotHotel[]);
      setHotelImportText("");
      setHotelImportMsg(imported.length === 1 ? "1 hotel importado com sucesso." : `${imported.length} hotéis importados com sucesso.`);
    } catch (err: any) {
      setHotelImportError(err?.message || "Não foi possível importar os hotéis.");
    }
  }

  function handlePasseioNumberChange(
    index: number,
    field: "qtd_adultos" | "qtd_criancas" | "valor_original" | "valor_final",
    rawValue: string
  ) {
    const nextValue = rawValue === "" ? 0 : Number(rawValue);
    passeioOps.update(index, { [field]: Number.isFinite(nextValue) ? nextValue : 0 } as Partial<RotPasseio>);
  }

  function handleImportPasseioText() {
    setPasseioImportMsg(null);
    setPasseioImportError(null);
    try {
      const imported = parseImportedRoteiroPasseios(passeioImportText, new Date());
      if (imported.length === 0) {
        throw new Error("Não encontrei passeios ou serviços válidos no texto informado.");
      }
      setPasseios((prev) => {
        const merged = mergeImportedRoteiroPasseios(prev as any, imported as any) as RotPasseio[];
        const seguroLines = extractSeguroViagemIncludeLinesFromPasseios(merged as any);
        if (seguroLines.length > 0) {
          setIncluiTexto((prevInclui) => mergeUniqueTextLines(prevInclui, seguroLines));
        }
        return merged;
      });
      setPasseioImportText("");
      setPasseioImportMsg(imported.length === 1 ? "1 serviço importado com sucesso." : `${imported.length} serviços importados com sucesso.`);
    } catch (err: any) {
      setPasseioImportError(err?.message || "Não foi possível importar os passeios e serviços.");
    }
  }

  function handleAereoNumberChange(
    index: number,
    field: "qtd_adultos" | "qtd_criancas" | "taxas" | "valor_total",
    rawValue: string
  ) {
    const nextValue = rawValue === "" ? 0 : Number(rawValue);
    transporteOps.update(index, { [field]: Number.isFinite(nextValue) ? nextValue : 0 } as Partial<RotTransporte>);
  }

  async function handleImportAereoText() {
    setAereoImportMsg(null);
    setAereoImportError(null);
    try {
      const airportAliasValues = (sugestoes?.aereo_alias || []).map((value) => String(value || "").trim()).filter(Boolean);
      const airportCodeCityLookup = await loadAirportCodeCityLookup();
      const imported = parseImportedRoteiroAereo(aereoImportText, new Date(), {
        airportAliasValues,
        airportCodeCityLookup,
      });
      if (imported.length === 0) {
        throw new Error("Não encontrei passagens válidas no texto informado.");
      }
      setTransportes((prev) => mergeImportedRoteiroAereo(prev as any, imported as any) as RotTransporte[]);

      let aliasesSalvos = 0;
      try {
        const aliasesDetectados = collectImportedRoteiroAereoAliasValues(aereoImportText, {
          airportAliasValues,
          airportCodeCityLookup,
        });
        const existing = new Set(airportAliasValues.map((value) => value.toLocaleLowerCase()));
        const novosAliases = aliasesDetectados.filter((value) => !existing.has(String(value || "").toLocaleLowerCase()));
        if (novosAliases.length > 0) {
          for (const alias of novosAliases) {
            await salvarSugestao("aereo_alias", alias);
          }
          aliasesSalvos = novosAliases.length;
        }
      } catch {
        aliasesSalvos = 0;
      }

      setAereoImportText("");
      const baseMessage =
        imported.length === 1
          ? "1 trecho aéreo importado com sucesso."
          : `${imported.length} trechos aéreos importados com sucesso.`;
      const aliasMessage =
        aliasesSalvos > 0
          ? ` ${aliasesSalvos === 1 ? "1 referência de aeroporto foi aprendida." : `${aliasesSalvos} referências de aeroportos foram aprendidas.`}`
          : "";
      setAereoImportMsg(`${baseMessage}${aliasMessage}`);
    } catch (err: any) {
      setAereoImportError(err?.message || "Não foi possível importar as passagens.");
    }
  }

  // ─── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!nome.trim()) {
      setNoticeMessage("Nome do roteiro é obrigatório.");
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      let diasToPersist = normalizeDiasForPersist(dias);
      const hasDescricaoManual = diasToPersist.some((dia) => String(dia.descricao || "").trim());
      if (diasToPersist.length === 0 || !hasDescricaoManual) {
        const autoDias = buildAutomaticDias();
        if (autoDias.length > 0) {
          diasToPersist = normalizeDiasForPersist(autoDias);
        }
      }
      const pagamentosToPersist = pagamentos
        .map((pagamento, index) => normalizePagamentoRow(pagamento, index))
        .filter((pagamento) => hasMeaningfulPagamentoRow(pagamento))
        .map((pagamento, index) => ({ ...pagamento, ordem: index }));
      const body = {
        id: currentId || undefined,
        nome: nome.trim(),
        duracao: duracao !== "" ? Number(duracao) : null,
        inicio_cidade: inicioCidade.trim() || null,
        fim_cidade: fimCidade.trim() || null,
        inclui_texto: incluiTexto,
        nao_inclui_texto: naoIncluiTexto,
        informacoes_importantes: informacoesImportantes,
        itinerario_config: itinerarioConfig,
        hoteis,
        passeios,
        transportes,
        dias: diasToPersist,
        investimentos,
        pagamentos: pagamentosToPersist,
      };
      const res = await fetch("/api/v1/roteiros/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (!currentId && data.id) {
        setCurrentId(data.id);
        window.history.replaceState({}, "", `/orcamentos/personalizados/${data.id}`);
      }

      // garante que a UI e o PDF reflitam o que foi persistido (sem duplicados/linhas vazias)
      setDias(diasToPersist.length ? diasToPersist : [newDia(0)]);
      setPagamentos(pagamentosToPersist);
      setSaveMsg("Salvo com sucesso!");
      setTimeout(() => setSaveMsg(null), 3000);
    } catch (err: any) {
      setNoticeMessage(err.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  // ─── Export PDF ───────────────────────────────────────────────────────────
  function buildRoteiroParaPdf() {
    let diasToExport = normalizeDiasForPersist(dias);
    const hasDescricaoManual = diasToExport.some((dia) => String(dia.descricao || "").trim());
    if (diasToExport.length === 0 || !hasDescricaoManual) {
      const autoDias = buildAutomaticDias();
      if (autoDias.length > 0) {
        diasToExport = normalizeDiasForPersist(autoDias);
      }
    }
    const pagamentosToExport = pagamentos
      .map((pagamento, index) => normalizePagamentoRow(pagamento, index))
      .filter((pagamento) => hasMeaningfulPagamentoRow(pagamento))
      .map((pagamento, index) => ({ ...pagamento, ordem: index }));
    return {
      nome: nome || "roteiro",
      duracao: duracao !== "" ? Number(duracao) : undefined,
      inicio_cidade: inicioCidade || undefined,
      fim_cidade: fimCidade || undefined,
      inclui_texto: incluiTexto,
      nao_inclui_texto: naoIncluiTexto,
        informacoes_importantes: informacoesImportantes,
      hoteis,
      passeios,
      transportes,
      dias: diasToExport,
      investimentos,
      pagamentos: pagamentosToExport,
    };
  }

  async function handlePreviewPdf() {
    setPreviewingPdf(true);
    try {
      await exportRoteiroPdf(buildRoteiroParaPdf(), { action: "preview" });
    } catch (err: any) {
      setNoticeMessage(err.message || "Erro ao visualizar PDF.");
    } finally {
      setPreviewingPdf(false);
    }
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      await exportRoteiroPdf(buildRoteiroParaPdf(), { action: "download" });
    } catch (err: any) {
      setNoticeMessage(err.message || "Erro ao exportar PDF.");
    } finally {
      setExportingPdf(false);
    }
  }

  // ─── Busca dias banco ─────────────────────────────────────────────────────
  async function handleBuscarDias() {
    setDiasBuscaLoading(true);
    try {
      const params = new URLSearchParams();
      if (diasBuscaQ) params.set("q", diasBuscaQ);
      if (diasBuscaCidade) params.set("cidade", diasBuscaCidade);
      const res = await fetch(`/api/v1/roteiros/dias-busca?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setDiasBuscaResults(data.dias || []);
    } catch (err: any) {
      setNoticeMessage(err.message || "Erro ao buscar dias.");
    } finally {
      setDiasBuscaLoading(false);
    }
  }

  function addDiaBanco(dia: DiaBanco) {
    setDias((prev) => {
      const nextItem: RotDia = {
        percurso: String((dia as any).percurso || "").trim(),
        cidade: String(dia.cidade || "").trim(),
        data: String(dia.data || "").trim(),
        descricao: String(dia.descricao || "").trim(),
        ordem: prev.length,
      };
      const key = normalizeDiaKey(nextItem);
      const hasDuplicate = prev.some((d) => normalizeDiaKey(d) === key);
      if (hasDuplicate) return prev;
      return [...prev, nextItem];
    });
    setShowDiasBusca(false);
  }

  // ─── Gerar Orçamento ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!showGerarModal) return;
    if (!gerarClienteQ || gerarClienteQ.length < 2) {
      setGerarClienteResults([]);
      return;
    }
    if (clienteSearchTimeout.current) clearTimeout(clienteSearchTimeout.current);
    clienteSearchTimeout.current = setTimeout(async () => {
      setGerarClienteLoading(true);
      try {
        const res = await fetch(`/api/v1/orcamentos/clientes`);
        if (!res.ok) return;
        const data: Cliente[] = await res.json();
        const q = gerarClienteQ.toLowerCase();
        setGerarClienteResults(data.filter((c) => c.nome.toLowerCase().includes(q)).slice(0, 8));
      } finally {
        setGerarClienteLoading(false);
      }
    }, 300);
  }, [gerarClienteQ, showGerarModal]);

  async function handleGerarOrcamento() {
    const clientName = gerarClienteSel?.nome || gerarClienteNome.trim();
    if (!clientName) {
      setNoticeMessage("Informe o nome do cliente.");
      return;
    }
    if (!currentId) {
      setNoticeMessage("Salve o roteiro primeiro antes de gerar o orçamento.");
      return;
    }
    setGerarLoading(true);
    try {
      const res = await fetch("/api/v1/roteiros/gerar-orcamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roteiro_id: currentId,
          client_id: gerarClienteSel?.id || null,
          client_name: clientName,
          client_whatsapp: gerarClienteSel?.whatsapp || null,
          client_email: gerarClienteSel?.email || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      window.location.href = `/orcamentos/${data.quote_id}`;
    } catch (err: any) {
      setNoticeMessage(err.message || "Erro ao gerar orçamento.");
      setGerarLoading(false);
    }
  }

  // ─── Totais ───────────────────────────────────────────────────────────────
  const totalPagamento = pagamentos.reduce((s, p) => s + Number(p.valor_total_com_taxas || 0), 0);
  const totalInvestimento = investimentos.reduce((s, i) => s + Number(i.valor_por_pessoa || 0), 0);

  const itinerarioTransferCities = useMemo(
    () =>
      buildItineraryTransferCities({
        inicioCidade,
        fimCidade,
        hoteis,
        passeios,
        transportes,
      }),
    [inicioCidade, fimCidade, hoteis, passeios, transportes]
  );

  useEffect(() => {
    setItinerarioConfig((prev) => {
      const prevMap = new Map(
        (prev?.traslados || []).map((item) => [String(item.cidade || "").trim().toLocaleLowerCase(), item] as const)
      );
      return {
        traslados: itinerarioTransferCities.map((cidade) => {
          const existing = prevMap.get(String(cidade || "").trim().toLocaleLowerCase());
          return existing
            ? { ...existing, cidade }
            : { cidade, chegada: false, saida: false };
        }),
      };
    });
  }, [itinerarioTransferCities]);

  function buildAutomaticDias() {
    return generateAutomaticRoteiroDias({
      inicioCidade,
      fimCidade,
      hoteis,
      passeios,
      transportes,
      transferConfig: itinerarioConfig.traslados,
    }).map((dia) => ({
      ...dia,
      ordem: Number.isFinite(Number(dia.ordem)) ? Number(dia.ordem) : 0,
    }));
  }

  function applyAutomaticItinerary() {
    const generated = buildAutomaticDias();
    if (generated.length === 0) {
      setNoticeMessage("Não encontrei dados suficientes para montar o itinerário. Verifique hotéis, passeios, passagens e cidades do roteiro.");
      return;
    }

    setDias(generated);
    setSaveMsg("Itinerário automático gerado com sucesso.");
    setTimeout(() => setSaveMsg(null), 3000);
  }

  function handleGenerateAutomaticItinerary() {
    const hasCurrentContent = dias.some((dia) => dia.data || dia.percurso || dia.cidade || dia.descricao);
    if (hasCurrentContent) {
      setConfirmAutoItineraryOpen(true);
      return;
    }
    applyAutomaticItinerary();
  }

  function handleConfirmGenerateAutomaticItinerary() {
    setConfirmAutoItineraryOpen(false);
    applyAutomaticItinerary();
  }

  async function executeImportRoteiroFile() {
    if (!importFile) {
      setNoticeMessage("Selecione um arquivo (PDF ou Word .docx).");
      return;
    }

    try {
      setImportingFile(true);
      const text = await extractPlainTextFromFile(importFile, { maxPages: 12 });
      setInformacoesImportantes(text);
      setAbaAtiva("informacoes");

      if (!String(nome || "").trim()) {
        setNome(String(importFile.name || "Roteiro").replace(/\.[^.]+$/, ""));
      }
    } catch (err: any) {
      setNoticeMessage(err?.message || "Erro ao importar arquivo.");
    } finally {
      setImportingFile(false);
    }
  }

  async function handleImportRoteiroFile() {
    if (!importFile) {
      setNoticeMessage("Selecione um arquivo (PDF ou Word .docx).");
      return;
    }
    if (String(informacoesImportantes || "").trim()) {
      setConfirmImportInfoOpen(true);
      return;
    }
    await executeImportRoteiroFile();
  }

  async function handleConfirmImportRoteiroFile() {
    setConfirmImportInfoOpen(false);
    await executeImportRoteiroFile();
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <AppPrimerProvider>
      <div className="page-content-wrap roteiro-edit-page orcamentos-consulta-page">
        <AppCard
          className="mb-3"
          tone="info"
          title={isDuplicate ? "Duplicar roteiro personalizado" : isNew ? "Novo roteiro personalizado" : "Editar roteiro personalizado"}
          subtitle={
            isDuplicate
              ? "Você está criando uma cópia deste roteiro. Revise os dados e salve como um novo registro."
              : "Gerencie hotéis, passeios e serviços, passagem aérea, itinerário, investimento e pagamento."
          }
          actions={(
            <div className="mobile-stack-buttons orcamentos-action-bar vtur-actions-end">
              {currentId && (
                <AppButton
                  as="a"
                  href={`/orcamentos/personalizados/novo?duplicar=${currentId}`}
                  variant="secondary"
                >
                  Duplicar
                </AppButton>
              )}
              <AppButton
                type="button"
                onClick={() => (window.location.href = "/orcamentos/personalizados")}
                variant="secondary"
              >
                Voltar para lista
              </AppButton>
            </div>
          )}
        />
        <div style={{ padding: "12px 0 0" }}>
        {/* ─── Informações do Roteiro ──────────────────────────────────── */}
        <AppCard tone="config">
          <div className="form-row mobile-stack roteiro-info-row" style={{ gap: 12 }}>
            <div>
              <label style={labelSt}>Nome *</label>
              <input
                style={inputSt}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Nome do roteiro"
              />
            </div>
            <div>
              <label style={labelSt}>Duração (dias)</label>
              <input
                style={inputSt}
                type="number"
                min="1"
                value={duracao}
                onChange={(e) => setDuracao(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="Ex: 7"
              />
            </div>
            <div>
              <label style={labelSt}>Cidade / Início</label>
              <AutocompleteInput
                value={inicioCidade}
                onChange={setInicioCidade}
                onBlurSave={(v) => salvarSugestao("cidade", v)}
                suggestions={sugestoes["cidade"] || []}
                placeholder="Ex: São Paulo"
              />
            </div>
            <div>
              <label style={labelSt}>Cidade / Fim</label>
              <AutocompleteInput
                value={fimCidade}
                onChange={setFimCidade}
                onBlurSave={(v) => salvarSugestao("cidade", v)}
                suggestions={sugestoes["cidade"] || []}
                placeholder="Ex: Lisboa"
              />
            </div>
            <div className="mobile-stack-buttons roteiro-info-actions orcamentos-action-bar">
              {saveMsg && (
                <AlertMessage variant="success" className="mb-0 roteiro-info-feedback">
                  {saveMsg}
                </AlertMessage>
              )}
              <AppButton
                type="button"
                onClick={() => (window.location.href = "/orcamentos/personalizados")}
                variant="secondary"
              >
                Cancelar
              </AppButton>

              <AppButton
                type="button"
                onClick={handlePreviewPdf}
                disabled={pdfBusy}
                variant="secondary"
              >
                {previewingPdf ? "Abrindo prévia..." : "Visualizar PDF"}
              </AppButton>

              <AppButton
                type="button"
                onClick={handleSave}
                disabled={saving}
                variant="primary"
              >
                {saving ? "Salvando..." : "Salvar"}
              </AppButton>

              <AppButton
                type="button"
                onClick={() => setShowGerarModal(true)}
                variant="primary"
              >
                Gerar Orçamento
              </AppButton>
            </div>
          </div>

          <div className="form-row mobile-stack" style={{ gap: 12, marginTop: 12, alignItems: "flex-end" }}>
            <div style={{ flex: "1 1 360px" }}>
              <label style={labelSt}>Importar roteiro (PDF/Word)</label>
              <div className="vtur-import-upload-stack">
                <div className="vtur-import-upload-row">
                  <label className="vtur-import-upload-trigger" htmlFor="roteiro-import-file-input">
                    Escolher arquivo
                  </label>
                  <input
                    id="roteiro-import-file-input"
                    className="sr-only"
                    type="file"
                    accept=".pdf,.docx,.txt"
                    onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  />
                  <span className="vtur-import-file-name">
                    {importFile?.name || "Nenhum arquivo selecionado"}
                  </span>
                </div>
              </div>
            </div>
            <div className="mobile-stack-buttons orcamentos-action-bar vtur-actions-end">
              <AppButton
                type="button"
                onClick={handleImportRoteiroFile}
                disabled={!importFile || importingFile}
                variant="secondary"
              >
                {importingFile ? "Importando..." : "Importar"}
              </AppButton>
            </div>
          </div>
        </AppCard>

        {/* ─── Navegação das Seções ────────────────────────────────────── */}
        <section className="roteiro-section-nav" aria-label="Seções do roteiro">
          <div className="roteiro-section-nav-mobile">
            <div className="roteiro-section-nav-mobile-head">
              <div className="roteiro-section-nav-copy">
                <span className="roteiro-section-nav-kicker">Etapa atual</span>
                <strong>{ABAS.find((aba) => aba.id === abaAtiva)?.label || "Itinerário Personalizado"}</strong>
                <span>{ABAS.find((aba) => aba.id === abaAtiva)?.hint || "Selecione a área que deseja editar."}</span>
              </div>
              <span className="roteiro-section-nav-mobile-count">{tabCounts[abaAtiva]}</span>
            </div>
            <div className="roteiro-section-nav-mobile-controls">
              <AppField
                as="select"
                label="Seção do roteiro"
                value={abaAtiva}
                onChange={(e) => setAbaAtiva(e.target.value as AbaId)}
                wrapperClassName="m-0 roteiro-section-select-field"
                options={ABAS.map((aba) => ({
                  value: aba.id,
                  label: `${aba.shortLabel} (${tabCounts[aba.id]})`,
                }))}
              />
              <AppButton
                type="button"
                variant="secondary"
                className="roteiro-section-quick-btn"
                icon="pi pi-sparkles"
                onClick={handleQuickOpenSection}
              >
                Ir para pendências
              </AppButton>
            </div>
            <div className="roteiro-section-nav-mobile-pager">
              <AppButton
                type="button"
                variant="ghost"
                icon="pi pi-arrow-left"
                onClick={() => goToAdjacentSection(-1)}
                disabled={ABAS[0]?.id === abaAtiva}
              >
                Anterior
              </AppButton>
              <AppButton
                type="button"
                variant="ghost"
                onClick={() => goToAdjacentSection(1)}
                disabled={ABAS[ABAS.length - 1]?.id === abaAtiva}
                icon="pi pi-arrow-right"
                iconPos="right"
              >
                Próxima
              </AppButton>
            </div>
          </div>

          <div className="roteiro-tab-grid" role="tablist" aria-label="Seções do roteiro">
            {ABAS.map((aba) => (
              <AppButton
                key={aba.id}
                type="button"
                variant="ghost"
                onClick={() => setAbaAtiva(aba.id)}
                className={`roteiro-tab-card ${abaAtiva === aba.id ? "is-active" : ""}`}
                aria-pressed={abaAtiva === aba.id}
              >
                <span className="roteiro-tab-card-icon" aria-hidden="true">
                  <i className={aba.icon} />
                </span>
                <span className="roteiro-tab-card-copy">
                  <span className="roteiro-tab-card-title-row">
                    <span className="roteiro-tab-card-title">{aba.shortLabel}</span>
                    <span className="roteiro-tab-card-count">{tabCounts[aba.id]}</span>
                  </span>
                  <span className="roteiro-tab-card-hint">{aba.hint}</span>
                </span>
              </AppButton>
            ))}
            <AppButton
              type="button"
              variant="ghost"
              className="roteiro-tab-card roteiro-tab-card-quick"
              onClick={handleQuickOpenSection}
            >
              <span className="roteiro-tab-card-icon" aria-hidden="true">
                <i className="pi pi-sparkles" />
              </span>
              <span className="roteiro-tab-card-copy">
                <span className="roteiro-tab-card-title-row">
                  <span className="roteiro-tab-card-title">Ir para pendências</span>
                </span>
                <span className="roteiro-tab-card-hint">Leva você para a primeira seção ainda vazia.</span>
              </span>
            </AppButton>
          </div>
        </section>

        {/* ─── Aba: Hotéis Sugeridos ───────────────────────────────────── */}
        {abaAtiva === "hoteis" && (
          <div style={cardSt}>
            <div className="mb-3">
              <label style={labelSt}>Importar hotéis por texto</label>
              <textarea
                style={{ ...inputSt, minHeight: 180, resize: "vertical" }}
                value={hotelImportText}
                onChange={(e) => setHotelImportText(e.target.value)}
                placeholder="Cole aqui o texto do hotel. O sistema tenta preencher período, cidade, hotel, endereço, apto, regime, tarifa, ocupação e valores."
              />
              <div className="mobile-stack-buttons orcamentos-action-bar vtur-actions-end mt-2">
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={handleImportHotelText}
                  disabled={!hotelImportText.trim()}
                >
                  Importar hotéis
                </AppButton>
              </div>
              {hotelImportMsg && (
                <AlertMessage variant="success" className="mt-2 mb-0">
                  {hotelImportMsg}
                </AlertMessage>
              )}
              {hotelImportError && (
                <AlertMessage variant="error" className="mt-2 mb-0">
                  {hotelImportError}
                </AlertMessage>
              )}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table-default table-header-blue table-mobile-cards roteiro-edit-table roteiro-edit-table-hoteis" style={{ width: "100%" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {[
                      "Cidade *",
                      "Hotel *",
                      "Endereço",
                      "Data Início",
                      "Data Final",
                      "Noites",
                      "Qtd",
                      "Apto *",
                      "Categoria",
                      "Regime",
                      "Tarifa",
                      "Adultos",
                      "Crianças",
                      "Valor Original",
                      "Valor Final",
                      "",
                    ].map((h) => (
                      <th key={h} style={{ padding: "1rem", textAlign: "left", color: "#374151", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hoteis.map((h, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 100 }}
                          value={h.cidade}
                          onChange={(v) => hotelOps.update(i, { cidade: v })}
                          onBlurSave={(v) => salvarSugestao("cidade", v)}
                          suggestions={sugestoes["cidade"] || []}
                          placeholder="Cidade"
                        />
                      </td>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 140 }}
                          value={h.hotel}
                          onChange={(v) => hotelOps.update(i, { hotel: v })}
                          onBlurSave={(v) => salvarSugestao("hotel", v)}
                          suggestions={sugestoes["hotel"] || []}
                          placeholder="Hotel"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 240 }}
                          value={h.endereco}
                          onChange={(e) => hotelOps.update(i, { endereco: e.target.value })}
                          placeholder="Endereço"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 120 }}
                          type="date"
                          min={hoje}
                          value={h.data_inicio}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => {
                            const v = e.target.value;
                            const minFim = minDatePlusOneDay(v, hoje);
                            const fim = h.data_fim && h.data_fim >= minFim ? h.data_fim : minFim;
                            hotelOps.update(i, { data_inicio: v, data_fim: fim, noites: calcNoites(v, fim) });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 120 }}
                          type="date"
                          min={minDatePlusOneDay(h.data_inicio, hoje)}
                          value={h.data_fim}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => {
                            const v = e.target.value;
                            const minFim = minDatePlusOneDay(h.data_inicio, hoje);
                            const bounded = v && v < minFim ? minFim : v;
                            hotelOps.update(i, { data_fim: bounded, noites: calcNoites(h.data_inicio, bounded) });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <input style={{ ...inputSt, width: 50, background: "#f9fafb" }} type="number" value={h.noites} readOnly />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 60 }}
                          type="number"
                          min="0"
                          value={h.qtd_apto || ""}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => handleHotelNumberChange(i, "qtd_apto", e.target.value)}
                          placeholder="0"
                        />
                      </td>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 180 }}
                          value={h.apto}
                          onChange={(v) => hotelOps.update(i, { apto: v })}
                          onBlurSave={(v) => salvarSugestao("apto", v)}
                          suggestions={sugestoes["apto"] || []}
                          placeholder="Apto"
                        />
                      </td>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 120 }}
                          value={h.categoria}
                          onChange={(v) => hotelOps.update(i, { categoria: v })}
                          onBlurSave={(v) => salvarSugestao("categoria", v)}
                          suggestions={sugestoes["categoria"] || []}
                          placeholder="Categoria"
                        />
                      </td>
                      <td style={tdSt}>
                        <select style={{ ...inputSt, width: 150 }} value={h.regime} onChange={(e) => hotelOps.update(i, { regime: e.target.value })}>
                          <option value="">—</option>
                          <option>Café da Manhã</option>
                          <option>Meia Pensão</option>
                          <option>Pensão Completa</option>
                          <option>All Inclusive</option>
                          <option>Sem Refeição</option>
                        </select>
                      </td>
                      <td style={tdSt}>
                        <select
                          style={{ ...inputSt, width: 150 }}
                          value={h.tipo_tarifa}
                          onChange={(e) => hotelOps.update(i, { tipo_tarifa: e.target.value })}
                        >
                          <option value="">—</option>
                          <option>Reembolsável</option>
                          <option>Não Reembolsável</option>
                        </select>
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 80 }}
                          type="number"
                          min="0"
                          value={h.qtd_adultos || ""}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => handleHotelNumberChange(i, "qtd_adultos", e.target.value)}
                          placeholder="0"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 80 }}
                          type="number"
                          min="0"
                          value={h.qtd_criancas || ""}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => handleHotelNumberChange(i, "qtd_criancas", e.target.value)}
                          placeholder="0"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 130 }}
                          type="number"
                          min="0"
                          step="0.01"
                          value={h.valor_original || ""}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => handleHotelNumberChange(i, "valor_original", e.target.value)}
                          placeholder="0,00"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 130 }}
                          type="number"
                          min="0"
                          step="0.01"
                          value={h.valor_final || ""}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => handleHotelNumberChange(i, "valor_final", e.target.value)}
                          placeholder="0,00"
                        />
                      </td>
                      <RowActions
                        onAdd={() => hotelOps.add(i)}
                        onDelete={() => hotelOps.remove(i)}
                        onUp={() => hotelOps.moveUp(i)}
                        onDown={() => hotelOps.moveDown(i)}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
              {hoteis.length === 0 && (
                <AppButton type="button" variant="secondary" className="mt-2" onClick={() => setHoteis([newHotel(0)])}>
                  + Adicionar hotel
                </AppButton>
              )}
            </div>
          </div>
        )}

        {/* ─── Aba: Passeios e Serviços ────────────────────────────────── */}
        {abaAtiva === "passeios" && (
          <div style={cardSt}>
            <div className="mb-3">
              <label style={labelSt}>Importar passeios e serviços por texto</label>
              <textarea
                style={{ ...inputSt, minHeight: 180, resize: "vertical" }}
                value={passeioImportText}
                onChange={(e) => setPasseioImportText(e.target.value)}
                placeholder="Cole aqui o texto dos serviços. O sistema tenta preencher data, cidade, descrição, fornecedor, ocupação e valores."
              />
              <div className="mobile-stack-buttons orcamentos-action-bar vtur-actions-end mt-2">
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={handleImportPasseioText}
                  disabled={!passeioImportText.trim()}
                >
                  Importar passeios e serviços
                </AppButton>
              </div>
              {passeioImportMsg && (
                <AlertMessage variant="success" className="mt-2 mb-0">
                  {passeioImportMsg}
                </AlertMessage>
              )}
              {passeioImportError && (
                <AlertMessage variant="error" className="mt-2 mb-0">
                  {passeioImportError}
                </AlertMessage>
              )}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table-default table-header-blue table-mobile-cards roteiro-edit-table roteiro-edit-table-passeios" style={{ width: "100%" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Cidade *", "Passeio / Serviço *", "Fornecedor", "Data Início", "Data Final", "Tipo", "Ingressos", "Adultos", "Crianças", "Valor Original", "Valor Final", ""].map((h) => (
                      <th key={h} style={{ padding: "1rem", textAlign: "left", color: "#374151", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {passeios.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 100 }}
                          value={p.cidade}
                          onChange={(v) => passeioOps.update(i, { cidade: v })}
                          onBlurSave={(v) => salvarSugestao("cidade", v)}
                          suggestions={sugestoes["cidade"] || []}
                          placeholder="Cidade"
                        />
                      </td>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 220 }}
                          value={p.passeio}
                          onChange={(v) => passeioOps.update(i, { passeio: v })}
                          onBlurSave={(v) => salvarSugestao("passeio", v)}
                          suggestions={sugestoes["passeio"] || []}
                          placeholder="Descrição do serviço"
                        />
                      </td>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 140 }}
                          value={p.fornecedor}
                          onChange={(v) => passeioOps.update(i, { fornecedor: v })}
                          onBlurSave={(v) => salvarSugestao("fornecedor", v)}
                          suggestions={sugestoes["fornecedor"] || []}
                          placeholder="Fornecedor"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 120 }}
                          type="date"
                          min={hoje}
                          value={p.data_inicio}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => {
                            const v = e.target.value;
                            const fim = p.data_fim && p.data_fim < v ? v : p.data_fim;
                            passeioOps.update(i, { data_inicio: v, data_fim: fim });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 120 }}
                          type="date"
                          min={p.data_inicio || hoje}
                          value={p.data_fim}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => {
                            const v = e.target.value;
                            const bounded = p.data_inicio && v && v < p.data_inicio ? p.data_inicio : v;
                            passeioOps.update(i, { data_fim: bounded });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <select style={{ ...inputSt, width: 150 }} value={p.tipo} onChange={(e) => passeioOps.update(i, { tipo: e.target.value })}>
                          <option>Compartilhado</option>
                          <option>Privativo</option>
                          <option>Serviço</option>
                          <option>Passeio</option>
                        </select>
                      </td>
                      <td style={tdSt}>
                        <select style={{ ...inputSt, width: 150 }} value={p.ingressos} onChange={(e) => passeioOps.update(i, { ingressos: e.target.value })}>
                          <option value="">—</option>
                          <option>Inclui Ingressos</option>
                          <option>NÃO INCLUI</option>
                        </select>
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 80 }}
                          type="number"
                          min="0"
                          value={p.qtd_adultos || ""}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => handlePasseioNumberChange(i, "qtd_adultos", e.target.value)}
                          placeholder="0"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 80 }}
                          type="number"
                          min="0"
                          value={p.qtd_criancas || ""}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => handlePasseioNumberChange(i, "qtd_criancas", e.target.value)}
                          placeholder="0"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 130 }}
                          type="number"
                          min="0"
                          step="0.01"
                          value={p.valor_original || ""}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => handlePasseioNumberChange(i, "valor_original", e.target.value)}
                          placeholder="0,00"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 130 }}
                          type="number"
                          min="0"
                          step="0.01"
                          value={p.valor_final || ""}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => handlePasseioNumberChange(i, "valor_final", e.target.value)}
                          placeholder="0,00"
                        />
                      </td>
                      <RowActions
                        onAdd={() => passeioOps.add(i)}
                        onDelete={() => passeioOps.remove(i)}
                        onUp={() => passeioOps.moveUp(i)}
                        onDown={() => passeioOps.moveDown(i)}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
              {passeios.length === 0 && (
                <AppButton type="button" variant="secondary" className="mt-2" onClick={() => setPasseios([newPasseio(0)])}>
                  + Adicionar passeio
                </AppButton>
              )}
            </div>
          </div>
        )}

        {/* ─── Aba: Passagem Aérea ─────────────────────────────────────── */}
        {abaAtiva === "transporte" && (
          <div style={cardSt}>
            <div className="mb-3">
              <label style={labelSt}>Importar passagens por texto</label>
              <textarea
                style={{ ...inputSt, minHeight: 180, resize: "vertical" }}
                value={aereoImportText}
                onChange={(e) => setAereoImportText(e.target.value)}
                placeholder="Cole aqui o texto das passagens. O sistema tenta preencher trecho, cia aérea, data, classe, horários, aeroportos, duração, tarifa, passageiros e valor total."
              />
              <div className="mobile-stack-buttons orcamentos-action-bar vtur-actions-end mt-2">
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={handleImportAereoText}
                  disabled={!aereoImportText.trim()}
                >
                  Importar passagens
                </AppButton>
              </div>
              {aereoImportMsg && (
                <AlertMessage variant="success" className="mt-2 mb-0">
                  {aereoImportMsg}
                </AlertMessage>
              )}
              {aereoImportError && (
                <AlertMessage variant="error" className="mt-2 mb-0">
                  {aereoImportError}
                </AlertMessage>
              )}
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="table-default table-header-blue table-mobile-cards roteiro-edit-table roteiro-edit-table-transporte" style={{ width: "100%" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {[
                      "Trecho",
                      "Cia Aérea",
                      "Data do Voo",
                      "Classe",
                      "Aeroporto Saída",
                      "Hora Saída",
                      "Aeroporto Chegada",
                      "Hora Chegada",
                      "Duração",
                      "Tipo de Voo",
                      "Tarifa",
                      "Reembolso",
                      "Adultos",
                      "Crianças",
                      "Valor",
                      "Taxas",
                      "Valor Total",
                      "",
                    ].map((h) => (
                      <th key={h} style={{ padding: "1rem", textAlign: "left", color: "#374151", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transportes.map((t, i) => {
                    const valorCalculado = calcAereoValor(t.valor_total, t.taxas);
                    return (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 180 }}
                          value={t.trecho}
                          onChange={(v) => transporteOps.update(i, { trecho: v, descricao: v })}
                          onBlurSave={(v) => salvarSugestao("transporte_desc", v)}
                          suggestions={sugestoes["transporte_desc"] || []}
                          placeholder="São Paulo - Santiago"
                        />
                      </td>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 120 }}
                          value={t.cia_aerea}
                          onChange={(v) => transporteOps.update(i, { cia_aerea: v, fornecedor: v })}
                          onBlurSave={(v) => salvarSugestao("fornecedor", v)}
                          suggestions={sugestoes["fornecedor"] || []}
                          placeholder="Sky airline"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 130 }}
                          type="date"
                          min={hoje}
                          value={t.data_voo}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => {
                            const v = e.target.value;
                            transporteOps.update(i, { data_voo: v, data_inicio: v, data_fim: v });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 150 }}
                          value={t.classe_reserva}
                          onChange={(e) => transporteOps.update(i, { classe_reserva: e.target.value, categoria: e.target.value })}
                          placeholder="Classe Econômica"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 90 }}
                          value={t.aeroporto_saida}
                          onChange={(e) => transporteOps.update(i, { aeroporto_saida: e.target.value.toUpperCase() })}
                          placeholder="GRU"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 90 }}
                          value={t.hora_saida}
                          onChange={(e) => transporteOps.update(i, { hora_saida: e.target.value })}
                          placeholder="20:25"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 90 }}
                          value={t.aeroporto_chegada}
                          onChange={(e) => transporteOps.update(i, { aeroporto_chegada: e.target.value.toUpperCase() })}
                          placeholder="SCL"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 90 }}
                          value={t.hora_chegada}
                          onChange={(e) => transporteOps.update(i, { hora_chegada: e.target.value })}
                          placeholder="23:55"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 110 }}
                          value={t.duracao_voo}
                          onChange={(e) => transporteOps.update(i, { duracao_voo: e.target.value, observacao: e.target.value })}
                          placeholder="4h 30min"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 120 }}
                          value={t.tipo_voo}
                          onChange={(e) => transporteOps.update(i, { tipo_voo: e.target.value, tipo: e.target.value })}
                          placeholder="Voo direto"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 130 }}
                          value={t.tarifa_nome}
                          onChange={(e) => transporteOps.update(i, { tarifa_nome: e.target.value })}
                          placeholder="Tarifa facial"
                        />
                      </td>
                      <td style={tdSt}>
                        <select
                          style={{ ...inputSt, width: 150 }}
                          value={t.reembolso_tipo}
                          onChange={(e) => transporteOps.update(i, { reembolso_tipo: e.target.value })}
                        >
                          <option value="">—</option>
                          <option>Reembolsável</option>
                          <option>Não Reembolsável</option>
                        </select>
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 80 }}
                          type="number"
                          min="0"
                          value={t.qtd_adultos || ""}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => handleAereoNumberChange(i, "qtd_adultos", e.target.value)}
                          placeholder="0"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 80 }}
                          type="number"
                          min="0"
                          value={t.qtd_criancas || ""}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => handleAereoNumberChange(i, "qtd_criancas", e.target.value)}
                          placeholder="0"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 120, background: "#f8fafc", color: "#475569" }}
                          type="number"
                          min="0"
                          step="0.01"
                          value={valorCalculado || ""}
                          onFocus={selectAllInputOnFocus}
                          readOnly
                          placeholder="0,00"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 110 }}
                          type="number"
                          min="0"
                          step="0.01"
                          value={t.taxas || ""}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => handleAereoNumberChange(i, "taxas", e.target.value)}
                          placeholder="0,00"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 130 }}
                          type="number"
                          min="0"
                          step="0.01"
                          value={t.valor_total || ""}
                          onFocus={selectAllInputOnFocus}
                          onChange={(e) => handleAereoNumberChange(i, "valor_total", e.target.value)}
                          placeholder="0,00"
                        />
                      </td>
                      <RowActions
                        onAdd={() => transporteOps.add(i)}
                        onDelete={() => transporteOps.remove(i)}
                        onUp={() => transporteOps.moveUp(i)}
                        onDown={() => transporteOps.moveDown(i)}
                      />
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {transportes.length === 0 && (
                <AppButton type="button" variant="secondary" className="mt-2" onClick={() => setTransportes([newTransporte(0)])}>
                  + Adicionar trecho aéreo
                </AppButton>
              )}
            </div>
          </div>
        )}

        {/* ─── Aba: Itinerário Detalhado ───────────────────────────────── */}
        {abaAtiva === "itinerario" && (
          <div style={cardSt}>
            <div
              style={{
                border: "1px solid #dbeafe",
                background: "#f8fbff",
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
              }}
            >
              <div className="mobile-stack-buttons" style={{ justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div style={{ maxWidth: 780 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1d4ed8", marginBottom: 4 }}>
                    Itinerário automático
                  </div>
                  <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                    O sistema monta o dia a dia com base em hotéis, passeios, serviços, passagens e traslados por cidade. Depois, você ainda pode revisar tudo manualmente.
                  </div>
                </div>
                <AppButton type="button" variant="primary" onClick={handleGenerateAutomaticItinerary}>
                  Gerar itinerário automático
                </AppButton>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                  Traslados por cidade
                </div>
                {itinerarioConfig.traslados.length > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {itinerarioConfig.traslados.map((item, index) => (
                      <div
                        key={`${item.cidade}-${index}`}
                        className="mobile-stack-buttons"
                        style={{
                          justifyContent: "space-between",
                          gap: 12,
                          border: "1px solid #e2e8f0",
                          borderRadius: 10,
                          background: "#fff",
                          padding: "10px 12px",
                        }}
                      >
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a" }}>{item.cidade}</div>
                        <div className="mobile-stack-buttons" style={{ gap: 18 }}>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155" }}>
                            <input
                              type="checkbox"
                              checked={item.chegada}
                              onChange={(e) =>
                                setItinerarioConfig((prev) => ({
                                  traslados: prev.traslados.map((current, currentIndex) =>
                                    currentIndex === index ? { ...current, chegada: e.target.checked } : current
                                  ),
                                }))
                              }
                            />
                            Traslado de chegada
                          </label>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155" }}>
                            <input
                              type="checkbox"
                              checked={item.saida}
                              onChange={(e) =>
                                setItinerarioConfig((prev) => ({
                                  traslados: prev.traslados.map((current, currentIndex) =>
                                    currentIndex === index ? { ...current, saida: e.target.checked } : current
                                  ),
                                }))
                              }
                            />
                            Traslado de saída
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: "#64748b" }}>
                    Preencha hotéis, cidades ou passagens para o sistema listar automaticamente as cidades do roteiro.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                {dias.filter((dia) => dia.data || dia.percurso || dia.cidade || dia.descricao).length} dia(s) cadastrado(s)
              </div>
              <AppButton
                type="button"
                variant="primary"
                onClick={() => setShowDiasBusca(true)}
                style={{ fontSize: 12, fontWeight: 500, padding: "6px 12px" }}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <i className="pi pi-search" aria-hidden="true" />
                  <span>Buscar no banco</span>
                </span>
              </AppButton>
            </div>
            {dias.map((d, i) => (
              <div key={i} className="roteiro-dia-card">
                <div className="roteiro-dia-field roteiro-dia-field-date">
                  <label style={{ ...labelSt, marginBottom: 2 }}>Data</label>
                  <input
                    className="roteiro-dia-input"
                    style={{ ...inputSt, width: 130 }}
                    type="date"
                    value={d.data}
                    onFocus={selectAllInputOnFocus}
                    onChange={(e) => diaOps.update(i, { data: e.target.value })}
                  />
                </div>
                <div className="roteiro-dia-field roteiro-dia-field-percurso">
                  <label style={{ ...labelSt, marginBottom: 2 }}>Percurso</label>
                  <input
                    className="roteiro-dia-input"
                    style={{ ...inputSt, width: 180 }}
                    value={d.percurso}
                    onChange={(e) => diaOps.update(i, { percurso: e.target.value })}
                    placeholder="Ex: Roma - Veneza"
                  />
                </div>
                <div className="roteiro-dia-field roteiro-dia-field-city">
                  <label style={{ ...labelSt, marginBottom: 2 }}>Cidade/Pernoite</label>
                  <AutocompleteInput
                    style={{ ...inputSt, width: 130 }}
                    value={d.cidade}
                    onChange={(v) => diaOps.update(i, { cidade: v })}
                    onBlurSave={(v) => salvarSugestao("cidade", v)}
                    suggestions={sugestoes["cidade"] || []}
                    placeholder="Cidade"
                  />
                </div>
                <div className="roteiro-dia-field roteiro-dia-field-desc">
                  <label style={{ ...labelSt, marginBottom: 2 }}>Descrição do dia</label>
                  <textarea
                    className="roteiro-dia-input roteiro-dia-textarea"
                    style={{ ...inputSt, minHeight: 60, resize: "vertical" }}
                    value={d.descricao}
                    onChange={(e) => diaOps.update(i, { descricao: e.target.value })}
                    placeholder="Descrição detalhada do dia..."
                  />
                </div>
                <div className="roteiro-dia-actions vtur-table-actions">
                  <AppButton type="button" variant="ghost" className="icon-action-btn vtur-table-action roteiro-action-btn" icon="pi pi-arrow-up" onClick={() => diaOps.moveUp(i)} title="Subir" aria-label="Subir" />
                  <AppButton type="button" variant="ghost" className="icon-action-btn vtur-table-action roteiro-action-btn" icon="pi pi-arrow-down" onClick={() => diaOps.moveDown(i)} title="Descer" aria-label="Descer" />
                  <AppButton type="button" variant="ghost" className="icon-action-btn vtur-table-action roteiro-action-btn" icon="pi pi-plus" onClick={() => diaOps.add(i)} title="Adicionar" aria-label="Adicionar" />
                  <AppButton type="button" variant="danger" className="icon-action-btn danger vtur-table-action roteiro-action-btn" icon="pi pi-trash" onClick={() => diaOps.remove(i)} title="Excluir" aria-label="Excluir" />
                </div>
              </div>
            ))}
            {dias.length === 0 && (
              <AppButton type="button" variant="secondary" onClick={() => setDias([newDia(0)])} style={actionBtnSt}>+ Adicionar dia</AppButton>
            )}
          </div>
        )}

        {/* ─── Aba: Investimento ───────────────────────────────────────── */}
        {abaAtiva === "investimento" && (
          <div style={cardSt}>
            <div style={{ overflowX: "auto" }}>
              <table className="table-default table-header-blue table-mobile-cards roteiro-edit-table roteiro-edit-table-investimento" style={{ width: "100%" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Tipo *", "Valor por Pessoa (R$)", "Qte Pax", "Valor por Apto (R$)", ""].map((h) => (
                      <th key={h} style={{ padding: "1rem", textAlign: "left", color: "#374151", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {investimentos.map((inv, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={tdSt}>
                        <AutocompleteInput
                          style={{ ...inputSt, width: 160 }}
                          value={inv.tipo}
                          onChange={(v) => investimentoOps.update(i, { tipo: v })}
                          onBlurSave={(v) => salvarSugestao("investimento_tipo", v)}
                          suggestions={sugestoes["investimento_tipo"] || []}
                          placeholder="Ex: Pacote Completo"
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 140 }}
                          type="number"
                          min="0"
                          step="0.01"
                          value={inv.valor_por_pessoa}
                          onChange={(e) => {
                            const vpp = Number(e.target.value);
                            investimentoOps.update(i, { valor_por_pessoa: vpp, valor_por_apto: calcVpa(vpp, inv.qtd_apto) });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <input
                          style={{ ...inputSt, width: 80 }}
                          type="number"
                          min="0"
                          value={inv.qtd_apto}
                          onChange={(e) => {
                            const qtd = Number(e.target.value);
                            investimentoOps.update(i, { qtd_apto: qtd, valor_por_apto: calcVpa(inv.valor_por_pessoa, qtd) });
                          }}
                        />
                      </td>
                      <td style={tdSt}>
                        <input style={{ ...inputSt, width: 140, background: "#f9fafb" }} type="number" value={inv.valor_por_apto} readOnly />
                      </td>
                      <RowActions
                        onAdd={() => investimentoOps.add(i)}
                        onDelete={() => investimentoOps.remove(i)}
                        onUp={() => investimentoOps.moveUp(i)}
                        onDown={() => investimentoOps.moveDown(i)}
                      />
                    </tr>
                  ))}
                </tbody>
              </table>
              {investimentos.length === 0 && (
                <AppButton type="button" variant="secondary" className="mt-2" onClick={() => setInvestimentos([newInvestimento(0)])}>
                  + Adicionar investimento
                </AppButton>
              )}
            </div>
            {investimentos.length > 0 && (
              <div style={{ textAlign: "right", fontWeight: 700, fontSize: 13, color: "#2563eb", marginTop: 12 }}>
                Total por pessoa: R$ {totalInvestimento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
            )}
          </div>
        )}

        {/* ─── Aba: Formas de Pagamento ────────────────────────────────── */}
        {abaAtiva === "pagamento" && (
          <div style={cardSt}>
            <div
              style={{
                border: "1px solid #dbeafe",
                background: "#f8fbff",
                borderRadius: 12,
                padding: 16,
                marginBottom: 14,
              }}
            >
              <div className="mobile-stack-buttons" style={{ justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div style={{ maxWidth: 900 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1d4ed8", marginBottom: 4 }}>
                    Formas de pagamento cadastradas
                  </div>
                  <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                    Selecione os serviços e as formas de pagamento do catálogo para aplicar automaticamente. O usuário só escolhe; não precisa digitar os textos.
                  </div>
                </div>
                <AppButton type="button" variant="primary" onClick={handleAplicarPagamentosSelecionados}>
                  Aplicar aos serviços selecionados
                </AppButton>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14, marginTop: 14 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                    Serviços para aplicar
                  </div>
                  <div className="mobile-stack-buttons" style={{ gap: 12, flexWrap: "wrap" }}>
                    {pagamentoServiceOptions.map((servico) => {
                      const checked = pagamentoPresetServicos.some((item) => normalizeTextKey(item) === normalizeTextKey(servico));
                      return (
                        <label key={servico} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "#334155" }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => togglePagamentoPresetValue(servico, pagamentoPresetServicos, setPagamentoPresetServicos)}
                          />
                          {servico}
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#334155", marginBottom: 8 }}>
                    Categoria de pagamento
                  </div>
                  <div className="mobile-stack-buttons" style={{ gap: 8, marginBottom: 10 }}>
                    <select
                      style={{ ...inputSt, width: 320 }}
                      value={pagamentoPresetCategoria}
                      onChange={(e) => setPagamentoPresetCategoria(e.target.value)}
                    >
                      {pagamentoCategorias.map((categoria) => (
                        <option key={categoria} value={categoria}>
                          {categoria}
                        </option>
                      ))}
                    </select>
                    <AppButton
                      type="button"
                      variant="ghost"
                      onClick={() => setShowPagamentoCategoriaManager((prev) => !prev)}
                      icon={showPagamentoCategoriaManager ? "pi pi-angle-up" : "pi pi-angle-down"}
                    >
                      {showPagamentoCategoriaManager ? "Ocultar categorias" : "Gerenciar categorias"}
                    </AppButton>
                  </div>
                  <div className="mobile-stack-buttons" style={{ gap: 8 }}>
                    <input
                      style={{ ...inputSt, width: 240 }}
                      value={novoPagamentoCategoria}
                      onChange={(e) => setNovoPagamentoCategoria(e.target.value)}
                      placeholder="Nova categoria (ex: Pagamento Operadora X)"
                    />
                    <AppButton type="button" variant="ghost" onClick={handleAdicionarPagamentoCategoria}>
                      + Categoria
                    </AppButton>
                  </div>
                  {showPagamentoCategoriaManager ? (
                    <div
                      style={{
                        marginTop: 10,
                        border: "1px solid #d1d5db",
                        borderRadius: 8,
                        background: "#fff",
                        padding: 10,
                      }}
                    >
                      <input
                        style={{ ...inputSt, width: "100%", marginBottom: 8 }}
                        value={pagamentoCategoriaFiltro}
                        onChange={(e) => setPagamentoCategoriaFiltro(e.target.value)}
                        placeholder="Buscar categoria..."
                      />
                      <div style={{ maxHeight: 220, overflowY: "auto" }}>
                        <table className="table-default" style={{ width: "100%" }}>
                          <thead>
                            <tr>
                              <th style={{ padding: "0.65rem", textAlign: "left", color: "#64748b", fontSize: 12, borderBottom: "1px solid #e5e7eb" }}>Categoria</th>
                              <th style={{ padding: "0.65rem", textAlign: "center", color: "#64748b", fontSize: 12, borderBottom: "1px solid #e5e7eb", width: 130 }}>Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pagamentoCategoriasFiltradas.map((categoria) => {
                              const active = normalizeTextKey(categoria) === normalizeTextKey(pagamentoPresetCategoria);
                              return (
                                <tr key={`cat-${categoria}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                                  <td style={{ padding: "0.65rem", fontSize: 13, color: active ? "#1d4ed8" : "#334155", fontWeight: active ? 700 : 500 }}>
                                    <AppButton
                                      type="button"
                                      variant="ghost"
                                      onClick={() => setPagamentoPresetCategoria(categoria)}
                                      aria-pressed={active}
                                      style={{
                                        border: "none",
                                        background: "transparent",
                                        color: "inherit",
                                        fontWeight: "inherit",
                                        cursor: "pointer",
                                        padding: 0,
                                        minHeight: "auto",
                                        minWidth: 0,
                                        borderRadius: 0,
                                        justifyContent: "flex-start",
                                      }}
                                    >
                                      {categoria}
                                    </AppButton>
                                  </td>
                                  <td style={{ padding: "0.65rem", textAlign: "center" }}>
                                    <div className="action-buttons action-buttons-center roteiro-row-actions" style={{ justifyContent: "center" }}>
                                      <AppButton
                                        type="button"
                                        variant="ghost"
                                        className="icon-action-btn vtur-table-action roteiro-action-btn"
                                        icon="pi pi-pencil"
                                        onClick={() => handleEditarPagamentoCategoria(categoria)}
                                        title={`Editar categoria ${categoria}`}
                                        aria-label={`Editar categoria ${categoria}`}
                                      />
                                      <AppButton
                                        type="button"
                                        variant="danger"
                                        className="icon-action-btn danger vtur-table-action roteiro-action-btn"
                                        icon="pi pi-trash"
                                        onClick={() => handleExcluirPagamentoCategoria(categoria)}
                                        title={`Excluir categoria ${categoria}`}
                                        aria-label={`Excluir categoria ${categoria}`}
                                      />
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {pagamentoCategoriasFiltradas.length === 0 ? (
                              <tr>
                                <td colSpan={2} style={{ padding: "0.75rem", fontSize: 12, color: "#64748b" }}>
                                  Nenhuma categoria encontrada.
                                </td>
                              </tr>
                            ) : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div>
                  <div className="mobile-stack-buttons" style={{ justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#334155" }}>
                      Formas de pagamento do catálogo ({pagamentoPresetCategoria || "Categoria"})
                    </div>
                    <div className="mobile-stack-buttons" style={{ gap: 8 }}>
                      <AppButton
                        type="button"
                        variant="ghost"
                        onClick={() => setPagamentoPresetFormas([...pagamentoFormasCategoriaAtual])}
                        style={{ fontSize: 12, padding: "4px 10px" }}
                      >
                        Selecionar todas
                      </AppButton>
                      <AppButton
                        type="button"
                        variant="ghost"
                        onClick={() => setPagamentoPresetFormas([])}
                        style={{ fontSize: 12, padding: "4px 10px" }}
                      >
                        Limpar
                      </AppButton>
                    </div>
                  </div>
                  <input
                    style={{ ...inputSt, width: "100%", marginBottom: 8 }}
                    value={pagamentoFormaFiltro}
                    onChange={(e) => setPagamentoFormaFiltro(e.target.value)}
                    placeholder="Buscar forma de pagamento..."
                  />
                  <div
                    style={{
                      marginBottom: 10,
                      border: "1px solid #d1d5db",
                      borderRadius: 8,
                      background: "#fff",
                      maxHeight: 240,
                      overflowY: "auto",
                    }}
                  >
                    <table className="table-default" style={{ width: "100%" }}>
                      <thead>
                        <tr>
                          <th style={{ padding: "0.65rem", textAlign: "center", color: "#64748b", fontSize: 12, borderBottom: "1px solid #e5e7eb", width: 86 }}>Usar</th>
                          <th style={{ padding: "0.65rem", textAlign: "left", color: "#64748b", fontSize: 12, borderBottom: "1px solid #e5e7eb" }}>Forma</th>
                          <th style={{ padding: "0.65rem", textAlign: "center", color: "#64748b", fontSize: 12, borderBottom: "1px solid #e5e7eb", width: 130 }}>Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagamentoFormasFiltradasCategoriaAtual.map((forma) => {
                          const checked = pagamentoPresetFormas.some((item) => normalizeTextKey(item) === normalizeTextKey(forma));
                          return (
                            <tr key={`forma-cat-${forma}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "0.65rem", textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => togglePagamentoPresetValue(forma, pagamentoPresetFormas, setPagamentoPresetFormas)}
                                />
                              </td>
                              <td style={{ padding: "0.65rem", fontSize: 13, color: "#334155" }}>{forma}</td>
                              <td style={{ padding: "0.65rem", textAlign: "center" }}>
                                <div className="action-buttons action-buttons-center roteiro-row-actions" style={{ justifyContent: "center" }}>
                                  <AppButton
                                    type="button"
                                    variant="ghost"
                                    className="icon-action-btn vtur-table-action roteiro-action-btn"
                                    icon="pi pi-pencil"
                                    onClick={() => handleEditarFormaPagamentoCategoriaAtual(forma)}
                                    title={`Editar forma ${forma}`}
                                    aria-label={`Editar forma ${forma}`}
                                  />
                                  <AppButton
                                    type="button"
                                    variant="danger"
                                    className="icon-action-btn danger vtur-table-action roteiro-action-btn"
                                    icon="pi pi-trash"
                                    onClick={() => handleExcluirFormaPagamentoCategoriaAtual(forma)}
                                    title={`Excluir forma ${forma}`}
                                    aria-label={`Excluir forma ${forma}`}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        {pagamentoFormasFiltradasCategoriaAtual.length === 0 ? (
                          <tr>
                            <td colSpan={3} style={{ padding: "0.75rem", fontSize: 12, color: "#64748b" }}>
                              Nenhuma forma cadastrada para esta categoria.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                  <div className="mobile-stack-buttons" style={{ gap: 8 }}>
                    <input
                      style={{ ...inputSt, width: 360 }}
                      value={novaPagamentoForma}
                      onChange={(e) => setNovaPagamentoForma(e.target.value)}
                      placeholder={`Nova forma para ${pagamentoPresetCategoria || "categoria selecionada"}`}
                    />
                    <AppButton type="button" variant="ghost" onClick={handleAdicionarFormaPagamentoCategoriaAtual}>
                      + Forma
                    </AppButton>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table className="table-default table-header-blue table-mobile-cards roteiro-edit-table roteiro-edit-table-pagamento" style={{ width: "100%" }}>
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    {["Serviço", "Valor Total c/Taxas (R$)", "Taxas (R$)", "Formas de Pagamento", ""].map((h) => (
                      <th key={h} style={{ padding: "1rem", textAlign: "left", color: "#374151", fontWeight: 700, whiteSpace: "nowrap", borderBottom: "1px solid #e5e7eb" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagamentos.map((p, i) => {
                    const selectedFormas = splitPagamentoFormas(String(p.forma_pagamento || ""));
                    const formasDoServico = pagamentoFormasByServico.get(normalizeTextKey(p.servico)) || [];
                    const formasVisiveis = formasDoServico.length > 0 ? formasDoServico : selectedFormas;
                    return (
                    <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={tdSt}>
                        <select
                          style={{ ...inputSt, width: 220 }}
                          value={p.servico}
                          onChange={(e) => {
                            const servico = e.target.value;
                            const base = pagamentoTotalsByServico[servico] || { valor_total_com_taxas: 0, taxas: 0 };
                            const currentTotal = Number(p.valor_total_com_taxas || 0);
                            const currentTaxas = Number(p.taxas || 0);
                            pagamentoOps.update(i, {
                              servico,
                              valor_total_com_taxas: currentTotal > 0 ? currentTotal : base.valor_total_com_taxas,
                              taxas: currentTaxas > 0 ? currentTaxas : base.taxas,
                            });
                          }}
                        >
                          <option value="">Selecione</option>
                          {pagamentoServiceOptions.map((serviceOption) => (
                            <option key={serviceOption} value={serviceOption}>
                              {serviceOption}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={tdSt}>
                        <input style={{ ...inputSt, width: 150 }} type="number" min="0" step="0.01" value={p.valor_total_com_taxas} onChange={(e) => pagamentoOps.update(i, { valor_total_com_taxas: Number(e.target.value) })} />
                      </td>
                      <td style={tdSt}>
                        <input style={{ ...inputSt, width: 120 }} type="number" min="0" step="0.01" value={p.taxas} onChange={(e) => pagamentoOps.update(i, { taxas: Number(e.target.value) })} />
                      </td>
                      <td style={tdSt}>
                        <div
                          style={{
                            border: "1px solid #d1d5db",
                            borderRadius: 8,
                            padding: 10,
                            width: 360,
                            maxHeight: 180,
                            overflowY: "auto",
                            background: "#fff",
                            display: "grid",
                            gap: 8,
                          }}
                        >
                          {formasVisiveis.map((forma) => {
                            const selected = selectedFormas.some(
                              (item) => normalizeTextKey(item) === normalizeTextKey(forma)
                            );
                            return (
                              <label key={`${i}-${forma}`} style={{ display: "inline-flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#334155" }}>
                                <input
                                  style={{ marginTop: 2 }}
                                  type="checkbox"
                                  checked={selected}
                                  onChange={(e) => handlePagamentoFormaToggle(i, forma, e.target.checked)}
                                />
                                <span>{forma}</span>
                              </label>
                            );
                          })}
                        </div>
                      </td>
                      <RowActions
                        onAdd={() => pagamentoOps.add(i)}
                        onDelete={() => pagamentoOps.remove(i)}
                        onUp={() => pagamentoOps.moveUp(i)}
                        onDown={() => pagamentoOps.moveDown(i)}
                      />
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              {pagamentos.length === 0 && (
                <AppButton type="button" variant="secondary" className="mt-2" onClick={() => setPagamentos([newPagamento(0)])}>
                  + Adicionar pagamento
                </AppButton>
              )}
            </div>
            {pagamentos.length > 0 && (
              <div style={{ textAlign: "right", fontWeight: 700, fontSize: 14, color: "#059669", marginTop: 12 }}>
                Total: R$ {totalPagamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
              </div>
            )}
          </div>
        )}

        {/* ─── Aba: Incluído / Não Incluído ───────────────────────────── */}
        {abaAtiva === "inclusoes" && (
          <div style={cardSt}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
              <div>
                <div style={{ fontWeight: 700, color: "#111827", fontSize: 13, marginBottom: 6 }}>
                  O que está incluído
                </div>
                <textarea
                  style={{ ...inputSt, width: "100%", minHeight: 140, resize: "vertical" }}
                  value={incluiTexto}
                  onChange={(e) => setIncluiTexto(e.target.value)}
                  placeholder="Escreva aqui o texto do que está incluído (um item por linha; ENTER cria um novo marcador)."
                />
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                  Esse texto é puxado para o PDF na seção “O que está incluído”.
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, color: "#111827", fontSize: 13, marginBottom: 6 }}>
                  O que não está incluído
                </div>
                <textarea
                  style={{ ...inputSt, width: "100%", minHeight: 140, resize: "vertical" }}
                  value={naoIncluiTexto}
                  onChange={(e) => setNaoIncluiTexto(e.target.value)}
                  placeholder="Escreva aqui o texto do que não está incluído (um item por linha; ENTER cria um novo marcador)."
                />
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                  Esse texto é puxado para o PDF na seção “O que não está incluído”.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Aba: Informações Importantes ──────────────────────────── */}
        {abaAtiva === "informacoes" && (
          <div style={cardSt}>
            <div>
              <div style={{ fontWeight: 700, color: "#111827", fontSize: 13, marginBottom: 6 }}>
                Informações Importantes
              </div>
              <textarea
                style={{ ...inputSt, width: "100%", minHeight: 180, resize: "vertical" }}
                value={informacoesImportantes}
                onChange={(e) => setInformacoesImportantes(e.target.value)}
                placeholder="Escreva aqui as informações importantes (um item por linha; ENTER cria um novo marcador)."
              />
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
                Esse texto é puxado para o PDF e para a visualização HTML na seção “Informações Importantes”.
              </div>
            </div>
          </div>
        )}
      </div>

      <AppDialog
        open={Boolean(pagamentoEditState)}
        title={pagamentoEditState?.mode === "categoria" ? "Editar categoria de pagamento" : "Editar forma de pagamento"}
        confirmLabel="Salvar"
        cancelLabel="Cancelar"
        confirmDisabled={!String(pagamentoEditValue || "").trim()}
        confirmLoading={pagamentoEditSaving}
        onConfirm={handleConfirmPagamentoEdit}
        onCancel={handleCancelPagamentoEdit}
      >
        {pagamentoEditState ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
              {pagamentoEditState.mode === "categoria"
                ? `Editar categoria "${pagamentoEditState.currentValue}".`
                : `Editar forma de pagamento em "${pagamentoEditState.categoria}".`}
            </div>
            <input
              style={{ ...inputSt, width: "100%" }}
              value={pagamentoEditValue}
              onChange={(e) => setPagamentoEditValue(e.target.value)}
              onFocus={selectAllInputOnFocus}
              autoFocus
              placeholder={
                pagamentoEditState.mode === "categoria"
                  ? "Nome da categoria"
                  : "Nome da forma de pagamento"
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && !pagamentoEditSaving && String(pagamentoEditValue || "").trim()) {
                  e.preventDefault();
                  void handleConfirmPagamentoEdit();
                }
              }}
            />
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        open={Boolean(pagamentoDeleteState)}
        title={pagamentoDeleteState?.mode === "categoria" ? "Excluir categoria" : "Excluir forma de pagamento"}
        message={
          pagamentoDeleteState?.mode === "categoria"
            ? `Deseja excluir a categoria "${pagamentoDeleteState.target}" do catálogo de pagamentos?`
            : `Deseja excluir a forma "${pagamentoDeleteState?.target}" da categoria "${pagamentoDeleteState?.categoria}"?`
        }
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        confirmVariant="danger"
        confirmLoading={pagamentoDeleteSaving}
        onConfirm={handleConfirmPagamentoDelete}
        onCancel={handleCancelPagamentoDelete}
      />

      <AppNoticeDialog
        open={Boolean(pagamentoNoticeMessage)}
        title="Aviso"
        message={pagamentoNoticeMessage}
        closeLabel="OK"
        onClose={() => setPagamentoNoticeMessage(null)}
      />

      <AppDialog
        open={confirmAutoItineraryOpen}
        title="Gerar itinerário automático"
        message="Gerar novamente o itinerário automático e substituir os textos atuais?"
        confirmLabel="Substituir"
        cancelLabel="Cancelar"
        onConfirm={handleConfirmGenerateAutomaticItinerary}
        onCancel={() => setConfirmAutoItineraryOpen(false)}
      />

      <AppDialog
        open={confirmImportInfoOpen}
        title="Importar informações importantes"
        message="Substituir o texto atual de 'Informações Importantes' pelo texto importado?"
        confirmLabel="Substituir"
        cancelLabel="Cancelar"
        onConfirm={() => void handleConfirmImportRoteiroFile()}
        onCancel={() => setConfirmImportInfoOpen(false)}
      />

      <AppNoticeDialog
        open={Boolean(noticeMessage)}
        title="Aviso"
        message={noticeMessage}
        closeLabel="OK"
        onClose={() => setNoticeMessage(null)}
      />

      {/* ─── Modal Busca Dias ────────────────────────────────────────────── */}
      {showDiasBusca && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowDiasBusca(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 24, maxWidth: 560, width: "92%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "80vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 14 }}>Buscar dias no banco</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input style={{ ...inputSt, flex: 1 }} value={diasBuscaCidade} onChange={(e) => setDiasBuscaCidade(e.target.value)} placeholder="Cidade (opcional)" />
              <input style={{ ...inputSt, flex: 2 }} value={diasBuscaQ} onChange={(e) => setDiasBuscaQ(e.target.value)} placeholder="Buscar por texto..." />
              <AppButton type="button" variant="primary" onClick={handleBuscarDias} disabled={diasBuscaLoading}>
                {diasBuscaLoading ? "..." : "Buscar"}
              </AppButton>
            </div>
            {diasBuscaResults.length === 0 && (
              <div style={{ color: "#6b7280", fontSize: 13, textAlign: "center", padding: 24 }}>
                Pesquise para ver resultados
              </div>
            )}
            {diasBuscaResults.map((d) => (
              <div
                key={d.id}
                onClick={() => addDiaBanco(d)}
                style={{ padding: "10px 12px", borderRadius: 8, border: "1px solid #e5e7eb", marginBottom: 8, cursor: "pointer" }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#f5f3ff")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "")}
              >
                <div style={{ fontWeight: 600, color: "#2563eb", fontSize: 12, marginBottom: 4 }}>{d.cidade}</div>
                <div style={{ fontSize: 12, color: "#374151" }}>{d.descricao.slice(0, 140)}{d.descricao.length > 140 ? "..." : ""}</div>
              </div>
            ))}
            <AppButton type="button" variant="secondary" className="mt-3" onClick={() => setShowDiasBusca(false)}>
              Fechar
            </AppButton>
          </div>
        </div>
      )}

      {/* ─── Modal Gerar Orçamento ───────────────────────────────────────── */}
      {showGerarModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => !gerarLoading && setShowGerarModal(false)}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 28, maxWidth: 440, width: "92%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Gerar Orçamento</div>
            <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 18 }}>
              Roteiro: <strong>{nome}</strong>
            </div>
            {gerarClienteSel ? (
              <div style={{ padding: "10px 14px", background: "#f5f3ff", borderRadius: 8, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{gerarClienteSel.nome}</div>
                  {gerarClienteSel.whatsapp && <div style={{ fontSize: 12, color: "#6b7280" }}>{gerarClienteSel.whatsapp}</div>}
                </div>
                <AppButton type="button" variant="link" onClick={() => { setGerarClienteSel(null); setGerarClienteQ(""); setGerarClienteNome(""); }}>Trocar</AppButton>
              </div>
            ) : (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#374151", display: "block", marginBottom: 6 }}>Cliente</label>
                <input
                  style={{ ...inputSt, marginBottom: 6 }}
                  value={gerarClienteQ}
                  onChange={(e) => { setGerarClienteQ(e.target.value); setGerarClienteNome(e.target.value); }}
                  placeholder="Buscar cliente ou digitar nome..."
                />
                {gerarClienteLoading && <div style={{ fontSize: 12, color: "#6b7280" }}>Buscando...</div>}
                {gerarClienteResults.length > 0 && (
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden", marginTop: 4 }}>
                    {gerarClienteResults.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => { setGerarClienteSel(c); setGerarClienteNome(c.nome); setGerarClienteQ(c.nome); setGerarClienteResults([]); }}
                        style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f3f4f6" }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#f5f3ff")}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "")}
                      >
                        <span style={{ fontWeight: 500 }}>{c.nome}</span>
                        {c.whatsapp && <span style={{ marginLeft: 8, color: "#6b7280", fontSize: 11 }}>{c.whatsapp}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ background: "#f9fafb", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "#374151", marginBottom: 4 }}>
                <span>Pagamentos</span>
                <span>{pagamentos.length} item(s)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>Total</span>
                <span style={{ color: "#059669" }}>R$ {totalPagamento.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <AppButton type="button" variant="secondary" onClick={() => setShowGerarModal(false)} disabled={gerarLoading}>
                Cancelar
              </AppButton>
              <AppButton
                type="button"
                variant="primary"
                onClick={handleGerarOrcamento}
                disabled={gerarLoading || (!gerarClienteSel && !gerarClienteNome.trim())}
              >
                {gerarLoading ? "Gerando..." : "Gerar Orçamento"}
              </AppButton>
            </div>
          </div>
        </div>
      )}
      </div>
    </AppPrimerProvider>
  );
}
