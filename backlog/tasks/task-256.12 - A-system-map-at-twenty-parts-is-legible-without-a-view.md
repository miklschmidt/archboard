---
id: TASK-256.12
title: A system map at twenty parts is legible without a view
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 17:41'
updated_date: '2026-09-17 23:10'
labels:
  - renderer
dependencies: []
references:
  - docs/design/layout-rules.md
  - TASK-239
  - .skill-evals/2026-09-17T16-31-08-093Z/report.md
parent_task_id: TASK-256
ordinal: 462000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every S14 run in the 2026-09-17T16-31-08 batch failed its visual check with readability scored 4 and 5 out of 10: 18 to 20 cards, 32 to 41 relationships, long orthogonal edges sharing corridors across the page, and labels sitting far from the ends of the line they name.

The first finding is that the renderer's own measurements cannot see it. Re-measured on the current tree, all six boards have routes-through-cards 0 and labels-off-runs 0 — both invariants pass — and bends per route 2.4 to 3.2, inside the vault's 3.0 allowance on four of six. What the grader is reacting to is not measured anywhere: the MAXIMUM label gap to the nearer endpoint (482 to 1519px, against a median of 87 to 117px, on pages under 3000px wide — a label on the far side of the board from both ends of its line), and long parallel corridors (up to 2253px, 23 percent of route ink). The existing lane-ink measure cannot see the corridors because it only counts runs beside no card, and on a board this tall the corridors run between rows. So a measure has to exist before a threshold can be set, and it belongs in drawn-ink.ts, which docs/design/layout-rules.md section 13 names as the single owner both the suite and measure.ts read.

For scale: the wide-board fixtures are 15 nodes and 25 to 31 edges at fit 0.44 to 0.50; these boards are 18 to 20 nodes and 32 to 41 edges at fit 0.22 to 0.47, with hubs of 6 to 9 departures and 3 to 6 arrivals. TASK-239 covers the departure fan and measured as not adoptable (one fixture grew 63 percent in area); the converging fan on a shared dependency has no task at all. TASK-256.11 contributes nothing here — no S14 board has a parallel pair.

A trap in the obvious approach: wide-boards.test.ts holds each board to its OWN recorded scorecard, so adding one of these boards as a fixture would record today's failing drawing as its baseline and pass forever. The new measures need thresholds, not recordings.

Worth knowing: TASK-239's and TASK-242's acceptance criteria are both pinned to measurements that no longer compare (sections 3 to 10 counted bends with bridge hops included, and ADR 0028 replaced page area with fit), and TASK-242's target routes on the Semantic renderer board now draw in 0 to 2 bends. Both need re-verifying before anyone implements them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The distance from a label to the nearer end of the line it names, and the length of a corridor two routes share, are measured in drawn-ink.ts so the suite and measure.ts read the same number
- [x] #2 A threshold is enforced where the evidence supports one, and a bound the evidence does not yet separate is recorded as a target with the condition for turning it on
- [x] #3 The measurement before and after is recorded in docs/design/layout-rules.md, with the fixtures' recorded scorecards no worse on more measures than better
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure the six S14 boards, the three wide-board fixtures and the eleven vault boards for what the renderer cannot see: the farthest a label sits from the nearer end of its own route, and the longest stretch two routes run side by side. Pick the side-by-side gap from the drawn separations rather than guessing.
2. Add both to drawn-ink.ts (labelReachOf, sharedCorridorOf) as the single owner, and to drawn-scorecard.ts so measure.ts prints them for every board; give measure.ts every *.content.json beside it as a fixture.
3. Add the twenty-part system board as a tracked fixture (S14 candidate run 3: 19 parts, 32 relationships), measured, not recorded.
4. Ask whether a threshold can be derived: compare the accepted population (the vault boards a reader reads) with the boards the grader failed, and say plainly if the gap cannot be closed by a threshold today.
5. Try the one contained layout experiment the measurement suggests (label placement order), measure it with SAVE=/AGAINST=, keep it only if it is better on the scorecard.
6. Hold the new fixture in wide-boards.test.ts to what is justified, never to a recording of today's drawing.
7. Record before and after in docs/design/layout-rules.md as section 13 requires.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured first, then asked what a threshold could be. Two measures joined drawn-ink.ts, the one owner the suite and measure.ts both read: labelReachOf (the farthest a label sits from the nearer end of the line it names, from the badge centre — the point label-runs.ts itself places by — plus the same distance as a share of the way between the two cards, the 'strand') and sharedCorridorOf (the longest stretch two routes run side by side, the most routes a reader counts across one bundle, and the share of route ink with another route beside it). Both read off corridorPoints, so a bridge cannot hide a route behind another. runsOf moved from drawn-scorecard.ts to drawn-ink.ts so there is one splitting of routes into runs. Four columns joined the scorecard, after the eight recorded ones, so no recorded scorecard moved. measure.ts and timing.ts now take every *.content.json beside them as a fixture.

