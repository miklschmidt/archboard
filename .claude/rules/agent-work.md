# Working rules for agents and subagents in archboard

Facts every agent here needs, including subagents that start with nothing but these instructions.

- **Skill evaluations are human-run.** Never start `bun run eval:skill run` or `grade`, not even as a smoke test. A batch under `.skill-evals/` is ~13 GB of preserved worlds: read its files by exact path and never walk it recursively.
- **`bun run check` chains its lanes with `&&`**, so an early failure hides every later lane. When it stops early, run the remaining lanes (`test:system`, `test:repository`, `test:serial-browser`) explicitly before calling a failure the only one.
- **A fresh worktree needs `bun install` and `bun run build:frontend`**: install's postinstall generates the Codex contract, and a canvas serves the ignored `dist/frontend`. A symlinked `node_modules` fails the contract check, which refuses symlinks that leave the checkout.
