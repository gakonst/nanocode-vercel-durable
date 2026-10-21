"use client";

import { usePathname } from "next/navigation";
import { href } from "@/lib/base";

const sections = [
  { href: "/", label: "Home" },
  { href: "/how-it-works", label: "How it works" },
  { href: "https://nanocode.xyz", label: "nanocode" },
  { href: "https://github.com/vercel-labs/durable-harness", label: "durable-harness" },
  { href: "https://github.com/gakonst/nanocode-vercel-durable", label: "GitHub" },
];

export function Navigation() {
  const path = usePathname();
  return (
    <nav aria-label="Site" className="navigation">
      {sections.map((section, index) => (
        <a aria-current={section.href === path ? "page" : undefined} href={section.href.startsWith("http") ? section.href : href(section.href)} key={section.href} {...(section.href.startsWith("http") ? { rel: "noreferrer" } : {})}>
          {`${String(index + 1).padStart(2, "0")} ${section.label}`}
        </a>
      ))}
    </nav>
  );
}
