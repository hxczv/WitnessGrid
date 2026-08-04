export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-display text-lg font-extrabold tracking-tight text-paper ${className}`}
    >
      <span className="inline-grid h-7 w-7 place-items-center rounded-sm bg-amber font-display text-base font-extrabold text-ink">
        W
      </span>
      <span>
        <span className="text-amber">ITNESS</span>GRID
      </span>
    </span>
  );
}