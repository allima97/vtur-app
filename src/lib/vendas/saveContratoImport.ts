import { supabaseBrowser } from "../supabase-browser";
import { normalizeText } from "../normalizeText";
import { titleCaseWithExceptions } from "../titleCase";
import { carregarTermosNaoComissionaveis, isFormaNaoComissionavel } from "../pagamentoUtils";
import type { ContratoDraft, PassageiroDraft, PagamentoDraft } from "./contratoCvcExtractor";
import { ensureReciboReservaUnicos } from "./reciboReservaValidator";
import { criarVinculosViajaComAutomaticos } from "./viagaComManager";

const STORAGE_BUCKET = "viagens";

function normalizeCpf(value?: string | null) {
  return (value || "").replace(/\D/g, "");
}

function formatCpf(value: string) {
  const digits = normalizeCpf(value);
  if (digits.length !== 11) return digits;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function parseMoney(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return 0;
  return Number(value);
}

function normalizeMoneyKey(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value))) return "0";
  return Number(value).toFixed(2);
}

function buildPagamentoKey(pagamento: PagamentoDraft) {
  const forma = normalizeText(pagamento.forma || "").toUpperCase();
  const valorRef =
    pagamento.total != null ? pagamento.total : pagamento.valor_bruto != null ? pagamento.valor_bruto : 0;
  const valor = normalizeMoneyKey(valorRef);
  const parcelas = (pagamento.parcelas || [])
    .map((parcela) => {
      const numero = String(parcela.numero || "");
      const valor = normalizeMoneyKey(parcela.valor);
      const vencimento = parcela.vencimento || "";
      return `${numero}:${valor}:${vencimento}`;
    })
    .join("|");
  return `${forma}|${valor}|${parcelas}`;
}

function dedupePagamentos(pagamentos: PagamentoDraft[]) {
  const seen = new Set<string>();
  const result: PagamentoDraft[] = [];
  pagamentos.forEach((pagamento) => {
    if (!pagamento?.forma) return;
    const key = buildPagamentoKey(pagamento);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(pagamento);
  });
  return result;
}

function isRlsInsertError(error: any) {
  const message = String(error?.message || "").toLowerCase();
  return (
    error?.code === "42501" ||
    message.includes("row-level security") ||
    message.includes("violates row-level security") ||
    message.includes("politica de seguranca (rls)") ||
    (message.includes("cadastre o cliente em clientes") && message.includes("import"))
  );
}

function calcularTotalPagamentos(pagamentos: PagamentoDraft[]) {
  return pagamentos.reduce((acc, pagamento) => {
    const bruto = parseMoney(pagamento.valor_bruto);
    const desconto = parseMoney(pagamento.desconto);
    const total = parseMoney(pagamento.total);
    if (pagamento.total != null && (bruto <= 0 || total <= bruto * 1.05)) {
      return acc + total;
    }
    if (bruto > 0) return acc + Math.max(bruto - desconto, 0);
    return acc;
  }, 0);
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function truncateText(value: string, max = 200) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max).trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeDestinoTerm(destino?: string | null) {
  if (!destino) return "";
  let term = destino.replace(/\s+/g, " ").trim();
  if (!term) return "";
  term = term.replace(/\s*[-–—]\s*\d+\s*dia\(s\).*$/i, "");
  term = term.replace(/\s*[-–—]\s*\d+\s*noite\(s\).*$/i, "");
  term = term.replace(/\s*\/\s*\d+\s*dia\(s\).*$/i, "");
  term = term.replace(/\s*\/\s*\d+\s*noite\(s\).*$/i, "");
  return term.trim();
}

function isLocacaoCarroTerm(value?: string | null) {
  const term = normalizeText(value || "");
  if (!term) return false;
  if (term.includes("locacao") || term.includes("locadora")) return true;
  if (term.includes("rent a car") || term.includes("rental car")) return true;
  return term.includes("carro") && term.includes("alug");
}

function isContratoLocacao(contrato: ContratoDraft) {
  return (
    isLocacaoCarroTerm(contrato.produto_principal) ||
    isLocacaoCarroTerm(contrato.produto_tipo) ||
    isLocacaoCarroTerm(contrato.produto_detalhes)
  );
}

function buildDestinoCandidates(destino: string) {
  const candidates = new Set<string>();
  const add = (value?: string | null) => {
    const term = (value || "").trim();
    if (term) candidates.add(term);
  };
  const base = sanitizeDestinoTerm(destino);
  add(base);
  add(destino);
  base
    .split(/\s*(?:\/|,|;|\||→|->)\s*/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => add(part.replace(/\s*(?:\/|-)\s*[a-z]{2}$/i, "").trim()));
  base
    .split(/\s[-–—]\s/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => add(part.replace(/\s*(?:\/|-)\s*[a-z]{2}$/i, "").trim()));

  const normalizedWords = normalizeText(base, { trim: true, collapseWhitespace: true })
    .split(" ")
    .filter((token) => token.length >= 3)
    .filter((token) => !["de", "da", "do", "das", "dos", "e", "em", "para", "com"].includes(token))
    .sort((a, b) => b.length - a.length)
    .slice(0, 2);
  normalizedWords.forEach((word) => add(word));

  return Array.from(candidates);
}

