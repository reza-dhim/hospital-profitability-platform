"use client";

import { Button } from "@hpp/ui";
import { useAuth } from "../lib/auth-context";

/** Topbar's `userMenu` slot (docs/37_COMPONENT_LIBRARY.md) — current user's name plus the one logout action. */
export function UserMenu() {
  const { user, logout } = useAuth();

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-foreground">{user?.name}</span>
      <Button type="button" variant="outline" size="sm" onClick={() => void logout()}>
        Keluar
      </Button>
    </div>
  );
}
