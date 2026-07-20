import type { ReactNode } from "react";
import { DashboardChrome } from "../../components/dashboard-chrome";
import { RouteGuard } from "../../components/route-guard";

export default function DashboardGroupLayout({ children }: { children: ReactNode }) {
  return (
    <RouteGuard>
      <DashboardChrome>{children}</DashboardChrome>
    </RouteGuard>
  );
}
