import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import { MAPA_MODULOS, listarModulosComHeranca } from "../config/modulos";
import { isSystemAdminRole } from "./adminAccess";
import {
  ensurePermissoes,
  getPermissaoFromCache,
  readPermissoesCache,
  subscribePermissoes,
  type Permissao,
  type PermissoesCache,
} from "./permissoesCache";

type PermissoesState = {
  cache: PermissoesCache | null;
  loading: boolean;
  ready: boolean;
  userId: string | null;
  userEmail: string;
  userType: string;
  isSystemAdmin: boolean;
};

const initialCache = typeof window !== "undefined" ? readPermissoesCache() : null;
let state: PermissoesState = {
  cache: initialCache,
  loading: false,
  ready: Boolean(initialCache),
  userId: initialCache?.userId ?? null,
  userEmail: initialCache?.userEmail ?? "",
  userType: initialCache?.userType ?? "",
  isSystemAdmin: Boolean(initialCache?.isSystemAdmin),
};
const hydrationSnapshot: PermissoesState = {
  cache: null,
  loading: false,
  ready: false,
  userId: null,
  userEmail: "",
  userType: "",
  isSystemAdmin: false,
};

const listeners = new Set<() => void>();
let subscribed = false;
let refreshPromise: Promise<PermissoesCache | null> | null = null;

const permLevel = (p: Permissao | undefined): number => {
  switch (p) {
    case "admin":
      return 5;
    case "delete":
      return 4;
    case "edit":
      return 3;
    case "create":
      return 2;
    case "view":
      return 1;
    default:
      return 0;
  }
};

const emit = () => {
  listeners.forEach((listener) => listener());
};

const setState = (partial: Partial<PermissoesState>) => {
  state = { ...state, ...partial };
  emit();
};

const ensureSubscribed = () => {
  if (subscribed || typeof window === "undefined") return;
  subscribed = true;
  subscribePermissoes((cache) => {
    setState({
      cache,
      ready: true,
      userId: cache.userId ?? null,
      userEmail: cache.userEmail ?? "",
      userType: cache.userType ?? "",
      isSystemAdmin: Boolean(cache.isSystemAdmin),
    });
  });
};

export function getPermissoesSnapshot() {
  return state;
}

export function getPermissoesServerSnapshot() {
  return hydrationSnapshot;
}

export function subscribePermissoesStore(listener: () => void) {
  ensureSubscribed();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function refreshPermissoes() {
  if (refreshPromise) return refreshPromise;
  setState({ loading: true });

  refreshPromise = (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const sessionUser = sessionData?.session?.user;
      const { data: userData } = sessionUser
        ? { data: { user: sessionUser } }
        : await supabase.auth.getUser();

      const user = userData?.user || sessionUser || null;
      if (!user) {
        setState({
          cache: null,
          ready: true,
          userId: null,
          userEmail: "",
          userType: "",
          isSystemAdmin: false,
          loading: false,
        });
        return null;
      }

      const cache = await ensurePermissoes(user.id, user.email, { force: true });
      if (cache) {
        setState({
          cache,
          ready: true,
          userId: cache.userId ?? user.id,
          userEmail: cache.userEmail ?? user.email ?? "",
          userType: cache.userType ?? "",
          isSystemAdmin: Boolean(cache.isSystemAdmin),
          loading: false,
        });
      } else {
        setState({
          ready: true,
          userId: user.id,
          userEmail: user.email ?? "",
          userType: "",
          isSystemAdmin: isSystemAdminRole(null),
          loading: false,
        });
      }

      return cache;
    } catch (err) {
      console.error("Erro ao carregar permissoes", err);
      setState({ loading: false, ready: true });
      return null;
    }
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export function usePermissoesStore() {
  const [hydrated, setHydrated] = useState(false);
  const hasBackgroundRefreshedRef = useRef(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const subscribe = useCallback(
    (listener: () => void) => {
      if (!hydrated) return () => {};
      return subscribePermissoesStore(listener);
    },
    [hydrated]
  );

  const getSnapshot = useCallback(
    () => (hydrated ? getPermissoesSnapshot() : hydrationSnapshot),
    [hydrated]
  );

  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getPermissoesServerSnapshot);

  useEffect(() => {
    if (!hydrated) return;
    if (!snapshot.ready && !snapshot.loading) {
      setTimeout(() => {
        refreshPermissoes();
      }, 0);
    }
  }, [hydrated, snapshot.ready, snapshot.loading]);

  useEffect(() => {
    if (!hydrated) return;
    if (!snapshot.ready || snapshot.loading) return;
    const cacheUserId = snapshot.cache?.userId ?? snapshot.userId;
    if (!cacheUserId) return;
    if (hasBackgroundRefreshedRef.current) return;

    hasBackgroundRefreshedRef.current = true;

    setTimeout(() => {
      refreshPermissoes();
    }, 0);
  }, [hydrated, snapshot.ready, snapshot.loading, snapshot.cache?.updatedAt, snapshot.cache?.userId, snapshot.userId]);

  const acessos = snapshot.cache?.acessos || {};
  const userType = snapshot.cache?.userType ?? snapshot.userType ?? "";
  const isSystemAdmin =
    snapshot.cache?.isSystemAdmin ??
    snapshot.isSystemAdmin ??
    isSystemAdminRole(userType);
  const isAdmin = useMemo(
    () => Object.values(acessos).some((p) => p === "admin"),
    [acessos]
  );

  const canDb = useCallback(
    (moduloDb: string, min: Permissao = "view") => {
      if (isSystemAdmin) {
        return true;
      }
      const key = String(moduloDb || "").toLowerCase();
      const perm = acessos[key] ?? "none";
      return permLevel(perm) >= permLevel(min);
    },
    [acessos, isSystemAdmin]
  );

  const can = useCallback(
    (modulo: string, min: Permissao = "view") => {
      if (isSystemAdmin) {
        return true;
      }
      const labels = listarModulosComHeranca(modulo);
      return labels.some((label) => {
        const modDb = MAPA_MODULOS[label] || label;
        if (canDb(modDb, min)) return true;
        if (String(modDb).toLowerCase() !== String(label).toLowerCase()) {
          return canDb(label, min);
        }
        return false;
      });
    },
    [canDb, isSystemAdmin]
  );

  const getPermissao = useCallback(
    (modulo: string) =>
      getPermissaoFromCache(
        modulo,
        snapshot.userId ?? snapshot.cache?.userId ?? null,
        snapshot.cache
      ),
    [snapshot.cache, snapshot.userId]
  );

  return {
    ...snapshot,
    acessos,
    isAdmin,
    isSystemAdmin,
    userType,
    can,
    canDb,
    getPermissao,
    refresh: refreshPermissoes,
  };
}
