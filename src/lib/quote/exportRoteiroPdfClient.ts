import { supabaseBrowser } from "../supabase-browser";
import { exportRoteiroPdf } from "./roteiroPdfModern";

type ExportRoteiroByIdArgs = {
  roteiroId: string;
  action?: "download" | "preview" | "blob-url";
};

function isMissingPercursoColumn(error: any) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "");
  return (
    code === "42703" ||
    (/percurso/i.test(msg) && /does not exist|nao existe|não existe|unknown column|column/i.test(msg))
  );
}

async function fetchRoteiroForPdf(roteiroId: string) {
  const selectWithPercurso = `id, nome, duracao, inicio_cidade, fim_cidade, inclui_texto, nao_inclui_texto, informacoes_importantes,
       roteiro_hotel (id, cidade, hotel, endereco, data_inicio, data_fim, noites, qtd_apto, apto, categoria, regime, tipo_tarifa, qtd_adultos, qtd_criancas, valor_original, valor_final, ordem),
       roteiro_passeio (id, cidade, passeio, fornecedor, data_inicio, data_fim, tipo, ingressos, qtd_adultos, qtd_criancas, valor_original, valor_final, ordem),
       roteiro_transporte (id, trecho, cia_aerea, data_voo, classe_reserva, hora_saida, aeroporto_saida, duracao_voo, tipo_voo, hora_chegada, aeroporto_chegada, tarifa_nome, reembolso_tipo, qtd_adultos, qtd_criancas, taxas, valor_total, tipo, fornecedor, descricao, data_inicio, data_fim, categoria, observacao, ordem),
       roteiro_dia (id, percurso, cidade, data, descricao, ordem),
       roteiro_investimento (id, tipo, valor_por_pessoa, qtd_apto, valor_por_apto, ordem),
       roteiro_pagamento (id, servico, valor_total_com_taxas, taxas, forma_pagamento, ordem)`;

  const selectWithoutPercurso = `id, nome, duracao, inicio_cidade, fim_cidade, inclui_texto, nao_inclui_texto, informacoes_importantes,
       roteiro_hotel (id, cidade, hotel, endereco, data_inicio, data_fim, noites, qtd_apto, apto, categoria, regime, tipo_tarifa, qtd_adultos, qtd_criancas, valor_original, valor_final, ordem),
       roteiro_passeio (id, cidade, passeio, fornecedor, data_inicio, data_fim, tipo, ingressos, qtd_adultos, qtd_criancas, valor_original, valor_final, ordem),
       roteiro_transporte (id, trecho, cia_aerea, data_voo, classe_reserva, hora_saida, aeroporto_saida, duracao_voo, tipo_voo, hora_chegada, aeroporto_chegada, tarifa_nome, reembolso_tipo, qtd_adultos, qtd_criancas, taxas, valor_total, tipo, fornecedor, descricao, data_inicio, data_fim, categoria, observacao, ordem),
       roteiro_dia (id, cidade, data, descricao, ordem),
       roteiro_investimento (id, tipo, valor_por_pessoa, qtd_apto, valor_por_apto, ordem),
       roteiro_pagamento (id, servico, valor_total_com_taxas, taxas, forma_pagamento, ordem)`;

  let result = await supabaseBrowser
    .from("roteiro_personalizado")
    .select(selectWithPercurso)
    .eq("id", roteiroId)
    .maybeSingle();

  if (result.error && isMissingPercursoColumn(result.error)) {
    result = await supabaseBrowser
      .from("roteiro_personalizado")
      .select(selectWithoutPercurso)
      .eq("id", roteiroId)
      .maybeSingle();
  }

  if (result.error || !result.data) {
    throw new Error("Roteiro não encontrado.");
  }

  const roteiro = result.data as any;
  return {
    nome: String(roteiro.nome || "").trim() || "roteiro",
    duracao: roteiro.duracao ?? undefined,
    inicio_cidade: roteiro.inicio_cidade || undefined,
    fim_cidade: roteiro.fim_cidade || undefined,
    inclui_texto: roteiro.inclui_texto || "",
    nao_inclui_texto: roteiro.nao_inclui_texto || "",
    informacoes_importantes: roteiro.informacoes_importantes || "",
    hoteis: Array.isArray(roteiro.roteiro_hotel) ? roteiro.roteiro_hotel : [],
    passeios: Array.isArray(roteiro.roteiro_passeio) ? roteiro.roteiro_passeio : [],
    transportes: Array.isArray(roteiro.roteiro_transporte) ? roteiro.roteiro_transporte : [],
    dias: Array.isArray(roteiro.roteiro_dia) ? roteiro.roteiro_dia : [],
    investimentos: Array.isArray(roteiro.roteiro_investimento) ? roteiro.roteiro_investimento : [],
    pagamentos: Array.isArray(roteiro.roteiro_pagamento) ? roteiro.roteiro_pagamento : [],
  };
}

export async function exportRoteiroPdfById(args: ExportRoteiroByIdArgs): Promise<string | void> {
  const roteiroId = String(args?.roteiroId || "").trim();
  if (!roteiroId) throw new Error("Roteiro inválido.");
  const action = args?.action || "download";

  const {
    data: { user },
  } = await supabaseBrowser.auth.getUser();
  if (!user) {
    throw new Error("Usuário não autenticado.");
  }

  const roteiro = await fetchRoteiroForPdf(roteiroId);
  return await exportRoteiroPdf(roteiro, { action });
}
