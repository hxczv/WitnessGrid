export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      <div className="mt-2 space-y-3 text-fg/90">{children}</div>
    </section>
  );
}
