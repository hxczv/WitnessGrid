"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-md border hairline bg-surface/60 p-6">
        <p className="timecode text-danger">SERVICE UNAVAILABLE</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold">Something went wrong</h1>
        <p className="mt-3 text-fg/80">
          The register could not be reached. Try again in a moment.
        </p>
        <button type="button" className="btn btn-primary mt-6" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </main>
  );
}
