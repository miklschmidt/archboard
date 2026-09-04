---
id: TASK-143.04.05
title: Present voice-specific spoken approval state
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:10'
updated_date: '2026-09-04 12:40'
labels: []
dependencies:
  - TASK-143.03.07
  - TASK-143.04.01
  - TASK-143.07.05
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/voice-spoken-approval
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 213000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Present voice-specific eligibility, one-slot gate, captured user-utterance evidence, expiry/race, and visual fallback above the ordinary approval card. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Only a genuine broker binary approval can be spoken-eligible; secrets, forms/URLs, permission scope, coordinator-blocking, and unsupported requests remain visual-only with a reason.
- [ ] #2 The view shows immutable request/effect/source plus the matching final user realtime item/session/sequence captured after the effect prompt; assistant output is labelled non-authoritative and never arms the gate.
- [ ] #3 Armed/expired/resolving/visual-fallback/outcome_unknown states explain that a later ordinary classifier turn—not realtime speech—settles the typed request.
- [ ] #4 A second request, stale identity, ambiguous/missing/non-final user utterance, assistant-only output, lost result, or expiry preserves the visual card and leaves no awaiting_user.
- [ ] #5 Module tests exhaust eligible, ineligible, armed, expired, resolving, visual-fallback, outcome_unknown, duplicate, and stale-session projections; TASK-143.04.07 owns the rendered browser interaction.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a closed presentation contract and pure projector under src/ui/voice-spoken-approval. Consume the existing ordinary approval card as the eligibility authority plus immutable spoken-gate and canonical voice evidence supplied by the caller. Recheck that the request is a current broker binary accept/decline, correlate request/effect/source/realtime/final-user identities, and fail closed into explicit eligible, ineligible, armed, expired, resolving, visual-fallback, outcome_unknown, duplicate, and stale projections. Missing, ambiguous, provisional, assistant-only, lost-result, and expiry inputs must preserve the ordinary card and never project awaiting_user.
2. Render a display-only spoken-approval region intended immediately above the ordinary approval card. Show immutable request, effect, broker/coordinator source, effect-prompt identity, and the captured final user item/session/sequence/text. Label assistant output as non-authoritative and explain in every live/fallback/uncertain state that a later ordinary coordinator classifier turn, not realtime speech, settles the typed request. Add no decision controls and do not duplicate ordinary approval state.
3. Add focused module tests for every accepted projection and reason arm, static markup and accessible DOM structure, exact evidence disclosure, one-slot duplicate behavior, fail-closed correlation, visual-card preservation, and no action owner. Use the shared opt-in DOM stack only; leave browser interaction to TASK-143.04.07.
4. Run the module tests, root and frontend TypeScript checks, scoped Oxlint and Oxfmt checks, any repository owner required by new files, and git diff --check. Record implementation evidence without checking acceptance criteria or moving the task from In Progress.

Review remediation: publish one closed BrowserSpokenApproval DTO from the authoritative SpokenApprovalSnapshot at the existing Codex browser projection boundary; wire the owner snapshot through the canvas gateway; make the UI consume that DTO without reconstructing policy or transcript evidence; prove exhaustive state/reason mapping, classifier-lost versus resolver-lost truth, null-captured assistant fallback, schema closure, and compile-time frame composition; run only the focused checks authorized by the review.

Terminal-state rereview remediation: 1. Make exact canonical spoken identity/state win before ordinary pending eligibility in the UI, while keeping idle/live/unrelated cards subject to ordinary eligibility. Prove a reachable ordinary outcome_unknown card still renders canonical outcome_unknown. 2. Project resolver_lost as outcome_unknown only when settlement is absent or its outcome is outcome_unknown; preserve known not_delivered as visual_fallback. Encode the relation in the shared schema and focused server tests. 3. Run only focused projection/UI owners, both TypeScript projects, scoped Oxlint/Oxfmt, and diff checks; commit separately and return the fixed range for rereview.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the isolated display-only src/ui/voice-spoken-approval module. The pure projector reuses the ordinary approval card and isGenuineBinaryApproval as the eligibility authority, accepts a narrow immutable gate-facts presentation, correlates the exact final user item against the canonical BrowserVoice transcript and effect-prompt sequence, and fails closed to visible-card states without dispatching a decision. The rendered region uses the semantic TASK-140 theme, names its status accessibly, shows request/effect/broker/coordinator/gate/final-user evidence, labels assistant output non-authoritative, and contains no controls. A genuine second request against an occupied live slot projects duplicate; same-request identity or session drift stays stale. Caller integration above the ordinary card remains TASK-143.04.06.

