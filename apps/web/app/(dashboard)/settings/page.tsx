import { Settings } from "lucide-react";
import { PlaceholderPage } from "../../../components/placeholder-page";

export default function SettingsPage() {
  return (
    <PlaceholderPage
      title="Settings"
      description="Hospital configuration, users and roles, and period management."
      emptyIcon={Settings}
      emptyTitle="Pengaturan default sedang digunakan"
      emptyDescription="Konfigurasi hospital, RBAC, dan period akan tersedia di sprint berikutnya."
      tooltip="Katalog pengaturan hospital — lihat docs/24_CONFIGURATION.md."
    />
  );
}
