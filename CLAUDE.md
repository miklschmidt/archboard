# archboard — agent-driven architecture canvas

An internal tool: a live Excalidraw canvas for building, exploring, and
refactoring **code and infrastructure architecture** by voice with an agent.
Private, never published.

- Display setup (Samsung Flip WM75FX): `FLIP_WHITEBOARD.md`
- Design and roadmap: `DESIGN.md`
- Running it end to end with Codex: `TESTING.md`

## Relationship to upstream

`main` is based on [yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw)
`v2.0.0` (`6ddbe98`, 2026-08-09) with full upstream history retained.

**Archboard is diverging deliberately and is not kept mergeable.** Restructure
freely — rename things, delete what we don't use, break upstream conventions
where ours are better. The `upstream` remote exists for reference and occasional
cherry-picking, not as a merge target. Early docs and commits optimised for
upstreamability; that constraint is gone.

Archboard is **private and never published to npm** (`"private": true`). Upstream
tags v2.0.0 in git but never published it either — npm `latest` is 1.1.0, from
2026-07-06, and two releases behind. Always build from source; never
`bun add mcp-excalidraw-server`.

## Build and run

This box has node + bun but **no npm/npx**. The `package.json` scripts now shell
out to bun, so run them with `bun run`, never `npm run`:

```bash
bun install
bun run build       # -> dist/ and dist/frontend/
bun run type-check
bun run test        # MCP stdio wire checks + loopback-bind check

./bin/canvas start  # canvas server on 127.0.0.1:3000
./bin/canvas status
./bin/canvas stop
```

Or drive the tools directly: `bunx tsc` (server), `bunx vite build` (frontend).

`bun install` intermittently fails extracting a tarball; just run it again.

`bin/canvas` wraps `dist/bin.js` and resolves from any cwd. Use it, never `npx`.

Open <http://127.0.0.1:3000>. A browser tab is required for `screenshot`,
`mermaid`, image export, and viewport control; pure JSON ops work headless.

## Skills (after a fresh clone)

`.agents/skills/` and `.claude/skills/` are **derived and untracked**, so a
clone has no skills until you restore them:

```bash
skills experimental_install     # 28 third-party skills, from skills-lock.json
node scripts/sync-skills.mjs    # ours, from skills/
```

The sync creates the `.claude/skills/` symlinks itself; no manual linking.

Everything else under `.claude/` — `settings.json`, `commands/`, `agents/` — is
authored configuration and **is** tracked.

`skills/` is our single tracked source: any subdirectory with a `SKILL.md` is a
skill, so adding one means adding a directory. Portability is a property of the
individual skill, not the location — `excalidraw-skill` is used outside this
repo so it stays path-free, while maintainer-facing skills like `archboard-dev`
may reference repo paths freely.

Our skills are deliberately absent from `skills-lock.json`, which pins only
third-party skills — that keeps the skills tool from clobbering ours.

`~/.claude/skills/excalidraw-skill` is a symlink to the synced copy, so the
canvas skill works in other repos and cannot drift.

## The loop

```
agent reads code  ->  draws the architecture  ->  you rearrange it on the Flip
      ^                                                      |
      +------------  agent reads the new layout  <-----------+
```

The read-back is the point. Moving a box is a statement about the design.

```bash
./bin/canvas describe                 # AI-readable scene text
./bin/canvas query --type rectangle   # structured, includes customData + link
./bin/canvas screenshot --out /tmp/c.png
```

## Verified behaviour (v2.0.0)

Established by testing this build, not by reading docs.

| Change | Reaches server state? |
|---|---|
| Agent `add` / `batch_create` | yes, immediately |
| Human drags / edits / hand-draws | yes, automatically |
| `./bin/canvas mermaid` | **yes** — fixed in v2 |

The one-way mermaid behaviour was a **1.1.0 bug**, fixed upstream by reporting
the converted elements after conversion. Do not design around it.

**The server is authoritative over the board.** A browser never sends a scene:
it reports a delta — `POST /api/elements/changes` with `upserts` and `deletes` —
computed against a baseline of the elements that tab has actually received, and
the server applies it. A tab therefore cannot name, and so cannot destroy, an
element it has never seen. The upstream `POST /api/elements/sync`, which cleared
the board's element map and refilled it from one tab, is gone (TASK-016).

**`customData` and `link` both survive the full round-trip**, including the
change report a human's drag produces. Verified with a real drag:
position changed, both fields intact. This is the metadata channel — no sidecar
file, no encoding paths into labels.

