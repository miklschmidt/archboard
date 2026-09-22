# Working rules for agents and subagents in archboard

Facts every agent here needs, including subagents that start with nothing but these instructions.

- **Skill evaluations are human-run.** Never start `bun run eval:skill run` or `grade`, not even as a smoke test. A batch under `.skill-evals/` is ~15 GB of preserved worlds: read its files by exact path and never walk it recursively. `docs/design/skill-evals/baseline/**` is the frozen comparison arm; leave it untouched.
- **The gate lanes chain with `&&`**, so one failure in `bun run check` hides every later lane. Run them one at a time: `lint`, `fmt:check`, `type-check`, `test:modules`, then `test:system`, `test:repository`, `test:serial-browser` when the change reaches those boundaries. When several workers share the tree, the parent runs `bun run check` once at the end.
- **Leave canvases alone** unless the task is about one: a second canvas is refused while one runs.
- **A fresh worktree needs a real install**: `bun install`, `bun run generate:codex-contract`, `bun run build:frontend`. A symlinked `node_modules` breaks the contract check and owned canvases.
- **Skills are synced centrally.** When several workers share the tree, edit `skills/` only and leave `bun scripts/sync-skills.ts` to the parent.
