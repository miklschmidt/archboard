---
id: TASK-523
title: Keep the generated history clip below the attachment limit
status: Done
assignee:
  - '@codex'
created_date: 2026-10-24 14:33
updated_date: '2026-10-24T15:08:00Z'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 933000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TASK-517 README refresh generated history.webp at 11,957 KB. GitHub accepts images below 10 MB, so the existing clip cannot be attached. Preserve lossless frames and the full history sequence while reducing its output width.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The regenerated lossless history clip is below 10,000,000 bytes.
- [x] #2 The history and timeline remain readable and the normal gate passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board changes: only the existing README clip output width changes. Reduce the authored output width and derive its plan text from the same value. Regenerate the history asset after the active README producer finishes. Inspect the generated clip frame and thumbnail, retain all history stops and timings, then run the full normal gate with TASK-517.

Visual inspection shows that the board now has more saved states than the timeline label spacing can hold. Keep every history dot and stop. Show the name and metadata only for the active state so labels remain readable at the reduced width, then regenerate history and inspect the active label.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The reduced lossless clip is 7,431,990 bytes. Its diagram remains readable, but current history names overlap because each stop renders a fixed 420px label. The original tracked thumbnail had six stops. The current board has more saved states. The next change limits labels to the selected stop while preserving every dot and state transition.

Parent browser QA at 1440x180 supplies fourteen history stops. All fourteen dots remain, and exactly one name is visible. The active name, date, and reason fit without overlap. Screenshot: /tmp/task523-timeline-qa.png. The real history producer is running before final clip inspection.

Final lossless history.webp is 7,413,180 bytes. Parent inspected the regenerated thumbnail and the separate fourteen-state browser sample. Active metadata is readable, every dot remains, and the real producer exits 0. The complete 13-stage gate at 33aa81f0f exits 0 with 5,378 passes and one skip.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reduced the lossless history output to 960 pixels and display metadata only for the active history state. The clip fits the 10 MB attachment limit and keeps every saved state and timing. Generation, browser inspection, and the complete normal gate pass. The clip stays local until the owner publishes it.
<!-- SECTION:FINAL_SUMMARY:END -->
