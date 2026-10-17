---
id: TASK-494
title: archboard check warns when two parts bind the same symbol
status: To Do
assignee: []
created_date: '2026-10-17 10:56'
labels:
  - check
  - board-store
dependencies: []
type: feature
ordinal: 859000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The archboard skill says to link another board with drillDown on a part the board draws anyway, never duplicating its parts (skills/archboard/SKILL.md, near 'never duplicating its parts'). Nothing enforces it, and agents keep copying parts. On 2026-10-17 the agent fixing the device-trust pull-request bodies measured the Docs-Architecture-Design vault: 43 bindings are held by the live variants of two or more boards, 33 of them naming the same symbol. Three kinds: copies made so one flow can cross two boards (Endpoint Trust Sequences restates 8 bound parts each of Device Trust Control Plane and Endpoint Gateway, and the flows have drifted apart), task boards that copy the board they change (TASK-411 TLS Termination and Platform Test IIS Ingress against Platform Test Cluster), and the same code under two names ('Azure PostgreSQL' and 'Private trust PostgreSQL'; one Application Gateway drawn twice on Endpoint Gateway). A bare file can be shared correctly (one OpenTofu root applied for test and for production), so only bindings that name a symbol count, and this is a warning, never a refusal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard check warns with its own code when two distinct parts in live variants (current and draft, not historical or shelved) bind the same repository, path and symbol, on one board or on two, and the warning names both parts with their boards and variants
- [ ] #2 The same part continuing across variants of one board (same id) is not a duplicate
- [ ] #3 No warning when one of the two parts drills down to the other's board
- [ ] #4 Bindings without a symbol are never reported
- [ ] #5 Tests own each rule above and fail on the old code
- [ ] #6 Run read-only against a copy of the Docs-Architecture-Design vault, the warning finds the 33 symbol duplicates the measurement found, or the difference is explained
- [ ] #7 The archboard skill names the warning beside the drill-down rule
<!-- AC:END -->
