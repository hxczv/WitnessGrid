import Link from "next/link";
import { Section } from "@/components/section";

export const metadata = {
  title: "Terms of use",
  description: "The terms that govern your use of WitnessGrid.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="timecode text-accent">TERMS · EFFECTIVE ALWAYS</p>
      <h1 className="font-display mt-2 text-3xl font-extrabold tracking-tight">
        Terms of use.
      </h1>

      <Section title="1. What this service is">
        <p>
          WitnessGrid provides a public register of self-reported police
          interactions. Entries are unverified accounts by witnesses, not
          adjudications of fact.
        </p>
      </Section>

      <Section title="2. Your account">
        <p>
          You are responsible for your witness account and for everything
          submitted through it. Choose a username that does not reveal your
          identity, and do not share your sign-in link.
        </p>
      </Section>

      <Section title="3. Your submissions">
        <p>
          You retain responsibility for what you submit. You confirm that you have
          the right to record and publish the content, that it complies with our{" "}
          <Link href="/content-policy" className="text-accent underline-offset-4 hover:underline">
            content policy
          </Link>
          , and that you will not use the register to harass, defame, or endanger
          people.
        </p>
      </Section>

      <Section title="4. Withdrawal and removal">
        <p>
          You can permanently delete your own records from your profile. We may
          remove or refuse any record that breaches our content policy or the law.
        </p>
      </Section>

      <Section title="5. Public-record retention">
        <p>
          By submitting media to WitnessGrid you grant a perpetual, irrevocable
          right to retain and display it as part of the public register. Uploading
          waives deletion of that public-record footage. While your account exists
          you may withdraw an incident (which removes it and its media); account
          deletion erases your account and personal data but your submitted
          incidents remain, anonymized.
        </p>
      </Section>

      <Section title="6. No advice, no guarantee">
        <p>
          We do not give legal advice. WitnessGrid is provided free and without
          warranty of any kind. To the extent permitted by law we are not liable
          for indirect or consequential loss arising from your use.
        </p>
      </Section>

      <Section title="7. Changes">
        <p>
          We may update these terms from time to time. Continued use after changes
          means you accept the new terms.
        </p>
      </Section>
    </main>
  );
}