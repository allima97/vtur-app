import { useEffect, useMemo, useState } from "react";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import { exportRoteiroPdfById, loadRoteiroPreviewHtmlById } from "../../lib/quote/exportRoteiroPdfClient";

type Props = {
  roteiroId: string;
  roteiroNome?: string | null;
};

export default function RoteiroVisualizarIsland({ roteiroId, roteiroNome }: Props) {
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
        const html = await loadRoteiroPreviewHtmlById({ roteiroId });
        if (canceled) {
          return;
        }
        setPreviewHtml(html);
      } catch (err: any) {
        if (canceled) return;
        console.error("[RoteiroVisualizar] Erro ao gerar previa:", err);
        setError(err?.message || "Nao foi possivel carregar a visualizacao do roteiro.");
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
  }, [roteiroId, refreshNonce]);

  async function handleDownloadPdf() {
    setExportingPdf(true);
    setError(null);
    try {
      await exportRoteiroPdfById({
        roteiroId,
        action: "download",
      });
    } catch (err: any) {
      console.error("[RoteiroVisualizar] Erro ao exportar PDF:", err);
      setError(err?.message || "Nao foi possivel exportar o PDF do roteiro.");
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
          title={roteiroNome ? `Visualizacao: ${roteiroNome}` : "Visualizacao do roteiro"}
          subtitle="Visualizacao do PDF no navegador para conferencia antes da exportacao."
        >
          <div className="orcamentos-action-bar">
            <AppButton
              type="button"
              variant="primary"
              onClick={handleDownloadPdf}
              disabled={exportingPdf}
              loading={exportingPdf}
            >
              {exportingPdf ? "Exportando..." : "Exportar PDF"}
            </AppButton>
            <AppButton
              type="button"
              variant="secondary"
              onClick={() => setRefreshNonce((value) => value + 1)}
              disabled={loadingPreview}
            >
              Atualizar visualizacao
            </AppButton>
            <AppButton
              as="a" href={`/orcamentos/personalizados/${roteiroId}`} variant="secondary">
              Editar
            </AppButton>
            <AppButton as="a" href="/orcamentos/personalizados" variant="secondary">
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
                    key={`${roteiroId}-${refreshNonce}`}
                    className="orcamento-preview-iframe"
                    aria-label={`preview-roteiro-${roteiroId}`}
                    title={`preview-roteiro-${roteiroId}`}
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
                  : "Nao encontramos conteudo para visualizacao deste roteiro."
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
      border-collapse: collapse;
    }
  </style>
</head>
<body>
  <div class="preview-page">${body}</div>
</body>
</html>`;
}
