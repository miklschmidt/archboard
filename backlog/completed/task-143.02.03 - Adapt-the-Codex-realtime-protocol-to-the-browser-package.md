---
id: TASK-143.02.03
title: Adapt the Codex realtime protocol to the browser module
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 13:42'
labels: []
dependencies:
  - TASK-143.01.07
  - TASK-143.01.08
  - TASK-143.02.01
  - TASK-143.02.02
  - TASK-143.06.01
  - TASK-143.01.16
references:
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-realtime
  - src/runtime/codex-realtime/tests/adapter.test.ts
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 183000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the sole adapter from raw decoded Codex 0.151.0 realtime/timeline events to the browser-native module. It owns realtime phase and canonical transcript; the browser media module owns neither.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each start mints a unique realtimeSessionId and sends outputModality audio, version v3, WebRTC, includeStartupContext true, clientManagedHandoffs false, delegationAckFiller true, flushTranscriptTailOnSessionEnd true, codexResponsesAsItems false, handoff mode bemTags, exact voice breeze, one fresh developer semantic item, and canonical start/end instructions; there is no selector or fallback.
- [x] #2 The empty start response conveys no SDP/readiness; answer comes only from matching thread/realtime/sdp and readiness only from matching thread/realtime/started child, thread, session, and version.
- [x] #3 Only item-scoped realtime item started/transcript delta/completed events create canonical transcript. Thread-only error/closed and flat transcript events update diagnostics/phase but never content; WebSocket appendAudio/outputAudio paths are rejected.
- [x] #4 Recovery exhausts thread/timeline/list, detects cursor loops, and merges pages with live item events by stable identity without duplicate, hidden gap, or reordered turn.
- [x] #5 appendText, appendSpeech, stop, and recovery revalidate captured child/epoch/thread/coordinator/session before one attempt; lost responses are outcome_unknown, uncertain approval falls back visual, and no path leaves awaiting_user.
- [x] #6 src/runtime/codex-realtime/tests/adapter.test.ts drives decoded 0.151.0 fixtures through start, SDP, readiness, every item/thread/timeline event, paging/recovery, identity mismatch, lost response, stop, and cleanup, proving canonical transcript order and every closed failure outcome.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Resolve the frozen contract seam before implementation: move the host-facing correlation, transcript, event, request, and outcome types plus their opaque browser-media brands into one neutral shared root entrypoint; keep src/ui/codex-realtime's public names unchanged by importing and re-exporting those exact types. Runtime then imports only the neutral public entrypoint. This requires parent approval and ownership for shared/UI policy changes.
2. Add src/runtime/codex-realtime with one public factory and private reducer. Consume CodexSession, IdentityAuthority, semantic-context, instructions, and protocol values only through their root entrypoints. Mint one wire realtimeSessionId per start, build the exact V3/WebRTC/breeze/bemTags request, and accept SDP/readiness only after exact captured identity checks.
3. Reduce only item-scoped live events into canonical transcript records, classify thread-level error/closed and forbidden audio/WebSocket events as phase/diagnostic changes, and preserve one stable item identity/order across live delivery and recovery.
4. Exhaust timeline pages with repeated-cursor detection, merge recovered and live entries deterministically, and revalidate child, epoch, linked thread, coordinator, media session, and wire realtime session before each single mutation attempt. Map lost responses to outcome_unknown and never leave awaiting_user.
5. Add same-owner adapter tests with decoded Codex 0.151.0 fixtures covering start, SDP, readiness, every realtime/timeline case, pagination loops, merge order, identity mismatch, lost responses, stop, and cleanup. Run only focused sequential named 6G/1G transient systemd services for tests, strict typing, Oxlint, and formatting; report each unit's result and memory peak.

Approved seam: create src/shared/codex-realtime-host as the one declaration site for browser-media identities and host-facing types; src/ui/codex-realtime keeps its public names through exact re-exports, and repository policy enforces both the neutral root and the unchanged runtime-to-UI prohibition.

Review remediation: finalize exact item/thread closure while retaining transcript; make the adapter own and validate one canonical RealtimeState through transitionRealtimeState for every emission; replace the suffix dependency exception with exact resolved-path equality after Node rejection; replace private-identifier counting with exported-brand declaration scanning, hostile duplicate fixtures, and compile-time negative brand assignability.

6. Second race remediation: give the active session sole settlement ownership for the browser offer; make exact start errors reject once and make late RPC/SDP/started gates inert. Require active===session after every awaited mutation or recovery call, return typed stale/terminal outcomes after authoritative close, and suppress all post-close phase/diagnostic changes. Add manually deferred start, stop, and timeline tests that drive both resolve and reject races through the reducer-checked event recorder. Re-run only focused sequential named 6G/1G services and leave the task In Progress for rereview.

