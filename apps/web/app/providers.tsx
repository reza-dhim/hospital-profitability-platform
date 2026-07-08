"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

/** Light/dark theme, per docs/36_DESIGN_PRINCIPLES.md §4. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      {children}
    </ThemeProvider>
  );
}
