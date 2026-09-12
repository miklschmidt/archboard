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

- **A pane key carries a variant; a board name never does.** `payments@<variant>`
  is an address, and `readSemanticBoard` on one THROWS, because a board is one
  document holding the whole family. Split it first (`parseBoardKey`, or
  `aggregateOf` on the server). Everything a board has — the file, the lease,
  the claim, what an agent said it was doing — is keyed by the board; only what
  is drawn depends on the variant. This is the same bug three times over if you
  get it wrong once.
- **A pane's board may be null.** A fresh vault holds no board, and a pane that
  could not register until one existed could never be shown the first board
  somebody makes.
- A refused write is the design (ADR 0006 as it now stands): a stale version is
  reported and nothing is written. Do not "fix" a refusal by reading the board
  again and retrying — that makes the check pass by construction and hides the
  change it was meant to notice.
- Test with two boards when checking pane switching, never two panes on one
  board: a switch reaches one pane's socket, and a regression looks like the
  other pane being replaced.
- The browser holds no board content. If you find yourself wanting to cache
  something the server knows, the answer is a query the pane re-reads on the
  board's own announcement, not a copy (ADR 0023).
- **Text width is measured against the real font files, with no browser.**
  `tests/system/browser/measured-text.test.ts` holds the engine to what Chrome
  actually draws; the two agree to under one percent, and an estimate is out by
  tens of them.
