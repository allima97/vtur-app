import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { registrarLog } from "../../lib/logs";
import { usePermissoesStore } from "../../lib/permissoesStore";
import LoadingUsuarioContext from "../ui/LoadingUsuarioContext";
import DataTable from "../ui/DataTable";
import {
  agruparModulosPorSecao,
  MAPA_MODULOS,
  MODULO_ALIASES,
  MODULOS_ADMIN_PERMISSOES,
  normalizeModuloLabel,
  SECOES_PERMISSOES,
} from "../../config/modulos";

type Usuario = {
  id: string;
  nome_completo: string;
  email: string | null;
  active: boolean;
};

type ModuloAcesso = {
  id: string;
  usuario_id: string;
  modulo: string;
  permissao: NivelPermissao;
  ativo: boolean;
};

type NivelPermissao =
  | "none"
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "admin";

const MODULOS: string[] = MODULOS_ADMIN_PERMISSOES;

const NIVEIS: { value: NivelPermissao; label: string }[] = [
  { value: "none", label: "Nenhum" },
  { value: "view", label: "Ver" },
  { value: "create", label: "Criar" },
  { value: "edit", label: "Editar" },
  { value: "delete", label: "Excluir" },
  { value: "admin", label: "Admin" },
];

const permLevel = (value: NivelPermissao) => {
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
  if (norm === "admin") return "admin";
  if (norm === "delete") return "delete";
  if (norm === "edit") return "edit";
  if (norm === "create") return "create";
  if (norm === "view") return "view";
  if (norm === "none") return "none";
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
      const lvlA = permLevel(normalizeNivel(a.permissao));
      const lvlB = permLevel(normalizeNivel(b.permissao));
      if (lvlA !== lvlB) return lvlB - lvlA;
      return String(a.id).localeCompare(String(b.id));
    })[0];
}

