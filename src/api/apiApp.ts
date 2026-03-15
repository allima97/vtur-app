import type { ExecutionContext } from "@cloudflare/workers-types";
import { Hono } from "hono";

import * as AgendaRange from "../pages/api/v1/agenda/range";
import * as AgendaCreate from "../pages/api/v1/agenda/create";
import * as AgendaUpdate from "../pages/api/v1/agenda/update";
import * as AgendaDelete from "../pages/api/v1/agenda/delete";
import * as DashboardSummary from "../pages/api/v1/dashboard/summary";
import * as DashboardWidgets from "../pages/api/v1/dashboard/widgets";
import * as DashboardAniversariantes from "../pages/api/v1/dashboard/aniversariantes";
import * as DashboardConsultorias from "../pages/api/v1/dashboard/consultorias";
import * as DashboardFollowUps from "../pages/api/v1/dashboard/follow-ups";
import * as DashboardViagens from "../pages/api/v1/dashboard/viagens";
import * as MenuPrefs from "../pages/api/v1/menu/prefs";
import * as TodoBatch from "../pages/api/v1/todo/batch";
import * as TodoBoard from "../pages/api/v1/todo/board";
import * as TodoCategory from "../pages/api/v1/todo/category";
import * as TodoItem from "../pages/api/v1/todo/item";
import * as VendasKpis from "../pages/api/v1/vendas/kpis";
import * as VendasList from "../pages/api/v1/vendas/list";
import * as VendasCadastroBase from "../pages/api/v1/vendas/cadastro-base";
import * as VendasCidadesBusca from "../pages/api/v1/vendas/cidades-busca";
import * as VendasCadastroSave from "../pages/api/v1/vendas/cadastro-save";
import * as VendasCancel from "../pages/api/v1/vendas/cancel";
import * as VendasReciboDelete from "../pages/api/v1/vendas/recibo-delete";
import * as VendasReciboComplementarLink from "../pages/api/v1/vendas/recibo-complementar-link";
import * as VendasReciboComplementarRemove from "../pages/api/v1/vendas/recibo-complementar-remove";
import * as VendasMergeCandidates from "../pages/api/v1/vendas/merge-candidates";
import * as VendasMerge from "../pages/api/v1/vendas/merge";
import * as VendasReciboNotas from "../pages/api/v1/vendas/recibo-notas";
import * as ReferenceData from "../pages/api/v1/reference-data";
import * as ParametrosSistema from "../pages/api/v1/parametros/sistema";
import * as ParametrosNaoComissionaveis from "../pages/api/v1/parametros/nao-comissionaveis";
import * as ParametrosOrcamentosPdf from "../pages/api/v1/parametros/orcamentos-pdf";
import * as RelatorioClientes from "../pages/api/v1/relatorios/vendas-por-cliente";
import * as RelatorioDestinos from "../pages/api/v1/relatorios/vendas-por-destino";
import * as RelatorioProdutos from "../pages/api/v1/relatorios/vendas-por-produto";
import * as RelatorioProdutosRecibos from "../pages/api/v1/relatorios/produtos-recibos";
import * as RelatorioCidadesBusca from "../pages/api/v1/relatorios/cidades-busca";
import * as RelatorioVendas from "../pages/api/v1/relatorios/vendas";
import * as RelatorioRanking from "../pages/api/v1/relatorios/ranking-vendas";
import * as RelatorioBase from "../pages/api/v1/relatorios/base";
import * as ClientesList from "../pages/api/v1/clientes/list";
import * as ClientesHistorico from "../pages/api/v1/clientes/historico";
import * as ClientesDelete from "../pages/api/v1/clientes/delete";
import * as ProdutosBase from "../pages/api/v1/produtos/base";
import * as ProdutosTarifas from "../pages/api/v1/produtos/tarifas";
import * as FormasPagamentoList from "../pages/api/v1/formas-pagamento/list";
import * as FormasPagamentoCreate from "../pages/api/v1/formas-pagamento/create";
import * as FormasPagamentoUpdate from "../pages/api/v1/formas-pagamento/update";
import * as FormasPagamentoDelete from "../pages/api/v1/formas-pagamento/delete";
import * as MuralBootstrap from "../pages/api/v1/mural/bootstrap";
import * as MuralCompany from "../pages/api/v1/mural/company";
import * as MuralRecados from "../pages/api/v1/mural/recados";
import * as SessionBootstrap from "../pages/api/v1/session/bootstrap";
import * as AdminSummary from "../pages/api/v1/admin/summary";
import * as ViagensDossie from "../pages/api/v1/viagens/dossie";
import * as ViagensDossieBatch from "../pages/api/v1/viagens/dossie-batch";
import * as ViagensList from "../pages/api/v1/viagens/list";
import * as ViagensCreate from "../pages/api/v1/viagens/create";
import * as ViagensDelete from "../pages/api/v1/viagens/delete";
import * as ViagensClientes from "../pages/api/v1/viagens/clientes";
import * as ViagensCidadesBusca from "../pages/api/v1/viagens/cidades-busca";
import * as OrcamentosList from "../pages/api/v1/orcamentos/list";
import * as OrcamentosDelete from "../pages/api/v1/orcamentos/delete";
import * as OrcamentosStatus from "../pages/api/v1/orcamentos/status";
import * as OrcamentosInteraction from "../pages/api/v1/orcamentos/interaction";
import * as OrcamentosClientes from "../pages/api/v1/orcamentos/clientes";
import * as OrcamentosTipos from "../pages/api/v1/orcamentos/tipos";
import * as OrcamentosCidadesBusca from "../pages/api/v1/orcamentos/cidades-busca";
import * as OrcamentosProdutos from "../pages/api/v1/orcamentos/produtos";
import * as OrcamentosClienteCreate from "../pages/api/v1/orcamentos/cliente-create";
import * as OrcamentosSave from "../pages/api/v1/orcamentos/save";
import * as OrcamentosCreate from "../pages/api/v1/orcamentos/create";