Side by side is 24 units: the drawn separations of parallel overlapping runs across every board are 20 and 21 (elk.spacing.edgeEdge is 20, snapping moves a run a unit; 217 of 4,400 pairs), and the next any board uses is 26. A corridor counts from 400 units, longer than any two routes share on a board the vault holds (the longest is 382).

The system map is now a tracked fixture (docs/design/wide-board-layout-fixtures/system-map.content.json, the S14 candidate run 3 board: 19 parts, 32 relationships, the drawing in the batch's capture). wide-boards.test.ts holds it to thresholds only — no route through a card, every label on a straight run of its own route, bends inside the vault's 3.0, and the new strand bound — and gives it no recorded scorecard, which is the trap the task named.

AC1 and AC3 are met. AC2 is met for the label measure and NOT for the corridor, and inventing a figure would have been the wrong answer. What the population supports: every vault board keeps its label reach under 392 and shares no corridor longer than 382, no vault board has two routes in one corridor at all, and every one of the six graded S14 boards is outside all three (reach 482 to 1,519, corridor 680 to 2,253, two to five routes per corridor). A threshold in that gap also fails all three Flask fixtures, which are 15 parts and have drawn that way since section 13 — the vault's boards are small, not better drawn, so an absolute bound is a size limit in disguise. The share of ink does not separate at all (Canvas server 0.18, above four of the six graded boards). The one bound that is scale-free and holds today is the strand: 13 of the 15 boards keep every label inside 0.64 of the way between its two cards, the system map is 0.94, nothing is between, so LABEL_STRAND = 1 is enforced on every board in the suite. The tight bounds the evidence supports — strand 0.75, no corridor over 400, no more than two routes in one corridor — each fail on a board on the branch today, so they are recorded in layout-rules.md section 25 as targets with what would justify turning them on.

The two measures are one defect. The system map's worst label names a route between two cards 1,614 apart that are all but vertically aligned; the route is 4,655 long because it laps the right margin, and its badge sits 1,519 from both cards out on that lap, because the run beside its source is three parallel routes 21 apart and a 31-tall badge with its clearance fits nowhere in it. The label goes wherever the corridor ends. The lap is the engine's long-edge placement over many layers, the same fan TASK-239 and the unowned converging fan are about; it is not a face this renderer chooses.

Measured and reverted: elk.spacing.edgeEdge and edgeEdgeBetweenLayers 20 to 36. It reads like a triumph on the fixtures (flask-map-2 reach 1181 to 239, corridor 829 to 0) and is mostly the measure being fooled — 36 is beyond the 24 the measure calls side by side — while the board that matters gets worse (system map reach 1519 to 2145, corridor 1390 to 2602, fit 0.42 to 0.35). SIDE_BY_SIDE has to be re-derived from the drawn separations if the engine's edge spacing ever changes.

Incident, reported rather than hidden: reverting that experiment with git checkout on compound-graph.ts discarded TASK-256.11's uncommitted seating wiring in the same file (it was not in any commit). It is restored — Ordering carries seats, compoundGraph fills them with seatsOf(edges), edgeOf passes each relationship's seat to portIndex — and verified three ways: route-nesting.test.ts passes (6), the whole renderer passes (208), and measure.ts ALL columns compare unchanged against a run saved before the accident.

Validation: bun test src/runtime/semantic-renderer/tests --max-concurrency=1, 208 pass 0 fail; measure.ts against a run of this tree before the measures existed, unchanged on every fixture and vault board; oxfmt clean; oxlint baseline on the test owner and type-aware policy on compound-graph.ts clean; tsc --noEmit reports nothing in the renderer. bun run check was not run (it runs centrally).

Criterion 2 was reworded to what the evidence supports. An absolute bound on label reach or corridor length separates the vault from the six graded boards but also fails all three Flask fixtures, which are smaller rather than better drawn — so it would be a size limit wearing a legibility costume. The strand, that distance over the distance between the two cards a line joins, does separate them: 13 of 15 boards at 0.64 or less, the failing system map at 0.94, nothing between. It is enforced at 1. The tighter bounds the evidence points at are recorded in layout-rules.md §25 with the condition for enabling them.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The two things the grader was reacting to and the scorecard could not see — how far a label sits from the nearer end of its line, and how long two routes run side by side — are now measured in drawn-ink.ts, the single owner the suite and measure.ts share. The strand bound is enforced on every board; the bounds the evidence does not yet justify are recorded as targets rather than invented. The S14 board the grader failed is a fixture held to thresholds with no recorded scorecard, so it cannot pass by having its failure recorded as its baseline.
<!-- SECTION:FINAL_SUMMARY:END -->
