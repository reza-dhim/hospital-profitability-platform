import { Database } from "lucide-react";
import { PlaceholderPage } from "../../../components/placeholder-page";

export default function MasterDataPage() {
  return (
    <PlaceholderPage
      title="Master Data"
      description="Cost centers, profit centers, drivers, services, doctors, and more."
      emptyIcon={Database}
      emptyTitle="Belum ada Cost Center"
      emptyDescription="Tambahkan unit non-profit seperti HRD, Laundry, IT, CSSD, dan lainnya."
      tooltip="Data referensi yang digunakan seluruh modul perhitungan — lihat docs/02_DOMAIN_MODEL.md."
    />
  );
}
