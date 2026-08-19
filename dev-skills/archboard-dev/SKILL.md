---
name: archboard-dev
description: Procedures for working on the whiteboard fork itself — rebuilding after changes, merging upstream mcp_excalidraw, syncing skills, and verifying the canvas round-trip end to end. Use when changing this repo's own source, taking upstream changes, or checking that a canvas change actually works.
---

# Working on archboard

Repo-local skill. Not published — see `dev-skills/README.md` for why this is
separate from `skills/`.

Always-on context lives in `CLAUDE.md`; fork rationale and roadmap in
`DESIGN.md`. This skill is the procedural half: how to actually do the recurring
jobs.

## Rebuild after changing source

This box has node + bun but **no npm/npx**, so `npm run *` scripts do not work.
Drive the tools directly:

```bash
bunx tsc            # server -> dist/
bunx vite build     # frontend -> dist/frontend/
./bin/canvas stop && ./bin/canvas start
```

Changing anything under `frontend/src/` needs the vite build; server-only
changes need just `tsc`. `bun install` intermittently fails extracting a
tarball — run it again.

## Verify a canvas change actually works

Do not trust a green build. The round-trip is the thing that breaks, and it
only breaks with a browser attached.

```bash
./bin/canvas clear --yes
cat <<'EOF' | ./bin/canvas add
[{"type":"rectangle","x":100,"y":100,"width":300,"height":120,
  "label":{"text":"Probe"},
  "link":"file:///tmp/probe.ts",
  "customData":{"kind":"service","variant":"current"}}]
EOF
./bin/canvas describe
./bin/canvas query --type rectangle    # customData + link visible here
```

Then open <http://127.0.0.1:3000>, **drag the box**, and re-run `query`. The
position must change and `customData` / `link` must survive. That frontend
round-trip is where metadata gets silently dropped; a headless test will not
catch it.

Elements that came back through the browser are tagged
`"source": "frontend_sync"`.

## Taking something from upstream

Archboard is **not** kept mergeable with `yctimlin/mcp_excalidraw`. Do not run
`git merge upstream/main` — it will drag in conventions we have deliberately
replaced. Restructure freely; upstream's opinion is not a constraint.

The remote is kept for reference and for cherry-picking a specific fix:

```bash
git fetch upstream
git log --oneline HEAD..upstream/main            # what changed there
git log -p upstream/main -- path/to/file.ts      # read before taking
git cherry-pick <sha>                            # only when it clearly applies
bunx tsc && bunx vite build                      # always rebuild after
```

Prefer reading their fix and reimplementing it our way over importing their
structure wholesale.

## Syncing skills

```bash
node scripts/sync-skills.mjs      # skills/ + dev-skills/ -> .agents/ -> .claude/
skills experimental_install       # third-party, from skills-lock.json
```

`skills/` is for consumers of the canvas and must stay portable — **no
machine-specific paths**. It names both `npx -y mcp-excalidraw-server` and
`./bin/canvas` so it works inside and outside the repo without local patching.
`dev-skills/` is for maintainers and may reference repo paths freely.

`~/.claude/skills/excalidraw-skill` is a symlink to this repo's synced copy, so
the canvas skill is available in other repos and cannot drift. Re-running the
sync updates it automatically.

## Things that will mislead you

- **npm `latest` is 1.1.0**, two releases behind. Upstream tags v2.0.0 in git but
  never published it. Never `bun add mcp-excalidraw-server`; build from source.
- **`describe` ignores `customData` and `link`** (TASK-001). Use `query` until
  that is fixed — the agent's main read path is currently blind to the semantic
  model.
- **The canvas is in-memory** and clears on server restart. Export or snapshot
  deliberately.
- **`export --out` does not `mkdir -p`** — create the directory first.
- The page title still says "Excalidraw POC - Backend API Integration".

## Tracker

Backlog.md, via the CLI only — never hand-edit files under `backlog/`.
See `docs/agents/issue-tracker.md`.
