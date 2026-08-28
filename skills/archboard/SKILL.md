---
name: archboard
description: >-
  Architecture canvas for comparing a system as it is against a proposed
  change, drawn as Excalidraw boards a human and an agent edit together on a
  live canvas. Use when an agent needs to draw or refine a named board, branch
  a proposal and compare it with its source, read a human rearrangement as
  design intent, place stencils, promote architecture nodes bound to code, or
  export a diagram. The bundled archboard CLI is the agent interface.
---

# archboard

Archboard is a canvas for comparing architectures. The architecture that
exists is one board. A proposal is a variant branched from it. Put the two
boards side by side, let the human rearrange either one, and read the result
back as design intent. Drawing is the means. The comparison is the point.

Four rules decide whether the board stays usable:

1. Name the board on every content call. There is no active-board fallback.
2. Give every write a short present-tense `--doing` line that says what changes
   in the architecture.
3. Branch a proposal from its source. A redraw has no shared identity to diff.
4. Check the library before drawing a generic shape. Keep stencil provenance
   and human grouping intact.

## Command authority

Use `archboard help <command>` for released syntax and options. Inside the
Archboard checkout, use `./bin/canvas` in place of `archboard`.

For result shapes and refinements, follow `src/cli/commands/run.ts` to the
command's `ResultSchema` and inferred type. Those Zod contracts are the source
of truth. For tested producer-to-consumer chains, read
[`references/cli-workflows.md`](references/cli-workflows.md). Do not reconstruct
either contract from this skill.

## The main path

Start by finding the named board and the pane that holds it. If the work is a
proposal, branch the current board, then put the proposal in a new pane so the
source stays where the human is reading it.

```bash
archboard panes --text
archboard board list
archboard library list --text

archboard board new payments --level service
archboard add --board payments --doing "drawing the payment path" elements.json
archboard promote --board payments --doing "calling the front door a gateway" \
  --ids gw --kind gateway --name "API Gateway"

archboard board save --board payments --variant option-a \
  --doing "branching the cache proposal"
archboard pane open --board payments@option-a
archboard add --board payments@option-a --doing "adding the orders cache" cache.json
```

Every content write already persists the named board. `board save` belongs in
this path only when it branches or renames a board.

## Completion gate

Finish work against an explicit board. Preserve the human's groups, layout,
stencils, and unrelated content throughout.

1. Claim the board only when a known substantial campaign needs several
   writes. Every write still names the board and carries its own `--doing`.
2. After each geometry or routing batch, run a strict whole-board `check`.
3. If findings remain and a close-up would help diagnosis or reporting, run
   `render-findings`. Its images explain findings; they do not replace the
   report.
4. Use `bridge` only for a deliberate supported proper crossing after the
   human chooses the over-connector, under-connector, and opaque background.
   Use `bridge remove` to remove that marker. Never draw masks by hand.
5. Recheck the whole board after every local repair. A route fixed here may
   create a crossing elsewhere.
6. Completion means the final strict report is complete and clean. An
   unsupported or indeterminate report is not clean.
7. Release the claim when writes end. If the final report demands another
   substantial repair campaign, claim again for that campaign and repeat the
   gate.
8. Confirm which pane holds the named board, then capture one fitted full-scene
   overview as an index of the board's extent. When the board requires panning,
   also capture enough working-zoom views to show its important paths and
   labels. The pane camera only chooses what a person sees; inspection still
   covers the whole named board.

Run `compare` only when the work concerns variants. It describes semantic
change between boards. It proves neither connector routing nor rendered pixels.

## Boards, panes, and variants

A board is the persisted drawing that content commands read and write. A pane
is a browser view of one board. A board can be edited with no pane open. Camera,
selection, and visible bounds belong to a pane, not to the board.

`pane open --board <key>` creates a new pane and cannot replace the board the
human is already reading. A third pane is refused. Read `panes --text` before
using words such as "left", "right", or "this one".

A variant is a modification of its source, not a fresh drawing of the same
subject. Branch first, then change only what the proposal changes. Promoted node
identity gives `compare` its join. Plain shapes drawn independently have no
shared architecture identity.

`compare` reports semantic architecture differences. Absolute tidiness,
connector routing, camera position, and rendered pixels belong to other owners.

## Work with the human

