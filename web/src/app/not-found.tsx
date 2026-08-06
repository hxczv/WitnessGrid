import Link from "next/link";
import { Tartan } from "@/components/tartan";

export const metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl flex-col justify-center px-4 py-16 text-center">
      <p className="timecode text-accent">ERROR 404 · NO SUCH RECORD</p>
      <h1 className="font-display mt-3 text-3xl font-extrabold tracking-tight">
        That page is not on the register.
      </h1>
      <p className="mt-3 text-fg/80">
        The link may be wrong, or the record may have been withdrawn by its
        witness.
      </p>
      <div className="mt-6">
        <Link href="/" className="btn btn-primary">
          Back to the register
        </Link>
      </div>
      <Tartan className="mt-10" />
    </main>
  );
}