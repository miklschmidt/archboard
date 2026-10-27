---
id: TASK-549.14
title: Present and record dynamic walkthroughs
status: In Progress
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-27T08:03:00Z'
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
ordinal: 944000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 14.

## What to build

Presentations need to move through architectural readings while preserving one consistent revision.

An agent authors narrative beats that change scope, selection, filters, grammar, and flow. A reader plays them without saved geometry or architecture copies.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.06, TASK-549.12
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent authors narrative beats that change scope, selection, filters, grammar, and flow. A reader plays them without saved geometry or architecture copies.
- [ ] #2 Playback resolves current, a named proposal, or an exact checkpoint once. The entire presentation retains that revision.
- [ ] #3 Changes offer restart against a newer state. Missing subjects or history stop the affected beat with a recovery explanation.
- [ ] #4 Recording and shared playback use an exact retained revision. Existing local recording and rendering remain the execution owners.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement backend and CLI only in feat/backend-recording-replay. Parent owns frontend and browser acceptance.
1. Publish the exact walkthrough read/write and recording contract in the durable state directory.
2. Create draft TASK-549.14 proposals on Board persistence, Archboard server routes, Command interface, and Board rasterizer.
3. Use public architecture operations with real files and Git for each red-green slice: narrative authoring, compact proposals, pinned playback, and retained recording inputs.
4. Extend existing local recording and replay contracts without adding an engine. Update consumer instructions, ADRs, and test ownership.
5. Simplify, merge the latest integration tip, run affected evidence, sign checkpoints, release claims, and publish the backend handoff. Leave criteria unchecked and proposals draft.

6. Parent merges the integrated reconciliation and explanation implementation, preserving all authored history. Compose narrative subjects, selected playback, navigation, and explanation capture at the shared runtime boundary before frontend work.

7. Create accurate Browser application and combined backend proposals. Reuse existing presentation, renderer, camera, query cache, recording page, and replay owners for canonical narrative beats. Keep one captured revision during playback and offer explicit restart on change.

8. Use public runtime TDD with real disk/Git for composed narrative reconciliation and capture, then the existing controlled browser seam for visible beat transitions, missing targets, restart, exact recording, and offline replay. Simplify, validate, adopt accurate proposals, sign the completed source, and dispatch the merger.

9. Complete the existing voice narration adapter for canonical recordings. Await server-owned capture through the existing voice start operation, preserve source and target revisions, and reuse the pane presentation port. Draft Codex realtime voice and Live panes diagrams now describe these existing owners. Use controlled public voice and browser seams, with no live model calls.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend delivery is implemented on feat/backend-recording-replay. Signed checkpoint da8989345 adds canonical narrative inputs, shared authoring, compact walkthrough/beat subjects, revision-pinned playback, and the existing local recording/replay contract extension. Signed merge 175b081c8 includes integration ae6afbf8be81fdea3b7f8be23157b138bcd3c31f (TASK-549.15). The public reader composes playback and existing navigation through one fourth options object.
The durable early contract is /home/msc/.local/state/archboard-implementation/task-549/task-549.14-contract.md. The final backend handoff will be task-549.14-backend.md beside it.
Draft proposals retain their original ancestors and all integrated histories: Board persistence@TASK-549.14 (msQamUgX), Archboard server routes@TASK-549.14 (rzormOzN), Command interface@TASK-549.14 (joCzpG5O), and Board rasterizer@TASK-549.14 (fFECebqp). They describe backend ownership only. Parent owns frontend/browser acceptance, including canonical recording and replay page consumption. Criteria remain unchecked and proposals remain draft.
Types, lint, formatting, evaluation input validation, CLI/HTTP narrative routing, CLI contract generation/help, and the package graph pass. The four affected draft boards have zero warning findings. The full vault code check reports 10 warnings elsewhere. The interface-width gate reports board 245 names against ceiling 188. Export declarations, package exports, and ceilings exactly match the integration tip. No rule or budget was changed. The combined domain regression run remains in progress at this note.

The combined runtime run completed: 134 tests pass across narrative authoring/playback, compact proposals, structural transactions, claims, recovery, archives, references, and local talk contracts. Final CLI and transport follow-up passes 10 tests, including occupied talk-directory usage refusal and output preservation. Canonical and legacy recording now share that existing directory helper. Types and formatting pass; final lint is running. Package graph passes. The inherited interface-width refusal and unrelated vault code warnings remain documented. No browser or live voice work ran. All four claims are released, and only this worktree server was stopped. The parent retains frontend acceptance and ticket/proposal completion.

Final lint completed with zero errors and zero warnings. Final types and formatting pass. The source checkout is ready for the parent handoff. TASK-549.14 remains In Progress with unchecked criteria and draft proposals.

Parent merged the signed .13 integration and preserved every authored history. The public proposal decoder now includes narrative definitions after the .07 materialization refactor; its existing compact-narrative RED/GREEN case passes. New public family evidence covers safe inherited narrative fields, explicit text and atomic-reading conflicts, beat order, and complete settlement through the existing identity and ordered-list rules. A second public RED exposed missing retained dependencies for an exact target kept only by a following narrative. Propagation and settlement now include those targets in the same archive graph. Both family cases pass within their unchanged 15-second budgets, and types pass. Final lint and combined regression checks remain. Browser application and combined backend proposals are drawn before frontend implementation; the three superseded backend drafts are shelved with preserved content. Board rasterizer keeps its original .14 draft.

