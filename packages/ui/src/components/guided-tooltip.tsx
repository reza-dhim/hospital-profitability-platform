"use client";

import type { ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { HelpCircle } from "lucide-react";
import { cn } from "../lib/cn";

export interface GuidedTooltipProps {
  content: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Contextual help per docs/UX_ONBOARDING_GUIDE.md tooltip examples. */
export function GuidedTooltip({ content, children, className }: GuidedTooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>
          {children ?? (
            <button
              type="button"
              aria-label="More information"
              className={cn("inline-flex text-muted-foreground hover:text-foreground", className)}
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          )}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            sideOffset={6}
            className="z-50 max-w-xs rounded-sm bg-foreground px-3 py-2 text-xs text-background shadow-elevated"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-foreground" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
