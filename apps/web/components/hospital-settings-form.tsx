"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Label, Select } from "@hpp/ui";
import { hospitalSettingsApi, type HospitalSettings, type UpdateHospitalSettingsDto } from "../lib/hospital-settings-api";
import { ApiRequestError } from "../lib/api-client";

const ALLOCATION_METHOD_OPTIONS = [
  { value: "step_down", label: "Step-Down" },
  { value: "direct", label: "Direct" },
];

const MONTH_OPTIONS = [
  { value: "1", label: "Januari" },
  { value: "2", label: "Februari" },
  { value: "3", label: "Maret" },
  { value: "4", label: "April" },
  { value: "5", label: "Mei" },
  { value: "6", label: "Juni" },
  { value: "7", label: "Juli" },
  { value: "8", label: "Agustus" },
  { value: "9", label: "September" },
  { value: "10", label: "Oktober" },
  { value: "11", label: "November" },
  { value: "12", label: "Desember" },
];

interface SettingsFormValues {
  allocationMethod: string;
  defaultTargetMargin: string;
  fiscalYearStartMonth: string;
  locale: string;
  maxUploadFileSizeMb: string;
  outlierStddevMultiplier: string;
}

function toFormValues(settings: HospitalSettings): SettingsFormValues {
  return {
    allocationMethod: settings.allocationMethod,
    defaultTargetMargin: settings.defaultTargetMargin,
    fiscalYearStartMonth: String(settings.fiscalYearStartMonth),
    locale: settings.locale,
    maxUploadFileSizeMb: String(settings.maxUploadFileSizeMb),
    outlierStddevMultiplier: settings.outlierStddevMultiplier,
  };
}

/**
 * `HospitalSettings` is a hand-written singleton (`GET`/`PATCH` only, no
 * list/create/delete) — deliberately not part of the generic Master Data
 * engine (`lib/master-data-entities.tsx`'s doc comment), so this is a
 * bespoke form rather than a `MasterDataTable` config. Only 6 of the 8
 * settings documented in docs/24_CONFIGURATION.md are implemented on the
 * backend so far (`ai_*` and `email_notifications_enabled` don't exist in
 * the schema yet) — no fields are rendered for those.
 */
export function HospitalSettingsForm({ settings, canWrite }: { settings: HospitalSettings; canWrite: boolean }) {
  const [values, setValues] = useState(toFormValues(settings));
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (dto: UpdateHospitalSettingsDto) => hospitalSettingsApi.update(dto),
    onSuccess: (updated) => {
      queryClient.setQueryData(["hospital-settings"], updated);
      setValues(toFormValues(updated));
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        updateMutation.mutate({
          allocationMethod: values.allocationMethod as "direct" | "step_down",
          defaultTargetMargin: Number(values.defaultTargetMargin),
          fiscalYearStartMonth: Number(values.fiscalYearStartMonth),
          locale: values.locale,
          maxUploadFileSizeMb: Number(values.maxUploadFileSizeMb),
          outlierStddevMultiplier: Number(values.outlierStddevMultiplier),
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="settings-allocation-method">Metode Alokasi Default</Label>
        <Select
          id="settings-allocation-method"
          disabled={!canWrite}
          value={values.allocationMethod}
          onChange={(event) => setValues((current) => ({ ...current, allocationMethod: event.target.value }))}
        >
          {ALLOCATION_METHOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="settings-target-margin">Target Margin Default (%)</Label>
        <Input
          id="settings-target-margin"
          type="number"
          min={0}
          max={100}
          step="0.01"
          disabled={!canWrite}
          value={values.defaultTargetMargin}
          onChange={(event) => setValues((current) => ({ ...current, defaultTargetMargin: event.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="settings-fiscal-year-start">Awal Tahun Fiskal</Label>
        <Select
          id="settings-fiscal-year-start"
          disabled={!canWrite}
          value={values.fiscalYearStartMonth}
          onChange={(event) => setValues((current) => ({ ...current, fiscalYearStartMonth: event.target.value }))}
        >
          {MONTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="settings-locale">Locale</Label>
        <Input
          id="settings-locale"
          maxLength={16}
          disabled={!canWrite}
          value={values.locale}
          onChange={(event) => setValues((current) => ({ ...current, locale: event.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="settings-max-upload-size">Ukuran Maksimum File Upload (MB)</Label>
        <Input
          id="settings-max-upload-size"
          type="number"
          min={1}
          max={500}
          disabled={!canWrite}
          value={values.maxUploadFileSizeMb}
          onChange={(event) => setValues((current) => ({ ...current, maxUploadFileSizeMb: event.target.value }))}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="settings-outlier-multiplier">Multiplier Deviasi Standar untuk Outlier</Label>
        <Input
          id="settings-outlier-multiplier"
          type="number"
          min={1}
          max={10}
          step="0.01"
          disabled={!canWrite}
          value={values.outlierStddevMultiplier}
          onChange={(event) => setValues((current) => ({ ...current, outlierStddevMultiplier: event.target.value }))}
        />
      </div>

      {updateMutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {updateMutation.error instanceof ApiRequestError ? updateMutation.error.message : "Gagal menyimpan pengaturan."}
        </p>
      ) : null}

      {updateMutation.isSuccess && !updateMutation.isPending ? (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          Perubahan disimpan.
        </p>
      ) : null}

      {canWrite ? (
        <div>
          <Button type="submit" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