function findWordBoundaryMatch(rows: { id: string; nome: string | null }[], termo: string) {
  if (!rows.length) return null;
  const normalizedTerm = normalizeText(termo, { trim: true, collapseWhitespace: true });
  if (!normalizedTerm) return null;
  const regex = new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`, "i");
  const exact = rows.find((row) => {
    const nome = normalizeText(row.nome || "", { trim: true, collapseWhitespace: true });
    return regex.test(nome);
  });
  return exact?.id || null;
}

async function findCidadeIdByTerm(termo: string) {
  const direct = await supabaseBrowser
    .from("cidades")
    .select("id, nome")
    .ilike("nome", termo)
    .maybeSingle();
  if (direct.data?.id) return direct.data.id;

  const prefix = await supabaseBrowser
    .from("cidades")
    .select("id, nome")
    .ilike("nome", `${termo}%`)
    .limit(5);
  if (prefix.data?.[0]?.id) return prefix.data[0].id;

  const contains = await supabaseBrowser
    .from("cidades")
    .select("id, nome")
    .ilike("nome", `%${termo}%`)
    .limit(10);
  return findWordBoundaryMatch((contains.data || []) as { id: string; nome: string | null }[], termo);
}

async function findCidadeIdByDestinoTerm(termo: string) {
  const direct = await supabaseBrowser
    .from("destinos")
    .select("cidade_id, nome")
    .ilike("nome", termo)
    .maybeSingle();
  if (direct.data?.cidade_id) return direct.data.cidade_id;

  const prefix = await supabaseBrowser
    .from("destinos")
    .select("cidade_id, nome")
    .ilike("nome", `${termo}%`)
    .limit(5);
  if (prefix.data?.[0]?.cidade_id) return prefix.data[0].cidade_id;

  const contains = await supabaseBrowser
    .from("destinos")
    .select("cidade_id, nome")
    .ilike("nome", `%${termo}%`)
    .limit(10);
  const matchId = findWordBoundaryMatch(
    (contains.data || []).map((row) => ({ id: row.cidade_id, nome: row.nome })) as {
      id: string;
      nome: string | null;
    }[],
    termo
  );
  return matchId || null;
}

function calcularStatusPeriodo(inicio?: string | null, fim?: string | null) {
  if (!inicio) return "planejada";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dataInicio = new Date(inicio);
  const dataFim = fim ? new Date(fim) : null;

  if (dataFim && dataFim < hoje) return "concluida";
  if (dataInicio > hoje) return "confirmada";
  if (dataFim && hoje > dataFim) return "concluida";
  return "em_viagem";
}

async function getCompanyId(userId: string) {
  try {
    const { data, error } = await supabaseBrowser.rpc("current_company_id");
    if (!error && data) return String(data);
  } catch {
    // fallback below
  }

  const { data, error } = await supabaseBrowser
    .from("users")
    .select("company_id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.company_id || null;
}

async function findClienteByCpf(cpf: string) {
  const cpfDigits = normalizeCpf(cpf);
  const selectCols = "id, cpf, nome, nascimento, endereco, numero, cidade, estado, cep, rg";

  // CPF e normalizado no banco (apenas digitos).
  const { data } = await supabaseBrowser
    .from("clientes")
    .select(selectCols)
    .eq("cpf", cpfDigits)
    .maybeSingle();

  return data || null;
}

async function resolveClienteImportViaApi(params: {
  cpf: string;
  nome?: string | null;
  nascimento?: string | null;
  endereco?: string | null;
  numero?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  rg?: string | null;
}) {
  const response = await fetch("/api/v1/clientes/resolve-import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(params),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Erro ao resolver cliente para importação.");
  }
  const data = await response.json().catch(() => ({} as any));
  return (data as any)?.cliente || null;
}

async function resolveCidadeId(destino?: string | null) {
  if (!destino) return null;
  const raw = destino.trim();
  if (!raw) return null;

  const candidates = buildDestinoCandidates(raw);
  for (const termo of candidates) {
    if (!termo) continue;
    const byCidade = await findCidadeIdByTerm(termo);
    if (byCidade) return byCidade;
  }

  for (const termo of candidates) {
    if (!termo) continue;
    const byDestino = await findCidadeIdByDestinoTerm(termo);
    if (byDestino) return byDestino;
  }

  return null;
}

async function resolveCidadeIndefinida() {
  const { data: direct, error: directErr } = await supabaseBrowser
    .from("cidades")
    .select("id, nome")
    .ilike("nome", "Indefinida")
    .maybeSingle();
  if (directErr) throw directErr;
  if (direct?.id) return { id: direct.id as string, nome: direct.nome || "Indefinida" };

  const { data: fallback, error: fallbackErr } = await supabaseBrowser
    .from("cidades")
    .select("id, nome")
    .ilike("nome", "%Indefinida%")
    .limit(1);
  if (fallbackErr) throw fallbackErr;
  const item = (fallback || [])[0];
  if (!item?.id) return null;
  return { id: item.id as string, nome: item.nome || "Indefinida" };
}

async function getCidadeNomeById(id: string) {
  const { data, error } = await supabaseBrowser
    .from("cidades")
    .select("nome")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data?.nome || null;
}

async function carregarTiposProduto() {
  const { data, error } = await supabaseBrowser
    .from("tipo_produtos")
    .select("id, nome, tipo")
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data || []) as { id: string; nome: string | null; tipo?: string | null }[];
}

function resolveTipoProdutoId(
  produtoNome: string | null,
  tipos: { id: string; nome: string | null; tipo?: string | null }[],
  tipoHint?: string | null
) {
  const hintNormalized = normalizeText(tipoHint || "");
  if (hintNormalized) {
    const direct = tipos.find((t) => {
      const label = normalizeText(t.nome || t.tipo || "");
      return label.includes(hintNormalized);
    });
    if (direct?.id) return direct.id;

    if (hintNormalized === "a+h") {
      const ahMatch = tipos.find((t) => {
        const label = normalizeText(t.nome || t.tipo || "");
        return label.includes("a+h") || (label.includes("aereo") && label.includes("hotel"));
      });
      if (ahMatch?.id) return ahMatch.id;
    }
    if (hintNormalized.includes("hotel") && (hintNormalized.includes("aereo") || hintNormalized.includes("passagem"))) {
      const ahMatch = tipos.find((t) => {
        const label = normalizeText(t.nome || t.tipo || "");
        return label.includes("a+h") || (label.includes("aereo") && label.includes("hotel"));
      });
      if (ahMatch?.id) return ahMatch.id;
    }
    if (hintNormalized.includes("seguro")) {
      const seguroMatch = tipos.find((t) => normalizeText(t.nome || t.tipo || "").includes("seguro"));
      if (seguroMatch?.id) return seguroMatch.id;
    }
    if (hintNormalized.includes("ingresso")) {
      const ingressoMatch = tipos.find((t) => normalizeText(t.nome || t.tipo || "").includes("ingresso"));
      if (ingressoMatch?.id) return ingressoMatch.id;
    }
    if (hintNormalized.includes("aereo") || hintNormalized.includes("passagem")) {
      const aereoMatch = tipos.find((t) => {
        const label = normalizeText(t.nome || t.tipo || "");
        return label.includes("aereo") || label.includes("passagem");
      });
      if (aereoMatch?.id) return aereoMatch.id;
    }
    if (hintNormalized.includes("carro") || hintNormalized.includes("locacao")) {
      const carroMatch = tipos.find((t) => {
        const label = normalizeText(t.nome || t.tipo || "");
        return label.includes("carro") || label.includes("locacao") || label.includes("locadora");
      });
      if (carroMatch?.id) return carroMatch.id;
    }
  }

  if (!produtoNome) return tipos[0]?.id || null;
  const normalized = normalizeText(produtoNome);
  const hotelKeywords = ["hotel", "hoteis", "hospedagem", "resort", "pousada", "flat", "all inclusive", "diaria"];
  const isHotel = hotelKeywords.some((k) => normalized.includes(k));
  const isAereo = normalized.includes("passagem") || normalized.includes("voo") || normalized.includes("aereo");
  const isCarro = normalized.includes("carro") || normalized.includes("locacao") || normalized.includes("locadora");
  if (isHotel && isAereo) {
    const ahMatch = tipos.find((t) => {
      const label = normalizeText(t.nome || t.tipo || "");
      return label.includes("a+h") || (label.includes("aereo") && label.includes("hotel"));
    });
    if (ahMatch?.id) return ahMatch.id;
  }

  const match = tipos.find((t) => {
    const label = normalizeText(t.nome || t.tipo || "");
    if (label.includes("seguro") && normalized.includes("seguro")) return true;
    if (label.includes("ingresso") && normalized.includes("ingresso")) return true;
    if (label.includes("aereo") && isAereo) return true;
    if (label.includes("passagem") && isAereo) return true;
    if ((label.includes("carro") || label.includes("locacao") || label.includes("locadora")) && isCarro) return true;
    if (label.includes("servico") && (normalized.includes("traslado") || normalized.includes("transfer") || normalized.includes("passeio"))) return true;
    return hotelKeywords.some((k) => label.includes(k)) || hotelKeywords.some((k) => normalized.includes(k));
  });
  return match?.id || tipos[0]?.id || null;
}

async function resolveProduto(
  nomeProduto: string,
  destino: string | null,
  cidadeId: string | null,
  tipoId: string | null
) {
  const nome = truncateText(titleCaseWithExceptions(nomeProduto.trim()));
  let query = supabaseBrowser
    .from("produtos")
    .select("id, nome, cidade_id, tipo_produto, todas_as_cidades")
    .eq("nome", nome);
  if (cidadeId) {
    query = query.eq("cidade_id", cidadeId);
  }
  const { data } = await query;
  if (data && data.length > 0) {
    return data[0];
  }

  const payload = {
    nome,
    destino: destino ? truncateText(titleCaseWithExceptions(destino)) : null,
    cidade_id: cidadeId,
    tipo_produto: tipoId,
    todas_as_cidades: !cidadeId,
  };
  const { data: inserted, error } = await supabaseBrowser
    .from("produtos")
    .insert(payload)
    .select("id, nome, cidade_id, tipo_produto, todas_as_cidades")
    .single();
  if (error) throw error;
  return inserted;
}

async function getProdutoById(id: string) {
  const { data, error } = await supabaseBrowser
    .from("produtos")
    .select("id, nome, cidade_id, tipo_produto, todas_as_cidades")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function resolveFormaPagamento(nome: string, companyId: string, pagaComissaoDefault: boolean, permiteDesconto: boolean) {
  const { data } = await supabaseBrowser
    .from("formas_pagamento")
    .select("id, nome, paga_comissao, permite_desconto")
    .eq("company_id", companyId)
    .ilike("nome", nome)
    .maybeSingle();
  if (data?.id) return data;

  const { data: inserted, error } = await supabaseBrowser
    .from("formas_pagamento")
    .insert({
      company_id: companyId,
      nome: nome.trim(),
      paga_comissao: pagaComissaoDefault,
      permite_desconto: permiteDesconto,
      ativo: true,
    })
    .select("id, nome, paga_comissao, permite_desconto")
    .single();
  if (error) throw error;
  return inserted;
}

function dedupePassageiros(passageiros: PassageiroDraft[]) {
  const seen = new Set<string>();
  return passageiros.filter((p) => {
    const cpf = normalizeCpf(p.cpf);
    const cpfValido = cpf.length === 11 ? cpf : "";
    const nome = normalizeText(p.nome || "", { trim: true, collapseWhitespace: true });
    const nascimento = String(p.nascimento || "").trim();
    const key = cpfValido || (nome ? `${nome}|${nascimento}` : "");
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function guessPagaComissaoDefault(forma: string, termosNaoComissionaveis?: string[]) {
  const norm = normalizeText(forma || "");
  const isCartaoCredito = norm.includes("cartao") && norm.includes("credito");
  if (isFormaNaoComissionavel(forma, termosNaoComissionaveis)) return false;
  if (isCartaoCredito) return true;
  if (norm.includes("credito")) return false;
  if (norm.includes("credipax")) return false;
  if (norm.includes("credito pax")) return false;
  if (norm.includes("vale viagem")) return false;
  if (norm.includes("credito de viagem")) return false;
  return true;
}

export async function saveContratoImport(params: {
  contratos: ContratoDraft[];
  principalIndex: number;
  file?: File | null;
  contratoFiles?: (File | null)[];
  destinoCidadeId?: string | null;
  destinoCidadeNome?: string | null;
  destinoProdutoId?: string | null;
  destinoProdutoNome?: string | null;
  dataVenda: string;
}) {
  const {
    contratos,
    principalIndex,
    file,
    contratoFiles,
    destinoCidadeId: destinoCidadeIdParam,
    destinoCidadeNome: destinoCidadeNomeParam,
    destinoProdutoId: destinoProdutoIdParam,
    destinoProdutoNome: destinoProdutoNomeParam,
    dataVenda,
  } = params;
  if (!contratos.length) throw new Error("Nenhum contrato para salvar.");
  if (!dataVenda) throw new Error("Data da venda é obrigatória.");

  const { data: authSession } = await supabaseBrowser.auth.getSession();
  let session = authSession?.session || null;
  if (!session?.access_token) {
    const { data: refreshed } = await supabaseBrowser.auth.refreshSession();
    session = refreshed?.session || null;
  }
  if (!session?.access_token) {
    throw new Error("Sessão expirada. Faça login novamente e tente importar o contrato.");
  }

  const { data: auth } = await supabaseBrowser.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) throw new Error("Usuário não autenticado.");
  const companyId = await getCompanyId(userId);
  if (!companyId) throw new Error("Usuário sem company_id para salvar venda.");
  const termosNaoComissionaveis = await carregarTermosNaoComissionaveis();

  const principal = contratos[principalIndex] || contratos[0];
  const contratante = principal.contratante || contratos[0].contratante;
  if (!contratante?.cpf) throw new Error("CPF do contratante é obrigatório.");

  const cpfContrato = normalizeCpf(contratante.cpf);
  const cpfsContratos = new Set(contratos.map((c) => normalizeCpf(c.contratante?.cpf || "")));
  if (cpfsContratos.size > 1) {
    throw new Error("Importação contém contratos de CPFs diferentes. Importe em lotes separados.");
  }
  const nomeContratanteNorm = normalizeText(contratante.nome || "", { trim: true, collapseWhitespace: true });

  const passageiros = dedupePassageiros(contratos.flatMap((c) => c.passageiros || []));
  const passageiroContratante = passageiros.find((p) => normalizeCpf(p.cpf) === cpfContrato);
  const contratanteEhPassageiro = passageiros.length === 0 ? true : Boolean(passageiroContratante);
  const nascimentoContratante = passageiroContratante?.nascimento || contratante.nascimento || null;

  let cliente = await findClienteByCpf(cpfContrato);
  if (!cliente) {
    try {
      cliente = await resolveClienteImportViaApi({
        cpf: cpfContrato,
        nome: contratante.nome || "",
        nascimento: nascimentoContratante,
        endereco: contratante.endereco || null,
        numero: contratante.numero || null,
        cidade: contratante.cidade || null,
        estado: contratante.uf || null,
        cep: contratante.cep || null,
        rg: contratante.rg || null,
      });
    } catch (error: any) {
      if (isRlsInsertError(error)) {
        throw new Error(
          "Nao foi possivel criar o cliente automaticamente por politica de seguranca (RLS). " +
            "Cadastre o cliente em Clientes e tente importar novamente."
        );
      }
      throw error;
    }

    if (!cliente) throw new Error("Não foi possível resolver o cliente do contratante.");
  } else {
    const payload: any = {};
    if (!cliente.nascimento && nascimentoContratante) payload.nascimento = nascimentoContratante;
    if (!cliente.endereco && contratante.endereco) payload.endereco = titleCaseWithExceptions(contratante.endereco);
    if (!cliente.numero && contratante.numero) payload.numero = contratante.numero;
    if (!cliente.cidade && contratante.cidade) payload.cidade = titleCaseWithExceptions(contratante.cidade);
    if (!cliente.estado && contratante.uf) payload.estado = contratante.uf;
    if (!cliente.cep && contratante.cep) payload.cep = contratante.cep;
    if (!cliente.rg && contratante.rg) payload.rg = contratante.rg;
    if (Object.keys(payload).length > 0) {
      await supabaseBrowser.from("clientes").update(payload).eq("id", cliente.id);
    }
  }

  const recibosRelacionados = await ensureReciboReservaUnicos({
    companyId,
    numeros: contratos.map((c) => ({
      numero_recibo: c.contrato_numero,
      numero_reserva: c.reserva_numero,
      cliente_id: cliente.id,
    })),
  });

  const contratoLocacao = isContratoLocacao(principal);
  let destinoCidadeId = destinoCidadeIdParam || null;
  let destinoCidadeNome = destinoCidadeNomeParam || null;

  if (contratoLocacao) {
    const indefinida = await resolveCidadeIndefinida();
    if (!indefinida?.id) {
      throw new Error("Cidade 'Indefinida' não encontrada. Cadastre antes de importar locação.");
    }
    destinoCidadeId = indefinida.id;
    destinoCidadeNome = destinoCidadeNome || indefinida.nome || "Indefinida";
  } else if (!destinoCidadeId) {
    destinoCidadeId = await resolveCidadeId(principal.destino || null);
  }

  if (!destinoCidadeId) {
    throw new Error("Selecione a cidade de destino para continuar.");
  }

  if (!destinoCidadeNome) {
    destinoCidadeNome = await getCidadeNomeById(destinoCidadeId);
  }
  if (!destinoCidadeNome) {
    destinoCidadeNome = principal.destino || null;
  }
  const tipos = await carregarTiposProduto();
  const tipoId = resolveTipoProdutoId(
    principal.produto_principal || principal.destino || null,
    tipos,
    principal.produto_tipo || null
  );
  if (!tipoId) {
    throw new Error("Nenhum tipo de produto encontrado para vincular aos recibos.");
  }

  const destinoNomeBase =
    destinoProdutoNomeParam || principal.produto_principal || principal.destino || "Produto";
  let produtoPrincipal = null as any;
  if (destinoProdutoIdParam) {
    const produtoDb = await getProdutoById(destinoProdutoIdParam);
    if (!produtoDb) {
      throw new Error("Destino selecionado nÃ£o encontrado.");
    }
    produtoPrincipal = produtoDb;
  } else {
    produtoPrincipal = await resolveProduto(
      destinoNomeBase,
      destinoCidadeNome || principal.destino || null,
      destinoCidadeId,
      tipoId
    );
  }
  if (
    produtoPrincipal.cidade_id &&
    !produtoPrincipal.todas_as_cidades &&
    produtoPrincipal.cidade_id !== destinoCidadeId
  ) {
    throw new Error("O destino selecionado não pertence à cidade escolhida.");
  }

  const datasInicio = contratos.map((c) => c.data_saida).filter(Boolean) as string[];
  const datasFim = contratos.map((c) => c.data_retorno).filter(Boolean) as string[];
  const dataInicioVenda = datasInicio.length ? datasInicio.sort()[0] : principal.data_saida || null;
  const dataFimVenda = datasFim.length ? datasFim.sort().slice(-1)[0] : principal.data_retorno || null;

  const totalBruto = contratos.reduce((sum, c) => sum + parseMoney(c.total_bruto), 0);
  const totalPago = contratos.reduce((sum, c) => sum + parseMoney(c.total_pago), 0);
  const totalTaxas = contratos.reduce((sum, c) => sum + parseMoney(c.taxas_embarque), 0);
  const descontoComercial = contratos.reduce((sum, c) => sum + parseMoney(c.desconto_comercial), 0);
  const pagamentosDedup = dedupePagamentos(contratos.flatMap((c) => c.pagamentos || []));
  const totalPagoFallback = pagamentosDedup.length ? calcularTotalPagamentos(pagamentosDedup) : 0;
  const totalPagoFinal = totalPago > 0 ? totalPago : totalPagoFallback;

  const vendaPayload: any = {
    vendedor_id: userId,
    cliente_id: cliente.id,
    destino_id: produtoPrincipal.id,
    destino_cidade_id: destinoCidadeId,
    company_id: companyId,
    data_lancamento: new Date().toISOString().split("T")[0],
    data_venda: dataVenda,
    data_embarque: dataInicioVenda,
    data_final: dataFimVenda,
    desconto_comercial_aplicado: descontoComercial > 0,
    desconto_comercial_valor: descontoComercial || null,
    valor_total_bruto: totalBruto || null,
    valor_total_pago: totalPagoFinal || null,
    valor_taxas: totalTaxas || null,
  };

  const { data: venda, error: vendaErr } = await supabaseBrowser
    .from("vendas")
    .insert(vendaPayload)
    .select("id")
    .single();
  if (vendaErr) throw vendaErr;

  const contratoUploadCache = new Map<File, { path: string; url: string | null }>();
  async function resolveContratoUpload(arquivo?: File | null) {
    if (!arquivo) return { path: null, url: null };
    const cached = contratoUploadCache.get(arquivo);
    if (cached) return cached;
    const safeName = sanitizeFileName(arquivo.name || "contrato.pdf");
    const path = `contratos/${venda.id}/${Date.now()}-${safeName}`;
    const upload = await supabaseBrowser.storage.from(STORAGE_BUCKET).upload(path, arquivo, {
      cacheControl: "3600",
      upsert: false,
      contentType: arquivo.type || "application/pdf",
    });
    if (upload.error) throw upload.error;
    const url = supabaseBrowser.storage.from(STORAGE_BUCKET).getPublicUrl(path).data.publicUrl || null;
    const result = { path, url };
    contratoUploadCache.set(arquivo, result);
    return result;
  }

  const viagensPorRecibo = new Map<string, string>();
  const recibosNovos: { id: string; numero_reserva?: string | null }[] = [];

  for (let idx = 0; idx < contratos.length; idx += 1) {
    const contrato = contratos[idx];
    const tipoContratoId = resolveTipoProdutoId(
      contrato.produto_principal || contrato.destino || null,
      tipos,
      contrato.produto_tipo || principal.produto_tipo || null
    );
    const produto =
      idx === principalIndex
        ? produtoPrincipal
        : await resolveProduto(
            contrato.produto_principal || contrato.destino || destinoNomeBase || "Produto",
            destinoCidadeNome || contrato.destino || principal.destino || null,
            destinoCidadeId,
            tipoContratoId || tipoId
          );
    const contratoFileAtual = contratoFiles?.[idx] || file || null;
    const { path: contratoPath, url: contratoUrl } = await resolveContratoUpload(contratoFileAtual);

    const reciboPayload: any = {
      venda_id: venda.id,
      produto_id: produto.tipo_produto || tipoContratoId || tipoId,
      produto_resolvido_id: produto.id,
      numero_recibo: contrato.contrato_numero,
      numero_reserva: contrato.reserva_numero || null,
      tipo_pacote: contrato.tipo_pacote || null,
      valor_total: parseMoney(contrato.total_pago ?? contrato.total_bruto) || 0,
      valor_taxas: parseMoney(contrato.taxas_embarque) || 0,
      valor_du: parseMoney(contrato.taxa_du) || 0,
      data_inicio: contrato.data_saida || null,
      data_fim: contrato.data_retorno || null,
      contrato_path: contratoPath,
      contrato_url: contratoUrl,
    };

    const { data: recibo, error: reciboErr } = await supabaseBrowser
      .from("vendas_recibos")
      .insert(reciboPayload)
      .select("id, data_inicio, data_fim")
      .single();
    if (reciboErr) throw reciboErr;

    recibosNovos.push({ id: recibo.id, numero_reserva: reciboPayload.numero_reserva });

    const notas: Record<string, any> = {};
    const produtoDetalhes = contrato.produto_detalhes?.trim();
    if (produtoDetalhes) {
      notas.servicos_inclusos = {
        origem: "servicos_inclusos",
        produto_principal: contrato.produto_principal || null,
        texto: produtoDetalhes,
      };
    }
    if (contrato.roteiro_reserva) {
      notas.roteiro_reserva = contrato.roteiro_reserva;
    }
    if (Object.keys(notas).length > 0) {
      const notasPayload = {
        venda_id: venda.id,
        recibo_id: recibo.id,
        company_id: companyId,
        notas,
      };
      const { error: notasErr } = await supabaseBrowser
        .from("vendas_recibos_notas")
        .upsert(notasPayload, { onConflict: "venda_id,recibo_id" });
      if (notasErr) throw notasErr;
    }

    const statusPeriodo = calcularStatusPeriodo(recibo.data_inicio, recibo.data_fim);
    const cidadeNome = destinoCidadeNome || contrato.destino || "";
    const destinoLabelRaw = produto?.nome || cidadeNome || null;
    const origemLabelRaw = cidadeNome && cidadeNome !== destinoLabelRaw ? cidadeNome : destinoLabelRaw;
    const destinoLabel = destinoLabelRaw ? truncateText(destinoLabelRaw) : null;
    const origemLabel = origemLabelRaw ? truncateText(origemLabelRaw) : null;

    const { data: viagem, error: viagemErr } = await supabaseBrowser
      .from("viagens")
      .insert({
        company_id: companyId,
        venda_id: venda.id,
        recibo_id: recibo.id,
        cliente_id: cliente.id,
        responsavel_user_id: userId,
        origem: origemLabel || null,
        destino: destinoLabel || null,
        data_inicio: recibo.data_inicio || null,
        data_fim: recibo.data_fim || null,
        status: statusPeriodo,
        observacoes: contrato.contrato_numero ? `Recibo ${contrato.contrato_numero}` : null,
      })
      .select("id")
      .single();
    if (viagemErr) throw viagemErr;

    viagensPorRecibo.set(recibo.id, viagem.id);

    if (contratanteEhPassageiro) {
      const { error: passageiroError } = await supabaseBrowser.from("viagem_passageiros").insert({
        viagem_id: viagem.id,
        cliente_id: cliente.id,
        company_id: companyId,
        papel: "passageiro",
        created_by: userId,
      });
      if (passageiroError) throw passageiroError;
    }
  }

  await criarVinculosViajaComAutomaticos({
    client: supabaseBrowser,
    vendaId: venda.id,
    recibosNovos,
    recibosRelacionados,
  });

  // acompanhantes
  const acompanhantes = passageiros.filter((p) => {
    const cpf = normalizeCpf(p.cpf);
    if (cpf && cpf === cpfContrato) return false;
    if (!cpf && nomeContratanteNorm) {
      const nomePassageiroNorm = normalizeText(p.nome || "", { trim: true, collapseWhitespace: true });
      if (nomePassageiroNorm && nomePassageiroNorm === nomeContratanteNorm) return false;
    }
    return true;
  });
  if (acompanhantes.length > 0) {
    const viagemIds = Array.from(new Set(Array.from(viagensPorRecibo.values()).filter(Boolean)));
    for (const acomp of acompanhantes) {
      const cpfNormalizado = normalizeCpf(acomp.cpf);
      const cpf = cpfNormalizado.length === 11 ? cpfNormalizado : "";
      const nascimento = acomp.nascimento || null;
      const nomeAcompanhante = titleCaseWithExceptions(String(acomp.nome || "").trim());
      const nomeAcompanhanteNorm = normalizeText(nomeAcompanhante || "", { trim: true, collapseWhitespace: true });
      if (!cpf && !nomeAcompanhanteNorm) continue;

      let clientePassageiro: { id?: string } | null = null;
      if (cpf) {
        try {
          clientePassageiro = await resolveClienteImportViaApi({
            cpf,
            nome: nomeAcompanhante || "",
            nascimento,
          });
        } catch (error: any) {
          if (isRlsInsertError(error)) {
            // Mantém a importação: registra como acompanhante local mesmo sem vínculo em clientes.
            clientePassageiro = null;
          } else {
            throw error;
          }
        }
      }

      let existente: { id: string; nome_completo?: string | null; cpf?: string | null; data_nascimento?: string | null } | null = null;
      if (cpf) {
        const { data } = await supabaseBrowser
          .from("cliente_acompanhantes")
          .select("id, nome_completo, cpf, data_nascimento")
          .eq("cliente_id", cliente.id)
          .eq("cpf", cpf)
          .maybeSingle();
        existente = data || null;
      }
      if (!existente && nomeAcompanhanteNorm) {
        let query = supabaseBrowser
          .from("cliente_acompanhantes")
          .select("id, nome_completo, cpf, data_nascimento")
          .eq("cliente_id", cliente.id)
          .ilike("nome_completo", nomeAcompanhante)
          .limit(1);
        if (nascimento) query = query.eq("data_nascimento", nascimento);
        const { data } = await query;
        existente = (data || [])[0] || null;
      }

      let acompanhanteId = existente?.id || null;
      if (acompanhanteId && existente) {
        const updatePayload: Record<string, any> = {};
        if (!existente.nome_completo && nomeAcompanhante) updatePayload.nome_completo = nomeAcompanhante;
        if (!existente.cpf && cpf) updatePayload.cpf = cpf;
        if (!existente.data_nascimento && nascimento) updatePayload.data_nascimento = nascimento;
        if (Object.keys(updatePayload).length > 0) {
          const { error: acompUpdateErr } = await supabaseBrowser
            .from("cliente_acompanhantes")
            .update(updatePayload)
            .eq("id", acompanhanteId)
            .eq("cliente_id", cliente.id);
          if (acompUpdateErr) throw acompUpdateErr;
        }
      }
      if (!acompanhanteId) {
        const payload = {
          cliente_id: cliente.id,
          company_id: companyId,
          nome_completo: nomeAcompanhante || "Acompanhante",
          cpf: cpf || null,
          data_nascimento: nascimento,
          ativo: true,
          created_by: userId,
        };
        const { data: novo, error } = await supabaseBrowser
          .from("cliente_acompanhantes")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        acompanhanteId = novo.id;
      }

      for (const viagemId of viagemIds) {
        if (clientePassageiro?.id) {
          const { error: passageiroVincErr } = await supabaseBrowser.from("viagem_passageiros").upsert(
            {
              viagem_id: viagemId,
              cliente_id: clientePassageiro.id,
              company_id: companyId,
              papel: "passageiro",
              created_by: userId,
            },
            { onConflict: "viagem_id,cliente_id" }
          );
          if (passageiroVincErr) throw passageiroVincErr;
        }

        if (acompanhanteId) {
          const { data: existingLink } = await supabaseBrowser
            .from("viagem_acompanhantes")
            .select("id")
            .eq("viagem_id", viagemId)
            .eq("acompanhante_id", acompanhanteId)
            .maybeSingle();
          if (!existingLink?.id) {
            const { error: acompVincErr } = await supabaseBrowser.from("viagem_acompanhantes").insert({
              viagem_id: viagemId,
              acompanhante_id: acompanhanteId,
              company_id: companyId,
              papel: "passageiro",
              created_by: userId,
            });
            if (acompVincErr) throw acompVincErr;
          }
        }
      }
    }
  }

  // pagamentos
  const pagamentos = pagamentosDedup;
  let valorNaoComissionado = 0;
  let totalCreditosNaoComissionados = 0;
  const totalPagoReferencia = totalPagoFinal;

  for (const pagamento of pagamentos) {
    if (!pagamento.forma) continue;
    const forma = await resolveFormaPagamento(
      pagamento.forma,
      companyId,
      guessPagaComissaoDefault(pagamento.forma, termosNaoComissionaveis),
      Boolean(pagamento.desconto && pagamento.desconto > 0)
    );
    const pagaComissaoBase = forma?.paga_comissao ?? true;
    const pagaComissao = isFormaNaoComissionavel(pagamento.forma, termosNaoComissionaveis)
      ? false
      : pagaComissaoBase;
    const valorBruto = parseMoney(pagamento.valor_bruto);
    const desconto = parseMoney(pagamento.desconto);
    const total = pagamento.total != null ? parseMoney(pagamento.total) : valorBruto - desconto;

    if (!pagaComissao) {
      const baseNaoComissionado = valorBruto || total || 0;
      totalCreditosNaoComissionados += baseNaoComissionado;
    }

    const parcelas = pagamento.parcelas || [];

    await supabaseBrowser.from("vendas_pagamentos").insert({
      venda_id: venda.id,
      company_id: companyId,
      forma_pagamento_id: forma?.id || null,
      forma_nome: pagamento.forma,
      operacao: pagamento.operacao || null,
      plano: pagamento.plano || null,
      valor_bruto: valorBruto || null,
      desconto_valor: desconto || null,
      valor_total: total || null,
      parcelas: parcelas.length ? parcelas : null,
      parcelas_qtd: parcelas.length || null,
      parcelas_valor: parcelas.length === 1 ? parcelas[0].valor : null,
      vencimento_primeira: parcelas[0]?.vencimento || null,
      paga_comissao: pagaComissao,
    });
  }

  const valorVendaComissionavel =
    totalPagoFinal > 0 ? Math.max(0, totalPagoFinal - totalCreditosNaoComissionados) : 0;
  valorNaoComissionado = totalCreditosNaoComissionados || null;

  await supabaseBrowser
    .from("vendas")
    .update({
      valor_nao_comissionado: valorNaoComissionado || null,
      valor_total: valorVendaComissionavel || null,
    })
    .eq("id", venda.id);

  return { venda_id: venda.id };
}
