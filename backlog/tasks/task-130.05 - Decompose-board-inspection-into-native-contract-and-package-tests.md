---
id: TASK-130.05
title: Decompose board inspection into native contract and package tests
status: To Do
assignee: []
created_date: '2026-08-28 01:03'
labels: []
dependencies:
  - TASK-130.01
  - TASK-130.04
references:
  - scripts/check-board-inspection.mjs
  - src/runtime/board-inspection
  - docs/agents/test-suite.md
parent_task_id: TASK-130
priority: high
type: task
ordinal: 140000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
check-board-inspection is 7,752 lines and combines pure snapshot safety, detector behavior, complexity ceilings, diagnostics, rendering inputs, bridge validation, package execution, CLI output, and mutation audits. It is the largest file in the repository and the main reason this migration cannot be a rename.

Split the coverage along the existing board-inspection entrypoints. Preserve authored fixtures and exact limit cases, but move each contract into a test file small enough to understand and schedule independently.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-board-inspection is replaced by typed native tests for input snapshotting, schemas, detectors, architecture facts, bridge validation, diagnostic counters, complexity ceilings, package execution, CLI output, and read-only behavior.
- [ ] #2 Tests preserve the exact 1,000,000 input-unit and 2,000,000 comparison ceilings, the 1,516,200 below-limit comparison count, deterministic finding order, strict and non-strict exits, and completed findings at the comparison stop.
- [ ] #3 Proxy, revoked-proxy, accessor, cycle, custom-prototype, sparse-array, unsafe-scalar, and large supported input cases prove the public inspector does not execute caller-owned JavaScript or mutate input.
- [ ] #4 Bridge schema-v2 cases preserve provenance validation, exact crossing suppression, unchanged architecture, compare and describe bytes, and the renderer-facing focus contract.
- [ ] #5 Package tests invoke the shipped binary with no canvas process, prove zero HTTP contacts and unchanged vault paths, bytes, and mtimes, and validate stdout through the exported schemas.
- [ ] #6 Diagnostic counters remain test-only noncontractual evidence and never enter product output.
- [ ] #7 Every test file is at most 500 lines, imports public entrypoints, and can run independently with deterministic cleanup and no shared mutable fixture state.
- [ ] #8 A focused parity matrix proves the native tests catch representative snapshot, detector, limit, bridge, CLI, and mutation regressions before the legacy script is deleted.
<!-- AC:END -->
