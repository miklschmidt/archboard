---
id: TASK-150.03
title: 'Build fresh dialogs, forms and actionable feedback'
status: To Do
assignee:
  - '@codex'
created_date: '2026-09-05 00:08'
updated_date: '2026-09-05 01:24'
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
Duplicated dialogs, controls and feedback styles make recovery behavior and accessibility inconsistent. Replace them with the established official shared component family after the foundation is proven. All grunt UI work and verification must run in visible gpt-6-astra tasks with low reasoning. Do not start an independent reviewer loop until every TASK-150 implementation child reports complete.

Runs after the fresh shell in TASK-150.04. Build new official shadcn compositions using typed values, validation/error/busy state and callbacks grounded in actual product contracts. Old UI code is only a local ignored reference and is never imported or committed. Implement navigation and recovery presentation here. Archived logic copying and product-action wiring belong to TASK-150.07, and browser execution to TASK-150.06; no old dialog wrappers or styling are copied back.

Browser-test execution is deferred to TASK-150.06 after all rebuild tasks report ready. Do not run browser suites, individual browser tests, browser smoke tests or aggregate commands that invoke them in this task. Continue strict lint/type checks and appropriate non-browser checks. Existing browser tests must not dictate the new UI. Any proposed browser-test replacement, behavioral/interaction rewrite, deletion or transfer to another test owner requires prior case-by-case approval by the orchestrating Astra agent, with the protected product contract and replacement evidence recorded. This is not a worker self-approval or an interim independent review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Board open, create, save-as, confirmation, external-change recovery, library installation, opener settings and agent settings use official shared Dialog or AlertDialog compositions and appropriate shared fields, inputs, choices and buttons.
- [ ] #2 Dialog compositions represent the required recovery choices, supplied validation/busy/submission/error state, accessible names and official focus/Escape/keyboard behavior. Actual product validation, submission and recovery logic is copied and connected in TASK-150.07.
- [ ] #3 Persistent actionable notices use a durable Alert-style presentation, and transient feedback is limited to messages whose loss cannot remove a recovery action.
- [ ] #4 The retired shell/Modal.tsx, old ui/dialog and ui/button implementations, compatibility re-exports and old selector families are absent from active source and imports; new controls are actual official shadcn compositions.
- [ ] #5 Success, invalid-input, busy, error and recovery presentation is implemented and passes strict plus appropriate non-browser checks. Product actions are integrated in TASK-150.07. Browser verification of focus, portals and complete workflows belongs to TASK-150.06.
<!-- AC:END -->
