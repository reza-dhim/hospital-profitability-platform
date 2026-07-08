import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface AppShellProps {
  sidebar: ReactNode;
  topbar: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Top-level layout: sidebar + topbar + content area. docs/37_COMPONENT_LIBRARY.md §1. */
export function AppShell({ sidebar, topbar, children, className }: AppShellProps) {
  return (
    <div className={cn("flex h-screen w-full overflow-hidden bg-background", className)}>
      <div className="hidden shrink-0 md:block">{sidebar}</div>
      <div className="flex min-w-0 flex-1 flex-col">
        {topbar}
        <main className="flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
