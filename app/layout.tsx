import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  description: "nanocode agents made durable in Vercel Functions with durable-harness.",
  icons: { icon: "/favicon.svg" },
  title: "nanocode on Vercel",
};

const sections = [
  { current: true, href: "/", label: "Home" },
  { href: "https://nanocode.xyz", label: "nanocode" },
  { href: "https://github.com/vercel-labs/durable-harness", label: "durable-harness" },
  { href: "https://github.com/gakonst/nanocode-vercel-durable", label: "GitHub" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link as="font" crossOrigin="" href="/fonts/CommitMono-VF.woff2" rel="preload" type="font/woff2" />
      </head>
      <body>
        <header className="header">
          <nav aria-label="Site" className="navigation">
            {sections.map((section, index) => (
              <a aria-current={section.current ? "page" : undefined} href={section.href} key={section.href} {...(section.href.startsWith("http") ? { rel: "noreferrer" } : {})}>
                {`${String(index + 1).padStart(2, "0")} ${section.label}`}
              </a>
            ))}
          </nav>
        </header>
        <main className="main">{children}</main>
      </body>
    </html>
  );
}
