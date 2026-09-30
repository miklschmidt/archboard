---
id: TASK-256.10
title: A map nobody can read at a glance earns a view
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 17:40'
updated_date: '2026-09-17 19:45'
labels: []
dependencies: []
references:
  - skills/archboard/references/create-architecture.md
  - .skill-evals/2026-09-17T16-31-08-093Z/report.md
parent_task_id: TASK-256
ordinal: 460000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The rule this task was written to add already exists. create-architecture.md:75-79 says: "A board nobody can follow whole (a dozen or more parts, routes crossing the page) gets a board `view` per reading a person will want (one container's internals, one path, the parts one concern touches); a view is the answer to a tangle, never a smaller or falser board." It is candidate-only — the frozen baseline has no such sentence — so it arrived with the TASK-253 batch. It carries the threshold, the obligation, the scoping hint and a guard against the wrong fix.

It did not fire. All six S14 runs are 18 to 20 parts, 50 to 67 percent past the rule's own threshold, and only candidate r2 authored views; the grader listed the missing view as a missed row on four runs. The rule sits at the tail of step 4's check paragraph — after the write, after the render — in 15 lines of chained clauses that also cover labels, clipping, arrow endpoints, flows and where to put temporary files. The same shape shows up in create-sequence.md step 1, which grew from 7 lines to 16 and whose `repeat` sentence also stopped firing (TASK-256.06). So this is a placement problem, and another sentence appended to the same paragraph is the one fix most likely to fail the same way.

Candidate r2 shows the loop that works and the scoping that does not. It wrote the board (20 parts, no views), rendered it, read width and height back from the render answer (2738x3998 — every render and rasterize returns them), then went back in a second edit and added three views. The one scoped to a path read well. The two scoped by theme did not: one left Application Code floating with no visible relationship because its only edge targets a node the view excludes, and the other selected 15 of 20 parts and rendered 2950px wide, barely a narrowing at all.

The product cannot help here: archboard check has no size diagnostic, and views.ts:62-64 states the position deliberately — "a big diagram is a thing people legitimately have, and the viewer pans and zooms (ADR 0023)". The authoring half is the only lever.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The density rule is reachable where the author decides what to write, not only in the after-the-render check paragraph
- [x] #2 The guidance scopes a view to a reading a person wants — a path, one container's internals, what one concern touches — rather than to a group by habit, and says what a view owes the parts it excludes
- [x] #3 The guidance names the size the render answer already reports as the signal that a board needs one
- [x] #4 No step of a recipe grows longer than it is today; a rule that must be reachable is placed, not appended
- [x] #5 The skill text stays about archboard's own source and passes the eval:skill check leak guard
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm the rule already exists (create-architecture.md:75-79, candidate-only) and add no second copy.
2. Move it off the tail of step 4's check paragraph and up to a doctrine paragraph between the recipe's opening line and step 1, where the author is still deciding what to write and before any step runs.
3. Keep the threshold and the guard, and add the two things the r2 run got wrong: scope a view to the reading, not to a group already at hand, and keep what it selects joined (a part whose only relationship points outside the selection is drawn unattached).
4. Leave the render-time trigger where the answer is in hand: step 4's 'open the picture' sentence names the `width` and `height` every render and rasterize reports, and sends a page thousands of pixels on both axes back for the views, in a second edit.
5. No step grows: step 4 loses the five-line sentence and gains two, ending shorter; steps 1 to 3 are untouched.
6. Verify: measure every step's line count before and after, confirm the render answer really carries width/height, and run `bun run eval:skill check`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Confirmed the description: the rule was already at create-architecture.md:75-79 and candidate-only. No second copy was added; the existing five lines were moved.

Moved: the density rule is now a doctrine paragraph between the recipe's opening line and step 1 (lines 7-13), where the author is deciding what to write and before any step has run. It keeps the threshold ('a dozen or more parts, routes crossing the page'), the scoping hint (one path, one container's internals, the parts one concern touches) and the guard ('a view is the answer to a tangle, never a smaller or falser board').

Added, from what candidate r2 got wrong (AC#2): 'Scope each to the reading, not to a group you already have, and keep what it selects joined: a part whose only relationship points at a part the view leaves out stands in it unattached.' The second half is the Application Code failure, and it is what node-region inclusion actually does — sequences-views-walkthroughs.md:57-59, a selection draws only the relationships among the nodes it keeps.

Kept at the render (AC#3): step 4's 'open the picture' sentence now ends '... and the `width` and `height` the answer reports small enough to take in at once. A page thousands of pixels on both axes is the tangle this recipe opens with, and a second edit adding its views is the normal loop, not a repair.' Verified the fields exist on both answers rather than trusting the task text: semantic-render.ts:37-38 and :153-154, semantic-rasterize.ts:223-224 and :252.

No threshold in pixels was invented. The signal is stated as a page thousands of pixels on both axes, which the S14 renders (2738x3998) are and the vault's and fixtures' boards are not (docs/design/layout-rules.md section 13: 683x1027 to 2566x1997, reference pane 1272x899).

Measured (AC#4): step 1 is 8 lines, step 2 is 4, step 3 is 51 — all unchanged. Step 4 went from 15 lines to 14 (the five-line sentence out, two lines of render-time trigger in, one ragged line reflowed). The file is 94 lines against 88. No payload changed, so none needed re-validating.

`bun run eval:skill check`: 'suite ok: 15 scenarios, 15 fixtures, 14 coverage parts' (AC#5); the check reads skills/archboard as the candidate arm.

Not in scope, left alone: the renderer half is TASK-256.12's, and the recipe's worked example (7 parts) is under the threshold, so it needs no `views` of its own. Whether the moved rule fires can only be answered by the next human-run batch.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The density rule that already existed at the tail of step 4's check paragraph moved to a doctrine paragraph before step 1, where the author decides what to write, and gained what candidate r2's failure showed: scope a view to the reading, not to a group you already have, and a part whose only relationship points outside the view stands in it unattached. Step 4 keeps the render-time trigger, naming the width and height the answer already reports. No step grew: 8/4/51/14 lines against 8/4/51/15. Verified in the wave-2 gate, run lane by lane because the box was too short on memory for bun run check in one process: lint, fmt:check and type-check clean, the frontend build, 3450 module tests, 163 system tests, the repository lane, and the full serial browser lane at exit 0 with no failures. The derived skills were synced with bun scripts/sync-skills.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
