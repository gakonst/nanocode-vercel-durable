import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { href } from "@/lib/base";
import "./chatgpt.css";

export const metadata: Metadata = {
  icons: { icon: href("/favicon.svg") },
};

export const viewport: Viewport = { colorScheme: "light dark", interactiveWidget: "resizes-content" };

export default function ChatGptLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script src={href("/frame.js")} />
      </head>
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
