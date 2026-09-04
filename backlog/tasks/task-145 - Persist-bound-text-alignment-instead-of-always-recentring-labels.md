---
id: TASK-145
title: Persist bound-text alignment instead of always recentring labels
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-31 18:26'
updated_date: '2026-09-04 16:03'
labels: []
dependencies: []
references:
  - src/runtime/engine/labels.ts
  - src/runtime/engine/apply-element-input.ts
priority: medium
type: bug
ordinal: 255000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agent updates can persist textAlign and verticalAlign while applyElementInput settles the bound text to the container centre. The canvas renders the label incorrectly until a person double-clicks it, at which point Excalidraw recomputes and syncs the correct coordinates. The minimal repro calls boundTextPlacement with identical text geometry and middle versus top alignment; both return the same position because labels.ts models only containerId and text.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Top- and left-aligned bound text is persisted at the same coordinates Excalidraw renders without a browser edit
- [ ] #2 Middle- and center-aligned bound text retains its current placement
- [ ] #3 A regression test covers alignment changes through the agent write boundary
- [ ] #4 The real-browser round trip reports no corrective geometry after an aligned-label write
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one focused regression to the existing engine contract owner that creates a labelled container through applyElementInput, changes its bound text to left/top through the same agent boundary, and asserts both the new Excalidraw coordinates and unchanged center/middle coordinates.
2. Make boundTextPlacement use Excalidraw 0.18.1 container coordinates, usable width/height, and alignment rules for non-linear containers while keeping the existing linear midpoint placement.
3. Treat bound-text alignment updates as placement changes so applyElementInput settles them in the same write.
4. Run the focused engine owner, the single exact real-browser fixed-point owner for aligned labels if available, type checking, scoped lint/format, the frontend build, diff inspection, and cleanup checks.
5. Commit a clean review-ready range and report READY_FOR_REVIEW to the parent without finalizing TASK-145.

6. Address the standards review with one two-row boundTextPlacement table: ellipse left/top and diamond right/bottom. Keep product and browser files byte-identical, then run only the focused engine owners, scoped static checks, and a fixed-range diff audit before rereview.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis: boundTextPlacement ignored textAlign and verticalAlign, so every shape label resolved to its center. Alignment-only text updates were also absent from the applyElementInput placement-change classifier, so settlement did not run.
Implementation: ported the pinned Excalidraw 0.18.1 padded inner-box rules for rectangles, ellipses, and diamonds; retained midpoint placement for linear labels; and made alignment changes trigger bound-text settlement in the same agent write. Added one focused applyElementInput regression and extended the existing fixed-point browser owner with one left/top aligned label.
Validation: focused engine owners passed, 3 tests and 72 expectations; both TypeScript projects passed; scoped Oxlint and Oxfmt passed; the focused fixed-point real-browser owner passed, 1 test and 71 expectations, with 2.84 seconds inside the owner; its adapter rebuilt the frontend and completed in 3.7 seconds. Cleanup: the browser adapter cleanup audit passed, git diff --check passed, and there are no untracked files or debug markers.

Standards review remediation: added one compact two-row table to label-placement.test.ts. The ellipse left/top row pins 134.28932188134524,219.64466094067262 and owns the curved inset branch. The diamond right/bottom row pins 375,465 and owns diamond inset, usable-size, and trailing-alignment branches. No product or browser file changed.
Remediation validation: focused label placement/input owners passed, 4 tests and 74 expectations in 56 ms; both TypeScript projects passed; scoped Oxlint and Oxfmt passed; diff check passed. The fixed-point browser owner was not rerun because this follow-up changes only a module test.
<!-- SECTION:NOTES:END -->
