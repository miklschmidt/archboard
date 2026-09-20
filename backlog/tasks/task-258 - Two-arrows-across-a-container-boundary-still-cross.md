---
id: TASK-258
title: Two arrows across a container boundary still cross
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 20:34'
updated_date: '2026-09-20 10:35'
labels:
  - renderer
dependencies: []
references:
  - src/transformers/semantic-renderer/lib/layout/flank-rules.ts
  - TASK-256.11
  - .skill-evals/2026-09-17T16-31-08-093Z/report.md
ordinal: 465000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-256.11 seated parallel relationships apart so two arrows between the same pair of cards can be told from each other: each takes its own port index, mirrored between the two faces, and a pair or triple between top-level cards now draws straight. The case it could not reach is a pair whose ends sit at different containment levels — a card inside a frame to a card outside it. Their ends no longer swap, so each label belongs to the arrowhead its order says, but the two routes now meet twice where they met once: their horizontal runs turn in the wrong order relative to each other. Page, route length and bends are identical before and after; only the crossing count moves.

The lever is the frame boundary port, and the engine does not honour its index. The TASK-256.11 worker gave that port the seat and then the seat negated, and both produced a drawing identical to index 0, so this is the hierarchy router rather than the port seating that task owns. It reverted the experiment rather than widen its change.

Nothing in the vault or the wide-board fixtures has a parallel pair, so nothing regresses today and no recorded scorecard moves. This surfaced in the 2026-09-17T16-31-08 evaluation, where three S08 runs drew two signals from one card to another; those runs are fixed, because their boards had no containers. A run that had put the two emitting methods inside a frame and still drawn one arrow each would meet this.

Related: TASK-239 proposes one shared trunk port per face for a hub, which pulls the other way. Its inherited constraint from TASK-256.11 — a shared port must never take two relationships that share both endpoints — applies here too.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Two relationships sharing both endpoints across a containment boundary are drawn without crossing each other
- [x] #2 A renderer test owns the case beside the same-level pair in route-nesting.test.ts, sweeping both edge orders
- [x] #3 The recorded scorecards of the wide-board fixtures and the vault boards do not regress
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Save a scorecard baseline of every fixture and every variant of every vault board before changing anything (measure.ts SAVE=/ALL=1).
2. Verify for myself whether the frame boundary port is the lever: give it the seat, the seat negated, a large index, and reverse the order the ports are pushed onto the frame.
3. If the port is inert, find what does order a boundary crossing, by probing the shapes a parallel group can take across a boundary.
4. Change only what the defect needs, and prove the corpus cannot reach the change.
5. Hold the case in route-nesting.test.ts beside the same-level pair, sweeping every containment shape, both edge orders and both themes.
6. Re-measure against the baseline, render the shapes, and look at the boards, the views, a walkthrough and a drill-down in the running app over a headless CDP screencast.
7. Record the investigation in docs/design/layout-rules.md and self-review the diff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
What the boundary port is. Verified the previous worker's finding and went further: the engine honours nothing about a boundary port but its face. The seat, the seat negated, ten times the seat and index 0 all draw the same picture byte for byte, and so does reversing the order the ports are pushed onto the frame. Leaving the crossing to the router instead is still refused (org.eclipse.elk.core.UnsupportedConfigurationException: no entry found for key), as section 10 recorded.

What does order a crossing. The engine seats the crossings of one face itself, in the order it walks the source's face. A pair leaving a card's south face, whose ports the engine walks from the far end, therefore turns in the reverse of the order a reader follows, so on the near flank the two horizontal runs are always in the wrong order and always meet. Seating the ends the other way only mirrors the drawing: the lanes follow the ends, and both seatings draw the same two crossings with the labels swapped, at the same page, route length and bends.

The fix. A relationship that shares both endpoints with another crosses a frame by the face it is already travelling, instead of turning to bundle down the frame's near flank and turning back; a route out of a frame then descends straight through the frame's foot. Where that face is the frame's title band (a route into a frame with the title on top) it bundles down the far flank instead, that being the flank whose seating agrees with the order the ends are seated in.

Measured. Five shapes, pairs and triples, both edge orders, both themes: at one level, out of a frame (601x572 to 404x443), into a frame (621x573 to 601x572), between two frames (448x889 to 649x760), out of two frames (745x889 to 500x587). Every one draws with no crossing, none swaps ends, and none runs through a card.

