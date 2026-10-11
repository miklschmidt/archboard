---
id: TASK-460
title: Pidfile tests isolate the home before Bun starts
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-11 15:53'
labels: []
dependencies: []
type: bug
ordinal: 807000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The merged TASK-325 pidfile owner fails four cases on macOS. Its fixture changes HOME after Bun starts, but homedir still resolves the operator home. The owner can reach real server pidfiles instead of its temporary state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All four original pidfile behaviors pass with state confined to a temporary root on macOS and Linux.
- [ ] #2 The fixture refuses an unisolated state path before any write or sweep.
- [ ] #3 The complete normal gate passes with every existing assertion and timeout contract retained.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No board is affected because this repair changes only the test fixture. Supply the temporary home before starting the process that exercises pidfile behavior. Keep all four original cases and assertions. Refuse any resolved state directory outside that root. Run the focused owner, review the repair, and run the complete gate.
<!-- SECTION:PLAN:END -->
