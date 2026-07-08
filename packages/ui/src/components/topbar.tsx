import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface TopbarProps {
  /** Hospital switcher slot (docs/03_MULTI_TENANT.md §4) — populated in a later sprint. */
  hospitalSwitcher?: ReactNode;
  /** Notification bell slot (docs/16_NOTIFICATION.md) — populated in a later sprint. */
  notifications?: ReactNode;
  userMenu?: ReactNode;
  className?: string;
}

export function Topbar({ hospitalSwitcher, notifications, userMenu, className }: TopbarProps) {
  return (
    <header
      className={cn(
        "flex h-14 items-center justify-between border-b border-border bg-background px-6",
        className
      )}
    >
      <div>{hospitalSwitcher}</div>
      <div className="flex items-center gap-4">
        {notifications}
        {userMenu}
      </div>
    </header>
  );
}
