---
id: TASK-034
title: A bound label keeps stale coordinates when its container moves
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 02:39'
updated_date: '2026-08-24 11:06'
labels: []
dependencies: []
references:
  - src/core/expand-elements.ts
  - src/core/labels.ts
  - src/server.ts
  - scripts/check-labels.mjs
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Moving or resizing an element through the API updates the container but leaves its bound text element's stored x/y untouched. Excalidraw's renderer recomputes bound-label position from the container at draw time, so the board looks correct and the bug hides. What is wrong is the persisted coordinates, and everything that reads coordinates instead of pixels inherits the error.

Measured on archboard/dataflow after an ordinary editing session (moving boxes with `update`, rebinding arrows):

  label "changes"           1170px from its arrow, stored at (-590, -123) while the arrow sits at (448, 272)
  label "quiet"              804px
  label "WS"                 635px
  label "MCP stdio server"   450px from the rectangle it labels

The scene bounding box was (-590, -123)-(1780, 952) instead of (40, 80)-(1780, 952), a phantom 630x203 region of empty canvas up and to the left of everything. That box is what zoom-to-fit frames, what image export crops to, and what the relative-position signals in src/core/layout.ts measure against, so a drifted label silently skews layout comparison and `changes` output as well as the view.

Re-centring the labels by hand fixed the box, which confirms the container geometry is right and only the label coordinates are wrong.

Same family as TASK-024, TASK-028 and TASK-029: the seed/bound-text split is right, but the two halves drift apart under operations that were only thinking about one of them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Moving an element through update or apply moves its bound text with it
- [x] #2 Resizing an element re-centres its bound text
- [x] #3 Re-routing an arrow (endpoint moved, binding changed) moves its bound label to the new midpoint
- [x] #4 A check script fails when any bound text is further from its container centre than the container's own size allows, run over the existing test boards
- [x] #5 The existing boards in the vault are repaired, or a documented one-off repair exists as for TASK-024
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce headlessly on my own server (port 33500, vault in scratchpad; port 3000 untouched): a labelled rect and a labelled arrow with real bound text elements, then move and resize through PUT /api/elements/:id. Confirmed: a 500px move leaves the label 500px behind, the arrow it drags takes its label 250px out, and a resize throws the label 141px off centre.

2. Write the placement rule down once, pure, in src/core/labels.ts next to the rest of the seed/bound-text model: boundTextPlacement(container, text) -> where Excalidraw will draw that label (centred in a shape; at the midpoint of an arrow's middle segment, or its middle vertex for an odd point count, which is Excalidraw's own rule), recentreBoundTexts(elements, containerIds) -> the {id,x,y} patches that make the stored coordinates say the same thing, and boundTextDrift(elements) -> the offenders under the invariant 'a bound text's centre is no further from its container's centre than the container's own half-diagonal, plus a small slack'. Arrows measure their centre and size from points, not from the stored width/height, which is stale after a reroute.

3. Apply it on the two server paths that move a container without thinking about its label: PUT /api/elements/:id when x/y/width/height/points/angle change, and every arrow rerouteBoundArrows moves as a consequence. One helper, called once with the touched element and the rerouted arrows, storing and broadcasting each moved text so the panes stay in step. The change-report path is deliberately left alone: there Excalidraw has already positioned the label and is the authority.

4. Repair, in scripts/repair-labels.mjs, which already owns undoing this family of damage: a pass that re-centres every drifted bound text, in both the live-board and the --file form, reported before and after.

5. Cover it. scripts/check-labels.mjs gets the placement rule and the invariant driven through the same headless model it already uses (move, resize, reroute), plus a hostile check that the scenario really does drift when the recentring is removed, so it cannot pass by being toothless. scripts/check-boards.mjs, which drives a real server, gets a labelled shape and a labelled arrow on a real board, moved, resized, saved and reopened, and asserts the invariant over every open board at the end.

6. Repair the vault boards with the script and show the drift gone. bun run type-check and bun run test green. Kill my server.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced first, on my own server (33500, own vault; the canvas on 3000 was never touched). A labelled rect, a labelled arrow and real bound text elements seeded through a change report the way a pane reports them, then moved and resized through PUT /api/elements/:id: the box's label stayed 500px behind, the arrow the server dragged along took its label 250px out of place, and a resize threw a third 141px off centre. The scene box grew a phantom region every time.

