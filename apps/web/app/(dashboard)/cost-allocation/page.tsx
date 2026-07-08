import { SplitSquareVertical } from "lucide-react";
import { PlaceholderPage } from "../../../components/placeholder-page";

export default function CostAllocationPage() {
  return (
    <PlaceholderPage
      title="Cost Allocation"
      description="Run and review Direct and Step-Down cost allocation."
      emptyIcon={SplitSquareVertical}
      emptyTitle="Perhitungan belum dijalankan"
      emptyDescription="Jalankan Cost Allocation untuk mendistribusikan biaya cost center ke profit center."
      tooltip="Distribusi biaya dari unit non-profit ke unit penghasil pendapatan — lihat docs/08_COST_ALLOCATION_ENGINE.md."
    />
  );
}
