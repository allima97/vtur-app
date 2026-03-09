import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import AlertMessage from "../ui/AlertMessage";
import { ToastStack, useToastQueue } from "../ui/Toast";
import { MODULOS_MASTER_PERMISSOES } from "../../config/modulos";
import {
  agruparModulosPorSecao,
  MAPA_MODULOS,
  MODULO_ALIASES,
  normalizeModuloLabel,
  SECOES_PERMISSOES,
} from "../../config/modulos";

type Usuario = {
  id: string;
  nome_completo: string;
  email: string | null;
  company_id: string | null;
  uso_individual?: boolean | null;
  user_types?: { name: string } | null;
};

type ModuloAcesso = {
  id: string;
  usuario_id: string;
  modulo: string;
  permissao: NivelPermissao | "admin";
  ativo: boolean;
};

type NivelPermissao = "none" | "view" | "create" | "edit" | "delete";

const BASE_MODULOS: string[] = MODULOS_MASTER_PERMISSOES;

const NIVEIS: { value: NivelPermissao; label: string }[] = [
  { value: "none", label: "Nenhum" },
  { value: "view", label: "Ver" },
  { value: "create", label: "Criar" },
  { value: "edit", label: "Editar" },
  { value: "delete", label: "Excluir" },
];

const permLevel = (value: NivelPermissao | "admin") => {
  switch (value) {
    case "admin":
      return 5;
    case "delete":
      return 4;
    case "edit":
      return 3;
    case "create":
      return 2;
    case "view":
      return 1;
    default:
      return 0;
  }
};

const normalizeNivel = (value?: string | null): NivelPermissao => {
  if (!value) return "none";
  const norm = value.toLowerCase();
  if (norm === "admin") return "delete";
  if (norm === "delete") return "delete";
  if (norm === "edit") return "edit";
  if (norm === "create") return "create";
  if (norm === "view") return "view";
  return "none";
};

const normalizeModuloKey = (value?: string | null) => {
  const key = String(value || "").trim().toLowerCase();
  return MODULO_ALIASES[key] || key;
};

const toModuloDbKey = (modulo: string) => MAPA_MODULOS[modulo] || modulo;
const toModuloKey = (modulo: string) => normalizeModuloKey(toModuloDbKey(modulo));

function pickBestAcesso(matches: ModuloAcesso[]) {
  if (!matches?.length) return null;
  return matches
    .slice()
    .sort((a, b) => {
      const ativoA = a.ativo ? 1 : 0;
      const ativoB = b.ativo ? 1 : 0;
      if (ativoA !== ativoB) return ativoB - ativoA;
      const lvlA = permLevel((a.permissao as any) || "none");
      const lvlB = permLevel((b.permissao as any) || "none");
      if (lvlA !== lvlB) return lvlB - lvlA;
      return String(a.id).localeCompare(String(b.id));
    })[0];
}

