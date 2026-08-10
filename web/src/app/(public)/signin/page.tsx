"use client";

import { KeyRound, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { requestMagicLink, verifyMagicToken } from "@/lib/api";
import { safeNext } from "@/lib/redirect";
import { saveSession } from "@/lib/session";
import { StatusBanner } from "@/components/status-banner";

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Magic-link deep link (?token=… or ?t=…) auto-verifies on arrival.
  useEffect(() => {
    const token = params.get("token") ?? params.get("t");
    if (!token) return;
    setBusy(true);
    setError(null);
    void verifyMagicToken(token)
      .then((session) => {
        saveSession(session);
        router.replace(next);
      })
      .catch((err) => {
        setBusy(false);
        setError(
          err instanceof Error
            ? err.message
            : "That sign-in link is invalid or has expired. Request a new one below.",
        );
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const sendLink = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestMagicLink(email, username.trim() || undefined);
      setSentTo(email);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not send the link. Check your email address.",
      );
    } finally {
      setBusy(false);
    }
  };

  const verifyPasted = async () => {
    setBusy(true);
    setError(null);
    try {
      const session = await verifyMagicToken(tokenInput.trim());
      saveSession(session);
      router.replace(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "That sign-in link is invalid or has expired.",
      );
      setBusy(false);
    }
  };

  if (sentTo) {
    return (
      <div>
        <KeyRound className="size-8 text-accent" aria-hidden />
        <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight">
          Check your inbox
        </h1>
        <p className="mt-2 text-fg/80">
          We&apos;ve emailed a sign-in link to <span className="timecode text-accent">{sentTo}</span>.
          It lasts a short time and signs you in on this device. No password, ever.
        </p>
        {sentTo.endsWith("@example.com") || process.env.NODE_ENV !== "production" ? (
          <p className="timecode mt-3 rounded-md border hairline bg-surface/60 px-3 py-2 text-muted">
            Dev mode: the link is also printed in <code>backend/.dev-mail.log</code>.
          </p>
        ) : null}
        {error ? <div className="mt-4"><StatusBanner kind="error" message={error} /></div> : null}
        <label className="mt-5 block">
          <span className="label">Or paste a sign-in link</span>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="field"
              type="text"
              value={tokenInput}
              autoComplete="one-time-code"
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="token"
            />
            <button type="button" className="btn" disabled={busy || !tokenInput.trim()} onClick={() => void verifyPasted()}>
              {busy ? "Verifying…" : "Verify"}
            </button>
          </div>
        </label>
      </div>
    );
  }

  return (
    <div>
      <Mail className="size-8 text-accent" aria-hidden />
      <h1 className="mt-3 font-display text-2xl font-extrabold tracking-tight">
        Sign in to record
      </h1>
      <p className="mt-2 max-w-md text-fg/80">
        We email you a one-time link. First time here? The same link creates your
        pseudonymous witness account.
      </p>

      {error ? <div className="mt-4"><StatusBanner kind="error" message={error} /></div> : null}

      <form
        className="mt-5 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void sendLink();
        }}
      >
        <label className="block">
          <span className="label">Email address</span>
          <input
            className="field"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
        <label className="block">
          <span className="label">Username (first time only)</span>
          <input
            className="field"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="witness_0381"
            minLength={3}
            maxLength={20}
            pattern="[a-z0-9_]+"
          />
          <span className="text-xs text-muted">3–20 lowercase letters, numbers or underscores.</span>
        </label>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Sending…" : "Send me the link"}
        </button>
      </form>
    </div>
  );
}

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center px-4 py-12">
      <Suspense fallback={<p className="timecode text-muted">Loading…</p>}>
        <SignInForm />
      </Suspense>
    </main>
  );
}