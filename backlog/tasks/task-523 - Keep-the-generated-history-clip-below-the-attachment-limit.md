---
id: TASK-523
title: Keep the generated history clip below the attachment limit
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24 14:33'
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
<!-- SECTION:PLAN:END -->
