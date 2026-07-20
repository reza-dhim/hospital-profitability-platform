"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShell, Sidebar, Topbar } from "@hpp/ui";
import { NAV_ITEMS, getVisibleNavItems } from "../lib/nav";
import { useAuth } from "../lib/auth-context";
import { UserMenu } from "./user-menu";

export function DashboardChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const items = getVisibleNavItems(NAV_ITEMS, user?.permissions ?? []);

  return (
    <AppShell
      sidebar={
        <Sidebar
          items={items}
          activePath={pathname}
          linkComponent={Link}
          brand="Hospital Profitability"
        />
      }
      topbar={
        <Topbar
          hospitalSwitcher={<span className="text-sm text-muted-foreground">Rumah Sakit Contoh</span>}
          userMenu={<UserMenu />}
        />
      }
    >
      {children}
    </AppShell>
  );
}
