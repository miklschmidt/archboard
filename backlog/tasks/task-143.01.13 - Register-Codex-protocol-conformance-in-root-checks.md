---
id: TASK-143.01.13
title: Register Codex protocol conformance in root checks
status: To Do
assignee: []
created_date: '2026-08-30 15:47'
updated_date: '2026-08-30 16:25'
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
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 package.json and bun.lock pin @openai/codex exactly 0.151.0 with frozen-install success; ranges, alternate generators, and a globally newer binary do not alter the contract.
- [ ] #2 The conformance owner locates the pinned binary, verifies version 0.151.0, generates experimental TypeScript into a fresh temp directory, compares the digest/API inventory to the checked decoder contract, and leaves git status unchanged.
- [ ] #3 Root check scripts run the conformance owner through the existing repository suite without committing generated files or creating a second build path.
- [ ] #4 Wrong/missing binary, generation failure, changed experimental type/method, decoder gap, or checkout mutation produces an actionable failure naming regeneration and review steps.
<!-- AC:END -->
