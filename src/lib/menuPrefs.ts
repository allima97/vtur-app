import type { CSSProperties } from "react";

export type MenuPrefsV1 = {
  v: 1;
  hidden: string[];
  order: Record<string, string[]>; // sectionKey -> itemKeys
  section?: Record<string, string>; // itemKey -> sectionKey (override)
};

const VERSION: MenuPrefsV1["v"] = 1;
const STORAGE_PREFIX = "sgtur:menuPrefs:";
export const MENU_PREFS_UPDATED_EVENT = "sgtur:menuPrefsUpdated";

export function menuPrefsStorageKey(userId: string) {
  return `${STORAGE_PREFIX}${VERSION}:${userId}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function normalizeMenuPrefs(raw: unknown): MenuPrefsV1 {
  const fallback: MenuPrefsV1 = { v: VERSION, hidden: [], order: {}, section: {} };
  if (!isPlainObject(raw)) return fallback;
  const v = raw.v === VERSION ? VERSION : VERSION;

  const hidden = Array.isArray(raw.hidden) ? raw.hidden.map(String).filter(Boolean) : [];
  const order: Record<string, string[]> = {};
  if (isPlainObject(raw.order)) {
    Object.entries(raw.order).forEach(([section, value]) => {
      if (!section) return;
      if (!Array.isArray(value)) return;
      const cleaned = value.map(String).filter(Boolean);
      if (cleaned.length > 0) order[section] = cleaned;
    });
  }

  const section: Record<string, string> = {};
  const rawSection = (raw as any)?.section;
  if (isPlainObject(rawSection)) {
    Object.entries(rawSection).forEach(([itemKey, sectionKey]) => {
      const k = String(itemKey || "").trim();
      const v = String(sectionKey || "").trim();
      if (!k || !v) return;
      section[k] = v;
    });
  }

  return {
    v,
    hidden: Array.from(new Set(hidden)),
    order,
    section,
  };
}

export function readMenuPrefs(userId: string | null | undefined): MenuPrefsV1 {
  const fallback: MenuPrefsV1 = { v: VERSION, hidden: [], order: {}, section: {} };
  if (typeof window === "undefined") return fallback;
  if (!userId) return fallback;
  try {
    const raw = window.localStorage.getItem(menuPrefsStorageKey(userId));
    if (!raw) return fallback;
    return normalizeMenuPrefs(JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function writeMenuPrefs(userId: string, prefs: MenuPrefsV1) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(menuPrefsStorageKey(userId), JSON.stringify(prefs));
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(MENU_PREFS_UPDATED_EVENT, { detail: { userId } }));
  } catch {}
}

export function isMenuItemHidden(prefs: MenuPrefsV1, itemKey: string) {
  return prefs.hidden.includes(itemKey);
}

export function toggleMenuItemHidden(prefs: MenuPrefsV1, itemKey: string, next?: boolean): MenuPrefsV1 {
  const set = new Set(prefs.hidden);
  const shouldHide = typeof next === "boolean" ? next : !set.has(itemKey);
  if (shouldHide) set.add(itemKey);
  else set.delete(itemKey);
  return { ...prefs, hidden: Array.from(set) };
}

export function getEffectiveItemSection(
  prefs: MenuPrefsV1,
  itemKey: string,
  defaultSection: string
): string {
  const override = prefs.section?.[itemKey];
  return (override ? String(override) : "").trim() || defaultSection;
}

export function setMenuItemSection(
  prefs: MenuPrefsV1,
  itemKey: string,
  defaultSection: string,
  nextSection: string
): MenuPrefsV1 {
  const cleanedItem = String(itemKey || "").trim();
  const cleanedNext = String(nextSection || "").trim();
  if (!cleanedItem) return prefs;

  const base = String(defaultSection || "").trim();
  const map = { ...(prefs.section || {}) };

  if (!cleanedNext || (base && cleanedNext === base)) {
    delete map[cleanedItem];
  } else {
    map[cleanedItem] = cleanedNext;
  }

  return { ...prefs, section: map };
}

export function getEffectiveSectionOrder(
  prefs: MenuPrefsV1,
  sectionKey: string,
  itemKeys: string[]
): string[] {
  const available = itemKeys.filter(Boolean);
  const stored = (prefs.order?.[sectionKey] || []).filter((key) => available.includes(key));
  const remaining = available.filter((key) => !stored.includes(key));
  return [...stored, ...remaining];
}

export function setSectionOrder(prefs: MenuPrefsV1, sectionKey: string, nextOrder: string[]): MenuPrefsV1 {
  const cleaned = nextOrder.map(String).filter(Boolean);
  return { ...prefs, order: { ...(prefs.order || {}), [sectionKey]: cleaned } };
}

export function moveKeyInOrder(order: string[], key: string, direction: "up" | "down") {
  const idx = order.indexOf(key);
  if (idx === -1) return order;
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= order.length) return order;
  const next = [...order];
  [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
  return next;
}

export function menuItemStyle(args: {
  prefs: MenuPrefsV1;
  sectionKey: string;
  itemKey: string;
  defaultIndex: number;
  locked?: boolean;
}): CSSProperties {
  const { prefs, sectionKey, itemKey, defaultIndex, locked } = args;
  const custom = prefs.order?.[sectionKey] || [];
  const idx = custom.indexOf(itemKey);
  const order = idx >= 0 ? idx : 1000 + defaultIndex;

  if (!locked && isMenuItemHidden(prefs, itemKey)) {
    return { order, display: "none" };
  }

  return { order };
}
