# archboard — agent-driven architecture canvas

An internal tool: a live Excalidraw canvas for building, exploring, and
refactoring **code and infrastructure architecture** by voice with an agent.
Private, never published.

- Display setup (Samsung Flip WM75FX): `FLIP_WHITEBOARD.md`
- Design and roadmap: `DESIGN.md`
- Running it end to end with Codex: `TESTING.md`
- Installing it for use in other repos: `INSTALL.md`

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
bun run test        # stdio wire, loopback bind, obsidian, changes, geometry,
                    # labels, library, boards + panes, branch vs redraw,
                    # proposal beside source, skill install, repo bindings,
                    # CLI/MCP surface parity

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
./bin/canvas panes                              # which pane holds which board
./bin/canvas describe --board payments          # AI-readable scene text
./bin/canvas query --board payments --type rectangle   # includes customData + link
./bin/canvas screenshot --out /tmp/c.png --pane right   # one pane, whatever it holds
```

## Verified behaviour (v2.0.0)

Established by testing this build, not by reading docs.

| Change | Reaches server state? |
|---|---|
| Agent `add` / `batch_create` | yes, immediately |
| Human drags / edits / hand-draws | yes, automatically |
| `./bin/canvas mermaid` | **yes** — fixed in v2 |
| A board opened into one pane | that pane only; the other keeps its board, its scene and its pick |

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
agent-drawn or hand-drawn — selects it (TASK-009). Each pane holds its own
board, so current and proposed sit side by side, and every call names the board
it means — there is no active board left to resolve against (TASK-021, ADR 0009).
A bound label goes where its container goes, so moving, resizing or re-routing
through the API leaves no label stranded and no phantom region in the scene box
(TASK-034).
`install-skill` sets a repo up rather than only copying files: it chooses a
vault (a repo-local one unless told otherwise), creates it, and writes the vault
path, the command that runs the CLI there and a place for board conventions into
that repo's own `CLAUDE.md` or `AGENTS.md` (TASK-036).
A binding comes from a repository the caller named rather than from an ambient
working directory, and a machine-local registry says where each repository is
checked out here (TASK-031, ADR 0011). An agent standing in a repository can ask
which boards describe it, answered from the bindings rather than from board
names (TASK-030).
An arrow is placed by its path, not by `x, y, width, height`. Its `x, y` is
its first point, so an arrow drawn leftwards or upwards sits nowhere inside
`x .. x + width`. The server also restates `width` and `height` every time it
writes a path, so a re-routed arrow is no longer recorded at the size it used
to be (TASK-038, `src/core/geometry.ts`).
Panes are made and unmade from the command line, and a picture or a camera move
names the pane it means, so a thread that cannot click can put two boards side
by side and see both (TASK-033).

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
Obsidian vault (ADR 0004). A pane holds exactly one at a time; `board open` is
how a pane's board gets swapped.

**Every call names its board, and one that does not is refused** (ADR 0009).
There is no active board and no default — two panes hold two boards, so "the
board" has no referent, and a write resolving against ambient state is the
mistake this exists to prevent. Name it with `--board <key>` on the command
line, `?board=` on the API, or the required `board` argument on an MCP tool.
The refusal lists what is open, so the next step is on screen at the moment of
the mistake.

Set the vault before anything board-shaped works — it spans repositories, so
there is deliberately no default:

```bash
export ARCHBOARD_VAULT=/path/to/vault    # or put it in .env
```

```bash
./bin/canvas board list                          # the vault, what is open, what is on screen
./bin/canvas board new payments --level service
./bin/canvas board save --board payments         # writes payments.excalidraw.md
./bin/canvas board open payments@option-a        # into the only pane
./bin/canvas board open payments@option-a --pane right
./bin/canvas board info --board payments         # identity and save state of one board
./bin/canvas describe --board payments@option-a
```

`board open` puts a board in a **pane**, and the pane is the one axis that
still has a default — but only where it cannot be wrong. One pane on screen and
it goes there; two and `--pane left|right|1|primary` is required; none and the
board is loaded without being shown. Every answer names the pane it landed in.
Display may follow the human's attention; authority never does.

**Panes are made and unmade from the command line, not only from the chrome**
(TASK-033). Layout used to live entirely in the browser, so an agent asked to
put a proposal beside the current architecture had one pane and reused it —
which meant overwriting the board the human was reading. Now:

```bash
./bin/canvas pane open --board payments@option-a   # split, and put it in the NEW pane
./bin/canvas pane close right                      # one pane again; the board is untouched
./bin/canvas screenshot --pane right               # picture the half you drew in
./bin/canvas viewport --fit --pane right           # and frame it
```

`pane open` cannot be aimed at an existing pane, so it cannot overwrite one:
that is what makes it the safe command for "show me the current one next to the
proposal". Two panes is what the shell lays out, so a third is refused. All of
these need a browser tab and exit 4 without one — a pane exists only while
something is rendering it, and nothing here invents one on a headless canvas.

**`mermaid` converts in the pane holding the board it names, and takes no
`--pane`** (TASK-046). Conversion runs in a canvas and the elements land on
whatever board that canvas is holding, so the board the call already carries
settles which pane; a `--pane` would be a second way to say the same thing, and
a way to say two different things. It used to convert only in the primary pane,
so drawing a proposal on the right meant taking the current architecture off the
left first. Aimed at a board no pane is holding it converts nothing and says
which panes are up, what each holds, and how to get that board onto one.

`screenshot` and `viewport` keep `--pane` and take no board, because a picture
is of a half of the screen and nothing names a board for it to be resolved
from.

Addressing: `current` is the privileged variant — the architecture that exists —
so it owns the bare name and the bare filename. Every other variant is
`name@variant`, stored as `name@variant.excalidraw.md`. Variant is an open set,
so a three-way option comparison is just `payments@option-a`, `@option-b`,
`@option-c` next to `payments`. A name may contain `/` to nest the note in vault
folders.

Board names are case-insensitive and unicode-normalised, and the note keeps
the casing a human typed (ADR 0010). `Payments` and `payments` are one board on
every platform, because boards get named out loud and a human cannot pronounce
casing. The address is the lower-case form; `board new Payments` still writes
`Payments.excalidraw.md` and `board: Payments` in the frontmatter, and a note
that already exists is found whatever casing it carries. A vault that already
holds two notes at one address has only one of them reachable, and `board list`
says so. Variants are slugs, so they are lowercased outright.

Branching is `board save --as <name>@<variant>`, and it restamps every node on
the copy with the variant it was saved as. Without that the copy would still
record the variant each node was promoted under, and `compare` would report
every node changed on the one workflow that is meant to leave them alone
(TASK-035). A node that records a foreign variant on a board nobody branched
really was copied in, and `compare` still says so. The `level` comes across
too, on `--as` as well as `--variant`: a branch is the same subject at the same
abstraction tier, and level is board identity from a vocabulary the project
grew on purpose (TASK-039).

`promote` says the same thing from the other side. A node promoted on
`payments@option-a` records `option-a`, read from the board the call already
names, so `--variant` is an override nobody has to remember. It used to stamp
the literal `current` wherever it was called, which made every node on a
proposal board a `variantAnomaly` (TASK-040).

A branch shares no element objects with the board it came from. It used to
share every one the restamp did not replace, so two boards held one set of
objects behind two names, and the only thing keeping that from being a bug was
that every write path replaces an element rather than editing one. That
invariant was never written down and nothing enforced it, so the copy is deep
now and a check mutates a branched element in place to prove it (TASK-042).

**A branch moves nothing on screen** (ADR 0012). You branched in order to
compare, so the panes holding the source keep holding it and the branch is put
up with `board open` like any other board. `board open` and `board new` are the
commands that choose what is showing; a save writes a file. The one exception
is naming the scratch board — `board save --board scratch --as <name>` — where
the placeholder and its new name hold the same drawing and there is nothing to
stay behind for, so the pane comes with it. Either way the answer names the
panes: `panes.moved` for the ones it repointed, `panes.kept` for the ones
deliberately left on the source, and `saveKind` for which of the three acts it
was.

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
| Overwrite | `board save --board <name> --force` | whatever the note holds |
| Save elsewhere | `board save --board <name> --as <other>` | nothing; both copies kept |

The same refusal covers a destination archboard has never read — a `board new`
whose file appeared underneath it, or a `--as` onto an existing note.

Nothing is locked, and the check reads the file rather than another app's
memory, so a board open in Obsidian can still write its unsaved copy back
afterwards: **keep a board open in one editor at a time.**

The board key reaches the store, the REST API (`?board=` on every element
route) and the WebSocket protocol (every broadcast names its board, and
`board_switched` goes to the one pane it was addressed to). A caller that says
nothing about boards is refused.

The canvas boots holding a `scratch` board, so a first run has something in
front of it — a board like any other, named like any other
(`--board scratch`), with no home in the vault until
`board save --board scratch --as <name>` gives it one. A pane that is opened
with nothing else on screen shows scratch; a second pane shows whatever the
first is showing, until it is pointed somewhere else.

## Bindings name a repository, not a directory

A binding is a logical address: a repository identity, a path inside it, and the
branch and commit it was confirmed at. It is never a directory on this laptop,
because the vault spans repositories (ADR 0004).

**Nothing resolves against an ambient working directory any more** (ADR 0011).
`resolveBinding` takes an explicit origin and has no default, and every answer
says which of four ways it used:

| Give it | `resolvedFrom` | What you get |
|---|---|---|
| an absolute path | `path` | the repo git says that file is in |
| `--repo <identity> --path <inside it>` | `registry` | the registered checkout, from anywhere |
| a relative path, on the CLI | `cwd` | resolved, and told which directory and which repo that was |
| a repo nothing here has | `declared` | the address recorded, no link, and how to register it |

Over MCP a bare relative path is **refused**. That server is spawned by the
client, so its cwd is whichever directory the client happened to be in, and a
shell-less client cannot set or see it. That surface is the proof, not the edge
case.

Where each repository is on this machine is the checkout registry, one JSON file
in the state directory:

```bash
./bin/canvas repo add ~/src/payments     # identity comes from git origin, not from you
./bin/canvas repo list --text
./bin/canvas repo forget github.com/acme/payments
```

It also fills itself: every binding that resolves through a real path records
where that repo was found. `ARCHBOARD_REPOS` overrides the file, which is how
the tests keep off the real one.

This is what makes a **system board covering five repositories** buildable in
one session, with no `cd` between promotions:

```bash
./bin/canvas promote --board systems --ids abc --kind service \
  --repo github.com/acme/payments --path src/service.ts
