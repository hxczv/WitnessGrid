export const metadata = {
  title: "Content policy",
  description: "What may and may not be published on the WitnessGrid register.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <div className="mt-2 space-y-3 text-paper/80">{children}</div>
    </section>
  );
}

export default function ContentPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="timecode text-amber">CONTENT POLICY</p>
      <h1 className="font-display mt-2 text-3xl font-extrabold tracking-tight">
        What belongs on the register.
      </h1>
      <p className="mt-4 max-w-2xl text-paper/80">
        The register exists to record verified-format evidence of police
        interactions. We remove content that undermines that purpose.
      </p>

      <Section title="Allowed">
        <p>
          First-hand or entitled recordings of police interactions in public
          space; images and short video; your own contemporaneous account;
          objective details such as time, place, and officer count.
        </p>
      </Section>

      <Section title="Not allowed">
        <ul className="list-disc space-y-2 pl-6">
          <li>Illegal content, including indecent imagery.</li>
          <li>
            Content that identifies a real name, address, or other private detail
            of an officer, a bystander, or any vulnerable person — including your
            own real name.
          </li>
          <li>Harassment, abuse, or content designed to incite harm.</li>
          <li>Deliberate misinformation or fabrication presented as evidence.</li>
          <li>Content that reveals someone from their medical, sexual, or financial data.</li>
          <li>Anything you do not have the right to record or publish.</li>
        </ul>
      </Section>

      <Section title="How we enforce it">
        <p>
          Anyone can flag a record. Moderators review flags and remove records
          that breach this policy. Removed records disappear from the register. We
          may retain hashes to prevent re-upload of the same content.
        </p>
      </Section>

      <Section title="Privacy and dignity">
        <p>
          Blur faces of bystanders and children where possible. Keep the pin as
          accurate as you safely can, but never at the cost of someone&apos;s
          safety or privacy.
        </p>
      </Section>
    </main>
  );
}