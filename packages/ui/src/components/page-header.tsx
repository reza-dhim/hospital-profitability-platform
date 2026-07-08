import type { ReactNode } from "react";
import { cn } from "../lib/cn";

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumb?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Mandatory on every page per AGENTS.md. See docs/37_COMPONENT_LIBRARY.md §1. */
export function PageHeader({ title, description, breadcrumb, action, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-2 pb-6", className)}>
      {breadcrumb ? <div className="text-sm text-muted-foreground">{breadcrumb}</div> : null}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
