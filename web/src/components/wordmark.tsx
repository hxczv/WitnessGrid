export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-2 font-display text-lg font-extrabold tracking-tight text-fg ${className}`}
    >
      <span className="inline-grid h-7 w-7 place-items-center rounded-sm bg-accent font-display text-base font-extrabold text-on-accent">
        W
      </span>
      <span>WITNESSGRID</span>
    </span>
  );
}
