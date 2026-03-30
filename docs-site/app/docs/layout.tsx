import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import Image from "next/image";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: (
          <Image
            src="/logos/icon-dark.png"
            alt="wt"
            width={32}
            height={32}
            className="rounded-lg"
          />
        ),
        url: "/",
      }}
    >
      {children}
    </DocsLayout>
  );
}
