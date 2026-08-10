"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Camera } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { listIncidents } from "@/lib/api";
import type { Incident } from "@/lib/contract";
import { feedFiltersKey, type FeedFilters } from "@/lib/feed-filters";
import { RegisterList } from "@/components/register-row";

const hasFilters = (f: FeedFilters) => Boolean(f.q || f.type || f.policeForce);

export function LoadMore({
  initialItems,
  initialCursor,
  ssrFailed = false,
  filters,
}: {
  initialItems: Incident[];
  initialCursor: string | null;
  ssrFailed?: boolean;
  filters: FeedFilters;
}) {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isError, refetch } =
    useInfiniteQuery({
      queryKey: ["feed", feedFiltersKey(filters)],
      initialPageParam: undefined as string | undefined,
      queryFn: ({ pageParam }) =>
        listIncidents({
          limit: 25,
          q: filters.q || undefined,
          type: filters.type,
          policeForce: filters.policeForce,
          cursor: pageParam,
        }),
      getNextPageParam: (last) => last.next_cursor ?? undefined,
      initialData: {
        pages: [{ items: initialItems, next_cursor: initialCursor }],
        pageParams: [undefined],
      },
    });

  useEffect(() => {
    if (ssrFailed) void refetch();
  }, [ssrFailed, refetch]);

  const items = data?.pages.flatMap((p) => p.items) ?? initialItems;

  return (
    <section aria-label="Register pages" className="mt-2">
      <p aria-live="polite" className="sr-only">
        {items.length} record{items.length === 1 ? "" : "s"} shown
      </p>
      {items.length === 0 && !isError && !ssrFailed ? (
        hasFilters(filters) ? (
          <div className="rounded-md border hairline bg-surface/40 px-6 py-10 text-center">
            <p className="font-display text-xl font-extrabold tracking-tight">
              No records match these filters.
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-fg/80">
              Try a different search term or clear the filters to see the whole register.
            </p>
          </div>
        ) : (
          <div className="rounded-md border hairline bg-surface/40 px-6 py-12 text-center">
            <p className="font-display text-xl font-extrabold tracking-tight">
              No records on the register yet.
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-fg/80">
              The register starts with its first witness. Have you seen something
              worth recording? Capture it safely and add it to the register.
            </p>
            <Link href="/report" className="btn btn-primary mt-5">
              <Camera className="size-5" aria-hidden />
              Record an encounter
            </Link>
          </div>
        )
      ) : (
        <RegisterList incidents={items} />
      )}
      <div className="flex items-center justify-center py-8">
        {isError || (ssrFailed && items.length === 0) ? (
          <button type="button" className="btn" onClick={() => refetch()}>
            Retry loading the register
          </button>
        ) : hasNextPage ? (
          <button
            type="button"
            className="btn"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? "Loading…" : "Load more records"}
          </button>
        ) : (
          <p className="timecode text-muted">— end of register —</p>
        )}
      </div>
    </section>
  );
}