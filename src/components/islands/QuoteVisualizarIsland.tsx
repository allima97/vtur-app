import { useEffect, useRef, useState } from "react";
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
  const previewScrollRef = useRef<HTMLDivElement | null>(null);

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
        if (previewScrollRef.current) {
          previewScrollRef.current.scrollTop = 0;
        }
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
                  <div
                    ref={previewScrollRef}
                    className="orcamento-html-preview-wrap"
                    aria-label={`preview-orcamento-${quoteId}`}
                  >
                    <div
                      className="orcamento-html-preview"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </div>
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
