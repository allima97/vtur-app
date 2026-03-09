import { buildAuthClient, requireModuloLevel } from "../vendas/_utils";

const EXCLUDED_PRODUTO_TIPOS = new Set(
  [
    "Seguro viagem",
    "Passagem Aerea",
    "Passagem Facial",
    "Aereo",
    "Chip",
    "Aluguel de Carro",
  ].map((value) => normalizeLookupText(value))
);

type ManualItemPayload = {
  item_type: string;
  title: string;
  product_name: string;
  city_name: string;
  cidade_id: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  taxes_amount: number;
  start_date: string;
  end_date?: string | null;
  currency: string;
  raw?: Record<string, unknown>;
  order_index?: number | null;
};

function normalizeLookupText(value: string) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function validateItem(item: ManualItemPayload) {
  return Boolean(
    item.item_type &&
      item.quantity > 0 &&
      item.start_date &&
      (item.title || item.product_name) &&
      Number(item.total_amount || 0) > 0
  );
}

async function buildTipoLabelMap(client: any) {
  const { data, error } = await client
    .from("tipo_produtos")
    .select("id, nome, tipo")
    .order("nome", { ascending: true })
    .limit(500);
  if (error) throw error;
  const map = new Map<string, string>();
  (data || []).forEach((tipo: any) => {
    const label = String(tipo?.nome || tipo?.tipo || "").trim();
    const key = normalizeLookupText(label);
    if (key) map.set(key, tipo.id);
  });
  return map;
}

async function syncProductsCatalog(client: any, items: ManualItemPayload[]) {
  if (!items.length) return;
  const tipoLabelMap = await buildTipoLabelMap(client);
  for (const item of items) {
    const nomeRaw = String(item.title || item.product_name || "").trim();
    if (!nomeRaw) continue;
    const destinoRaw = String(item.city_name || "").trim();
    const cidadeId = item.cidade_id || null;
    const tipoKey = normalizeLookupText(item.item_type || "");
    if (EXCLUDED_PRODUTO_TIPOS.has(tipoKey)) continue;

    const payload = {
      nome: nomeRaw,
      destino: destinoRaw || null,
      cidade_id: cidadeId,
      tipo_produto: tipoLabelMap.get(tipoKey) || null,
    };

    try {
      let query = client.from("produtos").select("id");
      query = query.eq("nome", payload.nome);
      if (payload.destino) {
        query = query.eq("destino", payload.destino);
      } else {
        query = query.is("destino", null);
      }
      if (payload.cidade_id) {
        query = query.eq("cidade_id", payload.cidade_id);
      } else {
        query = query.is("cidade_id", null);
      }
      const { data: existing, error: selectErr } = await query.maybeSingle();
      if (selectErr) {
        console.warn("[Orcamentos] Falha ao buscar produto", selectErr);
        continue;
      }
      if (existing?.id) {
        const { error: updateErr } = await client
          .from("produtos")
          .update(payload)
          .eq("id", existing.id);
        if (updateErr) console.warn("[Orcamentos] Falha ao atualizar produto", updateErr);
      } else {
        const { error: insertErr } = await client.from("produtos").insert(payload);
        if (insertErr) console.warn("[Orcamentos] Falha ao inserir produto", insertErr);
      }
    } catch (err) {
      console.warn("[Orcamentos] Erro ao sincronizar produto", err);
    }
  }
}

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
    const clientId = String(body?.client_id || "").trim();
    const items = Array.isArray(body?.items) ? (body.items as ManualItemPayload[]) : [];
    if (!clientId) return new Response("Cliente obrigatorio.", { status: 400 });
    if (!items.length) return new Response("Itens obrigatorios.", { status: 400 });

    const invalid = items.some((item) => !validateItem(item));
    if (invalid) return new Response("Itens invalidos.", { status: 400 });

    const { data: cliente, error: clienteErr } = await client
      .from("clientes")
      .select("id, nome, whatsapp, email")
      .eq("id", clientId)
      .maybeSingle();
    if (clienteErr) throw clienteErr;

    const subtotalValue = items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const taxesValue = items.reduce((sum, item) => sum + Number(item.taxes_amount || 0), 0);
    const statusQuote = items.every(validateItem) ? "CONFIRMED" : "IMPORTED";

    const quotePayload = {
      created_by: user.id,
      client_id: clientId,
      client_name: cliente?.nome || null,
      client_whatsapp: cliente?.whatsapp || null,
      client_email: cliente?.email || null,
      status: statusQuote,
      currency: "BRL",
      subtotal: subtotalValue,
      taxes: taxesValue,
      total: subtotalValue,
      average_confidence: 1,
      raw_json: { manual: true },
    };

    const { data: quote, error: quoteError } = await client
      .from("quote")
      .insert(quotePayload)
      .select("id")
      .single();
    if (quoteError || !quote) throw quoteError || new Error("Falha ao criar orcamento.");

    const itemsPayload = items.map((item, index) => ({
      quote_id: quote.id,
      item_type: item.item_type,
      title: item.title,
      product_name: item.product_name,
      city_name: item.city_name,
      cidade_id: item.cidade_id || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_amount: item.total_amount,
      taxes_amount: item.taxes_amount,
      start_date: item.start_date || null,
      end_date: item.end_date || item.start_date || null,
      currency: item.currency || "BRL",
      confidence: 1,
      order_index: typeof item.order_index === "number" ? item.order_index : index,
      raw: item.raw || {},
    }));

    const { error: itemError } = await client.from("quote_item").insert(itemsPayload);
    if (itemError) throw itemError;

    await syncProductsCatalog(client, items);

    return new Response(JSON.stringify({ ok: true, quote_id: quote.id, status: statusQuote }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro orcamentos/create", err);
    return new Response(err?.message || "Erro ao criar orcamento.", { status: 500 });
  }
}
