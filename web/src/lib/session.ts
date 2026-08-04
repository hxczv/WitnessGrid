import type { Session, SessionUser } from "@/lib/contract";
import { useAuthStore } from "@/store/auth";

export function getSessionToken(): string | null {
  return useAuthStore.getState().token;
}

export function getSessionUser(): SessionUser | null {
  return useAuthStore.getState().user;
}

export function isAuthed(): boolean {
  const s = useAuthStore.getState();
  return Boolean(s.token && s.user);
}

export function saveSession(session: Session): void {
  useAuthStore.getState().setSession(session);
}

export function clearSession(): void {
  useAuthStore.getState().clear();
}

/** Authorization headers for authenticated API calls. */
export function withAuth(): Record<string, string> {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}