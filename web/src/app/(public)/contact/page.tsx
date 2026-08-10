import type { Metadata } from "next";
import { Tartan } from "@/components/tartan";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach the people behind WitnessGrid.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-3xl font-extrabold tracking-tight">Contact.</h1>
      <p className="mt-2 text-fg/80">
        Questions about a record, a correction, or the register itself — email us.
      </p>
      <Tartan thin />
      <div className="mt-6 rounded-md border hairline bg-surface/60 p-5">
        <p className="label">Email</p>
        <a className="timecode text-accent underline-offset-4 hover:underline" href="mailto:contact@witnessgrid.app">
          contact@witnessgrid.app
        </a>
        <p className="mt-3 text-sm text-muted">
          Reports of harmful or unlawful content are also handled here. We aim to
          reply within one month, as required by UK data-protection law.
        </p>
      </div>
    </main>
  );
}
