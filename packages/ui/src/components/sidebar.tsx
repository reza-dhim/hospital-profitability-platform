import type { ComponentType } from "react";
import { cn } from "../lib/cn";

export interface SidebarItem {
  label: string;
  href: string;
  icon?: ComponentType<{ className?: string }>;
}

export interface SidebarLinkProps {
  href: string;
  className?: string;
  children?: React.ReactNode;
}

export interface SidebarProps {
  items: SidebarItem[];
  activePath: string;
  /**
   * Injected by the consuming app so this package stays framework-agnostic
   * (e.g. next/link's `Link`). Typed loosely (not `ComponentType<SidebarLinkProps>`)
   * because next/link's `href` accepts `Url`, not just `string` — this keeps
   * Sidebar decoupled from any one router's exact prop types.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  linkComponent?: ComponentType<any>;
  brand?: React.ReactNode;
  className?: string;
}

/**
 * Primary navigation, per docs/37_COMPONENT_LIBRARY.md §1. Role-aware item
 * visibility (docs/04_RBAC.md) is filtered by the caller before items reach
 * this component — Sidebar itself has no permission logic.
 */
export function Sidebar({ items, activePath, linkComponent, brand, className }: SidebarProps) {
  const Link = linkComponent ?? "a";
  return (
    <nav
      aria-label="Primary"
      className={cn("flex h-full w-64 flex-col gap-1 border-r border-border bg-card px-3 py-4", className)}
    >
      {brand ? <div className="px-3 pb-4 text-lg font-semibold text-foreground">{brand}</div> : null}
      {items.map((item) => {
        const isActive = activePath === item.href || activePath.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {Icon ? <Icon className="h-4 w-4" /> : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
