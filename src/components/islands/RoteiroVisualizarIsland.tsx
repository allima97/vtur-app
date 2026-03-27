import { useEffect, useRef, useState } from "react";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppPrimerProvider from "../ui/primer/AppPrimerProvider";
import { exportRoteiroPdfById } from "../../lib/quote/exportRoteiroPdfClient";

type Props = {
  roteiroId: string;
  roteiroNome?: string | null;
};

export default function RoteiroVisualizarIsland({ roteiroId, roteiroNome }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);

  useEffect(() => {
    previewRef.current = previewUrl;
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (previewRef.current) {
        URL.revokeObjectURL(previewRef.current);
        previewRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let canceled = false;

    async function loadPreview() {
      setLoadingPreview(true);
      setError(null);
      try {
        const blobUrl = await exportRoteiroPdfById({
          roteiroId,
          action: "blob-url",
        });

        if (typeof blobUrl !== "string") {
          throw new Error("Nao foi possivel gerar a visualizacao do PDF.");
        }

        if (canceled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }

        setPreviewUrl((previous) => {
          if (previous && previous !== blobUrl) {
            URL.revokeObjectURL(previous);
          }
          return blobUrl;
        });
      } catch (err: any) {
        if (canceled) return;
        console.error("[RoteiroVisualizar] Erro ao gerar previa:", err);
        setError(err?.message || "Nao foi possivel carregar a visualizacao do roteiro.");
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

  function handleOpenNewTab() {
    if (!previewUrl || typeof window === "undefined") return;
    const opened = window.open(previewUrl, "_blank", "noopener,noreferrer");
    if (!opened) {
      setError("O navegador bloqueou a abertura da nova aba do PDF.");
    }
  }

  return (
    <AppPrimerProvider>
      <div className="page-content-wrap orcamentos-visualizar-page">
        <AppCard
          tone="info"
          className="mb-3 list-toolbar-sticky"
          title={roteiroNome ? `Visualizacao: ${roteiroNome}` : "Visualizacao do roteiro"}
          subtitle="A previa HTML usa exatamente o mesmo PDF final gerado para exportacao."
          actions={
            <div className="orcamentos-action-bar vtur-actions-end">
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
                type="button"
                variant="ghost"
                onClick={handleOpenNewTab}
                disabled={!previewUrl}
              >
                Abrir em nova aba
              </AppButton>
              <AppButton as="a" href={`/orcamentos/personalizados/${roteiroId}`} variant="secondary">
                Editar
              </AppButton>
              <AppButton as="a" href="/orcamentos/personalizados" variant="secondary">
                Voltar
              </AppButton>
            </div>
          }
        />

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
          {loadingPreview && !previewUrl ? (
            <EmptyState
              title="Gerando visualizacao"
              description="Aguarde alguns segundos enquanto montamos o mesmo PDF da exportacao."
            />
          ) : null}

          {previewUrl ? (
            <div className="orcamento-preview-shell">
              <div className="orcamento-preview-frame-wrap">
                <iframe
                  title={`preview-roteiro-${roteiroId}`}
                  src={previewUrl}
                  className="orcamento-preview-frame"
                />
              </div>
            </div>
          ) : null}
        </AppCard>
      </div>
    </AppPrimerProvider>
  );
}
