export default function FeedLoading() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading the register">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="h-32 animate-pulse rounded-md border hairline bg-surface"
        />
      ))}
    </div>
  );
}