The canvas is shared. A moved box, a new group, or a node pulled out of a zone
may be a design decision. Begin a turn on an existing board by reading its pane
and recent changes. Use the live selection when the human says "this" or
"these". State your interpretation before turning their rearrangement into a
larger edit.

Keep each write meaningful on screen. Add a replacement path before removing
the old one. Move a subsystem in one patch instead of leaving a trail of
half-moves. A claim prevents competing writes during a substantial campaign;
it must never hide the work from the person at the board.

Read [`references/architecture-workflow.md`](references/architecture-workflow.md)
when building or refactoring codebase architecture with a human at the canvas.

## Architecture identity and stencils

Promotion turns one or several selected elements into one architecture node.
The shared node identity survives moves, browser round trips, and branching;
the optional code binding remains portable repository metadata. A multipart
stencil should usually be promoted as one node, not one node per visible part.

The library is for recognizable furniture such as queues, users, CDNs, and
database drums. Inserted stencil elements become ordinary editable elements but
retain their library attribution. Keep that attribution, grouping, and relative
layout unless the human asks for a change. A labelled rectangle remains the
right shape for a service with no useful stencil.

## Layout

Use left-to-right geometry for flow, top-to-bottom geometry for layers, and
containment for ownership. A pane is a camera, not a page boundary. Space the
board for reading at a useful working zoom and let the person pan instead of
compressing the architecture into one view. More canvas gives the structure
room; labels still stay short enough to read at viewing distance.

Choose visual form by meaning rather than putting every fact in a rectangle.
Use the available visual vocabulary, keep each treatment consistent within the
board, and add a small legend only for a convention that is not otherwise
obvious. Read
[`references/architecture-workflow.md`](references/architecture-workflow.md)
for when a stencil, zone, edge, line, annotation, or other shape earns its
place.

Draw background zones before their contents so their fill cannot cover later
elements. Put a zone title in a separate text element near its edge rather than
binding a label into the middle of the zone.

Compose for important edges that are easy to trace at working zoom. When
`check` reports an edge through an unrelated node, revisit the decisions above
the route in this order: one concern at one level, only edges that matter, then
node placement. Every bend should help a person trace a simple route around a
real obstacle; clearing inspection alone does not justify a detour. Read
[`references/architecture-workflow.md`](references/architecture-workflow.md)
when a finding points to board scope or to a layout you did not create.

Route supported straight polylines around unrelated nodes and visual obstacles.
Do not treat a container boundary as an obstacle. Inspection owns the exact
supported routing judgment; the detailed model is in
`references/architecture-workflow.md`.

## One writer at a time

An ordinary write holds the board only while it writes. Claim before a known
substantial multi-write campaign whose half-finished state would be misleading.
Do not claim for one box, one label, one promotion, or a read. Ask questions
before claiming, and release as soon as writes end.

The claim reason names the campaign. Each `--doing` line names the current
step. The person can take a claimed board back. If that happens, stop and say
what is complete and what partial state remains.

A version refusal means another Archboard writer changed the board first. Use
the refusal's current document when deciding the next write. A note conflict
means an outside editor changed the persisted bytes; never choose which copy
wins without the human.

## Evidence has distinct jobs

- `check` inspects the whole persisted board deterministically.
- `render-findings` renders close-ups for current findings from one named board
  snapshot.
- `screenshot` captures one pane's rendered view. Confirm that pane holds the
  named board. A fitted full-scene overview indexes the board's extent; readable
  working-zoom views prove the important paths and labels on a pannable board.
- `viewport` changes a pane's camera. It does not crop inspection or prove what
  exists outside the visible area.
- `export` writes a portable scene file. It does not prove the browser view or
  semantic difference.
- `compare` describes semantic change between variants. It does not inspect
  routing or render pixels.

## Files and rollback

Use portable scene export when the drawing belongs in a repository. In an
Obsidian vault, an `.excalidraw.md` destination preserves the plugin's native
note format. A snapshot is a rollback point for risky edits to one board; a
proposal belongs on a branched variant instead.

## References

- [`references/architecture-workflow.md`](references/architecture-workflow.md)
  covers the human read-back loop and the architecture inspection model.
- [`references/cli-workflows.md`](references/cli-workflows.md) contains tested
  CLI value chains without copying result schemas.
- [`references/cheatsheet.md`](references/cheatsheet.md) keeps only stable visual
  defaults and points back to the live command and result authorities.
