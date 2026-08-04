import type { Metadata } from "next";
import { listIncidents, serverApiBaseUrl } from "@/lib/api";
import type { Incident } from "@/lib/contract";
import { LoadMore } from "@/components/load-more";
import { SignInCta } from "@/components/sign-in-cta";
import { StatusBanner } from "@/components/status-banner";
import { Tartan } from "@/components/tartan";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Public register",
  description:
    "The public register of UK police interactions, recorded by witnesses.",
};

export default async function HomePage() {
  let items: Incident[] = [];
  let nextCursor: string | null = null;
  let error: string | null = null;
  let detail: string | null = null;

  try {
    const res = await listIncidents({ limit: 25 }, { baseUrl: serverApiBaseUrl() });
    items = res.items;
    nextCursor = res.next_cursor;
  } catch (err) {
    error = "The register is temporarily unavailable.";
    detail =
      err instanceof Error && err.message ? err.message : "The API could not be reached.";
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          The public register.
        </h1>
        <p className="mt-2 max-w-2xl text-paper/70">
          Every police interaction recorded by our witnesses — a precise,
          pseudonymous, unverified evidence register. Anyone can browse.
        </p>
        <div className="mt-4">
          <SignInCta />
        </div>
      </header>

      <Tartan thin />

      {error ? (
        <div className="py-8">
          <StatusBanner kind="error" message={error} detail={detail ?? undefined} />
        </div>
      ) : null}

      <LoadMore initialItems={items} initialCursor={nextCursor} ssrFailed={Boolean(error)} />

      <p className="mt-4 px-3 text-xs text-paper/50">
        Reports are the witnesses&apos; own recordings and have not been
        independently verified. Timestamps and coordinates were captured at
        record time and may be adjusted by the witness.
      </p>
    </main>
  );
}