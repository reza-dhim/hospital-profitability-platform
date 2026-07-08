import { LineChart } from "lucide-react";
import { PlaceholderPage } from "../../../components/placeholder-page";

export default function ProfitabilityPage() {
  return (
    <PlaceholderPage
      title="Profitability"
      description="Revenue, cost, margin, unit cost, and tariff gap per service."
      emptyIcon={LineChart}
      emptyTitle="Belum ada hasil profitabilitas"
      emptyDescription="Jalankan Cost Allocation terlebih dahulu untuk melihat profitabilitas per profit center."
      tooltip="Unit Cost = Total Allocated Cost / Service Volume — lihat docs/18_FORMULA_REFERENCE.md."
    />
  );
}
