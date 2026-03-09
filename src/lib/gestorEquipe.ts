import { supabase } from "./supabase";

export async function fetchGestorEquipeBaseId(gestorId: string) {
  if (!gestorId) return null;
  try {
    const { data, error } = await supabase.rpc("gestor_equipe_base_id", {
      uid: gestorId,
    });
    if (error) throw error;
    const base = String(data || "").trim();
    return base || gestorId;
  } catch (err) {
    try {
      let current = gestorId;
      const visited = new Set<string>();
      for (let i = 0; i < 10; i += 1) {
        if (!current || visited.has(current)) break;
        visited.add(current);
        const { data, error } = await supabase
          .from("gestor_equipe_compartilhada")
          .select("gestor_base_id")
          .eq("gestor_id", current)
          .maybeSingle();
        if (error) {
          const code = String((error as any)?.code || "");
          if (code === "42P01") return gestorId;
          throw error;
        }
        const next = String((data as any)?.gestor_base_id || "").trim();
        if (!next) break;
        current = next;
      }
      return current || gestorId;
    } catch (_) {
      return gestorId;
    }
  }
}

export async function fetchGestorEquipeGestorIds(gestorId: string) {
  if (!gestorId) return [];
  try {
    const { data, error } = await supabase.rpc("gestor_equipe_gestor_ids", {
      uid: gestorId,
    });
    if (error) throw error;
    const ids =
      (data || [])
        .map((row: any) => String(row?.gestor_id || "").trim())
        .filter(Boolean) || [];
    if (ids.length > 0) return Array.from(new Set(ids));
    return [gestorId];
  } catch (err) {
    return [gestorId];
  }
}

export async function fetchGestorEquipeVendedorIds(gestorId: string) {
  try {
    const { data, error } = await supabase.rpc("gestor_equipe_vendedor_ids", {
      uid: gestorId,
    });
    if (error) throw error;
    const ids =
      (data || [])
        .map((row: any) => String(row?.vendedor_id || "").trim())
        .filter(Boolean) || [];
    return Array.from(new Set(ids));
  } catch (err) {
    const { data, error } = await supabase
      .from("gestor_vendedor")
      .select("vendedor_id, ativo")
      .eq("gestor_id", gestorId);
    if (error) throw error;
    const ids =
      (data || [])
        .filter((row: any) => row?.ativo !== false)
        .map((row: any) => String(row?.vendedor_id || "").trim())
        .filter(Boolean) || [];
    return Array.from(new Set(ids));
  }
}

export async function fetchGestorEquipeIdsComGestor(gestorId: string) {
  const extras = await fetchGestorEquipeVendedorIds(gestorId);
  return Array.from(new Set([gestorId, ...extras]));
}
