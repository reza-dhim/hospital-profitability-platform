import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@hpp/ui/styles.css";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Hospital Profitability Intelligence Platform",
  description: "AI Hospital Profitability Intelligence Platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
