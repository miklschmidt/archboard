---
name: archboard-dev
description: Procedures for working on archboard itself — rebuilding with bun, syncing skills, cherry-picking from upstream mcp_excalidraw rather than merging it, and verifying the canvas round-trip end to end with a browser attached. Use when changing this repo's own source, taking a fix from upstream, or checking that a canvas change actually works.
---

# Working on archboard

Always-on context lives in `CLAUDE.md`; fork rationale and roadmap in
`DESIGN.md`. This skill is the procedural half: how to actually do the recurring
jobs.

## Rebuild after changing source

This box has node + bun but **no npm/npx**. The `package.json` scripts shell out
to bun, so use `bun run <script>` — never `npm run`. Or drive the tools directly:

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
  "backgroundColor":"#e3f2fd",
  "label":{"text":"Probe"},
  "customData":{"archboard":{"node":"probe","kind":"service"}}}]
EOF
./bin/canvas describe                  # reads as 1 node, not 1 rectangle
./bin/canvas query --type rectangle    # customData + link visible here
```

Metadata goes under `customData.archboard` (ADR 0003) — namespaced, never flat,
because the Obsidian plugin writes its own top-level keys. The explicit
`backgroundColor` above is only there to show one being honoured — since
TASK-009 a shape gets a fill on its own (`src/core/appearance.ts`), which is
what makes its interior tappable.

Then open <http://127.0.0.1:3000>, **drag the box**, and re-run `query`. The
position must change and `customData` / `link` must survive. That frontend
round-trip is where metadata gets silently dropped; a headless test will not
catch it.

Elements that came back through the browser are tagged
`"source": "frontend_sync"`.

To exercise the full interaction, click the box in the browser and then:

```bash
./bin/canvas selection --text          # what the human has picked
./bin/canvas promote --kind service --name "Probe" --path src/core/promote.ts
```

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
node scripts/sync-skills.mjs      # skills/ -> .agents/skills/ -> .claude/skills/
skills experimental_install       # third-party, from skills-lock.json
```

`skills/` is the single tracked source: every subdirectory with a `SKILL.md` is
synced, so adding a skill is just adding a directory. The sync replaces rather
than overlays, so deleted files don't linger, and it leaves the third-party
skills in `.agents/skills/` alone.

`excalidraw-skill` is used outside this repo too, so keep it portable — **no
machine-specific paths**. It names both `archboard` (the package's single bin,
for use outside the repo) and `./bin/canvas` (inside it), so it works in both
places without local patching.
Maintainer-facing skills like this one may reference repo paths freely.

`~/.claude/skills/excalidraw-skill` is a symlink to this repo's synced copy, so
the canvas skill is available in other repos and cannot drift. Re-running the
sync updates it automatically.

## Things that will mislead you

- **npm `latest` is 1.1.0**, two releases behind. Upstream tags v2.0.0 in git but
  never published it. Never `bun add mcp-excalidraw-server`; build from source.
- **A shape with `backgroundColor: transparent` is only hit-testable on its
  stroke** — with one exception that will waste an afternoon if you don't know
  it. Excalidraw's rule is `!isTransparent(backgroundColor) ||
  hasBoundTextElement(el) || ...`, so a *labelled* transparent shape does hit-test
  inside and an unlabelled one does not. A test built on a labelled probe
  therefore passes whether or not fills work. Since TASK-009 shapes are filled
  by default (`src/core/appearance.ts`), so this only bites on shapes made
  before that or explicitly opted out with `"backgroundColor": "transparent"`.
- **`describe` degrades above 120 nodes** to a per-kind rollup rather than
  dumping every node. That is deliberate (narratability); use `query` when you
  need the exhaustive set.
- **The canvas is in-memory** and clears on server restart. A board survives
  only what `board save` wrote to the vault — unsaved edits, and the whole
  `scratch` board, die with the process. Export or save deliberately.
- **Board commands need `ARCHBOARD_VAULT`** and there is no default, so a shell
  without it makes every board command fail on the vault message rather than on
  whatever you were testing. Set it before `./bin/canvas start` — the canvas
  server does the vault I/O, so exporting it after the server is up changes
  nothing.
- **A board save can be refused, and that is the design** (ADR 0006). archboard
  records the sha-256 of a note's bytes when it reads it and verifies it before
  writing; a file that changed underneath is reported, never overwritten. Do not
  "fix" this by reloading or merging — both were considered and rejected,
  because an Excalidraw scene has no merge and reloading just swaps which side
  loses silently. `--force` exists for the human, not for you.
- **`export --out` does not `mkdir -p`** — create the directory first.
- **The browser never sends a scene.** It reports a delta to
  `POST /api/elements/changes` against a baseline of what that tab has actually
  received, and the server merges it. There is no endpoint that replaces a
  board wholesale from a client, and adding one back would reopen the
  stale-tab-truncates-the-board hole (TASK-016). Deletions only ever name ids
  the reporting tab already held.
- **A second pane shows the same board as the first**, because the server has
  one active board. The shell mounts panes; per-pane boards are TASK-006.

## Tracker

Backlog.md, via the CLI only — never hand-edit files under `backlog/`.
See `docs/agents/issue-tracker.md`.
