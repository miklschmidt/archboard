---
id: TASK-523
title: Keep the generated history clip below the attachment limit
status: In Progress
assignee:
  - '@codex'
created_date: 2026-10-24 14:33
updated_date: '2026-10-24T14:53:00Z'
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
- [ ] #1 The regenerated lossless history clip is below 10,000,000 bytes.
- [ ] #2 The history and timeline remain readable and the normal gate passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board changes: only the existing README clip output width changes. Reduce the authored output width and derive its plan text from the same value. Regenerate the history asset after the active README producer finishes. Inspect the generated clip frame and thumbnail, retain all history stops and timings, then run the full normal gate with TASK-517.

Visual inspection shows that the board now has more saved states than the timeline label spacing can hold. Keep every history dot and stop. Show the name and metadata only for the active state so labels remain readable at the reduced width, then regenerate history and inspect the active label.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The reduced lossless clip is 7,431,990 bytes. Its diagram remains readable, but current history names overlap because each stop renders a fixed 420px label. The original tracked thumbnail had six stops. The current board has more saved states. The next change limits labels to the selected stop while preserving every dot and state transition.
<!-- SECTION:NOTES:END -->