Evidence by acceptance criterion: AC1 is owned by the host-reason matrix plus exact pending command accept/decline checks; AC2 by exact request/effect/source and post-prompt user-final correlation tests plus assistant-only rendering; AC3 by armed/expired/resolving/visual_fallback/outcome_unknown state and classifier-notice tests; AC4 by duplicate, stale identity/session, ambiguous, missing, non-final, assistant-only, lost-result, and expiry fail-closed tests with visualCardPreserved=true and no awaiting_user state; AC5 by 30 focused module tests across projection, static markup, mounted DOM, and boundary owners. Acceptance criteria remain unchecked for independent review.

Validation: bun test src/ui/voice-spoken-approval/tests (30 pass); bun run generate:codex-contract; bunx tsc --noEmit; bunx tsc --noEmit -p tsconfig.frontend.json; bunx oxlint src/ui/voice-spoken-approval; bunx oxfmt --check src/ui/voice-spoken-approval; bun test tests/system/repository-policy/boundaries.test.ts tests/system/repository-policy/test-inventory.test.ts (62 pass).

Review remediation: added one strict BrowserSpokenApproval DTO to the canonical browser snapshot and delta contract. The server projection joins SpokenApprovalSnapshot to exactly one command ApprovalOwnerView, validates coordinator/realtime/effect/settlement identity, nominates only the runtime-captured post-prompt final user item, and fails closed on incomplete or mismatched facts. All 18 runtime fallback reasons map exhaustively; classifier_lost remains visual-only and only resolver_lost becomes outcome_unknown. coordinatorThreadId retains the shared branded ThreadId. The canvas gateway now publishes the runtime owner snapshot and owner changes trigger browser projection.

The spoken-approval UI now consumes only BrowserSpokenApproval plus the ordinary approval card. It no longer selects transcript records, accepts a synthetic gate, or computes expiry from caller time. Focused owner-view -> browser DTO -> UI tests cover exact identity, assistant-only/null evidence, every state/reason, schema closure, immutable evidence, and a compile-time workbench-frame composition fixture; the frame itself remains owned by TASK-143.04.06.

Remediation validation: 174 focused tests across runtime spoken approval, shared browser model, server projection, canvas projection, browser transport, and spoken UI; 62 repository boundary/inventory tests; root and frontend TypeScript; scoped Oxlint and Oxfmt across 45 changed TypeScript files; git diff --check. Full browser and system lanes were not run as directed; TASK-143.04.07 owns rendered browser interaction. Status remains In Progress and all five acceptance criteria remain unchecked for independent review.

Terminal-state rereview remediation: the spoken UI now validates the canonical spoken approval identity before ordinary pending eligibility. Matching terminal outcome_unknown, expired, stale, and visual-fallback state remains visible even after the ordinary card becomes terminal; settled ordinary state keeps its existing ineligible presentation. A real broker regression produces an outcome_unknown ApprovalOwnerView, projects the BrowserSpokenApproval and BrowserApproval, derives the ordinary card with lifecycle/status outcome_unknown and spoken not_pending, then verifies the spoken UI still renders outcome_unknown.

The server now maps resolver_lost to outcome_unknown only when settlement is absent or explicitly outcome_unknown. A known delivered or not_delivered settlement maps to visual_fallback and remains attached to the DTO. The shared schema rejects unknown presentation for known settlement and requires exact approval, gate, and captured-user evidence for resolver loss. UI copy for a known settlement states delivered or not delivered instead of claiming uncertainty.

Validation: 58 focused tests across shared browser model, server spoken projection, spoken UI, and the real broker-to-UI chain; root and frontend TypeScript checks; scoped Oxlint and Oxfmt across six changed TypeScript files; git diff --check. No broad test lane ran. Status remains In Progress and all five acceptance criteria remain unchecked for independent rereview.
<!-- SECTION:NOTES:END -->