export default function AdminPermissoesIsland() {
  const { can, loading: loadingPerms, ready } = usePermissoesStore();
  const loadingAdminPerm = loadingPerms || !ready;
  const podeVer = can("Admin"); // módulo Admin
  const isAdmin = can("Admin", "admin");

  const [usuarioLogadoId, setUsuarioLogadoId] = useState<string | null>(null);

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [acessos, setAcessos] = useState<ModuloAcesso[]>([]);

  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<Usuario | null>(null);

  const [formPermissoes, setFormPermissoes] = useState<
    Record<string, NivelPermissao>
  >({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ---------------------------------------
  // LOAD INICIAL
  // ---------------------------------------
  useEffect(() => {
    carregar();
  }, []);

  async function carregar(): Promise<{ usuarios: Usuario[]; acessos: ModuloAcesso[] }> {
    try {
      setLoading(true);
      setErro(null);

      // usuario logado
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id || null;
      setUsuarioLogadoId(userId);

      // usuarios
      const { data: usersData, error: usersErr } = await supabase
        .from("users")
        .select("id, nome_completo, email, active")
        .order("nome_completo", { ascending: true });

      if (usersErr) throw usersErr;

      const usuariosCarregados = (usersData || []) as Usuario[];
      setUsuarios(usuariosCarregados);

      // acessos
      const { data: acessosData, error: accErr } = await supabase
        .from("modulo_acesso")
        .select("id, usuario_id, modulo, permissao, ativo");

      if (accErr) throw accErr;

      const acessosCarregados = (acessosData || []) as ModuloAcesso[];
      setAcessos(acessosCarregados);

      return { usuarios: usuariosCarregados, acessos: acessosCarregados };
    } catch (e) {
      console.error(e);
      setErro("Erro ao carregar permissões.");
      return { usuarios: [], acessos: [] };
    } finally {
      setLoading(false);
    }
  }

  // ---------------------------------------
  // FILTRO DE USUÁRIOS
  // ---------------------------------------
  const usuariosFiltrados = useMemo(() => {
    if (!busca.trim()) return usuarios;
    const t = busca.toLowerCase();
    return usuarios.filter(
      (u) =>
        u.nome_completo.toLowerCase().includes(t) ||
        (u.email || "").toLowerCase().includes(t),
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
      seen.add(key);
      ordered.push(label);
    };

    MODULOS.forEach(addModulo);
    acessos.forEach((a) => {
      const raw = String(a?.modulo || "").trim();
      if (!raw) return;
      addModulo(normalizeModuloLabel(raw));
    });

    return ordered;
  }, [acessos]);

  const modulosPorSecao = useMemo(() => agruparModulosPorSecao(modulosEditor), [modulosEditor]);
  const secoesLabels = useMemo(() => {
    const map = new Map<string, string>();
    SECOES_PERMISSOES.forEach((s) => map.set(s.id, s.titulo));
    return map;
  }, []);

  // ---------------------------------------
  // EDITOR DE PERMISSÕES
  // ---------------------------------------
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
            normalizeModuloKey(a.modulo) === moduloKey,
        ),
      );
      perms[modulo] = reg?.ativo ? normalizeNivel(reg.permissao) : "none";
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
    if (!isAdmin) {
      setErro("Somente ADMIN pode alterar permissões.");
      return;
    }

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
            normalizeModuloKey(a.modulo) === moduloKey,
        );

        if (!existentes.length) {
          // criar novo registro
          const { error: insertErr } = await supabase.from("modulo_acesso").insert({
            usuario_id: selecionado.id,
            modulo: moduloDb,
            permissao: nivel,
            ativo: nivel !== "none",
          });
          if (insertErr) throw insertErr;
        } else {
          // atualizar (atualiza todos os registros duplicados do mesmo módulo)
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

      await registrarLog({
        user_id: usuarioLogadoId,
        acao: "permissoes_atualizadas",
        modulo: "Admin",
        detalhes: {
          usuario_alterado_id: selecionado.id,
          permissoes: formPermissoes,
        },
      });

      const { usuarios: usuariosAtualizados, acessos: acessosAtualizados } = await carregar();
      // manter selecionado na tela com dados atualizados
      const u = usuariosAtualizados.find((x) => x.id === selecionado.id) || null;
      if (u) abrirEditor(u, acessosAtualizados);
    } catch (e) {
      console.error(e);
      setErro("Erro ao salvar permissões.");
    } finally {
      setSalvando(false);
    }
  }

  async function toggleUsuarioAtivo(u: Usuario) {
    try {
      const novo = !u.active;
      const { error } = await supabase
        .from("users")
        .update({ active: novo })
        .eq("id", u.id);

      if (error) throw error;

      await registrarLog({
        user_id: usuarioLogadoId,
        acao: novo ? "usuario_ativado" : "usuario_bloqueado",
        modulo: "Admin",
        detalhes: { usuario_alterado_id: u.id },
      });

      await carregar();
    } catch (e) {
      console.error(e);
      setErro("Erro ao alterar status do usuário.");
    }
  }

  // ---------------------------------------
  // UI
  // ---------------------------------------
  if (loadingAdminPerm) {
    return <LoadingUsuarioContext />;
  }

  if (!podeVer) {
    return <div>Acesso ao módulo de Admin bloqueado.</div>;
  }

  if (!isAdmin) {
    return <div>Somente usuários ADMIN podem gerenciar permissões.</div>;
  }

  if (loading) {
    return <LoadingUsuarioContext />;
  }

  return (
    <div className="admin-permissoes-page admin-page">
      {/* FILTRO + INFO */}
      <div className="card-base card-blue mb-3 list-toolbar-sticky">
        <div
          className="form-row mobile-stack"
          style={{ gap: 12, gridTemplateColumns: "minmax(240px, 1fr) minmax(220px, 320px)", alignItems: "flex-end" }}
        >
          <div className="form-group">
            <h3 className="page-title">🔐 Permissões do sistema</h3>
            <p className="page-subtitle">Defina níveis de acesso por módulo e usuário.</p>
          </div>
          <div className="form-group">
            <label className="form-label">Buscar usuário</label>
            <input
              className="form-input"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome ou e-mail..."
            />
          </div>
        </div>

        {erro && (
          <div className="card-base card-config mt-2">
            <strong>{erro}</strong>
          </div>
        )}
      </div>

      {/* TABELA DE USUÁRIOS */}
      <DataTable
        shellClassName="vtur-data-table-shellless mb-3"
        className="table-default table-header-blue table-mobile-cards min-w-[780px]"
        headers={
          <tr>
            <th>Nome</th>
            <th>E-mail</th>
            <th>Status</th>
            <th className="th-actions">Ações</th>
          </tr>
        }
        empty={usuariosFiltrados.length === 0}
        emptyMessage="Nenhum usuário encontrado."
        colSpan={4}
      >
        {usuariosFiltrados.map((u) => (
          <tr key={u.id}>
            <td data-label="Nome">{u.nome_completo}</td>
            <td data-label="E-mail">{u.email || "-"}</td>
            <td data-label="Status">{u.active ? "Ativo" : "Bloqueado"}</td>
            <td className="th-actions" data-label="Ações">
              <div className="action-buttons">
                <button
                  className="btn-icon icon-action-btn"
                  title="Editar permissões"
                  onClick={() => abrirEditor(u)}
                >
                  ⚙️
                </button>
                {usuarioLogadoId !== u.id && (
                  <button
                    className={`btn-icon icon-action-btn ${u.active ? "danger" : ""}`}
                    title={u.active ? "Bloquear usuário" : "Reativar usuário"}
                    onClick={() => toggleUsuarioAtivo(u)}
                  >
                    {u.active ? "🚫" : "✅"}
                  </button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      {/* EDITOR DE PERMISSÕES DO USUÁRIO SELECIONADO */}
      {selecionado && (
        <div className="card-base card-blue">
          <h3>
            Permissões de: <span className="font-semibold">{selecionado.nome_completo}</span>
          </h3>
          <DataTable
            shellClassName="vtur-data-table-shellless"
            className="table-default table-header-blue table-mobile-cards min-w-[680px]"
            headers={
              <tr>
                <th>Módulo</th>
                <th>Nível</th>
              </tr>
            }
            colSpan={2}
          >
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
                    <td data-label="Nível">
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
          </DataTable>
          <div className="mt-2 flex gap-2 flex-wrap mobile-stack-buttons">
            <button
              className="btn btn-primary"
              onClick={salvarPermissoes}
              disabled={salvando}
            >
              {salvando ? "Salvando..." : "Salvar permissões"}
            </button>
            <button
              className="btn btn-light"
              onClick={() => setSelecionado(null)}
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
