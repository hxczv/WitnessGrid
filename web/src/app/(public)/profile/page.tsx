"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, LogOut, RefreshCw } from "lucide-react";
import Link from "next/link";
import { listMyIncidents } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { AlertsList } from "@/components/alerts-list";
import { DeleteAccount } from "@/components/delete-account";
import { RegisterList } from "@/components/register-row";
import { SavedAreasManager } from "@/components/saved-areas-manager";
import { StatsMeSection } from "@/components/stats-me";
import { StatusBanner } from "@/components/status-banner";

export default function ProfilePage() {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();

  const signOut = () => {
    clear();
    queryClient.clear();
  };

  const mine = useQuery({
    queryKey: ["my-incidents"],
    queryFn: () => listMyIncidents({ limit: 50 }, { token: token ?? undefined }),
    enabled: Boolean(token),
  });

  if (!token || !user) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Link href="/signin?next=/profile" className="btn btn-primary">
          Sign in to see your records
        </Link>
      </main>
    );
  }

  const incidents = mine.data?.items ?? [];
  const count = mine.data ? incidents.length : undefined;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="rounded-md border hairline bg-surface/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="timecode text-accent">@{user.username}</p>
            <p className="mt-1 text-fg/80">{user.email}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn" disabled={mine.isFetching} onClick={() => void mine.refetch()}>
              <RefreshCw className="size-4" aria-hidden />
              Refresh
            </button>
            <button type="button" className="btn" onClick={signOut}>
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </div>
        </div>
        <p className="timecode mt-4 border-t hairline pt-3 text-muted">
          {count === undefined ? "loading…" : `${count} record${count === 1 ? "" : "s"}`} · your
          pseudonymous register
        </p>
      </header>

      {mine.isError ? (
        <div className="py-6">
          <StatusBanner
            kind="error"
            message="Could not load your records."
            detail={mine.error instanceof Error ? mine.error.message : undefined}
          />
        </div>
      ) : null}

      <div className="py-6">
        {count !== undefined && count === 0 ? (
          <div className="text-center">
            <p className="text-fg/80">You haven&apos;t recorded anything yet.</p>
            <Link href="/report" className="btn btn-primary mt-4">
              <Camera className="size-4" aria-hidden />
              Record your first encounter
            </Link>
          </div>
        ) : (
          <RegisterList incidents={incidents} />
        )}
      </div>

      <StatsMeSection token={token} />
      <SavedAreasManager token={token} />
      <AlertsList token={token} />
      <DeleteAccount />
    </main>
  );
}