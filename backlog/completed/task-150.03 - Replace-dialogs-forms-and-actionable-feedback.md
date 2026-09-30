---
id: TASK-150.03
title: 'Build fresh dialogs, forms and actionable feedback'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-05 00:08'
updated_date: '2026-09-05 15:26'
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
- [x] #1 Board open, create, save-as, confirmation, external-change recovery, library installation, opener settings and agent settings use official shared Dialog or AlertDialog compositions and appropriate shared fields, inputs, choices and buttons.
- [x] #2 Dialog compositions represent the required recovery choices, supplied validation/busy/submission/error state, accessible names and official focus/Escape/keyboard behavior. Actual product validation, submission and recovery logic is copied and connected in TASK-150.07.
- [x] #3 Persistent actionable notices use a durable Alert-style presentation, and transient feedback is limited to messages whose loss cannot remove a recovery action.
- [x] #4 The retired shell/Modal.tsx, old ui/dialog and ui/button implementations, compatibility re-exports and old selector families are absent from active source and imports; new controls are actual official shadcn compositions.
- [x] #5 Success, invalid-input, busy, error and recovery presentation is implemented and passes strict plus appropriate non-browser checks. Product actions are integrated in TASK-150.07. Browser verification of focus, portals and complete workflows belongs to TASK-150.06.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Worker (2026-09-05) builds three new modules with official shadcn compositions and typed values/callbacks: src/ui/board-dialogs (BoardDialog open/create/save-as with Field/Input/Select/Combobox, ConfirmDialog, ConflictDialog with the conflict's three outcomes, NoteWrittenElsewhereDialog, InstallLibraryDialog, ActionableAlert), src/ui/opener-settings (OpenerSettingsDialog over the shared code-target Zod schemas with test/save/reset busy states), src/ui/agent-settings (AgentSettingsDialog over shared codex-browser-model account/login/thread-link/coordinator types). Pure-helper Bun tests only. Real validation/recovery logic connects in TASK-150.07; shell hosting by the coordinator.

Worker slice (dialogs): 1. src/ui/board-dialogs (BoardDialog open/create/save-as, ConfirmDialog, ConflictDialog, NoteWrittenElsewhereDialog, InstallLibraryDialog, ActionableAlert root) as official Dialog/AlertDialog compositions with typed request/outcome/issue/error/busy contracts and pure helpers in lib/. 2. src/ui/opener-settings (OpenerSettingsDialog over OpenerSettingsReply: RadioGroup selection with availability badges, custom command form validated through the shared Zod schema and isAbsoluteOrBareOpenerExecutable, Test/Save/Reset with independent busy, testResult and error Alerts). 3. src/ui/agent-settings (AgentSettingsDialog over BrowserAccount/BrowserLogin/BrowserThreadLink/BrowserThreadCandidates/BrowserSettings/BrowserCoordinator with per-section busy/error inputs and sign-in/cancel/link/unlink callbacks). 4. Bun tests for pure helpers only under each module's tests/. 5. Verify sequentially: fmt, lint (both stages), type-check, focused tests; no browser runs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dialog worker: added src/ui/board-dialogs (BoardDialog open/create/save-as, ConfirmDialog, ConflictDialog, NoteWrittenElsewhereDialog, InstallLibraryDialog, ActionableAlert root, shared dialog parts), src/ui/opener-settings (OpenerSettingsDialog over OpenerSettingsReply with shared-schema custom command check) and src/ui/agent-settings (AgentSettingsDialog over BrowserAccount/BrowserLogin/BrowserThreadLink/BrowserThreadCandidates/BrowserSettings/BrowserCoordinator). Callbacks are property function types; no fetch/socket/storage. Verified: bun run fmt exit 0; module-scoped strict UI lint exit 0; lint:repository exit 0 (lint:ui failures only in workbench-thread and voice-wave, not these modules); type-check clean for these modules (remaining errors in voice-wave and a radix node_modules d.ts); 23 focused Bun tests pass under a confined HOME/XDG_STATE_HOME/ARCHBOARD_VAULT/TMPDIR. Nothing staged or committed; no browser runs.

Checkpoint de95bc86: board-dialogs (1691 lines), opener-settings (922), agent-settings (1036) as official Dialog/AlertDialog/Field/Input/Select/Combobox/RadioGroup/InputGroup/Alert compositions with typed request/outcome contracts; scoped UI lint exit 0; 23 focused pure-helper tests pass confined. Hosting from the shell happens in integration; browser focus/portal proof in TASK-150.06.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Official Dialog/AlertDialog/Field/Input/Select/Combobox/RadioGroup/InputGroup/Alert compositions for board open/create/save-as, confirmation, write-conflict (three outcomes), written-elsewhere recovery, library install, opener settings and agent settings with typed values, issues, busy and error inputs (commit de95bc86). Retired Modal/ui-dialog/ui-button never returned. Verified by scoped strict lint and 23 pure-helper tests; product actions connect in TASK-150.07, browser focus/portal proof in TASK-150.06.
<!-- SECTION:FINAL_SUMMARY:END -->
