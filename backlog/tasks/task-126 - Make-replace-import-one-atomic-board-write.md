---
id: TASK-126
title: Make replace import one atomic board write
status: To Do
assignee: []
created_date: '2026-08-26 07:06'
labels:
  - enhancement
dependencies: []
references:
  - TASK-123.01
  - TASK-068
  - src/runtime/engine/scene-document.ts
  - scripts/check-one-write.mjs
ordinal: 131000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace import currently performs a clear followed by a batch insert through the current scene-document owner. That exposes two content writes for one requested import act and permits an observable empty-board gap. Deliver a single atomic scene replacement at the scene-document write boundary. This is tracking work discovered by the TASK-123.01 workflow audit; do not implement it as part of TASK-123.01.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A replace import performs exactly one board content write, as asserted by the one-write test harness.
- [ ] #2 No caller or connected browser can observe a cleared-board gap between replacement phases.
- [ ] #3 The atomic path preserves input conversion, required doing narration, claim enforcement, board-version conflicts, optimistic note-conflict refusal, and the one-requested-act/one-write rule.
<!-- AC:END -->
