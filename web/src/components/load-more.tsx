"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { listIncidents } from "@/lib/api";
import type { Incident } from "@/lib/contract";
import { feedFiltersKey, type FeedFilters } from "@/lib/feed-filters";
import { RegisterList } from "@/components/register-row";

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
      <RegisterList incidents={items} />
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
          <p className="timecode text-paper/40">— end of register —</p>
        )}
      </div>
    </section>
  );
}