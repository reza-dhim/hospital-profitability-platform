import {
  LayoutDashboard,
  Database,
  UploadCloud,
  SplitSquareVertical,
  LineChart,
  Stethoscope,
  Sparkles,
  FileText,
  Settings,
} from "lucide-react";
import type { SidebarItem } from "@hpp/ui";

/**
 * The 9 placeholder routes per prompts/CODEX_INITIAL_PROMPT.md. Role-aware
 * filtering (docs/04_RBAC.md) is applied by the caller in a later sprint —
 * this list is unfiltered.
 */
export const NAV_ITEMS: SidebarItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Master Data", href: "/master-data", icon: Database },
  { label: "Upload Center", href: "/upload-center", icon: UploadCloud },
  { label: "Cost Allocation", href: "/cost-allocation", icon: SplitSquareVertical },
  { label: "Profitability", href: "/profitability", icon: LineChart },
  { label: "Doctor Analytics", href: "/doctor-analytics", icon: Stethoscope },
  { label: "AI Insights", href: "/ai-insights", icon: Sparkles },
  { label: "Reports", href: "/reports", icon: FileText },
  { label: "Settings", href: "/settings", icon: Settings },
];
