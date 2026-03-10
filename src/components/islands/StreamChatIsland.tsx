import React, { useEffect, useMemo, useState } from "react";
import { StreamChat, Channel } from "stream-chat";
import AlertMessage from "../ui/AlertMessage";
import EmptyState from "../ui/EmptyState";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";
import AppField from "../ui/primer/AppField";

const API_KEY = import.meta.env.PUBLIC_STREAM_API_KEY || "";

export default function StreamChatIsland() {
  const [client, setClient] = useState<StreamChat | null>(null);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [userId, setUserId] = useState("");
  const [userToken, setUserToken] = useState("");
  const [channelId, setChannelId] = useState("general");
  const [messages, setMessages] = useState<{ id: string; text: string; user?: string }[]>([]);
  const [input, setInput] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (client) client.disconnectUser();
    };
  }, [client]);

  const disabled = !API_KEY;

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    if (disabled) return;
    if (!userId || !userToken) {
      setError("Informe usuário e token.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const c = StreamChat.getInstance(API_KEY);
      await c.disconnectUser();
      await c.connectUser({ id: userId }, userToken);
      const ch = c.channel("messaging", channelId || "general", { name: channelId || "general" });
      await ch.watch();
      setClient(c);
      setChannel(ch);
      const history = await ch.state?.messages || [];
      setMessages(history.map((m) => ({ id: m.id, text: m.text || "", user: m.user?.id })));
    } catch (err) {
      console.error(err);
      setError("Falha ao conectar. Confira token e API key.");
    } finally {
      setConnecting(false);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!channel || !input.trim()) return;
    const text = input.trim();
    setInput("");
    const sent = await channel.sendMessage({ text });
    setMessages((prev) => [...prev, { id: sent.id, text: sent.text || "", user: sent.user?.id }]);
  }

  return (
    <AppCard
      tone="info"
      title="Stream Chat"
      subtitle="Canal em tempo real para suporte e operacao."
      actions={disabled ? <span style={{ color: "#b91c1c" }}>Defina PUBLIC_STREAM_API_KEY</span> : undefined}
    >
      <form onSubmit={handleConnect} className="form-row" style={{ gap: 8, flexWrap: "wrap" }}>
        <AppField
          as="input"
          label="User ID"
          placeholder="User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          wrapperClassName="min-w-[140px]"
        />
        <AppField
          as="input"
          label="Token"
          placeholder="Token gerado no backend"
          value={userToken}
          onChange={(e) => setUserToken(e.target.value)}
          wrapperClassName="min-w-[220px] flex-1"
        />
        <AppField
          as="input"
          label="Canal"
          placeholder="Channel ID"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
          wrapperClassName="min-w-[160px]"
        />
        <div className="form-group" style={{ alignSelf: "end" }}>
          <AppButton type="submit" variant="primary" disabled={connecting || disabled}>
            {connecting ? "Conectando..." : "Conectar"}
          </AppButton>
        </div>
      </form>
      {error && <AlertMessage variant="error">{error}</AlertMessage>}

      {channel ? (
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, minHeight: 360, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 10, borderBottom: "1px solid #e2e8f0", fontWeight: 700 }}>Canal: {channelId}</div>
          <div style={{ flex: 1, padding: 10, overflowY: "auto", display: "grid", gap: 6 }}>
            {messages.map((m) => (
              <div key={m.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 8 }}>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 2 }}>{m.user || "anon"}</div>
                <div>{m.text}</div>
              </div>
            ))}
          </div>
          <form onSubmit={sendMessage} style={{ display: "flex", gap: 8, padding: 10, borderTop: "1px solid #e2e8f0" }}>
            <AppField
              as="input"
              label="Mensagem"
              placeholder="Digite sua mensagem"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              wrapperClassName="flex-1"
            />
            <div className="form-group" style={{ alignSelf: "end" }}>
              <AppButton type="submit" variant="primary">
                Enviar
              </AppButton>
            </div>
          </form>
        </div>
      ) : (
        <EmptyState title="Sem conexao ativa" description="Conecte-se para ver mensagens." />
      )}
    </AppCard>
  );
}
