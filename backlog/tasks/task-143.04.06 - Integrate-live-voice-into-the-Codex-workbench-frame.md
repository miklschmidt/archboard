---
id: TASK-143.04.06
title: Integrate live voice into the Codex workbench frame
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:10'
updated_date: '2026-09-04 14:18'
labels: []
dependencies:
  - TASK-143.03.11
  - TASK-143.04.02
  - TASK-143.04.03
  - TASK-143.04.04
  - TASK-143.04.05
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-frame
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 214000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend only `src/ui/workbench-frame` to fill its optional voice slot with controls, context, transcript, and spoken-approval presentation. Preserve the text workbench as canonical fallback; fullscreen projection is a separate shell leaf.

Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Voice ready/start/active/recovering/stopping/failure states occupy the approved regions without hiding text composer, ordinary approvals, queue, board status, source thread link, or Stop.
- [ ] #2 The bound source link remains visible and immutable across pane focus, one/two panes, collapse/expand, and frame-level failure; terminal stop restores the text-only layout with no stale slot content.
- [ ] #3 Frame tests at src/ui/workbench-frame/tests/voice-composition.test.tsx cover representative composition states, immutable source and real-target cross-link behavior across pane/frame changes, canonical text and request reachability, terminal slot cleanup, single voice announcement ownership, command and decision routing, and no duplicate voice or transcript owner. Existing voice-module owners retain exhaustive lifecycle, theme, reduced-motion, keyboard, pointer, and touch mechanics; TASK-143.04.07 owns rendered desktop, Flip, and browser integration.
- [ ] #4 This leaf owns no browser inventory or real-audio smoke; deterministic integration belongs to TASK-143.04.07 and real acceptance to TASK-143.04.09.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend the workbench-frame public contract with one optional, caller-owned voice slot that carries the existing VoiceSession, immutable VoiceContextHistory evidence, canonical realtime transcript records and their sibling links. Keep lifecycle, media, transcript ordering, and evidence retention in their existing owners.
2. Compose VoiceControls, VoiceContextPanel, and VoiceTranscript inside the expanded active-pane frame. Give VoiceControls sole voice-state announcement ownership, keep the text timeline/composer and operations visible, and remove the slot completely when the caller withdraws it.
3. Project the current application-wide ordinary approval card through the existing workbench approval projection and place VoiceSpokenApproval immediately above the unchanged WorkbenchApprovals surface when authoritative spoken state exists.
4. Add one focused voice-composition owner for reachable slot states, interaction routing, immutable source identity, log/focus order, slot removal, and structural no-second-owner facts without theme/input cross-products.
5. Run the focused workbench-frame owners, root and frontend TypeScript, scoped Oxlint/Oxfmt, frontend build, and diff/tracked-state checks. Keep the task In Progress with acceptance criteria unchecked for independent review.

6. Preserve VoiceTranscript records and status while making each related-record link independently available only when its exact captured-source target is mounted and valid; show the unavailable relationships without creating another transcript owner. Add focused non-empty, empty-request, and request-source-drift owners, then rerun the scoped validation set.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the caller-owned optional voice slot entirely within src/ui/workbench-frame. The frame now composes the existing controls, transcript, context evidence, and spoken approval presentation without creating a second session or state owner. It captures immutable source-pane identity, shows the exact bound workhorse thread, fails closed on binding drift, supplies real frame-owned transcript cross-links, and removes the voice presentation when the authoritative session reaches stopped.

Added focused mounted coverage for canonical text-surface preservation, command routing, reachable voice states, sole announcement ownership, immutable source identity across pane focus and frame failure, binding mismatch, transcript link targets and order, spoken approval adjacency and decision ownership, terminal stop cleanup, and explicit slot withdrawal.

Validation: bun test --isolate src/ui/workbench-frame/tests/voice-composition.test.tsx src/ui/workbench-frame/tests/frame-layout.test.tsx passed 19 tests with 236 assertions; root and frontend TypeScript passed; scoped Oxfmt and Oxlint passed; the frontend build passed; git diff --check passed. The frontend build retained its existing unresolved runtime CSS and chunk-size advisory warnings. An initial non-isolated two-file test invocation exposed the known per-file Happy DOM teardown collision, so the final owner command used Bun isolation and passed cleanly.

The task remains In Progress with every acceptance criterion unchecked for independent review. Browser, fullscreen-shell, and real-audio evidence remain with the downstream owners named by the task.

Independent-review remediation on 2026-09-04: transcript relationships now appear only when the captured voice source pane owns the mounted workhorse timeline, queue, coordinator, and matching application-wide request target. Focusing another pane or entering a frame error renders an explicit relationships-unavailable state instead of links to the focused pane or missing elements. Canonical targets expose their pane identity for direct mounted verification.

The review risk around spoken approval and voice-source equality was reachable. Spoken voice evidence now appears only when the application-wide request source exactly matches the captured voice pane ID and label. Ordinary approvals remain visible and keep their existing decision owner when sources differ.

The focused owner now proves all six rendered fragments resolve to Pane A targets, no fragment appears for focused Pane B or frame error, the unavailable state is visible, and mismatched spoken evidence is withheld without hiding ordinary approval. Validation passed 20 isolated workbench-frame tests with 247 assertions, scoped Oxlint and Oxfmt, root and frontend TypeScript, frontend build, and diff checks. The existing runtime CSS-resolution and chunk-size build advisories remain unchanged. TASK-143.04.06 stays In Progress with every criterion unchecked for rereview.

Second independent-rereview remediation: VoiceTranscript now accepts nullable identities per related record. It keeps the canonical transcript records, visible session status, log, and single announcement owner mounted while rendering each missing relationship as a non-link "Unavailable" item. Pane changes and frame errors no longer hide transcript evidence.

WorkbenchFrame now derives timeline, queue, coordinator, callback, workhorse-result, and approval availability separately from mounted exact-source targets. An empty application-wide request withholds only Approval. A present request whose subscribed source validation drifts also withholds Approval and removes pane attribution from the error request target, while valid Pane A relationships keep resolving to mounted Pane A nodes. Spoken evidence remains gated by the same validated exact request source.

Focused projection, mounted transcript, voice composition, and frame owners passed 39 tests with 381 assertions. The owners include non-empty transcript persistence through Pane B and frame error, empty-request partial availability, request-source drift, exact DOM target resolution, unavailable relationship semantics, spoken-source gating, and the prior frame behaviors. Scoped Oxfmt and Oxlint, root and frontend TypeScript, frontend build, and diff checks passed. The build retained the existing runtime CSS-resolution and chunk-size advisories. Root corrected a missing type-only import and nullable test-fixture spread found by the first type-check attempt; no behavior or rule was weakened. The task remains In Progress with all criteria unchecked.
<!-- SECTION:NOTES:END -->
