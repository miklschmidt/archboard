---
name: archboard-renderer
description: >-
  Change how Archboard places, routes, labels or paints a picture, and judge the
  result. Use when a picture draws correct meaning wrong, when you change
  crates/archboard-layout, archboard-scene or archboard-render, or when you
  compare layout results across the corpus.
metadata:
  internal: true
---

# Change the renderer

A renderer change trades terms: card room, line length, crossings, label size, page area and time.
Each picture is a negotiation between those terms. Read
[ADR 0059](../../docs/adr/0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md) and
[ADR 0063](../../docs/adr/0063-blocks-plans-placement-ports-labels-and-trunks-before-routing.md)
before you change what they decide.

## Renegotiate terms

When a constraint blocks a better picture, renegotiate the term at the point of conflict.
Make the blocked term flexible, so that the search finds the better picture by itself.
Do not add a guard, a second pass or a mode that protects the old outcome.

For example, a label is too wide for the gap on a line's direct way, so the line takes a long way round.
The fix is a label that wraps onto a narrower plate. Every label search tries that plate before it
gives up on a route. The wrong fix routes the picture twice and keeps the old placement.

## Steps

1. Reproduce the complaint on the reading that shows it, and name the term that blocks the better
   picture. If you can point to the code that refuses the better picture, the step is done.
2. Search the corpus for the same symptom, not only the reported reading. Write a small detector
   when the symptom has a geometric test, and count its hits before and after.
3. Make the blocked term negotiable. Apply a rule that the owner states wherever its words apply.
   For example, a junction keeps its room from every arrowhead, whichever way the line runs.
4. Add one focused test that fails without the change, through the module's own interface.
5. Measure the corpus before and after (see "Measure"). The step needs three results: the totals,
   a count of readings that got better and worse on each measure, and pictures of the worst readings.
6. Judge the change on its merits. A change that alters many readings is not wrong by itself.
   A fix that moves the symptom to other readings is no fix.

## How the pipeline decides

- Words are measured before layout. `measure_label` and `narrow_label` in
  `crates/archboard-scene/src/measure/labels.rs` give a wide and a narrow plate. The layout
  places one. `crates/archboard-layout/src/architecture/drawn.rs` paints the lines of the plate
  that the layout placed.
- A dense reading routes its placements in the order of their promise. It compares only the first
  few that route (`dense_routes` and `dense_room` in `crates/archboard-layout/src/blocks/planned/mod.rs`).
  A change that lets a refused placement route therefore changes which placements compete, and
  many readings can change.
- `reading::order` and `reading::rank` in `blocks/planned/reading.rs` rank finished drawings:
  landing first, then the count of long detours, then route cost plus crossings, times the cost
  of the room. A long detour outranks every cost, so a change that removes one detour can change
  which placement wins. If the ranking itself is wrong, change the ranking. Otherwise leave it alone.
- Routing is greedy. One line that takes a shorter way can force later lines into detours.
- `finish` in `blocks/planned/fixed.rs` is the last guard. It places the labels, checks every
  line, the port spacing and the fan runs. Contraction runs it again. A pass that edits routes
  must pass it too.
- A placement change can stack one card on another. No scorecard measure catches that, so count
  card overlaps over the corpus after you move cards.

## Measure

Build the core after every change to `crates/` (see [TESTING.md](../../TESTING.md)). Do not edit
`crates/` while a measure runs. The renderer refuses a core that is older than the sources.

- `bun docs/design/wide-board-layout-fixtures/measure.ts` prints the scorecard for each fixture and
  vault document. Save a run with `SAVE=run.json` on the old tree, then compare the new tree with
  `AGAINST=run.json`. With an outdir argument, `PICTURES=1` writes a PNG of each drawing there.
- `bun scripts/render-corpus.ts render <out>` and `compare <before> <after>` say which drawings
  changed and how their times moved. Times are honest only with `--jobs 1`.
- `bun run benchmark` holds the speed limits.
- A change for speed alone keeps every answer byte-identical. Hash each answer of the corpus
  before and after it, natively and in WebAssembly. A cache lives inside one layout call, and a
  solve in parts answers what one solve answers.

Look at the pictures of the readings that changed most, in both themes. A number tells you where
to look, and the picture decides.

## Trace a decision

The core lays out in a worker as WebAssembly, where `eprintln!` prints nothing. To see why a
reading picks a placement or a route, run its layout natively:

1. Make the layout worker in `packages/renderer/src/runtime/bun-renderer/processes/` write each
   graph that it receives to a file, and render the reading.
   With two workers or more, the pool sends a dense Blocks solve in parts (ADR 0078). Each
   part is the graph with a `part` member first on its root. Delete that member to get the graph.
2. Lay out each saved graph with `archboard_layout::lay_out_picture` in a temporary integration
   test under `crates/archboard-layout/tests/`, with `eprintln!` where the decision is made.
3. Remove the worker change, the test and the trace before you commit.