Nothing else moves, twice over. The rule is asked only of a relationship with a sister, and no fixture, vault board, variant or view holds two relationships sharing a pair of endpoints, so it is never asked; and with straight false the new crossingFace is exactly the lookup table it replaces, over all eight header-and-face combinations. The saved scorecards of all four fixtures and every variant of all fifteen vault boards are byte-identical before and after.

Measured and not kept, both recorded in layout-rules.md section 26: the same rule for every crossing, not only a pair's (Agent workbench fit 0.47 to 0.40, shared corridor 374 to 1367; Board viewer label strand 0.85 to 1.14, past the bound the suite holds), and a pair into a frame crossing by the frame's top, which draws the best picture of all and runs both routes through the frame's own title.

Self-review (code-review skill, both axes over the working-tree diff) and what it changed.

Spec axis. It re-derived the two inertness claims independently and both hold: the eight header-and-face combinations of the new crossingFace match the table it replaces exactly with the flag false, and no vault view or fixture holds a shared-endpoint pair. It raised one correctness question: the fallback flank is chosen blind to the flank rule while the reason given for it is seating, and portIndex does take the rule. Checked: portIndex's rule term multiplies only the rank, and the seat offset is added with a fixed sign, so the ends' seat order is rule-independent; and the fallback is only ever reached for a face that is the title band, which no rule chooses. Measured it rather than leaving it at that: every shape, count, edge order and theme is clear under all four flank rules and both readings, thirty-two combinations.

Standards axis. Acted on all of it: the far flank is read from the one record of how a face lies on a box instead of borrowing SOLVING.returnFlank, which means something else; the frames a route leaves and enters became a named Boundaries type instead of the same inline shape twice; Crossing.id became Crossing.frame with a doc per field; seat.shared > 1 became hasSister(seat) in flank-rules.ts, where Seat lives, so compound-graph stops reaching into another module's record; and the test fixture's subjects are typed SemanticNode instead of Record<string, unknown>. Both axes also caught prose overreach in layout-rules.md section 26 (near flank is only the crossing flank with a title on top, the record reports page where section 13 reports fit, and one of the five shapes buys its clearance with a quarter more page); all three are now said plainly.

Verification after the review fixes: type-check clean on both projects, lint clean, oxfmt clean, the renderer suite 221 pass, tests/system/semantic-boards and tests/system/boards 30 pass, the measure run against the saved baseline unchanged measure by measure and the saved scorecard JSON byte-identical.

Looked at it in the app. bin/dogfood, and a headless Chromium driven over CDP with a screencast rather than an extension tab, which freezes requestAnimationFrame. All fifteen boards draw with no console error; the Agent workbench view switch repaints 140 frames at a 30 ms median gap and the walkthrough 169; a walkthrough step flies the camera and dims the rest; selection shows a subject's binding and its one level down, and taking it drills from Archboard to Canvas server with the breadcrumb reading archboard > Canvas server. One scare during this was mine: a stale frontend bundle built while the title-band variant was on the tree made a view report Expected 1 hierarchical ports, but found only 0. Rebuilt, it draws. Worth keeping: measure.ts covers variants, not views, so a view can only be checked by rendering every board view or by looking.

Verified independently of the worker: wide-boards.test.ts is untouched by the diff and its recorded scorecards still pass, so no fixture or vault board changed its drawing — the recordings would fail if one had. Full gate green: lint, fmt:check, type-check, frontend build, 3255 module tests, 163 system tests, the repository lane and the serial browser lane at exit 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A relationship that has a sister now crosses a frame by the face it is already travelling, rather than turning to bundle down a flank and turning back, and where that face is the title band it bundles down the far flank instead — the side where the engine seats its crossings in the order a reader follows. The boundary port was proved not to be the lever: the engine honours nothing about it but its face, and the seat, the seat negated, ten times the seat and index 0 all draw the same picture. Every containment shape now draws without a crossing (five shapes, both counts, both edge orders, both themes, all four flank rules, both readings), the rejected alternatives are recorded with the measurements that rejected them, and every fixture and vault board measures byte-identically.
<!-- SECTION:FINAL_SUMMARY:END -->
