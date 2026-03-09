import { normalizeText } from "../normalizeText";
import type {
  ContratoDraft,
  ContratoImportResult,
  ContratanteDraft,
  PassageiroDraft,
  PagamentoDraft,
  PagamentoParcelaDraft,
} from "./contratoCvcExtractor";
import { extractPdfText } from "./contratoCvcExtractor";

type ResumoRow = {
  nome?: string | null;
  recibo?: string | null;
  total?: number | null;
  taxas?: number | null;
};

const RECIBO_REGEX = /\b\d{4}\s*-\s*\d{6,}\b|\b\d{14}\b/;

function cleanText(text: string) {
  return (text || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\t+/g, " | ")
    .replace(/[ \t]*\|[ \t]*/g, " | ")
    .replace(/ {2,}/g, " | ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parseCurrency(value?: string | null) {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9,.-]/g, "");
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

function parseDateBr(value?: string | null) {
  if (!value) return null;
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function splitColumns(line: string) {
  if (!line) return [];
  if (line.includes("|")) {
    return line
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return line
    .split(/(?:\t+|\s{2,})/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeName(value?: string | null) {
  return normalizeText(value || "", { trim: true, collapseWhitespace: true });
}

function normalizeCpf(value?: string | null) {
  if (!value) return "";
  return value.replace(/\D/g, "");
}

function normalizePasteForMatch(raw: string) {
  return (raw || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractContratanteNomeFromRecibo(raw: string) {
  const text = normalizePasteForMatch(raw);
  const match = text.match(new RegExp(`Passageiros\\s+(.+?)\\s+(${RECIBO_REGEX.source})`, "i"));
  if (!match?.[1]) return null;
  const nome = (match[1] || "").replace(/\s+/g, " ").trim();
  if (!nome || nome.length < 4) return null;
  const nomeNorm = normalizeName(nome);
  if (!nomeNorm) return null;
  if (/\b(nome|recibo|valor|taxa|passageiros?)\b/i.test(nomeNorm)) return null;
  if (nomeNorm.includes("sobrenome") && nomeNorm.includes("nascimento")) return null;
  return nome;
}

function normNameForCompare(value: string) {
  return normalizeText(value || "", { trim: true, collapseWhitespace: true })
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstTok(value: string) {
  return normNameForCompare(value).split(" ").filter(Boolean)[0] || "";
}

function lastTok(value: string) {
  const tokens = normNameForCompare(value).split(" ").filter(Boolean);
  return tokens[tokens.length - 1] || "";
}

function scoreNomeMatch(a: string, b: string) {
  const A = normNameForCompare(a);
  const B = normNameForCompare(b);
  if (!A || !B) return 0;
  if (A === B) return 100;

  let score = 0;
  const tokensA = A.split(" ").filter(Boolean);
  const tokensB = B.split(" ").filter(Boolean);
  const setB = new Set(tokensB);

  const aFirst = firstTok(A);
  if (aFirst && setB.has(aFirst)) score += 40;

  const aLast = lastTok(A);
  if (aLast && setB.has(aLast)) score += 40;

  const setA = new Set(tokensA);
  let inter = 0;
  for (const t of setA) {
    if (setB.has(t)) inter += 1;
  }
  score += Math.min(20, inter * 5);
  return score;
}

function resolveCpfContratanteByNome(contrNome: string, passageiros: PassageiroDraft[]) {
  let bestCpf = "";
  let bestScore = 0;

  for (const p of passageiros) {
    const cpf = normalizeCpf(p.cpf);
    if (cpf.length !== 11) continue;
    const score = scoreNomeMatch(contrNome, p.nome);
    if (score > bestScore) {
      bestScore = score;
      bestCpf = cpf;
    }
  }

  return bestScore >= 70 ? bestCpf : "";
}

function extractContratanteBlock(text: string) {
  const match = text.match(/CONTRATANTE\s+([\s\S]*?)(?=\n(?:ROTEIRO|PROGRAMAÇÃO|PASSAGEIROS|FILIAL|$))/i);
  return match?.[1] || null;
}

function extractContratanteNameFromBlock(block: string | null) {
  if (!block) return null;
  const lines = block
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const clean = (value: string) =>
    value.replace(/[|]/g, " ").replace(/\s+/g, " ").trim();

  // Preferir o nome na mesma linha do recibo (evita pegar o 1º passageiro).
  for (let idx = 0; idx < lines.length; idx += 1) {
    let line = lines[idx];
    if (!RECIBO_REGEX.test(line) && /\b\d{4}\s*-\s*$/.test(line) && lines[idx + 1]) {
      line = `${line} ${lines[idx + 1]}`;
      idx += 1;
    }
    const reciboMatch = line.match(RECIBO_REGEX);
    if (!reciboMatch || reciboMatch.index == null) continue;

    const before = clean(line.slice(0, reciboMatch.index));
    const beforeNorm = normalizeName(before);
    if (
      beforeNorm &&
      beforeNorm.length > 3 &&
      !/\d/.test(before) &&
      !/^(nome|recibo|valor|taxa|remessa|passageiro|pagamento|cpf|transporte|traslado)\b/i.test(beforeNorm)
    ) {
      return before;
    }
  }

  // Layout vertical: "Nome" em uma linha, valor na linha seguinte.
  const nomeLabelIdx = lines.findIndex((line) => {
    const norm = normalizeName(line);
    return norm === "nome" || norm.startsWith("nome ");
  });
  if (nomeLabelIdx >= 0) {
    for (let i = nomeLabelIdx + 1; i < Math.min(lines.length, nomeLabelIdx + 10); i += 1) {
      const raw = lines[i];
      const norm = normalizeName(raw);
      if (!norm) continue;
      if (/^(recibo|valor|taxa|passageiros?)\b/i.test(norm)) continue;
      if (RECIBO_REGEX.test(raw)) continue;
      if (/^[\p{L}\s'`-]+$/u.test(raw) && norm.length > 3) {
        return clean(raw);
      }
      const reciboMatch = raw.match(RECIBO_REGEX);
      if (reciboMatch?.index != null) {
        const before = clean(raw.slice(0, reciboMatch.index));
        if (before && !/\d/.test(before)) return before;
      }
    }
  }

  return null;
}

function extractContratanteCpfFromBlock(block: string | null, name?: string | null) {
  if (!block) return null;
  let candidateIndex = 0;
  if (name) {
    const idx = block.indexOf(name);
    if (idx >= 0) candidateIndex = idx;
  }
  const regex = /CPF\s*([0-9]{11})/gi;
  let match;
  while ((match = regex.exec(block))) {
    if (match.index >= candidateIndex) {
      return match[1];
    }
  }
  regex.lastIndex = 0;
  match = regex.exec(block);
  return match?.[1] || null;
}

function extractResumoRow(lines: string[]): ResumoRow {
  const reciboRegex = RECIBO_REGEX;
  for (let idx = 0; idx < lines.length; idx += 1) {
    let line = lines[idx];
    if (!reciboRegex.test(line) && /\b\d{4}\s*-\s*$/.test(line) && lines[idx + 1]) {
      line = `${line} ${lines[idx + 1]}`;
      idx += 1;
    }
    if (!reciboRegex.test(line)) continue;
    const parts = splitColumns(line);
    if (parts.length > 1) {
      const recIdx = parts.findIndex((p) => reciboRegex.test(p));
      if (recIdx >= 0) {
        let nome = parts[recIdx - 1] || null;
        const nomeNorm = normalizeName(nome);
        if (nomeNorm && (nomeNorm.includes("recibo") || nomeNorm.includes("valor") || nomeNorm.includes("taxa"))) {
          nome = parts[recIdx - 2] || null;
        }
        const numericParts = parts
          .slice(recIdx + 1)
          .map((p) => parseCurrency(p))
          .filter((v) => v != null) as number[];
        const reciboMatch = parts[recIdx].match(reciboRegex) || line.match(reciboRegex);
        return {
          nome,
          recibo: reciboMatch?.[0] ? normalizeRecibo(reciboMatch[0]) : null,
          total: numericParts[0] ?? null,
          taxas: numericParts[1] ?? null,
        };
      }
    }

    const plain = line.replace(/[|]/g, " ");
    const match = plain.match(
      /([\p{L}' ]+?)\s+(\d{4}\s*-\s*\d{6,}|\d{14})\s+([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})\s+([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/u
    );
    if (match) {
      return {
        nome: match[1]?.trim() || null,
        recibo: normalizeRecibo(match[2]),
        total: parseCurrency(match[3]),
        taxas: parseCurrency(match[4]),
      };
    }
  }
  return {};
}

function extractCurrencyByLabel(text: string, label: RegExp) {
  const match = text.match(label);
  if (!match?.[1]) return null;
  return parseCurrency(match[1]);
}

function sanitizeDestinoTerm(destino?: string | null) {
  if (!destino) return null;
  let term = destino.replace(/\s+/g, " ").trim();
  if (!term) return null;
  term = term.replace(/\s*[-\u2013\u2014]\s*\d+\s*dias?\s*\d+\s*noites?.*$/i, "");
  term = term.replace(/\s*[-\u2013\u2014]\s*\d+\s*dias?.*$/i, "");
  term = term.replace(/\s*[-\u2013\u2014]\s*\d+\s*noites?.*$/i, "");
  term = term.replace(/\s*\/\s*\d+\s*dias?\s*\d+\s*noites?.*$/i, "");
  term = term.replace(/\s*\/\s*\d+\s*dias?.*$/i, "");
  term = term.replace(/\s*\/\s*\d+\s*noites?.*$/i, "");
  return term.trim();
}

function normalizeRecibo(value?: string | null) {
  if (!value) return "";
  const cleaned = value
    .replace(/[\u2013\u2014\u2011]/g, "-")
    .replace(/\s+/g, "")
    .replace(/[^\d-]/g, "");
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 14) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  return cleaned;
}

function extractDescricaoRoteiro(text: string) {
  const match = text.match(
    /Descri(?:c|\u00e7)(?:a|\u00e3)o do Roteiro\s+([^\n]+?)(?=\s+Tipo de Produto|\s+N(?:u|\u00fa)mero do Roteiro|\n|$)/i
  );
  return match?.[1]?.trim() || null;
}

function extractTipoProduto(text: string) {
  const match = text.match(
    /Tipo de Produto\s+([^\n]+?)(?=\s+N(?:u|\u00fa)mero do Roteiro|\s+Roteiro Systur|\s+Data de Sa(?:i|\u00ed)da|\n|$)/i
  );
  return match?.[1]?.trim() || null;
}

function extractNavio(text: string) {
  const cleaned = (text || "").replace(/\r/g, "\n").replace(/\u00a0/g, " ");
  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const startIdx = lines.findIndex((line) =>
    normalizeText(line, { trim: true, collapseWhitespace: true }).startsWith("fornecedores")
  );
  let scope = lines;
  if (startIdx >= 0) {
    const endRel = lines.slice(startIdx + 1).findIndex((line) => {
      const norm = normalizeText(line, { trim: true, collapseWhitespace: true });
      return (
        norm.startsWith("dados da reserva") ||
        norm.startsWith("passageiros") ||
        norm.startsWith("orcamento") ||
        norm.startsWith("orçamento") ||
        norm.startsWith("pagamento")
      );
    });
    const endIdx = endRel >= 0 ? startIdx + 1 + endRel : lines.length;
    scope = lines.slice(startIdx, endIdx);
  }

  const scopeText = scope
    .join("\n")
    .replace(/[|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const match = scopeText.match(/\b\d{5,}\s+([A-Za-zÀ-ÿ0-9 .'-]+?)\s+CAT\b/i);
  const navio = match?.[1]?.replace(/\s+/g, " ").trim() || "";
  const navioNorm = normalizeText(navio, { trim: true, collapseWhitespace: true });
  if (
    navio &&
    navioNorm &&
    /[a-z]/i.test(navio) &&
    navioNorm !== "navio" &&
    !navioNorm.includes("numero") &&
    !navioNorm.includes("acordo") &&
    !navioNorm.includes("categoria") &&
    !navioNorm.includes("servico")
  ) {
    return navio;
  }

  for (const rawLine of scope) {
    const cols = splitColumns(rawLine);
    if (cols.length < 2) continue;
    const first = cols[0] || "";
    const second = cols[1] || "";
    const firstDigits = first.replace(/\D/g, "");
    if (firstDigits.length >= 5 && /^\d+$/.test(firstDigits) && /[A-Za-zÀ-ÿ]/.test(second)) {
      const secondNorm = normalizeText(second, { trim: true, collapseWhitespace: true });
      if (
        secondNorm &&
        !secondNorm.includes("navio") &&
        !secondNorm.includes("numero") &&
        !secondNorm.includes("acordo")
      ) {
        return second.trim();
      }
    }
  }

  const fallback = scope
    .join("\n")
    .replace(/[|]/g, " ")
    .match(/Navio\s+([A-Za-zÀ-ÿ0-9 .'-]+?)(?=\s+CAT\b|\s+Categoria|\s+Servi|\n|$)/i);
  const fallbackValue = fallback?.[1]?.replace(/\s+/g, " ").trim() || "";
  const fallbackNorm = normalizeText(fallbackValue, { trim: true, collapseWhitespace: true });
  if (
    fallbackValue &&
    fallbackNorm &&
    /[a-z]/i.test(fallbackValue) &&
    fallbackNorm !== "navio" &&
    !fallbackNorm.includes("numero") &&
    !fallbackNorm.includes("acordo") &&
    !fallbackNorm.includes("categoria") &&
    !fallbackNorm.includes("servico")
  ) {
    return fallbackValue;
  }

  return null;
}

function extractLineValue(text: string, label: RegExp) {
  const match = text.match(label);
  return match?.[1]?.trim() || "";
}

function extractPassageiros(text: string): PassageiroDraft[] {
  const normalizedText = (text || "").replace(/\r/g, "\n").replace(/\u00a0/g, " ");

  const headers = Array.from(normalizedText.matchAll(/\bPASSAGEIROS\b/gi));
  let passageirosStart = -1;
  for (const header of headers) {
    const idx = typeof header.index === "number" ? header.index : -1;
    if (idx < 0) continue;
    const preview = normalizedText.slice(idx, idx + 250);
    if (/sobrenome/i.test(preview) && /nascimento/i.test(preview)) {
      passageirosStart = idx;
    }
  }

  let block = "";
  if (passageirosStart >= 0) {
    block = normalizedText.slice(passageirosStart);
    const endRel = block.search(
      /\bOR(?:C|\u00c7)AMENTO\b|\bPAGAMENTO\b|\bPAGAMENTOS\b|\bIMPRIMIR\b|\bCLIQUE AQUI\b|$/i
    );
    if (endRel >= 0) block = block.slice(0, endRel);
  } else {
    const blockMatch = normalizedText.match(
      /Passageiros[\s\S]*?(?=Or(?:c|\u00e7)amento|Pagamento|Valor Total|Clique aqui|$)/i
    );
    block = blockMatch?.[0] || "";
  }

  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);

  const passageiros: PassageiroDraft[] = [];
  let pendingIndex: number | null = null;
  const cpfMaskedRegex = /\b\d{3}\s*\.?\s*\d{3}\s*\.?\s*\d{3}\s*-?\s*\d{2}\b/;
  const cpfNumericAfterLabelRegex = /\bCPF\b[^0-9]{0,20}(\d{11})\b/i;
  const dateRegex = /\b\d{2}\/\d{2}\/\d{4}\b/;

  function buildNome(nome?: string | null, sobrenome?: string | null) {
    const first = (nome || "").trim();
    const last = (sobrenome || "").trim();
    if (!first) return last;
    if (!last) return first;
    return `${first} ${last}`.replace(/\s+/g, " ").trim();
  }

  function extractCpfDigits(line: string) {
    const numeric = line.match(cpfNumericAfterLabelRegex);
    if (numeric?.[1]) return numeric[1];
    const masked = line.match(cpfMaskedRegex);
    if (masked?.[0]) return masked[0].replace(/\D/g, "");
    return "";
  }

  for (const line of lines) {
    const normalized = normalizeText(line, { trim: true, collapseWhitespace: true });
    if (!normalized) continue;
    if (normalized.startsWith("passageiros")) continue;
    if (normalized.includes("sobrenome") && normalized.includes("nome")) continue;
    if (normalized.includes("nascimento") || normalized.includes("data validade")) continue;
    if (normalized.startsWith("rg") || normalized.startsWith("orgao")) continue;
    const cpfDigits = extractCpfDigits(line);
    if (cpfDigits && cpfDigits.length === 11 && pendingIndex != null && passageiros[pendingIndex]) {
      passageiros[pendingIndex] = { ...passageiros[pendingIndex], cpf: cpfDigits };
      pendingIndex = null;
      continue;
    }

    const parts = splitColumns(line);
    const dateIdx = parts.findIndex((p) => dateRegex.test(p));
    if (parts.length >= 2 && dateIdx >= 0) {
      const sobrenome = parts[0] || "";
      const nome = parts[1] || "";
      const nascimento = parseDateBr(parts[dateIdx]);
      const nomeCompleto = buildNome(nome, sobrenome);
      if (cpfDigits && cpfDigits.length === 11) {
        passageiros.push({ nome: nomeCompleto, cpf: cpfDigits, nascimento });
        pendingIndex = null;
      } else if (nomeCompleto) {
        passageiros.push({ nome: nomeCompleto, cpf: "", nascimento });
        pendingIndex = passageiros.length - 1;
      }
      continue;
    }

    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      const dateIdxRaw = dateMatch.index ?? 0;
      const before = line.slice(0, dateIdxRaw).trim();
      const tokens = before.split(/\s+/).filter(Boolean);
      const nomeToken = tokens.pop() || "";
      const sobrenome = tokens.join(" ");
      const nascimento = parseDateBr(dateMatch[0]);
      const nomeCompleto = buildNome(nomeToken, sobrenome);
      if (cpfDigits && cpfDigits.length === 11) {
        passageiros.push({ nome: nomeCompleto, cpf: cpfDigits, nascimento });
        pendingIndex = null;
      } else if (nomeCompleto) {
        passageiros.push({ nome: nomeCompleto, cpf: "", nascimento });
        pendingIndex = passageiros.length - 1;
      }
      continue;
    }
  }

  if (passageiros.length === 0 && block) {
    const stopTokens = new Set([
      "passageiros",
      "sobrenome",
      "nome",
      "nascimento",
      "sexo",
      "idade",
      "local",
      "embarque",
      "turno",
      "refeicao",
      "servicos",
      "especiais",
      "observacao",
      "dados",
      "pessoais",
    ]);

    const flat = block.replace(/[|]/g, " ").replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
    let data = flat.replace(/^.*?\bObserva(?:c|\u00e7)(?:a|\u00e3)o\b\s+/i, "");
    if (data === flat) {
      data = flat.replace(/^.*?\bNascimento\b\s+/i, "");
    }

    const rowRegex =
      /([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ' ]+?)\s+(\d{2}\/\d{2}\/\d{4})\s+(Feminino|Masculino)\s+\d{1,3}\b/gi;
    const matches = Array.from(data.matchAll(rowRegex));
    for (let i = 0; i < matches.length; i += 1) {
      const m = matches[i];
      const start = typeof m.index === "number" ? m.index : -1;
      if (start < 0) continue;
      const next = matches[i + 1];
      const end = next && typeof next.index === "number" ? next.index : data.length;
      const rowText = data.slice(start, end);

      const nascimento = parseDateBr(m[2] || "");
      const cpfDigits = extractCpfDigits(rowText);

      const rawNome = (m[1] || "").replace(/\s+/g, " ").trim();
      const tokens = rawNome.split(" ").filter(Boolean);
      while (tokens.length && stopTokens.has(normalizeText(tokens[0]))) {
        tokens.shift();
      }
      const nomeRaw = tokens.join(" ").trim();
      const nomeNorm = normalizeName(nomeRaw);
      if (!nomeNorm) continue;
      if (nomeNorm.includes("sobrenome") || nomeNorm.includes("nascimento")) continue;

      passageiros.push({
        nome: nomeRaw,
        cpf: cpfDigits && cpfDigits.length === 11 ? cpfDigits : "",
        nascimento,
      });
    }
  }

  const seen = new Set<string>();
  return passageiros.filter((p) => {
    const cpf = normalizeCpf(p.cpf);
    const nameKey = normalizeName(p.nome);
    const key = cpf.length === 11 ? `cpf:${cpf}` : nameKey ? `nome:${nameKey}` : "";
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractPagamentos(text: string, totalBase?: number | null): PagamentoDraft[] {
  const formaMatch = text.match(/Forma de pagamento\s+([^\n]+?)(?=\s+Plano\b|\s+Parcelas\b|\n|$)/i);
  const planoMatch = text.match(/Plano\s+([^\n]+?)(?=\s+Parcelas\b|\n|$)/i);
  const forma = formaMatch?.[1]?.trim() || "";
  const planoRaw = planoMatch?.[1]?.trim() || "";
  const plano = planoRaw ? planoRaw : null;

  let parcelasBlock = "";
  const parcelaMatch = text.match(/Parcelas([\s\S]*?)(?:Total apurado|Valor Total do Or(?:c|\u00e7)amento|Clique aqui|$)/i);
  if (parcelaMatch?.[1]) parcelasBlock = parcelaMatch[1];

  const parcelas: PagamentoParcelaDraft[] = [];
  const parcelaRegex =
    /(Entrada|\b\d{1,2}\b|Valor)\s+([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})(?:\s+(\d{2}\/\d{2}\/\d{4}))?/gi;
  let pmatch;
  while ((pmatch = parcelaRegex.exec(parcelasBlock))) {
    const numeroRaw = pmatch[1];
    const numero = /^valor$/i.test(numeroRaw) ? "1" : numeroRaw;
    const valor = parseCurrency(pmatch[2]) || 0;
    const vencimento = pmatch[3] ? parseDateBr(pmatch[3]) : null;
    parcelas.push({ numero, valor, vencimento });
  }

  const totalApurado = extractCurrencyByLabel(
    text,
    /Total apurado[^0-9]*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i
  );
  let valorTotal = totalApurado ?? totalBase ?? null;
  if (valorTotal == null && parcelas.length) {
    const sum = parcelas.reduce((acc, p) => acc + Number(p.valor || 0), 0);
    if (sum > 0) valorTotal = sum;
  }

  if (!forma) return [];
  return [
    {
      forma,
      plano,
      valor_bruto: valorTotal,
      total: valorTotal,
      parcelas: parcelas.length ? parcelas : undefined,
    },
  ];
}

function resolveContratante(
  nome: string | null,
  passageiros: PassageiroDraft[],
  cpfHint?: string | null
): ContratanteDraft | null {
  const contratanteNome = (nome || "").trim();
  if (!contratanteNome) return null;

  const cpfHintDigits = normalizeCpf(cpfHint);
  const cpf =
    cpfHintDigits.length === 11
      ? cpfHintDigits
      : resolveCpfContratanteByNome(contratanteNome, passageiros);
  const match = cpf ? passageiros.find((p) => normalizeCpf(p.cpf) === cpf) || null : null;
  const nascimento = match?.nascimento || null;
  return {
    nome: contratanteNome,
    cpf: cpf || "",
    nascimento,
  };
}

export async function extractCruzeiroFromText(text: string): Promise<ContratoImportResult> {
  const cleaned = cleanText(text);
  if (!cleaned) throw new Error("Texto obrigatorio.");
  const plain = cleaned.replace(/[|]/g, " ");
  const lines = cleaned.split("\n").map((l) => l.trim()).filter(Boolean);

  const contratanteBlock = extractContratanteBlock(plain);
  const nomeContratanteFromBlock = extractContratanteNameFromBlock(contratanteBlock);
  const nomeContratanteFromRecibo = extractContratanteNomeFromRecibo(plain);
  const cpfContratanteFromBlock = extractContratanteCpfFromBlock(
    contratanteBlock,
    nomeContratanteFromRecibo || nomeContratanteFromBlock
  );
  const resumo = extractResumoRow(lines);
  const descricaoRoteiro = extractDescricaoRoteiro(plain);
  const tipoProduto = extractTipoProduto(plain);
  const destino = sanitizeDestinoTerm(descricaoRoteiro || "");
  const dataSaida = parseDateBr(extractLineValue(plain, /Data de Sa(?:i|\u00ed)da\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i));
  const dataRetorno = parseDateBr(extractLineValue(plain, /Data de Retorno\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i));
  const navio = extractNavio(cleaned);
  const reservaNumero = extractLineValue(plain, /N(?:u|\u00fa)mero da Reserva\s*([0-9]+)/i);

  const totalByLabel =
    extractCurrencyByLabel(
      plain,
      /Valor Total do Or(?:c|\u00e7)amento[^0-9]*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i
    ) ||
    extractCurrencyByLabel(
      plain,
      /Valor em R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i
    );
  const taxasByLabel =
    extractCurrencyByLabel(
      plain,
      /Valor Total das Taxas[^0-9]*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i
    ) ||
    extractCurrencyByLabel(
      plain,
      /Taxas em R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i
    );

  const precoOrcamento =
    extractCurrencyByLabel(
      plain,
      /Pre(?:c|\u00e7)o do Or(?:c|\u00e7)amento[^0-9]*([0-9]{1,3}(?:\.[0-9]{3})*,\d{2})/i
    ) || null;

  let total = resumo.total ?? totalByLabel ?? null;
  let taxas = resumo.taxas ?? taxasByLabel ?? null;
  if (total == null && precoOrcamento != null && taxas != null) {
    total = precoOrcamento + taxas;
  }
  if (taxas == null && total != null && precoOrcamento != null) {
    taxas = Math.max(0, total - precoOrcamento);
  }
  const recebimento =
    resumo.recibo ||
    normalizeRecibo(extractLineValue(plain, new RegExp(`(${RECIBO_REGEX.source})`)));
  const nomeContratante =
    nomeContratanteFromRecibo ||
    nomeContratanteFromBlock ||
    resumo.nome ||
    extractLineValue(
      plain,
      new RegExp(
        `Contratante\\s+([\\p{L}' ]+?)(?=\\s+(?:${RECIBO_REGEX.source})|\\s+Recibo|\\n|$)`,
        "iu"
      )
    ) ||
    null;

  const passageiros = extractPassageiros(cleaned);
  const contratante = resolveContratante(
    nomeContratante,
    passageiros,
    cpfContratanteFromBlock
  );

  const pagamentos = extractPagamentos(plain, total);
  if (total == null && pagamentos.length && pagamentos[0].total != null) {
    total = pagamentos[0].total ?? null;
  }
  if (taxas == null && total != null && precoOrcamento != null) {
    taxas = Math.max(0, total - precoOrcamento);
  }

  const detalhes: string[] = [];
  if (descricaoRoteiro) detalhes.push(`Roteiro: ${descricaoRoteiro}`);
  const cabine = extractLineValue(plain, /Cabine\s+([A-Z0-9-]+)/i);
  const localizador = extractLineValue(plain, /Localizador\s+([0-9]+)/i);
  if (cabine) detalhes.push(`Cabine: ${cabine}`);
  if (localizador) detalhes.push(`Localizador: ${localizador}`);

  const contrato: ContratoDraft = {
    contrato_numero: recebimento || "",
    reserva_numero: reservaNumero || null,
    destino: destino || null,
    data_saida: dataSaida,
    data_retorno: dataRetorno,
    produto_principal: navio || "Cruzeiro",
    produto_tipo: tipoProduto || "Cruzeiro",
    produto_detalhes: detalhes.length ? detalhes.join("\n") : null,
    contratante,
    passageiros,
    pagamentos,
    total_bruto: total,
    total_pago: total,
    taxas_embarque: taxas,
    tipo_pacote: "Cruzeiro",
    raw_text: cleaned,
  };

  const hasInfo =
    Boolean(contrato.contrato_numero) ||
    Boolean(contrato.destino) ||
    Boolean(contrato.produto_principal) ||
    Boolean(contrato.contratante?.nome) ||
    Boolean(contrato.passageiros?.length);
  if (!hasInfo) {
    throw new Error("Nenhum contrato encontrado no texto.");
  }

  return { contratos: [contrato], raw_text: cleaned };
}

export async function extractCruzeiroFromPdf(file: File): Promise<ContratoImportResult> {
  const fullText = await extractPdfText(file, { maxPages: 6 });
  if (!fullText.trim()) {
    throw new Error("Nao foi possivel extrair texto do PDF. Tente colar o texto do orcamento.");
  }
  try {
    return await extractCruzeiroFromText(fullText);
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (/Nenhum contrato encontrado/i.test(msg)) {
      throw new Error("Nenhum orcamento de cruzeiro encontrado no PDF.");
    }
    throw err;
  }
}
