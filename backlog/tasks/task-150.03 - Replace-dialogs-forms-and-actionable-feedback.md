---
id: TASK-150.03
title: 'Build fresh dialogs, forms and actionable feedback'
status: To Do
assignee: []
created_date: '2026-09-05 00:08'
updated_date: '2026-09-05 13:58'
labels: []
dependencies:
  - TASK-150.04
references:
  - TASK-150
parent_task_id: TASK-150
priority: high
type: task
ordinal: 293000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Duplicated dialogs, controls and feedback styles make recovery behavior and accessibility inconsistent. Replace them with the established official shared component family after the foundation is proven.  Do not start an independent reviewer loop until every TASK-150 implementation child reports complete.

Runs after the fresh shell in TASK-150.04. Build new official shadcn compositions using typed values, validation/error/busy state and callbacks grounded in actual product contracts. Old UI code is only a local ignored reference and is never imported or committed. Implement navigation and recovery presentation here. Archived logic copying and product-action wiring belong to TASK-150.07, and browser execution to TASK-150.06; no old dialog wrappers or styling are copied back.

Browser-test execution is deferred to TASK-150.06 after all rebuild tasks report ready. Do not run browser suites, individual browser tests, browser smoke tests or aggregate commands that invoke them in this task. Continue strict lint/type checks and appropriate non-browser checks. Existing browser tests must not dictate the new UI. Any proposed browser-test replacement, behavioral/interaction rewrite, deletion or transfer to another test owner requires prior case-by-case approval by the implementation coordinator, with the protected product contract and replacement evidence recorded. This is not a worker self-approval or an interim independent review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Board open, create, save-as, confirmation, external-change recovery, library installation, opener settings and agent settings use official shared Dialog or AlertDialog compositions and appropriate shared fields, inputs, choices and buttons.
- [ ] #2 Dialog compositions represent the required recovery choices, supplied validation/busy/submission/error state, accessible names and official focus/Escape/keyboard behavior. Actual product validation, submission and recovery logic is copied and connected in TASK-150.07.
- [ ] #3 Persistent actionable notices use a durable Alert-style presentation, and transient feedback is limited to messages whose loss cannot remove a recovery action.
- [ ] #4 The retired shell/Modal.tsx, old ui/dialog and ui/button implementations, compatibility re-exports and old selector families are absent from active source and imports; new controls are actual official shadcn compositions.
- [ ] #5 Success, invalid-input, busy, error and recovery presentation is implemented and passes strict plus appropriate non-browser checks. Product actions are integrated in TASK-150.07. Browser verification of focus, portals and complete workflows belongs to TASK-150.06.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
4. Build fresh dialogs, forms and actionable feedback. TASK-150.03.
Depends on TASK-150.04. coordinator UI workers.
Use official Dialog and AlertDialog compositions for board open/create/save-as, confirmation, external-change recovery and library installation; Field, Input, Select or Combobox and Button for their fields and choices. Migrate opener and agent settings to the same family. Preserve exact recovery choices, validation, busy state, focus and submission behavior. Use Alert for persistent actionable notices; only use transient feedback where losing the message does not lose a recovery action.
Build official component compositions with typed values, validation/busy/error presentation and action callbacks based on known product contracts. Real validation and recovery logic is ported and connected in TASK-150.07. The old shell/Modal.tsx, ui/dialog, ui/button and their selector families were retired at quarantine; none may be copied back, wrapped or re-exported.
Exit: dialog presentation, official component interaction handling, accessible names and supplied validation/busy/error states are implemented; strict and appropriate non-browser checks pass. Product actions and recovery are integrated in TASK-150.07. Old dialog/form selectors have no consumers. Actual browser workflow verification waits for TASK-150.06.

Current execution constraints: preserve all completed corrections and the user's test deletions. Do not restore deleted tests or add repository-policy suites, configuration snapshots, dependency/version mirrors, tests of upstream tooling, or tests of test helpers. Use the existing lint/compiler commands and meaningful existing product checks. New strict lint adoption is limited to src/ui; remaining non-UI adoption is TASK-151. UI uses the existing root TypeScript project; do not create src/ui/tsconfig.json. Run analysis sequentially and keep the repository project guard on all lint/fix paths. No callbacks to previous tasks, fixed agent assignments, or extra interim review loops.
<!-- SECTION:PLAN:END -->
