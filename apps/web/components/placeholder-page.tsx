import type { ComponentType, ReactNode } from "react";
import { PageHeader, EmptyState, GuidedTooltip } from "@hpp/ui";

export interface PlaceholderPageProps {
  title: string;
  description: string;
  emptyIcon?: ComponentType<{ className?: string }>;
  emptyTitle: string;
  emptyDescription: string;
  tooltip: ReactNode;
}

/**
 * Every Sprint 1 route renders this: PageHeader + EmptyState + GuidedTooltip,
 * no data fetching yet (docs/ARCHITECT_AUDIT.md Sprint 1 scope). Each module
 * sprint replaces its route's body with real content once built.
 */
export function PlaceholderPage({
  title,
  description,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  tooltip,
}: PlaceholderPageProps) {
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        action={<GuidedTooltip content={tooltip} />}
      />
      <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
    </>
  );
}
