import Link from "next/link";
import { Section } from "@/components/section";
import { Tartan } from "@/components/tartan";

export const metadata = {
  title: "About",
  description:
    "What WitnessGrid is, how recording works, and what makes a record evidence.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="timecode text-amber">ABOUT · WITNESSGRID</p>
      <h1 className="font-display mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
        A register, not a newsroom.
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-paper/80">
        WitnessGrid is a free, open-source public register of police interactions
        in the UK, recorded by the people who see them.
      </p>

      <Tartan className="my-8" />

      <Section title="Why it exists">
        <p>
          Dashcam footage is common, but recordings of public-world interactions
          are scattered across phones, unsearchable, and easy to lose. We collect
          them into one precise, pseudonymous, time-ordered register.
        </p>
      </Section>

      <Section title="How recording works">
        <p>
          A witness captures media, pins the exact location on a map, and files a
          record. The app records timestamps and coordinates at report time.
          Records are published immediately under a pseudonymous witness account —
          they do not involve a real name.
        </p>
      </Section>

      <Section title="What an entry means">
        <p>
          Every record on this register is the witness&apos;s own account. It has{" "}
          <strong>not</strong> been verified by WitnessGrid or anyone else. We mark
          it with a machine-generated UTC timecode and a content hash so the record
          itself is tamper-evident — but the truthfulness of what happened is a
          matter of evidence, not our assertion.
        </p>
      </Section>

      <Section title="Safety first">
        <p>
          Record only if it is safe to do so. Your safety matters more than any
          footage. Never put yourself at risk, and never upload anything that
          contains real names, faces beyond necessity, or sensitive details you do
          not want public.
        </p>
      </Section>

      <Section title="Governance and openness">
        <p>
          This is not a platform for anonymous smearing — reports that break our{" "}
          <Link href="/content-policy" className="text-amber underline-offset-4 hover:underline">
            content policy
          </Link>{" "}
          are removed. Records can be withdrawn by their witness at any time. See
          our{" "}
          <Link href="/privacy" className="text-amber underline-offset-4 hover:underline">
            privacy notice
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="text-amber underline-offset-4 hover:underline">
            terms
          </Link>
          .
        </p>
      </Section>
    </main>
  );
}