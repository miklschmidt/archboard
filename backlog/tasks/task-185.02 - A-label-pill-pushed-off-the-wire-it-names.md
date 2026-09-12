---
id: TASK-185.02
title: A label pill pushed off the wire it names
status: Done
assignee:
  - '@claude'
created_date: '2026-09-12 18:26'
updated_date: '2026-09-12 19:31'
labels: []
dependencies: []
parent_task_id: TASK-185
type: bug
ordinal: 344000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On the motion-clock board's 'Two exchanges' variant, Pane and Routes are wired both ways and both relationships are labelled. The two routes are snapped into line fifteen units apart, and the band between the cards is forty-eight units deep. The first pill takes the middle of that band; the second has nowhere left on its own line that clears the first pill and both cards, so the settler steps it aside and it ends up forty units clear of the blue line it belongs to. The gap's depth is budgeted for the lines crossing it and not for the pills they carry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A runtime invariant over the actual render path holds every label pill against the route it names, on real boards and on a fixture reproducing the reported pair
- [x] #2 The gap a labelled route crosses is budgeted for the pills that ride it, so the pills settle on their own lines rather than beside them
- [x] #3 Pills still clear one another, the cards and the band headers
- [x] #4 The reported motion-clock case is fixed and QA'd visibly
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the reported pair on the actual render path: read each pill's rect and its own route's path out of the drawn SVG and measure the distance between them, over every board of an isolated vault and over fixtures of the reported shape.
2. Read the settler and the gap budget: why the second pill has nowhere on its line, and which allocation decides the room.
3. Teach the router's congestion pass to count the pills a gap carries, not only the lines: a labelled route crossing one gap straight through has its pill stacked in that gap's depth, so the depth must hold them.
4. Leave the settler alone — a pill still prefers the middle of its own run — and let the extra room come from the layout, which is what the infinite canvas is for.
5. Own it: every pill on its own route, no pill over another pill or a card, on the reported pair, on three crossings of one gap and on a crowded architecture, both themes; and assert the fixture really is the crowded shape.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis on the actual render path: of 79 pills across the demo vault's architecture variants exactly one was off its line — motion-clock 'Two exchanges', the relationship labelled 'the drawing', 39.7 units clear of the route it names, which is the reported screenshot.

Why: Pane and Routes are wired both ways, both ways labelled, their ports snapped 15 apart, and the band between the cards is 48 deep. 'asks' settles first and takes the middle of its run. For 'the drawing' every position on its own line is then blocked by that pill (17 either side of the middle) or by the cards above and below (a pill keeps its clearance off them), so the union covers the run end to end, the settler falls through to stepping aside, and the pill lands a pill-width to the right. The gap's depth was budgeted for the two lines crossing it and for no pill at all.

Fix, in the router: channelTraffic now also counts, per gap, the labelled routes that cross it straight through — one gap, opposed faces — and congestion's widthNeeded takes the greater of the line budget and what those pills need, which is a pill and its clearance per route plus the clearance from the cards, measured as the one-sided stack the settler actually builds. The settler is untouched: no pill is moved off its wire to make room.

After: 0 of 158 pills (both themes) off their line across every architecture variant of the vault, and the three reproducing fixtures all attach. Cost: motion-clock's band grew from 50 to 53, the page from 428x372 to 428x375; no other demo board changed.

Data-flow is a separate convention and was not touched: its messages draw no turns at all, and a message's words ride a constant five units above their own line by that grammar's design — measured, unchanged, all 114 of them.

Red proof: with congestion.ts and edges.ts reverted, 'drawing sits 39.7 off its line' and 'delta sits 34.3 off its line'.

Review finding addressed: own-route intersection alone was not enough. The pill sat on its line but spanned the neighbour's line too, so the words named both relationships as far as a reader could tell, and the two arrows were as close as ever.

Second fix, in the port allocator: a face spreads its ports on a pitch wide enough for the words its routes carry. A labelled route that crosses a gap straight through now asks its face for half its own pill plus the pill clearance, and assignFace takes the widest such claim instead of the fixed PORT_PITCH. So a pill centred on its own run stops short of every neighbouring run. pillSize moved to lib/layout/pill.ts, shared with the label pass, together with the crossing test and the reach; sideAxis and opposedSide moved to lib/geometry.ts, which kept tracks.ts under its line limit.

Measured on the reported pair: the two ports stood 15 apart and now stand 39.7 — half the wider pill (37.7) plus the clearance — with 'the drawing' spanning 196.15..271.55 on its line at 233.85 and clear of 'asks' at 194.15. Costs nothing in page size: ports move along a face that already had the room. Every earlier measurement still holds: 294 renders, no square turn, minimum radius 8, all 158 pills on their own line.

Red proof, with only the pitch reverted to PORT_PITCH: 'asks over drawing', 'drawing over asks', 'reads over dep', and the port-separation assertion fails with it.

Known limit, distinct from the reported class: a pill can still lie across a route that crosses its own run perpendicularly — one case in the vault, 'fsync' on archboard/pipeline, where an unrelated vertical route passes behind a pill centred on its own horizontal run. Ownership there is not ambiguous (the pill is centred on its line and the other route is perpendicular), and the settler treats routes as obstacles nowhere; not fixed, and not covered by a test. Where three labelled routes cross one gap, snapRoute can also pull one port off the label-aware pitch; the fixture shows it and no assertion claims otherwise.

Test changes asked for by review: the <=20 port-spacing assertion is gone — it locked in the complaint — replaced by a lower bound measured from the drawn pills (separation >= half the wider pill). Added: neither pill of the reported pair lies across the other's line, in both themes. Commentary in the new production and test code cut back to the invariant and its reason.

Second review pass: three findings, all addressed.

