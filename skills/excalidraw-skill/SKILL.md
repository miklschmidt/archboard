---
name: excalidraw-skill
description: Architecture canvas for comparing a system as it is against a proposed change, drawn as Excalidraw boards a human and an agent edit together on a live canvas. Use when an agent needs to (1) draw a system's current architecture on a named board, (2) branch it into a proposal variant and diff the two, (3) read back what a human rearranged and treat the rearrangement as design intent, (4) place stencils from the shared shape library, (5) promote shapes into architecture nodes bound to code, or (6) draw and refine any diagram: element CRUD, alignment, grouping, Mermaid conversion, PNG/SVG and .excalidraw export, snapshots. Primary interface is the bundled CLI (archboard <command>), which auto-starts the canvas server; MCP tools cover the same canvas for clients with no shell, and a REST API for application code.
---

# archboard

archboard is a canvas for **comparing architectures**. The architecture that
exists is one board. A proposal is a second board, a *variant* of the first.
The two sit side by side in two panes on one screen, a human rearranges either
of them by hand, and `compare` diffs them. Drawing is the means. The comparison
is the point.

Three things decide whether the work comes out usable, and each of them is
expensive to fix afterwards. Read them before the first command.

1. **Name the board on every call.** `--board <key>` is required on everything
   that touches board content. There is no default and no active board, because
   two panes hold two boards and "the board" would be a guess (ADR 0009). A
   call that names none is refused, and the refusal lists what is open.
