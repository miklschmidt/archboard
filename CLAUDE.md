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

## Run it (there is no build step)

bun runs TypeScript, so the server and the CLI are started from `src/` and
there is nothing to compile (ADR 0014). Only the frontend is built, because a
browser cannot be handed TypeScript, and that is vite's job.

This box has node + bun but **no npm/npx**. The `package.json` scripts shell out
to bun, so run them with `bun run`, never `npm run`:

```bash
bun install
bun run build       # frontend only -> dist/frontend/
bun run type-check
bun run test        # type-check, CI coverage, module scope, then stdio wire,
                    # loopback bind, obsidian, changes, one write per intent,
                    # geometry, text metrics, labels, library, boards + panes,
                    # branch vs redraw, proposal beside source, skill install,
                    # repo bindings, CLI/MCP surface parity, staleness, hot
                    # reload, and a board rendered in a real browser

./bin/canvas start  # canvas server on 127.0.0.1:3000
./bin/canvas status
./bin/canvas stop
```

`bun install` intermittently fails extracting a tarball; just run it again.

`bin/canvas` runs `src/bin.ts` with bun and resolves from any cwd. Use it, never
`npx`. Anything that spawns archboard — an MCP client, a shell alias — needs bun
on PATH.

**Editing source changes behaviour on the next command, but not in a server
that is already running.** A process reads its source at start, so a change to
anything the *server* executes needs a restart or a reload. The CLI, which is a
fresh process every time, already has it.

**Ask, rather than guess which of the three copies you are looking at**
(TASK-056). `./bin/canvas status` compares when the canvas read its source
against the files it actually loaded, and when it is behind it names the file,
the two times and the remedy: `bun run reload` where a reload is armed,
`archboard stop && archboard start` where it is not. It says nothing at all
when the two agree. The tab is the third copy and goes stale on its own
schedule, when somebody rebuilds `dist/frontend` under it; it now hears about
that at its next interaction, in the reply to the pane report it already
sends, instead of finding out ten seconds later through a command timing out
on it.

**The canvas can reload in place, and it keeps everything on screen. You ask
for the reload; saving a file does not cause one.**

```bash
bun run dev:canvas    # the canvas, reloadable
bun run dev           # that plus vite on :5173, for frontend work
bun run reload   # and this is what reloads it
```

`bun --hot` re-evaluates modules inside the running process, which is a
different thing from `bun --watch` restarting it. The port stays bound, the
browser tabs keep their WebSockets, the boards keep their unsaved elements, the
panes keep their registrations, and the change feed keeps its id and cursor.

The trigger is a command because `bun --hot` re-evaluates the **whole module
graph** on any file change, not the file you edited, and it does that inside a
process holding work that exists nowhere else. `bun run dev:canvas` runs
`src/dev-canvas.ts`, a tiny entry that bun watches; it re-imports the canvas
only when `bun run reload` moves a reload token. So an ordinary save runs
ten statements and stops. A canvas started any other way refuses a reload with
a 409 and says how to get one; `/health` reports `reloadable`.

**State that must survive a reload lives in `kept()`** (`src/core/hot.ts`), not
in module scope, which is rebuilt. Two mechanisms enforce that rather than
asking you to remember it (TASK-059, ADR 0014):

- `bun run test:module-scope` parses the canvas's import graph and fails on
  module-scope state: a `new` that is not a frozen lookup table, a literal
  something writes to, a timer, a listener added without a paired removal, a
  bind, or a write to long-lived state with no presence guard. Waive a false
  positive with `// hot-safe: <reason>`. Both TASK-057 bugs are fixtures under
  `scripts/fixtures/module-scope/`, so the check proves itself on every run.
- Every reload in dev mode runs a canary (`src/core/reload-canary.ts`) that
  compares board element counts, pane registrations, the socket count and the
  feed's id and cursor across the reload, and shouts to the terminal **and**
  every open tab if anything moved. `bun run test:hot` breaks a reload on
  purpose to prove it fires.

**`canvas start` watches nothing and cannot reload**, deliberately. Restarting
drops every unsaved board, so save first, or ask.

`bun run type-check` is the only thing that type-checks now, and `bun run test`
runs it first, so a type error still fails the suite.

**One check drives a real browser, and running the suite needs one.**
`bun run test:browser` (`scripts/check-fixed-point.mjs`, TASK-071) writes a
board, renders it in headless Chrome through `agent-browser`, reads back what
the pane is holding, and reports every element and field Excalidraw changed.
Everything else in `scripts/` stands a WebSocket in for a pane, which cannot
catch a renderer disagreeing with us. It rebuilds `dist/frontend` first,
because that is half of what it measures, and it takes about eleven seconds.
**It reports zero, and zero is asserted** (TASK-072): what archboard writes is
a document Excalidraw does not change. Without `agent-browser` on PATH it exits
2 — "I could not run" — rather than claiming a pass, so `bun run test` needs it.

