# Development

This repository runs nanocode agents durably on Vercel with [durable-harness](https://github.com/vercel-labs/durable-harness) (vercel.com/blog/making-every-harness-durable): each session is a Workflow SDK run whose event log holds every write nanocode makes, so a Function that dies mid-turn is replaced by another that rebuilds the session from the log and finishes the turn, as durable-harness does for Pi, OpenCode, fx, Claude Code and Codex. It is the third nanocode host after nanocodexyz/durable-cloudflare (Cloudflare Durable Objects) and the native CLI, and its job is to show where nanocode's abstractions fit a host they were not built for. TypeScript uses only erasable syntax and imports with `.ts` extensions, so Node 22.18 or newer runs `scripts/` directly and Next.js compiles the rest.

The harness lives in nanocodexyz/nanocode-ts as `nanocode-ts/vercel`, and this repository is the app around it: `package.json` names it as the release tarball `https://github.com/nanocodexyz/nanocode-ts/releases/download/build-<short commit>/nanocode-ts-<short commit>.tgz`, which nanocode-ts's `scripts/release.mjs` publishes and `package-lock.json` pins with its integrity, and the tarball holds the compiled JavaScript and module, so installing it builds no Rust or TypeScript. Change the harness, the journal, the gateway, the client or the catalog in nanocode-ts, push it there, publish its `build-<short commit>` release with `node scripts/release.mjs`, then move the URL here with `npm install <tarball URL>`.

## Rules

These principles come from nanocodexyz/nanocode's `AGENTS.md` and apply to every change here.

- Keep code simple and changes small. Match the surrounding code and preserve unrelated work.
- No code comments, doc comments, README edits, tests or test-only dependencies. Only comments that a tool reads stay.
- This repository holds no Rust: do not add Cargo features. SDK changes belong in nanocodexyz/nanocode, and harness and adapter changes in nanocodexyz/nanocode-ts.
- No magic constants or arbitrary caps: a limit comes from a platform or protocol, a measurement or operator policy. Surface invalid states; never hide them with silent truncation, clamping or fallbacks.
- Make invalid states unrepresentable: model a lifecycle as one discriminated union whose variants carry only what that phase has.
- Preserve public APIs.
- Inference, subagents and durability live in the brain; Code Mode runs on the user's machine. Never silently replay dispatched work: report uncertain outcomes.
- Validate with `npm run check`, `npm run build`, `npm run drill`, `npm run cli` and turns against the deployed demo, and back performance changes with reproducible before/after measurements.
- Check behavior with harnesses in ignored `output/`. Keep every artifact there; never commit them, credentials or personal data.
- Work on master in the main checkout, commit only your own changes and push each one; no pull requests. There is no CI: build, release and deploy by hand. Use subagents only when asked.
- This file holds principles only and rarely changes. DECISIONS.md is the growing log: add what each change establishes and why, with the commands, dates and measurements behind it.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