2. **A variant starts as a copy of its source.** Branch the source board, then
   change only what the proposal changes. A proposal redrawn from a blank
   canvas cannot be diffed against anything, for reasons under
   [Variants and comparison](#workflow-variants-and-comparison).
3. **Look in the library before drawing a rectangle.** 111 curated stencils sit
   on the canvas server. `library list --text` costs one call and is the
   difference between a diagram of grey boxes and one somebody can read across
   a room.

## The main path: current beside a proposal

Putting the two side by side is one command: **`pane open --board <key>` makes
a new pane and opens that board into it.** It cannot be aimed at an existing
pane, so it can never overwrite the board somebody is reading — which is what
makes it the safe way to say "show me the current one beside the proposal". Two
panes is the most the canvas lays out, and a pane exists only while a browser
tab renders it, so this exits 4 when nothing is open.

```bash
archboard panes --text                            # which pane is which, and what each holds
archboard board list                              # what the vault has, what is open

# 1. the architecture that exists
archboard board new payments --level service      # one pane on screen, so it goes there
archboard library list --text                     # before drawing anything
archboard add --board payments elements.json
archboard promote --board payments --ids gw --kind gateway --name "API Gateway"
archboard board save --board payments

# 2. branch it: this is what makes the proposal comparable
archboard board save --board payments --variant option-a   # writes payments@option-a; nothing moves
archboard pane open --board payments@option-a              # the branch, in a NEW pane beside it

# 3. change only what the proposal changes
archboard add --board payments@option-a cache.json
archboard promote --board payments@option-a --ids cache --kind datastore
archboard board save --board payments@option-a

# 4. look at what you drew, then read the difference
archboard screenshot --pane right --out /tmp/proposal.png
archboard compare payments payments@option-a
```

**Step 2 moves nothing on screen** (ADR 0012). A save writes a file; `board
open` and `pane open` are what choose what is showing. So the pane holding
`payments` keeps holding it, the branch is not on screen anywhere until you put
it there, and there is no repair step. The save says so: `saveKind` is
`branch`, `panes.kept` names the panes left on the source, `panes.moved` is
empty. The one save that does move a pane is giving the scratch board a name
(`board save --board scratch --as payments`), where the placeholder and the
named board hold the same drawing and there is nothing to stay behind for.

`--pane` names a place that exists, so it is `left` and `right` only once there
are two panes; with one pane its place is "the only pane" and every board
command can leave `--pane` out.

## Boards, panes, and what a command targets

**A board is what a command writes to. A pane is where a board is on screen.**
The two are addressed separately and only one of them is strict.

- `add`, `update`, `delete`, `promote`, `clear`, `describe`, `query`, `export`,
  `board save` and the rest of the content surface target a **board**, named
  with `--board`. None of them takes a pane, and none of them cares whether the
  board is on screen at all. Writing to a board no pane holds works, silently
  and correctly.
- `board open` and `board new` put a board into a pane that already exists.
  `--pane` takes `left`, `right`, `top`, `bottom`, a position (`1`, `2`),
  `focused`, `primary`, or a pane id. One pane on screen and the board goes
  there; two and `--pane` is required; none and the board is loaded without
  being shown. Every answer names the pane it landed in.
- `pane open [--board <key>]` makes a pane. It always makes a **new** one and
  cannot be aimed at an existing pane, so it cannot overwrite what is on
  screen. With no `--board` the new pane shows whatever was already there, the
  same as a human pressing Split. A third pane is refused.
- `pane close <spec>` unmakes one, and the spec is always required — which
  board comes off the screen is not something to guess at. The board itself is
  untouched and stays open on the canvas. The last pane cannot be closed.
- `screenshot` and `viewport` take `--pane <spec>`, because a pane holds one
  board and that settles which is meant. Leave it out and the pane that answers
  for the browser is photographed or moved, which with two on screen is the one
  you may not have drawn in. **Name the pane once two are open.**
- `pane open`, `pane close`, `screenshot` and `viewport` all need a browser tab
  and exit 4 without one. Nothing here invents a pane on a headless canvas.

`mermaid` is the other way round: it names a board and takes no `--pane`.
Conversion runs in the pane holding that board, and there is at most one, so a
diagram appears beside the current architecture rather than on top of it. It is
refused, converting nothing, only when no pane holds that board at all, and the
refusal names the panes on screen and the command that puts the board on one.

Two panes disagreeing is the normal state, not a problem to resolve. Run
`panes --text` at the start of a turn to see who is holding what.

## Interfaces

Three interfaces drive the same live canvas. The CLI is the default; the other two serve callers that cannot run it.

1. **CLI** — use it whenever you can run a shell. Capabilities land here first, so it is the fullest surface.
   ```bash
   ./bin/canvas <command>   # inside the archboard checkout — runs the CLI from source
   archboard <command>      # anywhere else, if the bin is on your PATH
   ```
   No setup needed — any canvas-touching command **auto-starts the canvas server** on `http://127.0.0.1:3000`. The package is private and never published, so there is nothing to install from npm: run it from a checkout, which needs bun on PATH. Inside the checkout, `bin/canvas` resolves from any cwd and always runs the current source, so prefer it there. Examples below say `archboard`; substitute `./bin/canvas` when you are in the repo.
2. **MCP tools** — the way in for a client with no shell. Same canvas, renamed: `batch_create_elements` for `add`, `describe_scene` for `describe`, and so on (full table in `references/cheatsheet.md`). Their display prefix depends on the key the MCP client's config gives this server, so match on the tool names, not the prefix. One thing they do that the CLI cannot: `get_canvas_screenshot` returns the image as content in your context, where `screenshot` writes a PNG you then read back.
3. **REST API** (last resort, e.g. from application code): HTTP endpoints on `http://127.0.0.1:3000` — see `references/cheatsheet.md` for payloads. The server must already be running.

The canvas URL comes from `EXPRESS_SERVER_URL` (default `http://127.0.0.1:3000`). Remind the user to open that URL in a browser — screenshots, image export, mermaid conversion, viewport control, and making or closing a pane all need an open tab (CLI exits with code 4 when it's missing).

### CLI Quick Reference

Results are JSON on stdout — except `describe` (plain text) and raw-content output when `--out` is omitted (`export` scene JSON, `screenshot --format svg`). Diagnostics on stderr. Exit codes: 0 ok, 1 error, 2 usage, 3 canvas unreachable, 4 browser tab required, 5 board write refused.

`--board <key>` is left out of the table for width and is still required on every row that touches board content.

| Task | Command |
|------|---------|
| Start / stop / inspect server | `start`, `stop`, `status` |
| Create elements (batch) | `add elements.json` or `echo '[...]' \| add` or `add --one '{...}'` |
| Multi-op patch in one call | `apply patch.json` — `{"create":[...],"update":[{"id":"a","set":{...}}],"delete":[...]}` |
| Read one / query many | `get <id>`, `query [--type t] [--bbox x0,y0,x1,y1] [--filter k=v] [--filter-json '{...}']` |
| Update / delete | `update <id> --set '{...}'`, `delete <id> [...]` |
| Understand the scene | `describe` (plain-text summary: ids, positions, labels, connections) |
| What the human has picked | `selection [--text]` — the elements they mean by "this" / "these" |
| What the human is looking at | `panes [--text]` — pane by pane: where it sits, which board, what is in view, what is picked there |
| Put a board beside the one on screen | `pane open [--board <key>]` — always a **new** pane, never an existing one, so it cannot overwrite what somebody is reading |
| Take a board off the screen | `pane close <left\|right\|1\|2\|primary\|focused\|pane id>` — spec always required; the board is untouched |
| Point a pane's camera | `viewport --fit \| --ids a,b,c \| --element <id> \| --zoom n [--offset-x n] [--offset-y n] [--zoom-factor f] [--pane <spec>]` — exactly one of the four |
| Make the selection a node | `promote --kind service [--path src/x.ts] [--name "X"]` — kind, identity and binding in one act; `demote` undoes it |
| See the scene | `screenshot [--out f.png] [--pane <spec>]` (PNG without `--out` → temp file path in JSON; SVG without `--out` → raw SVG) |
| Layout operations | `arrange align\|distribute\|group\|ungroup\|lock\|unlock\|duplicate --ids a,b,c [--to left\|horizontal\|...]` |
| Scene files | `export [--out scene.excalidraw]`, `import [scene.excalidraw|-] [--replace]` — a `.excalidraw.md` out path writes Obsidian's format (see File I/O) |
| Mermaid → canvas | `mermaid [diagram.mmd|-]` (or stdin) |
| Ready-made shapes | `library list [--text]`, `library insert <name> --x <x> --y <y> [--source <lib>]` — see Stencils |
| Boards (named, persisted) | `board list\|info\|new <name>\|open <name[@variant]>\|save` — see Boards |
| Branch a board into a variant | `board save --board <src> --variant <v>` — the copy the proposal is drawn on; it moves no pane, so put it up with `pane open --board <src>@<v>` |
| Diff two variants | `compare <from> [to]` — semantic diff keyed on node identity; see Variants and comparison |
| What changed since last turn | `changes [--since <cursor>] [--coalesce] [--text]` — the human's edits, named as architecture |
| Snapshots | `snapshot save\|list\|restore <name>` |
| Share link | `share` (encrypted upload → excalidraw.com URL) |
| Wipe canvas | `clear --yes` |
| Install / upgrade this skill | `install-skill --dir <skills-root>` (agent chooses project/global root) |

### Element Format (CLI and MCP)

The CLI and MCP tools accept the same agent-friendly format and normalize it automatically:

- **Labels**: put `"text": "My Label"` on any shape — converted to Excalidraw's bound-label format for you.
- **Arrow binding**: `"startElementId": "a"` / `"endElementId": "b"` — arrows auto-route to element edges.
- **fontFamily**: pass a string name (`"helvetica"`, `"cascadia"`, `"excalifont"`, ...) or string number `"1"`–`"8"`.
- **points**: both `[[x,y], ...]` tuples and `[{"x":..,"y":..}]` objects are accepted.
- **Patch updates**: in `apply`, update entries can use either direct fields (`{"id":"a","x":120}`) or a `set` object (`{"id":"a","set":{"x":120}}`). Do not mix both forms in one update entry.

**Raw REST is stricter**: labels must be `"label": {"text": "..."}`, bindings must be `"start": {"id": "..."}` / `"end": {"id": "..."}`. Only worry about this when POSTing to the API directly.

---

## Coordinate System

The canvas uses a 2D coordinate grid: **(0, 0) is the origin**, **x increases rightward**, **y increases downward**. Plan your layout before writing any JSON.

**General spacing guidelines:**
- Vertical spacing between tiers: 80–120px (enough that arrows don't crowd labels)
- Horizontal spacing between siblings: 40–60px minimum; give labeled arrows 120px+
- Shape width: `max(160, labelCharCount * 12)` to keep the label on one line
- Shape height: 60px single-line, 80px two-line labels
- Background/zone padding: 50px on all sides around contained elements

**Styling for a professional look:**
- `"fillStyle": "solid"` on shapes gives crisp flat fills — the default is a sketchy hachure pattern
- Pair pastel `backgroundColor` fills with their darker `strokeColor` (palette in the cheatsheet)
- `"strokeStyle": "dashed"` on zone borders and async arrows reads as "boundary / background"

**Shapes come filled, and that is load-bearing.** A rectangle, ellipse or diamond you create without a `backgroundColor` gets a neutral white fill and `fillStyle: solid`, because a shape with a transparent background is only selectable on its ~2px stroke — a human cannot tap it in the middle to pick it. State a colour to override, or `"backgroundColor": "transparent"` to opt out deliberately (a see-through zone that must not hide what it overlaps). Note that a fill hides anything beneath it, so draw background zones before the shapes that sit inside them.

---

## Layout Anti-Patterns (Critical for Complex Diagrams)

These are the most common mistakes that produce unreadable diagrams. Avoid all of them.

### 1. Do NOT use `label.text` (or `text`) on large background zone rectangles

When you put a label on a background rectangle, Excalidraw creates a bound text element centered in the middle of that shape — right where your service boxes will be placed. The text overlaps everything inside the zone and cannot be repositioned.

**Wrong:**
```json
{"id": "vpc-zone", "type": "rectangle", "x": 50, "y": 50, "width": 800, "height": 400, "text": "VPC (10.0.0.0/16)"}
```

**Right — use a free-standing text element anchored at the top of the zone:**
```json
{"id": "vpc-zone", "type": "rectangle", "x": 50, "y": 50, "width": 800, "height": 400, "backgroundColor": "#e3f2fd"},
{"id": "vpc-label", "type": "text", "x": 70, "y": 60, "width": 300, "height": 30, "text": "VPC (10.0.0.0/16)", "fontSize": 18}
```

The free-standing text element sits at the top corner of the zone and doesn't interfere with elements placed inside.

### 2. Avoid cross-zone arrows in complex diagrams

An arrow from an element in one layout zone to an element in a distant zone will draw a long diagonal line crossing through everything in between. In a multi-zone infra diagram this produces an unreadable tangle of spaghetti.

**Design rule:** Keep arrows within the same zone or tier. To show cross-zone relationships, use annotation text or separate the zones so their edges are adjacent (no elements between them), and route the arrow along the edge.

If you must connect across zones, use an elbowed arrow that travels along the perimeter — never through the middle of another zone.

### 3. Use arrow labels sparingly

Arrow labels are placed at the midpoint of the arrow. On short arrows, they overlap the shapes at both ends. On crowded diagrams, they collide with nearby elements.

- Only add an arrow label when the relationship name is genuinely essential (e.g., protocol, port number, data direction).
- If you're adding a label to every arrow, reconsider — it usually adds visual noise, not clarity.
- Keep arrow labels to ≤ 12 characters. Prefer omitting them entirely on dense diagrams.

---

## Quality: Why It Matters (and How to Check)

Excalidraw diagrams are visual communication. If text is cut off, elements overlap, or arrows cross through unrelated shapes, the diagram becomes confusing and unprofessional — it defeats the whole purpose of drawing it. So after every batch of elements, verify before adding more.

### Quality Checklist

After each `add` / `apply` / `batch_create_elements`, take a screenshot and check:

1. **Text truncation** — Is all label text fully visible? Truncated text means the shape is too small. Increase `width` and/or `height`.
2. **Overlap** — Do any shapes share the same space? Background zones must fully contain children with padding.
3. **Arrow crossing** — Do arrows cut through unrelated elements? If yes, route them around using curved or elbowed arrows (see Arrow Routing below).
4. **Arrow-label overlap** — Arrow labels sit at the midpoint. If they overlap a shape, shorten the label or adjust the arrow path.
5. **Spacing** — At least 40px gap between elements. Cramped layouts are hard to read.
6. **Readability** — Font size ≥ 16 for body text, ≥ 20 for titles.
7. **Zone label placement** — If you used `text`/`label.text` on a background zone rectangle, the zone label will be centered in the middle of the zone, overlapping everything inside. Fix: delete the bound text element and add a free-standing text element at the top of the zone instead (see Layout Anti-Patterns above).

If you find any issue: **stop, fix it, re-screenshot, then continue.** Say "I see [issue], fixing it" rather than glossing over problems. Only proceed once all checks pass.

---

## Workflow: Drawing a New Diagram

### Mermaid vs. Direct Creation — Which to Use?

**Use `mermaid` / `create_from_mermaid`** when: the user already has a Mermaid diagram, or the structure maps cleanly to a flowchart/sequence/ER diagram with standard Mermaid syntax. It's fast and handles conversion automatically, though you get less control over exact layout.

**Create elements directly** when: you need precise layout control, the diagram type doesn't map to Mermaid well (e.g., custom architecture, annotated cloud diagrams), or you want elements positioned in a specific coordinate grid.

### Steps (CLI shown; the MCP tool for each is in the cheatsheet)

1. Plan your coordinate grid — map out tiers and x-positions before writing JSON. (MCP mode: call `read_diagram_guide` for colors/sizing; the same guidance lives in `references/cheatsheet.md`.)
2. `archboard library list --text` — see what already exists before you draw it. A queue, a CDN, a database drum, a browser, a person: the library has all of them, and a stencil reads at a glance where a labelled rectangle does not. Plain rectangles are for services and anything the library has no picture of.
3. Optional fresh start: `archboard clear --board <key> --yes`
4. Create shapes and arrows in one call. Custom `id` fields (e.g. `"id": "auth-svc"`) make later updates easy:
   ```bash
   archboard add --board payments - <<'EOF'
   [
     {"id": "lb", "type": "rectangle", "x": 300, "y": 50, "width": 180, "height": 60, "text": "Load Balancer"},
     {"id": "svc-a", "type": "rectangle", "x": 100, "y": 200, "width": 160, "height": 60, "text": "Web Server 1"},
     {"id": "svc-b", "type": "rectangle", "x": 450, "y": 200, "width": 160, "height": 60, "text": "Web Server 2"},
     {"id": "db", "type": "rectangle", "x": 275, "y": 350, "width": 210, "height": 60, "text": "PostgreSQL"},
     {"type": "arrow", "x": 0, "y": 0, "startElementId": "lb", "endElementId": "svc-a"},
     {"type": "arrow", "x": 0, "y": 0, "startElementId": "lb", "endElementId": "svc-b"},
     {"type": "arrow", "x": 0, "y": 0, "startElementId": "svc-a", "endElementId": "db"},
     {"type": "arrow", "x": 0, "y": 0, "startElementId": "svc-b", "endElementId": "db"}
   ]
   EOF
   ```
   (The `-` positional is optional — with no file argument, `add` reads stdin.)
5. Set shape widths using `max(160, labelLength * 12)`.
6. `screenshot` → view the file → run the Quality Checklist → fix issues before the next batch. With two panes open, say which one you drew in: `screenshot --pane right`. With no browser open at all, `describe --board <key>` is the read.

---

## Arrow Routing — Avoid Overlaps

Straight arrows can cross through elements in complex diagrams. Use curved or elbowed arrows when needed:

**Curved arrows** (smooth arc over obstacles):
```json
{
  "type": "arrow", "x": 100, "y": 100,
  "points": [[0, 0], [50, -40], [200, 0]],
  "roundness": {"type": 2}
}
```
The intermediate waypoint `[50, -40]` lifts the arrow upward. `roundness: {type: 2}` makes it smooth.

**Elbowed arrows** (right-angle / L-shaped routing):
```json
{
  "type": "arrow", "x": 100, "y": 100,
  "points": [[0, 0], [0, -50], [200, -50], [200, 0]],
  "elbowed": true
}
```

**When to use which:**
- Fan-out (one source → many targets): curved arrows with waypoints spread to avoid overlapping
- Cross-lane (connecting to side panels): elbowed arrows that go up, then across, then down
- Long horizontal connections: curved arrows with a slight vertical offset

**Rule:** If an arrow would pass through an unrelated shape, add a waypoint to route around it.

---

## Workflow: Iterative Refinement

Pairing `describe` with `screenshot` is what makes this skill powerful.

- **`describe`** (`describe_scene` in MCP) → structured text: element IDs, types, positions, labels, connections. Use it to know *what's on the canvas* before making programmatic updates (find IDs, understand bounding boxes).
- **`screenshot`** (`get_canvas_screenshot` in MCP) → PNG of the actual rendered canvas. Use it for *visual quality verification* — it shows exactly what the user sees, including truncation, overlap, and arrow routing. The CLI prints the saved file path as JSON; read/view that file.

**Feedback loop:**
```
add elements
  → screenshot → view → "text truncated on auth-svc"
  → update auth-svc --set '{"width": 220}' → screenshot → "overlap between auth-svc and rate-limiter"
  → update rate-limiter --set '{"x": 520}' → screenshot → "all checks pass"
  → proceed
```

## Workflow: Act on What the Human Selected

When someone says "make **these** two a group" or "map **this** to the payments
service", read the selection instead of guessing at ids:

```bash
archboard selection --text
# 2 elements selected: 2 nodes (service(2)) — "AuthService" and "Payments".
#   [id1] "AuthService" | bound src/auth/service.ts | at (100, 100) | ...
```

The browser pushes the selection as it changes, so this is a plain server read —
no browser round-trip and no scene transfer. Without `--text` it prints JSON with
`elementIds` plus each element's label, whether it is a node, its kind and
binding. `get_selection` is the MCP equivalent.

One canvas, one selection: with several tabs open the one that reported last
owns it (`clientId` and `at` say which and when), and closing a tab drops the
selection it left behind.

## Workflow: Resolve "the Left One" — What Is on Screen

`selection` says what the human means by *this*. `panes` says what is in front
of them, which is what "the left one", "that pane", and "move that box over
there" need:

```bash
archboard panes --text
# 2 panes, side by side, showing payments (current, system) and payments@option-a (option-a, system).
# The panes disagree, so commands that name no board are refused until one is named — `--board payments`, or `--board payments@option-a`.
#   1. left · payments (current, system) · 20 elements · view (0,0) 1568x1576 @1.00x · selected: 1 node — "API Gateway" · answers screenshots
#   2. right · payments@option-a (option-a, system) · 30 elements · view (71,72) 1426x1432 @1.10x · selected: 1 node — "Ledger" · focused
```

Per pane: its place in reading order, the board and variant it holds, how many
elements are on it, the part of the board in view (scene coordinates, so it
compares directly with element positions), and what is picked there. `focused`
is the pane the human last touched; `answers screenshots` is the one a
`screenshot` or `viewport` that names no `--pane` lands on, not the only one
they can reach. `get_panes` is the MCP equivalent.

**This is view state, never board contents** — that is what keeps it cheap
enough to read on every turn. Use `describe` for what is on a board.

A pane is reported only while its tab is open, so `pane close`, unsplitting, or
closing a tab removes it with no cleanup, and **no pane at all is normal**: it
means nobody has a browser open, not that anything is wrong. Everything except
`screenshot`, `mermaid`, image export, `viewport` and `pane open` / `pane close`
works headless.

## Workflow: Promotion — Turn the Selection Into a Node

"Map this to the payments service" is a **promotion**: declaring the selected
elements to be a node, giving it a kind and usually a binding in the same act.
It works off the live selection, so no element ids are ever spoken.

```bash
archboard promote --board payments --kind service --path src/payments/service.ts --text
# Promoted 2 elements to the service "Payments API" (node payments-api),
# bound to github.com/acme/api:src/payments/service.ts@main (62f0cef).
```

- **`--kind`** is required, from a controlled vocabulary: `service`, `queue`,
  `datastore`, `gateway`, `external`. Anything else is refused — the vocabulary
  grows deliberately, not per diagram.
- **One call makes one node** out of everything selected: one kind, one name,
  one binding is one node's worth of meaning. Use **`--each`** for "these are
  all queues" — one node per selected shape, named from its own label, kind
  only. A shape and its bound label are one thing either way.
- **`--path`** binds the node to code. Repo identity, branch and commit come
  from git so history can trace a file that later moves; `link` is only set
  when the path really resolves here, so a tap on the board never opens
  nothing. `--repo/--branch/--commit` override the resolution.
- **Node identity** is a slug of the name (`payments-api`), unique on the
  board, stored as `customData.archboard.node`. It survives redraws, drags and
  export/import, and is the join key when two variants are compared — quote it
  rather than the element id. `--node <id>` forces one; re-promoting an
  existing node keeps its id.
- **`--ids a,b,c`** overrides the selection, for elements you just drew.
- **`--variant <v>`** overrides the variant a node records. It defaults to
  the variant of the board named on the call, so promoting on
  `payments@option-a` stamps `option-a` with nothing passed.
- **`--level <tier>`** is not inferred, and should usually be left off. A node
  records a level only to say it sits at a different tier than its board, which
  is what a drill-down board looks like. A node that says nothing is at its
  board's level (ADR 0013).
- **A node is repainted in its kind's colour** — service purple, queue orange,
  datastore cyan, gateway blue, external gray — so a node reads as one at a
  glance and a hollow shape someone drew before this becomes tappable in its
  middle. Only shapes nobody has coloured are touched; a chosen colour stands.
- **`demote`** puts nodes back: touching any element of a node demotes the
  whole node, strips only the `archboard` block, and leaves other tools'
  `customData` alone. The fill stays — taking it away would make the shape
  untappable in its interior again.

`promote_selection` and `demote_selection` are the MCP equivalents.

## Workflow: Refine an Existing Diagram

1. `describe` to understand current state — note element IDs and positions.
2. Identify elements by `id` or label text (not by x/y coordinates — they change).
3. `update <id> --set '{...}'` to resize/recolor/move; `delete <id>` to remove; or bundle everything in one `apply` patch. **Bound arrows re-route automatically when you move or resize their endpoints** — no need to delete and recreate them.
4. `screenshot` to confirm the change looks right.
5. If updates fail: check the ID exists with `get <id>`; unlock with `arrange unlock --ids <id>` if locked.

## Workflow: Stencils

The library is a palette of ready-made shapes — cloud icons, servers, database drums, browsers, people — that a human drags onto a board. It lives on the canvas server, so you can place one by name with no browser open, and 111 of them ship with archboard across seven libraries.

**List it before you draw.** An agent that skips this step draws grey rectangles for things the library already has a picture of, and nobody standing in front of the board can tell a queue from a cache.

```bash
archboard library list --text                                         # what exists (no board: the palette is one per server)
archboard library insert "Load balancer" --board payments --x 200 --y 120 --source system-design
```

The listing is built to be chosen from without rendering anything: name, **size**, element count, source library, id, and in quotes what the stencil says when that is not just its name. Size does real work here — one library's "Docker" is 73x95 and another's is 1224x509.

`--x`/`--y` place the **top-left corner** and the stencil keeps its own size, so read `width`/`height` off the listing and leave room for it.

A name is unique only within the library it came from — four of them ship a "Database" — so an ambiguous name is **refused** with every candidate named. Retry with `--source`, or with `--id` from the listing.

What lands is ordinary elements: move, restyle, label, bind arrows to them, `promote` them. They carry `customData.library` recording where they came from, and nothing else about them is special.

A stencil is several elements, so promote all of them in one call and they become one node. Pass `--name`: a stencil drawn out of lines carries no label to derive a node id from, and promotion refuses rather than guess.

Reach for a stencil when the thing is recognisable furniture — a queue, a CDN, a user. A labelled rectangle is still the right shape for a service box.

`list_library_items` and `insert_library_item` are the MCP equivalents (`itemId` for `--id`).

## Workflow: Mermaid Conversion

```bash
echo 'graph TD
  A[Client] --> B[API]
  B --> C[(DB)]' | archboard mermaid --board payments
```
Requires an open browser tab (conversion runs in the frontend; exit code 4 tells you to open the canvas URL). Conversion happens in the pane holding the board you name, so there is no --pane to pass. If no pane is holding that board the call is refused and nothing is converted. Afterwards `screenshot` to verify layout. If the auto-layout is poor (nodes crowded, edges crossing), find problem elements with `describe` and reposition them with `update`.

## Workflow: Boards

A **board** is a named diagram persisted as one `.excalidraw.md` note in an Obsidian vault. It is the unit of saving, of comparison, and of the `--board` flag. The pane model is at the top of this file; this section is the operating detail.

Boards need a vault: set `ARCHBOARD_VAULT` to its path. There is no default — the vault deliberately spans repositories — and the canvas refuses to start without one, since every board is a note and there would be nowhere to put one. The refusal says how to choose a vault.

```bash
archboard board list                          # the vault, what is open, what is on screen
archboard board new payments --level service  # empty board, in memory until saved
archboard board save --board payments         # write it to <vault>/payments.excalidraw.md
archboard board open payments@option-a        # show it in the pane on screen
archboard board open payments@option-a --pane right   # once two panes are open
archboard pane open --board payments@option-a # or make the second pane and show it there
archboard board info --board payments         # identity and save state of one board
```

`board new` refuses a name the vault already holds; open that board instead, or pick another variant. A board you create exists only in memory until `board save`, and `--level` (`system`, `service`, `module`) says which abstraction tier it sits at.

Opening a board disturbs no other pane: the switch reaches that pane's socket alone, the other pane keeps its board, its scene and its selection, and each board is saved against its own baseline.

**A save writes a file and does not choose what is on screen** (ADR 0012), and it says so: `saveKind` is `same-board`, `named` or `branch`, `savedFrom` names the board it was saved from, and `panes` splits into `moved` and `kept`. A branch keeps every pane on the source, so `moved` is empty. The one save that moves a pane is naming the scratch board, where the placeholder and the named board hold the same drawing.

**Addressing.** `current` is the privileged variant — the architecture that exists — so it owns the bare name (`payments`). Every other variant is a proposal, addressed `name@variant` and stored as `name@variant.excalidraw.md`. Variant is an open set, so comparing three options is just three boards: `payments@option-a`, `payments@option-b`, `payments@option-c`. A name may contain `/` to nest the note in vault folders.

**Identity** — `board`, `variant`, `level` — lives in the note's frontmatter and round-trips. Everything else in the frontmatter is preserved verbatim across a save, so a note's aliases, tags and prose properties survive.

**A save can be refused.** archboard hashes a note when it reads it and verifies that hash before writing, so a note that changed underneath — Obsidian, a sync client, another editor — is never overwritten: nothing is written, `board save` exits 5, and `save_board` comes back as an error. Excalidraw scenes do not merge, so somebody has to choose which copy survives, and it is not you. Report the refusal and offer the three ways out:

| Outcome | Command | What it costs |
|---|---|---|
| Reload | `board open <name> --reload` | the pane as it stands now |
| Overwrite | `board save --board <name> --force` | whatever the note on disk holds |
| Save elsewhere | `board save --board <name> --as <other>` | nothing — both copies are kept |

Never pass `--force` / `force: true` unless the human has said to overwrite.

Nothing is locked, and the check reads the file, not another app's memory: a board open in Obsidian can still write its unsaved copy back afterwards. Keep a board open in one editor at a time.

A pane opened with nothing else on screen holds `scratch`: a board like any other, named like any other (`--board scratch`). Its note is `<vault>/.archboard/scratch.excalidraw.md`, out of the way of the vault's real boards and picked up again when the canvas restarts, so a sketch is not lost by accident. What it has not got is a name somebody chose, and `board save --board scratch --as <name>` gives it one — the one save that takes the pane with it.

## Workflow: Variants and comparison

**A variant is a modification of a source board, not a second drawing of the
same subject.** Asked for a proposal, branch the board that holds the
architecture as it is, then change only what the proposal changes. Everything
the proposal leaves alone must stay byte-for-byte what it was.

```bash
archboard board save --board payments                      # the source, on disk
archboard board save --board payments --variant option-a   # branch: writes payments@option-a
archboard pane open --board payments@option-a              # the proposal, in a new pane beside it
```

Branching writes a second note and changes nothing on screen (ADR 0012), so the
source is still where it was and `pane open` is the whole side-by-side move.
`--variant option-a` and `--as payments@option-a` both branch, and both carry
the source's `level` across.

**Why this is not a style preference.** `compare` joins the two boards on
**node identity**, `customData.archboard.node`, the id `promote` assigns,
because two notes drawn independently have nothing else in common: element ids,
coordinates and creation order all differ. Node identity is a slug of the
node's name, so a proposal drawn from scratch matches its source only where the
labels happen to be identical, word for word. Rename "API Gateway" to "Gateway"
in the redraw and that node comes back as one removed plus one added, along
with every edge touching it. Redraw the whole board and the diff degenerates
into "everything removed, everything added", which says nothing about the
architecture and buries the one change anybody cares about.

Branching makes the ids match by construction. There is nothing to remember and
nothing to keep in sync.

If a variant already exists that was drawn from scratch, do not redraw it
again: re-promote the nodes that should match with `--node <id>` taken from the
other side, and the join comes back.

```bash
archboard compare payments payments@option-a   # what the proposal changes
archboard compare payments                     # finds the other variant itself
```

Nodes that were never promoted have no id and therefore cannot be compared: they come back in a per-side inventory instead, and `summary.comparable` is false when the join found nothing at all. That is the fix to reach for when a diff looks empty but the boards obviously differ: promote both sides. Read `warnings` before narrating anything. It says when one side has no promoted nodes, when the two share no node ids, when node names match across boards whose ids do not, and when an unlabelled container makes a boundary uncomparable.

Neither board is opened and the canvas is not disturbed. A board already open is read from memory, unsaved work included; any other is read straight from its note. Each side says which happened under `source`.

**The output is deliberately complete and unsummarised.** Nodes and edges added, removed, changed (with the before and after of every field) and unchanged, plus the whole layout model. It is data for you to narrate — read it and compose the explanation yourself; do not ask for a shorter version.

**Layout is reported as relative structure, never coordinates**: which nodes sit together (`cluster`), what shape contains them (`container`), what is explicitly grouped (`group`), whereabouts on the board (`region`), the coarse direction between related nodes (`relation`), and size against the board's median node (`prominence`). Every one of those survives the board being panned, zoomed or tidied — which is the point, because a 12px nudge means nothing and a rearranged subsystem means a lot.

Read `layout.cannotExpress` in the result before saying anything about layout. It lists what this model is blind to by design — absolute position, tidiness, edge routing, movement below the thresholds — and those are claims you must not make on its behalf.

## Workflow: File I/O

- Export scene: `export --out diagram.excalidraw` (no `--out` → JSON to stdout)
- Import scene: `import diagram.excalidraw` (append) or `import diagram.excalidraw --replace`
- Image: `screenshot --out diagram.png` / `screenshot --format svg --out diagram.svg` (browser tab required)
- Share link: `share` — encrypts the scene and returns a shareable excalidraw.com URL

This is how diagrams live in a repo: commit the `.excalidraw` file, and re-`import` + edit + `export` it when the architecture changes.

### Obsidian vaults: use `.excalidraw.md`

Check the destination before writing: if any ancestor directory contains `.obsidian/`, it is an Obsidian vault. A raw `.excalidraw` file there opens in the Excalidraw plugin only in **compatibility mode** ("Convert to new format" warning), gets no block references or vault-wide search, and default Obsidian Sync skips non-`.md` files. Give the export a `.excalidraw.md` extension and the CLI writes the plugin's native format automatically:

```bash
archboard export --board payments --out "$VAULT/diagrams/system-map.excalidraw.md"   # .md → Obsidian format
archboard import --board payments "$VAULT/diagrams/system-map.excalidraw.md" --replace  # reads plain and compressed Drawing blocks
```

Round-trips are safe: text-element block references follow the plugin's own id rules, so re-importing, editing, and re-exporting the same file keeps links from other notes intact.

## Workflow: Snapshots

1. `snapshot save --board <key> <name>` before risky changes.
2. Make changes, evaluate with `describe` / `screenshot`.
3. `snapshot restore --board <key> <name>` to roll back if needed. `snapshot list` shows what's saved.

A snapshot belongs to the board it was taken on, and `--force` is what restores it onto a different one. It is a rollback point, not a proposal: a change somebody is meant to look at and argue with is a variant.

## Workflow: Duplication

`arrange duplicate --ids a,b --offset 40,40` (default offset 20,20). Useful for repeated patterns or copying layouts.

## Error Recovery

- **Exit code 3 (canvas unreachable)?** Auto-start is disabled (`EXCALIDRAW_NO_AUTOSTART=1`) or a non-loopback `EXPRESS_SERVER_URL` is set. Run `start` explicitly or fix the env.
- **Exit code 4 (browser required)?** Open `http://127.0.0.1:3000` in a browser, then retry — screenshots, image export, viewport, mermaid conversion, and making or closing a pane all happen in the frontend.
- **Elements not appearing?** Check `describe` — they may be off-screen. `viewport --fit --pane <spec>` frames everything on that pane's board, and `viewport --ids a,b,c` frames a subgraph (`set_viewport` with `scrollToContent` or `scrollToElementIds` in MCP).
- **Arrow not connecting?** Verify element IDs with `get <id>`. Make sure `startElementId`/`endElementId` match existing element IDs.
- **Canvas in a bad state?** `snapshot save` first, then `clear --yes` and rebuild. Or `snapshot restore` to go back.
- **Element won't update?** It may be locked — `arrange unlock --ids <id>` first.
- **Duplicate text elements / element count climbing on its own?** A label is stored on its shape as `label`, and the browser expands it into a bound text element. Expanding it more than once used to mint a *new* text element each time, so labels bred on every sync until arrows collapsed under the stack. Fixed: a label that already has a text element keeps that element. On a board polluted before the fix, `query --type text` shows the copies — several texts sharing one `containerId` — and `delete` removes all but one; the arrows they were bound to may also need their geometry restored by nudging the shapes they connect. Labelling shapes, including background zones, is safe.

---

## References

- `references/cheatsheet.md`: full CLI reference, the MCP tool table, REST API endpoints + payload shapes, and the diagram design guide (colors, sizing).
- `references/architecture-workflow.md`: **read this when a human is at the board with you.** Covers the read-back loop (`changes`, `selection`), binding nodes to code, what to draw on a board somebody stands in front of, and reading a human's rearrangement as design intent.
