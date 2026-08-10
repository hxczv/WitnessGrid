"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Camera, List, LogOut, Map, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { Wordmark } from "@/components/wordmark";

const ITEMS: ReadonlyArray<{
  href: string;
  label: string;
  Icon: typeof Map;
  exact?: boolean;
}> = [
  { href: "/map", label: "Map", Icon: Map },
  { href: "/report", label: "Report", Icon: Camera },
  { href: "/", label: "Feed", Icon: List, exact: true },
  { href: "/profile", label: "Profile", Icon: User },
];

function isActive(pathname: string, item: (typeof ITEMS)[number]): boolean {
  if (item.exact) return pathname === item.href;
  return pathname.startsWith(item.href);
}

export function Nav() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const username = useAuthStore((s) => s.user?.username);
  const clear = useAuthStore((s) => s.clear);

  const signOut = () => {
    clear();
    queryClient.clear();
  };

  const renderItems = (items: typeof ITEMS) =>
    items.map(({ href, label, Icon, exact }) => {
      const active = isActive(pathname, { href, label, Icon, exact });
      return { href, label, Icon, active };
    });

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r hairline bg-bg/85 backdrop-blur lg:flex">
        <Link href="/" className="flex h-16 items-center border-b hairline px-5">
          <Wordmark />
        </Link>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Primary navigation">
          {renderItems(ITEMS).map(({ href, label, Icon, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                active ? "bg-surface text-accent" : "text-fg/90 hover:bg-surface hover:text-fg"
              }`}
            >
              <Icon className="size-5" strokeWidth={2} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="border-t hairline p-3">
          {!hydrated ? null : token ? (
            <div className="flex flex-col gap-2">
              <Link
                href="/profile"
                className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm text-fg/90 hover:bg-surface"
              >
                <User className="size-5 text-verified" aria-hidden />
                <span className="truncate">{username}</span>
              </Link>
              <button
                type="button"
                onClick={signOut}
                className="flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm text-fg/90 hover:bg-surface hover:text-danger"
              >
                <LogOut className="size-5" aria-hidden />
                Sign out
              </button>
            </div>
          ) : (
            <Link href="/signin" className="btn btn-primary w-full">
              Sign in to report
            </Link>
          )}
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t hairline bg-bg/90 backdrop-blur lg:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Mobile navigation"
      >
        <div className="grid grid-cols-4">
          {renderItems(ITEMS).map(({ href, label, Icon, active }) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${
                active ? "text-accent" : "text-fg/80"
              }`}
            >
              <Icon className="size-6" strokeWidth={2} aria-hidden />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
