import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseBrowser } from "../supabase-browser";
import { normalizeText } from "../normalizeText";

type NumeroLookup = { 
  numero_recibo?: string | null; 
  numero_reserva?: string | null;
  cliente_id?: string | null;
};

export type Duplicidade =
  | { tipo: "recibo"; valor: string }
  | { tipo: "reserva"; valor: string; recibos_relacionados?: ReciboRelacionado[] };

export type ReciboRelacionado = {
  id: string;
  venda_id: string;
  numero_recibo: string;
  numero_reserva: string;
  cliente_id: string;
};

function normalizeNumero(valor?: string | null) {
  if (!valor) return "";
  return normalizeText(valor, { trim: true, collapseWhitespace: true }).replace(/\s+/g, "");
}

function uniqueNonEmpty(values: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  values.forEach((v) => {
    const norm = normalizeNumero(v);
    if (!norm) return;
    if (seen.has(norm)) return;
    seen.add(norm);
    out.push(norm);
  });
  return out;
}

export async function findReciboReservaDuplicado(params: {
  client?: SupabaseClient;
  numeros: NumeroLookup[];
  ignoreVendaId?: string | null;
  companyId?: string | null;
}): Promise<Duplicidade | null> {
  const { client, numeros, ignoreVendaId, companyId } = params;
  const sb = client || supabaseBrowser;
  const recibos = uniqueNonEmpty(numeros.map((n) => n.numero_recibo || ""));
  const reservas = uniqueNonEmpty(numeros.map((n) => n.numero_reserva || ""));

  const applyFilters = (query: any) => {
    let q = query;
    if (ignoreVendaId) q = q.neq("venda_id", ignoreVendaId);
    return q;
  };

  // VALIDAÇÃO DE RECIBOS (mantém comportamento original - não pode duplicar)
  if (recibos.length) {
    let query = sb
      .from("vendas_recibos")
      .select("id, numero_recibo, venda_id, vendas!inner(company_id)")
      .in("numero_recibo", recibos);
    
    if (companyId) {
      query = query.eq("vendas.company_id", companyId);
    }
    
    const { data, error } = await applyFilters(query.limit(1));
    if (error) throw error;
    if (data?.length) {
      return { tipo: "recibo", valor: data[0].numero_recibo };
    }
  }

  // VALIDAÇÃO DE RESERVAS (NOVA LÓGICA - permite se cliente diferente)
  if (reservas.length) {
    // Busca todos os recibos com essas reservas
    let query = sb
      .from("vendas_recibos")
      .select(`
        id, 
        numero_recibo, 
        numero_reserva,
        venda_id,
        vendas!inner(cliente_id, company_id)
      `)
      .in("numero_reserva", reservas);
    
    if (companyId) {
      query = query.eq("vendas.company_id", companyId);
    }
    
    const { data: recibosExistentes, error } = await applyFilters(query);
    
    if (error) throw error;
    
    if (recibosExistentes?.length) {
      // Para cada número da requisição, verifica se existe conflito
      for (const numeroAtual of numeros) {
        if (!numeroAtual.numero_reserva) continue;
        
        const reservaNorm = normalizeNumero(numeroAtual.numero_reserva);
        const reciboNorm = normalizeNumero(numeroAtual.numero_recibo);
        
        // Busca recibos existentes com esta reserva
        const recibosComMesmaReserva = recibosExistentes.filter(
          (r: any) => normalizeNumero(r.numero_reserva) === reservaNorm
        );
        
        if (recibosComMesmaReserva.length === 0) continue;
        
        // Verifica se tem algum com o mesmo cliente_id
        const mesmoCliente = recibosComMesmaReserva.some(
          (r: any) => r.vendas?.cliente_id === numeroAtual.cliente_id
        );
        
        // Verifica se tem algum com o mesmo numero_recibo
        const mesmoRecibo = recibosComMesmaReserva.some(
          (r: any) => normalizeNumero(r.numero_recibo) === reciboNorm
        );
        
        // BLOQUEIA se for mesmo cliente OU mesmo recibo
        if (mesmoCliente || mesmoRecibo) {
          return { 
            tipo: "reserva", 
            valor: numeroAtual.numero_reserva 
          };
        }
        
        // PERMITE mas retorna os recibos relacionados para criar vínculo
        // (diferente cliente E diferente recibo = mesma viagem, contratantes diferentes)
        return {
          tipo: "reserva",
          valor: numeroAtual.numero_reserva,
          recibos_relacionados: recibosComMesmaReserva.map((r: any) => ({
            id: r.id,
            venda_id: r.venda_id,
            numero_recibo: r.numero_recibo,
            numero_reserva: r.numero_reserva,
            cliente_id: r.vendas?.cliente_id,
          })),
        };
      }
    }
  }

  return null;
}

export async function ensureReciboReservaUnicos(params: {
  client?: SupabaseClient;
  numeros: NumeroLookup[];
  ignoreVendaId?: string | null;
  companyId?: string | null;
}): Promise<ReciboRelacionado[] | null> {
  const duplicado = await findReciboReservaDuplicado(params);
  
  if (!duplicado) return null;
  
  // Se tem recibos relacionados, retorna info para criar vínculo
  // (não lança erro - permite a importação)
  if (duplicado.tipo === "reserva" && duplicado.recibos_relacionados) {
    console.log(`Reserva duplicada permitida: ${duplicado.valor} (contratantes diferentes)`);
    return duplicado.recibos_relacionados;
  }
  
  // Caso contrário, bloqueia
  const err: any = new Error(
    duplicado.tipo === "recibo"
      ? "RECIBO_DUPLICADO"
      : "RESERVA_DUPLICADA"
  );
  err.code = err.message;
  err.duplicado = duplicado;
  throw err;
}
