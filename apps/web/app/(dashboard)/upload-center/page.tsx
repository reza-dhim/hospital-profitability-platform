import { UploadCloud } from "lucide-react";
import { PlaceholderPage } from "../../../components/placeholder-page";

export default function UploadCenterPage() {
  return (
    <PlaceholderPage
      title="Upload Center"
      description="Download templates and bulk upload cost, revenue, and activity data."
      emptyIcon={UploadCloud}
      emptyTitle="Belum ada data biaya"
      emptyDescription="Upload data biaya menggunakan template standar agar sistem dapat menghitung costing."
      tooltip="Pipeline dua tahap: stage lalu confirm — lihat docs/06_UPLOAD_ENGINE.md."
    />
  );
}
