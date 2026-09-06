# Architecture work on the canvas

Supplement to `SKILL.md` for using the canvas to build, explore, and refactor
**codebase architecture** with a human, typically on a large touchscreen.

`SKILL.md` covers persisted-board work first, then the separate live-browser
branch. This file covers the loop a human and agent run when that branch is
actually in use.

## What makes this different from drawing a diagram

A diagram is output. An architecture canvas is a shared workspace: the human
rearranges it, and **the rearrangement is the message**. Pulling two boxes apart
means "these should not be coupled." Dragging one inside another means "this
belongs there." Read the layout, do not just write it.

So the loop is always: **draw → look → read back → interpret → propose.**

Begin every turn with the explicit persisted board name. `describe`, `changes`,
`check`, Mermaid conversion, PNG or SVG rendering, finding close-ups, snapshots,
branches, and exports need no pane. If a person is collaborating in a live
browser, enter the branch in `SKILL.md`, run `browser panes --text`, and read
what moved before interpreting their layout.

## Reading back a human's edits

```bash
archboard changes --board payments --since <cursor> --coalesce --text
```

`changes` reports what the board _became_, in the same vocabulary `compare`
uses: nodes and edges added, removed, promoted, rerouted, clusters formed and
split, containment, whereabouts. One drag is one event, or none at all if it
changed nothing nameable. Keep the cursor from the last response and pass it as
`--since`; `--coalesce` collapses everything since then into one net diff, which
is the shape a once-per-turn read wants. Cursors belong to a canvas process, so
watch `feedId` and start over if it changes.

Events say whether the change came from the agent or the human, so your own
drawing is easy to skip. Use `describe --board <key>` when you need the full
scene rather than the delta, and `browser selection --pane <spec> --text` when the human says "this"
or "these".

What to look for:

- **Moved nodes** — proximity and grouping changes are design intent
- **New hand-drawn boxes** — usually a proposed component that does not exist
  yet, and it will have no node identity until somebody promotes it
- **New arrows** — a dependency the human wants, or wants removed
- **Deletions** — something they think should not exist

Then say what you infer before acting on it. "You pulled TokenStore out of the
auth cluster — should it become its own module, or just stop importing from
`service.ts`?" is better than silently generating a refactor plan.

## Levels and drill-down

A level says which abstraction the board discusses. Choose `system` for an
overview of systems and their relationships, `service` for the collaborating
services inside a system, and `module` for the code modules inside a service.
These are the vocabulary in use; validation also accepts other slug-shaped
levels, but do not invent a new tier just to label a proposal or a visual zone.
Kind says what a node is (for example, a queue); level says at what abstraction
it is being discussed. Neither field changes geometry or creates navigation.

Set a new board's level with `board new <name> --level system`. To correct an
existing board's metadata, use `board save --board <key> --level service
--doing "setting the board's abstraction level"` without `--as` or `--variant`.
Inspect it with `board info --board <key>`.

A promoted node with no `customData.archboard.level` inherits its board's
level. Usually omit `promote --level`; the inherited value is not stamped on
the element. Use `promote --level service` only to record an intentional
difference, such as a service-level node on a system overview. The effective
level is the explicit override, otherwise the board's level. A target board's
level does not set the source node's override. `get <id> --board <key>` shows
the element's explicit metadata; combine that with `board info` to resolve
inheritance. `describe` is a summary and may omit a level shared by every node.

Use a drill-down when a node's internals deserve their own coherent board and
would distract from the overview. Create a separate board for that subject;
a variant instead describes an alternative state of the same subject. Link to
an existing internals board when one already covers it.

The browser follows an element's `link: "[[board-key]]"` in the pane where the
link was clicked. Use the exact key returned by `board list`, without the
`.excalidraw.md` filename suffix. A bare key selects `current`; `[[name@variant]]`
selects that proposal explicitly, and folder-qualified keys work as in the CLI.
Aliases and heading/block anchors are not supported by Archboard's board-link
handler. A level alone never supplies a target. Obsidian's broader link syntax
and successful link persistence do not prove Archboard browser navigation.

For example, create a system overview and a service-level board of internals
using unused names. The JSON inputs below omit IDs so Archboard mints them;
take the rectangle ID from the `add` result, as in `cli-workflows.md`.

```bash
archboard board new payments --level system
archboard board new payments-internals --level service

printf '%s' '[{"type":"rectangle","x":80,"y":80,"width":240,"height":100,"label":{"text":"Payments"}}]' > overview.json
archboard add --board payments --doing "drawing the payments overview" overview.json
# Set payments_id to the returned rectangle ID, not its bound text ID.
archboard promote --board payments --ids "$payments_id" --kind service \
  --name Payments --doing "identifying the payments node"
archboard update "$payments_id" --board payments \
  --set '{"link":"[[payments-internals]]"}' --doing "linking payments to its internals"

