"use client";

import { useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  ErrorState,
  Input,
  LoadingSkeleton,
  Select,
  type DataTableColumn,
} from "@hpp/ui";
import { Database } from "lucide-react";
import type { MasterDataEntityConfig } from "../lib/master-data-entities";
import { useAuth } from "../lib/auth-context";
import { ApiRequestError } from "../lib/api-client";
import { MasterDataForm, defaultFormValues } from "./master-data-form";

const PAGE_SIZE = 20;

type DialogState<TEntity> =
  | { mode: "create" }
  | { mode: "edit"; entity: TEntity }
  | { mode: "delete"; entity: TEntity }
  | null;

/**
 * Generic table+CRUD container driven by a `MasterDataEntityConfig` — one
 * instance of this per entity in the switcher, instead of 12 hand-written
 * near-identical components (see `lib/master-data-entities.ts`'s doc
 * comment for why the backend makes this viable).
 */
export function MasterDataTable<TEntity extends { id: string }, TCreateDto>({
  config,
}: {
  config: MasterDataEntityConfig<TEntity, TCreateDto>;
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(config.defaultSort);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [dialogState, setDialogState] = useState<DialogState<TEntity>>(null);
  const { user } = useAuth();
  const canWrite = user?.permissions.includes(`${config.permissionPrefix}.write`) ?? false;
  const queryClient = useQueryClient();

  const activeFilters = Object.fromEntries(Object.entries(filterValues).filter(([, value]) => value));

  const listQuery = useQuery({
    queryKey: ["master-data", config.key, page, sort, search, activeFilters],
    queryFn: () =>
      config.api.list({
        page,
        limit: PAGE_SIZE,
        sort,
        search: search || undefined,
        filter: Object.keys(activeFilters).length > 0 ? activeFilters : undefined,
      }),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["master-data", config.key] });

  const createMutation = useMutation({
    mutationFn: (dto: TCreateDto) => config.api.create(dto),
    onSuccess: () => {
      setDialogState(null);
      setPage(1);
      invalidate();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: TCreateDto }) => config.api.update(id, dto),
    onSuccess: () => {
      setDialogState(null);
      invalidate();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => config.api.remove(id),
    onSuccess: () => {
      setDialogState(null);
      invalidate();
    },
  });

  const fkLookups = config.fkLookups ?? [];
  const fkLookupResults = useQueries({
    queries: fkLookups.map((lookup) => ({
      queryKey: ["master-data-fk-map", config.key, lookup.field],
      queryFn: lookup.fetchMap,
    })),
  });

  const rawRows = listQuery.data?.data ?? [];
  const rows = rawRows.map((row) => {
    const enriched: Record<string, string> = {};
    fkLookups.forEach((lookup, index) => {
      const map = fkLookupResults[index]?.data;
      const rawId = (row as unknown as Record<string, unknown>)[lookup.field];
      enriched[`${lookup.field}Label`] = typeof rawId === "string" ? (map?.get(rawId) ?? "…") : "—";
    });
    return { ...row, ...enriched };
  });
  const totalPages = listQuery.data ? Math.max(1, Math.ceil(listQuery.data.meta.total / PAGE_SIZE)) : 1;
  // Same "exactly one primary CTA" rule as UploadCenter (docs/36_DESIGN_PRINCIPLES.md §1).
  const showEmptyState = listQuery.isSuccess && rows.length === 0 && !search;

  const columns: DataTableColumn<TEntity>[] = canWrite
    ? [
        ...config.columns,
        {
          header: "Aksi",
          align: "right",
          render: (row) => (
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDialogState({ mode: "edit", entity: row })}
                className="text-sm text-primary underline underline-offset-2"
              >
                Ubah
              </button>
              <button
                type="button"
                onClick={() => setDialogState({ mode: "delete", entity: row })}
                className="text-sm text-destructive underline underline-offset-2"
              >
                Hapus
              </button>
            </div>
          ),
        },
      ]
    : config.columns;

  const isFormDialogOpen = dialogState !== null && (dialogState.mode === "create" || dialogState.mode === "edit");
  const isDeleteDialogOpen = dialogState !== null && dialogState.mode === "delete";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
              setSearch(searchDraft);
            }}
          >
            <Input
              placeholder="Cari..."
              aria-label="Cari"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              className="w-64"
            />
            <Button type="submit" variant="outline">
              Cari
            </Button>
          </form>
          {(config.filters ?? []).map((filter) => (
            <Select
              key={filter.key}
              aria-label={filter.label}
              value={filterValues[filter.key] ?? ""}
              onChange={(event) => {
                setPage(1);
                setFilterValues((current) => ({ ...current, [filter.key]: event.target.value }));
              }}
              className="w-40"
            >
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          ))}
        </div>
        {canWrite && !showEmptyState ? (
          <Button type="button" onClick={() => setDialogState({ mode: "create" })}>
            Tambah {config.label}
          </Button>
        ) : null}
      </div>

      {listQuery.isLoading ? <LoadingSkeleton /> : null}

      {listQuery.isError ? (
        <ErrorState message={`Gagal memuat data ${config.label.toLowerCase()}.`} onRetry={() => void listQuery.refetch()} />
      ) : null}

      {showEmptyState ? (
        <EmptyState
          icon={Database}
          title={config.emptyStateTitle}
          description={config.emptyStateDescription}
          action={
            canWrite ? (
              <Button type="button" onClick={() => setDialogState({ mode: "create" })}>
                Tambah {config.label}
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {listQuery.isSuccess && rows.length === 0 && search ? (
        <p className="text-sm text-muted-foreground">Tidak ada hasil untuk &quot;{search}&quot;.</p>
      ) : null}

      {listQuery.isSuccess && rows.length > 0 ? (
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          sort={sort}
          onSortChange={(next) => {
            setSort(next);
            setPage(1);
          }}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      ) : null}

      <Dialog open={isFormDialogOpen} onOpenChange={(open) => (!open ? setDialogState(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogState !== null && dialogState.mode === "edit" ? `Ubah ${config.label}` : `Tambah ${config.label}`}
            </DialogTitle>
          </DialogHeader>
          {dialogState !== null && dialogState.mode === "create" ? (
            <MasterDataForm
              fields={config.formFields}
              initialValues={defaultFormValues(config.formFields)}
              submitLabel="Simpan"
              pendingLabel="Menyimpan..."
              isPending={createMutation.isPending}
              error={createMutation.error}
              onSubmit={(values) => createMutation.mutate(config.fromFormValues(values))}
              onCancel={() => setDialogState(null)}
            />
          ) : null}
          {dialogState !== null && dialogState.mode === "edit" ? (
            <MasterDataForm
              fields={config.formFields}
              initialValues={config.toFormValues(dialogState.entity)}
              submitLabel="Simpan"
              pendingLabel="Menyimpan..."
              isPending={updateMutation.isPending}
              error={updateMutation.error}
              onSubmit={(values) => {
                if (dialogState !== null && dialogState.mode === "edit") {
                  updateMutation.mutate({ id: dialogState.entity.id, dto: config.fromFormValues(values) });
                }
              }}
              onCancel={() => setDialogState(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={(open) => (!open ? setDialogState(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus {config.label}?</DialogTitle>
            <DialogDescription>
              {dialogState !== null && dialogState.mode === "delete"
                ? `"${config.getEntityLabel(dialogState.entity)}" akan dihapus. Tindakan ini tidak dapat dibatalkan dari halaman ini.`
                : null}
            </DialogDescription>
          </DialogHeader>
          {deleteMutation.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteMutation.error instanceof ApiRequestError ? deleteMutation.error.message : "Gagal menghapus data."}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={deleteMutation.isPending} onClick={() => setDialogState(null)}>
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (dialogState !== null && dialogState.mode === "delete") deleteMutation.mutate(dialogState.entity.id);
              }}
            >
              {deleteMutation.isPending ? "Menghapus..." : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
