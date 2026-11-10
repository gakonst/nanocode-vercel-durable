<h1 align="center">durable-vercel</h1>

<p align="center">
  <a href="https://nanocode.xyz/vercel">Live Demo</a> · <a href="https://nanocode.xyz/experiments/durable-nanocode-on-vercel">How It Works</a> · <a href="https://nanocode.xyz/docs/guides/vercel">Guide</a>
</p>

[nanocode](https://nanocode.xyz) agents in Vercel Functions: one Workflow run per session, with every write to the agent's journal recorded as a step of the run. A template and the source of [nanocode.xyz/vercel](https://nanocode.xyz/vercel).

<!-- ondine:eNpNkDFrwzAUhPf-ihtT6jjYY4ZCOnQKtGkCHUwGRXrGamXJkZ4xAf_4SnZJvEjw7t7pO9XGDbIRnrH_egKElCfNhrbY4b23krWzEF1HVgWQkA1-XO-tMBi8ZgI7cEP4dv63jknwvc0grMLQkIVmKE1hslx76gmB41MhOlyc-SgIhqfOiNvsivuRwlN0B642nx_HEwQ679qON2es16-obVHd0XbnaI-TpIxzEC6CZUNhhLoU1ep42CdQbdFS6_ztebkRrmZbZEhXmSHP8xGD80ZVq2Wjx0o-92m1WnP8BuSRZypWHdKZfHPPGbR8gL4lbcpeoI7JM2WXdxz7UvxD_AEniojs -->
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/README-1.dark.svg">
  <img alt="A Function appends each journal write to the Workflow run, and when it dies the queue starts another that replays the run" src="assets/README-1.light.svg">
</picture>
<!-- /ondine -->

- **Durable.** A Function holds the journal in memory and appends each write to the run with [durable-harness](https://www.npmjs.com/package/durable-harness). When it dies mid-turn, the queue starts another that replays the log and finishes the turn.
- **No sandbox.** Code Mode cells run beside the agent in the Function: bash on a workspace kept in the same journal, git, Python and WebAssembly.
- **One module.** The runtime is [nanocode-ts](https://github.com/nanocodexyz/nanocode-ts), the Rust SDK compiled to WebAssembly. This repository holds the Next.js app around it.

## Run It

```sh
npm install
npm run dev       # next dev, at http://localhost:3000
npm run drill     # Kill a turn midway and check that it resumes
npx vercel deploy # Deploy to a Vercel project
```

`DECISIONS.md` records what each change established, with its measurements.

## License

[MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE).