The combined runtime suite passes 38 tests and 215 assertions across 16 files. Types, lint, and both diff checks pass. Parent checkpoints the resolved merge before rebasing onto origin/main after PR23. The orphan Git-owner fix must be present in both active worktrees before any tests resume. No frontend acceptance or proposal adoption is claimed.

The first browser slice passes one visible workflow with 13 assertions. It covers complete beat readings, architecture/sequence/flowchart transitions, missing targets, a pinned revision during external edits, explicit restart, and restored selection on exit. A separate immutable query owns each capture. React Activity preserves the ordinary reader, while the picker unmounts to close its portal. The existing ModelDiagram, camera, and SemanticPresentation own the picture and captions. Types and lint pass. Parent inspected initial and final beat screenshots and removed temporary capture calls. Recording, replay, exact/shared/proposal browser evidence, and canonical pane reports remain unfinished. No criteria are checked or proposals adopted.

Public capture evidence now covers a narrative whose exact target predates its definition. Playback carries its source selector through the existing reading-selection schema. The shared explanation capture can require both source and target revisions. A narrative-only edit now refuses an old capture even when the target checkpoint remains unchanged. The new RED/GREEN case passes seven assertions, and types and lint pass. These optional fields preserve existing artifact decoding. The voice and recording adapters still need to consume this contract.

The signed integration merge f253e7aff composes lifecycle, correction and migration preview work with walkthroughs. Types pass after removal of one duplicate import. Six focused runtime owners pass21 tests with136 assertions. The next browser RED reaches the intended missing capture report: playback displays its diagram but the public pane report has no architecture context. Parent now connects playback to the existing explanation/report owner, preserving separate source and target revisions.

Captured walkthroughs now publish the architecture that they show through the existing explanation/report owner. The report preserves the narrative source selector, source revision, target revision, and selected subjects while legacy board identity stays null. The browser RED/GREEN owner passes14 assertions. Types and lint pass after one shared capture-source helper and removal of a redundant await introduced by merge composition. Presentation arrival, recording payload consumption, replay and canonical voice remain unfinished.

Canonical replay now uses the captured model through the existing walkthrough, picture loader, frame clock and encoder. The public replay owner deletes the source repository and compares all33 frames across one-page and two-page rendering. It passes twice with4 assertions each. Legacy replay passes3 cases with24 assertions. A first-frame SVG traffic mismatch was isolated to compositor-thread animation; the existing replay browser flags now keep animation on the main thread. All failed timing and animation experiments and temporary diagnostics are removed. Types, lint, formatting and diff checks pass. Manual walkthrough behavior passes14 assertions, and the existing picture traffic lifetime owner passes4 assertions. Parent inspected the final replay frame. Recording-page payload loading and the canonical voice bridge remain unfinished.

Voice delegate started on feat/voice-delegate-backend from signed14ea6e71d. Source, integration2c04f606, and maina98f28811 ancestry pass before tests or servers. Early parent contract: /home/msc/.local/state/archboard-implementation/task-549/task-549.14-voice-contract.md. Claimed and updated existing Codex realtime voice@TASK-549.14 and Live panes@TASK-549.14 drafts. Public runtime, HTTP, and application-socket seams retain owner approval. No frontend or recording package edits belong to this delegate.

Voice backend implementation passes controlled production evidence on feat/voice-delegate-backend. The existing public reader resolves current, exact, and proposal narrative sources separately from targets. Captures remain pinned after source edits. Stale and unavailable source/target reads refuse voice before provider start. The existing serialized voice operation awaits preparation and rejects canceled or replaced starts. Canonical pane requests use no legacy board key and acknowledge only the exact arrived beat. A RED exposed an old live first-beat acknowledgement leaking into its replacement recording; the narration identity now gates delivery. Focused evidence: 8 system tests with 62 assertions and 24 legacy/voice cases with 121 assertions pass. Types and lint pass with unchanged limits. The two affected draft boards have zero warnings after ownership edges and anchors were corrected. Fifteen warnings remain outside these two boards, including parent-owned TASK-549.14 diagrams. No frontend, browser tests, packages/walkthrough, review, push, PR, adoption, or task closure belongs to this delegate. Criteria stay unchecked and proposals stay draft.

The final frozen production run passes 8 cases and 62 assertions within existing case budgets. Separate exact-source and proposal-source cases replace one over-budget combined case. Proposal authoring now happens in the shared fixture first write, which reduces that case to 9.7 seconds. The focused canonical recording owner also makes sure that the server sends no first-beat request. A simplification pass kept one capture in the existing narrated map, reused existing subject naming and comparison data, and removed unused fixture returns. No extra runtime owner, public package export, explanation action, test limit, or rule exception was added.
<!-- SECTION:NOTES:END -->
