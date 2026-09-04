---
id: TASK-143.04.05
title: Present voice-specific spoken approval state
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:10'
updated_date: '2026-09-04 12:44'
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
- [x] #1 Only a genuine broker binary approval can be spoken-eligible; secrets, forms/URLs, permission scope, coordinator-blocking, and unsupported requests remain visual-only with a reason.
- [x] #2 The view shows immutable request/effect/source plus the matching final user realtime item/session/sequence captured after the effect prompt; assistant output is labelled non-authoritative and never arms the gate.
- [x] #3 Armed/expired/resolving/visual-fallback/outcome_unknown states explain that a later ordinary classifier turn—not realtime speech—settles the typed request.
- [x] #4 A second request, stale identity, ambiguous/missing/non-final user utterance, assistant-only output, lost result, or expiry preserves the visual card and leaves no awaiting_user.
- [x] #5 Module tests exhaust eligible, ineligible, armed, expired, resolving, visual-fallback, outcome_unknown, duplicate, and stale-session projections; TASK-143.04.07 owns the rendered browser interaction.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Publish one strict BrowserSpokenApproval DTO through the canonical browser projection. Derive it from SpokenApprovalSnapshot joined to exactly one ordinary ApprovalOwnerView, and fail closed on identity, effect, coordinator, realtime, evidence, or settlement mismatch.
2. Map every runtime state and fallback reason without inventing certainty. classifier_lost stays visual-only. resolver_lost becomes outcome_unknown only when settlement is absent or unknown; known delivered or not_delivered remains visual fallback with the settlement attached.
3. Present the DTO above the ordinary approval card through a display-only UI module. The UI validates exact identity before ordinary eligibility, preserves matching terminal spoken state, shows canonical gate and final-user evidence, and owns no decision or transcript-selection behavior.
4. Verify eligibility, evidence authority, every presentation state, fallback and race behavior, schema closure, frame composition typing, and the public approval-owner to browser DTO to ordinary-card to spoken-UI chain. TASK-143.04.07 owns rendered browser interaction.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented one closed spoken-approval path from runtime truth to browser presentation. The server joins SpokenApprovalSnapshot to one command ApprovalOwnerView and validates request, approval, child epoch, effect, coordinator thread, realtime session, effect prompt, final user evidence, and settlement identity. The shared schema closes state, reason, evidence, and settlement combinations. classifier_lost remains visual fallback. resolver_lost is outcome_unknown only with absent or unknown settlement; known delivered and not_delivered results remain visual fallback and keep their settlement.

The display-only spoken UI consumes BrowserSpokenApproval plus the ordinary card. It does not inspect BrowserVoice transcripts, accept a synthetic gate, compute expiry, or dispatch decisions. Exact matching terminal state is considered before ordinary pending eligibility, so a genuine unknown resolver result remains visible after the ordinary card publishes lifecycle and status outcome_unknown. Known settlement copy states delivered or not delivered without claiming uncertainty.

Acceptance evidence: the focused eligibility matrix proves AC1. Projection and rendered module tests for immutable request, effect, source, effect-prompt, final-user evidence, and assistant-only fallback prove AC2. The complete state matrix and classifier notice prove AC3. Duplicate, stale identity and session, missing or ambiguous evidence, assistant-only, expiry, classifier loss, resolver loss, and visual-card preservation tests prove AC4. Thirty-five spoken UI module tests cover every required presentation state, and the focused public chain starts with the real approval broker, crosses BrowserSpokenApproval and BrowserApproval projection, derives the ordinary terminal card, and reaches the spoken UI; this proves AC5 without taking over TASK-143.04.07 browser interaction.

Validation at reviewed implementation HEAD 07b6e86472a60805bb60ba51d83a9ac6efe5061e: 174 focused owner, projection, transport, and UI tests passed in the first remediation; 58 focused shared-model, server-projection, spoken-UI, and public broker-to-UI tests passed after the terminal-state fix; root and frontend TypeScript passed; scoped Oxlint and Oxfmt passed; diff checks passed. Repository boundary and inventory owners passed during the first remediation. The independent reviewer reported REVIEW_CLEAN for FIXED_BASE aeb12be2f91493611fee4b2eb3f74a93c5517c60 through reviewed HEAD 07b6e86472a60805bb60ba51d83a9ac6efe5061e. No browser evidence is claimed here.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Published authoritative spoken-approval state from the runtime owner through the closed browser contract and a display-only UI. Exact identity and final-user evidence now fail closed, terminal state survives ordinary-card settlement, and known resolver delivery truth is never presented as unknown. Focused owner, projection, module, and public broker-to-UI tests passed, and an independent review found the complete implementation range clean. TASK-143.04.07 retains rendered browser verification.
<!-- SECTION:FINAL_SUMMARY:END -->
