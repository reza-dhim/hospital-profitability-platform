import { cn } from "../lib/cn";

export interface SkeletonProps {
  className?: string;
}

/** Base shimmer block. Compose into shape-matched skeletons, never a generic spinner. */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-sm bg-muted", className)} aria-hidden="true" />;
}

export function LoadingSkeleton({ className }: SkeletonProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)} role="status" aria-label="Loading">
      <Skeleton className="h-8 w-1/3" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
