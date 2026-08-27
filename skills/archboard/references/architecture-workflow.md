# Architecture work on the canvas

Supplement to `SKILL.md` for using the canvas to build, explore, and refactor
**codebase architecture** with a human, typically on a large touchscreen.

`SKILL.md` covers the boards, the panes, and how a proposal is branched off the
architecture that exists. This covers the loop the two of you run inside that.

## What makes this different from drawing a diagram

A diagram is output. An architecture canvas is a shared workspace: the human
rearranges it, and **the rearrangement is the message**. Pulling two boxes apart
means "these should not be coupled." Dragging one inside another means "this
belongs there." Read the layout, do not just write it.

So the loop is always: **draw → look → read back → interpret → propose.**

Never assume the canvas still looks the way you left it. Open any turn that
touches an existing board with `panes --text`, so you know which board is where,
and then read what moved.

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
scene rather than the delta, and `selection --text` when the human says "this"
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

The evidence tools answer different questions:

- `check` decides whole-board structural and routing findings.
- `render-findings` gives close-ups only while findings remain and a picture
  helps explain them.
- A full-scene `screenshot` records the rendered pane after confirming that it
  holds the named board. The pane camera changes the view, not inspection.
- `export` writes a portable scene.
- `compare` describes semantic change between variants. It proves neither
  routing nor rendered pixels.

## Drawing an architecture pass

Author with `add` or `apply` rather than `mermaid`. Mermaid is converted
in the browser and reaches the board as a change report from that tab, so it
needs a tab open and hands you no ids to work with.

A whole pass is the shape of work a claim is for, and the human standing at the
board is who it takes the board from: `SKILL.md`, "One writer at a time".

Guidance that holds up on a big screen:

- **Look in the library first.** `library list --text`. A stencil of a queue or
  a database drum reads from two metres away; a labelled rectangle does not.
- **One concern per board.** Do not put the data model and the request path on
  the same board. Make it a second board and, when they need to be read
  together, put it beside the first with `pane open --board <name>`, which makes
  a new pane rather than taking over the one somebody is reading.
- **Layout carries meaning.** Left-to-right for flow, top-to-bottom for layers,
  containment for ownership. Be consistent — the human will read the geometry
  before the labels.
- **Boxes big, labels short.** A 75" panel viewed from two metres is not a
  laptop screen. Two words plus a path.
- **Draw the edges that matter.** Every call is not an arrow. Show the couplings
  that constrain the refactor.
- **Label your containers.** A boundary box with no label has no identity that
  survives to the other variant, so `compare` can only call it
  "unlabelled-rectangle" and any statement about what moved in or out of it
  degrades with it.
- **Finish the whole board.** Run the completion gate from `SKILL.md`. Keep
  close-ups conditional on live findings and take one confirmed-board
  full-scene overview only after the strict report is complete and clean.

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
  Check `panes` first: with no tab there is nobody to report an edit.
