import type { Metadata } from "next";
import { href } from "@/lib/base";

export function clone({ description, path, title }: { description: string; path: string; title: string }): Metadata {
  const url = `https://nanocode.xyz${href(path)}`;
  return {
    alternates: { canonical: url },
    description,
    openGraph: { description, siteName: "nanocode", title, type: "website", url },
    title,
    twitter: { card: "summary", description, title },
  };
}
