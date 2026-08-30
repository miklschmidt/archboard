---
id: TASK-143.01.18
title: Enforce generated Codex protocol ownership
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 16:25'
updated_date: '2026-08-30 22:43'
labels: []
dependencies:
  - TASK-143.01.03
  - TASK-143.01.12
  - TASK-143.01.13
references:
  - docs/agents/boundaries.md
modified_files:
  - tests/system/repository-policy/codex-protocol-boundary.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 248000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own one repository-policy rule that makes generated Codex 0.151.0 bindings reachable only through the codex-protocol entrypoint. It prevents consumers from coupling to generated layout or bypassing runtime decoders. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Generated files may exist only in the ignored codex-protocol generated directory and may be imported only by the codex-protocol adapter.
- [ ] #2 Runtime, server, UI, scripts, and tests outside the conformance owner fail with an actionable path when they deep-import or commit a generated binding.
- [ ] #3 The policy permits the temp-directory generator/compare owner and fixtures without permitting a second generated tree or a handwritten mirror.
- [ ] #4 The test is registered in the existing repository inventory and fails on the pre-policy forbidden fixture.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the generated protocol ignore rules, codex-protocol public boundary, exact conformance owner, repository inventory, and existing boundary policies without changing production decoders or generation behavior.
2. Add one repository-policy owner that permits generated bindings only beneath the ignored codex-protocol/generated directory and permits access only from the adapter/conformance owners with explicit reasons.
3. Add deterministic forbidden fixtures for committed generated output, generated trees elsewhere, external deep imports, handwritten mirrors, and test/script/UI/server bypasses while retaining the one disposable generator/compare path.
4. Register through the existing repository lane and run focused positive/negative probes, repository/module gates, both TypeScript projects, lint, format, diff, and clean-status checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Batch reservation at integration HEAD 7023de7: exact newly ready scoped leaves are TASK-143.01.18 and TASK-144.01. They are path-disjoint: one repository-policy owner versus the serialized package/lock seam. TASK-143.01.16 remains an active timing remediation and TASK-143.01.07 is in read-only review, so three leaf-worker slots are occupied after dispatch. Slot 4 is intentionally unused because no other TASK-143/TASK-144 leaf is ready; other scoped entries are parent containers or dependency-blocked, and TASK-141/TASK-142 are unrelated CI-restoration bugs.
<!-- SECTION:NOTES:END -->
