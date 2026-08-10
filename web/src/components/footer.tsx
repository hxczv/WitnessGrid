import Link from "next/link";
import { Wordmark } from "@/components/wordmark";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/terms", label: "Terms" },
  { href: "/content-policy", label: "Content policy" },
  { href: "/privacy", label: "Privacy" },
  { href: "/contact", label: "Contact" },
] as const;

export function Footer() {
  return (
    <footer className="mt-16 border-t hairline pb-24 lg:pb-8">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <Wordmark className="mb-4 justify-center lg:justify-start" />
        <p className="mx-auto max-w-xl text-center text-sm text-muted lg:text-left">
          WitnessGrid is a free, open-source evidence register. Reports are the
          witnesses&apos; own recordings; they have not been verified by anyone.
          Only record if it is safe to do so.
        </p>
        <nav className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-fg/90 lg:justify-start" aria-label="Policies">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="underline-offset-4 hover:text-accent hover:underline">
              {l.label}
            </Link>
          ))}
        </nav>
        <p className="timecode mt-8 text-center text-muted lg:text-left">
          witnessgrid · open source · MIT licence
        </p>
      </div>
    </footer>
  );
}