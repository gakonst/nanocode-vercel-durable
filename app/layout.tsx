import type { Metadata } from "next";
import type { ReactNode } from "react";
import { href } from "@/lib/base";
import { frame } from "@/lib/metadata";
import "./globals.css";
import { Navigation } from "./navigation";

export const metadata: Metadata = {
  icons: { icon: href("/favicon.svg") },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: frame }} />
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
