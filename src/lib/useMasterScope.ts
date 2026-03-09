import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import { fetchGestorEquipeVendedorIds } from "./gestorEquipe";

type MasterEmpresa = {
  id: string;
  nome_fantasia: string;
  status: string;
};

type MasterUsuario = {
  id: string;
  nome_completo: string;
  company_id: string | null;
  uso_individual?: boolean | null;
  user_types?: { name: string | null } | null;
};

const getTipoNome = (u: MasterUsuario) =>
  String(u.user_types?.name || "").toUpperCase();

const isGestor = (u: MasterUsuario) => getTipoNome(u).includes("GESTOR");
const isVendedor = (u: MasterUsuario) => getTipoNome(u).includes("VENDEDOR");

export function useMasterScope(enabled: boolean) {
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<MasterEmpresa[]>([]);
  const [usuarios, setUsuarios] = useState<MasterUsuario[]>([]);

  const [empresaSelecionada, setEmpresaSelecionada] = useState("all");
  const [gestorSelecionado, setGestorSelecionado] = useState("all");
  const [vendedorSelecionado, setVendedorSelecionado] = useState("all");
  const [gestorEquipeIds, setGestorEquipeIds] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let mounted = true;

    async function carregar() {
      try {
        setLoading(true);
        setErro(null);

        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) {
          if (mounted) setErro("Usuário não autenticado.");
          return;
        }

        const { data: vinculos, error: vincErr } = await supabase
          .from("master_empresas")
          .select("company_id, status, companies(id, nome_fantasia)")
          .eq("master_id", userId);
        if (vincErr) throw vincErr;

        const empresasFmt: MasterEmpresa[] = (vinculos || []).map((v: any) => ({
          id: v.company_id,
          nome_fantasia: v.companies?.nome_fantasia || "Empresa",
          status: v.status || "pending",
        }));

        if (!mounted) return;
        setEmpresas(empresasFmt);

        const aprovadas = empresasFmt.filter((e) => e.status === "approved");
        const idsAprovadas = aprovadas.map((e) => e.id);
        if (idsAprovadas.length === 0) {
          setUsuarios([]);
          return;
        }

        const { data: usuariosData, error: usuariosErr } = await supabase
          .from("users")
          .select("id, nome_completo, company_id, uso_individual, user_types(name)")
          .in("company_id", idsAprovadas)
          .eq("uso_individual", false);
        if (usuariosErr) throw usuariosErr;

        if (!mounted) return;
        setUsuarios((usuariosData || []) as MasterUsuario[]);
      } catch (e) {
        console.error(e);
        if (mounted) setErro("Erro ao carregar portfólio do master.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    carregar();
    return () => {
      mounted = false;
    };
  }, [enabled]);

  const empresasAprovadas = useMemo(
    () => empresas.filter((e) => e.status === "approved"),
    [empresas]
  );

  const usuariosScope = useMemo(() => {
    if (empresaSelecionada === "all") return usuarios;
    return usuarios.filter((u) => u.company_id === empresaSelecionada);
  }, [usuarios, empresaSelecionada]);

  const gestoresDisponiveis = useMemo(
    () => usuariosScope.filter(isGestor),
    [usuariosScope]
  );
  const vendedoresDisponiveis = useMemo(
    () => usuariosScope.filter(isVendedor),
    [usuariosScope]
  );

  useEffect(() => {
    if (!enabled) return;
    if (
      gestorSelecionado !== "all" &&
      !gestoresDisponiveis.some((g) => g.id === gestorSelecionado)
    ) {
      setGestorSelecionado("all");
    }
    if (
      vendedorSelecionado !== "all" &&
      !vendedoresDisponiveis.some((v) => v.id === vendedorSelecionado)
    ) {
      setVendedorSelecionado("all");
    }
  }, [
    enabled,
    gestoresDisponiveis,
    vendedoresDisponiveis,
    gestorSelecionado,
    vendedorSelecionado,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (gestorSelecionado === "all") {
      setGestorEquipeIds([]);
      return;
    }

    let mounted = true;
    (async () => {
      try {
        const ids = await fetchGestorEquipeVendedorIds(gestorSelecionado);
        if (mounted) setGestorEquipeIds(ids);
      } catch (error) {
        console.error(error);
        if (mounted) setGestorEquipeIds([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [enabled, gestorSelecionado]);

  const vendedorIds = useMemo(() => {
    if (vendedorSelecionado !== "all") return [vendedorSelecionado];
    if (gestorSelecionado !== "all") return gestorEquipeIds;
    return vendedoresDisponiveis.map((v) => v.id);
  }, [vendedorSelecionado, gestorSelecionado, gestorEquipeIds, vendedoresDisponiveis]);

  return {
    loading,
    erro,
    empresasAprovadas,
    empresaSelecionada,
    setEmpresaSelecionada,
    gestoresDisponiveis,
    gestorSelecionado,
    setGestorSelecionado,
    vendedoresDisponiveis,
    vendedorSelecionado,
    setVendedorSelecionado,
    vendedorIds,
  };
}
