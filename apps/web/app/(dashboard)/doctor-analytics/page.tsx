import { Stethoscope } from "lucide-react";
import { PlaceholderPage } from "../../../components/placeholder-page";

export default function DoctorAnalyticsPage() {
  return (
    <PlaceholderPage
      title="Doctor Analytics"
      description="Cost and profitability variance by doctor and procedure — a management report, not a scorecard."
      emptyIcon={Stethoscope}
      emptyTitle="Belum ada data variasi biaya dokter"
      emptyDescription="Data akan muncul setelah perhitungan alokasi biaya dijalankan."
      tooltip="Raport, bukan alat menghukum — lihat docs/11_DOCTOR_ANALYTICS.md dan docs/PRODUCT_BIBLE.md §7."
    />
  );
}