```

## Which boards describe this repo

Bindings answer it in reverse, so an agent that has just opened a strange
repository can find its architecture with nothing written down anywhere:

```bash
./bin/canvas board list --here --text                   # the repo you are in
./bin/canvas board list --repo github.com/acme/payments --text
```

```
Boards describing github.com/acme/payments:
  systems (current, system, vault)
    Payments [service] -> src/service.ts
Open one with `board open systems`.
```

It reads the bindings, not the names, so the five-repo system board is found
from any of the five even though it is named after none of them. A board open
on the canvas is read from memory, so a binding made a minute ago and not yet
saved still counts. `--here` resolves the working directory in the CLI process
and prints the identity it found. The server is only ever given an identity,
never a path. Over MCP, `list_boards` takes the same `repo` argument.

## Artifacts

```bash
mkdir -p diagrams
./bin/canvas export --out diagrams/arch.excalidraw
./bin/canvas import diagrams/arch.excalidraw   # merges by default
./bin/canvas snapshot save before-split
```

Commit diagrams alongside the code change so architecture decisions are
reviewable in the diff.

A snapshot shares no element objects with the board it was taken from. It used
to hold the board's own objects, so editing the board in place would have
edited the snapshot taken to protect against that. Nothing failed, for the same
unwritten reason a branch got away with it: every write path replaces an element
rather than editing one. Both copies are deep now, through `copyElements` in
`src/core/board-store.ts`, and a check mutates a snapshotted element in place to
prove it (TASK-042, TASK-048).

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
