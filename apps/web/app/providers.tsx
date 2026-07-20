"use client";

import { ThemeProvider } from "next-themes";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { createQueryClient } from "../lib/query-client";
import { AuthProvider } from "../lib/auth-context";

/** Light/dark theme (docs/36_DESIGN_PRINCIPLES.md §4) + TanStack Query + auth. One QueryClient per component tree (not module-level), per Next.js App Router's SSR guidance — avoids leaking cached data across requests/users. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
