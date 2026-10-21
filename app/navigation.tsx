const site = "https://nanocode.xyz";

const sections = [
  { href: `${site}/`, label: "Home" },
  { href: `${site}/experiments`, label: "Experiments" },
  { href: `${site}/docs/introduction/getting-started`, label: "Docs" },
  { href: `${site}/playground`, label: "Playground" },
  { href: `${site}/prompts`, label: "Prompts" },
  { href: "https://github.com/gakonst/nanocode", label: "GitHub" },
];

const experiments = [
  { href: `${site}/docs/guides/xframes`, label: "xframes" },
  { href: `${site}/docs/guides/mpp-payments`, label: "nanocode-machines" },
  { href: "https://github.com/gakonst/nanocode-ts", label: "nanocode-ts" },
  { current: true, href: `${site}/vercel`, label: "nanocode on Vercel" },
  { href: `${site}/cloudflare/`, label: "nanocode on Cloudflare" },
];

export function Navigation() {
  return (
    <nav aria-label="Site" className="navigation">
      {sections.map((section, index) => {
        const label = `${String(index + 1).padStart(2, "0")} ${section.label}`;
        if (section.label !== "Experiments") return <a href={section.href} key={section.href}>{label}</a>;
        return (
          <div className="menu" key={section.href}>
            <a aria-current="page" href={section.href}>{label}</a>
            <div className="menu-list">
              {experiments.map(experiment => (
                <a aria-current={experiment.current ? "page" : undefined} href={experiment.href} key={experiment.href}>{experiment.label}</a>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