```json
{"type":"rectangle","x":100,"y":100,"width":300,"height":120,
 "label":{"text":"AuthService"},
 "link":"file:///abs/path/src/auth/service.ts",
 "customData":{"kind":"service","path":"src/auth/service.ts","variant":"current"}}
```

`link` renders as a clickable affordance on the shape — tap the box on the Flip,
open the file.

Elements synced from the browser are tagged `"source": "frontend_sync"`, which
distinguishes human edits from agent-authored elements.

**Shapes are filled by default, because a transparent shape can only be tapped
on its stroke.** Excalidraw hit-tests an interior only when the shape is
"draggable from inside" — `!isTransparent(backgroundColor)` or a bound label —
so a hollow unlabelled box swallows every tap aimed at its middle. Three
defaults close that (TASK-009), all from the palette in `src/core/appearance.ts`:

- `add` / `batch_create` give a rectangle, ellipse or diamond `#ffffff` +
  `fillStyle: solid` unless the caller states a `backgroundColor`. Passing
  `"transparent"` explicitly still means transparent.
- The browser seeds the same default, so a **hand-drawn** box is filled the
  moment it is drawn — which matters, because a box has to be tappable before
  it can be selected and promoted.
- `promote` repaints a node in its kind's pastel — service purple, queue
  orange, datastore cyan, gateway blue, external gray — but only when nobody
  chose a colour (still transparent, or still the neutral default). `demote`
  leaves the fill alone; reverting it would make the node untappable again.

White on a light canvas, near-black on a dark one: the board looks as it did,
it is only now tappable. `describe` stays quiet about the default fill and
still prints a colour someone chose.

**The board reports what it became, not what moved.** Every mutation feeds a
settle window (default 1.2 s); when the board goes still, the state is diffed
against the last state anybody was told about, in `compare`'s vocabulary —
nodes and edges added, removed, promoted, rerouted; clusters, containment,
groups, whereabouts, relative direction. One drag is one event, or none: a
nudge that changes nothing nameable, or only a colour, emits nothing *and does
not move the baseline*, so small movements still add up until they mean
something. Read it with `changes [--since <cursor>] [--coalesce] [--text]`;
`--coalesce` gives one net diff since a cursor, which is the shape a
per-turn hook wants. Cursors are per canvas process — watch `feedId`.

**The canvas can push those events into a live Codex thread, but only when
asked.** `ARCHBOARD_INJECT=1` at server start arms it; a non-loopback bind
refuses regardless (ADR 0005 — anything that can reach the canvas could
otherwise drive the agent). Quiet by default: `thread/inject_items` appends to
thread history without starting a turn. `ARCHBOARD_INJECT_LOUD=1` allows
`turn/steer`, which interrupts and makes the agent speak — an experiment, off
by default. The agent's own drawing is never injected back at it. See
`inject status` and TESTING.md §6.

## Known gaps (our work)

Tracked in Backlog.md; `backlog task list --plain` is authoritative.

- `export --out` does not `mkdir -p`.
- **The canvas holds one board for every pane.** The shell can mount a second
  pane, and `panes` reports each pane's own board — but the server has a single
  active board, so both panes show it. Per-pane boards are TASK-021.

Closed: board writes are checked, not last-writer-wins — a note that changed on
disk is refused, never overwritten (TASK-010).
`describe` surfaces `customData` and `link`, separates nodes from plain
elements, and folds bound labels and multi-element nodes (TASK-001). Obsidian
export preserves custom frontmatter, so board identity survives (TASK-002).
Boards are addressable, persisted vault notes and the store and the WebSocket
protocol carry a board key (TASK-003). Selection reaches the server and is
readable via `selection` / `get_selection`
(TASK-004). Promotion declares a selection to be a node with a git-resolved
binding (TASK-005). The CLI and MCP handshake identify as `archboard`
(TASK-008). A shell hosts the canvas, the server is authoritative over element
state, clearing asks first, and boards and variants are openable from the UI
(TASK-016). Shapes are filled by default, so tapping the middle of a box —
agent-drawn or hand-drawn — selects it (TASK-009).

## Names on the wire

`archboard` is the CLI's own name in help and errors, the MCP `serverInfo.name`
in the `initialize` handshake, and the `source` stamped into exported
`.excalidraw` scenes. No MCP client config needs to change: tool names are flat
(`create_element`, …) and never namespaced by the server name — a client's
`mcpServers` key, which is what prefixes tools in a client UI, is chosen in the
config, not derived from `serverInfo.name`.

