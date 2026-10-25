# Working rules for agents and subagents in archboard

Facts every agent here needs, including subagents that start with nothing but these instructions.

- **Skill evaluations are human-run.** Never start `bun run eval:skill run` or `grade`, not even as a smoke test. A batch under `.skill-evals/` is ~13 GB of preserved worlds: read its files by exact path and never walk it recursively.
- **`bun run check` runs ordered Vite+ tasks**, so an early failure hides every later lane. When it stops early, run the remaining lanes with `bunx vp run <task>` (`test:system`, `test:repository`, `test:serial-browser`) before calling a failure the only one.
- **Never pipe `backlog` into `head` or another reader that stops early.** Backlog.md 1.53.0 spins at full CPU forever when that reader closes the pipe while it prints task parse errors, and the spinning process ignores SIGTERM, so `timeout` does not end it. Write the output to a file, then read the file.
- **Impeccable images come from Codex.** Generate every Impeccable comp, plate or other raster with `codex -m gpt-6.1-sol exec <prompt>`, in place of `impeccable generate-image`.
- **A fresh worktree needs `bun install` and `bun run build`**: install's postinstall generates the Codex contract, and an Archboard server serves the ignored `dist/frontend`. A symlinked `node_modules` fails the contract check, which refuses symlinks that leave the checkout.