7. Final protocol remediation: keep the queued realtimeStart invocation for synchronous-throw capture, but revalidate pending settlement plus active/current binding inside that callback before making the RPC. If invalid, let dispose or binding-staleness own the already typed offer rejection and make zero server calls. Add focused invocation-window tests for immediate dispose, binding replacement, and synchronous throw plus canonical recovery/replacement.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parent approved the neutral shared contract extraction and expanded ownership only to the new shared module, exact UI import/re-export wiring, and boundary-policy enforcement. The wire protocol RealtimeSessionId remains the distinct src/shared/codex-workbench-identity brand; browser-media identity names will be explicit inside runtime code.

Implementation checkpoints: 08426a97935ea20a75ca893f3e2b64e4890c35fd extracts the single neutral host contract and exact UI re-exports; a33db45acf329dc02e8b652c84b9070079f81aa1 adds the Codex 0.151.0 V3 adapter, identity-bound transcript reducer, exhaustive timeline recovery, one-attempt commands, and same-owner tests.

Final focused evidence, every allocating command in a named transient systemd service with MemoryMax=6G and MemorySwapMax=1G: archboard-task1430203-final3-tests-08426a9.service passed 58 tests and 991 assertions across adapter, neutral-boundary, UI public API, and unchanged WebRTC media behavior at 51.6M peak and 0B swap; archboard-task1430203-final3-types-08426a9.service passed both TypeScript projects at 1.7G peak and 0B swap; archboard-task1430203-final3-lint-08426a9.service passed scoped Oxlint and Oxfmt at 543.9M peak and 0B swap; archboard-task1430203-final3-format-08426a9.service passed at 28.5M peak and 0B swap. git diff --check passed. The known high-memory codex-realtime-boundary compiler owner, broad fingerprint, browser, and OOM lanes were not run per delegation constraints; the new cheap neutral-boundary owner directly proves one declaration site, exact UI re-export routing, neutral runtime imports, and the continued runtime-to-UI ban.

Independent review found authoritative close left the active session commandable, semantic phase events bypassed the canonical transition reducer, the neutral dependency exception used a suffix match before Node rejection, and the one-owner brand test counted a private marker without proving type incompatibility. Remediation is scoped to these four findings; no UI/media behavior or public names will change.

Review remediation complete: authoritative item/thread closure now follows canonical stopping -> closed transitions, retains transcript/diagnostics, clears the active session, rejects post-close mutations, and permits a fresh replacement. Every adapter state emission is reduced through the neutral canonical transitionRealtimeState implementation; recovery is callable only from recoverable_error and successful recovery detaches the old session. The dependency exception now rejects Node first and allows only exact resolved equality to src/shared/codex-realtime-host/index.ts, with cheap hostile fixtures. Brand ownership scans exported declarations across .ts/.tsx/.mts and compile-time @ts-expect-error assertions prove all browser IDs are mutually incompatible and browser/wire session IDs are incompatible both ways. Validation: archboard-task1430203-remediate-final-tests2-08426a9.service passed 13 focused tests / 74 assertions at 47.5M peak, 0B swap; archboard-task1430203-remediate-final-types4-08426a9.service passed both TypeScript projects at 1.7G, 0B swap; archboard-task1430203-remediate-final-scoped-lint2-08426a9.service passed at 611.2M, 0B swap; formatting passed in archboard-task1430203-remediate-final-format7-08426a9.service at 1.5G, 0B swap. The known compiler-heavy codex-realtime-boundary owner was attempted once in archboard-task1430203-remediate-tests-08426a9.service and hit the mandated 6G/1G ceiling; it was not retried. Its new exact-path cases are also covered by the passing cheap dependency owner.

Second review found two protocol races: exact start errors could leave the browser offer pending and later gates could attempt illegal transitions; authoritative close could be followed by stop/recovery completion paths that emitted transitions from closed. Remediation owns settlement and terminal generation in the adapter only; the shared/UI boundary work remains unchanged.

