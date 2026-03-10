import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import ConfirmDialog from "../ui/ConfirmDialog";
import AlertMessage from "../ui/AlertMessage";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import AppToolbar from "../ui/primer/AppToolbar";
import { buildMonthOptionsYYYYMM, formatCurrencyBRL, formatMonthYearBR, formatNumberBR } from "../../lib/format";
import { fetchGestorEquipeVendedorIds } from "../../lib/gestorEquipe";
import {
  formatMoneyForInput,
  normalizeMoneyInput,
  parseMoneyPtBR,
  sanitizeMoneyInput,
} from "../../lib/inputNormalization";

type Usuario = {
  id: string;
  nome_completo: string;
  uso_individual: boolean;
  company_id: string | null;
  user_types?: { name: string | null } | { name: string | null }[] | null;
};

type Meta = {
  id: string;
  vendedor_id: string;
  periodo: string; // YYYY-MM-01
  meta_geral: number;
  meta_diferenciada: number;
  ativo: boolean;
  produto_diferenciado_id?: string | null;
  scope?: string | null;
};

type MetaProduto = {
  meta_vendedor_id: string;
  produto_id: string;
  valor: number;
};

function extrairNomesTipos(usuario?: Usuario | null) {
  if (!usuario?.user_types) return [];
  if (Array.isArray(usuario.user_types)) {
    return usuario.user_types.map((ut) => ut?.name || "").filter(Boolean);
  }
  return [usuario.user_types.name || ""].filter(Boolean);
}

const isUsuarioVendedor = (usuario?: Usuario | null) =>
  extrairNomesTipos(usuario).some((nome) => nome.toUpperCase().includes("VENDEDOR"));

const isUsuarioGestor = (usuario?: Usuario | null) =>
  extrairNomesTipos(usuario).some((nome) => nome.toUpperCase().includes("GESTOR"));

const isUsuarioMaster = (usuario?: Usuario | null) =>
  extrairNomesTipos(usuario).some((nome) => nome.toUpperCase().includes("MASTER"));

const isUsuarioAdmin = (usuario?: Usuario | null) =>
  extrairNomesTipos(usuario).some((nome) => nome.toUpperCase().includes("ADMIN"));

