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

type QuoteItemPayload = {
  id?: string | null;
  item_type: string;
  title: string | null;
  product_name: string | null;
  city_name: string | null;
  cidade_id?: string | null;
  quantity: number;
  unit_price: number;
  total_amount: number;
  taxes_amount?: number | null;
  start_date: string | null;
  end_date: string | null;
  currency: string | null;
  raw?: Record<string, unknown> | null;
  order_index?: number | null;
  segments?: QuoteItemSegmentPayload[] | null;
};

type QuoteItemSegmentPayload = {
  segment_type: string;
  data: Record<string, unknown>;
  order_index?: number | null;
};

function normalizeLookupText(value: string) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function validateItem(item: QuoteItemPayload) {
  return Boolean(
    item.item_type &&
      item.quantity > 0 &&
      item.start_date &&
      item.title &&
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

async function syncProductsCatalog(client: any, items: QuoteItemPayload[]) {
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
      3,
      "Sem acesso para editar Orcamentos."
    );
    if (denied) return denied;

    const body = await request.json().catch(() => null);
    const quoteId = String(body?.quote_id || "").trim();
    if (!quoteId) return new Response("Quote invalido.", { status: 400 });

    const items = Array.isArray(body?.items) ? (body.items as QuoteItemPayload[]) : [];
    const removedItemIds = Array.isArray(body?.removed_item_ids)
      ? (body.removed_item_ids as string[])
      : [];
    const clienteId = String(body?.client_id || "").trim() || null;

    const payload = items.map((item, index) => ({
      id: item.id || undefined,
      quote_id: quoteId,
      item_type: item.item_type,
      title: item.title,
      product_name: item.product_name,
      city_name: item.city_name,
      cidade_id: item.cidade_id || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_amount: item.total_amount,
      taxes_amount: Number(item.taxes_amount || 0),
      start_date: item.start_date || null,
      end_date: item.end_date || item.start_date || null,
      currency: item.currency || "BRL",
      raw: item.raw || {},
      order_index: typeof item.order_index === "number" ? item.order_index : index,
    }));

    const { error: itemError } = await client
      .from("quote_item")
      .upsert(payload, { onConflict: "id" });
    if (itemError) throw itemError;

    if (removedItemIds.length) {
      const { error: deleteRemovedSegs } = await client
        .from("quote_item_segment")
        .delete()
        .in("quote_item_id", removedItemIds);
      if (deleteRemovedSegs) throw deleteRemovedSegs;

      const { error: deleteRemovedItems } = await client
        .from("quote_item")
        .delete()
        .in("id", removedItemIds);
      if (deleteRemovedItems) throw deleteRemovedItems;
    }

    const itemIds = payload.map((item) => item.id).filter(Boolean) as string[];
    if (itemIds.length) {
      const { error: deleteSegErr } = await client
        .from("quote_item_segment")
        .delete()
        .in("quote_item_id", itemIds);
      if (deleteSegErr) throw deleteSegErr;

      const segmentPayloads = items.flatMap((item) =>
        (item.segments || []).map((segment, idx) => ({
          quote_item_id: item.id,
          segment_type: segment.segment_type,
          data: segment.data || {},
          order_index: typeof segment.order_index === "number" ? segment.order_index : idx,
        }))
      ).filter((seg) => Boolean(seg.quote_item_id));

      if (segmentPayloads.length) {
        const { error: segErr } = await client
          .from("quote_item_segment")
          .insert(segmentPayloads);
        if (segErr) throw segErr;
      }
    }

    await syncProductsCatalog(client, items);

    const subtotal = items.reduce((sum, item) => sum + Number(item.total_amount || 0), 0);
    const taxes = items.reduce((sum, item) => sum + Number(item.taxes_amount || 0), 0);
    const total = subtotal + taxes;
    const canConfirm = items.length > 0 && items.every(validateItem);
    const nextStatus = canConfirm ? "CONFIRMED" : String(body?.status || "DRAFT");

    const { error: quoteError } = await client
      .from("quote")
      .update({
        subtotal,
        taxes,
        total,
        status: nextStatus,
        client_id: clienteId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", quoteId);
    if (quoteError) throw quoteError;

    return new Response(JSON.stringify({ ok: true, status: nextStatus }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Erro orcamentos/save", err);
    return new Response(err?.message || "Erro ao salvar orcamento.", { status: 500 });
  }
}
