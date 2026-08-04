export function Timecode({ parts, className = "" }: { parts: string[]; className?: string }) {
  if (!parts?.length) return null;
  return <div className={`timecode ${className}`}>{parts.join(" · ")}</div>;
}