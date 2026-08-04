"use client";

import { Flag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { apiPost } from "@/lib/api";
import { REPORT_REASONS, type ReportReason } from "@/lib/contract";
import { useAuthStore } from "@/store/auth";

const REASON_LABELS: Record<ReportReason, string> = {
  illegal_content: "Illegal content",
  harassment: "Harassment",
  misinformation: "Misinformation",
  privacy: "Privacy concern",
  other: "Other",
};

export function ReportIncident({ incidentId }: { incidentId: string }) {
  const token = useAuthStore((s) => s.token);
  const [reason, setReason] = useState<ReportReason>("other");
  const [detail, setDetail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <Link href={`/signin?next=/incident/${incidentId}`} className="btn">
        <Flag className="size-4" aria-hidden />
        Sign in to report this record
      </Link>
    );
  }

  const submit = async () => {
    setState("busy");
    setError(null);
    try {
      await apiPost(
        "/report",
        { incident_id: incidentId, reason, detail },
        { token },
      );
      setState("done");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not send the report.");
    }
  };

  if (state === "done") {
    return (
      <p className="timecode rounded-md border border-verified/50 bg-verified/10 px-3 py-2 text-verified">
        Report received. Our moderation queue will review it.
      </p>
    );
  }

  return (
    <div className="rounded-md border hairline bg-surface/60 p-4">
      <h2 className="font-display text-base font-bold">Report this record</h2>
      <p className="mt-1 text-sm text-paper/70">
        Flag clearly illegal content, harassment, misinformation or privacy
        problems. Reports are reviewed by moderators.
      </p>
      <label className="mt-3 block">
        <span className="label">Reason</span>
        <select
          className="field"
          value={reason}
          onChange={(e) => setReason(e.target.value as ReportReason)}
        >
          {REPORT_REASONS.map((r) => (
            <option key={r} value={r}>
              {REASON_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-3 block">
        <span className="label">Details (optional)</span>
        <textarea
          className="field min-h-24 resize-y"
          maxLength={2000}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="What should we look at?"
        />
      </label>
      {state === "error" ? (
        <p className="mt-2 text-sm text-flag">{error}</p>
      ) : null}
      <button
        type="button"
        className="btn btn-danger mt-3 w-full"
        disabled={state === "busy"}
        onClick={() => void submit()}
      >
        {state === "busy" ? "Sending…" : "Send report"}
      </button>
    </div>
  );
}