printf '%s' '[{"type":"rectangle","x":80,"y":80,"width":240,"height":100,"label":{"text":"Payment API"}}]' > internals.json
archboard add --board payments-internals --doing "drawing the payment API" internals.json
# Set api_id to the returned rectangle ID.
archboard promote --board payments-internals --ids "$api_id" --kind service \
  --name "Payment API" --doing "identifying the payment API"

archboard board info --board payments
archboard board info --board payments-internals
archboard get "$payments_id" --board payments
archboard describe --board payments-internals
archboard check --board payments --strict
archboard check --board payments-internals --strict
```

The overview node inherits `system` and the API node inherits `service`.
If the overview node should explicitly be at `service`, re-promote its existing
ID with `--level service` and the same kind/name, then inspect it again. This
changes the override, not the link or the target board.

Creating and inspecting these boards needs no browser. An agent follows the
target by reading its key and calling `describe --board payments-internals`.
When a live browser demonstration is requested, discover panes with
`browser panes --text`, show the overview with `browser show payments --pane
<spec>`, select Payments and click its displayed link. Verify that this pane
now shows `payments-internals` and its API node; `browser panes --text` reports
the new board key. Use Board navigation to return to `payments`, or show it
explicitly in the same pane. A missing target leaves the pane in place and
reports a failure; check `board list`, repair the link or create the intended
board, then click again. Do not create boards merely by following links.

An element has one visible link slot. A code binding's derived target currently
occupies that slot when it resolves; preserve that code action and put the
drill-down on a separate unbound element when both need to be visible. Do not
replace a binding with a machine-local URL to work around this.

## Nodes carry the code binding

A shape becomes architecture when it is promoted. Use `archboard help promote`
for the released invocation and options; the source CommandContract and
inferred type remain authoritative. Conceptually, promotion gives it a kind, a
node identity, and usually a binding to the code it stands for.

The identity is what `compare` joins on and what survives redraws, drags and
export/import. The binding resolves through git, so it records a repository, a
branch and a commit rather than a path relative to somebody's working
directory. The persisted note stores only `customData.archboard.binding`:
repository identity, repo-relative path, and branch/commit/confirmed-at details
when available. Do not add a `file://` link for a code binding. If this machine
can resolve the binding through its checkout registry, archboard derives a
tappable target for the browser or caller and strips that overlay before the
next note write.

`customData` and human-authored `link` values both survive the full round-trip,
including the change report a human's drag produces. `describe` prints the
portable binding; element reads and the browser receive any target this machine
can derive for presentation. Elements the human drew come back tagged
`"source": "frontend_sync"` with no `customData`: that is your cue to ask what
the new box maps to, or to propose a binding.

## Completion and routing semantics

Inspection reads architecture identity, not visual resemblance. Several
promoted elements carrying one node identity form one semantic node, including
a multipart stencil promoted as one thing. `groupIds` never create a semantic
node. They and library attribution can instead prove that unpromoted shapes are
one visual obstacle. Preserve both the human's groups and the stencil's library
metadata.

A container boundary expresses ownership. It is not a routing obstacle. A
connector also excludes its own endpoint nodes and their containing zones from
unrelated-node penetration checks. These exclusions are why a line can cross a
zone boundary cleanly while the same line crossing an unrelated service body is
a finding.

Inspection covers only its declared supported geometry. Unsupported or
ambiguous records make coverage indeterminate; they never count as a clean
board. Route supported straight polylines around node bodies and visual
obstacles. A deliberate proper crossing is the one narrow exception: after the
human chooses which connector is over, which is under, and the opaque
background, `bridge` creates the exact marker inspection can verify. Hand-drawn
masks have no such meaning.

After every local geometry or routing batch, inspect the whole named board. A
repair inside one close-up can create a crossing elsewhere. Completion requires
a final strict report that is both complete and clean. Keep unrelated content,
layout, groups, and stencil provenance byte-for-byte or field-for-field intact
through the repair.

### When a finding points back to the board

An edge passing through an unrelated node is geometric evidence, not a verdict
about the board or the codebase. First confirm that the board accurately shows
the relevant architecture: one concern at one level, only edges that constrain
the discussion, and placement that consistently expresses flow, layers, and
ownership. When the composition is yours and still new, revise it before
working around it with bends.

That is not permission to tidy a person's layout or widen a routing-only task.
If somebody else arranged the nodes, or the requested repair promised to
preserve their placement, show the finding and explain the scope or placement
change that would make the edge easier to follow. Wait for agreement before
making that broader change.

Once those composition choices hold, use the simplest supported polyline that
goes around each real obstacle. Every bend should make the edge easier to trace
at a useful working zoom. If the relevant coupling still makes the board dense,
keep that coupling visible and say that the topology causes the clutter. One
crossing alone does not prove that the codebase is badly designed. Split the
subject only when each resulting board still has one coherent concern at one
level; use a bridge only for a deliberate proper edge crossing, never for an
edge passing through a node.

