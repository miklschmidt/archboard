---
name: whiteboard-dev
description: Procedures for working on the whiteboard fork itself — rebuilding after changes, merging upstream mcp_excalidraw, syncing skills, and verifying the canvas round-trip end to end. Use when changing this repo's own source, taking upstream changes, or checking that a canvas change actually works.
---

# Working on the whiteboard fork

Repo-local skill. Not published — see `dev-skills/README.md` for why this is
separate from `skills/`.

Always-on context lives in `CLAUDE.md`; fork rationale and roadmap in
`FORK.md`. This skill is the procedural half: how to actually do the recurring
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

## Merging upstream

`main` is based on upstream v2.0.0 (`6ddbe98`) with full history, and staying
mergeable is a deliberate constraint — upstream is actively releasing.

```bash
git fetch upstream
git log --oneline HEAD..upstream/main     # what is new
git merge upstream/main
bunx tsc && bunx vite build               # always rebuild after a merge
```

Expect conflicts in `.gitignore` — we deliberately diverge there, in a marked
`fork divergences` block:

- `docs/*` un-ignored for `docs/agents/` (agent configuration is tracked)
- `*.excalidraw` un-ignored for `diagrams/` (committed diagrams are a
  deliverable, not build output)
- `.claude/` and `.agents/` blanket ignores replaced with precise
  `.claude/skills/` + `.agents/skills/` (only the derived subpaths)

Keep our patches surgical and upstreamable. Prefer fixing something in a way
upstream would accept over a local hack.

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
