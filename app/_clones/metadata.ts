import type { Metadata } from "next";
import { href } from "@/lib/base";

export function clone({ description, path, title }: { description: string; path: string; title: string }): Metadata {
  const url = `https://nanocode.xyz${href(path)}`;
  const image = `https://nanocode.xyz/player${href(path)}.jpg`;
  return {
    alternates: { canonical: url },
    description,
    openGraph: { description, images: [image], siteName: "nanocode", title, type: "website", url },
    other: { "twitter:player": url, "twitter:player:height": 480, "twitter:player:width": 480 },
    title,
    twitter: { card: "player", description, images: [image], players: [], site: "@nanocodexyz", title },
  };
}
