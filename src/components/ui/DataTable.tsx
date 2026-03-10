import React from "react";
import { Spinner } from "@primer/react";

type DataTableProps = {
  className?: string;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  shellClassName?: string;
  headers: React.ReactNode;
  children?: React.ReactNode;
  loading?: boolean;
  loadingMessage?: React.ReactNode;
  empty?: boolean;
  emptyMessage?: React.ReactNode;
  colSpan: number;
};

export default function DataTable({
  className,
  containerClassName,
  containerStyle,
  shellClassName,
  headers,
  children,
  loading = false,
  loadingMessage = "Carregando...",
  empty = false,
  emptyMessage = "Nenhum registro encontrado.",
  colSpan,
}: DataTableProps) {
  const showLoading = loading;
  const showEmpty = !loading && empty;
  const showRows = !loading && !empty;

  return (
    <section className={["vtur-data-table-shell", shellClassName].filter(Boolean).join(" ")}>
      <div
        className={`table-container overflow-x-auto vtur-data-table-container ${containerClassName || ""}`.trim()}
        style={containerStyle}
      >
        <table className={`vtur-data-table ${className || ""}`.trim()}>
          <thead>{headers}</thead>
          <tbody>
            {showLoading && (
              <tr>
                <td colSpan={colSpan} className="table-loading-cell vtur-data-table-message-cell">
                  <div className="vtur-data-table-message" role="status" aria-live="polite">
                    <Spinner size="small" srText={null} />
                    <span>{loadingMessage}</span>
                  </div>
                </td>
              </tr>
            )}
            {showEmpty && (
              <tr>
                <td colSpan={colSpan} className="table-empty-cell vtur-data-table-message-cell">
                  <div className="vtur-data-table-message">{emptyMessage}</div>
                </td>
              </tr>
            )}
            {showRows && children}
          </tbody>
        </table>
      </div>
    </section>
  );
}