THE RULE, in src/core/labels.ts, pure and dependency-free like the rest of that module. labelAnchorOf() is the point a container hangs its label from — the centre of a shape, and for an arrow the midpoint of the middle segment (or the middle vertex of an odd-length path), which is Excalidraw's own rule. An arrow measures itself from its points and never from its stored width and height, because those are the box round a path the server re-routes without re-measuring, and so are stale on exactly the arrows this matters for. boundTextPlacement() turns that anchor into the top-left a text element must have. recentreBoundTexts() gives the moves, for the containers named or for a whole scene. boundTextDrift() is the invariant: a label may sit as far from its anchor as half its container's own diagonal, which covers every alignment Excalidraw offers, and anything beyond that is a label the board has lost track of.

THE SERVER, in src/server.ts. settleBoundTexts() next to rerouteBoundArrows, called from PUT /api/elements/:id: once for the element whose geometry changed, once for every arrow the server dragged along behind a moved shape, and once for the container of a bound text that was itself re-measured. Every moved text is stored and broadcast, so panes stay in step. align, distribute and apply all go through the same PUT, so they are covered by the same three lines. The change-report path is deliberately left alone — there Excalidraw has already placed the label and is the authority.

AC #3 also names a binding change, and that turned out not to re-route the arrow at all: PUT accepted a new start/end ref and left the path where it was until some shape it was bound to happened to move. Creating an arrow resolves its path from those refs, so re-stating them now does the same, and the label follows. Confirmed live: pointing an arrow at a different box moved it from [[0,0],[400,500]] to a path between the new pair, label still exactly on the midpoint.

WHAT THE BROWSER TURNED OUT TO BE DOING. Verified live with my own Chrome tab on 33500 (the canvas on 3000 and its two panes were never touched), and found the other half of this bug. frontend/src/canvas/elements.ts already re-centred bound text after conversion — but only for rectangle, ellipse and diamond, because that is all `isShapeContainerType` covers. An arrow's label was reported at whatever position the converter happened to mint it at. One real human drag put the gRPC label 1314px from its arrow and the scene box at (15,-82)-(2464,1429) while the board on screen looked perfect. That is almost certainly the dominant source of what was measured on archboard/dataflow, where every drifted label was an arrow's.

Fixed by extending the same pass to arrows, through the same shared rule, but *rescuing* rather than re-centring: the pane moves a label only when the record is plainly wrong by the invariant, and never to correct a few pixels. Excalidraw is the authority on where it draws a label and does not always agree with us to the pixel (a curved multi-point arrow hangs its label from the bezier). Correcting a pixel would start the argument that TASK-024 was about — pane moves it, Excalidraw moves it back, the report carries that, the next delivery moves it again.

LIVE VERIFICATION, same tab, board rebuilt from scratch after the fix. Seed, 8 agent moves and a resize, then a real mouse drag of a box: 6 elements, one label per container, zero adrift, where before the frontend fix the identical drag gave 1314px and the blown-out box. Ten more agent moves: still 6, still zero adrift, and four seconds idle left every element version identical, so nothing is arguing with anything. A page reload: 6 elements, zero adrift, board renders correctly. A human retype of a box to 'EdgeRouter' still lands in both the text element and the stored seed, so TASK-028 is intact.

CHECKS. scripts/check-labels.mjs 51 -> 128, and it now spawns a real server on 33338 for the last section: a labelled shape and a labelled arrow with real bound texts, moved, resized, re-pointed and re-bound over HTTP, every label then compared to the pixel against where its container draws it, and the board saved to a vault note and opened again. Mutation-tested by stubbing settleBoundTexts to return nothing: 8 checks fail, naming the exact distances. scripts/check-changes.mjs gains the reader's side of it — a node dragged out of its cluster reports the cluster split and the region change when its label comes along, and with the label left behind reports the node getting 'larger' and nothing else, which is the wrong answer to the wrong question — plus the invariant over the boards that file builds.

REPAIR. scripts/repair-labels.mjs gains the re-centring pass in both the live and the --file form, reports how far each stray label has to travel, and exits non-zero if any is still adrift. It now skips the arrow-geometry pass unless labels actually bred: re-routing redraws every arrow from the server's straight-line rule, which is right for a hairline nobody can grab and wrong for a board whose arrows are where somebody put them. The header documents the vault sequence (board open --reload, repair, board save).

VERIFICATION, criterion by criterion.