1. THREE_WAYS really did still mask parallel wires, and the cause was the one the reviewer named: snapRoute pulled a snappable pair's ports to the mean of the two, straight through the label-aware pitch the allocator had just set. The snap now keeps every neighbour's room — it takes the position nearest the mean that stands at least the required reach from every other port on both faces, and leaves the ports where they were allocated when no such position exists. Measured on the fixture: 'settled' moved from 223.93 to 288, and none of the three pills lies across a wire it does not name. Moved into lib/layout/snap.ts, which also kept tracks.ts inside its line limit.

2. The arrowhead was real too: a pill's centre kept the card clearance (9.5) but its edge then stood two units off the card face, inside the 7.5 the head covers. The label pass now reserves the head zone at each end of a run that ends the route, and the gap budget carries that reserve, so a gap with two labelled crossings is 68 deep rather than 53. The pair's upward head is fully visible, measured and photographed.

3. pillReach was half the pill's width on every face. It is now half the pill measured along the axis the ports spread on — width on a top or bottom face, height on a left or right one, where the pill lies the other way round.

Also in the label pass: a pill now prefers a position that keeps off every other route's line, falling back to its own line over somebody else's wire only when no such position exists, and never to standing off its own line. Across the vault that took pill-over-unrelated-wire from 4 to 0, with all 158 pills still on their own lines.

Costs: motion-clock 428x375 -> 428x390; no other board changed; the port and snap work costs nothing.

Red proofs, each against the exact pre-fix line: snapTo reduced to the clamped mean gives 'lease over settled', 'lease over delta', 'delta over settled'; the gap budget without its head reserve pushes 'the drawing' off its line; with neither the reserve nor the budget, PAIRED and motion-clock mask their own heads, which is what the reviewer saw.

Still true, and stated rather than tested: a pill can lie across a parallel run when the two travel a corridor rather than crossing a gap (the CROWDED fixture: five such coverings before this work, four now) and a label wider than the run it names still overlaps its own head on two demo variants ('rename' on a 58-unit run with a 48-unit label). Both are pre-existing and neither is the reported pair.

Third review pass — two correctness issues in the new code, both fixed, neither reachable in output.

1. snapNeighbours read a face index built once before the loop, then mutated the ports inside it, so a later snap could measure against a port's old position and land inside a neighbour's reach. The index is now built inside snapRoute, per snap, from the live ports: the simplest thing that is in step by construction. Snaps do move ports on real boards (nqJfLUCG 533/624 -> 578.5 on archboard/pipeline, P64KiwMS, 4DB7NWa3, THREE_WAYS' settled 214/233.8 -> 288), so the bug was real, not theoretical.

2. labels.runEnds asked only whether an endpoint shared the run's along coordinate, which is true of every L- and Z-shaped route's far end, so head room could be reserved in the middle of an interior run for a head that is not there. It now requires the endpoint to lie on the run's own line — the cross coordinate as well.

No runtime repro found for either, and so no test added for them. What was searched, with each bug reintroduced one at a time and the drawn output diffed byte for byte: 140 generated shapes (two seeded sweeps, 2-4 and 3-6 cards, labelled and unlabelled edges, the second with containers), eight hand-built shapes aimed at the conjunction each bug needs (two snappable pairs sharing a face, a pair with company on one face only, container-to-card crossings, three crossings of one gap, trunked siblings), and every variant of the vault in both themes. Identical in every case. The reason the first is hard to reach is that allocatePorts gives a snappable pair the same offset on both faces, so the mean is usually where the ports already are; the second needs an interior longest run whose midpoint is blocked as well as an endpoint sharing its along coordinate. Both are fixed on the invariant, not on a red test, and this note is the evidence that no honest red test exists yet.

Two coverings found while hunting, both outside the reported class and both pre-existing: labelled anti-parallel routes that travel a corridor rather than crossing a gap (no gap to widen, since the pills ride along-gap runs), and two labelled branches of one stem, which share a departure port by design.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A label now belongs to one line visibly, through four changes in the router and the label pass: a face spreads its ports on a pitch wide enough for the words its routes carry (half the pill measured along the axis the ports spread on, plus clearance); a snap never pulls a port inside a neighbour's reach, and reads the ports as they stand at that moment; the gap a labelled route crosses is budgeted for the pills that ride it, arrowheads included; and a pill prefers a position clear of every other route's line, falling back to its own line over another wire only when no such position exists, never to standing off its own line.

Verified on the drawn page, not through the settler. Across every architecture variant of an isolated demo vault in both themes: 158 pills, all on the line they name, none across a line they do not, where before one sat 39.7 units clear of its own wire and four lay across a neighbour's. On the fixtures: the reported pair's two ports moved from 15 to 39.7 apart with both arrowheads fully visible, and three crossings of one gap come out with no pill over another's wire. Owned by route-labels.test.ts (attachment, covering, arrowhead clearance, pill-and-card overlap, and the port separation measured from the drawn pills), each assertion proven red against the exact line that fixes it. Visible QA in Chrome on motion-clock in both themes by the parent's reviewer. Cost: motion-clock 428x368 -> 428x390; no other board changed.

Scope of the claim: what is verified is the reported pair, three labelled crossings of one gap, a crowded architecture, and every board of the vault — not every arrangement a board can hold. Two limits remain, both pre-existing and both stated in the notes: labelled anti-parallel routes that travel a corridor rather than crossing a gap can still have a pill over the other's line (their pills ride along-gap runs, so there is no gap to widen), and a label wider than the run it names still overlaps its own arrowhead, as 'rename' does on a 58-unit run with a 48-unit label. Two latent faults found in review were fixed without a test, because 140 generated shapes, eight hand-built ones and all 32 vault renders drew identically with each fault reintroduced.
<!-- SECTION:FINAL_SUMMARY:END -->
