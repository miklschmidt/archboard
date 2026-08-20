---
name: archboard-dev
description: Procedures for working on archboard itself — rebuilding with bun, syncing skills, cherry-picking from upstream mcp_excalidraw rather than merging it, and verifying the canvas round-trip end to end with a browser attached. Use when changing this repo's own source, taking a fix from upstream, or checking that a canvas change actually works.
---

# Working on archboard

Always-on context lives in `CLAUDE.md`; fork rationale and roadmap in
`DESIGN.md`. This skill is the procedural half: how to actually do the recurring
jobs.

## After changing source

There is no build step for the server or the CLI. bun runs the TypeScript, so
`./bin/canvas` picks up a source change on the next command (ADR 0014). Two
things still do not:

```bash
bunx vite build     # frontend/src/ changed -> dist/frontend/
./bin/canvas stop && ./bin/canvas start   # src/ that the SERVER executes changed
```

A running process read its source at start, so a server route keeps its old
behaviour until it is restarted while the CLI already has the new one. That
split is what made TASK-056 confusing.

**A restart drops every unsaved board**, so save first, or ask. When you are
working on the server itself, reload instead of restarting:

```bash
bun run dev:canvas     # the canvas, reloadable, keeping the boards
bun run reload    # and this is what reloads it
```

A reload re-evaluates modules inside the running process, so the port, the open
tabs, the boards, the panes and the change feed's cursor all survive. It is not
`--watch`, which restarts and takes them with it.

**Saving a file does not reload anything.** `bun --hot` re-evaluates the whole
module graph on any change, so the trigger is narrowed to a command: the entry
bun watches (`src/dev-canvas.ts`) re-imports the canvas only when
`bun run reload` moves a reload token. A canvas from `canvas start` cannot
reload at all and says so.

Anything long-lived you add to the server has to go through `kept()` in
`src/core/hot.ts`, or a reload will quietly replace it while the tabs stay
connected. Two things catch that so you do not have to remember it:

- `bun run test:module-scope` refuses module-scope state in the canvas's import
  graph. Waive a false positive with `// hot-safe: <reason>`.
- Every reload compares boards, panes, sockets and the feed cursor across it,
  and shouts to the terminal and to every open tab if anything moved.
  `bun run test:hot` breaks a reload on purpose to prove that works.

This box has node + bun but **no npm/npx**. The `package.json` scripts shell out
to bun, so use `bun run <script>` — never `npm run`. `bun install` intermittently
fails extracting a tarball — run it again.

## Verify a canvas change actually works

Do not trust a green build. The round-trip is the thing that breaks, and it
only breaks with a browser attached.

```bash
./bin/canvas clear --board scratch --yes
cat <<'EOF' | ./bin/canvas add --board scratch
[{"type":"rectangle","x":100,"y":100,"width":300,"height":120,
  "backgroundColor":"#e3f2fd",
  "label":{"text":"Probe"},
  "customData":{"archboard":{"node":"probe","kind":"service"}}}]
EOF
./bin/canvas describe --board scratch                # reads as 1 node, not 1 rectangle
./bin/canvas query --board scratch --type rectangle  # customData + link visible here
```

Every command that touches a board names it, and one that does not is refused
(ADR 0009). `scratch` is what a lone pane holds, so it is the board a probe
usually wants.

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
./bin/canvas promote --board scratch --kind service --name "Probe" --path src/core/promote.ts
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
bun run type-check && bun run test               # always check after
```

Prefer reading their fix and reimplementing it our way over importing their
structure wholesale.

## Syncing skills

```bash
bun scripts/sync-skills.mjs      # skills/ -> .agents/skills/ -> .claude/skills/
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
  only what `board save --board <key>` wrote to the vault — unsaved edits, and the whole
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
- **The library is server state, not browser state** (ADR 0007). It is in
  `<vault>/.archboard/library.excalidrawlib`, seeded from `libraries/` on first
  read, and pushed to every pane over the socket — so `library list` answers
  with no browser open, and clearing a browser profile costs nothing. Two
  consequences when testing: the seed only happens once per vault (delete that
  file to re-run it), and a stencil dragged onto a canvas is plain elements from
  that moment on, so `describe` will never mention the library.
- **Opening the library sidebar with 111 stencils takes several seconds** —
  Excalidraw renders a preview per item. That is its cost, not ours; do not read
  it as the sync path hanging.
- **The browser never sends a scene.** It reports a delta to
  `POST /api/elements/changes` against a baseline of what that tab has actually
  received, and the server merges it. There is no endpoint that replaces a
  board wholesale from a client, and adding one back would reopen the
  stale-tab-truncates-the-board hole (TASK-016). Deletions only ever name ids
  the reporting tab already held.
- **A second pane starts on what the first is showing, and is then pointed
  somewhere else** — `board open <name> --pane right`. The switch reaches that
  pane's socket alone (`sendToPane`, not `broadcast`), only that pane's
  selection is retired, and the change feed is reset only when the board was
  not already on screen in another pane. A regression here looks like the other
  pane's scene being replaced, so test with two boards, never two panes on one.
- **There is no active board to fall back to** (ADR 0009). `activeBoardKey()`
  and friends are deleted, `resolveBoard()` requires a key, and every
  board-blind caller funnels through it — which is why the refusal only had to
  be written once. If you add a route that reads or writes elements, call
  `boardFromRequest(req, 'What it is doing')` and the refusal comes with it.
  Do not add a default "for convenience": that is the whole bug.
- **A pane exists only while its socket is open.** `panes` is fed by pushes from
  the browser keyed by client id, and the close handler retires the pane and its
  selection together. So a closed tab or an unsplit disappears from the report
  with nothing to clean up, and no browser at all reports as no panes — which is
  a normal state, not an error.

## Tracker

Backlog.md, via the CLI only — never hand-edit files under `backlog/`.
See `docs/agents/issue-tracker.md`.
