export default function StatsLoading() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8" aria-busy="true" aria-label="Loading statistics">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-md border hairline bg-surface" />
        ))}
      </div>
      <div className="mt-6 h-64 animate-pulse rounded-md border hairline bg-surface" />
    </main>
  );
}
