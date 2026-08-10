"use client";

import Link from "next/link";
import { Camera } from "lucide-react";
import { useAuthStore } from "@/store/auth";

export function SignInCta() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const token = useAuthStore((s) => s.token);
  if (!hydrated) return null;
  if (token) {
    return (
      <Link href="/report" className="btn btn-primary">
        <Camera className="size-5" aria-hidden />
        Report an encounter
      </Link>
    );
  }
  return (
    <Link href="/signin?next=/report" className="btn btn-primary">
      Sign in to report
    </Link>
  );
}