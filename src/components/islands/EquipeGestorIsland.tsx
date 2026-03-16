import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AlertMessage from "../ui/AlertMessage";
import { ToastStack, useToastQueue } from "../ui/Toast";
import { titleCaseWithExceptions } from "../../lib/titleCase";
import { fetchGestorEquipeVendedorIds } from "../../lib/gestorEquipe";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";

type UsuarioRow = {
  id: string;
  nome_completo: string | null;
  email: string | null;
  uso_individual: boolean;
  company_id: string | null;
  user_types?: { name: string | null } | null;
};

type RelacaoRow = {
  vendedor_id: string;
  ativo?: boolean | null;
};

type HorarioUsuario = {
  id?: string;
  usuario_id: string;
  company_id: string;
  seg_inicio: string | null;
  seg_fim: string | null;
  ter_inicio: string | null;
  ter_fim: string | null;
  qua_inicio: string | null;
  qua_fim: string | null;
  qui_inicio: string | null;
  qui_fim: string | null;
  sex_inicio: string | null;
  sex_fim: string | null;
  sab_inicio: string | null;
  sab_fim: string | null;
  dom_inicio: string | null;
  dom_fim: string | null;
  feriado_inicio: string | null;
  feriado_fim: string | null;
  auto_aplicar: boolean;
};

type ConviteRow = {
  id: string;
  invited_email: string;
  company_id: string;
  user_type_id: string | null;
  invited_by: string;
  invited_by_name: string | null;
  status: string;
  created_at: string;
  expires_at?: string | null;
};

function extractDbErrorMessage(error: unknown, fallback: string) {
  const err = (error || {}) as any;
  const msg = String(err?.message || "").trim();
  const code = String(err?.code || "").trim();
  if (msg && code) return `${fallback} (${code}): ${msg}`;
  if (msg) return `${fallback}: ${msg}`;
  return fallback;
}

const HORARIO_COLUNAS = [
  { key: "seg", label: "Seg", full: "Segunda" },
  { key: "ter", label: "Ter", full: "Terça" },
  { key: "qua", label: "Qua", full: "Quarta" },
  { key: "qui", label: "Qui", full: "Quinta" },
  { key: "sex", label: "Sex", full: "Sexta" },
  { key: "sab", label: "Sab", full: "Sábado" },
  { key: "dom", label: "Dom", full: "Domingo" },
  { key: "feriado", label: "Feriados", full: "Feriados" },
];

const HORARIO_RESUMO_COLUNAS = [
  { key: "segsex", label: "Segunda à Sexta", full: "Segunda à Sexta" },
  { key: "sab", label: "Sábado", full: "Sábado" },
  { key: "dom", label: "Domingo", full: "Domingo" },
  { key: "feriado", label: "Feriados", full: "Feriados" },
];

const DIAS_UTEIS_KEYS = ["seg", "ter", "qua", "qui", "sex"] as const;
const DIAS_UTEIS_COLUNAS = HORARIO_COLUNAS.filter((c) => DIAS_UTEIS_KEYS.includes(c.key as any));

