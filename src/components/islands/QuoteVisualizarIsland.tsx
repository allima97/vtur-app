import { useEffect, useMemo, useState } from "react";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import { exportQuotePdfById, loadQuotePreviewHtmlById } from "../../lib/quote/exportQuotePdfClient";

type Props = {
  quoteId: string;
};

export default function QuoteVisualizarIsland({ quoteId }: Props) {
  const [previewHtml, setPreviewHtml] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewSrcDoc = useMemo(() => buildPreviewSrcDoc(previewHtml), [previewHtml]);

  useEffect(() => {
    let canceled = false;

    async function loadPreview() {
      setLoadingPreview(true);
      setError(null);
      try {
        const html = await loadQuotePreviewHtmlById({
          quoteId,
          showItemValues: true,
          showSummary: true,
        });

        if (canceled) return;
        setPreviewHtml(html);
      } catch (err: any) {
        if (canceled) return;
        console.error("[QuoteVisualizar] Erro ao gerar previa:", err);
        setError(err?.message || "Nao foi possivel carregar a visualizacao do orcamento.");
        setPreviewHtml("");
      } finally {
        if (!canceled) {
          setLoadingPreview(false);
        }
      }
    }

    void loadPreview();

    return () => {
      canceled = true;
    };
  }, [quoteId, refreshNonce]);

  async function handleDownloadPdf() {
    setExportingPdf(true);
    setError(null);
    try {
      await exportQuotePdfById({
        quoteId,
        showItemValues: true,
        showSummary: true,
        action: "download",
      });
    } catch (err: any) {
      console.error("[QuoteVisualizar] Erro ao exportar PDF:", err);
      setError(err?.message || "Nao foi possivel exportar o PDF do orcamento.");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap orcamentos-visualizar-page">
        <AppCard
          tone="info"
          className="mb-3 list-toolbar-sticky"
          title="Visualizacao do orcamento"
          subtitle="Visualizacao HTML com a mesma estrutura visual do modelo de PDF."
        >
          <div className="orcamentos-action-bar">
            <AppButton
              type="button"
              variant="primary"
              onClick={handleDownloadPdf}
              disabled={exportingPdf}
              loading={exportingPdf}
            >
              {exportingPdf ? "Gerando..." : "Gerar PDF"}
            </AppButton>
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => setRefreshNonce((value) => value + 1)}
              disabled={loadingPreview}
            >
              Atualizar visualizacao
            </AppButton>
            <AppButton as="a" href={`/orcamentos/${quoteId}`} variant="secondary">
              Editar
            </AppButton>
            <AppButton as="a" href="/orcamentos/consulta" variant="secondary">
              Voltar
            </AppButton>
          </div>
        </AppCard>

        {error && (
          <AlertMessage variant="error" className="mb-3">
            {error}
          </AlertMessage>
        )}

        <AppCard
          tone="config"
          title="Previa 1:1 do PDF"
          subtitle="Visualizacao em escala amigavel para conferencia antes do envio ao cliente."
        >
          {loadingPreview && !previewHtml ? (
            <EmptyState
              title="Gerando visualizacao"
              description="Aguarde alguns segundos enquanto montamos a visualizacao HTML."
            />
          ) : null}

          {previewHtml ? (
            <div className="orcamento-preview-shell">
              <div className="orcamento-preview-frame-wrap">
                <div className="orcamento-preview-frame">
                  <iframe
                    key={`${quoteId}-${refreshNonce}`}
                    className="orcamento-preview-iframe"
                    aria-label={`preview-orcamento-${quoteId}`}
                    title={`preview-orcamento-${quoteId}`}
                    srcDoc={previewSrcDoc}
                    sandbox=""
                  />
                </div>
              </div>
            </div>
          ) : null}

          {!loadingPreview && !previewHtml ? (
            <EmptyState
              title="Visualizacao indisponivel"
              description={
                error
                  ? "Nao foi possivel montar a visualizacao HTML agora. Clique em Atualizar visualizacao para tentar novamente."
                  : "Nao encontramos conteudo para visualizacao neste orcamento."
              }
            />
          ) : null}
        </AppCard>
      </div>
    </AppPrimerProvider>
  );
}

function buildPreviewSrcDoc(previewHtml: string) {
  const body = previewHtml || "<div></div>";
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      background: #f3f6fb;
      font-family: Nunito, Arial, sans-serif;
      color: #0f172a;
    }
    .preview-page {
      width: min(100%, 900px);
      margin: 14px auto;
      background: #ffffff;
      border: 1px solid #d7deea;
      border-radius: 12px;
      padding: 16px;
    }
    .preview-page img {
      max-width: 100%;
      width: auto !important;
      height: auto !important;
      object-fit: contain;
    }
    .preview-page table {
      max-width: 100%;
      border-collapse: separate;
    }
  </style>
</head>
<body>
  <div class="preview-page">${body}</div>
</body>
</html>`;
}
