import React, { useEffect, useMemo, useState } from "react";
import { usePermissoesStore } from "../../lib/permissoesStore";
import AppButton from "../ui/primer/AppButton";
import AppCard from "../ui/primer/AppCard";

const DISMISS_KEY = "push_optin_dismissed_at";
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function getDismissedAt() {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  const val = Number(raw || 0);
  return Number.isFinite(val) ? val : 0;
}

function setDismissedNow() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushNotificationsIsland() {
  const { ready, loading, can } = usePermissoesStore();
  const publicKey = import.meta.env.PUBLIC_VAPID_PUBLIC_KEY as string | undefined;
  const podeVerConsultoria = can("Consultoria Online") || can("Consultoria");
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [promptHidden, setPromptHidden] = useState(false);

  const canPrompt = useMemo(() => {
    if (!publicKey) return false;
    if (permission !== "default") return false;
    if (!podeVerConsultoria) return false;
    const dismissedAt = getDismissedAt();
    return Date.now() - dismissedAt > DISMISS_MS && !promptHidden;
  }, [permission, promptHidden, publicKey, podeVerConsultoria]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPermission("unsupported");
      return;
    }
    setPermission(Notification.permission);
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => setRegistration(reg))
      .catch((err) => console.warn("Falha ao registrar service worker:", err));
  }, []);

  useEffect(() => {
    if (!registration) return;
    if (permission !== "granted") return;
    if (!ready || loading) return;
    if (!podeVerConsultoria) return;
    if (!publicKey) return;

    const ensureSubscription = async () => {
      try {
        const existing = await registration.pushManager.getSubscription();
        const subscription =
          existing ||
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          }));

        await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
      } catch (err) {
        console.warn("Nao foi possivel registrar push:", err);
      }
    };

    ensureSubscription();
  }, [registration, permission, ready, loading]);

  const requestPermission = async () => {
    if (!("Notification" in window)) return;
    setSubscribing(true);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === "denied") {
        setDismissedNow();
        setPromptHidden(true);
      }
    } finally {
      setSubscribing(false);
    }
  };

  const dismissPrompt = () => {
    setDismissedNow();
    setPromptHidden(true);
  };

  if (!canPrompt || permission === "unsupported") return null;

  return (
    <AppCard
      className="push-optin"
      tone="info"
      title="Ativar notificacoes"
      subtitle="Receba lembretes de consultoria mesmo fora do sistema."
      actions={
        <div className="push-optin-actions">
          <AppButton type="button" variant="primary" onClick={requestPermission} disabled={subscribing}>
            {subscribing ? "Ativando..." : "Ativar"}
          </AppButton>
          <AppButton type="button" variant="secondary" onClick={dismissPrompt}>
            Agora nao
          </AppButton>
        </div>
      }
    >
      <div className="push-optin-text">Notificacoes web para agenda e consultoria.</div>
    </AppCard>
  );
}