**A push runs the whole chain** (TASK-082). `.github/workflows/ci.yml` runs
`bun run test` and nothing else, so a check added to `package.json` runs on
main without anybody touching the workflow. It used to name two scripts of its
own while the suite grew to seventeen around it, which is why
`bun run test:suites` fails when a `test:*` script is in neither the chain nor
the skip list in `scripts/check-ci-suites.mjs`. **That list is empty.** The
chain takes 58 seconds on a 13th-gen i7 plus the browser check, and `test:mcp`,
`test:boards` and `test:side-by-side` are two thirds of the rest.

Open <http://127.0.0.1:3000>. A browser tab is required for `screenshot`,
`mermaid`, image export, and viewport control; pure JSON ops work headless.

## Skills (after a fresh clone)

`.agents/skills/` and `.claude/skills/` are **derived and untracked**, so a
clone has no skills until you restore them:

```bash
skills experimental_install     # 28 third-party skills, from skills-lock.json
bun scripts/sync-skills.mjs     # ours, from skills/
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

**One thing somebody asked for is one write.** Aligning twenty boxes, or
distributing, locking, grouping or ungrouping them, or applying a patch of
creates, updates and deletes, reaches the canvas as a single change report
(TASK-068). So does promoting a node, demoting one, and deleting several ids at
once, on the CLI and over MCP alike (TASK-083). Promotion is where it bites
hardest: a node is not one element, and the shipped PostgreSQL stencil is seven
lines, so declaring it a datastore used to cost seven writes for one sentence
somebody said out loud. Every one of those used to be one HTTP write per
element. That is
wasteful today and it is lost updates once the note is the only copy of the
board, because each write becomes a read-modify-write cycle against one file
(ADR 0015), and it is twenty separate acquisitions of the board's lock with
nineteen gaps for another writer between them (ADR 0016).

The report says who is writing. No `origin` means the browser, which is what
this route was built for: its elements are stamped `frontend_sync` and the
change feed is told a human moved them. `origin: "agent"` gets neither, because
an agent's own drawing narrated back into its own thread is the noise ADR 0005
is about. An agent's batched write is otherwise the same write a single-element
`PUT` performs, arrow re-routing and label re-placing included, and that
settling happens once at the end of the intent rather than once per element.
`bun run test:one-write` counts writes on the wire through a proxy, so a loop
cannot pass itself off as a batch.

**There is one converter, it runs on the way in, and nothing converts on the
way out** (ADR 0015, TASK-072). An agent writes `label: {text}` on a shape;
Excalidraw has no such field, and a label there is a separate text element with
a measured width and a computed position. `src/core/expand-elements.ts` turns
one into the other, at the write boundary, and the board holds the result. So a
labelled box is **two elements** — itself and its label — from the moment it is
written, `batch_create` of four labelled shapes answers with eight, and a
headless board no longer carries labels that only become elements when somebody
happens to open a browser.

There used to be a second converter: the pane ran Excalidraw's own
`convertToExcalidrawElements` on every delivery, and then six passes of ours
put right what it had done. Given one board of nine elements the two produced
documents differing on fourteen fields. That is gone, along with
`restoreBindings`, `planLabelExpansion`, `adoptReusedLabelIds`,
`dropSpentLabelSeeds`, `recenterBoundShapeTextElements` and
`rescueStrayBoundTextElements`.

**The seed is read once and not kept** (TASK-073). `label: {text}` is how an
agent asks for a label and it is the only way; what the board holds afterwards
is the text element it asked for. It used to hold both, which meant a rule for
which spelling won, and TASK-024, TASK-028 and TASK-029 were each that rule
being wrong in a new way. So a person retyping a label edits a text element and
the text element **is** the label: there is no stored copy of the old words for
a later write to put back, and `labelStatements` and `labelClearances`, which
existed to keep the copy in step, are gone. Nothing an agent does changes —
`describe` still folds a container and its bound text into one line.

**A text element's width is measured, not estimated.** Excalidraw's width for a
piece of text is exactly what the browser's `measureText` returns, so
`src/core/measure-text.ts` reproduces it from the woff2 subsets already inside
`@excalidraw/excalidraw` — advance widths, GPOS kerning, GSUB ligatures, face
selection by `unicode-range`, no shaping across a space. It agrees with Chrome
to within 0.0012 px across 130,000 measurements. The old estimate of
0.6 x fontSize per character made `AuthService` 76.7 px too wide and every
label three times too tall. Height is not measured by anybody: Excalidraw's is
`fontSize * lineHeight * lineCount`, with `lineHeight` a per-family constant.
See `docs/design/measuring-text-outside-a-browser.md`.

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
A promoted element is part of its node whatever it is drawn from. `line` and
`arrow` used to be read as connectors before anything looked at the metadata,
so a datastore promoted from the shipped PostgreSQL stencil, which is seven
lines and nothing else, was reported as promoted and then left out of
`describe` and `compare` entirely. Promotion is the explicit act and it now
outranks the element type: a connector carrying a node id is part of that node,
and one carrying none is still a connector. Nothing is refused at promotion
time, because stencils are made of arrows as well as lines and a type test
would put promotion at the mercy of the tool an artist reached for. The one
case where promoting costs something, an arrow bound between two other nodes,
is a `compare` warning rather than a silent loss (TASK-053).
A group is on the board, in `groupIds` on the elements, and nowhere else. The
MCP process used to keep its own map of which elements were in which group, so
two MCP clients disagreed, a group died with the client that made it, and
ungrouping used a remembered member list that was wrong about anyone who had
joined the group since. Grouping over the CLI never had any of that, because it
only ever wrote to the elements (TASK-064).
Every id archboard mints is minted once, in `src/core/ids.ts`, as one to eight
characters of Obsidian's block-id alphabet — the one shape nothing downstream
has a reason to rename (TASK-069). A text element's block id *is* its element
id, and a block reference cannot hold more than eight characters, so a longer
one had to be renamed on the way into a note. Renaming is the most dangerous
thing in the system. Measured: with a text editor open on a bound label,
applying a document in which that element had been renamed left the textarea on
screen and focused while the scene no longer held the id it was bound to. Five
characters were typed and Escape pressed, and the five went nowhere, with no
error and nothing on screen to say so. Ids used to be 18 or 19 characters, and a
bound text expanded from a `label` seed was named `${container}-label` on the
server and a 21-character nanoid in the browser, so the note writer renamed
nearly everything it wrote. Now it has nothing to rename on a board this server
wrote, and the two expansions reach one name because both derive it from the
container. The derivation itself has not changed, so a board already in the
vault keeps the ids it has: the four renames measured in
`docs/design/server-is-the-truth.md` are pinned as golden values in
`check-obsidian-md`. What Excalidraw itself mints is still 21 characters and
still renamed at the note boundary, and nothing can rename it safely while a
browser holds it, so stage 8 of `docs/design/the-plan.md` owns that question.

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

**A canvas with no vault refuses to start** (ADR 0015). Every board is a note,
so there is nowhere to put one, and a canvas somebody can draw on before
discovering the drawing was never anywhere is the worse failure. The vault
spans repositories, so there is deliberately no default and nothing to guess
from; `install-skill` is the step that chooses one, and the refusal points at
it. Set it before the server starts:

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
up as a separate act. `pane open --board <key>@v` is that act while there is
room, because it makes a pane and cannot be aimed at an existing one, so the
source cannot be lost; `board open` is for a full screen, where showing the
branch means taking some board off, and the save's answer says which board each
pane would lose (TASK-054). `board open` and `board new` are the commands that
choose what is showing; a save writes a file. The one exception
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

**A write that is allowed goes through a rename, so a reader sees the old note
or the new one and never a partial** (TASK-061, `src/core/atomic-write.ts`).
The bytes go to a hidden sibling temp file, get flushed to disk, and then one
rename swaps the directory entry — which also leaves anyone who already had the
note open holding the whole old note rather than a truncated one. Every writer
of a vault note uses it, and so does the checkout registry, because a second
atomic-write idiom is how the first one goes stale. **The fsync is over half
the cost of a write** — 5.15 to 5.25 ms of the 6.21 ms cycle
`docs/design/server-is-the-truth.md` measured at 55 elements, flat in the size
of the board — and it is what stops a crash leaving the new name pointing at a
short file. It was accepted when ADR 0015 was; do not optimise it away without
reopening that.

The board key reaches the store, the REST API (`?board=` on every element
route) and the WebSocket protocol (every broadcast names its board, and
`board_switched` goes to the one pane it was addressed to). A caller that says
nothing about boards is refused.

**A picture on a board belongs to that board** (TASK-060). An image element
carries a `fileId` and the scene's `files` map is keyed by it, which is the only
thing in the format that says which images are whose — so a board's images are
the ones its own elements draw, and they live on the board and go into its note.
`/api/files` is board-scoped like every other content route. It used to be one
map per process, keyed by file id and shared by every open board, so saving one
board wrote every other open board's pictures into its note, and reopening a
board dropped the picture data and kept the hole.

The canvas boots holding a `scratch` board, so a first run has something in
front of it — a board like any other, named like any other
(`--board scratch`). A pane that is opened with nothing else on screen shows
scratch; a second pane shows whatever the first is showing, until it is
pointed somewhere else.

Scratch has a note like every other board (TASK-077, ADR 0015), at
`<vault>/.archboard/scratch.excalidraw.md` — the vault's hidden directory,
where the stencil library already lives, so Obsidian's note list stays notes
and `board list` walks past it. The canvas picks that note up when it starts,
so a sketch outlives the process that drew it. What scratch has not got is a
name anybody chose, and `board save --board scratch --as <name>` is what gives
it one: still the one save that takes the pane with it, because the placeholder
and its new name hold the same drawing.

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
