import { FileText } from "lucide-react";
import { PlaceholderPage } from "../../../components/placeholder-page";

export default function ReportsPage() {
  return (
    <PlaceholderPage
      title="Reports"
      description="Executive, profitability, and doctor analytics reports — PDF and Excel."
      emptyIcon={FileText}
      emptyTitle="Belum ada laporan"
      emptyDescription="Laporan dapat dibuat setelah perhitungan alokasi biaya pertama selesai."
      tooltip="Setiap laporan terikat pada allocation run tertentu — lihat docs/15_REPORTING.md."
    />
  );
}
