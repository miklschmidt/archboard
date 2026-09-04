---
id: TASK-143.04.05
title: Present voice-specific spoken approval state
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:10'
updated_date: '2026-09-04 12:08'
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
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the isolated display-only src/ui/voice-spoken-approval module. The pure projector reuses the ordinary approval card and isGenuineBinaryApproval as the eligibility authority, accepts a narrow immutable gate-facts presentation, correlates the exact final user item against the canonical BrowserVoice transcript and effect-prompt sequence, and fails closed to visible-card states without dispatching a decision. The rendered region uses the semantic TASK-140 theme, names its status accessibly, shows request/effect/broker/coordinator/gate/final-user evidence, labels assistant output non-authoritative, and contains no controls. A genuine second request against an occupied live slot projects duplicate; same-request identity or session drift stays stale. Caller integration above the ordinary card remains TASK-143.04.06.

Evidence by acceptance criterion: AC1 is owned by the host-reason matrix plus exact pending command accept/decline checks; AC2 by exact request/effect/source and post-prompt user-final correlation tests plus assistant-only rendering; AC3 by armed/expired/resolving/visual_fallback/outcome_unknown state and classifier-notice tests; AC4 by duplicate, stale identity/session, ambiguous, missing, non-final, assistant-only, lost-result, and expiry fail-closed tests with visualCardPreserved=true and no awaiting_user state; AC5 by 30 focused module tests across projection, static markup, mounted DOM, and boundary owners. Acceptance criteria remain unchecked for independent review.

Validation: bun test src/ui/voice-spoken-approval/tests (30 pass); bun run generate:codex-contract; bunx tsc --noEmit; bunx tsc --noEmit -p tsconfig.frontend.json; bunx oxlint src/ui/voice-spoken-approval; bunx oxfmt --check src/ui/voice-spoken-approval; bun test tests/system/repository-policy/boundaries.test.ts tests/system/repository-policy/test-inventory.test.ts (62 pass).
<!-- SECTION:NOTES:END -->
