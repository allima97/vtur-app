import React, { useEffect, useMemo, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import { MAPA_MODULOS } from "../../config/modulos";
import {
  getEffectiveSectionOrder,
  getEffectiveItemSection,
  moveKeyInOrder,
  readMenuPrefs,
  setMenuItemSection,
  setSectionOrder,
  toggleMenuItemHidden,
  writeMenuPrefs,
  type MenuPrefsV1,
} from "../../lib/menuPrefs";
import type { Permissao } from "../../lib/permissoesCache";
import EmptyState from "../ui/EmptyState";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";
import AppToolbar from "../ui/primer/AppToolbar";

type MenuItem = {
  key: string;
  label: string;
  section: string;
  locked?: boolean;
};

function sectionTitle(section: string) {
  switch (section) {
    case "informativos":
      return "Informativos";
    case "operacao":
      return "Operação";
    case "financeiro":
      return "Financeiro";
    case "cadastros":
      return "Cadastros";
    case "gestao":
      return "Gestão";
    case "relatorios":
      return "Relatórios";
    case "parametros":
      return "Parâmetros";
    case "documentacao":
      return "Documentação";
    case "admin":
      return "Administração";
    default:
      return section;
  }
}

export default function PersonalizarMenuIsland() {
  const { ready, userId, userType, canDb, isSystemAdmin } = usePermissoesStore();
  const [prefs, setPrefs] = useState<MenuPrefsV1>(() => readMenuPrefs(null));

  const menuUserType = String(userType || "");
  const menuIsMaster = /MASTER/i.test(menuUserType);
  const menuIsGestor = /GESTOR/i.test(menuUserType);
  const menuIsVendedor = /VENDEDOR/i.test(menuUserType);

  const canMenuExact = (modulo: string, min: Permissao = "view") => {
    if (isSystemAdmin) return true;
    const modDb = MAPA_MODULOS[modulo] || modulo;
    if (canDb(modDb, min)) return true;
    if (String(modDb).toLowerCase() !== String(modulo).toLowerCase()) {
      return canDb(modulo, min);
    }
    return false;
  };

  useEffect(() => {
    if (!ready || !userId) return;
    // Mostra imediatamente o que existe localmente.
    setPrefs(readMenuPrefs(userId));

    // Tenta carregar do servidor (para funcionar em outros dispositivos).
    (async () => {
      try {
        const resp = await fetch("/api/v1/menu/prefs", {
          method: "GET",
          credentials: "same-origin",
          headers: { "Accept": "application/json" },
        });
        if (!resp.ok) return;
        const payload = (await resp.json().catch(() => null)) as any;
        const next = (payload as any)?.prefs as unknown;
        if (!next) return;
        // Normalização acontece no backend; aqui só confiamos no formato.
        setPrefs(next as MenuPrefsV1);
        writeMenuPrefs(userId, next as MenuPrefsV1);
      } catch {
        // mantém localStorage
      }
    })();
  }, [ready, userId]);

  const saveServerPrefsBestEffort = async (next: MenuPrefsV1) => {
    try {
      const resp = await fetch("/api/v1/menu/prefs", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefs: next }),
      });
      if (!resp.ok) throw new Error(await resp.text().catch(() => ""));
    } catch (e) {
      console.warn("Não foi possível salvar preferências do menu no Supabase, mantendo localStorage.", e);
    }
  };

  const items: MenuItem[] = useMemo(() => {
    if (!ready || !userId) return [];

    const next: MenuItem[] = [];
    const push = (section: string, key: string, label: string, locked = false) => {
      next.push({ section, key, label, locked });
    };

    if (isSystemAdmin) {
      push("admin", "admin-dashboard", "Dashboard");
      push("admin", "admin-planos", "Planos");
      push("admin", "admin-financeiro", "Financeiro");
      push("admin", "admin-empresas", "Empresas");
      push("admin", "admin-usuarios", "Usuários");
      push("admin", "admin-tipos-usuario", "Tipos de usuário");
      push("admin", "admin-avisos", "Avisos");
      push("admin", "admin-email", "E-mail (Envio)");
      push("admin", "admin-permissoes", "Permissões");
      push("admin", "admin-parametros-importacao", "Parâmetros importação");
      push("admin", "admin-logs", "Logs");
      push("admin", "documentacao", "Documentação");
      return next;
    }

    // Informativos
    if (canMenuExact("Dashboard")) push("informativos", "dashboard", "Dashboard");
    if (canMenuExact("Agenda")) push("informativos", "operacao_agenda", "Agenda");
    if (canMenuExact("Tarefas")) push("informativos", "operacao_todo", "Tarefas");
    if (canMenuExact("Mural de Recados")) push("informativos", "operacao_recados", "Mural de Recados");
    if (canMenuExact("Minhas Preferências")) push("informativos", "operacao_preferencias", "Minhas Preferências");
    if (canMenuExact("Documentos Viagens")) push("informativos", "operacao_documentos_viagens", "Documentos Viagens");
    if (canMenuExact("Campanhas") || canMenuExact("Operacao")) {
      push("informativos", "operacao_campanhas", "Campanhas");
    }
    if (menuIsVendedor) push("informativos", "perfil-escala", "Minha Escala");

    // Operação
    if (canMenuExact("Vendas")) push("operacao", "vendas", "Vendas");
    if (canMenuExact("Orcamentos")) push("operacao", "orcamentos", "Orçamentos");
    if (canMenuExact("Consultoria Online")) push("operacao", "consultoria", "Consultoria");
    if (canMenuExact("Viagens")) push("operacao", "operacao_viagens", "Viagens");
    if (canMenuExact("Controle de SAC")) push("operacao", "operacao_sac", "Controle de SAC");

    // Financeiro
    const canFinanceiroComissionamento = canMenuExact("Comissionamento");
    const canFinanceiroFormasPagamento = canMenuExact("Formas de Pagamento");
    const canFinanceiroRegrasComissao = canMenuExact("RegrasComissao");
    const canFinanceiroConciliacao = (menuIsGestor || menuIsMaster) && canMenuExact("Conciliação");

    if (canFinanceiroComissionamento) push("financeiro", "comissionamento", "Comissionamento");
    if (canFinanceiroFormasPagamento) push("financeiro", "parametros-formas-pagamento", "Formas de Pagamento");
    if (canFinanceiroRegrasComissao) push("financeiro", "regras-comissao", "Regras de Comissão");
    if (canFinanceiroConciliacao) push("financeiro", "operacao_conciliacao", "Conciliação");

    // Cadastros
    if (canMenuExact("Clientes")) push("cadastros", "clientes", "Clientes");
    const cadastrosMenu = [
      { name: "Produtos", active: "produtos", label: "Produtos" },
      { name: "Circuitos", active: "circuitos", label: "Circuitos" },
      { name: "Paises", active: "paises", label: "Países" },
      { name: "Subdivisoes", active: "subdivisoes", label: "Estado/Província" },
      { name: "Cidades", active: "cidades", label: "Cidades" },
      { name: "ProdutosLote", active: "lote", label: "Lote" },
      { name: "Fornecedores", active: "fornecedores", label: "Fornecedores" },
    ];
    cadastrosMenu.forEach((item) => {
      if (canMenuExact(item.name)) push("cadastros", item.active, item.label);
    });

    // Gestão (Master)
    if (canMenuExact("MasterPermissoes") || menuIsMaster) {
      if (menuIsMaster && canMenuExact("MasterEmpresas")) push("gestao", "master-empresas", "Empresas");
      if (menuIsMaster && canMenuExact("MasterUsuarios")) push("gestao", "master-usuarios", "Usuários");
      if (canMenuExact("MasterPermissoes")) push("gestao", "master-permissoes", "Permissões");
    }

    // Relatórios
    const canRelatoriosVendas = canMenuExact("RelatorioVendas") || canMenuExact("Relatorios");
    const canRelatoriosDestinos = canMenuExact("RelatorioDestinos") || canMenuExact("Relatorios");
    const canRelatoriosProdutos = canMenuExact("RelatorioProdutos") || canMenuExact("Relatorios");
    const canRelatoriosClientes = canMenuExact("RelatorioClientes") || canMenuExact("Relatorios");
    const canRelatoriosRanking = canMenuExact("Ranking de vendas");
    if (canRelatoriosRanking) push("relatorios", "relatorios-ranking-vendas", "Ranking de vendas");
    if (canRelatoriosVendas) push("relatorios", "relatorios-vendas", "Vendas (detalhado)");
    if (canRelatoriosDestinos) push("relatorios", "relatorios-vendas-destino", "Vendas por destino");
    if (canRelatoriosProdutos) push("relatorios", "relatorios-vendas-produto", "Vendas por produto");
    if (canRelatoriosClientes) push("relatorios", "relatorios-vendas-cliente", "Vendas por cliente");

    // Parâmetros
    if (canMenuExact("TipoProdutos")) push("parametros", "parametros-tipo-produtos", "Tipo de Produtos");
    if (canMenuExact("TipoPacotes")) push("parametros", "parametros-tipo-pacotes", "Tipo de Pacotes");
    if (canMenuExact("Metas")) push("parametros", "parametros-metas", "Metas");
    if (canMenuExact("Equipe")) push("parametros", "parametros-equipe", "Equipe");
    if (canMenuExact("Escalas")) push("parametros", "parametros-escalas", "Escalas");
    if (canMenuExact("Parametros")) push("parametros", "parametros", "Parâmetros do Sistema");
    if (canMenuExact("Cambios")) push("parametros", "parametros-cambios", "Câmbios");
    if (canMenuExact("Orcamentos (PDF)")) push("parametros", "parametros-orcamentos", "Orçamentos (PDF)");

    // Documentação
    if (canMenuExact("Admin")) push("documentacao", "documentacao", "Documentação");

    return next;
  }, [ready, userId, isSystemAdmin, canDb, menuIsGestor, menuIsMaster, menuIsVendedor]);

  const grouped = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    items.forEach((item) => {
      const effectiveSection = getEffectiveItemSection(prefs, item.key, item.section);
      if (!map.has(effectiveSection)) map.set(effectiveSection, []);
      map.get(effectiveSection)!.push(item);
    });

    // aplica ordem efetiva por seção
    const result: Array<{ section: string; items: MenuItem[] }> = [];
    Array.from(map.entries()).forEach(([section, sectionItems]) => {
      const keys = sectionItems.map((i) => i.key);
      const effective = getEffectiveSectionOrder(prefs, section, keys);
      const byKey = new Map(sectionItems.map((i) => [i.key, i] as const));
      const ordered = effective.map((k) => byKey.get(k)).filter(Boolean) as MenuItem[];
      result.push({ section, items: ordered });
    });

    // ordena seções com uma ordem fixa e o resto no final
    const desired = [
      "informativos",
      "operacao",
      "financeiro",
      "cadastros",
      "gestao",
      "relatorios",
      "parametros",
      "documentacao",
      "admin",
    ];
    result.sort((a, b) => {
      const ia = desired.indexOf(a.section);
      const ib = desired.indexOf(b.section);
      if (ia === -1 && ib === -1) return a.section.localeCompare(b.section);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    return result;
  }, [items, prefs]);

  const applyPrefs = (next: MenuPrefsV1) => {
    if (!userId) return;
    setPrefs(next);
    writeMenuPrefs(userId, next);
    void saveServerPrefsBestEffort(next);
  };

  const onMove = (section: string, key: string, direction: "up" | "down") => {
    const keys = items
      .filter((i) => getEffectiveItemSection(prefs, i.key, i.section) === section)
      .map((i) => i.key);
    const effective = getEffectiveSectionOrder(prefs, section, keys);
    const moved = moveKeyInOrder(effective, key, direction);
    applyPrefs(setSectionOrder(prefs, section, moved));
  };

  const onToggleHidden = (item: MenuItem) => {
    if (item.locked) return;
    applyPrefs(toggleMenuItemHidden(prefs, item.key));
  };

  const onChangeSection = (item: MenuItem, nextSection: string) => {
    const next = setMenuItemSection(prefs, item.key, item.section, nextSection);
    applyPrefs(next);
  };

  if (!ready) {
    return <AppCard tone="config">Carregando permissoes...</AppCard>;
  }

  if (!userId) {
    return <AppCard tone="config">Faca login para personalizar o menu.</AppCard>;
  }

  return (
    <section className="personalizar-menu-page">
      <AppToolbar
        tone="info"
        className="mb-3"
        sticky
        title="Personalizar menu"
        subtitle="Escolha itens visiveis e ajuste a ordem automaticamente."
      />
      <AppCard tone="config">
        {grouped.length === 0 ? (
          <EmptyState title="Nenhum item disponivel" description="Nao ha itens para personalizar no seu perfil." />
        ) : (
          grouped.map((group) => (
            <div key={group.section} style={{ marginTop: 16 }}>
              <div className="sidebar-section-title" style={{ marginTop: 0 }}>
                {sectionTitle(group.section)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {group.items.map((item, idx) => {
                  const hidden = prefs.hidden.includes(item.key);
                  const effectiveSection = getEffectiveItemSection(prefs, item.key, item.section);
                  return (
                    <div
                      key={item.key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: "var(--radius-md)",
                        opacity: hidden ? 0.55 : 1,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.label}
                        </div>
                        {hidden && <div style={{ fontSize: 12, opacity: 0.8 }}>Oculto</div>}
                      </div>

                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <AppField
                          as="select"
                          label="Secao"
                          value={effectiveSection}
                          onChange={(e) => onChangeSection(item, e.target.value)}
                          wrapperClassName="m-0"
                          style={{ fontSize: 12, minWidth: 170 }}
                          options={(
                            isSystemAdmin
                              ? ["admin"]
                              : [
                                  "informativos",
                                  "operacao",
                                  "financeiro",
                                  "cadastros",
                                  "gestao",
                                  "relatorios",
                                  "parametros",
                                  "documentacao",
                                ]
                          ).map((s) => ({
                            value: s,
                            label: sectionTitle(s),
                          }))}
                        />
                        <AppButton
                          type="button"
                          variant="secondary"
                          onClick={() => onMove(group.section, item.key, "up")}
                          disabled={idx === 0}
                          aria-label="Mover para cima"
                        >
                          <i className="pi pi-arrow-up" aria-hidden="true" />
                        </AppButton>
                        <AppButton
                          type="button"
                          variant="secondary"
                          onClick={() => onMove(group.section, item.key, "down")}
                          disabled={idx === group.items.length - 1}
                          aria-label="Mover para baixo"
                        >
                          <i className="pi pi-arrow-down" aria-hidden="true" />
                        </AppButton>
                        <AppButton
                          type="button"
                          variant="secondary"
                          onClick={() => onToggleHidden(item)}
                          disabled={Boolean(item.locked)}
                          title={item.locked ? "Este item nao pode ser ocultado." : undefined}
                        >
                          <i className={hidden ? "pi pi-eye" : "pi pi-eye-slash"} aria-hidden="true" />
                          {hidden ? "Mostrar" : "Ocultar"}
                        </AppButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </AppCard>
    </section>
  );
}
