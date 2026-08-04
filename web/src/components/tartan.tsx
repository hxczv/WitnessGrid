export function Tartan({ thin = false, className = "" }: { thin?: boolean; className?: string }) {
  return <div role="presentation" aria-hidden className={`${thin ? "tartan-thin" : "tartan"} ${className}`} />;
}