#1 move. scripts/check-labels.mjs, real server: after PUT x/y on a labelled shape, boundTextDrift is empty and the label is within half a pixel of where its container draws it. Through the CLI on a throwaway canvas (33501), `apply` with two updates in one patch moved a box 1100px and resized another, and all four labels came out exactly on their wanted placement; `update svc --set '{"x":50,"y":2000}'`, `arrange align --to top` and `arrange distribute --to horizontal` the same, zero adrift and nothing left to move. Live with a browser: 8 API moves then 10 more, six elements throughout, zero adrift. Mutation: with settleBoundTexts stubbed to return nothing, the same checks fail at 800px.

#2 resize. Same three places: PUT width/height on a labelled box, drift empty, label exactly centred; the mutation run reports it 800px out.

#3 re-route. Re-pointing an arrow (PUT points) and re-binding it (PUT end) both keep the label on the midpoint, checked against labelAnchorOf to the pixel. The rebind case needed the arrow to actually re-route, which it did not do before — a new binding was accepted and the path left alone. Through the CLI: after `update wire --set '{"end":{"id":"db"}}'` and then moving the anchor shape 2000px, the arrow's anchor is (335,1105) and the gRPC label's centre is (335,1105). And re-routing as a consequence of a shape moving is covered too, since that is what the eight-move run exercises.

#4 the check. boundTextDrift is the invariant — a label may sit as far from its anchor as half its container's own diagonal, which is every alignment Excalidraw offers, and beyond that the board has lost it. It runs in check-labels over the fixture boards that file builds, over a real board driven through move, resize, re-point and re-bind, and over that board again after it is saved to a vault note and reopened; and in check-changes over the boards that file builds. Both fail when the fix is removed: stubbing settleBoundTexts fails 8 checks in check-labels naming exact distances, and check-changes has the same run with the label left behind as a positive assertion that the read-back goes wrong.

#5 the vault. The two boards that were drifted — archboard/dataflow (5 labels, worst 151px) and archboard/dataflow@no-mcp (1 at 150px, 3 off centre) — were repaired through the canvas with the documented sequence and saved; both now read zero adrift, and so does every other board in that vault. The configured architecture vault was checked and was already clean. The repair itself is in scripts/repair-labels.mjs with the sequence in its header, so a board that drifts in future has a documented way back.

bun run type-check clean, both projects. bun run test green: 5 stdio wire, local bind, 108 obsidian, changes and injection, 128 labels, 47 library, boards, surface parity.

TWO SEPARATE BUGS FOUND AND LEFT ALONE, both about an arrow's stored box rather than its label.
1. rerouteBoundArrows writes an arrow's points and never re-measures its width and height, so the recorded box is stale on every arrow the server has moved. repair-labels.mjs has been re-measuring them since TASK-024, which is the giveaway.
2. An arrow's x,y is its first point, not the top-left of its box, so for an arrow that runs leftwards or upwards the range x..x+width does not contain the arrow at all. archboard/dataflow has nine of those. Every reader that treats an element as a box — the scene bounding box, and layout.ts, and so compare and describe — places those arrows wrongly. boundTextDrift is unaffected because it measures an arrow from its points.

DELIBERATELY OUT. The change-report path does not re-centre anything: Excalidraw has already placed the label there and is the authority, and the pane's rescue only fires where the record is plainly wrong. A container that shrinks below its label's width is re-centred but not re-wrapped, because wrapping needs font metrics the server does not have; the pane re-measures it on the next delivery.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A bound label goes where its container goes. The rule Excalidraw draws by — centred in a shape, on the midpoint of an arrow — is written down once in src/core/labels.ts next to the rest of the seed/bound-text model, and the two paths that were moving containers without it now apply it: the server, whenever an update changes geometry or drags an arrow along behind a moved shape, and the pane, which had been re-centring bound text since before this task but only for the three box shapes, leaving every arrow's label wherever the converter first minted it. That second half was doing the real damage — one human drag put a label 1314px from its arrow, on a board that looked perfect, because Excalidraw recomputes the position before it draws and only the record was wrong.

The pane rescues rather than re-centres: it moves a label when the record is plainly wrong by the invariant and never to correct a few pixels, because Excalidraw is the authority on where it draws and an argument over a pixel is how the TASK-024 loop starts.

Verified on a real server through update, apply, align, distribute, re-pointing and re-binding, and live in a browser across agent moves, a human drag, a reload and a retype, with element versions holding still when idle. The invariant that catches it is in check-labels and check-changes and fails when the fix is removed. The two drifted boards in the vault are repaired and scripts/repair-labels.mjs documents the way back.
<!-- SECTION:FINAL_SUMMARY:END -->
