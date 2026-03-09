import React, { useEffect, useMemo, useState } from "react";
import { StreamChat, Channel } from "stream-chat";

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
    <div className="card-base" style={{ padding: 12, display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <h3 style={{ margin: 0 }}>Stream Chat</h3>
        {disabled && (
          <span style={{ color: "#b91c1c" }}>Defina PUBLIC_STREAM_API_KEY</span>
        )}
      </div>

      <form onSubmit={handleConnect} className="form-row" style={{ gap: 8, flexWrap: "wrap" }}>
        <input
          className="form-input"
          style={{ minWidth: 140 }}
          placeholder="User ID"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
        <input
          className="form-input"
          style={{ minWidth: 220, flex: 1 }}
          placeholder="Token gerado no backend"
          value={userToken}
          onChange={(e) => setUserToken(e.target.value)}
        />
        <input
          className="form-input"
          style={{ minWidth: 160 }}
          placeholder="Channel ID"
          value={channelId}
          onChange={(e) => setChannelId(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={connecting || disabled}>
          {connecting ? "Conectando..." : "Conectar"}
        </button>
      </form>
      {error && <div style={{ color: "#b91c1c" }}>{error}</div>}

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
            <input
              className="form-input"
              style={{ flex: 1 }}
              placeholder="Digite sua mensagem"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className="btn btn-primary">Enviar</button>
          </form>
        </div>
      ) : (
        <div style={{ color: "#94a3b8" }}>Conecte-se para ver mensagens.</div>
      )}
    </div>
  );
}
