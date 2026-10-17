---
id: TASK-491
title: A decision's answers leave the diamond from separate points
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-17 10:38'
updated_date: '2026-10-17 12:20'
labels:
  - renderer
dependencies: []
type: bug
ordinal: 856000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A flowchart decision with two answers sends both lines out of the diamond's bottom point and splits them below it (owner screenshot of 2026-10-17: 'Which caller drives the library?' on Device Trust Control Plane, 'Enroll through the in-process Rust library'). A flowchart reads a decision by its answers leaving from different points: left and right, with the bottom for a third. Commits 1288fba17 and 3de5226c4 move each line end to the diamond's point on the side the layout made it cross; the track engine makes every answer cross the bottom, so all of them meet there. Moving the ends after layout is not enough: an answer whose label stands inside the diamond's width would double back under the diamond.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A decision with two answers draws one line from its left point and one from its right point, each leaving sideways before it turns down to its answer
- [ ] #2 A decision with three answers draws them from its left, bottom and right points
- [ ] #3 No line leaving a side point runs back under or through the diamond
- [ ] #4 A test fails on the old code when two answers leave the same point
- [ ] #5 Every flowchart view of both vaults is rendered before and after, and each changed drawing reads the same or better
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Cause: the track router bundles every line of one kind leaving one card face into one trunk with one port, so all answers share it, and flowchart-ports then moves it to the bottom point. 2. Layout: measure a decision wider than its diamond by the sideways run plus half its widest answer label, mark it pointed; ask Graphviz to stand each answer under its corner (tailport sw/s/se); before routing hold each downward answer to its own point of the box (track/points.ts) so trunks, ports, label sliding and jog moves keep it there. 3. After layout cut the box back to the diamond and draw the run out of the side point (flowchart-ports.ts fromSide). 4. Test in flowchart-shapes.test.ts for two and three answers. 5. Render every flowchart view of every variant of both vaults before/after, byte-diff, measure and look at the changed ones. 6. Record in layout-rules.md section 50 and the file heads; gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: the track router gives lines of one kind leaving one card face one shared port and trunk (channels.ts), and every flowchart line is one kind; flowchart-ports then moved that port to the bottom point. Fix in the layout: a decision is measured wider than its diamond on each side by the sideways run (2 x BEND_RADIUS) plus half its widest answer label, and marked pointed; compound-graph gives each answer a Graphviz tailport (sw / s / se by answer order) so Graphviz stands labels and steps under the corners; track/points.ts holds each downward answer to one point (leftmost by first label/card x to the left, rightmost to the right, others middle), half a label in from the box edge; held lines get their own port and trunk key, labels slide onto the point, jog moves skip them. flowchart.ts cuts the box back to the diamond and flowchart-ports fromSide draws the run out of the side point. Test: flowchart-shapes.test.ts 'a decision's answers leave it from separate points' (two and three answers; both fail on the old code). Corpus (every flowchart view of every variant): this vault 1759/1759 changed (268 distinct), work-vault snapshot 108/114 changed (87 distinct). Lines sharing a start 1017->64 and 262->10, turns 6768->5951 and 1842->1520, crossings 20->21 and 0->0. Worse: A tab session ends, A stop, A spoken instruction (+1 crossing each); A board moves to another vault ('unclaimed' runs back under the diamond round a step). 6 side answers (3 drawings) of this vault still step back under the diamond above their label. layout-rules.md section 50 records it.

Round 2 (criterion 3 and the three crossings):
- flowchart.ts lays the graph out once with no answer held to a point (inFreeOrder), asks for the points in the order Graphviz then gave the answers, and lays it out once more in the board's order when that first drawing crosses lines; the drawing that crosses fewer lines wins (pairCrossings from blocks/joins.ts). Fixes A stop and A tab session ends, where the board's order put the step that loops back on the far side.
- track/points.ts holds a decision's answers in the order (all orders tried up to 4 answers) that crosses fewest of them on the lanes and cards past their labels; label boxes are left out because boxes that share a stretch trade places. Fixes A spoken instruction becomes work.
- Of two answers, one alone whose label or step stands past the middle on the far side leaves from the bottom point ("claimed" in A board moves to another vault).
- label-runs.ts: a label on a line from a side point does not stand inward of the point; labels.ts settleOnLanes leaves it on the point. The step goes below the label. Fixes Move a board, A reveal, A board moves to another vault.
- A line into a decision is held to the middle of its top, where the flowchart draws it, so its label stands on the drawn line (a round-1 regression, e.g. A new picture, One write lands).
Corpus (1759 drawings of this vault, 114 of a fresh copy of the work vault) against main: 1482 and 42 changed (206 and 37 distinct). Original -> round 1 -> now: crossings 20 -> 21 -> 14 (work 0 -> 0 -> 0); shared starts 1017 -> 64 -> 61 (262 -> 10 -> 10); side answers back under above their label 0 -> 6 -> 0; labels off their line 246 -> 326 -> 100 (0 -> 7 -> 0, the rest enter End). One drawing measures worse (work vault, Certificate lifecycle, mac-custody: a join stands in the bottom 8 px of a card's measured box; looked at, reads fine). Tests: src/runtime/semantic-renderer/tests/flowchart-answers.test.ts (moved from flowchart-shapes.test.ts with helpers in drawn-flowchart.ts), two new tests fail on main. Rendering the corpus takes 161 s instead of 155 s. Before/after PNGs: /tmp/t491b/round2-png.
<!-- SECTION:NOTES:END -->
