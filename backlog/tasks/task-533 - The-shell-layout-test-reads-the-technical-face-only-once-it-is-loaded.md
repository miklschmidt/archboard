---
id: TASK-533
title: The shell layout test reads the technical face only once it is loaded
status: To Do
assignee: []
created_date: '2026-10-25T03:59:00Z'
labels:
  - test
  - flaky
  - browser
dependencies: []
priority: medium
ordinal: 929000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/system/browser/shell-layout.test.ts "the desktop shell keeps its visual contract across the canonical render matrix" failed twice in CI on 2026-10-25, on layers of the TASK-526 stack that change nothing in the frontend (PR #6 and PR #8), and passed when run again. Both times the sixth font check, document.fonts.check for 500 10px "Archboard DM Mono", was false. The matrix already awaits document.fonts.load for both DM Mono weights and document.fonts.ready before it probes (tests/system/browser/support/shell-render-matrix.ts), so a plain missing wait is not the cause. A flaky owner teaches people to re-run CI instead of reading a failure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The cause of the false DM Mono 500 check is found and named in the task notes, with evidence
- [ ] #2 The test fails when a declared shell face does not load from this server, and does not fail while that face is loading
- [ ] #3 The test passes in at least 20 consecutive local runs of the browser owner
<!-- AC:END -->
