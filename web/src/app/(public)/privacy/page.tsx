import Link from "next/link";

export const metadata = {
  title: "Privacy notice",
  description: "How WitnessGrid handles your data and your right to erasure.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <div className="mt-2 space-y-3 text-paper/80">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="timecode text-amber">PRIVACY NOTICE</p>
      <h1 className="font-display mt-2 text-3xl font-extrabold tracking-tight">
        Your data, kept minimal.
      </h1>

      <Section title="What we collect">
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Your email address (sign-in only) and the pseudonymous username you
            choose.
          </li>
          <li>
            The content you submit: media, a map pin, timestamps, and your
            written account.
          </li>
          <li>Technical basics: IP, user agent, and whether your device is online.</li>
        </ul>
      </Section>

      <Section title="What we do not collect">
        <p>
          We do not collect your real name, your contact list, your exact location
          unless you choose a pin, or any analytics that link your browser to your
          identity beyond what is needed to run the service.
        </p>
      </Section>

      <Section title="Pseudonymity">
        <p>
          Reading the register requires no account. Recording requires a
          pseudonymous account identified by a chosen username — never your real
          name. Do not upload media containing your real name or face.
        </p>
      </Section>

      <Section title="Who sees records">
        <p>
          Submitted records are public by design. Moderators can see reported
          content during review. Only you can see your unpublished drafts, which
          live on your device until you go online.
        </p>
      </Section>

      <Section title="Your rights">
        <p>
          You can delete any of your records permanently from your{" "}
          <Link href="/profile" className="text-amber underline-offset-4 hover:underline">
            profile
          </Link>{" "}
          at any time. For questions, requests, or erasure beyond self-service,
          contact us and we will respond within one month.
        </p>
      </Section>

      <Section title="Retention">
        <p>
          Records remain until withdrawn. Deleted record content is removed from
          active storage permanently, and removed from register listings
          immediately.
        </p>
      </Section>
    </main>
  );
}