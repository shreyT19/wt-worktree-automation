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
          <div className="flex items-center gap-2">
            <Image
              src="/logos/icon-gradient.png"
              alt="wt"
              width={28}
              height={28}
              className="rounded-md"
            />
            <span className="font-mono font-bold text-lg">wt</span>
          </div>
        ),
        url: "/",
      }}
    >
      {children}
    </DocsLayout>
  );
}
