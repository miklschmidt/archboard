---
id: TASK-143.01.13
title: Register Codex protocol conformance in root checks
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:47'
updated_date: '2026-08-30 21:53'
labels: []
dependencies:
  - TASK-143.01.03
references:
  - docs/design/desktop-app-server-sharing-research.md
modified_files:
  - package.json
  - bun.lock
  - tests/system/repository-policy/codex-protocol-conformance.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 240000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the serialized root dependency/check seam for @openai/codex 0.151.0 and protocol conformance. Generation always occurs in a disposable directory and compares without modifying the checkout.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 package.json and bun.lock pin @openai/codex exactly 0.151.0 with frozen-install success; ranges, alternate generators, and a globally newer binary do not alter the contract.
- [ ] #2 The conformance owner locates the pinned binary, verifies version 0.151.0, generates experimental TypeScript into a fresh temp directory, compares the digest/API inventory to the checked decoder contract, and leaves git status unchanged.
- [ ] #3 Root check scripts run the conformance owner through the existing repository suite without committing generated files or creating a second build path.
- [ ] #4 Wrong/missing binary, generation failure, changed experimental type/method, decoder gap, or checkout mutation produces an actionable failure naming regeneration and review steps.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the integrated codex-protocol conformance helper and existing repository-policy/root-check ownership without changing its authored decoder contract.
2. Pin @openai/codex exactly 0.151.0 in package.json and bun.lock, prove frozen installation, and resolve the project-local executable rather than PATH or a global binary.
3. Add the repository-policy conformance owner that runs exact experimental generation in a disposable directory, verifies version/file count/digest/API inventory, keeps the checkout unchanged, and emits actionable regeneration/review failures.
4. Register the owner through the existing repository suite and root check path only, then run focused negative/positive owners, frozen install, type/lint/format, repository/module gates, and git diff/status checks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Batch reservation at integration HEAD ac86591: exact scoped ready leaves are TASK-143.01.13 and TASK-143.01.17. They are path-disjoint. Worker slots 3 and 4 are intentionally unused because no additional TASK-143/TASK-144 leaf is ready; the other ready scoped entries are parent containers and every remaining leaf is dependency-blocked. TASK-141 and TASK-142 are unrelated CI-restoration bugs outside this implementation scope.
<!-- SECTION:NOTES:END -->