Two internal identity strings deliberately keep the old spelling, because they
are handshakes between our own processes rather than anything a user reads:
`mcp-excalidraw-canvas` in `/health` (`CANVAS_SERVICE_NAME`, how the client
proves it is not talking to a foreign service on the port) and the
`excalidraw-canvas` state directory holding the pidfile (renaming it would
orphan a running server's pidfile). Neither is printed by any command.

## Boards

A **board** is a named diagram persisted as one `.excalidraw.md` note in an
Obsidian vault (ADR 0004). The canvas holds exactly one at a time; `board open`
is how that one gets swapped.

Set the vault before anything board-shaped works — it spans repositories, so
there is deliberately no default:

```bash
export ARCHBOARD_VAULT=/path/to/vault    # or put it in .env
```

```bash
./bin/canvas board list                       # what the vault has, what is open
./bin/canvas board new payments --level service
./bin/canvas board save                       # writes payments.excalidraw.md
./bin/canvas board open payments@option-a     # swaps the canvas
./bin/canvas board current                    # identity of the open board
```

Addressing: `current` is the privileged variant — the architecture that exists —
so it owns the bare name and the bare filename. Every other variant is
`name@variant`, stored as `name@variant.excalidraw.md`. Variant is an open set,
so a three-way option comparison is just `payments@option-a`, `@option-b`,
`@option-c` next to `payments`. A name may contain `/` to nest the note in vault
folders.

Identity lives in the note's frontmatter as plain `board`, `variant` and `level`
properties, and round-trips. The path is the address; the frontmatter is the
record, and `board open` says so when the two disagree. Everything else in the
frontmatter — aliases, cssclasses, comments, whatever Obsidian put there — is
carried across a save verbatim, so export stays idempotent (two saves are
byte-identical) and lossless (open then save is byte-identical).

**A save can be refused.** archboard records the sha-256 of a note's bytes when
it reads it and verifies that hash against the destination before writing, so a
note that changed underneath — Obsidian, a sync client, another editor — is
never overwritten. The save is refused with nothing written: `board save` exits
5, `save_board` returns an error, and the shell's Save puts up a dialog. Each
names the same three outcomes, and archboard picks none of them (ADR 0006):

| Outcome | How | What it costs |
|---|---|---|
| Reload | `board open <name> --reload` | the canvas as it stands |
| Overwrite | `board save --force` | whatever the note holds |
| Save elsewhere | `board save --as <other>` | nothing; both copies kept |

The same refusal covers a destination archboard has never read — a `board new`
whose file appeared underneath it, or a `--as` onto an existing note.

Nothing is locked, and the check reads the file rather than another app's
memory, so a board open in Obsidian can still write its unsaved copy back
afterwards: **keep a board open in one editor at a time.**

The board key reaches the store, the REST API (`?board=` on every element
route) and the WebSocket protocol (every broadcast names its board; a
`board_switched` message swaps the browser's scene). Callers that say nothing
about boards get the active one, which is what everything written before boards
existed means. Before any board is opened the canvas holds a `scratch` board
that has no home in the vault until `board save --as <name>` gives it one.

## Artifacts

```bash
mkdir -p diagrams
./bin/canvas export --out diagrams/arch.excalidraw
./bin/canvas import diagrams/arch.excalidraw   # merges by default
./bin/canvas snapshot save before-split
```

Commit diagrams alongside the code change so architecture decisions are
reviewable in the diff.

## Stencils

The library — the palette shapes are dragged from — lives on the canvas server,
not in browser storage (ADR 0007), so every pane and every tab shares one and an
agent can read it:

```bash
./bin/canvas library list --text
```

Seven curated libraries ship in `libraries/` (111 stencils, attributed per file
in `libraries/README.md`) and are seeded into the store the first time it is
read, so they need no network fetch. **Add to Excalidraw** on
libraries.excalidraw.com works: the returning `#addLibrary=` hash is fetched
under an allowlist and installed after a prompt.

A stencil is not board content. Dragging one onto a canvas produces ordinary
elements that reach the server through the normal change report; nothing about
the library touches the element store or the change feed.

## Agent skills

### Issue tracker

Issues and planning live in Backlog.md under `backlog/`, driven through the
`backlog` CLI — never edit those files by hand. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical role strings, used verbatim (Backlog.md labels are
free-form, so no mapping is needed). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root, both created
lazily. See `docs/agents/domain.md`.

<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.50.1 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->