export default function MetasVendedorIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Metas");
  const isAdmin = can("Metas", "admin");
  const isEdit = !isAdmin && can("Metas", "edit");
  const [parametros, setParametros] = useState<{
    foco_valor?: "bruto" | "liquido";
  } | null>(null);

  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [vendedores, setVendedores] = useState<Usuario[]>([]);
  const [equipeIds, setEquipeIds] = useState<string[]>([]);
  const [produtos, setProdutos] = useState<{ id: string; nome: string }[]>([]);

  const [vendedorSelecionado, setVendedorSelecionado] = useState<string>("");
  const [periodo, setPeriodo] = useState<string>(new Date().toISOString().slice(0, 7));
  const [ativoMeta, setAtivoMeta] = useState<boolean>(true);

  const [metaGeral, setMetaGeral] = useState<string>("");
  const [metaProdutos, setMetaProdutos] = useState<{ produto_id: string; valor: string }[]>([]);
  const [mostrarMetaProdutos, setMostrarMetaProdutos] = useState<boolean>(false);

  const [metaEquipeGeral, setMetaEquipeGeral] = useState<string>("");
  const [metaLojaPeriodo, setMetaLojaPeriodo] = useState<Meta | null>(null);
  const [nomeLoja, setNomeLoja] = useState<string>("");
  const [gestorParticipa, setGestorParticipa] = useState<boolean>(false);
  const [dividirMetaIgual, setDividirMetaIgual] = useState<boolean>(true);
  const [metaGestor, setMetaGestor] = useState<string>("");
  const [metaEquipeProdutos, setMetaEquipeProdutos] = useState<{ produto_id: string; valor: string }[]>([]);
  const [mostrarMetaEquipeProdutos, setMostrarMetaEquipeProdutos] = useState<boolean>(false);
  const [periodoEquipe, setPeriodoEquipe] = useState<string>(new Date().toISOString().slice(0, 7));
  const [ativoEquipe, setAtivoEquipe] = useState<boolean>(true);
  const [salvandoEquipe, setSalvandoEquipe] = useState<boolean>(false);
  const [erroEquipe, setErroEquipe] = useState<string | null>(null);
  const [mostrarFormularioMetaLoja, setMostrarFormularioMetaLoja] = useState<boolean>(false);
  const [sucessoEquipe, setSucessoEquipe] = useState<boolean>(false);
  const [editandoMetaEquipe, setEditandoMetaEquipe] = useState<boolean>(false);

  const monthOptions = useMemo(() => {
    const options = buildMonthOptionsYYYYMM({ yearsBack: 10, yearsForward: 2, order: "desc" });
    const extras = [periodoEquipe, periodo].filter(
      (value): value is string => Boolean(value && !options.includes(value))
    );
    return Array.from(new Set([...extras, ...options]));
  }, [periodoEquipe, periodo]);

  const [listaMetas, setListaMetas] = useState<Meta[]>([]);
  const [detalhesMetas, setDetalhesMetas] = useState<Record<string, MetaProduto[]>>({});
  const [editId, setEditId] = useState<string | null>(null);

  const [loadingMeta, setLoadingMeta] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [mostrarFormularioMeta, setMostrarFormularioMeta] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [metaParaExcluir, setMetaParaExcluir] = useState<Meta | null>(null);
  const [metasEquipePeriodo, setMetasEquipePeriodo] = useState<Meta[]>([]);
  const [detalhesEquipePeriodo, setDetalhesEquipePeriodo] = useState<Record<string, MetaProduto[]>>({});
  const [carregandoResumoEquipe, setCarregandoResumoEquipe] = useState(false);

  // =============================================
  // 1. CARREGAR USUÁRIO LOGADO + VENDEDORES
  // =============================================
  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    try {
      setLoadingMeta(true);

      // usuário logado
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;

      if (!userId) {
        setErro("Usuário não autenticado.");
        return;
      }

      const { data: usuarios } = await supabase
        .from("users")
        .select("id, nome_completo, uso_individual, company_id, user_types(name)");

      const logado = (usuarios || []).find((u) => u.id === userId) || null;
      setUsuario(logado);
      const gestorLocal = isUsuarioGestor(logado);

      if (logado?.company_id) {
        try {
          const { data: companyRow } = await supabase
            .from("companies")
            .select("nome_fantasia")
            .eq("id", logado.company_id)
            .maybeSingle();
          setNomeLoja(String((companyRow as any)?.nome_fantasia || ""));
        } catch (e) {
          console.warn("Não foi possível carregar nome da loja.", e);
          setNomeLoja("");
        }
      } else {
        setNomeLoja("");
      }

      // carregar produtos ativos
      const { data: produtosData } = await supabase
        .from("tipo_produtos")
        .select("id, nome")
        .eq("ativo", true);
      setProdutos(produtosData || []);

      // selecionar vendedores da empresa
      const isAdminLocal = can("Metas", "admin");
      const isEditLocal = can("Metas", "edit");

      let equipeIdsLocal: string[] = [];
      let equipeUsuarios: Usuario[] = [];
      if (gestorLocal) {
        equipeIdsLocal = await fetchGestorEquipeVendedorIds(userId);
        equipeUsuarios = (usuarios || []).filter((u: any) =>
          equipeIdsLocal.includes(u.id)
        ) as Usuario[];
      }
      setEquipeIds(equipeIdsLocal);

      let vendedoresDisponiveis: Usuario[] = [];
      if (isAdminLocal) {
        vendedoresDisponiveis = logado?.company_id
          ? (usuarios || []).filter((u: any) => u.company_id === logado.company_id) as Usuario[]
          : (usuarios || []);
      } else if (gestorLocal) {
        const base = [...equipeUsuarios, ...(logado ? [logado] : [])];
        const unique = Array.from(
          new Map(base.filter(Boolean).map((u) => [u.id, u])).values()
        );
        vendedoresDisponiveis = unique;
      } else if (isEditLocal) {
        vendedoresDisponiveis = logado?.company_id
          ? (usuarios || []).filter((u: any) => u.company_id === logado.company_id) as Usuario[]
          : (usuarios || []);
      } else if (isUsuarioVendedor(logado)) {
        vendedoresDisponiveis = [logado];
      }
      const vendedoresValidos = gestorLocal
        ? vendedoresDisponiveis
        : vendedoresDisponiveis.filter(isUsuarioVendedor);
      setVendedores(vendedoresValidos);

      // Para Master/Admin (ou usuários com permissão de edição) sem equipe do gestor,
      // usa todos os vendedores da empresa como "equipe" para resumo/distribuição.
      if (!gestorLocal && (isAdminLocal || isEditLocal)) {
        setEquipeIds(vendedoresValidos.map((v) => v.id));
      }

      // carregar parametros_comissao (company)
      const { data: params } = await supabase
        .from("parametros_comissao")
        .select("foco_valor")
        .eq("company_id", logado?.company_id || null)
        .maybeSingle();
      setParametros(params || null);

      if (vendedoresValidos.length === 0) {
        setErro(
          gestorLocal
            ? "Nenhum vendedor vinculado ao gestor."
            : "Nenhum vendedor do tipo VENDEDOR disponível."
        );
        return;
      }
      const initialVendedor =
        vendedoresValidos.find((v) => v.id === logado?.id) || vendedoresValidos[0];
      await carregarMetas(initialVendedor.id, logado);
      setVendedorSelecionado(initialVendedor.id);

    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar dados iniciais");
    } finally {
      setLoadingMeta(false);
    }
  }

  // =============================================
  // 2. CARREGAR METAS DO VENDEDOR SELECIONADO
  // =============================================
  async function carregarMetas(vendedor_id: string, usuarioLogado?: Usuario | null) {
    const isAdminLocal = can("Metas", "admin");
    const isEditLocal = can("Metas", "edit");

    const usuarioAtual = usuarioLogado ?? usuario;

    if (!usuarioAtual && !isAdminLocal && !isEditLocal) {
      setListaMetas([]);
      return;
    }

    // vendedor comum só pode ver as próprias metas
    if (!isAdminLocal && !isEditLocal && vendedor_id !== usuarioAtual?.id) {
      setListaMetas([]);
      return;
    }

    const { data } = await supabase
      .from("metas_vendedor")
      .select("id, vendedor_id, periodo, meta_geral, meta_diferenciada, ativo, produto_diferenciado_id, scope")
      .eq("vendedor_id", vendedor_id)
      .or("scope.is.null,scope.neq.equipe")
      .order("periodo", { ascending: false });

    const metas = (data || []) as Meta[];
    setListaMetas(metas);

    if (metas.length > 0) {
      const { data: det } = await supabase
        .from("metas_vendedor_produto")
        .select("meta_vendedor_id, produto_id, valor")
        .in(
          "meta_vendedor_id",
          metas.map((m) => m.id)
        );
      const map: Record<string, MetaProduto[]> = {};
      (det || []).forEach((d: any) => {
        if (!map[d.meta_vendedor_id]) map[d.meta_vendedor_id] = [];
        map[d.meta_vendedor_id].push(d as MetaProduto);
      });
      setDetalhesMetas(map);
    } else {
      setDetalhesMetas({});
    }
  }

  async function carregarResumoEquipe(periodoYYYYMM: string) {
    if (!usuario || !podeGerenciarMetasEquipe) {
      setMetasEquipePeriodo([]);
      setDetalhesEquipePeriodo({});
      setMetaLojaPeriodo(null);
      setCarregandoResumoEquipe(false);
      return;
    }

    const periodoFinal = `${periodoYYYYMM}-01`;
    const idsConsulta = Array.from(new Set([usuario.id, ...equipeIds]));
    if (idsConsulta.length === 0) {
      setMetasEquipePeriodo([]);
      setDetalhesEquipePeriodo({});
      setCarregandoResumoEquipe(false);
      return;
    }

    try {
      setCarregandoResumoEquipe(true);
      const { data: metasData, error: metasErr } = await supabase
        .from("metas_vendedor")
        .select("id, vendedor_id, periodo, meta_geral, meta_diferenciada, ativo, scope")
        .eq("periodo", periodoFinal)
        .in("vendedor_id", idsConsulta);
      if (metasErr) throw metasErr;

      const metasPeriodo = (metasData || []) as Meta[];
      const metaLoja =
        metasPeriodo.find((m: any) => m?.scope === "equipe" && m?.vendedor_id === usuario.id) ||
        metasPeriodo.find((m: any) => m?.scope === "equipe") ||
        null;
      setMetaLojaPeriodo(metaLoja as Meta | null);

      const metasVendedor = metasPeriodo.filter((m: any) => m?.scope !== "equipe") as Meta[];
      setMetasEquipePeriodo(metasVendedor);

      const metaIds = metasPeriodo.map((m) => m.id).filter(Boolean);
      if (metaIds.length === 0) {
        setDetalhesEquipePeriodo({});
        return;
      }

      const { data: det, error: detErr } = await supabase
        .from("metas_vendedor_produto")
        .select("meta_vendedor_id, produto_id, valor")
        .in("meta_vendedor_id", metaIds);
      if (detErr) throw detErr;

      const map: Record<string, MetaProduto[]> = {};
      (det || []).forEach((d: any) => {
        if (!map[d.meta_vendedor_id]) map[d.meta_vendedor_id] = [];
        map[d.meta_vendedor_id].push(d as MetaProduto);
      });
      setDetalhesEquipePeriodo(map);
    } catch (e) {
      console.error(e);
      setDetalhesEquipePeriodo({});
      setMetasEquipePeriodo([]);
    } finally {
      setCarregandoResumoEquipe(false);
    }
  }

  useEffect(() => {
    if (!loadingPerm && vendedorSelecionado) {
      carregarMetas(vendedorSelecionado);
    }
  }, [vendedorSelecionado, loadingPerm]);

  // =============================================
  // 3. PERFIL DE ACESSO
  // =============================================
  const isGestorRole = isUsuarioGestor(usuario);
  const isAdminRole = isUsuarioAdmin(usuario);
  const isMasterRole = isUsuarioMaster(usuario);
  const isUsoIndividual = Boolean(usuario?.uso_individual);
  const isVendedorOnly =
    isUsuarioVendedor(usuario) && !isGestorRole && !isAdminRole && !isUsoIndividual;

  const podeEditarMetas =
    can("Metas", "edit") ||
    can("Metas", "delete") ||
    can("Metas", "create") ||
    can("Metas", "admin") ||
    can("Parametros", "edit") ||
    can("Parametros", "delete") ||
    can("Parametros", "create") ||
    can("Parametros", "admin");
  const usuarioPodeEditar = !isVendedorOnly && podeEditarMetas;
  const podeGerenciarMetasEquipe = usuarioPodeEditar && (isGestorRole || isMasterRole || isAdminRole);

  const mostrarSelectVendedor = usuarioPodeEditar && vendedores.length > 1;

  useEffect(() => {
    if (!podeGerenciarMetasEquipe) return;
    carregarResumoEquipe(periodoEquipe);
  }, [podeGerenciarMetasEquipe, periodoEquipe, equipeIds, usuario]);

  // =============================================
  // 4. SALVAR / EDITAR META
  // =============================================
  function money(valor: string) {
    return parseMoneyPtBR(valor) ?? 0;
  }

  function totalMetaDiferenciada() {
    return metaProdutos.reduce((sum, item) => sum + money(item.valor), 0);
  }

  function totalMetaEquipeDiferenciada() {
    return metaEquipeProdutos.reduce((sum, item) => sum + money(item.valor), 0);
  }

  function limparFormularioEquipe() {
    setMetaEquipeGeral("");
    setGestorParticipa(false);
    setDividirMetaIgual(true);
    setMetaGestor("");
    setMetaEquipeProdutos([]);
    setMostrarMetaEquipeProdutos(false);
    setAtivoEquipe(true);
    setErroEquipe(null);
    setEditandoMetaEquipe(false);
  }

  async function salvarMetaLoja(e: React.FormEvent) {
    e.preventDefault();
    setErroEquipe(null);

    if (!usuario || !podeGerenciarMetasEquipe) {
      setErroEquipe("Você não tem permissão para definir a meta da loja.");
      return;
    }

    const metaTotal = money(metaEquipeGeral);
    if (!metaEquipeGeral || metaTotal <= 0) {
      setErroEquipe("Informe uma meta válida para a loja.");
      return;
    }

    const periodoFinal = `${periodoEquipe}-01`;
    const produtosEquipeValidos = metaEquipeProdutos.filter(
      (p) => p.produto_id && money(p.valor) > 0
    );
    const totalDifEquipe = produtosEquipeValidos.reduce(
      (sum, item) => sum + money(item.valor),
      0
    );

    if (parametros?.foco_valor === "liquido" && totalDifEquipe <= 0) {
      setErroEquipe("Quando o foco é valor líquido, informe metas diferenciadas por produto.");
      return;
    }

  const metaGestorNum = isGestorRole && gestorParticipa ? money(metaGestor) : 0;
    if (isGestorRole && gestorParticipa && metaGestorNum <= 0) {
      setErroEquipe("Informe a meta do gestor para participar da meta da loja.");
      return;
    }
    if (isGestorRole && gestorParticipa && metaGestorNum > metaTotal) {
      setErroEquipe("A meta do gestor não pode ser maior que a meta da loja.");
      return;
    }

    try {
      setSalvandoEquipe(true);

      // 1) Salvar meta da loja (scope = equipe)
      let metaLojaId = "";
      const idsConsulta = Array.from(new Set([usuario.id, ...equipeIds].filter(Boolean)));
      const { data: lojaExistentes, error: lojaExistenteErr } = await supabase
        .from("metas_vendedor")
        .select("id, vendedor_id")
        .eq("periodo", periodoFinal)
        .eq("scope", "equipe")
        .in("vendedor_id", idsConsulta);
      if (lojaExistenteErr) throw lojaExistenteErr;

      const lojaExistente = (lojaExistentes || [])[0] || null;

      if ((lojaExistente as any)?.id) {
        metaLojaId = String((lojaExistente as any).id);
        const { error: updateErr } = await supabase
          .from("metas_vendedor")
          .update({
            meta_geral: metaTotal,
            meta_diferenciada: totalDifEquipe,
            ativo: ativoEquipe,
            scope: "equipe",
          })
          .eq("id", metaLojaId);
        if (updateErr) throw updateErr;
      } else {
        const metaLojaVendedorId = (equipeIds || []).filter(Boolean)[0] || "";
        if (!metaLojaVendedorId) {
          setErroEquipe("Nenhum vendedor disponível para vincular a meta da loja.");
          return;
        }
        const { data: inserted, error: insertErr } = await supabase
          .from("metas_vendedor")
          .upsert(
            {
              vendedor_id: metaLojaVendedorId,
              periodo: periodoFinal,
              meta_geral: metaTotal,
              meta_diferenciada: totalDifEquipe,
              ativo: ativoEquipe,
              scope: "equipe",
            },
            { onConflict: "vendedor_id,periodo,scope" }
          )
          .select("id")
          .single();
        if (insertErr) throw insertErr;
        metaLojaId = String((inserted as any)?.id || "");
      }

      // Sincronizar metas por produto (meta da loja)
      if (metaLojaId) {
        await supabase
          .from("metas_vendedor_produto")
          .delete()
          .eq("meta_vendedor_id", metaLojaId);

        if (produtosEquipeValidos.length > 0) {
          const detalhesInsert = produtosEquipeValidos.map((p) => ({
            meta_vendedor_id: metaLojaId,
            produto_id: p.produto_id,
            valor: money(p.valor),
          }));
          const { error: detError } = await supabase
            .from("metas_vendedor_produto")
            .insert(detalhesInsert);
          if (detError) throw detError;
        }
      }

      // 2) Se dividir igualmente, gera/atualiza metas individuais da equipe
      if (dividirMetaIgual) {
        const equipe = (equipeIds || []).filter(Boolean);
        if (equipe.length === 0) {
          setErroEquipe("Nenhum vendedor disponível para dividir a meta.");
          return;
        }

        const restante = metaTotal - metaGestorNum;
        if (restante < 0) {
          setErroEquipe("A meta da loja precisa ser maior que a meta do gestor.");
          return;
        }

        const divisor = equipe.length;
        const metaPorVendedor = divisor > 0 ? restante / divisor : 0;

        const produtosPorVendedor = produtosEquipeValidos.map((linha) => {
          const valorTotalProduto = money(linha.valor);
          const valorPorVendedor = divisor > 0 ? valorTotalProduto / divisor : 0;
          return { produto_id: linha.produto_id, valor: valorPorVendedor };
        });

        const distribuicao: {
          vendedor_id: string;
          meta_geral: number;
          meta_produtos: { produto_id: string; valor: number }[];
        }[] = equipe.map((id) => ({
          vendedor_id: id,
          meta_geral: metaPorVendedor,
          meta_produtos: produtosPorVendedor,
        }));

        if (metaGestorNum > 0) {
          distribuicao.push({
            vendedor_id: usuario.id,
            meta_geral: metaGestorNum,
            meta_produtos: [],
          });
        }

        const idsParaMetas = distribuicao.map((d) => d.vendedor_id);
        const upserts = distribuicao.map((item) => {
          const metaDifValue = (item.meta_produtos || []).reduce(
            (sum, p) => sum + (p.valor || 0),
            0
          );
          return {
            vendedor_id: item.vendedor_id,
            periodo: periodoFinal,
            meta_geral: item.meta_geral,
            meta_diferenciada: metaDifValue,
            ativo: ativoEquipe,
            scope: "vendedor",
          };
        });

        if (upserts.length) {
          const { error: upsertErr } = await supabase
            .from("metas_vendedor")
            .upsert(upserts, { onConflict: "vendedor_id,periodo,scope" });
          if (upsertErr) throw upsertErr;
        }

        const { data: metasPeriodo, error: metasPeriodoErr } = await supabase
          .from("metas_vendedor")
          .select("id, vendedor_id, scope")
          .eq("periodo", periodoFinal)
          .in("vendedor_id", idsParaMetas);
        if (metasPeriodoErr) throw metasPeriodoErr;

        const metaIdsMap: Record<string, string> = {};
        (metasPeriodo || []).forEach((m: any) => {
          if (m?.vendedor_id && m?.id && m?.scope !== "equipe") {
            metaIdsMap[String(m.vendedor_id)] = String(m.id);
          }
        });

        const metaIdsParaLimpar = Object.values(metaIdsMap).filter(Boolean);
        if (metaIdsParaLimpar.length > 0) {
          await supabase
            .from("metas_vendedor_produto")
            .delete()
            .in("meta_vendedor_id", metaIdsParaLimpar);
        }

        const insertsProdutos: any[] = [];
        distribuicao.forEach((item) => {
          const metaId = metaIdsMap[item.vendedor_id];
          if (!metaId) return;
          (item.meta_produtos || []).forEach((p) => {
            if (!p.produto_id || p.valor <= 0) return;
            insertsProdutos.push({
              meta_vendedor_id: metaId,
              produto_id: p.produto_id,
              valor: p.valor,
            });
          });
        });

        if (insertsProdutos.length > 0) {
          const { error: prodErr } = await supabase
            .from("metas_vendedor_produto")
            .insert(insertsProdutos);
          if (prodErr) throw prodErr;
        }
      }

      await carregarMetas(vendedorSelecionado);
      await carregarResumoEquipe(periodoEquipe);
      setMostrarFormularioMetaLoja(false);
      setEditandoMetaEquipe(false);
      setSucessoEquipe(true);
    } catch (e: any) {
      console.error(e);
      setErroEquipe("Erro ao salvar meta da loja.");
    } finally {
      setSalvandoEquipe(false);
    }
  }

  async function salvarMeta(e: React.FormEvent) {
    e.preventDefault();
    if (!usuarioPodeEditar) {
      setErro("Você não tem permissão para salvar metas.");
      return;
    }
    setErro(null);

    const vendedorAtual = vendedores.find((v) => v.id === vendedorSelecionado);
    if (!metaGeral || !vendedorSelecionado || !vendedorAtual) {
      setErro("Meta geral e vendedor são obrigatórios.");
      return;
    }

    const selecaoGestor = isGestorRole && vendedorAtual.id === usuario?.id;
    if (!isUsuarioVendedor(vendedorAtual) && !selecaoGestor) {
      setErro("Selecione um vendedor com tipo VENDEDOR.");
      return;
    }

    // Validação com parâmetros (ex.: foco líquido → exigir meta diferenciada)
    const totalDif = totalMetaDiferenciada();

    const metaGeralNum = money(metaGeral);
    const metaDifNum = totalDif;

    if (Number.isNaN(metaGeralNum)) {
      setErro("Meta geral inválida.");
      return;
    }

    // Se foco em valor líquido exigir diferenciada, garanta que há pelo menos uma linha válida
    if (parametros?.foco_valor === "liquido" && metaDifNum <= 0) {
      setErro("Quando o foco é valor líquido, informe metas diferenciadas por produto.");
      return;
    }

    const linhasValidas = metaProdutos.filter((p) => p.produto_id && money(p.valor) > 0);
    if (metaDifNum > 0 && linhasValidas.length === 0) {
      setErro("Adicione pelo menos um produto com valor para a meta diferenciada.");
      return;
    }

    try {
      setSalvando(true);

      const periodoFinal = `${periodo}-01`; // YYYY-MM-01

      const payloadBase = {
        vendedor_id: vendedorSelecionado,
        periodo: periodoFinal,
        meta_geral: metaGeralNum,
        meta_diferenciada: metaDifNum,
        ativo: ativoMeta,
        scope: "vendedor",
      } as Record<string, any>;

      let metaId = editId;

      if (editId) {
        const { error } = await supabase
          .from("metas_vendedor")
          .update(payloadBase)
          .eq("id", editId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase
          .from("metas_vendedor")
          .upsert(payloadBase, { onConflict: "vendedor_id,periodo,scope" })
          .select("id")
          .single();
        if (error) throw error;
        metaId = inserted.id;
      }

      // Sincronizar metas por produto
      const metaIdFinal = metaId!;
      await supabase
        .from("metas_vendedor_produto")
        .delete()
        .eq("meta_vendedor_id", metaIdFinal);

      if (linhasValidas.length > 0) {
        const detalhesInsert = linhasValidas.map((p) => ({
          meta_vendedor_id: metaIdFinal,
          produto_id: p.produto_id,
          valor: money(p.valor),
        }));
        const { error: detError } = await supabase
          .from("metas_vendedor_produto")
          .insert(detalhesInsert);
        if (detError) throw detError;
      }

      await carregarMetas(vendedorSelecionado);
      await carregarResumoEquipe(periodoEquipe);

      limparFormulario();
    } catch (e: any) {
      console.error(e);
      setErro(e?.message ? `Erro ao salvar meta: ${e.message}` : "Erro ao salvar meta.");
    } finally {
      setSalvando(false);
    }
  }

  function limparFormulario() {
    setMetaGeral("");
    setMetaProdutos([]);
    setMostrarMetaProdutos(false);
    setEditId(null);
    setAtivoMeta(true);
  }

  function abrirFormularioMeta() {
    limparFormulario();
    setMostrarFormularioMetaLoja(false);
    setMostrarFormularioMeta(true);
    setErro(null);
  }

  function fecharFormularioMeta() {
    limparFormulario();
    setMostrarFormularioMeta(false);
    setErro(null);
  }

  function iniciarEdicao(m: Meta) {
    setEditId(m.id);
    setPeriodo(m.periodo.slice(0, 7));
    setMetaGeral(formatMoneyForInput(m.meta_geral, 2));

    const detalhes = detalhesMetas[m.id] || [];
    if (detalhes.length > 0) {
      setMetaProdutos(
        detalhes.map((d) => ({
          produto_id: d.produto_id,
          valor: formatMoneyForInput(d.valor, 2),
        }))
      );
      setMostrarMetaProdutos(true);
    } else {
      setMetaProdutos([]);
      setMostrarMetaProdutos(false);
    }

    setAtivoMeta(m.ativo);
    setMostrarFormularioMeta(true);
    setErro(null);
  }

  function iniciarEdicaoMetaLoja() {
    if (!metaLojaPeriodo) {
      setErroEquipe("Nenhuma meta da loja cadastrada para este período.");
      return;
    }

    setPeriodoEquipe(metaLojaPeriodo.periodo.slice(0, 7));
    setMetaEquipeGeral(formatMoneyForInput(metaLojaPeriodo.meta_geral, 2));
    setAtivoEquipe(metaLojaPeriodo.ativo);

    const detalhes = detalhesEquipePeriodo[metaLojaPeriodo.id] || [];
    if (detalhes.length > 0) {
      setMetaEquipeProdutos(
        detalhes.map((d) => ({
          produto_id: d.produto_id,
          valor: formatMoneyForInput(d.valor, 2),
        }))
      );
      setMostrarMetaEquipeProdutos(true);
    } else {
      setMetaEquipeProdutos([]);
      setMostrarMetaEquipeProdutos(false);
    }

    if (isGestorRole) {
      const gestorId = usuario?.id || "";
      const metaGestorRow =
        gestorId && metasEquipePeriodo.length > 0
          ? metasEquipePeriodo.find((m) => m.vendedor_id === gestorId)
          : null;
      const gestorParticipaDetectado = Boolean(metaGestorRow);
      setGestorParticipa(gestorParticipaDetectado);
      setMetaGestor(metaGestorRow ? formatMoneyForInput(metaGestorRow.meta_geral, 2) : "");
    } else {
      setGestorParticipa(false);
      setMetaGestor("");
    }

    setErroEquipe(null);
    setEditandoMetaEquipe(true);
    setMostrarFormularioMeta(false);
    setMostrarFormularioMetaLoja(true);
  }

  function iniciarEdicaoEquipe(m: Meta) {
    setEditId(m.id);
    setPeriodo(m.periodo.slice(0, 7));
    setMetaGeral(formatMoneyForInput(m.meta_geral, 2));
    const detalhes = detalhesEquipePeriodo[m.id] || [];
    if (detalhes.length > 0) {
      setMetaProdutos(
        detalhes.map((d) => ({
          produto_id: d.produto_id,
          valor: formatMoneyForInput(d.valor, 2),
        }))
      );
      setMostrarMetaProdutos(true);
    } else {
      setMetaProdutos([]);
      setMostrarMetaProdutos(false);
    }
    setAtivoMeta(m.ativo);
    setVendedorSelecionado(m.vendedor_id);
    setMostrarFormularioMetaLoja(false);
    setMostrarFormularioMeta(true);
    setErro(null);
  }

  async function toggleAtivo(id: string, ativo: boolean) {
    if (!usuarioPodeEditar) {
      setErro("Você não tem permissão para alterar o status da meta.");
      return;
    }
    try {
      const { error } = await supabase
        .from("metas_vendedor")
        .update({ ativo: !ativo })
        .eq("id", id);
      if (error) throw error;
      await carregarMetas(vendedorSelecionado);
      if (podeGerenciarMetasEquipe) {
        await carregarResumoEquipe(periodoEquipe);
      }
    } catch (e) {
      setErro("Não foi possível alterar status da meta.");
    }
  }

  async function excluirMeta(id: string) {
    if (!usuarioPodeEditar) {
      setErro("Você não tem permissão para excluir metas.");
      return;
    }
    const { error } = await supabase
      .from("metas_vendedor")
      .delete()
      .eq("id", id);

    if (error) {
      setErro("Não foi possível excluir meta.");
      return;
    }

    await carregarMetas(vendedorSelecionado);
    if (podeGerenciarMetasEquipe) {
      await carregarResumoEquipe(periodoEquipe);
    }
  }

  function solicitarExclusaoMeta(meta: Meta) {
    if (!usuarioPodeEditar) {
      setErro("Você não tem permissão para excluir metas.");
      return;
    }
    setMetaParaExcluir(meta);
  }

  async function confirmarExclusaoMeta() {
    if (!metaParaExcluir) return;
    await excluirMeta(metaParaExcluir.id);
    setMetaParaExcluir(null);
  }

  // =============================================
  // UI
  // =============================================

  if (loadingPerm || loadingMeta) return <LoadingUsuarioContext />;
  if (!podeVer) return <div>Acesso ao módulo de Metas bloqueado.</div>;

  const metasExibidas = isVendedorOnly ? listaMetas : listaMetas.slice(0, 5);
  const metaEquipeTotalNum = money(metaEquipeGeral);
  const metaGestorNum = gestorParticipa ? money(metaGestor) : 0;
  const equipeCount = equipeIds.length;
  const metaPorVendedor =
    equipeCount > 0 ? (metaEquipeTotalNum - metaGestorNum) / equipeCount : 0;
  const formatarValor = (valor: number) => formatCurrencyBRL(valor);

  return (
    <AppPrimerProvider>
      <div className="min-h-screen bg-slate-50 p-2 md:p-6 metas-page">
      <AppToolbar
        className="mb-3"
        sticky
        tone="info"
        title="Metas de vendedor"
        subtitle="Gerencie metas da loja e metas individuais por período."
      />
      {isVendedorOnly && (
        <AlertMessage variant="info" className="mb-2">
          Metas são definidas pelo gestor da equipe. Abaixo estão as metas atribuídas a você.
        </AlertMessage>
      )}
      {erro && !mostrarFormularioMeta && (
        <AlertMessage variant="error" className="mb-3">
          <strong>{erro}</strong>
        </AlertMessage>
      )}

      {podeGerenciarMetasEquipe && (
        <AppCard className="card-blue mb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-end">
            <h3 className="text-center sm:text-left">Meta da Loja</h3>
            {usuarioPodeEditar && !mostrarFormularioMetaLoja && (
              <AppButton
                type="button"
                className="w-full sm:w-auto"
                variant="primary"
                onClick={() => {
                  limparFormularioEquipe();
                  setMostrarFormularioMeta(false);
                  setMostrarFormularioMetaLoja(true);
                }}
              >
                Adicionar Metas
              </AppButton>
            )}
          </div>

          {!mostrarFormularioMetaLoja && (
            <p style={{ opacity: 0.8, marginTop: 8 }}>
              Defina a meta total do período e, se desejar, divida igualmente entre os vendedores.
            </p>
          )}

          {mostrarFormularioMetaLoja && (
            <>
              <p style={{ opacity: 0.8, marginBottom: 12, marginTop: 12 }}>
                Defina a meta total do período e deixe o sistema dividir entre os vendedores (opcional).
              </p>
              <form onSubmit={salvarMetaLoja}>
                <div className={`meta-equipe-row${gestorParticipa ? " meta-equipe-row-gestor" : ""}`}>
                  <div className="form-group">
                    <label className="form-label">Período *</label>
                    <select
                      className="form-select w-full"
                      value={periodoEquipe}
                      onChange={(e) => setPeriodoEquipe(e.target.value)}
                    >
                      {monthOptions.map((value) => (
                        <option key={value} value={value}>
                          {formatMonthYearBR(value)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Meta geral (R$) *</label>
                    <input
                      className="form-input"
                      type="text"
                      value={metaEquipeGeral}
                      onChange={(e) => setMetaEquipeGeral(sanitizeMoneyInput(e.target.value))}
                      onBlur={() => setMetaEquipeGeral(normalizeMoneyInput(metaEquipeGeral))}
                      inputMode="decimal"
                      placeholder="0,00"
                    />
                  </div>

                  {isGestorRole && (
                    <div className="form-group">
                      <label className="form-label">Gestor participa?</label>
                      <select
                        className="form-select"
                        value={gestorParticipa ? "true" : "false"}
                        onChange={(e) => setGestorParticipa(e.target.value === "true")}
                      >
                        <option value="false">Não</option>
                        <option value="true">Sim</option>
                      </select>
                    </div>
                  )}

                  {isGestorRole && gestorParticipa && (
                    <div className="form-group">
                      <label className="form-label">Meta do gestor (R$)</label>
                      <input
                        className="form-input"
                        type="text"
                        value={metaGestor}
                        onChange={(e) => setMetaGestor(sanitizeMoneyInput(e.target.value))}
                        onBlur={() => setMetaGestor(normalizeMoneyInput(metaGestor))}
                        inputMode="decimal"
                        placeholder="0,00"
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Dividir a meta igualmente por vendedor?</label>
                    <select
                      className="form-select"
                      value={dividirMetaIgual ? "true" : "false"}
                      onChange={(e) => setDividirMetaIgual(e.target.value === "true")}
                    >
                      <option value="true">Sim</option>
                      <option value="false">Não</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Ativa?</label>
                    <select
                      className="form-select"
                      value={ativoEquipe ? "true" : "false"}
                      onChange={(e) => setAtivoEquipe(e.target.value === "true")}
                    >
                      <option value="true">Sim</option>
                      <option value="false">Não</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Metas diferenciadas por produto?</label>
                    <select
                      className="form-select"
                      value={mostrarMetaEquipeProdutos ? "sim" : "nao"}
                      onChange={(e) => {
                        const next = e.target.value === "sim";
                        setMostrarMetaEquipeProdutos(next);
                        if (!next) setMetaEquipeProdutos([]);
                      }}
                    >
                      <option value="nao">Não</option>
                      <option value="sim">Sim</option>
                    </select>
                  </div>
                </div>

                {mostrarMetaEquipeProdutos && (
                  <div className="meta-produtos-section">
                    {metaEquipeProdutos.map((mp, idx) => (
                      <div className="meta-produtos-row" key={idx}>
                        <div className="form-group min-w-[160px]">
                          <label className="form-label">Produto</label>
                          <select
                            className="form-select"
                            value={mp.produto_id}
                            onChange={(e) => {
                              const copia = [...metaEquipeProdutos];
                              copia[idx] = { ...copia[idx], produto_id: e.target.value };
                              setMetaEquipeProdutos(copia);
                            }}
                          >
                            <option value="">Selecione</option>
                            {produtos.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nome}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="form-group min-w-[140px]">
                          <label className="form-label">Meta (R$)</label>
                          <input
                            className="form-input"
                            type="text"
                            inputMode="decimal"
                            value={mp.valor}
                            onChange={(e) => {
                              const copia = [...metaEquipeProdutos];
                              copia[idx] = { ...copia[idx], valor: sanitizeMoneyInput(e.target.value) };
                              setMetaEquipeProdutos(copia);
                            }}
                            onBlur={() => {
                              const copia = [...metaEquipeProdutos];
                              copia[idx] = { ...copia[idx], valor: normalizeMoneyInput(copia[idx]?.valor || "") };
                              setMetaEquipeProdutos(copia);
                            }}
                            placeholder="0,00"
                          />
                        </div>
                        <div className="form-group meta-produtos-remove">
                          <AppButton
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              setMetaEquipeProdutos(metaEquipeProdutos.filter((_, i) => i !== idx));
                            }}
                          >
                            Remover
                          </AppButton>
                        </div>
                      </div>
                    ))}
                    <div className="meta-produtos-actions">
                      <AppButton
                        type="button"
                        variant="primary"
                        onClick={() =>
                          setMetaEquipeProdutos([
                            ...metaEquipeProdutos,
                            { produto_id: "", valor: "" },
                          ])
                        }
                      >
                        + Adicionar produto
                      </AppButton>
                      <div className="meta-produtos-total">
                        Total diferenciada: {formatCurrencyBRL(totalMetaEquipeDiferenciada())}
                      </div>
                    </div>
                    {parametros?.foco_valor === "liquido" && (
                      <small style={{ color: "#f97316" }}>
                        Foco em valor líquido ativo: informe metas diferenciadas por produto.
                      </small>
                    )}
                  </div>
                )}

                {dividirMetaIgual && (
                  <AppCard className="card-config mt-3">
                    <div style={{ fontWeight: 600 }}>
                      Equipe: {equipeCount} vendedor(es)
                    </div>
                    <div style={{ fontSize: "0.85rem", opacity: 0.8 }}>
                      Meta por vendedor:{" "}
                      {Number.isFinite(metaPorVendedor) ? formatCurrencyBRL(metaPorVendedor) : "—"}
                    </div>
                    {totalMetaEquipeDiferenciada() > 0 && (
                      <div style={{ fontSize: "0.8rem", opacity: 0.75 }}>
                        Meta diferenciada por vendedor:{" "}
                        {formatCurrencyBRL(
                          equipeCount > 0 ? totalMetaEquipeDiferenciada() / equipeCount : 0
                        )}
                      </div>
                    )}
                  </AppCard>
                )}

                {erroEquipe && (
                  <AlertMessage variant="error" className="mb-2 mt-2">
                    <strong>{erroEquipe}</strong>
                  </AlertMessage>
                )}

                <div
                  className="mobile-stack-buttons"
                  style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}
                >
                  <AppButton type="submit" variant="primary" disabled={salvandoEquipe}>
                    {salvandoEquipe
                      ? "Salvando..."
                      : editandoMetaEquipe
                      ? "Salvar alterações"
                      : "Salvar"}
                  </AppButton>
                  <AppButton
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      limparFormularioEquipe();
                      setMostrarFormularioMetaLoja(false);
                    }}
                    disabled={salvandoEquipe}
                  >
                    Cancelar
                  </AppButton>
                </div>
              </form>
            </>
          )}
        </AppCard>
      )}

      {usuarioPodeEditar && (
        <AppCard className={`card-blue mb-3${mostrarFormularioMeta ? " form-card" : ""}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-end">
            <h3 className="text-center sm:text-left">Metas individuais por vendedor</h3>
            {!mostrarFormularioMeta && (
              <AppButton
                type="button"
                className="w-full sm:w-auto"
                variant="primary"
                onClick={abrirFormularioMeta}
              >
                Adicionar Metas
              </AppButton>
            )}
          </div>

          {!mostrarFormularioMeta && (
            <p style={{ opacity: 0.8, marginTop: 8 }}>
              Cadastre metas individuais para um vendedor específico.
            </p>
          )}

          {mostrarFormularioMeta && (
            <form onSubmit={salvarMeta}>
              <div className="flex flex-col md:flex-row gap-4">
                {mostrarSelectVendedor && (
                  <div className="form-group flex-1 min-w-[180px]">
                    <label className="form-label">Vendedor *</label>
                    <select
                      className="form-select"
                      value={vendedorSelecionado}
                      onChange={(e) => setVendedorSelecionado(e.target.value)}
                    >
                      {vendedores.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nome_completo}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="form-group flex-1 min-w-[180px]">
                  <label className="form-label">Período *</label>
                  <select className="form-select w-full" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                    {monthOptions.map((value) => (
                      <option key={value} value={value}>
                        {formatMonthYearBR(value)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group flex-1 min-w-[180px]">
                  <label className="form-label">Meta Geral (R$) *</label>
                  <input
                    className="form-input"
                    type="text"
                    value={metaGeral}
                    onChange={(e) => setMetaGeral(sanitizeMoneyInput(e.target.value))}
                    onBlur={() => setMetaGeral(normalizeMoneyInput(metaGeral))}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                </div>

                <div className="form-group flex-1 min-w-[220px]">
                  <label className="form-label">Metas diferenciadas por produto?</label>
                  <select
                    className="form-select"
                    value={mostrarMetaProdutos ? "sim" : "nao"}
                    onChange={(e) => {
                      const next = e.target.value === "sim";
                      setMostrarMetaProdutos(next);
                      if (!next) setMetaProdutos([]);
                    }}
                  >
                    <option value="nao">Não</option>
                    <option value="sim">Sim</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Ativa?</label>
                  <select
                    className="form-select"
                    value={ativoMeta ? "true" : "false"}
                    onChange={(e) => setAtivoMeta(e.target.value === "true")}
                  >
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                </div>
              </div>

              {mostrarMetaProdutos && (
                <div className="meta-produtos-section">
                  {metaProdutos.map((mp, idx) => (
                    <div className="meta-produtos-row" key={idx}>
                      <div className="form-group min-w-[140px]">
                        <label className="form-label">Produto</label>
                        <select
                          className="form-select"
                          value={mp.produto_id}
                          onChange={(e) => {
                            const copia = [...metaProdutos];
                            copia[idx] = { ...copia[idx], produto_id: e.target.value };
                            setMetaProdutos(copia);
                          }}
                        >
                          <option value="">Selecione</option>
                          {produtos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="form-group min-w-[120px]">
                        <label className="form-label">Meta (R$)</label>
                        <input
                          className="form-input"
                          type="text"
                          inputMode="decimal"
                          value={mp.valor}
                          onChange={(e) => {
                            const copia = [...metaProdutos];
                            copia[idx] = { ...copia[idx], valor: sanitizeMoneyInput(e.target.value) };
                            setMetaProdutos(copia);
                          }}
                          onBlur={() => {
                            const copia = [...metaProdutos];
                            copia[idx] = { ...copia[idx], valor: normalizeMoneyInput(copia[idx]?.valor || "") };
                            setMetaProdutos(copia);
                          }}
                          placeholder="0,00"
                        />
                      </div>
                      <div className="form-group meta-produtos-remove">
                        <AppButton
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setMetaProdutos(metaProdutos.filter((_, i) => i !== idx));
                          }}
                        >
                          Remover
                        </AppButton>
                      </div>
                    </div>
                  ))}
                  <div className="meta-produtos-actions">
                    <AppButton
                      type="button"
                      variant="primary"
                      onClick={() => setMetaProdutos([...metaProdutos, { produto_id: "", valor: "" }])}
                    >
                      + Adicionar produto
                    </AppButton>
                    <div className="meta-produtos-total">
                      Total diferenciada: {formatCurrencyBRL(totalMetaDiferenciada())}
                    </div>
                  </div>
                  {parametros?.foco_valor === "liquido" && (
                    <small style={{ color: "#f97316" }}>
                      Foco em valor líquido ativo: informe metas diferenciadas por produto.
                    </small>
                  )}
                </div>
              )}

              {erro && (
                <AlertMessage variant="error" className="mb-2">
                  <strong>{erro}</strong>
                </AlertMessage>
              )}

              <div
                className="mobile-stack-buttons"
                style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}
              >
                <AppButton type="submit" variant="primary" disabled={salvando}>
                  {salvando ? "Salvando..." : editId ? "Salvar alterações" : "Salvar meta"}
                </AppButton>
                <AppButton
                  type="button"
                  variant="secondary"
                  onClick={fecharFormularioMeta}
                  disabled={salvando}
                >
                  Cancelar
                </AppButton>
              </div>
            </form>
          )}
        </AppCard>
      )}

      <AppCard className="card-blue mb-2">
        <div className="flex flex-col gap-2">
          <h3 className="text-center sm:text-left">Metas cadastradas</h3>
          {podeGerenciarMetasEquipe && (
            <div className="form-group w-full">
              <label className="form-label">Período</label>
              <select
                className="form-select w-full"
                value={periodoEquipe}
                onChange={(e) => setPeriodoEquipe(e.target.value)}
              >
                {monthOptions.map((value) => (
                  <option key={value} value={value}>
                    {formatMonthYearBR(value)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {podeGerenciarMetasEquipe ? (
          <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
            <div>
              <h4 className="mb-2">Meta da Loja</h4>
              <div
                className="table-container overflow-x-auto"
                style={{ maxHeight: "45vh", overflowY: "auto" }}
              >
                <table className="table-default table-header-blue table-mobile-cards min-w-[640px]">
                  <thead>
                    <tr>
                      <th>Loja</th>
                      <th>Meta geral</th>
                      <th>Meta Produto Diferenciado</th>
                      {usuarioPodeEditar && <th>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {carregandoResumoEquipe && (
                      <tr>
                        <td colSpan={usuarioPodeEditar ? 4 : 3}>Carregando metas...</td>
                      </tr>
                    )}
                    {!carregandoResumoEquipe && !metaLojaPeriodo && (
                      <tr>
                        <td colSpan={usuarioPodeEditar ? 4 : 3}>
                          Nenhuma meta da loja cadastrada para este período.
                        </td>
                      </tr>
                    )}
                    {!carregandoResumoEquipe && metaLojaPeriodo && (() => {
                      const totalDif = (detalhesEquipePeriodo[metaLojaPeriodo.id] || []).reduce(
                        (sum, d) => sum + (d.valor || 0),
                        0
                      );
                      return (
                        <tr key={metaLojaPeriodo.id}>
                          <td data-label="Loja">{nomeLoja || "Loja"}</td>
                          <td data-label="Meta geral">{formatarValor(metaLojaPeriodo.meta_geral || 0)}</td>
                          <td data-label="Meta Produto Diferenciado">
                            {totalDif > 0 ? formatarValor(totalDif) : "—"}
                          </td>
                          {usuarioPodeEditar && (
                            <td className="th-actions" data-label="Ações">
                              <div className="action-buttons">
                                <AppButton
                                  variant="ghost"
                                  className="icon-action-btn"
                                  title="Editar"
                                  onClick={() => iniciarEdicaoMetaLoja()}
                                >
                                  ✏️
                                </AppButton>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 className="mb-2">Meta por Vendedor</h4>
              <div
                className="table-container overflow-x-auto"
                style={{ maxHeight: "65vh", overflowY: "auto" }}
              >
                <table className="table-default table-header-blue table-mobile-cards min-w-[760px]">
                  <thead>
                    <tr>
                      <th>Vendedor</th>
                      <th>Meta Individual</th>
                      <th>Meta Produto Diferenciado</th>
                      {usuarioPodeEditar && <th>Ações</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {carregandoResumoEquipe && (
                      <tr>
                        <td colSpan={usuarioPodeEditar ? 4 : 3}>Carregando metas...</td>
                      </tr>
                    )}
                    {!carregandoResumoEquipe && metasEquipePeriodo.length === 0 && (
                      <tr>
                        <td colSpan={usuarioPodeEditar ? 4 : 3}>
                          Nenhuma meta cadastrada para este período.
                        </td>
                      </tr>
                    )}
                    {!carregandoResumoEquipe &&
                      metasEquipePeriodo.map((m) => {
                        const nomeVendedor =
                          vendedores.find((v) => v.id === m.vendedor_id)?.nome_completo || "Vendedor";
                        const totalDif = (detalhesEquipePeriodo[m.id] || []).reduce(
                          (sum, d) => sum + (d.valor || 0),
                          0
                        );
                        return (
                          <tr key={m.id}>
                            <td data-label="Vendedor">{nomeVendedor}</td>
                            <td data-label="Meta Individual">{formatarValor(m.meta_geral || 0)}</td>
                            <td data-label="Meta Produto Diferenciado">
                              {totalDif > 0 ? formatarValor(totalDif) : "—"}
                            </td>
                            {usuarioPodeEditar && (
                              <td className="th-actions" data-label="Ações">
                                <div className="action-buttons">
                                  <AppButton
                                    variant="ghost"
                                    className="icon-action-btn"
                                    title="Editar"
                                    onClick={() => iniciarEdicaoEquipe(m)}
                                  >
                                    ✏️
                                  </AppButton>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="table-container overflow-x-auto"
            style={{ maxHeight: "65vh", overflowY: "auto", marginTop: 12 }}
          >
            <table className="table-default table-header-blue table-mobile-cards min-w-[880px]">
              <thead>
                <tr>
                  <th>Período</th>
                  <th>Meta Geral</th>
                  <th>Meta Diferenciada</th>
                  <th>Produtos</th>
                  <th>Ativo</th>
                  {usuarioPodeEditar && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {metasExibidas.length === 0 && (
                  <tr>
                    <td colSpan={usuarioPodeEditar ? 6 : 5}>Nenhuma meta cadastrada.</td>
                  </tr>
                )}

                {metasExibidas.map((m) => (
                  <tr key={m.id}>
                    <td data-label="Período">{formatMonthYearBR(m.periodo)}</td>
                    <td data-label="Meta Geral">{formatCurrencyBRL(m.meta_geral)}</td>
                    <td data-label="Meta Diferenciada">{formatCurrencyBRL(m.meta_diferenciada)}</td>
                    <td data-label="Produtos">
                      {(detalhesMetas[m.id] || []).length === 0
                        ? "—"
                        : (detalhesMetas[m.id] || [])
                            .map((d) => {
                              const nome = produtos.find((p) => p.id === d.produto_id)?.nome || "Produto";
                              return `${nome}: ${formatCurrencyBRL(d.valor)}`;
                            })
                            .join(" | ")}
                    </td>
                    <td data-label="Ativo">{m.ativo ? "Sim" : "Não"}</td>

                    {usuarioPodeEditar && (
                      <td className="th-actions" data-label="Ações">
                        <div className="action-buttons">
                          <AppButton
                            variant="ghost"
                            className="icon-action-btn"
                            title="Editar"
                            onClick={() => iniciarEdicao(m)}
                          >
                            ✏️
                          </AppButton>

                          <AppButton
                            variant="danger"
                            className="icon-action-btn danger"
                            title="Excluir"
                            onClick={() => solicitarExclusaoMeta(m)}
                          >
                            🗑️
                          </AppButton>
                          <AppButton
                            variant="ghost"
                            className="icon-action-btn"
                            title={m.ativo ? "Inativar" : "Ativar"}
                            onClick={() => toggleAtivo(m.id, m.ativo)}
                          >
                            {m.ativo ? "⏸️" : "▶️"}
                          </AppButton>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AppCard>
      <ConfirmDialog
        open={Boolean(metaParaExcluir)}
        title="Excluir meta"
        message={`Excluir a meta de ${
          metaParaExcluir?.periodo ? formatMonthYearBR(metaParaExcluir.periodo) : "este período"
        }?`}
        confirmLabel="Excluir"
        confirmVariant="danger"
        onCancel={() => setMetaParaExcluir(null)}
        onConfirm={confirmarExclusaoMeta}
      />
      <ConfirmDialog
        open={sucessoEquipe}
        title="Metas salvas"
        message="Metas salvas com sucesso!"
        confirmLabel="OK"
        cancelLabel="Fechar"
        onCancel={() => setSucessoEquipe(false)}
        onConfirm={() => setSucessoEquipe(false)}
      />
      </div>
    </AppPrimerProvider>
  );
}
