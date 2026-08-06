"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Session, SessionUser } from "@/lib/contract";

interface AuthState {
  token: string | null;
  user: SessionUser | null;
  hydrated: boolean;
  setSession: (session: Session) => void;
  clear: () => void;
  markHydrated: () => void;
}

const noopStorage: Storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  key: () => null,
  length: 0,
  clear: () => undefined,
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      hydrated: false,
      setSession: (session) => set({ token: session.token, user: session.user }),
      clear: () => set({ token: null, user: null }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "witnessgrid.session",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" && window.localStorage ? window.localStorage : noopStorage,
      ),
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    },
  ),
);