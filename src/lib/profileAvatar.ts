export const PROFILE_AVATAR_BUCKET = "profile-avatars";
export const MAX_PROFILE_AVATAR_BYTES = 5 * 1024 * 1024;

export function getProfileAvatarPath(userId: string) {
  return `${String(userId || "").trim()}/avatar`;
}

export function getUserInitials(name?: string | null, email?: string | null) {
  const source = String(name || email || "").trim();
  if (!source) return "U";

  const parts = source.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  const initials = `${first}${last}`.toUpperCase();

  return initials || source.slice(0, 2).toUpperCase();
}