export default function EquipeGestorIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("Equipe") || can("Parametros");
  const podeCriarEquipe =
    can("Equipe", "create") || can("Parametros", "create") || can("Equipe", "admin") || can("Parametros", "admin");
  const podeEditarEquipe =
    can("Equipe", "edit") || can("Parametros", "edit") || can("Equipe", "admin") || can("Parametros", "admin");
  const podeExcluirEquipe =
    can("Equipe", "delete") || can("Parametros", "delete") || can("Equipe", "admin") || can("Parametros", "admin");
  const podeAlterarEquipe = podeEditarEquipe || podeExcluirEquipe;
  const podeEditarHorarios = podeEditarEquipe;

  const [usuario, setUsuario] = useState<UsuarioRow | null>(null);
  const [usuariosEmpresa, setUsuariosEmpresa] = useState<UsuarioRow[]>([]);
  const [gestoresEmpresa, setGestoresEmpresa] = useState<UsuarioRow[]>([]);
  const [relacoes, setRelacoes] = useState<Record<string, boolean>>({});
  const [equipeCompartilhadaBase, setEquipeCompartilhadaBase] = useState<{
    id: string;
    nome: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [vendedorTypeId, setVendedorTypeId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoEmail, setNovoEmail] = useState("");
  const [criando, setCriando] = useState(false);
  const [convitesPendentes, setConvitesPendentes] = useState<ConviteRow[]>([]);
  const [horariosUsuario, setHorariosUsuario] = useState<Record<string, HorarioUsuario>>({});
  const [salvandoHorarioId, setSalvandoHorarioId] = useState<string | null>(null);
  const [salvandoHorarios, setSalvandoHorarios] = useState(false);
  const [detalheDiasUteis, setDetalheDiasUteis] = useState<Record<string, boolean>>({});
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  useEffect(() => {
    carregarDados();
  }, []);

  function buildHorarioPadrao(usuarioId: string, companyId: string): HorarioUsuario {
    return {
      usuario_id: usuarioId,
      company_id: companyId,
      seg_inicio: null,
      seg_fim: null,
      ter_inicio: null,
      ter_fim: null,
      qua_inicio: null,
      qua_fim: null,
      qui_inicio: null,
      qui_fim: null,
      sex_inicio: null,
      sex_fim: null,
      sab_inicio: null,
      sab_fim: null,
      dom_inicio: null,
      dom_fim: null,
      feriado_inicio: null,
      feriado_fim: null,
      auto_aplicar: false,
    };
  }

  async function carregarDados() {
    try {
      setLoading(true);
      setErro(null);

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) {
        setErro("Usuario nao autenticado.");
        setConvitesPendentes([]);
        return;
      }

      const { data: userRow, error: userErr } = await supabase
        .from("users")
        .select("id, nome_completo, email, uso_individual, company_id, user_types(name)")
        .eq("id", userId)
        .maybeSingle();
      if (userErr) throw userErr;

      const userData = (userRow as UsuarioRow) || null;
      setUsuario(userData);

      if (!userData?.company_id) {
        setErro("Seu usuario precisa estar vinculado a uma empresa.");
        setConvitesPendentes([]);
        return;
      }

      // Equipe compartilhada (opcional)
      try {
        const { data: sharedRow, error: sharedErr } = await supabase
          .from("gestor_equipe_compartilhada")
          .select("gestor_base_id")
          .eq("gestor_id", userId)
          .maybeSingle();
        if (sharedErr) {
          const code = String((sharedErr as any)?.code || "");
          if (code !== "42P01") throw sharedErr;
          setEquipeCompartilhadaBase(null);
        } else if ((sharedRow as any)?.gestor_base_id) {
          const baseId = String((sharedRow as any).gestor_base_id);
          const { data: baseUser } = await supabase
            .from("users")
            .select("id, nome_completo")
            .eq("id", baseId)
            .maybeSingle();
          setEquipeCompartilhadaBase({
            id: baseId,
            nome: (baseUser as any)?.nome_completo || null,
          });
        } else {
          setEquipeCompartilhadaBase(null);
        }
      } catch (e) {
        console.error(e);
        setEquipeCompartilhadaBase(null);
      }

      const { data: tiposData, error: tiposErr } = await supabase
        .from("user_types")
        .select("id, name");
      if (tiposErr) throw tiposErr;
      const tipoVendedor = (tiposData || []).find((t: any) =>
        String(t?.name || "").toUpperCase().includes("VENDEDOR")
      );
      setVendedorTypeId(tipoVendedor?.id || null);

      const { data: usersData, error: usersErr } = await supabase
        .from("users")
        .select("id, nome_completo, email, uso_individual, company_id, user_types(name)")
        .eq("company_id", userData.company_id)
        .order("nome_completo", { ascending: true });
      if (usersErr) throw usersErr;

      const usuariosFiltrados = (usersData || [])
        .filter((u: any) => {
          const tipo = u?.user_types?.name || "";
          return String(tipo).toUpperCase().includes("VENDEDOR");
        })
        .filter((u: any) => u.id !== userId) as UsuarioRow[];

      const gestoresFiltrados = (usersData || [])
        .filter((u: any) => {
          const tipo = u?.user_types?.name || "";
          return String(tipo).toUpperCase().includes("GESTOR");
        })
        .filter((u: any) => !u?.uso_individual) as UsuarioRow[];

      setUsuariosEmpresa(usuariosFiltrados);
      setGestoresEmpresa(gestoresFiltrados);
      await carregarConvites(userData.company_id);

      const usuariosHorarioIds = Array.from(
        new Set([
          ...gestoresFiltrados.map((u) => u.id),
          ...usuariosFiltrados.map((u) => u.id),
        ])
      );
      if (userData.company_id) {
        const horariosMap: Record<string, HorarioUsuario> = {};
        if (usuariosHorarioIds.length > 0) {
          const { data: horariosData, error: horariosErr } = await supabase
            .from("escala_horario_usuario")
            .select(
              "id, usuario_id, company_id, seg_inicio, seg_fim, ter_inicio, ter_fim, qua_inicio, qua_fim, qui_inicio, qui_fim, sex_inicio, sex_fim, sab_inicio, sab_fim, dom_inicio, dom_fim, feriado_inicio, feriado_fim, auto_aplicar"
            )
            .eq("company_id", userData.company_id)
            .in("usuario_id", usuariosHorarioIds);
          if (horariosErr) throw horariosErr;
          (horariosData || []).forEach((row: any) => {
            horariosMap[row.usuario_id] = {
              ...buildHorarioPadrao(row.usuario_id, userData.company_id as string),
              ...row,
              auto_aplicar: Boolean(row.auto_aplicar),
            };
          });
        }
        usuariosHorarioIds.forEach((id) => {
          if (!horariosMap[id]) {
            horariosMap[id] = buildHorarioPadrao(id, userData.company_id as string);
          }
        });
        setHorariosUsuario(horariosMap);
      } else {
        setHorariosUsuario({});
      }

      const map: Record<string, boolean> = {};
      const equipeIds = await fetchGestorEquipeVendedorIds(userId);
      equipeIds.forEach((id) => {
        map[id] = true;
      });
      setRelacoes(map);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar equipe.");
    } finally {
      setLoading(false);
    }
  }

  async function carregarConvites(companyId: string) {
    try {
      const { data, error } = await supabase
        .from("user_convites")
        .select("id, invited_email, company_id, user_type_id, invited_by, status, created_at, expires_at")
        .eq("status", "pending")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (error) {
        const code = String((error as any)?.code || "");
        if (code === "42P01") {
          setConvitesPendentes([]);
          return;
        }
        throw error;
      }

      const convitesRaw = (data || []) as Array<Omit<ConviteRow, "invited_by_name">>;
      const idsCriadores = Array.from(
        new Set(convitesRaw.map((item) => item.invited_by).filter(Boolean))
      );

      let criadoresMap = new Map<string, string | null>();
      if (idsCriadores.length > 0) {
        const { data: criadores } = await supabase
          .from("users")
          .select("id, nome_completo")
          .in("id", idsCriadores);
        criadoresMap = new Map(
          (criadores || []).map((u: any) => [u.id, u.nome_completo || null])
        );
      }

      setConvitesPendentes(
        convitesRaw.map((item) => ({
          ...item,
          invited_by_name: criadoresMap.get(item.invited_by) || null,
        }))
      );
    } catch (error) {
      console.error(error);
      setConvitesPendentes([]);
    }
  }

  function isGestorUser(u?: UsuarioRow | null) {
    const tipo = u?.user_types?.name || "";
    return String(tipo).toUpperCase().includes("GESTOR");
  }

  function isMasterUser(u?: UsuarioRow | null) {
    const tipo = u?.user_types?.name || "";
    return String(tipo).toUpperCase().includes("MASTER");
  }

  function isAdminUser(u?: UsuarioRow | null) {
    const tipo = u?.user_types?.name || "";
    return String(tipo).toUpperCase().includes("ADMIN");
  }

  async function criarUsuarioEquipe() {
    if (!podeCriarEquipe) {
      showToast("Voce nao tem permissao para criar usuarios da equipe.", "error");
      return;
    }
    if (!usuario?.company_id || !usuario.id) {
      showToast("Usuário sem empresa vinculada.", "error");
      return;
    }
    if (!novoEmail.trim()) {
      showToast("Informe o e-mail do usuario.", "error");
      return;
    }
    if (!vendedorTypeId) {
      showToast("Tipo VENDEDOR nao encontrado no sistema.", "error");
      return;
    }

    try {
      setCriando(true);
      const email = novoEmail.trim().toLowerCase();
      const nomeNormalizado = titleCaseWithExceptions(novoNome);

      const convitePendente = convitesPendentes.some(
        (convite) =>
          convite.invited_email.trim().toLowerCase() === email &&
          (!convite.expires_at || new Date(convite.expires_at).getTime() > Date.now())
      );
      if (convitePendente) {
        showToast("Ja existe convite pendente para este e-mail.", "warning");
        return;
      }

      const usuarioEmpresaExistente = usuariosEmpresa.some(
        (u) => (u.email || "").trim().toLowerCase() === email
      );
      if (usuarioEmpresaExistente) {
        showToast("Ja existe usuario com este e-mail na empresa.", "warning");
        return;
      }

      const resp = await fetch("/api/convites/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          company_id: usuario.company_id,
          user_type_id: vendedorTypeId,
          nome_completo: nomeNormalizado || null,
          active: true,
        }),
      });
      if (!resp.ok) {
        const msg = await resp.text();
        showToast(msg || "Nao foi possivel enviar o convite.", "error");
        return;
      }

      showToast("Convite enviado! Expira em 1 hora.", "success");
      setNovoEmail("");
      setNovoNome("");
      setCreateOpen(false);
      await carregarDados();
    } catch (e) {
      console.error(e);
      showToast("Erro ao criar usuario da equipe.", "error");
    } finally {
      setCriando(false);
    }
  }

  async function toggleEquipe(userId: string) {
    if (!podeAlterarEquipe) {
      showToast("Voce nao tem permissao para editar a equipe.", "error");
      return;
    }
    if (!usuario?.id) return;
    if (equipeCompartilhadaBase) {
      showToast(
        "Sua equipe está compartilhada. Edite a equipe pelo gestor base ou pelo Master.",
        "warning"
      );
      return;
    }
    setSalvandoId(userId);
    const ativoAtual = Boolean(relacoes[userId]);

    try {
      if (ativoAtual) {
        const { error } = await supabase
          .from("gestor_vendedor")
          .delete()
          .eq("gestor_id", usuario.id)
          .eq("vendedor_id", userId);
        if (error) throw error;
        setRelacoes((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
        showToast("Vendedor removido da equipe.", "success");
      } else {
        await supabase
          .from("gestor_vendedor")
          .delete()
          .eq("gestor_id", usuario.id)
          .eq("vendedor_id", userId);
        const { error } = await supabase
          .from("gestor_vendedor")
          .insert({ gestor_id: usuario.id, vendedor_id: userId, ativo: true });
        if (error) throw error;
        setRelacoes((prev) => ({ ...prev, [userId]: true }));
        showToast("Vendedor adicionado à equipe.", "success");
      }
    } catch (e) {
      console.error(e);
      showToast("Erro ao atualizar equipe.", "error");
    } finally {
      setSalvandoId(null);
    }
  }

  function updateHorarioCampo(
    userId: string,
    campo: keyof HorarioUsuario,
    valor: string | boolean | null
  ) {
    if (!podeEditarHorarios) return;
    if (!usuario?.company_id) return;
    setHorariosUsuario((prev) => {
      const atual = prev[userId] || buildHorarioPadrao(userId, usuario.company_id as string);
      return {
        ...prev,
        [userId]: {
          ...atual,
          [campo]: valor,
        },
      };
    });
  }

  function updateHorarioDiasUteis(userId: string, inicio: string | null, fim: string | null) {
    if (!podeEditarHorarios) return;
    setHorariosUsuario((prev) => {
      const atual = prev[userId] || buildHorarioPadrao(userId, usuario?.company_id as string);
      const next = { ...atual };
      DIAS_UTEIS_KEYS.forEach((key) => {
        const inicioKey = `${key}_inicio` as keyof HorarioUsuario;
        const fimKey = `${key}_fim` as keyof HorarioUsuario;
        next[inicioKey] = inicio;
        next[fimKey] = fim;
      });
      return { ...prev, [userId]: next };
    });
  }

  function diasUteisUniformes(horario: HorarioUsuario) {
    const baseInicio = horario.seg_inicio || null;
    const baseFim = horario.seg_fim || null;
    return DIAS_UTEIS_KEYS.every((key) => {
      const inicioKey = `${key}_inicio` as keyof HorarioUsuario;
      const fimKey = `${key}_fim` as keyof HorarioUsuario;
      return (horario[inicioKey] || null) === baseInicio && (horario[fimKey] || null) === baseFim;
    });
  }

  function toggleDetalheDiasUteis(userId: string) {
    setDetalheDiasUteis((prev) => ({ ...prev, [userId]: !prev[userId] }));
  }

  async function salvarHorarioUsuario(userId: string) {
    if (!podeEditarHorarios) {
      showToast("Voce nao tem permissao para editar horarios.", "error");
      return;
    }
    if (!usuario?.company_id) return;
    const horario = horariosUsuario[userId];
    if (!horario) return;
    const horarioSemId = { ...horario };
    delete (horarioSemId as any).id;
    try {
      setSalvandoHorarioId(userId);
      const payload: HorarioUsuario = {
        ...buildHorarioPadrao(userId, usuario.company_id),
        ...horarioSemId,
        usuario_id: userId,
        company_id: usuario.company_id,
        auto_aplicar: Boolean(horarioSemId.auto_aplicar),
        seg_inicio: horarioSemId.seg_inicio || null,
        seg_fim: horarioSemId.seg_fim || null,
        ter_inicio: horarioSemId.ter_inicio || null,
        ter_fim: horarioSemId.ter_fim || null,
        qua_inicio: horarioSemId.qua_inicio || null,
        qua_fim: horarioSemId.qua_fim || null,
        qui_inicio: horarioSemId.qui_inicio || null,
        qui_fim: horarioSemId.qui_fim || null,
        sex_inicio: horarioSemId.sex_inicio || null,
        sex_fim: horarioSemId.sex_fim || null,
        sab_inicio: horarioSemId.sab_inicio || null,
        sab_fim: horarioSemId.sab_fim || null,
        dom_inicio: horarioSemId.dom_inicio || null,
        dom_fim: horarioSemId.dom_fim || null,
        feriado_inicio: horarioSemId.feriado_inicio || null,
        feriado_fim: horarioSemId.feriado_fim || null,
      };

      const { data, error } = await supabase
        .from("escala_horario_usuario")
        .upsert(payload, { onConflict: "usuario_id" })
        .select(
          "id, usuario_id, company_id, seg_inicio, seg_fim, ter_inicio, ter_fim, qua_inicio, qua_fim, qui_inicio, qui_fim, sex_inicio, sex_fim, sab_inicio, sab_fim, dom_inicio, dom_fim, feriado_inicio, feriado_fim, auto_aplicar"
        )
        .single();
      if (error) throw error;

      setHorariosUsuario((prev) => ({
        ...prev,
        [userId]: {
          ...payload,
          ...data,
          auto_aplicar: Boolean((data as any)?.auto_aplicar),
        },
      }));
      showToast("Horário salvo.", "success");
    } catch (e) {
      console.error(e);
      showToast(extractDbErrorMessage(e, "Erro ao salvar horario"), "error");
    } finally {
      setSalvandoHorarioId(null);
    }
  }

  async function salvarTodosHorarios() {
    if (!podeEditarHorarios) {
      showToast("Voce nao tem permissao para editar horarios.", "error");
      return;
    }
    if (!usuario?.company_id) return;
    const usuariosHorario = Array.from(
      new Map(
        [...gestoresEmpresa, ...usuariosEmpresa].map((u) => [u.id, u])
      ).values()
    );
    if (usuariosHorario.length === 0) return;
    try {
      setSalvandoHorarios(true);
      const payload = usuariosHorario.map((u) => {
        const horario = horariosUsuario[u.id] || buildHorarioPadrao(u.id, usuario.company_id);
        const horarioSemId = { ...horario };
        delete (horarioSemId as any).id;
        return {
          ...buildHorarioPadrao(u.id, usuario.company_id),
          ...horarioSemId,
          usuario_id: u.id,
          company_id: usuario.company_id,
          auto_aplicar: Boolean(horarioSemId.auto_aplicar),
          seg_inicio: horarioSemId.seg_inicio || null,
          seg_fim: horarioSemId.seg_fim || null,
          ter_inicio: horarioSemId.ter_inicio || null,
          ter_fim: horarioSemId.ter_fim || null,
          qua_inicio: horarioSemId.qua_inicio || null,
          qua_fim: horarioSemId.qua_fim || null,
          qui_inicio: horarioSemId.qui_inicio || null,
          qui_fim: horarioSemId.qui_fim || null,
          sex_inicio: horarioSemId.sex_inicio || null,
          sex_fim: horarioSemId.sex_fim || null,
          sab_inicio: horarioSemId.sab_inicio || null,
          sab_fim: horarioSemId.sab_fim || null,
          dom_inicio: horarioSemId.dom_inicio || null,
          dom_fim: horarioSemId.dom_fim || null,
          feriado_inicio: horarioSemId.feriado_inicio || null,
          feriado_fim: horarioSemId.feriado_fim || null,
        };
      });

      const { data, error } = await supabase
        .from("escala_horario_usuario")
        .upsert(payload, { onConflict: "usuario_id" })
        .select(
          "id, usuario_id, company_id, seg_inicio, seg_fim, ter_inicio, ter_fim, qua_inicio, qua_fim, qui_inicio, qui_fim, sex_inicio, sex_fim, sab_inicio, sab_fim, dom_inicio, dom_fim, feriado_inicio, feriado_fim, auto_aplicar"
        );
      if (error) throw error;

      setHorariosUsuario((prev) => {
        const next = { ...prev };
        (data || []).forEach((row: any) => {
          next[row.usuario_id] = {
            ...buildHorarioPadrao(row.usuario_id, usuario.company_id as string),
            ...row,
            auto_aplicar: Boolean(row.auto_aplicar),
          };
        });
        return next;
      });
      showToast("Horários salvos para toda a equipe.", "success");
    } catch (e) {
      console.error(e);
      showToast(extractDbErrorMessage(e, "Erro ao salvar horarios"), "error");
    } finally {
      setSalvandoHorarios(false);
    }
  }

  const usuariosFiltrados = useMemo(() => {
    if (!busca.trim()) return usuariosEmpresa;
    const term = busca.trim().toLowerCase();
    return usuariosEmpresa.filter((u) => {
      const nome = (u.nome_completo || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      return nome.includes(term) || email.includes(term);
    });
  }, [busca, usuariosEmpresa]);

  const gestoresFiltrados = useMemo(() => {
    if (!busca.trim()) return gestoresEmpresa;
    const term = busca.trim().toLowerCase();
    return gestoresEmpresa.filter((u) => {
      const nome = (u.nome_completo || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      return nome.includes(term) || email.includes(term);
    });
  }, [busca, gestoresEmpresa]);

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">Você não possui acesso aos parâmetros.</AppCard>
      </AppPrimerProvider>
    );
  }

  if (!usuario) return null;

  if (!isGestorUser(usuario) && !isMasterUser(usuario) && !isAdminUser(usuario) && !podeVer) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">Apenas gestores, master ou usuarios com permissao podem definir equipes.</AppCard>
      </AppPrimerProvider>
    );
  }

  if (usuario.uso_individual) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">Usuários em plano individual não possuem equipe.</AppCard>
      </AppPrimerProvider>
    );
  }
  if (!vendedorTypeId) {
    return (
      <AppPrimerProvider>
        <AppCard tone="config">Tipo de usuário VENDEDOR não configurado. Cadastre em user_types.</AppCard>
      </AppPrimerProvider>
    );
  }

  return (
    <AppPrimerProvider>
      <div className="mt-6 gestor-page vtur-legacy-module">
        <AppCard
          className="mb-3 list-toolbar-sticky"
          tone="info"
          title="Equipe do gestor"
          subtitle="Gerencie os vendedores vinculados à sua empresa."
          actions={
            <div className="vtur-card-toolbar-actions">
              <span className="vtur-inline-status">{Object.keys(relacoes).length} vendedor(es) atribuídos</span>
              {podeCriarEquipe ? (
                <AppButton type="button" variant="primary" onClick={() => setCreateOpen(true)}>
                  Novo usuário
                </AppButton>
              ) : (
                <span className="text-sm opacity-70">Somente leitura</span>
              )}
            </div>
          }
        />

      {erro && (
        <div className="mb-3 mt-3">
          <AlertMessage variant="error">{erro}</AlertMessage>
        </div>
      )}
      {equipeCompartilhadaBase && (
        <div className="mb-3 mt-3">
          <AlertMessage variant="info">
            Sua equipe está compartilhada com{" "}
            <strong>{equipeCompartilhadaBase.nome || "outro gestor"}</strong>. Para evitar
            duplicidade, a edição da equipe fica concentrada no gestor base / Master.
          </AlertMessage>
        </div>
      )}

      {loading ? (
        <AppCard tone="config" className="mt-3">Carregando equipe...</AppCard>
      ) : (
        <>
          {createOpen && podeCriarEquipe && (
            <AppCard
              className="mt-3"
              tone="config"
              title="Cadastrar usuário da equipe"
              actions={
                <AppButton type="button" variant="default" onClick={() => setCreateOpen(false)}>
                  Fechar
                </AppButton>
              }
            >
              <div className="vtur-card-form-grid vtur-form-grid-2">
                <AppField
                  label="Nome completo"
                  placeholder="Nome do vendedor"
                  value={novoNome}
                  onChange={(e) => setNovoNome(e.target.value)}
                  onBlur={(e) => setNovoNome(titleCaseWithExceptions(e.target.value))}
                />
                <AppField
                  as="input"
                  type="email"
                  label="E-mail *"
                  placeholder="email@empresa.com"
                  value={novoEmail}
                  onChange={(e) => setNovoEmail(e.target.value.toLowerCase())}
                  required
                  caption="Será enviado um e-mail para confirmação."
                />
              </div>
              <div className="vtur-form-actions">
                <AppButton type="button" variant="primary" onClick={criarUsuarioEquipe} disabled={criando}>
                  {criando ? "Enviando..." : "Enviar convite"}
                </AppButton>
              </div>
            </AppCard>
          )}

          <AppCard
            className="mb-3"
            tone="config"
            title="Convites pendentes"
            subtitle="Usuários convidados que ainda não finalizaram o perfil."
          >
            <div className="table-container overflow-x-auto" style={{ marginTop: 12 }}>
              <table className="table-default table-header-blue table-mobile-cards min-w-[780px]">
                <thead>
                  <tr>
                    <th>E-mail</th>
                    <th>Criado por</th>
                    <th>Data</th>
                    <th>Expira em</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {convitesPendentes.length === 0 && (
                    <tr>
                      <td colSpan={5}>Nenhum convite pendente na empresa.</td>
                    </tr>
                  )}
                  {convitesPendentes.map((convite) => (
                    <tr key={convite.id}>
                      <td data-label="E-mail">{convite.invited_email}</td>
                      <td data-label="Criado por">{convite.invited_by_name || "-"}</td>
                      <td data-label="Data">
                        {new Date(convite.created_at).toLocaleString("pt-BR")}
                      </td>
                      <td data-label="Expira em">
                        {convite.expires_at
                          ? new Date(convite.expires_at).toLocaleString("pt-BR")
                          : "-"}
                      </td>
                      <td data-label="Status">
                        {convite.expires_at && new Date(convite.expires_at).getTime() <= Date.now()
                          ? "Expirado"
                          : "Pendente"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </AppCard>

          <AppCard className="mb-3" tone="info">
            <AppField
              label="Buscar usuário"
              placeholder="Nome ou e-mail..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              caption="Apenas usuários corporativos da sua empresa aparecem aqui."
            />
          </AppCard>

          <div className="table-container overflow-x-auto">
            <table className="table-default table-header-blue table-mobile-cards min-w-[720px]">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>E-mail</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  {podeAlterarEquipe && <th className="th-actions">Ações</th>}
                </tr>
              </thead>
              <tbody>
                {usuariosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={podeAlterarEquipe ? 5 : 4}>Nenhum vendedor encontrado.</td>
                  </tr>
                )}
                {usuariosFiltrados.map((u) => {
                  const ativo = Boolean(relacoes[u.id]);
                  const salvando = salvandoId === u.id;
                  const labelAcao = salvando
                    ? "Salvando..."
                    : ativo
                    ? "Remover da equipe"
                    : "Adicionar à equipe";
                  const iconAcaoClass = salvando
                    ? "pi pi-clock"
                    : ativo
                    ? "pi pi-minus-circle"
                    : "pi pi-plus-circle";
                  return (
                    <tr key={u.id}>
                      <td data-label="Nome">{u.nome_completo || "—"}</td>
                      <td data-label="E-mail">{u.email || "—"}</td>
                      <td data-label="Tipo">{u.user_types?.name || "—"}</td>
                      <td data-label="Status">
                        <span
                          className="font-bold"
                          style={{ color: ativo ? "#16a34a" : "#64748b" }}
                        >
                          {ativo ? "Na equipe" : "Fora da equipe"}
                        </span>
                      </td>
                      {podeAlterarEquipe && (
                        <td className="th-actions" data-label="Ações">
                          <div className="action-buttons">
                            <AppButton
                              variant={ativo ? "danger" : "ghost"}
                              className={`icon-action-btn${ativo ? " danger" : ""}`}
                              onClick={() => toggleEquipe(u.id)}
                              disabled={salvando || Boolean(equipeCompartilhadaBase)}
                              title={labelAcao}
                              aria-label={labelAcao}
                            >
                              <span aria-hidden="true">
                                <i className={iconAcaoClass} />
                              </span>
                              <span className="sr-only">{labelAcao}</span>
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

          <AppCard
            className="mt-4"
            tone="info"
            title="Horário de trabalho"
            subtitle="Defina o horário padrão por dia da semana e se deve aplicar automaticamente quando a escala for marcada como Trabalho."
            actions={
              <div className="vtur-card-toolbar-actions">
                <AppButton
                  type="button"
                  variant="primary"
                  onClick={salvarTodosHorarios}
                  disabled={
                    !podeEditarHorarios ||
                    salvandoHorarios ||
                    (usuariosEmpresa.length === 0 && gestoresEmpresa.length === 0)
                  }
                >
                  {salvandoHorarios ? "Salvando..." : "Salvar todos"}
                </AppButton>
                {!podeEditarHorarios && <span className="text-sm opacity-70">Somente leitura</span>}
              </div>
            }
          >

            <h5 className="mt-3" style={{ fontWeight: 800 }}>
              Gestores
            </h5>
            <div className="table-container overflow-x-auto" style={{ marginTop: 12 }}>
              <table className="table-default table-header-blue table-mobile-cards escala-horario-table min-w-[820px]">
                <thead>
                  <tr>
                    <th>Gestor</th>
                    {HORARIO_RESUMO_COLUNAS.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                    <th>Atribuir automaticamente na Escala?</th>
                    <th className="th-actions">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {gestoresFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={HORARIO_RESUMO_COLUNAS.length + 3}>
                        Nenhum gestor encontrado.
                      </td>
                    </tr>
                  )}
                  {gestoresFiltrados.map((u) => {
                    const horario =
                      horariosUsuario[u.id] ||
                      buildHorarioPadrao(u.id, usuario.company_id || "");
                    const inicioUteis = horario.seg_inicio || "";
                    const fimUteis = horario.seg_fim || "";
                    const detalheAberto = Boolean(detalheDiasUteis[u.id]);
                    const salvando = salvandoHorarioId === u.id;
                    return (
                      <React.Fragment key={`horario-gestor-${u.id}`}>
                        <tr>
                          <td data-label="Gestor">{u.nome_completo || "—"}</td>
                          {HORARIO_RESUMO_COLUNAS.map((col) => {
                            if (col.key === "segsex") {
                              return (
                                <td key={`${u.id}-segsex`} data-label={col.full}>
                                  <div className="time-pair">
                                    <input
                                      type="time"
                                      className="form-input"
                                      value={inicioUteis}
                                      disabled={!podeEditarHorarios}
                                      onChange={(e) =>
                                        updateHorarioDiasUteis(
                                          u.id,
                                          e.target.value || null,
                                          fimUteis || null
                                        )
                                      }
                                      aria-label={`${col.full} inicio`}
                                    />
                                    <span className="time-sep">—</span>
                                    <input
                                      type="time"
                                      className="form-input"
                                      value={fimUteis}
                                      disabled={!podeEditarHorarios}
                                      onChange={(e) =>
                                        updateHorarioDiasUteis(
                                          u.id,
                                          inicioUteis || null,
                                          e.target.value || null
                                        )
                                      }
                                      aria-label={`${col.full} fim`}
                                    />
                                    <AppButton
                                      type="button"
                                      variant="ghost"
                                      size="small"
                                      onClick={() => toggleDetalheDiasUteis(u.id)}
                                      title={
                                        detalheAberto
                                          ? "Ocultar dias úteis"
                                          : "Detalhar dias úteis"
                                      }
                                      aria-label={
                                        detalheAberto
                                          ? "Ocultar dias úteis"
                                          : "Detalhar dias úteis"
                                      }
                                    >
                                      <i className="pi pi-cog" aria-hidden="true" />
                                    </AppButton>
                                  </div>
                                </td>
                              );
                            }
                            const inicioKey = `${col.key}_inicio` as keyof HorarioUsuario;
                            const fimKey = `${col.key}_fim` as keyof HorarioUsuario;
                            const inicioVal = (horario[inicioKey] as string | null) || "";
                            const fimVal = (horario[fimKey] as string | null) || "";
                            return (
                              <td key={`${u.id}-${col.key}`} data-label={col.full}>
                                <div className="time-pair">
                                  <input
                                    type="time"
                                    className="form-input"
                                    value={inicioVal}
                                    disabled={!podeEditarHorarios}
                                    onChange={(e) =>
                                      updateHorarioCampo(
                                        u.id,
                                        inicioKey,
                                        e.target.value || null
                                      )
                                    }
                                    aria-label={`${col.full} inicio`}
                                  />
                                  <span className="time-sep">—</span>
                                  <input
                                    type="time"
                                    className="form-input"
                                    value={fimVal}
                                    disabled={!podeEditarHorarios}
                                    onChange={(e) =>
                                      updateHorarioCampo(u.id, fimKey, e.target.value || null)
                                    }
                                    aria-label={`${col.full} fim`}
                                  />
                                </div>
                              </td>
                            );
                          })}
                          <td data-label="Auto">
                            <select
                              className="form-select"
                              value={horario.auto_aplicar ? "sim" : "nao"}
                              disabled={!podeEditarHorarios}
                              onChange={(e) =>
                                updateHorarioCampo(
                                  u.id,
                                  "auto_aplicar",
                                  e.target.value === "sim"
                                )
                              }
                            >
                              <option value="sim">Sim</option>
                              <option value="nao">Não</option>
                            </select>
                          </td>
                          <td className="th-actions" data-label="Ações">
                            <div className="action-buttons">
                              <AppButton
                                variant="primary"
                                onClick={() => salvarHorarioUsuario(u.id)}
                                disabled={!podeEditarHorarios || salvando}
                                title={salvando ? "Salvando horário" : "Salvar horário"}
                                aria-label={salvando ? "Salvando horário" : "Salvar horário"}
                              >
                                <i className={salvando ? "pi pi-spin pi-spinner" : "pi pi-save"} aria-hidden="true" />
                              </AppButton>
                            </div>
                          </td>
                        </tr>
                        {detalheAberto && (
                          <tr>
                            <td colSpan={HORARIO_RESUMO_COLUNAS.length + 3}>
                              <div className="horario-detalhe-grid">
                                {DIAS_UTEIS_COLUNAS.map((col) => {
                                  const inicioKey = `${col.key}_inicio` as keyof HorarioUsuario;
                                  const fimKey = `${col.key}_fim` as keyof HorarioUsuario;
                                  const inicioVal = (horario[inicioKey] as string | null) || "";
                                  const fimVal = (horario[fimKey] as string | null) || "";
                                  return (
                                    <div
                                      key={`${u.id}-detalhe-${col.key}`}
                                      className="horario-detalhe-item"
                                    >
                                      <div className="horario-detalhe-label">{col.full}</div>
                                      <div className="time-pair">
                                        <input
                                          type="time"
                                          className="form-input"
                                          value={inicioVal}
                                          disabled={!podeEditarHorarios}
                                          onChange={(e) =>
                                            updateHorarioCampo(
                                              u.id,
                                              inicioKey,
                                              e.target.value || null
                                            )
                                          }
                                          aria-label={`${col.full} inicio`}
                                        />
                                        <span className="time-sep">—</span>
                                        <input
                                          type="time"
                                          className="form-input"
                                          value={fimVal}
                                          disabled={!podeEditarHorarios}
                                          onChange={(e) =>
                                            updateHorarioCampo(
                                              u.id,
                                              fimKey,
                                              e.target.value || null
                                            )
                                          }
                                          aria-label={`${col.full} fim`}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <h5 className="mt-4" style={{ fontWeight: 800 }}>
              Vendedores
            </h5>
            <div className="table-container overflow-x-auto" style={{ marginTop: 12 }}>
              <table className="table-default table-header-blue table-mobile-cards escala-horario-table min-w-[820px]">
                <thead>
                  <tr>
                    <th>Vendedor</th>
                    {HORARIO_RESUMO_COLUNAS.map((col) => (
                      <th key={col.key}>{col.label}</th>
                    ))}
                    <th>Atribuir automaticamente na Escala?</th>
                    <th className="th-actions">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {usuariosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={HORARIO_RESUMO_COLUNAS.length + 3}>
                        Nenhum vendedor encontrado.
                      </td>
                    </tr>
                  )}
                  {usuariosFiltrados.map((u) => {
                    const horario =
                      horariosUsuario[u.id] ||
                      buildHorarioPadrao(u.id, usuario.company_id || "");
                    const inicioUteis = horario.seg_inicio || "";
                    const fimUteis = horario.seg_fim || "";
                    const detalheAberto = Boolean(detalheDiasUteis[u.id]);
                    const salvando = salvandoHorarioId === u.id;
                    return (
                      <React.Fragment key={`horario-${u.id}`}>
                        <tr>
                          <td data-label="Vendedor">{u.nome_completo || "—"}</td>
                          {HORARIO_RESUMO_COLUNAS.map((col) => {
                            if (col.key === "segsex") {
                              return (
                                <td key={`${u.id}-segsex`} data-label={col.full}>
                                  <div className="time-pair">
                                    <input
                                      type="time"
                                      className="form-input"
                                      value={inicioUteis}
                                      disabled={!podeEditarHorarios}
                                      onChange={(e) =>
                                        updateHorarioDiasUteis(
                                          u.id,
                                          e.target.value || null,
                                          fimUteis || null
                                        )
                                      }
                                      aria-label={`${col.full} inicio`}
                                    />
                                    <span className="time-sep">—</span>
                                    <input
                                      type="time"
                                      className="form-input"
                                      value={fimUteis}
                                      disabled={!podeEditarHorarios}
                                      onChange={(e) =>
                                        updateHorarioDiasUteis(
                                          u.id,
                                          inicioUteis || null,
                                          e.target.value || null
                                        )
                                      }
                                      aria-label={`${col.full} fim`}
                                    />
                                    <AppButton
                                      type="button"
                                      variant="ghost"
                                      size="small"
                                      onClick={() => toggleDetalheDiasUteis(u.id)}
                                      title={
                                        detalheAberto ? "Ocultar dias úteis" : "Detalhar dias úteis"
                                      }
                                      aria-label={
                                        detalheAberto ? "Ocultar dias úteis" : "Detalhar dias úteis"
                                      }
                                    >
                                      <i className="pi pi-cog" aria-hidden="true" />
                                    </AppButton>
                                  </div>
                                </td>
                              );
                            }
                            const inicioKey = `${col.key}_inicio` as keyof HorarioUsuario;
                            const fimKey = `${col.key}_fim` as keyof HorarioUsuario;
                            const inicioVal = (horario[inicioKey] as string | null) || "";
                            const fimVal = (horario[fimKey] as string | null) || "";
                            return (
                              <td key={`${u.id}-${col.key}`} data-label={col.full}>
                                <div className="time-pair">
                                  <input
                                    type="time"
                                    className="form-input"
                                    value={inicioVal}
                                    disabled={!podeEditarHorarios}
                                    onChange={(e) =>
                                      updateHorarioCampo(
                                        u.id,
                                        inicioKey,
                                        e.target.value || null
                                      )
                                    }
                                    aria-label={`${col.full} inicio`}
                                  />
                                  <span className="time-sep">—</span>
                                  <input
                                    type="time"
                                    className="form-input"
                                    value={fimVal}
                                    disabled={!podeEditarHorarios}
                                    onChange={(e) =>
                                      updateHorarioCampo(u.id, fimKey, e.target.value || null)
                                    }
                                    aria-label={`${col.full} fim`}
                                  />
                                </div>
                              </td>
                            );
                          })}
                          <td data-label="Auto">
                            <select
                              className="form-select"
                              value={horario.auto_aplicar ? "sim" : "nao"}
                              disabled={!podeEditarHorarios}
                              onChange={(e) =>
                                updateHorarioCampo(
                                  u.id,
                                  "auto_aplicar",
                                  e.target.value === "sim"
                                )
                              }
                            >
                              <option value="sim">Sim</option>
                              <option value="nao">Não</option>
                            </select>
                          </td>
                          <td className="th-actions" data-label="Ações">
                            <div className="action-buttons">
                              <AppButton
                                variant="primary"
                                onClick={() => salvarHorarioUsuario(u.id)}
                                disabled={!podeEditarHorarios || salvando}
                                title={salvando ? "Salvando horário" : "Salvar horário"}
                                aria-label={salvando ? "Salvando horário" : "Salvar horário"}
                              >
                                <i className={salvando ? "pi pi-spin pi-spinner" : "pi pi-save"} aria-hidden="true" />
                              </AppButton>
                            </div>
                          </td>
                        </tr>
                        {detalheAberto && (
                          <tr>
                            <td colSpan={HORARIO_RESUMO_COLUNAS.length + 3}>
                              <div className="horario-detalhe-grid">
                                {DIAS_UTEIS_COLUNAS.map((col) => {
                                  const inicioKey = `${col.key}_inicio` as keyof HorarioUsuario;
                                  const fimKey = `${col.key}_fim` as keyof HorarioUsuario;
                                  const inicioVal = (horario[inicioKey] as string | null) || "";
                                  const fimVal = (horario[fimKey] as string | null) || "";
                                  return (
                                    <div key={`${u.id}-detalhe-${col.key}`} className="horario-detalhe-item">
                                      <div className="horario-detalhe-label">{col.full}</div>
                                      <div className="time-pair">
                                        <input
                                          type="time"
                                          className="form-input"
                                          value={inicioVal}
                                          disabled={!podeEditarHorarios}
                                          onChange={(e) =>
                                            updateHorarioCampo(
                                              u.id,
                                              inicioKey,
                                              e.target.value || null
                                            )
                                          }
                                          aria-label={`${col.full} inicio`}
                                        />
                                        <span className="time-sep">—</span>
                                        <input
                                          type="time"
                                          className="form-input"
                                          value={fimVal}
                                          disabled={!podeEditarHorarios}
                                          onChange={(e) =>
                                            updateHorarioCampo(
                                              u.id,
                                              fimKey,
                                              e.target.value || null
                                            )
                                          }
                                          aria-label={`${col.full} fim`}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </AppCard>
        </>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
      </div>
    </AppPrimerProvider>
  );
}
