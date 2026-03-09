import React, { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

type MaintenanceStatus = {
  maintenance_enabled: boolean;
  maintenance_message: string | null;
  updated_at: string | null;
};

type ViewState = "loading" | "login" | "forbidden" | "admin";

export default function MaintenanceAccessIsland() {
  const [view, setView] = useState<ViewState>("loading");
  const [status, setStatus] = useState<MaintenanceStatus>({
    maintenance_enabled: false,
    maintenance_message: null,
    updated_at: null,
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setView("loading");
      setMessage(null);
      const resp = await fetch("/api/v1/admin/maintenance");
      if (resp.status === 401) {
        setView("login");
        return;
      }
      if (resp.status === 403) {
        setView("forbidden");
        return;
      }
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      const payload = (await resp.json()) as MaintenanceStatus;
      setStatus({
        maintenance_enabled: Boolean(payload?.maintenance_enabled),
        maintenance_message: payload?.maintenance_message ?? null,
        updated_at: payload?.updated_at ?? null,
      });
      setView("admin");
    } catch (err) {
      console.error(err);
      setMessage("Erro ao carregar status de manutencao.");
      setView("login");
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    const emailTrim = email.trim().toLowerCase();
    if (!emailTrim || !password) {
      setMessage("Informe e-mail e senha.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: emailTrim,
      password,
    });

    if (error) {
      setMessage("Falha no login. Verifique seus dados.");
      return;
    }

    await loadStatus();
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    setEmail("");
    setPassword("");
    setView("login");
  }

  async function handleSave() {
    try {
      setSaving(true);
      setMessage(null);
      const resp = await fetch("/api/v1/admin/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maintenance_enabled: status.maintenance_enabled,
          maintenance_message: status.maintenance_message,
        }),
      });
      if (!resp.ok) {
        throw new Error(await resp.text());
      }
      setMessage("Status de manutencao atualizado.");
    } catch (err) {
      console.error(err);
      setMessage("Erro ao salvar manutencao.");
    } finally {
      setSaving(false);
    }
  }

  if (view === "loading") {
    return <div className="maintenance-admin">Carregando acesso...</div>;
  }

  if (view === "forbidden") {
    return (
      <div className="maintenance-admin">
        <h2>Area restrita</h2>
        <p>Somente administradores podem alterar o modo de manutencao.</p>
        <button type="button" className="maintenance-btn" onClick={handleSignOut}>
          Sair
        </button>
      </div>
    );
  }

  if (view === "login") {
    return (
      <div className="maintenance-admin">
        <h2>Acesso administrativo</h2>
        <p>Entre para liberar o sistema ou manter a manutencao ativa.</p>
        {message && <div className="maintenance-alert">{message}</div>}
        <form className="maintenance-form" onSubmit={handleLogin}>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.toLowerCase())}
              placeholder="admin@email.com"
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="maintenance-btn">
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="maintenance-admin">
      <div className="maintenance-admin-header">
        <div>
          <h2>Painel de manutencao</h2>
          <p>Somente administradores podem liberar o acesso ao sistema.</p>
        </div>
        <button type="button" className="maintenance-btn ghost" onClick={handleSignOut}>
          Sair
        </button>
      </div>
      {message && <div className="maintenance-alert">{message}</div>}
      <div className="maintenance-toggle">
        <label>
          <input
            type="checkbox"
            checked={status.maintenance_enabled}
            onChange={(e) =>
              setStatus((prev) => ({ ...prev, maintenance_enabled: e.target.checked }))
            }
          />
          Ativar modo de manutencao
        </label>
        <button type="button" className="maintenance-btn" onClick={handleSave} disabled={saving}>
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
      {status.updated_at && (
        <div className="maintenance-meta">Ultima alteracao: {new Date(status.updated_at).toLocaleString()}</div>
      )}
      {!status.maintenance_enabled && (
        <a className="maintenance-link" href="/dashboard/admin">
          Ir para o painel administrativo
        </a>
      )}
    </div>
  );
}
