---
id: TASK-143.04.04
title: Render canonical voice transcript and cross-links
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:10'
updated_date: '2026-09-04 12:25'
labels: []
dependencies:
  - TASK-143.02.03
  - TASK-143.03.04
  - TASK-143.03.08
  - TASK-143.04.01
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/voice-transcript
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 212000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own display projection for the canonical codex-realtime transcript port in `src/ui/voice-transcript`. It renders provisional/final item state and cross-links but does not merge raw events, deduplicate a second stream, or become a second thread history.

Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Empty, provisional, final, interrupted, processing, agent-speaking, completed, reconnecting, stale-session-suppressed, recoverable failure, and terminal failure render from canonical item identity, realtime session, role, and sequence.
- [x] #2 Delegation, queue, steer, approval, callback, and workhorse-result links point to canonical records without copying them into transcript text or coordinator history.
- [x] #3 Reconnect replay and late prior-session items remain ordered/inspectable according to the adapter outcome; this module never consumes flat transcript notifications or data-channel text directly.
- [x] #4 Tests at src/ui/voice-transcript/tests cover every projection/cross-link, batched role=log announcements, aria-busy/relevant, keyboard inspection, no token announcements, and both themes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a public voice-transcript contract that accepts the canonical RealtimeTranscriptRecord array and the existing VoiceSessionView, preserves adapter order and stable item identity, suppresses mismatched-session text while leaving identity inspectable, and accepts only sibling-region IDs for delegation, queue, steer, approval, callback, and workhorse-result links.
2. Build a flat, token-driven VoiceTranscript projection and React region under src/ui/voice-transcript. Render empty, session-progress, recovery/failure, provisional, final, interrupted, and completed states without creating a second history or consuming raw realtime notifications or data-channel text.
3. Add focused pure and Happy DOM tests under src/ui/voice-transcript/tests. Cover every projection and cross-link, stable keyed updates, replay and prior-session behavior, role=log with batched additions, aria-busy/relevant, keyboard focus, no token live announcements, and semantic styling in both themes.
4. Format and validate only the owned module plus both TypeScript projects, scoped Oxlint/Oxfmt, required repository inventory checks for new files, and git diff --check. Record evidence and remaining integration risk without checking acceptance criteria or marking the task Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Started from fixed base aeb12be2f91493611fee4b2eb3f74a93c5517c60. Material value: a person using live voice can inspect what Codex heard, which session produced it, and the related canonical workbench records without transcript text duplicating queue, approval, coordinator, callback, or workhorse history.

Implementation evidence (owner slice):
- AC #1: src/ui/voice-transcript projects canonical RealtimeTranscriptRecord items plus VoiceSessionView into empty, provisional, final, interrupted, processing, agent-speaking, completed, reconnecting, recoverable-failure, and terminal-failure states. The view retains item/session identity, role, and sequence; records from a different or absent current session remain inspectable while their text is suppressed.
- AC #2: the public contract accepts only six canonical sibling record IDs (delegation, queue, steer, approval, callback, workhorse result) and renders fragment links; it does not copy sibling content.
- AC #3: projection preserves adapter order and duplicate occurrences, including replay and late prior-session entries. A focused source-boundary test rejects raw semantic events, transport notifications, data-channel/message inputs, and flat transcript method surfaces.
- AC #4: focused projection and Happy DOM tests cover stable batched-token replacement without added nodes, role=log, aria-busy, aria-relevant=additions, keyboard-focusable log and links, stale-session suppression, all state projections, and identical light/dark markup without raw palette or dark-variant coupling.

Validation:
- bun test src/ui/voice-transcript/tests — 15 pass, 0 fail, 113 assertions.
- bunx oxlint src/ui/voice-transcript — clean.
- bunx oxfmt --check src/ui/voice-transcript — 8 files formatted.
- bunx tsc --noEmit — pass.
- bunx tsc --noEmit -p tsconfig.frontend.json — pass.
- bun test tests/system/repository-policy/test-inventory.test.ts tests/system/repository-policy/boundaries.test.ts — 62 pass, 0 fail, 139 assertions.

Remaining integration risk: TASK-143.04.06 must supply the canonical record stream and real sibling DOM IDs when mounting this module. Rendered real-browser/fullscreen integration remains with TASK-143.04.06 and TASK-143.04.07; no browser or broad suite was run by assignment. Acceptance criteria remain unchecked and the task remains In Progress for independent review.

