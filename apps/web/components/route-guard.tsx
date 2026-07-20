"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoadingSkeleton } from "@hpp/ui";
import { useAuth } from "../lib/auth-context";

/** Gates every `(dashboard)` route behind authentication. Loading/redirect states per AGENTS.md's per-page state mandate. */
export function RouteGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useAuth();

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <div className="p-6">
        <LoadingSkeleton />
      </div>
    );
  }

  return <>{children}</>;
}
