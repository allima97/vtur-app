import React, { useEffect, useMemo, useState } from "react";
import { formatDateBR } from "../../lib/format";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";

type UsuarioItem = {
  id: string;
  nome_completo: string | null;
  email: string | null;
  data_nascimento: string | null;
  role: string;
  company_id: string | null;
  company_nome: string | null;
};

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export default function AniversariantesColaboradoresIsland() {
  const [items, setItems] = useState<UsuarioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const initialMonth = useMemo(() => new Date().getMonth() + 1, []);
  const [month, setMonth] = useState<number>(initialMonth);

  useEffect(() => {
    let cancelled = false;
    async function fetchAniversariantes() {
      try {
        setLoading(true);
        setErro(null);

        const params = new URLSearchParams();
        params.set("month", String(month));

        const resp = await fetch(`/api/v1/users/aniversariantes?${params.toString()}`);
        if (!resp.ok) throw new Error(await resp.text());
        const payload = await resp.json();
        const nextItems = Array.isArray(payload?.items) ? (payload.items as UsuarioItem[]) : [];
        if (!cancelled) setItems(nextItems);
      } catch (error) {
        console.error("[Aniversariantes] erro ao buscar aniversariantes:", error);
        if (!cancelled) setErro("Erro ao buscar aniversariantes.");
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAniversariantes();
    return () => {
      cancelled = true;
    };
  }, [month]);

  if (loading) return <AppCard tone="info">Carregando aniversariantes...</AppCard>;
  if (erro) return <AlertMessage variant="error">{erro}</AlertMessage>;

  return (
    <AppCard
      className="aniversariantes-colaboradores-card"
      tone="info"
      style={{ marginBottom: 16 }}
      title="Aniversariantes (colaboradores)"
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div />
        <AppField
          as="select"
          label="Mes"
          value={String(month)}
          onChange={(e) => setMonth(Number(e.target.value))}
          style={{ maxWidth: 180 }}
          options={MONTHS.map((label, idx) => ({ value: String(idx + 1), label }))}
        />
      </div>

      {!items.length ? (
        <EmptyState title="Sem aniversariantes" description="Nenhum aniversariante neste mes." />
      ) : (
        <ul style={{ paddingLeft: 16 }}>
          {items.map((u) => (
            <li key={u.id} style={{ marginBottom: 6 }}>
              <strong>{u.nome_completo || "(Sem nome)"}</strong>
              {u.role ? ` — ${u.role}` : ""}
              {u.company_nome ? ` (${u.company_nome})` : ""} — {formatDateBR(u.data_nascimento)}
            </li>
          ))}
        </ul>
      )}
    </AppCard>
  );
}
