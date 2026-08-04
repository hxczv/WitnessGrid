"use client";

import { Camera, List, LogOut, Map, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { Wordmark } from "@/components/wordmark";

const ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  Icon: typeof Map;
  match?: (p: string) => boolean;
}> = [
  { href: "/map", label: "Map", Icon: Map },
  { href: "/report", label: "Report", Icon: Camera },
  { href: "/", label: "Feed", Icon: List, match: (p: string) => p === "/" },
  { href: "/profile", label: "Profile", Icon: User },
  { href: "/signin", label: "Sign in", Icon: User },
];

function isActive(pathname: string, item: (typeof ITEMS)[number]): boolean {
  if (item.match) return item.match(pathname);
  if (item.href === "/map") return pathname.startsWith("/map");
  if (item.href === "/profile") return pathname.startsWith("/profile");
  return false;
}

export function Nav() {
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const clear = useAuthStore((s) => s.clear);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r hairline bg-ink/85 backdrop-blur lg:flex">
        <Link href="/" className="flex h-16 items-center border-b hairline px-5">
          <Wordmark />
        </Link>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Primary">
          {ITEMS.filter((i) => i.href !== "/signin").map(({ href, label, Icon }) => {
            const active = isActive(pathname, { href, label, Icon });
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                  active ? "bg-surface text-amber" : "text-paper/80 hover:bg-surface hover:text-paper"
                }`}
              >
                <Icon className="size-5" strokeWidth={2} aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t hairline p-3">
          {token ? (
            <div className="flex flex-col gap-2">
              <Link
                href="/profile"
                className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm text-paper/80 hover:bg-surface"
              >
                <User className="size-5 text-verified" aria-hidden />
                <span className="timecode truncate">{useAuthStore.getState().user?.username}</span>
              </Link>
              <button
                type="button"
                onClick={() => clear()}
                className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm text-paper/80 hover:bg-surface hover:text-flag"
              >
                <LogOut className="size-5" aria-hidden />
                Sign out
              </button>
            </div>
          ) : (
            <Link
              href="/signin"
              className="btn btn-primary w-full"
            >
              Sign in to report
            </Link>
          )}
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t hairline bg-ink/90 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Primary"
      >
        <div className="grid grid-cols-4">
          {ITEMS.filter((i) => i.href !== "/signin").map(({ href, label, Icon }) => {
            const active = isActive(pathname, { href, label, Icon });
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                  active ? "text-amber" : "text-paper/70"
                }`}
              >
                <Icon className="size-6" strokeWidth={2} aria-hidden />
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}