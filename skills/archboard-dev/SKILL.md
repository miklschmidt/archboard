---
name: archboard-dev
description: Working on archboard's own source — restart semantics, taking a fix from upstream without merging, syncing the tracked skills, and the handful of facts that are not derivable from the code and will otherwise cost an afternoon. Use when changing this repo, cherry-picking from upstream, or verifying a canvas change.
---

# Working on archboard

Always-on rules are in `AGENTS.md`; procedures for running and verifying the
canvas are in `TESTING.md`. This skill holds only what neither the code nor
those documents will tell you.

## Taking something from upstream

Archboard is not kept mergeable with `yctimlin/mcp_excalidraw`. Never
`git merge upstream/main`; it drags back conventions this repo replaced. The
remote exists for reference and for taking one specific fix:

```bash
git fetch upstream
git log -p upstream/main -- path/to/file.ts   # read before taking
git cherry-pick <sha>                          # only when it clearly applies
bun run check
```

Prefer reimplementing their fix our way over importing their structure. The npm
package `mcp-excalidraw-server` is releases behind the git tag; never install it.

## Syncing skills

`skills/` is the single tracked source; `bun scripts/sync-skills.ts` replaces
`.agents/skills/` and `.claude/skills/` from it, leaving third-party skills
(`skills experimental_install`, pinned in `skills-lock.json`) alone.
`~/.agents/skills/archboard` symlinks into the synced copy so other repos use
the same canvas skill. Keep the `archboard` skill free of machine-specific
paths; it runs outside this repo.

## Facts that will mislead you

- A shape with `backgroundColor: transparent` is hit-testable only on its
  stroke, except a labelled one, which hit-tests inside. A test built on a
  labelled probe therefore passes whether or not fills work. Shapes are filled
  by default since TASK-009 (`src/shared/appearance/appearance.ts`).
- `describe` degrades above 120 nodes to a per-kind rollup on purpose; use
  `query` for the exhaustive set.
- A refused write is the design (ADR 0006): a note that changed underneath is
  reported and the board is held, never overwritten, reloaded or merged. Do not
  "fix" a refusal; `--force` exists for the person, not for you.
- Opening the library sidebar with a hundred stencils takes seconds because
  Excalidraw renders a preview per item; it is not the sync path hanging.
- Test with two boards when checking pane switching, never two panes on one
  board: a switch reaches one pane's socket, and a regression looks like the
  other pane being replaced.
