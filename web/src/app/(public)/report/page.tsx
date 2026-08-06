import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { ReportWizard } from "@/components/report-wizard";

export const metadata = {
  title: "Report an encounter",
  description:
    "Record a police interaction: capture media, pin the exact location on a map, and file a pseudonymous record.",
};

export default function ReportPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Report an encounter.
        </h1>
        <p className="mt-2 max-w-2xl text-fg/80">
          Three steps: capture what you saw, pin exactly where it happened, then
          add the details. Nothing leaves this device until you finish.
        </p>
      </header>

      <ReportWizard />

      <p className="mt-8 flex items-start gap-2 rounded-md border hairline bg-surface/60 p-4 text-sm text-fg/80">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-verified" aria-hidden />
        <span>
          Record only if it is safe to do so. You report under a pseudonym and can
          withdraw a record at any time from your{" "}
          <Link href="/profile" className="text-accent underline-offset-4 hover:underline">
            profile
          </Link>
          . Read the{" "}
          <Link href="/content-policy" className="text-accent underline-offset-4 hover:underline">
            content policy
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-accent underline-offset-4 hover:underline">
            privacy notice
          </Link>{" "}
          before submitting.
        </span>
      </p>
    </main>
  );
}