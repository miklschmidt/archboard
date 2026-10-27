---
id: TASK-549.13
title: Explain the captured reading through local agent actions
status: Done
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-27T01:03:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.06
  - TASK-549.12
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 943000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 13.

## What to build

Agent explanations must describe the reading that the user selected when the request began.

Toolbar, context-menu, keyboard, and voice actions explain selections, relationships, flows, and proposals through the same local workhorse contract.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.06, TASK-549.12
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Toolbar, context-menu, keyboard, and voice actions explain selections, relationships, flows, and proposals through the same local workhorse contract.
- [x] #2 Each request captures its model, revision, identities, reading, and action at invocation. Later navigation never retargets it.
- [x] #3 The interface and voice use one textual answer. Unavailable agents, progress, failure, and retry remain visible. Missing-flow requests can trigger investigation.
- [x] #4 Answers remain temporary until an explicit agent edit records them through normal claims and stale-write protection.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [x] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm signed integration 212ef722 and publish the external action contract. Read .07 and .15 contracts without importing their source.
2. Create TASK-549.13 drafts for Board persistence, Codex workhorse, Voice coordinator, and Command interface as affected. Parent owns Browser application.
3. Use TDD through public architecture reads with real files and Git to capture exact state, complete revision, stable subjects, reading intent, and proposal comparison.
4. Route UI, CLI, typed, and voice invocations through one temporary local explanation action over the existing workhorse queue and text notifications. Preserve captured input for retry and cancellation.
5. Update consumer guidance, ADRs, test ownership, and evaluation coverage without live evaluation. Simplify, run focused behavior and adapter tests, both type projects, lint, formatting, and affected proposal checks.
6. Merge latest integration, leave task In Progress and proposals draft for parent browser acceptance, release claims, stop this server, sign commits, and save external backend handoff.

Keep workbench within its existing interface ceiling by moving shown-conversation request assembly behind its existing public showConversation operation. Remove three routing-only public helpers. Preserve the HTTP contract and all browser behavior.

7. Parent merges integrated reconciliation and navigation, preserving every authored architecture history. Compose one public read pipeline for exact state, navigation, and explanation capture, with normal CLI/HTTP navigation preserved.

8. Create Browser application and combined backend proposals before frontend work. Implement canonical pane reports plus toolbar, context-menu, keyboard, result, progress, cancellation, and captured retry controls through the shared local action.

9. Use the controlled production provider and real file/Git browser fixtures for navigation during an explanation, visible recovery, and one shared voice/text result. Simplify, complete consumer and architecture evidence, adopt accurate proposals, sign clean source, and dispatch the merger.

10. Preserve exact per-group visibility in capture. Extend the existing action owner with a tab-scoped latest-action read and publish through the existing workbench transport, so voice and typed invocations also fill the visible answer. Keep action reads bound to the returned actual vault and retain one temporary backend action store.

11. Inspection found that the workbench gateway suppresses unchanged conversation snapshots. Use a tab-scoped explanation change notice on the existing pane socket instead. Refresh the existing query cache on that notice and reconnect. Keep captured answers in the same temporary backend owner, with no extra connection or polling loop.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Signed base verified in clean supplied worktree feat/task-549-cli-backend. Material value: architects receive an answer about the exact selected reading after navigation changes, through one existing local workhorse.

Public width gate exposed three added workbench names. The implementation will replace the apps/server assembly of workbench internals with the existing showConversation operation. Board width remains the pre-existing 245/188 debt assigned to .24.

