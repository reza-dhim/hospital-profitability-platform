import type { ReactNode } from "react";
import { DashboardChrome } from "../../components/dashboard-chrome";

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return <DashboardChrome>{children}</DashboardChrome>;
}