Second race remediation complete. Start settlement now has one owner: an exact negotiating thread/realtime/error marks the offer settled, emits the legal recoverable transition, and rejects once; start RPC completion and SDP/started gates are phase-aware and inert after settlement. Active generation identity is now part of every post-await currentness check. A close during stop, recovery, appendText, or appendSpeech therefore returns outcome_unknown/response_lost without diagnostics or phase changes; stop and recovery also guard their own post-await reducers. Deferred tests cover error then RPC reject, error then RPC success plus late SDP/started, SDP/started competing before error, stop resolve/reject after close, recovery resolve/reject after close, and append completion after close. Final focused evidence: archboard-task1430203-race-final2-tests-f1c161e.service passed 20 tests / 107 assertions at 47.2M peak, 0B swap; archboard-task1430203-race-final2-types-f1c161e.service passed both TypeScript projects at 1.6G peak, 0B swap; archboard-task1430203-race-final2-lint-f1c161e.service passed scoped Oxlint at 607.9M peak, 0B swap; archboard-task1430203-race-final2-format-check-f1c161e.service passed at 1.6G peak, 0B swap. git diff --check passed. Known OOM lanes were not run.

Final review isolated one pre-invocation race in the queued realtimeStart callback. This follow-up changes only invocation ownership and its deferred tests; all boundary and post-invocation fixes remain protected.

Final pre-invocation remediation complete. The scheduled realtimeStart callback now checks answer settlement and the exact active/current binding before invoking Codex. Immediate dispose owns and rejects the offer before the callback, so the callback makes zero RPC calls. A replaced binding finalizes the never-started generation and rejects once with a reducer-valid stopping/closed sequence. Synchronous realtimeStart throws remain inside the promise chain, enter failStart once, and can recover through the canonical timeline path before a replacement session starts. Final evidence: archboard-task1430203-invoke-final-tests-5710f74.service passed 23 tests / 123 assertions at 46M peak, 0B swap; archboard-task1430203-invoke-final-types-5710f74.service passed both TypeScript projects at 1.5G peak, 0B swap; archboard-task1430203-invoke-final-lint-5710f74.service passed scoped Oxlint at 566M peak, 0B swap; archboard-task1430203-invoke-final-format-check-5710f74.service passed at 1.5G peak, 0B swap. git diff --check passed. Known OOM lanes were not run.

Final acceptance mapping after two independent clean reviews of e53d27a7deabf067b4aecf7a12655eececd06f8c..9ed1b74bbf0937c83cebb56ca747ab8b3aa54e56:
1. Exact V3/WebRTC/audio/breeze/bemTags envelope, unique wire identity, fresh semantic item, and fixed instructions are proved by the adapter envelope tests in the accepted 58-test lane.
2. SDP and readiness remain separate, exact child/epoch/thread/session/version gates; empty start and every pre/post-invocation ordering are covered by adapter and deferred race tests.
3. Decoded item-scoped transcript events alone mutate canonical content; thread error/close and rejected flat/audio paths only affect phase or diagnostics, proved by decoded notification tests.
4. Timeline recovery exhausts pages, detects cursor loops, and merges stable identities in deterministic order without duplicates, proved by the paging and live-merge tests.
5. Every append, stop, and recovery path revalidates the captured active generation around one attempt; lost and terminal races return typed outcomes, no path emits awaiting_user, and close wins over in-flight work.
6. Same-owner decoded adapter and race suites cover start, exact gates, item/thread events, paging, mismatch, lost response, authoritative close, stop, cleanup, synchronous throw, and all requested invocation races with reducer-valid state streams.
There are no task-specific or project-configured Definition of Done checklist items. Accepted gates: 23 tests/123 assertions in the final race lane, earlier 58/991 and 13/74 focused lanes, both TypeScript projects, scoped lint, formatting, diff checks, and two independent clean reviews. Known compiler-heavy, broad repository/module/browser/fingerprint, and OOM lanes remain intentionally unrun under the task constraints.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-31 12:38
---
PLAN_APPROVAL_REQUIRED: runtime cannot import src/ui/**, but RealtimeHost and its opaque browser-media brands exist only in src/ui/codex-realtime. A sound implementation needs a neutral shared host-contract extraction and unchanged UI re-exports, or an explicit rejected alternative such as a runtime-to-UI type import, duplicated lookalike contract, or casts.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the sole Codex 0.151.0 realtime adapter behind one neutral browser host contract. It sends the exact V3 WebRTC request, correlates SDP/readiness and decoded events, owns canonical reducer-valid phase/transcript state, exhausts timeline recovery, classifies one-attempt mutation outcomes, and makes authoritative close or pre-invocation invalidation win every async race. Verified by accepted focused lanes totaling 58/991, 13/74, and 23/123; both TypeScript projects; scoped lint, formatting, diff checks; and two clean independent reviews.
<!-- SECTION:FINAL_SUMMARY:END -->
