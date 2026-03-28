import { buildAuthClient, requireModuloLevel } from "../vendas/_utils";
import { toISODateLocal } from "../../../../lib/dateTime";

export async function POST({ request }: { request: Request }) {
  try {
    const client = buildAuthClient(request);
    const { data: authData, error: authErr } = await client.auth.getUser();
    const user = authData?.user ?? null;
    if (authErr || !user) return new Response("Sessao invalida.", { status: 401 });

    const denied = await requireModuloLevel(
      client,
      user.id,
      ["orcamentos", "vendas"],
      2,
      "Sem acesso para criar Orcamentos."
    );
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    if (!body) return new Response("Body invalido.", { status: 400 });

    const roteiroId = String(body.roteiro_id || "").trim();
    if (!roteiroId) return new Response("roteiro_id obrigatorio.", { status: 400 });

    const clientName = String(body.client_name || "").trim();
    if (!clientName) return new Response("client_name obrigatorio.", { status: 400 });

    // Carregar roteiro + pagamentos
    const { data: roteiro, error: roteiroErr } = await client
      .from("roteiro_personalizado")
      .select("id, nome")
      .eq("id", roteiroId)
      .maybeSingle();
    if (roteiroErr) throw roteiroErr;
    if (!roteiro) return new Response("Roteiro nao encontrado.", { status: 404 });

    const { data: pagamentos, error: pagErr } = await client
      .from("roteiro_pagamento")
      .select("servico, valor_total_com_taxas, taxas, forma_pagamento, ordem")
      .eq("roteiro_id", roteiroId)
      .order("ordem", { ascending: true });
    if (pagErr) throw pagErr;

    const total = (pagamentos || []).reduce(
      (sum: number, p: any) => sum + Number(p.valor_total_com_taxas || 0),
      0
    );
    const taxesTotal = (pagamentos || []).reduce(
      (sum: number, p: any) => sum + Number(p.taxas || 0),
      0
    );

    // Buscar dados do cliente se fornecido
    let clientWhatsapp: string | null = String(body.client_whatsapp || "").trim() || null;
    let clientEmail: string | null = String(body.client_email || "").trim() || null;
    const clientId: string | null = String(body.client_id || "").trim() || null;

    if (clientId) {
      const { data: cliente } = await client
        .from("clientes")
        .select("nome, whatsapp, email")
        .eq("id", clientId)
        .maybeSingle();
      if (cliente) {
        clientWhatsapp = clientWhatsapp || cliente.whatsapp || null;
        clientEmail = clientEmail || cliente.email || null;
      }
    }

    // Criar quote
    const { data: quote, error: quoteErr } = await client
      .from("quote")
      .insert({
        created_by: user.id,
        roteiro_id: roteiroId,
        client_id: clientId,
        client_name: clientName,
        client_whatsapp: clientWhatsapp,
        client_email: clientEmail,
        status: "CONFIRMED",
        currency: "BRL",
        subtotal: total - taxesTotal,
        taxes: taxesTotal,
        total,
        average_confidence: 1,
        raw_json: { roteiro: true, roteiro_id: roteiroId },
      })
      .select("id")
      .single();
    if (quoteErr || !quote) throw quoteErr || new Error("Falha ao criar orcamento.");

    // Criar quote_items a partir dos pagamentos
    if (pagamentos && pagamentos.length > 0) {
      const items = pagamentos.map((p: any, idx: number) => ({
        quote_id: quote.id,
        item_type: p.servico || "Servico",
        title: p.servico || "Servico",
        product_name: p.servico || null,
        city_name: null,
        quantity: 1,
        unit_price: Number(p.valor_total_com_taxas || 0) - Number(p.taxas || 0),
        total_amount: Number(p.valor_total_com_taxas || 0) - Number(p.taxas || 0),
        taxes_amount: Number(p.taxas || 0),
        start_date: toISODateLocal(new Date()),
        end_date: null,
        currency: "BRL",
        confidence: 1,
        order_index: typeof p.ordem === "number" ? p.ordem : idx,
        raw: { forma_pagamento: p.forma_pagamento || null },
      }));

      const { error: itemErr } = await client.from("quote_item").insert(items);
      if (itemErr) throw itemErr;
    }

    return new Response(JSON.stringify({ ok: true, quote_id: quote.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro roteiros/gerar-orcamento", err);
    return new Response(err?.message || "Erro ao gerar orcamento.", { status: 500 });
  }
}
