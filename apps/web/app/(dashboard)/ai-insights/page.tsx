import { Sparkles } from "lucide-react";
import { PlaceholderPage } from "../../../components/placeholder-page";

export default function AiInsightsPage() {
  return (
    <PlaceholderPage
      title="AI Insights"
      description="AI-generated explanations, tariff recommendations, and what-if simulations."
      emptyIcon={Sparkles}
      emptyTitle="AI belum diaktifkan"
      emptyDescription="AI insight muncul setelah perhitungan pertama selesai dan AI diaktifkan oleh admin."
      tooltip="Setiap rekomendasi tarif memerlukan persetujuan manusia — lihat docs/13_AI_GOVERNANCE.md."
    />
  );
}