type Env = Record<string, unknown>;

type AstroHandle = (request: Request, env: Env, context: ExecutionContext) => Promise<Response>;

export function createApiApp(params: { astroHandle: AstroHandle }) {
  const app = new Hono<{ Bindings: Env }>();

  app.use("/api/*", async (c, next) => {
    const start = Date.now();
    const rawFlag = String((c.env as Env)?.API_LOGGING ?? "").toLowerCase();
    const shouldLog = ["1", "true", "yes", "on"].includes(rawFlag);
    try {
      await next();
    } finally {
      if (shouldLog) {
        const durationMs = Date.now() - start;
        const url = new URL(c.req.url);
        console.log("API_LOG", {
          method: c.req.method,
          path: url.pathname,
          status: c.res?.status ?? 500,
          durationMs,
          ray: c.req.header("cf-ray"),
        });
      }
    }
  });

  app.get("/api/v1/health", (c) =>
    c.json(
      {
        ok: true,
        ts: Date.now(),
      },
      200
    )
  );

  app.get("/api/v1/agenda/range", (c) => AgendaRange.GET({ request: c.req.raw }));
  app.post("/api/v1/agenda/create", (c) => AgendaCreate.POST({ request: c.req.raw }));
  app.post("/api/v1/agenda/update", (c) => AgendaUpdate.POST({ request: c.req.raw }));
  app.delete("/api/v1/agenda/delete", (c) => AgendaDelete.DELETE({ request: c.req.raw }));

  app.get("/api/v1/dashboard/summary", (c) => DashboardSummary.GET({ request: c.req.raw }));
  app.get("/api/v1/dashboard/aniversariantes", (c) =>
    DashboardAniversariantes.GET({ request: c.req.raw })
  );
  app.get("/api/v1/dashboard/consultorias", (c) =>
    DashboardConsultorias.GET({ request: c.req.raw })
  );
  app.get("/api/v1/dashboard/follow-ups", (c) =>
    DashboardFollowUps.GET({ request: c.req.raw })
  );
  app.get("/api/v1/dashboard/viagens", (c) => DashboardViagens.GET({ request: c.req.raw }));

  app.get("/api/v1/dashboard/widgets", (c) => DashboardWidgets.GET({ request: c.req.raw }));
  app.post("/api/v1/dashboard/widgets", (c) => DashboardWidgets.POST({ request: c.req.raw }));

  app.get("/api/v1/menu/prefs", (c) => MenuPrefs.GET({ request: c.req.raw }));
  app.post("/api/v1/menu/prefs", (c) => MenuPrefs.POST({ request: c.req.raw }));

  app.get("/api/v1/todo/board", (c) => TodoBoard.GET({ request: c.req.raw }));
  app.post("/api/v1/todo/batch", (c) => TodoBatch.POST({ request: c.req.raw }));
  app.post("/api/v1/todo/category", (c) => TodoCategory.POST({ request: c.req.raw }));
  app.delete("/api/v1/todo/category", (c) => TodoCategory.DELETE({ request: c.req.raw }));
  app.post("/api/v1/todo/item", (c) => TodoItem.POST({ request: c.req.raw }));
  app.delete("/api/v1/todo/item", (c) => TodoItem.DELETE({ request: c.req.raw }));

  app.get("/api/v1/vendas/list", (c) => VendasList.GET({ request: c.req.raw }));
  app.get("/api/v1/vendas/kpis", (c) => VendasKpis.GET({ request: c.req.raw }));
  app.get("/api/v1/vendas/cadastro-base", (c) =>
    VendasCadastroBase.GET({ request: c.req.raw })
  );
  app.get("/api/v1/vendas/cidades-busca", (c) =>
    VendasCidadesBusca.GET({ request: c.req.raw })
  );
  app.post("/api/v1/vendas/cadastro-save", (c) =>
    VendasCadastroSave.POST({ request: c.req.raw })
  );
  app.post("/api/v1/vendas/cancel", (c) => VendasCancel.POST({ request: c.req.raw }));
  app.post("/api/v1/vendas/recibo-delete", (c) =>
    VendasReciboDelete.POST({ request: c.req.raw })
  );
  app.post("/api/v1/vendas/recibo-complementar-link", (c) =>
    VendasReciboComplementarLink.POST({ request: c.req.raw })
  );
  app.post("/api/v1/vendas/recibo-complementar-remove", (c) =>
    VendasReciboComplementarRemove.POST({ request: c.req.raw })
  );
  app.get("/api/v1/vendas/merge-candidates", (c) =>
    VendasMergeCandidates.GET({ request: c.req.raw })
  );
  app.post("/api/v1/vendas/merge", (c) => VendasMerge.POST({ request: c.req.raw }));
  app.get("/api/v1/vendas/recibo-notas", (c) =>
    VendasReciboNotas.GET({ request: c.req.raw })
  );
  app.get("/api/v1/reference-data", (c) =>
    ReferenceData.GET({ request: c.req.raw })
  );
  app.get("/api/v1/parametros/sistema", (c) =>
    ParametrosSistema.GET({ request: c.req.raw })
  );
  app.post("/api/v1/parametros/sistema", (c) =>
    ParametrosSistema.POST({ request: c.req.raw })
  );
  app.get("/api/v1/parametros/nao-comissionaveis", (c) =>
    ParametrosNaoComissionaveis.GET({ request: c.req.raw })
  );
  app.post("/api/v1/parametros/nao-comissionaveis", (c) =>
    ParametrosNaoComissionaveis.POST({ request: c.req.raw })
  );
  app.delete("/api/v1/parametros/nao-comissionaveis", (c) =>
    ParametrosNaoComissionaveis.DELETE({ request: c.req.raw })
  );
  app.get("/api/v1/parametros/orcamentos-pdf", (c) =>
    ParametrosOrcamentosPdf.GET({ request: c.req.raw })
  );
  app.post("/api/v1/parametros/orcamentos-pdf", (c) =>
    ParametrosOrcamentosPdf.POST({ request: c.req.raw })
  );

  app.get("/api/v1/relatorios/vendas-por-cliente", (c) =>
    RelatorioClientes.GET({ request: c.req.raw })
  );
  app.get("/api/v1/relatorios/vendas-por-destino", (c) =>
    RelatorioDestinos.GET({ request: c.req.raw })
  );
  app.get("/api/v1/relatorios/vendas-por-produto", (c) =>
    RelatorioProdutos.GET({ request: c.req.raw })
  );
  app.get("/api/v1/relatorios/produtos-recibos", (c) =>
    RelatorioProdutosRecibos.GET({ request: c.req.raw })
  );
  app.get("/api/v1/relatorios/cidades-busca", (c) =>
    RelatorioCidadesBusca.GET({ request: c.req.raw })
  );
  app.get("/api/v1/relatorios/vendas", (c) =>
    RelatorioVendas.GET({ request: c.req.raw })
  );
  app.get("/api/v1/relatorios/ranking-vendas", (c) =>
    RelatorioRanking.GET({ request: c.req.raw })
  );
  app.get("/api/v1/relatorios/base", (c) =>
    RelatorioBase.GET({ request: c.req.raw })
  );

  app.get("/api/v1/clientes/list", (c) => ClientesList.GET({ request: c.req.raw }));
  app.get("/api/v1/clientes/historico", (c) =>
    ClientesHistorico.GET({ request: c.req.raw })
  );
  app.delete("/api/v1/clientes/delete", (c) =>
    ClientesDelete.DELETE({ request: c.req.raw })
  );

  app.get("/api/v1/produtos/base", (c) => ProdutosBase.GET({ request: c.req.raw }));
  app.get("/api/v1/produtos/tarifas", (c) => ProdutosTarifas.GET({ request: c.req.raw }));
  app.post("/api/v1/produtos/tarifas", (c) => ProdutosTarifas.POST({ request: c.req.raw }));

  app.get("/api/v1/formas-pagamento/list", (c) =>
    FormasPagamentoList.GET({ request: c.req.raw })
  );
  app.post("/api/v1/formas-pagamento/create", (c) =>
    FormasPagamentoCreate.POST({ request: c.req.raw })
  );
  app.post("/api/v1/formas-pagamento/update", (c) =>
    FormasPagamentoUpdate.POST({ request: c.req.raw })
  );
  app.delete("/api/v1/formas-pagamento/delete", (c) =>
    FormasPagamentoDelete.DELETE({ request: c.req.raw })
  );

  app.get("/api/v1/mural/bootstrap", (c) => MuralBootstrap.GET({ request: c.req.raw }));
  app.get("/api/v1/mural/company", (c) => MuralCompany.GET({ request: c.req.raw }));
  app.get("/api/v1/mural/recados", (c) => MuralRecados.GET({ request: c.req.raw }));

  app.get("/api/v1/session/bootstrap", (c) =>
    SessionBootstrap.GET({ request: c.req.raw })
  );

  app.get("/api/v1/admin/summary", (c) => AdminSummary.GET({ request: c.req.raw }));

  app.get("/api/v1/viagens/dossie", (c) => ViagensDossie.GET({ request: c.req.raw }));
  app.post("/api/v1/viagens/dossie-batch", (c) =>
    ViagensDossieBatch.POST({ request: c.req.raw })
  );
  app.get("/api/v1/viagens/list", (c) => ViagensList.GET({ request: c.req.raw }));
  app.post("/api/v1/viagens/create", (c) => ViagensCreate.POST({ request: c.req.raw }));
  app.post("/api/v1/viagens/delete", (c) => ViagensDelete.POST({ request: c.req.raw }));
  app.get("/api/v1/viagens/clientes", (c) => ViagensClientes.GET({ request: c.req.raw }));
  app.get("/api/v1/viagens/cidades-busca", (c) =>
    ViagensCidadesBusca.GET({ request: c.req.raw })
  );
  app.get("/api/v1/orcamentos/list", (c) => OrcamentosList.GET({ request: c.req.raw }));
  app.post("/api/v1/orcamentos/delete", (c) => OrcamentosDelete.POST({ request: c.req.raw }));
  app.post("/api/v1/orcamentos/status", (c) => OrcamentosStatus.POST({ request: c.req.raw }));
  app.post("/api/v1/orcamentos/interaction", (c) =>
    OrcamentosInteraction.POST({ request: c.req.raw })
  );
  app.get("/api/v1/orcamentos/clientes", (c) =>
    OrcamentosClientes.GET({ request: c.req.raw })
  );
  app.get("/api/v1/orcamentos/tipos", (c) => OrcamentosTipos.GET({ request: c.req.raw }));
  app.get("/api/v1/orcamentos/cidades-busca", (c) =>
    OrcamentosCidadesBusca.GET({ request: c.req.raw })
  );
  app.get("/api/v1/orcamentos/produtos", (c) =>
    OrcamentosProdutos.GET({ request: c.req.raw })
  );
  app.post("/api/v1/orcamentos/cliente-create", (c) =>
    OrcamentosClienteCreate.POST({ request: c.req.raw })
  );
  app.post("/api/v1/orcamentos/save", (c) => OrcamentosSave.POST({ request: c.req.raw }));
  app.post("/api/v1/orcamentos/create", (c) => OrcamentosCreate.POST({ request: c.req.raw }));

  app.all("/api/*", (c) =>
    params.astroHandle(c.req.raw, c.env as Env, c.executionCtx as ExecutionContext)
  );

  return app;
}
