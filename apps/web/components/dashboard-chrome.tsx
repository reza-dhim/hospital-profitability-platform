"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShell, Sidebar, Topbar } from "@hpp/ui";
import { NAV_ITEMS } from "../lib/nav";

export function DashboardChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <AppShell
      sidebar={
        <Sidebar
          items={NAV_ITEMS}
          activePath={pathname}
          linkComponent={Link}
          brand="Hospital Profitability"
        />
      }
      topbar={
        <Topbar
          hospitalSwitcher={<span className="text-sm text-muted-foreground">Rumah Sakit Contoh</span>}
        />
      }
    >
      {children}
    </AppShell>
  );
}
