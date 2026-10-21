import type { ReactNode } from "react";
import { href } from "@/lib/base";
import "./globals.css";
import { Navigation } from "./navigation";

export const metadata = {
  description: "nanocode agents made durable in Vercel Functions with durable-harness.",
  icons: { icon: href("/favicon.svg") },
  title: "nanocode on Vercel",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link as="font" crossOrigin="" href={href("/fonts/CommitMono-VF.woff2")} rel="preload" type="font/woff2" />
      </head>
      <body>
        <header className="header">
          <Navigation />
        </header>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
