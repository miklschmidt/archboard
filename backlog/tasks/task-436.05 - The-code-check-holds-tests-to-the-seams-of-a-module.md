---
id: TASK-436.05
title: The code check holds tests to the seams of a module
status: To Do
assignee: []
created_date: '2026-10-07 00:36'
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
