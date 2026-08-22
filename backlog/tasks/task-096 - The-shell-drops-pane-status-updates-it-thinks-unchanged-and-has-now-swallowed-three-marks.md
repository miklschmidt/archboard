---
id: TASK-096
title: >-
  The shell drops pane status updates it thinks unchanged, and has now swallowed
  three marks
status: To Do
assignee: []
created_date: '2026-08-22 17:47'
labels: []
dependencies: []
references:
  - frontend/src/shell/Shell.tsx
  - frontend/src/shell/BoardBar.tsx
priority: high
type: bug
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three separate features have hit this, each finding it only because a real browser check caught the mark that never appeared.

The shell compares an arriving pane status against the one it holds and discards the update when nothing it compares has moved. The comparison does not know about marks added since it was written, so each new one is invisible until somebody extends it.

Casualties so far:

- TASK-079's held-board mark. Its own comment records the first sighting.
- TASK-062's note-written-elsewhere mark. The server detected the foreign write, the pane set its ref, the bar never changed. Its author noted a note somebody else wrote is the only thing that moves about a pane when it happens.
- TASK-095's doing line. The bar showed the line before last.

Three times is a design fault rather than three oversights. Every one was caught by a browser check and none by a socket check, because the bug is between the pane's state and what is painted.

The fix is not a fourth field in the comparison. It is either comparing the whole status, or a rule that makes forgetting impossible — the middleware pattern TASK-095 used at the write boundary is the same shape of answer: one place that cannot be bypassed by whatever is added next.

Worth checking whether the same comparison guards anything else.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pane status that differs in any field reaches the bar, including fields added after the comparison was written
- [ ] #2 Adding a new mark to the bar requires no change to the comparison, or fails loudly if it does
- [ ] #3 A check covers the general property rather than the three known marks
<!-- AC:END -->
