import type { Metadata } from "next";
import "nanocode-ts/react/zyzz.css";
import { Header, Main, origin, styles } from "nanocode-ts/react/site";
import type { ReactNode } from "react";
import { href } from "@/lib/base";
import "./fonts";

export const metadata: Metadata = {
  icons: { icon: href("/favicon.svg") },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src={href("/frame.js")} />
        <link as="font" crossOrigin="" href={href("/fonts/CommitMono-VF.woff2")} rel="preload" type="font/woff2" />
      </head>
      <body {...styles.body()}>
        <Header experiment={`${origin}/vercel`} />
        <Main>{children}</Main>
      </body>
    </html>
  );
}
