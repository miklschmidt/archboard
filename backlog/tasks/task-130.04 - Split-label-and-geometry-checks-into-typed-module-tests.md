---
id: TASK-130.04
title: Split label and geometry checks into typed module tests
status: To Do
assignee: []
created_date: '2026-08-28 01:03'
labels: []
dependencies:
  - TASK-130.01
references:
  - scripts/check-labels.mjs
  - scripts/check-geometry.mjs
  - src/runtime/engine/labels.ts
  - src/runtime/engine/geometry.ts
parent_task_id: TASK-130
priority: medium
type: task
ordinal: 139000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
check-labels and check-geometry mix pure transformations, malformed-input recovery, server-route behavior, and large case matrices in 3,228 lines. Split them by owning contract before conversion so no replacement test becomes another monolith.

Keep public-entrypoint tests with the owning module. Route and persisted-note cases belong in system tests only when they need a real process or HTTP boundary.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-labels and check-geometry are replaced by typed native tests grouped by public label conversion, geometry validation, malformed recovery, and route behavior.
- [ ] #2 Every current label binding, ID, normalization, z-order, malformed-geometry, finite-number, and exact-output assertion is represented by a named test through the relevant public interface.
- [ ] #3 Pure tests do not start a server; route tests use the real route boundary and prove the note or board remains unchanged on refusal.
- [ ] #4 Fixtures have explicit types or schema parsing at their input boundary, and no test relies on computed imports that erase module types.
- [ ] #5 Every test file is at most 500 lines and no replacement file receives a complexity, explicit-any, unsafe-assertion, or console exemption.
- [ ] #6 Focused parity checks demonstrate a known label and geometry regression fails both the old and new coverage before the legacy scripts are deleted.
<!-- AC:END -->
