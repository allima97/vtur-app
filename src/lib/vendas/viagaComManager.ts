import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeText } from "../normalizeText";
import type { ReciboRelacionado } from "./reciboReservaValidator";

function normalizeNumero(valor?: string | null) {
  if (!valor) return "";
  return normalizeText(valor, { trim: true, collapseWhitespace: true }).replace(/\s+/g, "");
}

/**
 * Cria vínculos automáticos "Viaja Com" entre recibos de diferentes
 * contratantes que compartilham a mesma reserva.
 * 
 * @param params.client - Cliente Supabase
 * @param params.vendaId - ID da venda atual
 * @param params.recibosNovos - Recibos recém-criados
 * @param params.recibosRelacionados - Recibos existentes com mesma reserva
 * @returns Número de vínculos criados
 */
export async function criarVinculosViajaComAutomaticos(params: {
  client: SupabaseClient;
  vendaId: string;
  recibosNovos: { id: string; numero_reserva?: string | null }[];
  recibosRelacionados?: ReciboRelacionado[] | null;
}): Promise<number> {
  const { client, vendaId, recibosNovos, recibosRelacionados } = params;
  
  if (!recibosRelacionados || recibosRelacionados.length === 0) {
    return 0;
  }
  
  console.log(`Criando vinculos "Viaja Com" para ${recibosRelacionados.length} recibo(s) relacionado(s)`);
  
  let vinculosCriados = 0;
  
  // Para cada recibo novo que tem reserva duplicada
  for (const reciboNovo of recibosNovos) {
    if (!reciboNovo.numero_reserva) continue;
    
    const reservaNorm = normalizeNumero(reciboNovo.numero_reserva);
    
    // Encontra recibos relacionados com a mesma reserva
    const relacionados = recibosRelacionados.filter(
      (r) => normalizeNumero(r.numero_reserva) === reservaNorm
    );
    
    if (relacionados.length === 0) continue;
    
    for (const relacionado of relacionados) {
      try {
        // Cria vínculo: recibo novo aponta para recibo relacionado
        const { error: erro1 } = await client
          .from("vendas_recibos_complementares")
          .upsert(
            {
              venda_id: vendaId,
              recibo_id: relacionado.id,
            },
            { 
              onConflict: "venda_id,recibo_id",
              ignoreDuplicates: true 
            }
          );
        
        if (erro1) {
          console.error("Erro ao criar vínculo 1:", erro1);
          continue;
        }
        
        // Cria vínculo reverso: recibo relacionado aponta para recibo novo
        const { error: erro2 } = await client
          .from("vendas_recibos_complementares")
          .upsert(
            {
              venda_id: relacionado.venda_id,
              recibo_id: reciboNovo.id,
            },
            { 
              onConflict: "venda_id,recibo_id",
              ignoreDuplicates: true 
            }
          );
        
        if (erro2) {
          console.error("Erro ao criar vínculo 2:", erro2);
          continue;
        }
        
        vinculosCriados += 2;
        console.log(`  Vinculo criado: Reserva ${reciboNovo.numero_reserva} (${reciboNovo.id} <-> ${relacionado.id})`);
        
      } catch (error) {
        console.error("Erro ao criar vínculo 'Viaja Com':", error);
      }
    }
  }
  
  console.log(`Total de ${vinculosCriados} vinculos criados automaticamente`);
  return vinculosCriados;
}

/**
 * Busca todos os recibos complementares ("Viaja Com") de uma venda.
 * 
 * @param params.client - Cliente Supabase
 * @param params.vendaId - ID da venda
 * @returns Lista de recibos complementares com informações do cliente
 */
export async function buscarRecibosComplementares(params: {
  client: SupabaseClient;
  vendaId: string;
}): Promise<any[]> {
  const { client, vendaId } = params;
  
  const { data, error } = await client
    .from("vendas_recibos_complementares")
    .select(`
      recibo_id,
      vendas_recibos!inner(
        id,
        numero_recibo,
        numero_reserva,
        venda_id,
        vendas!inner(
          cliente_id,
          clientes(nome)
        )
      )
    `)
    .eq("venda_id", vendaId);
  
  if (error) {
    console.error("Erro ao buscar recibos complementares:", error);
    return [];
  }
  
  return data || [];
}
