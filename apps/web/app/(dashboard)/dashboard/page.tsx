import { LayoutDashboard } from "lucide-react";
import { PlaceholderPage } from "../../../components/placeholder-page";

export default function DashboardPage() {
  return (
    <PlaceholderPage
      title="Executive Dashboard"
      description="Hospital-wide KPIs, profitability trends, and AI insights."
      emptyIcon={LayoutDashboard}
      emptyTitle="Perhitungan belum dijalankan"
      emptyDescription="Jalankan Cost Allocation untuk melihat unit cost, profit, dan margin."
      tooltip="Ringkasan performa finansial rumah sakit — lihat docs/39_EXECUTIVE_KPI.md."
    />
  );
}
