---
id: TASK-226
title: Investigate card distribution and corridor routing on wide boards
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 12:17'
updated_date: '2026-09-15 13:11'
labels:
  - renderer
dependencies: []
references:
  - .skill-evals/2026-09-15T03-21-37-188Z/report.md
  - src/runtime/semantic-renderer/lib/layout
  - src/runtime/semantic-renderer/tests/skipped-connections.test.ts
priority: medium
type: bug
ordinal: 386000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board of about fifteen cards and thirty labelled relationships (the broad-mapping scenario S14, a Flask module map) comes out with cards spread over a very wide canvas, large empty regions, and edges that spend most of their length in long parallel corridors along the margins with labels far from both endpoints. The grader scored readability 5.3 to 6 on these boards while endpoints and legibility were fine, so the loss is in distribution and routing rather than in any one defect. Three captures from the skill-evaluation batch .skill-evals/2026-09-15T03-21-37-188Z show three faces of it, all from the same renderer on similar boards. Run 3 (.skill-evals/2026-09-15T03-21-37-188Z/runs/candidate/S14/3/captures/capture-0-flask.png, 3882 by 1852): WSGI application sits at the top and six of its relationships leave from its left side into separate vertical corridors down the left margin (the skip-row rule that sends a forward skip out of the source's left flank, see tests/skipped-connections.test.ts), so most of the canvas width is corridor and label boxes such as save_session and WSGI and response primitives sit in empty space; several of those labels could sit on a horizontal segment near an endpoint. Run 1 (.skill-evals/2026-09-15T03-21-37-188Z/runs/candidate/S14/1/captures/capture-0-flask.png, 3231 by 1981): six cards are pushed to the far left of the canvas with nothing between them and the rest, and a dotted dependency edge runs the entire left margin from top to bottom. Run 2 (.skill-evals/2026-09-15T03-21-37-188Z/runs/candidate/S14/2/captures/capture-0-flask.png, 2717 by 2016): the upper right quarter and the middle left are empty while the centre is dense. The cause is not known and there may be more than one (rank assignment on a hub node with many outgoing skips, corridor allocation giving every skip its own lane, label placement choosing the longest segment, compaction leaving rank gaps), and a fix for one could worsen another, so this task is a measured investigation first: reproduce with a fixture of that shape, attribute each symptom to a layout stage, and record the findings under docs/design/ before proposing fixes as follow-up tasks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A fixture reproduces the three symptoms (hub with many left-exiting skips, a detached column of cards, large empty regions) on a board of about fifteen cards and thirty edges, and a measured investigation under docs/design/ names the layout stage responsible for each with numbers (canvas area used by cards, corridor count per hub, label distance from the nearer endpoint)
- [x] #2 Each attributed cause has a follow-up task with acceptance criteria stated as measurements on that fixture, or a recorded reason it should not be changed
- [x] #3 No renderer behaviour changes in this task
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixtures: docs/design/wide-board-layout-fixtures/flask-map-{1,2,3}.content.json (the three candidate S14 boards' current variant content) with measure.ts beside them (page size, rows, card coverage, cells touched, west exits per card, margin-corridor ink share, label distance to the nearer endpoint), run from the repository root with a mode. Note: docs/design/wide-board-layout.md with a 15-row table over baseline, network-simplex layering, post-compaction, skip-as-descent (a temporary local change, not in the tree) and the combination. Attribution: corridors and the six-edge hub are the west-flank skip rule (19% to 33% of ink; 0% to 2% with descents); detached cards and empty regions are LONGEST_PATH_SOURCE layering plus node placement (9 rows for 15 cards, cards on 7% to 10% of the page; 29% of cells touched with the combination); far labels are the longest-clear-run choice in label-runs.ts (median 233 to 335 px). Follow-ups TASK-231 (skip by column), TASK-232 (label nearest endpoint), TASK-233 (layering and compaction) carry measurement ACs on these fixtures. No renderer behaviour changed for this task; the TASK-224/225 fixes were verified not to alter these numbers' causes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Three faces of the wide-board problem are reproduced on tracked fixtures, measured under four layout experiments, and attributed to the skip rule, layering and placement, and the label pass, each with a follow-up task whose acceptance is a measurement on the same fixtures.
<!-- SECTION:FINAL_SUMMARY:END -->
