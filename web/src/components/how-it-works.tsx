import { Camera, Check, MapPin } from "lucide-react";

const STEPS = [
  {
    Icon: Camera,
    title: "Record",
    body: "Photo or video from your camera or files. Everything is hashed and timestamped at capture, so the record is verifiable.",
  },
  {
    Icon: MapPin,
    title: "Pin it",
    body: "Drag the pin to the exact spot. GPS precision is recorded as the evidentiary floor; the pinned point is the stored location.",
  },
  {
    Icon: Check,
    title: "Publish",
    body: "Submit to the register under a pseudonymous witness account. Offline? It queues on your device and sends when you're back.",
  },
] as const;

export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works" className="mt-10">
      <h2 id="how-it-works" className="label">
        How the register works
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {STEPS.map(({ Icon, title, body }, i) => (
          <div key={title} className="rounded-md border hairline bg-surface/60 p-4">
            <div className="flex items-center gap-2">
              <Icon className="size-5 text-accent" aria-hidden />
              <span className="timecode text-accent">{String(i + 1).padStart(2, "0")}</span>
            </div>
            <h3 className="font-display mt-2 text-lg font-extrabold tracking-tight">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-fg/80">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
