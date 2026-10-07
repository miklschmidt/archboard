---
id: TASK-436.05
title: The code check holds tests to the seams of a module
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 01:04'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-436
ordinal: 699000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants the code check to make sure that code and tests have a correct structure and clean module seams. A test inside a module can use any file of that module. A test outside a module must test its seam: the names that the index file of the module exports. A use by a test is not a use of the module. At this time, the code check counts no test as a caller, and nothing reports a test outside a module that imports a file the module does not expose.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A test inside the directory of a module can import any file of that module, and the code check reports nothing for it
- [ ] #2 If a test outside a module imports a file that the module does not expose, the code check gives a warning that names the test and the file
- [ ] #3 A name that a module exposes and that only tests use gives `EXPOSED_UNUSED`
- [ ] #4 An amendment of ADR 0044 records the rule, and the archboard skill states it in portable terms
- [ ] #5 The notes count the new warnings on this repository, and each one is corrected or has its own task
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. No board is affected: Code check and Code facts keep their existing responsibilities and module boundary.
2. Read resolved imports of external test files separately from caller uses, and warn once per test/private file on every container bound to that module. Tests inside the module remain unrestricted; tests never make exposed names used.
3. Cover the warning evidence and allowed internal/root imports in the existing fast interface fixture. Amend ADR 0044 and portable authoring guidance and evidence coverage.
4. Run focused interface and skill validation, simplify, and commit with Refs: TASK-436.05. Parent integration will count and resolve repository warnings and finish board/gate evidence before acceptance.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented separate resolved private-test import scan; TEST_IMPORT_UNEXPOSED warns on every bound container even with no drawn callers. Internal tests and public entry imports are allowed. Tests remain excluded from exposed uses. Existing interface fixture covers first-import deduplication, direct deep imports of re-exported names, allowed internal/root imports, warning severity and exact evidence. Focused interface tests: 7 pass; touched implementation/test lint clean. Skill-evaluation owners: 233 pass. eval:skill check currently fails on existing candidate/baseline repo add and removeNodes leakage; parent integration will resolve metadata/prerequisites. ADR 0044 amendment and portable authoring rule recorded. Simplified scan by sharing SyntaxFacts import types and cached per-module reading. Parent will add warning count/correction evidence before acceptance; task remains In Progress.

Measured the integrated runtime before proposal adoption against the earlier runtime capture. Both passes report the same two warnings: the removed helpText anchor on Command dispatch and the new History lens decoder call on Archboard server. TASK-436.12 and TASK-436.14 proposals correct them. TASK-436.05 introduces zero TEST_IMPORT_UNEXPOSED warnings in this repository. TASK-436.15 introduces zero additional RELATIONSHIP_UNDRAWN warnings on current dogfood boards. Captures: /tmp/archboard-task436-before.json and /tmp/task436-integrated-before-code.json. Draft board audits can still expose newly drawn scopes and are handled before adoption.
<!-- SECTION:NOTES:END -->
