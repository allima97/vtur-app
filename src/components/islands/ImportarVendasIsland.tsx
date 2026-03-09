import React, { useRef, useState } from "react";

function cleanEncoding(str: any): string {
  if (typeof str !== "string") return String(str ?? "");
  return str
    .replace(/[\u2013\u2014\u2018\u2019\u201c\u201d\u2022\u20ac\u00e2\u0080\u0093\u0094\u0098\u0099]+/g, "")
    .replace(/[â€˜â€™â€œâ€â€¢â€“â€”â€]/g, "")
    .replace(/[\uFFFD]+/g, "")
    .replace(/^[^a-zA-Z0-9]+/, "")
    .trim();
}

export default function ImportarVendasIsland() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setStatus("Selecione um arquivo Excel (.xlsx)");
      return;
    }
    setStatus("Processando arquivo...");
    try {
      const buffer = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<any>(sheet, { defval: null });
      const vendas = rows
        .filter((row: any) => row?.CONSULTOR && row?.["VALOR TOTAL"])
        .map((row: any) => ({
          consultor: cleanEncoding(row.CONSULTOR),
          valor: Number(row["VALOR TOTAL"]) || 0,
          data: cleanEncoding(row.DATA),
          recibo: cleanEncoding(row["RECIBO/LOC"]),
          cidade: cleanEncoding(row.CIDADE),
          pais: cleanEncoding(row.PAIS),
        }));

      setStatus(`Importação concluída: ${vendas.length} vendas importadas.`);
    } catch (err) {
      setStatus("Erro ao processar arquivo.");
    }
  }

  return (
    <div className="card-base card-config" style={{ maxWidth: 500, margin: "0 auto" }}>
      <h2>Importar Vendas (Excel)</h2>
      <form onSubmit={handleUpload}>
        <input
          type="file"
          accept=".xlsx"
          ref={inputRef}
          onChange={e => setFile(e.target.files?.[0] || null)}
          style={{ marginBottom: 12 }}
        />
        <button className="btn btn-primary" type="submit">Importar</button>
      </form>
      {status && <div style={{ marginTop: 12 }}>{status}</div>}
    </div>
  );
}