Independent review remediation from prior HEAD 7ddb637667009db712d088fc0c5c2674418127f3:
- Accessibility: the existing single atomic status output now reads VoiceSessionView.accessibleStatus through one screen-reader-only child, so recoverable and terminal failure reason/recovery sentences are announced. The short visible label and status mark are aria-hidden inside that output. This standalone transcript owns the announcement; TASK-143.04.06 must choose one owner when composing it with VoiceControls rather than mounting duplicate live regions.
- Color semantics: user/assistant roles and provisional/final record states now use neutral foreground semantic tokens. Cobalt is no longer a role or transcript-status category.
- State coverage: one table-driven projection owner exhaustively matches every exported VoiceSessionStatus and distinguishes recoverable and terminal failed outcomes, including expected transcript busy and empty states.
- Boundary coverage: removed exact product filename inventory and import-spelling assertions. The focused owner dynamically scans module product sources only to reject raw semantic-event, transport-notification, data-channel/message paths and direct raw-layer dependencies.
- Theme evidence remains cheap: source and mounted owners require semantic tokens, reject raw palette values/dark variants, and prove theme-independent markup. Rendered theme behavior remains with TASK-143.04.07.

Remediation validation:
- bun test src/ui/voice-transcript/tests — 17 pass, 0 fail, 176 assertions.
- bunx oxlint src/ui/voice-transcript — clean.
- bunx oxfmt --check src/ui/voice-transcript — 8 files formatted.
- bunx tsc --noEmit — pass.
- bunx tsc --noEmit -p tsconfig.frontend.json — pass.
- git diff --check — clean.
No repository inventory owner was rerun because the remediation added no files or production dependency edges. No broad or browser lane was run by assignment. Task remains In Progress and all acceptance criteria remain unchecked for rereview.

Second rereview composition remediation from prior HEAD 0abca41b89b7edea71cb798da9c213d7751a6aed:
- Added the typed public VoiceTranscriptAnnouncementOwner union with "transcript" and "external" modes, exposed through optional VoiceTranscriptProps. Standalone transcript ownership remains the default.
- Default mode retains exactly one atomic polite output containing canonical accessibleStatus.
- External mode renders the same visible session label and semantic styling in a roleless div, with no output element, aria-live, aria-atomic, hidden accessibleStatus node, or status role. The transcript role=log and records remain unchanged, so TASK-143.04.06 can designate VoiceControls as the only voice-state announcer without a cross-scope edit.
- Focused mounted owners prove both modes, including visible-status/log retention and absence of a second voice-state announcer in external mode. The nonblocking repeated-map observation was deliberately left unchanged.

Validation:
- bun test src/ui/voice-transcript/tests — 18 pass, 0 fail, 192 assertions.
- bunx oxlint src/ui/voice-transcript — clean.
- bunx oxfmt --check src/ui/voice-transcript — 8 files formatted.
- bunx tsc --noEmit — pass.
- bunx tsc --noEmit -p tsconfig.frontend.json — pass.
- git diff --check — clean.
No broad, browser, system, performance, tooling, topology, or concurrency lane was run. Task remains In Progress with all acceptance criteria unchecked for rereview.

Finalization evidence at implementation HEAD 4967827750b693cc246389607be64139684b9757:
- Focused voice-transcript suite: 18 pass, 0 fail, 192 assertions. These owners cover every canonical transcript/session projection, six canonical fragment cross-links without copied sibling content, replay and late prior-session ordering with stale text suppression, raw-event/notification/data-channel exclusion, stable batched token updates, role=log aria-busy/relevant, keyboard inspection, single/external announcement ownership, semantic tokens, and theme-independent markup.
- bunx tsc --noEmit and bunx tsc --noEmit -p tsconfig.frontend.json passed.
- Scoped bunx oxlint src/ui/voice-transcript and bunx oxfmt --check src/ui/voice-transcript passed.
- Staged and fixed-range diff checks passed; tracked checkout was clean before finalization.
- Independent Standards/Spec review returned REVIEW_CLEAN through 4967827750b693cc246389607be64139684b9757.
Remaining integration work belongs to TASK-143.04.06 (mount canonical records, real sibling IDs, and external announcement ownership), TASK-143.04.07 (rendered browser/theme verification), and TASK-143.04.10 (fullscreen Stop reachability).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rendered canonical voice transcript state and sibling-record links without creating a second history. Added accessible batched log behavior, stale-session suppression, semantic theme styling, exhaustive state/cross-link owners, and a typed external-announcer mode for composition. Verified by 18 focused tests (192 assertions), both TypeScript projects, scoped Oxlint/Oxfmt, clean diff checks, and independent Standards/Spec REVIEW_CLEAN.
<!-- SECTION:FINAL_SUMMARY:END -->
