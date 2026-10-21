import type { Metadata } from "next";
import { href } from "@/lib/base";

const origin = "https://nanocode.xyz";

export function pageMetadata({ description, path, title }: { description: string; path: string; title: string }): Metadata {
  const url = `${origin}${href(path)}`;
  const image = { alt: title, height: 630, type: "image/png", url: `${origin}/og${href(path)}.png`, width: 1200 };
  return {
    alternates: { canonical: url },
    description,
    openGraph: { description, images: [image], siteName: "nanocode", title, type: "website", url },
    title,
    twitter: { card: "summary_large_image", description, images: [image.url], title },
  };
}
