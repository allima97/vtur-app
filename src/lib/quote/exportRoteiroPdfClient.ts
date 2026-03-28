import { supabaseBrowser } from "../supabase-browser";
import { exportRoteiroPdf } from "./roteiroPdf";
import { buildRoteiroPreviewHtml } from "./roteiroPdfModern";

type ExportRoteiroByIdArgs = {
  roteiroId: string;
  action?: "download" | "preview" | "blob-url";
};

type PreviewRoteiroByIdArgs = {
  roteiroId: string;
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

function textValue(value?: string | null) {
  return String(value || "").trim();
}

function escapeHtml(value?: string | null) {
  return textValue(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildFallbackRoteiroPreviewHtml(roteiro: any) {
  const rows = [
    ...(Array.isArray(roteiro.hoteis) ? roteiro.hoteis.map((item: any) => `Hotel: ${item.hotel || "-"} | ${item.cidade || "-"}`) : []),
    ...(Array.isArray(roteiro.passeios) ? roteiro.passeios.map((item: any) => `Passeio: ${item.passeio || "-"} | ${item.cidade || "-"}`) : []),
    ...(Array.isArray(roteiro.transportes) ? roteiro.transportes.map((item: any) => `Transporte: ${item.trecho || item.cia_aerea || "-"}`) : []),
  ];

  return `<div style="font-family:Arial,sans-serif;color:#0f172a;">
    <div style="border:1px solid #dbeafe;border-radius:12px;padding:16px;margin-bottom:14px;">
      <div style="font-size:22px;color:#1d4ed8;font-weight:700;">Roteiro Personalizado</div>
      <div style="font-size:15px;color:#0f172a;margin-top:6px;"><b>${escapeHtml(roteiro.nome || "Roteiro")}</b></div>
    </div>
    <div style="border:1px solid #dbeafe;border-radius:12px;padding:16px;">
      ${rows.length ? rows.map((row) => `<div style="margin:0 0 8px 0;color:#475569;">${escapeHtml(row)}</div>`).join("") : "<div>Sem conteúdo para visualização.</div>"}
    </div>
  </div>`;
}

export async function loadRoteiroPreviewHtmlById(args: PreviewRoteiroByIdArgs): Promise<string> {
  const roteiroId = String(args?.roteiroId || "").trim();
  if (!roteiroId) throw new Error("Roteiro inválido.");

  const {
    data: { user },
  } = await supabaseBrowser.auth.getUser();
  const userId = user?.id || null;
  if (!userId) {
    throw new Error("Usuário não autenticado.");
  }

  const roteiro = await fetchRoteiroForPdf(roteiroId);

  const { data: settings, error: settingsErr } = await supabaseBrowser
    .from("quote_print_settings")
    .select(
      "logo_url, logo_path, consultor_nome, filial_nome, endereco_linha1, endereco_linha2, endereco_linha3, telefone, whatsapp, whatsapp_codigo_pais, email, rodape_texto, imagem_complementar_url, imagem_complementar_path"
    )
    .eq("owner_user_id", userId)
    .maybeSingle();
  if (settingsErr) throw settingsErr;
  if (!settings) {
    throw new Error("Configure os parametros do PDF em Parametros > Orcamentos.");
  }

  try {
    return await buildRoteiroPreviewHtml({
      roteiro,
      settings: settings as any,
    });
  } catch (err) {
    console.error("[RoteiroPreview] Falha ao montar visualizacao HTML 1:1. Aplicando fallback.", err);
    return buildFallbackRoteiroPreviewHtml(roteiro);
  }
}
