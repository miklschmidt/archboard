---
id: TASK-521
title: Restore extraction metadata and formatting checks
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24 13:53'
updated_date: '2026-10-24 13:54'
labels: []
dependencies: []
references:
  - /tmp/task517.02-check.log
  - /tmp/task517.02-test-repository.log
priority: high
type: chore
ordinal: 931000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TASK-517.02 complete gate stopped on routing.ts formatting. The repository lane also found three README asset source entries that still name the removed workbench realtime directory. These failures block acceptance of the shared package.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The changed routing source passes the existing formatter.
- [ ] #2 README asset sources name canonical files and the existing repository owner passes.
- [ ] #3 The repaired complete gate passes before this task closes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected: the source owner move is already drawn by TASK-517. This repair changes formatting and asset-source metadata only. Format the reported routing file, update the three asset inputs to the canonical realtime owner, run the existing repository owner, and require the repaired complete gate before closure.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Formatted the reported routing file. Updated the three removed realtime source paths and added the extracted shared/UI owners beside retained integration sources. Narrated assets also track the moved core realtime and instruction rules. Existing generation hashes remain untouched, so readme:check can still identify stale output. The README manifest owner passes all 14 cases and focused formatting passes. Complete gate remains pending TASK-522 repair.
<!-- SECTION:NOTES:END -->
