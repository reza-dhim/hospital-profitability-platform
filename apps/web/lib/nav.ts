import {
  LayoutDashboard,
  Database,
  UploadCloud,
  SplitSquareVertical,
  LineChart,
  Stethoscope,
  Sparkles,
  FlaskConical,
  FileText,
  Settings,
} from "lucide-react";
import type { SidebarItem } from "@hpp/ui";

export interface NavItem extends SidebarItem {
  /**
   * Permission code(s) required to see this item, per docs/04_RBAC.md §2/§3.
   * An array is OR'd (any one grants visibility) — e.g. Settings bundles
   * hospital config, RBAC, and period closing, none of which every
   * administrative role holds together.
   */
  requiredPermission: string | string[];
}

/** The 9 routes per prompts/CODEX_INITIAL_PROMPT.md, gated per docs/04_RBAC.md §2's module table. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, requiredPermission: "profitability.read" },
  { label: "Master Data", href: "/master-data", icon: Database, requiredPermission: "master_data.read" },
  { label: "Upload Center", href: "/upload-center", icon: UploadCloud, requiredPermission: "upload.read" },
  {
    label: "Cost Allocation",
    href: "/cost-allocation",
    icon: SplitSquareVertical,
    requiredPermission: "cost_allocation.read",
  },
  { label: "Profitability", href: "/profitability", icon: LineChart, requiredPermission: "profitability.read" },
  {
    label: "Doctor Analytics",
    href: "/doctor-analytics",
    icon: Stethoscope,
    requiredPermission: "doctor_analytics.read",
  },
  { label: "AI Insights", href: "/ai-insights", icon: Sparkles, requiredPermission: "ai.use" },
  { label: "What-If Simulation", href: "/what-if", icon: FlaskConical, requiredPermission: "ai.use" },
  { label: "Reports", href: "/reports", icon: FileText, requiredPermission: "reports.read" },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    requiredPermission: ["hospital.write", "rbac.read", "period_closing.write"],
  },
];

/** Filters NAV_ITEMS down to what `permissions` grants access to (docs/04_RBAC.md §6 — enforcement is at the API layer; this only hides links the user couldn't act on anyway). */
export function getVisibleNavItems(items: NavItem[], permissions: string[]): SidebarItem[] {
  const granted = new Set(permissions);
  return items.filter((item) => {
    const required = Array.isArray(item.requiredPermission) ? item.requiredPermission : [item.requiredPermission];
    return required.some((permission) => granted.has(permission));
  });
}
