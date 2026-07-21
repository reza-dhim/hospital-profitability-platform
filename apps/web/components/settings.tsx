"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, ErrorState, LoadingSkeleton, PageHeader } from "@hpp/ui";
import { hospitalSettingsApi } from "../lib/hospital-settings-api";
import { useAuth } from "../lib/auth-context";
import { HospitalSettingsForm } from "./hospital-settings-form";

export function Settings() {
  const { user } = useAuth();
  const canWrite = user?.permissions.includes("hospital.write") ?? false;

  const settingsQuery = useQuery({ queryKey: ["hospital-settings"], queryFn: hospitalSettingsApi.get });

  return (
    <>
      <PageHeader title="Settings" description="Konfigurasi hospital — metode alokasi, target margin, dan batas upload." />

      {settingsQuery.isLoading ? <LoadingSkeleton /> : null}

      {settingsQuery.isError ? (
        <ErrorState message="Gagal memuat pengaturan hospital." onRetry={() => void settingsQuery.refetch()} />
      ) : null}

      {settingsQuery.isSuccess ? (
        <Card>
          <CardHeader>
            <CardTitle>Pengaturan Hospital</CardTitle>
          </CardHeader>
          <CardContent>
            <HospitalSettingsForm settings={settingsQuery.data} canWrite={canWrite} />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
