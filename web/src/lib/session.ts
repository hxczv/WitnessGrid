import type { Session } from "@/lib/contract";
import { useAuthStore } from "@/store/auth";

export function getSessionToken(): string | null {
  return useAuthStore.getState().token;
}

export function saveSession(session: Session): void {
  useAuthStore.getState().setSession(session);
}
