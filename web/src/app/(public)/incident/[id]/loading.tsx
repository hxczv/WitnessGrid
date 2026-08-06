export default function IncidentLoading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8" aria-busy="true" aria-label="Loading record">
      <div className="h-16 animate-pulse rounded-md border hairline bg-surface" />
      <div className="mt-6 aspect-video w-full animate-pulse rounded-md border hairline bg-surface" />
      <div className="mt-6 space-y-2">
        <div className="h-4 w-2/3 animate-pulse rounded border hairline bg-surface" />
        <div className="h-4 w-full animate-pulse rounded border hairline bg-surface" />
        <div className="h-4 w-5/6 animate-pulse rounded border hairline bg-surface" />
      </div>
    </main>
  );
}
