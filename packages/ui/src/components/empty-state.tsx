import type { ComponentType, ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "../lib/cn";

export interface EmptyStateProps {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/**
 * Guided empty state per docs/UX_ONBOARDING_GUIDE.md pattern: title, one-sentence
 * description, single clear CTA — never a bare "No data" (docs/36_DESIGN_PRINCIPLES.md §1).
 */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-8 py-16 text-center",
        className
      )}
    >
      <Icon className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-medium text-foreground">{title}</h3>
        {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
