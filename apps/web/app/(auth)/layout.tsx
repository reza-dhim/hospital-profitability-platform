import type { ReactNode } from "react";

export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center bg-muted px-4">{children}</div>;
}
