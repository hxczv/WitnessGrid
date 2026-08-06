"use client";

export default function IncidentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message =
    error.message && error.message.length < 200
      ? error.message
      : "The register could not be reached.";

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="rounded-md border hairline bg-surface/60 p-6">
        <p className="timecode text-flag">SERVICE UNAVAILABLE</p>
        <h1 className="mt-2 font-display text-2xl font-extrabold">
          This record could not be loaded
        </h1>
        <p className="mt-3 text-paper/70">
          {message} The record may still exist — try again in a moment.
        </p>
        <button type="button" className="btn btn-primary mt-6" onClick={() => reset()}>
          Try again
        </button>
      </div>
    </main>
  );
}