export default function MasterPermissoesIsland() {
  const { can, loading: loadingPerms, ready, userType } = usePermissoesStore();
  const loadingPerm = loadingPerms || !ready;
  const podeVer = can("MasterPermissoes");
  const isMaster = /MASTER/i.test(String(userType || ""));
  const isGestor = /GESTOR/i.test(String(userType || ""));

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [acessos, setAcessos] = useState<ModuloAcesso[]>([]);
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<Usuario | null>(null);
  const [formPermissoes, setFormPermissoes] = useState<Record<string, NivelPermissao>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { toasts, showToast, dismissToast } = useToastQueue({ durationMs: 3500 });

  useEffect(() => {
    if (!loadingPerm && podeVer && (isMaster || isGestor)) {
      carregar();
    }
  }, [loadingPerm, podeVer, isMaster, isGestor]);

  async function carregar() {
    try {
      setLoading(true);
      setErro(null);

      const { data: auth } = await supabase.auth.getUser();
      const masterId = auth?.user?.id || null;
      if (!masterId) {
        setErro("Usuário não autenticado.");
        setUsuarios([]);
        setAcessos([]);
        return;
      }

      let idsEmpresasFinal: string[] = [];
      if (isGestor) {
        const { data: gestorUser, error: gestorUserErr } = await supabase
          .from("users")
          .select("company_id")
          .eq("id", masterId)
          .maybeSingle();
        if (gestorUserErr) throw gestorUserErr;
        const companyId = (gestorUser as any)?.company_id || null;
        if (companyId) idsEmpresasFinal = [companyId];
      } else {
        const { data: vinculos, error: vincErr } = await supabase
          .from("master_empresas")
          .select("company_id, status")
          .eq("master_id", masterId);
        if (vincErr) throw vincErr;

        const idsEmpresas = (vinculos || [])
          .filter((v: any) => String(v?.status || "").toLowerCase() !== "rejected")
          .map((v: any) => v.company_id)
          .filter(Boolean);
        idsEmpresasFinal = Array.from(new Set(idsEmpresas));
        if (idsEmpresasFinal.length === 0) {
          const { data: masterUser, error: masterUserErr } = await supabase
            .from("users")
            .select("company_id")
            .eq("id", masterId)
            .maybeSingle();
          if (masterUserErr) throw masterUserErr;
          const companyIdPrincipal = (masterUser as any)?.company_id || null;
          if (companyIdPrincipal) idsEmpresasFinal = [companyIdPrincipal];
        }
      }

      if (idsEmpresasFinal.length === 0) {
        setUsuarios([]);
        setAcessos([]);
        return;
      }

      const { data: usersData, error: usersErr } = await supabase
        .from("users")
        .select("id, nome_completo, email, company_id, uso_individual, user_types(name)")
        .in("company_id", idsEmpresasFinal)
        .order("nome_completo", { ascending: true });

      if (usersErr) throw usersErr;

      const listaUsers =
        (usersData || [])
          .map((u: any) => ({
            id: u.id,
            nome_completo: u.nome_completo,
            email: u.email,
            company_id: u.company_id,
            uso_individual: u.uso_individual ?? null,
            user_types: u.user_types || null,
          }))
          .filter((u: Usuario) => {
            const tipo = String(u.user_types?.name || "").toUpperCase();
            if (isGestor) {
              return tipo.includes("VENDEDOR") && u.uso_individual === false;
            }
            return (
              !tipo.includes("ADMIN") &&
              !tipo.includes("MASTER") &&
              u.uso_individual === false
            );
          }) || [];

      setUsuarios(listaUsers);

      const userIds = listaUsers.map((u) => u.id);
      if (userIds.length === 0) {
        setAcessos([]);
        return;
      }

      const userIdsAcessos = Array.from(new Set([...userIds, masterId]));
      const { data: acessosData, error: accErr } = await supabase
        .from("modulo_acesso")
        .select("id, usuario_id, modulo, permissao, ativo")
        .in("usuario_id", userIdsAcessos);

      if (accErr) throw accErr;

      setAcessos((acessosData || []) as ModuloAcesso[]);
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar permissões.");
    } finally {
      setLoading(false);
    }
  }

  const usuariosFiltrados = useMemo(() => {
    if (!busca.trim()) return usuarios;
    const t = busca.toLowerCase();
    return usuarios.filter(
      (u) =>
        u.nome_completo.toLowerCase().includes(t) ||
        (u.email || "").toLowerCase().includes(t)
    );
  }, [usuarios, busca]);

  const modulosEditor = useMemo(() => {
    const seen = new Set<string>();
    const ordered: string[] = [];
    const addModulo = (moduloLabel: string) => {
      const label = String(moduloLabel || "").trim();
      if (!label) return;
      const key = toModuloKey(label);
      if (!key || seen.has(key)) return;
      if (!can(label)) return;
      seen.add(key);
      ordered.push(label);
    };

    BASE_MODULOS.forEach(addModulo);
    acessos.forEach((a) => {
      const raw = String(a?.modulo || "").trim();
      if (!raw) return;
      addModulo(normalizeModuloLabel(raw));
    });

    return ordered;
  }, [acessos, can]);

  const modulosPorSecao = useMemo(
    () => agruparModulosPorSecao(modulosEditor),
    [modulosEditor]
  );
  const secoesLabels = useMemo(() => {
    const map = new Map<string, string>();
    SECOES_PERMISSOES.forEach((s) => map.set(s.id, s.titulo));
    return map;
  }, []);

  function abrirEditor(u: Usuario, acessosFonte?: ModuloAcesso[]) {
    setSelecionado(u);

    const perms: Record<string, NivelPermissao> = {};
    for (const modulo of modulosEditor) {
      const moduloKey = toModuloKey(modulo);
      const ativa = acessosFonte ?? acessos;
      const reg = pickBestAcesso(
        ativa.filter(
          (a) =>
            a.usuario_id === u.id &&
            normalizeModuloKey(a.modulo) === moduloKey
        )
      );
      perms[modulo] = reg?.ativo ? normalizeNivel(reg?.permissao) : "none";
    }
    setFormPermissoes(perms);
  }

  function handleChangeNivel(modulo: string, value: string) {
    setFormPermissoes((prev) => ({
      ...prev,
      [modulo]: value as NivelPermissao,
    }));
  }

  function getSecaoNivel(modulos: string[]) {
    const niveis = (modulos || []).map((m) => formPermissoes[m] || "none");
    const unique = Array.from(new Set(niveis));
    return unique.length === 1 ? unique[0] : "";
  }

  function aplicarNivelSecao(modulos: string[], nivel: NivelPermissao) {
    setFormPermissoes((prev) => {
      const next = { ...prev };
      (modulos || []).forEach((modulo) => {
        next[modulo] = nivel;
      });
      return next;
    });
  }

  async function salvarPermissoes() {
    if (!selecionado) return;

    try {
      setSalvando(true);
      setErro(null);

      for (const modulo of modulosEditor) {
        const moduloDb = toModuloDbKey(modulo);
        const moduloKey = toModuloKey(modulo);
        const nivel = formPermissoes[modulo] || "none";
        const existentes = acessos.filter(
          (a) =>
            a.usuario_id === selecionado.id &&
            normalizeModuloKey(a.modulo) === moduloKey
        );

        if (!existentes.length) {
          if (nivel === "none") continue;
          const { error: insertErr } = await supabase.from("modulo_acesso").insert({
            usuario_id: selecionado.id,
            modulo: moduloDb,
            permissao: nivel,
            ativo: true,
          });
          if (insertErr) throw insertErr;
        } else {
          const ids = existentes.map((e) => e.id).filter(Boolean);
          const { error: updateErr } = await supabase
            .from("modulo_acesso")
            .update({
              permissao: nivel,
              ativo: nivel !== "none",
            })
            .in("id", ids);
          if (updateErr) throw updateErr;
        }
      }

      showToast("Permissões atualizadas.", "success");
      const { data: acessosData } = await supabase
        .from("modulo_acesso")
        .select("id, usuario_id, modulo, permissao, ativo")
        .eq("usuario_id", selecionado.id);
      const acessosAtualizados = [
        ...acessos.filter((a) => a.usuario_id !== selecionado.id),
        ...(acessosData || []),
      ] as ModuloAcesso[];
      setAcessos(acessosAtualizados);
      abrirEditor(selecionado, acessosAtualizados);
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar permissões.");
      showToast("Erro ao salvar permissões.", "error");
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    if (!loading && !selecionado && usuariosFiltrados.length > 0) {
      abrirEditor(usuariosFiltrados[0]);
    }
  }, [loading, selecionado, usuariosFiltrados]);

  useEffect(() => {
    if (!loading && selecionado) {
      abrirEditor(selecionado, acessos);
    }
  }, [loading, selecionado, acessos, modulosEditor]);

  if (loadingPerm) return <LoadingUsuarioContext />;
  if (!podeVer || (!isMaster && !isGestor))
    return (
      <div style={{ padding: 20 }}>
        <h3>Apenas usuários MASTER ou GESTOR podem acessar este módulo.</h3>
      </div>
    );

  return (
    <div className="permissoes-admin-page admin-page">
      <div className="mb-4 p-4 rounded-lg bg-sky-950 border border-sky-700 text-sky-100">
        <strong>{isGestor ? "Permissões Gestor" : "Permissões Master"}</strong> — limite máximo até excluir
      </div>

      {erro && (
        <div className="mb-3">
          <AlertMessage variant="error">{erro}</AlertMessage>
        </div>
      )}

      {loading && <div>Carregando...</div>}

      <div className="form-row mobile-stack mb-3">
        <div className="form-group flex-1">
          <label className="form-label">Buscar usuário</label>
          <input
            className="form-input"
            placeholder="Nome ou e-mail"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <div className="form-group flex-1">
          <label className="form-label">Usuário</label>
          <select
            className="form-select"
            value={selecionado?.id || ""}
            onChange={(e) => {
              const u = usuariosFiltrados.find((x) => x.id === e.target.value) || null;
              if (u) abrirEditor(u);
            }}
          >
            <option value="" disabled>
              Selecione
            </option>
            {usuariosFiltrados.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome_completo} {u.email ? `(${u.email})` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selecionado && (
        <div className="card-base card-config">
          <div className="mb-3">
            <strong>Usuário:</strong> {selecionado.nome_completo}{" "}
            {selecionado.email ? `(${selecionado.email})` : ""}
          </div>

          <div className="table-container overflow-x-auto">
            <table className="table-default table-header-blue table-mobile-cards min-w-[680px]">
              <thead>
                <tr>
                  <th>Módulo</th>
                  <th>Permissão</th>
                </tr>
              </thead>
              <tbody>
                {modulosPorSecao.map((secao) => (
                  <React.Fragment key={secao.id}>
                    <tr>
                      <td colSpan={2} style={{ background: "#eff6ff" }}>
                        <div className="flex flex-wrap gap-2 items-center justify-between">
                          <div>
                            <strong>{secao.titulo}</strong>
                            {secao.includes.length > 0 && (
                              <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.75 }}>
                                (inclui:{" "}
                                {secao.includes
                                  .map((id) => secoesLabels.get(id) || id)
                                  .join(", ")}
                                )
                              </span>
                            )}
                          </div>
                          {secao.applyModulos.length > 0 && (
                            <div className="flex items-center gap-2">
                              <span style={{ fontSize: 12, opacity: 0.8 }}>
                                Aplicar em {secao.applyModulos.length}:
                              </span>
                              <select
                                className="form-select"
                                value={getSecaoNivel(secao.applyModulos)}
                                onChange={(e) => {
                                  const value = e.target.value as NivelPermissao;
                                  if (!value) return;
                                  aplicarNivelSecao(secao.applyModulos, value);
                                }}
                              >
                                <option value="">—</option>
                                {NIVEIS.map((n) => (
                                  <option key={n.value} value={n.value}>
                                    {n.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>

                    {secao.modulos.map((modulo) => (
                      <tr key={`${secao.id}:${modulo}`}>
                        <td data-label="Módulo">{modulo}</td>
                        <td data-label="Permissão">
                          <select
                            className="form-select"
                            value={formPermissoes[modulo] || "none"}
                            onChange={(e) => handleChangeNivel(modulo, e.target.value)}
                          >
                            {NIVEIS.map((n) => (
                              <option key={n.value} value={n.value}>
                                {n.label}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 flex-wrap mt-4 mobile-stack-buttons">
            <button
              className="btn btn-primary"
              onClick={salvarPermissoes}
              disabled={salvando}
            >
              {salvando ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </div>
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
