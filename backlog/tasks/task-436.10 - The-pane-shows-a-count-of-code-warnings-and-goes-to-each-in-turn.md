---
id: TASK-436.10
title: The pane shows a count of code warnings and goes to each in turn
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 01:37'
labels:
  - ui
dependencies: []
parent_task_id: TASK-436
ordinal: 758000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The pane marks a subject that has a code warning with a small amber triangle. At fit, the triangle is about 3 px on the largest board (TASK-367.24), and in far view it covers the drill mark of a part that opens another board. The pane shows no count of code warnings, so a user cannot find them at fit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The pane shows the number of code warnings on the board in view
- [x] #2 From that count, the user goes to each warning in turn, and the pane moves the camera to its subject
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Affected board: Board viewer@TASK-436.10. The Render stage proposal describes the warning count and camera navigation.
1. Add a compact warning count control to the existing pane header. Read only the findings for the board, variant and version on screen.
2. Cycle findings through the existing selection and camera contracts. Show the diagram and open the whole board when a limited view hides the subject.
3. Extend the rendered stage owner to cover the count, warning-only cycle, focus, stale findings, and hidden subject recovery. Preserve keyboard access and reduced motion.
4. Simplify, run focused lint/type/format and rendered tests, inspect the full desktop surface, commit, and finalize with the integrated gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The header reads the existing remembered findings for the exact board, variant and version. A count control cycles warnings, selects their subjects and focuses the existing camera. A hidden subject opens the whole board; a zero-warning pass shows a disabled zero count. Seven rendered cases pass, including camera focus on a large board, wraparound, information exclusion, stale-version suppression and recovery from a limited view. Touched lint, frontend types and formatting pass. The simplification pass kept one private control and reused the existing camera and selection contracts. Full desktop inspection and integrated gate remain.

The browser inspection at 1920x1080 showed the count in the pane header. Activation selected Semantic board store, opened its warning details, and focused the camera on it. Seven rendered cases cover warning counts, cyclic navigation, camera movement, a hidden subject in a limited view, zero warnings, and findings from another board version. The final simplification separates the stateful navigation from a small presentation component. The complete gate passes, including the serial browser lane.

Closing footprint: base ff3834f198a92303db89f4eed5d603df7359ea5f. The restated proposal parent is TASK-436.04, Ix6kJFoQ. Render stage states matches commits 9749e92c6 and b830345f6. The containing Semantic viewer directory needs no further responsibility change. No named part lacks its source change.

Final gate: bun run check exits 0 in 436 seconds with 4,597 passing tests, including the complete serial browser lane. Lint, formatting, root and frontend types, and builds pass. The refreshed server runs sixteen boards. The delivery code pass exits 0 with zero diagnostics and zero warnings. Complete gate log: /tmp/archboard-task436-final-check-2.log. Delivery evidence: /tmp/archboard-task436-delivery-code.json.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The pane header counts current code warnings and cycles through them. Each activation selects and focuses its subject, including recovery from a limited view. Seven rendered tests, a live browser inspection and the full gate pass.
<!-- SECTION:FINAL_SUMMARY:END -->
