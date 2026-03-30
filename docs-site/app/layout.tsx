import "./global.css";
import { RootProvider } from "fumadocs-ui/provider";
import type { ReactNode } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s | wt",
    default: "wt — worktree automation",
  },
  description:
    "Instantly create fully configured git worktrees with dependencies installed and .env files in place.",
  icons: {
    icon: "/favicon.png",
    apple: "/logos/favicon-64.png",
  },
  openGraph: {
    title: "wt — worktree automation",
    description:
      "Instantly create fully configured git worktrees with dependencies installed and .env files in place.",
    siteName: "wt",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