Backend and CLI implementation is complete for parent acceptance. The shared public architecture reader captures exact model, state or checkpoint, complete revision, stable subjects, reading intent, and the actual comparison base with its separate revision. One local action serves HTTP, CLI, typed requests, and voice through existing workhorse queues and notifications. Canonical pane reports expose the actual reading and tab identity without legacy inference. Concurrent action identity, queued cancellation, exact turn interruption, unavailable sign-in, empty answers, and captured retries have controlled-provider evidence. Answers remain temporary.
Simplification moved conversation-selection assembly behind the existing workbench operation and made three routing helpers private. Workbench remains at its 138-name ceiling. The existing retained-comparison test now owns checkpoint explanation capture, which removes a duplicate Git fixture. Board width stays at the known 245/188 debt for .24.
Validation: 24 public model tests pass; 5 pane/action/activation tests pass; 88 transport and package/skill contract tests pass; 52 guidance and CLI help tests pass; final action/instruction subset passes 43 tests. Both TypeScript projects, lint with zero warnings, formatting, and evaluation input validation pass. No live model evaluation ran. Draft code checks have zero warnings on the seven affected boards. Nine unrelated warnings remain on Archboard and Archboard server.
All TASK-549.13 proposals remain draft: Board persistence, Archboard server routes, Codex workhorse, Voice coordinator, Command interface, Live panes, and Codex realtime voice. Parent owns Browser application, all frontend controls, canonical pane report emission, browser interaction and voice acceptance, and adoption. Task remains In Progress. External contract: /home/msc/.local/state/archboard-implementation/task-549/task-549.13-contract.md.

Parent integration composes captured explanations with integrated state reconciliation, code availability, and foreign navigation through one public read pipeline. Eighteen focused runtime and controlled-provider cases pass, and both type projects pass. The CLI preserves navigation query fields while keeping invocation objects on their existing action route. A combined explanation and reference-follow request refuses instead of silently changing the target. The parent also found that the browser supports individual group visibility while the backend capture accepted only a boolean. A public RED/GREEN case now preserves an exact visible group list and refuses unavailable group IDs. Existing all-or-none boolean callers remain valid. Both capture cases pass with 11 assertions. No frontend changes exist yet.

Signed merge checkpoint 17ea315113dde39a48c20be495680e7e89d0e5f6 contains the tested reader composition and exact group selections. The existing pane reading type already derives the new canonical report from the shared schema. ApplicationPane will keep one metadata publisher, with the admitted vault on the request and actual reading vault inside architecture. Inspection found that the backend only reads an action by known ID, so voice-created actions need a latest-action read for the tab. The existing scope.publish and browser workbench subscription can announce those changes without another event stream or polling owner. The visible answer must survive navigation, so its temporary address belongs above the changing model reading.

Parent browser RED exposed that an explanation required a prior conversation connection. Invocation now opens the existing generation-owned tab session for an admitted browser tab. Read-only discovery starts no agent work. Unknown tab identities remain refused. The toolbar capture, canonical pane report, temporary result panel, and navigation-preserving query owner are implemented; browser acceptance is still running.

First browser slice passes: a toolbar action captures the selected module, survives scope navigation, receives the same workhorse answer, and reports canonical pane metadata through the existing publisher. Six browser assertions pass. Both type projects and lint pass. The existing pane connection announces answer changes, and actions wait for pane registration. Canonical reports bypass the legacy board-context builder and retain direct coordinator updates. Context-menu and keyboard invocation plus visible cancellation/retry remain for the next slice.

Completed the parent browser slice with one menu and one action contract for toolbar, Shift+F10, context-menu, typed, and voice requests. The context menu uses the visible selection and leaves diagram gestures in their existing owner. The query cache owns answers across navigation, and every control keeps the captured vault and identity. The backend latest read discovers external invocations. Final browser owner passes 2 cases with 11 assertions. Targeted reader, action, context, instruction, CLI contract, and help tests pass 23 cases with 8864 assertions. The existing signed-out conversation and approval browser case passes 38 assertions. Both type projects, lint, formatting, and eval input validation pass. Two visual captures were inspected, and temporary capture calls were removed. All eight architecture proposals are adopted. Current semantics reports zero warnings, and current code reports zero warnings on all eight affected boards. Nine existing warnings remain on Archboard and Archboard server. Simplification retained one dropdown, one pane report sequence, one temporary backend action owner, and one query cache. Correct ownership groups place explanation actions inside the workbench and the lease inside the board runtime, which removes the crowded overview without changing budgets. No live model evaluation ran.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Readers can explain a captured selection, relationship, flow, or proposal through the shared local workhorse action. Toolbar, context-menu, keyboard, typed, and voice invocations share temporary answers, exact captured retry, and cancellation. Answers identify their original reading after navigation. Public runtime and controlled browser evidence pass. Architecture descriptions and consumer guidance match the delivered behavior. Final integration review remains with the parent TASK-549 workflow.
<!-- SECTION:FINAL_SUMMARY:END -->
