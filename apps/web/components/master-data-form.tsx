"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Label, Select } from "@hpp/ui";
import type { MasterDataFormField } from "../lib/master-data-entities";
import { ApiRequestError } from "../lib/api-client";

const TEXTAREA_CLASS =
  "flex w-full rounded-sm border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50";

function isVisible(field: MasterDataFormField, values: Record<string, string>): boolean {
  return !field.visibleIf || field.visibleIf(values);
}

function isBlank(field: MasterDataFormField, values: Record<string, string>): boolean {
  return Boolean(field.required) && isVisible(field, values) && !values[field.name]?.trim();
}

/** `type: "fk-select"` fields fetch their options from another entity's lookup API — a small component so each gets its own `useQuery` call (hooks can't be called a variable number of times inline in a `.map()` body). */
function FkSelectField({
  field,
  value,
  onChange,
}: {
  field: MasterDataFormField;
  value: string;
  onChange: (value: string) => void;
}) {
  const query = useQuery({ queryKey: ["master-data-fk-options", field.name], queryFn: field.fkOptions! });
  const options = query.data ?? [];

  return (
    <Select
      id={`master-data-field-${field.name}`}
      value={value}
      disabled={query.isLoading}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{query.isLoading ? "Memuat..." : (field.fkPlaceholder ?? "Pilih...")}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

/**
 * A blank default (`""`) works for text/number/textarea, but a `<select>`
 * always shows *some* option even when the underlying value is `""` (the
 * browser renders the first `<option>`) — so a required select field looked
 * pre-filled while `isBlank` still saw it as empty, permanently disabling
 * Simpan. Selects default to their first option's value instead, keeping
 * the visible selection and form state in sync.
 */
export function defaultFormValues(fields: MasterDataFormField[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.name, field.type === "select" ? (field.options?.[0]?.value ?? "") : ""]));
}

/**
 * Generic create/edit form body, driven by `MasterDataEntityConfig.formFields`
 * — every master-data entity gets the same field-rendering logic instead of
 * a hand-written form per entity. Required-field gating on the submit button
 * only; real validation (length limits, uniqueness) surfaces via the API's
 * error message on submit, same convention as `NewUploadForm`/`NewAllocationRunForm`.
 */
export function MasterDataForm({
  fields,
  initialValues,
  submitLabel,
  pendingLabel,
  isPending,
  error,
  onSubmit,
  onCancel,
}: {
  fields: MasterDataFormField[];
  initialValues: Record<string, string>;
  submitLabel: string;
  pendingLabel: string;
  isPending: boolean;
  error: unknown;
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(initialValues);
  const hasBlankRequiredField = fields.some((field) => isBlank(field, values));

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      {fields.filter((field) => isVisible(field, values)).map((field) => (
        <div key={field.name} className="flex flex-col gap-1.5">
          <Label htmlFor={`master-data-field-${field.name}`}>
            {field.label}
            {field.required ? " *" : ""}
          </Label>
          {field.type === "textarea" ? (
            <textarea
              id={`master-data-field-${field.name}`}
              className={TEXTAREA_CLASS}
              rows={3}
              value={values[field.name] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
            />
          ) : field.type === "select" ? (
            <Select
              id={`master-data-field-${field.name}`}
              value={values[field.name] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
            >
              {(field.options ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          ) : field.type === "fk-select" ? (
            <FkSelectField
              field={field}
              value={values[field.name] ?? ""}
              onChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
            />
          ) : (
            <Input
              id={`master-data-field-${field.name}`}
              type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
              value={values[field.name] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
            />
          )}
        </div>
      ))}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error instanceof ApiRequestError ? error.message : "Gagal menyimpan data."}
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" disabled={isPending} onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" disabled={hasBlankRequiredField || isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </div>
    </form>
  );
}
