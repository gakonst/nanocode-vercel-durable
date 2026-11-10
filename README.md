<h1 align="center">durable-vercel</h1>

<p align="center">
  <a href="https://nanocode.xyz/vercel">Live Demo</a> · <a href="https://nanocode.xyz/experiments/durable-nanocode-on-vercel">How It Works</a> · <a href="https://nanocode.xyz/docs/guides/vercel">Guide</a>
</p>

[nanocode](https://nanocode.xyz) agents in Vercel Functions: one Workflow run per session, with every write to the agent's journal recorded as a step of the run. A template and the source of [nanocode.xyz/vercel](https://nanocode.xyz/vercel).

<p align="center">
  <img alt="A Function appends each journal write to the Workflow run, and when it dies the queue starts another that replays the run" src="assets/workflow.svg" />
</p>

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
