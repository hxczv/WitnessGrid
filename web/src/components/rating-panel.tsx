"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { getIncident, rateIncident } from "@/lib/api";
import type { RatingSummary } from "@/lib/contract";
import { useAuthStore } from "@/store/auth";

const AXES = [
  { key: "appropriateness", label: "Appropriateness" },
  { key: "professionalism", label: "Professionalism" },
  { key: "safety", label: "Safety" },
] as const;

type AxisKey = (typeof AXES)[number]["key"];

// One 1–5 radiogroup. Implements the WAI-ARIA radio pattern: arrow keys move
// and select, roving tabindex keeps the group at one tab stop.
function AxisRating({
  label,
  mine,
  disabled,
  pending,
  onSelect,
}: {
  label: string;
  mine: number | null;
  disabled: boolean;
  pending: boolean;
  onSelect: (value: number) => void;
}) {
  const [focused, setFocused] = useState<number | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const active = mine ?? focused ?? 1;

  const moveTo = (value: number) => {
    const clamped = Math.min(5, Math.max(1, value));
    setFocused(clamped);
    buttonRefs.current[clamped - 1]?.focus();
    onSelect(clamped);
  };

  const onKeyDown = (event: React.KeyboardEvent, current: number) => {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        moveTo(current + 1);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        moveTo(current - 1);
        break;
      case "Home":
        event.preventDefault();
        moveTo(1);
        break;
      case "End":
        event.preventDefault();
        moveTo(5);
        break;
      default:
        break;
    }
  };

  return (
    <div className="mt-1 flex gap-1" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          ref={(el) => {
            buttonRefs.current[n - 1] = el;
          }}
          type="button"
          role="radio"
          aria-checked={mine === n}
          aria-label={`${label}: ${n} of 5${mine === n ? " (your rating)" : ""}`}
          tabIndex={active === n ? 0 : -1}
          disabled={disabled || pending}
          onKeyDown={(e) => onKeyDown(e, n)}
          onFocus={() => setFocused(n)}
          onClick={() => onSelect(n)}
          className={`h-11 w-11 rounded-md border hairline font-mono text-sm ${
            mine !== null && n <= mine
              ? "border-accent bg-accent/15 text-accent"
              : "text-muted"
          } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function RatingPanel({
  incidentId,
  ownerUserId,
  serverSummary,
}: {
  incidentId: string;
  ownerUserId: string | null;
  serverSummary: RatingSummary | null;
}) {
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const isOwner = user !== null && user.id === ownerUserId;

  const { data: incident } = useQuery({
    queryKey: ["incident", incidentId, token ?? null],
    queryFn: () => getIncident(incidentId, { token: token ?? undefined }),
    enabled: Boolean(token),
  });

  const summary: RatingSummary | null = incident?.rating_summary ?? serverSummary;

  const rate = useMutation({
    mutationFn: (scores: { appropriateness: number; professionalism: number; safety: number }) =>
      rateIncident(incidentId, scores, { token: token ?? undefined }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["incident", incidentId] }),
  });

  if (isOwner) return null;
  const count = summary?.count ?? 0;

  const select = (key: AxisKey, value: number) => {
    const existing = summary?.my;
    rate.mutate({
      appropriateness: existing ? existing.appropriateness : value,
      professionalism: existing ? existing.professionalism : value,
      safety: existing ? existing.safety : value,
      [key]: value,
    });
  };

  return (
    <section aria-label="Ratings" className="mb-8 rounded-md border hairline bg-surface/60 p-5">
      <h2 className="label">Ratings</h2>
      <p className="mt-1 text-sm text-fg/80">
        {count === 0
          ? "No ratings yet."
          : `Averaged from ${count} rating${count === 1 ? "" : "s"}.`}
      </p>
      {AXES.map(({ key, label }) => {
        const mine = summary?.my?.[key] ?? null;
        const avg = summary?.[`${key}_avg`] ?? null;
        return (
          <div key={key} className="mt-3">
            <div className="flex items-baseline justify-between">
              <span className="timecode text-fg/80">{label}</span>
              <span className="timecode text-accent" data-testid={`rating-avg-${key}`}>
                {avg === null ? "—" : `${avg} / 5`}
              </span>
            </div>
            <AxisRating
              label={label}
              mine={mine}
              disabled={!token}
              pending={rate.isPending}
              onSelect={(value) => select(key, value)}
            />
          </div>
        );
      })}
      {!token ? <p className="mt-4 text-xs text-muted">Sign in to rate this record.</p> : null}
      {rate.isError ? <p className="mt-2 text-xs text-danger">Could not save your rating.</p> : null}
    </section>
  );
}