The evidence tools answer different questions:

- `check` decides whole-board structural and routing findings.
- `render-findings` gives close-ups only while findings remain and a picture
  helps explain them.
- `render --board <key>` records the complete persisted board as PNG or SVG
  through the server-owned renderer.
- `browser capture --pane <spec>` records a live pane only when the requested
  evidence concerns that session. The pane camera changes the view, not
  inspection or the persisted note.
- `export` writes a portable scene.
- `compare` describes semantic change between variants. It proves neither
  routing nor rendered pixels.

## Drawing an architecture pass

Use `add` or `apply` when you need stable ids for follow-up edits. `mermaid`
converts into one explicitly named persisted board through the server-owned
renderer and needs no connected browser. A pane already showing the board
receives the committed update; `browser show` is a separate display action.

A whole pass is the shape of work a claim is for, and a claim makes the board
read-only to people until you release it: `SKILL.md`, "One writer at a time".

### Spatial canvas

A pane is a camera over the board, not a page the board must fit inside. Choose
a working zoom at which the person can read labels and trace edges, give the
architecture enough space, and expect to pan. A fitted overview is useful as an
index of the whole board, but its labels may be too small to read. The board's
scope still stays at one concern and one level; more space is not a reason to
mix subjects.

Extra canvas buys separation, not prose. Keep node and edge labels terse.
Nearby free text or a short bullet list may name a constraint, exception,
responsibility, or the meaning of a path. Keep annotations subordinate to the
architecture. They should not repeat labels or turn a dependency that belongs
in an edge into prose.

### Visual grammar

Start with what each mark needs to communicate, not with a rectangle:

- Use a library stencil when recognizable infrastructure matters at a glance.
- Use a background zone and its title for ownership or containment.
- Use a labelled box for an architectural unit with no more useful familiar
  form.
- Use arrows for architecture edges. Use ordinary lines for separators or
  callouts, not as an unrecorded spelling of a dependency.
- Use free text and short bullets for nearby annotations. Ellipses, diamonds,
  images, and freehand marks are available when their familiar meaning fits the
  subject.

Variety is not the goal. Give one visual treatment one meaning within a board,
and reuse it consistently. Familiar notation should explain itself. Add a small
legend only when a local color, form, or line convention would otherwise make
the person guess.

Guidance that holds up on a big screen:

- **Look in the library first.** `library list --text`. A stencil of a queue or
  a database drum reads from two metres away; a labelled rectangle does not.
- **One concern per board.** Do not put the data model and the request path on
  the same board. Make it a second named board. If a live collaborator asks to
  see both, use the browser branch to put them side by side.
- **Layout carries meaning.** Left-to-right for flow, top-to-bottom for layers,
  containment for ownership. Be consistent — the human will read the geometry
  before the labels.
- **Labels short.** A 75" panel viewed from two metres is not a laptop screen.
  Two words plus a path.
- **Draw the edges that matter.** Every call is not an arrow. Show the couplings
  that constrain the refactor.
- **Label your containers.** A boundary box with no label has no identity that
  survives to the other variant, so `compare` can only call it
  "unlabelled-rectangle" and any statement about what moved in or out of it
  degrades with it.
- **Finish the whole board.** Run the completion gate from `SKILL.md`. Keep
  finding close-ups conditional on current findings. After the strict report
  is complete and clean, render the named board when a visual artifact helps.
  Capture panes only for requested live-session evidence.

## Refactor discussions

The proposal is a variant, not a snapshot and not a second diagram. Branch the
current board, change what the refactor changes, and let `compare` say what the
difference is. The full procedure is in `SKILL.md` under "Boards, panes, and
variants".

Snapshots are for the other job: a rollback point before a risky edit to one
board.

```bash
archboard snapshot save --board payments before-split
```

When the shape is agreed, export a portable scene to `diagrams/` and commit it
with the code change when the architecture decision belongs in review.

## Anti-patterns

- Drawing a proposal from scratch instead of branching the current board. It
  destroys the node identities `compare` joins on, and the diff comes back as
  "everything removed, everything added".
- Redrawing the whole board when the human moved one box. Update in place;
  wholesale redraws destroy their spatial memory of the board.
- Reporting a node's `variantAnomaly` as an architectural change. It means the
  node's own `variant` stamp disagrees with the board it sits on, which is
  bookkeeping left by a node copied in without being re-promoted.
- Auto-tidying a layout the human arranged. Ask before running align or
  distribute on anything you did not place yourself.
- Treating an empty `changes` as "nothing happened" when no browser is open.
  Check `browser panes` first: with no tab there is nobody to report an edit.
