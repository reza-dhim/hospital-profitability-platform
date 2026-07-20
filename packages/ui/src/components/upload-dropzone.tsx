import { useRef, useState, type ReactNode } from "react";
import { UploadCloud } from "lucide-react";
import { Button } from "./button";
import { cn } from "../lib/cn";

export interface UploadDropzoneProps {
  /** Called with the first file picked, whether via click or drag-drop — this component never uploads it itself, just hands it off. */
  onFileSelected: (file: File) => void;
  /** File-input `accept` attribute. Defaults to `.xlsx` — docs/06_UPLOAD_ENGINE.md §3 accepts no other format. */
  accept?: string;
  /** Slot for the "download template" link/button (docs/37_COMPONENT_LIBRARY.md §3) — this component stays API-agnostic, the caller wires the actual download. */
  templateLink?: ReactNode;
  selectedFileName?: string | null;
  disabled?: boolean;
  className?: string;
}

/** File upload entry point — drag-drop + click, per docs/37_COMPONENT_LIBRARY.md §3. */
export function UploadDropzone({
  onFileSelected,
  accept = ".xlsx",
  templateLink,
  selectedFileName,
  disabled = false,
  className,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFileSelected(file);
  }

  return (
    <div
      role="group"
      aria-label="Area unggah file"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-8 py-12 text-center transition-colors",
        isDragging ? "border-primary bg-primary/5" : "border-border",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      <UploadCloud className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">
          {selectedFileName ?? "Seret file ke sini, atau klik untuk memilih"}
        </p>
        <p className="text-sm text-muted-foreground">Format .xlsx sesuai template</p>
      </div>
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
        Pilih File
      </Button>
      {templateLink}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        disabled={disabled}
        className="sr-only"
        aria-label="Pilih file untuk diunggah"
        onChange={(event) => handleFiles(event.target.files)}
      />
    </div>
  );
}
