"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserX } from "lucide-react";
import { deleteAccount } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

const PHRASE = "delete my account";

export function DeleteAccount() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const clear = useAuthStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAccount({ token });
      clear();
      router.push("/");
      router.refresh();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Could not delete your account.");
    }
  };

  const matched = typed.trim().toLowerCase() === PHRASE;

  return (
    <section className="mt-6 rounded-md border border-flag/40 bg-flag/5 p-5">
      <h2 className="font-display text-base font-bold text-flag">Delete your account</h2>
      <p className="mt-1 text-sm text-paper/70">
        Erases your account and personal data. Your submitted incidents and footage
        remain in the public register with attribution removed, because uploading
        waives their deletion (see Terms).
      </p>
      {!open ? (
        <button type="button" className="btn btn-danger mt-3" onClick={() => setOpen(true)}>
          <UserX className="size-4" aria-hidden />
          Delete account
        </button>
      ) : (
        <div className="mt-4 rounded-md border hairline bg-surface/60 p-4">
          <p className="timecode text-flag">This cannot be undone.</p>
          <label className="mt-3 block">
            <span className="label">Type “delete my account” to confirm</span>
            <input
              className="field"
              value={typed}
              autoComplete="off"
              aria-label="type delete my account to confirm"
              onChange={(e) => setTyped(e.target.value)}
            />
          </label>
          {error ? <p className="mt-3 text-sm text-flag">{error}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy || !matched}
              onClick={() => void submit()}
            >
              {busy ? "Deleting…" : "Delete my account forever"}
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
