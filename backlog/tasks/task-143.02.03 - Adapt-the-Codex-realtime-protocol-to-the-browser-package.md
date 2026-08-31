---
id: TASK-143.02.03
title: Adapt the Codex realtime protocol to the browser module
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 13:01'
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
- [ ] #1 Each start mints a unique realtimeSessionId and sends outputModality audio, version v3, WebRTC, includeStartupContext true, clientManagedHandoffs false, delegationAckFiller true, flushTranscriptTailOnSessionEnd true, codexResponsesAsItems false, handoff mode bemTags, exact voice breeze, one fresh developer semantic item, and canonical start/end instructions; there is no selector or fallback.
- [ ] #2 The empty start response conveys no SDP/readiness; answer comes only from matching thread/realtime/sdp and readiness only from matching thread/realtime/started child, thread, session, and version.
- [ ] #3 Only item-scoped realtime item started/transcript delta/completed events create canonical transcript. Thread-only error/closed and flat transcript events update diagnostics/phase but never content; WebSocket appendAudio/outputAudio paths are rejected.
- [ ] #4 Recovery exhausts thread/timeline/list, detects cursor loops, and merges pages with live item events by stable identity without duplicate, hidden gap, or reordered turn.
- [ ] #5 appendText, appendSpeech, stop, and recovery revalidate captured child/epoch/thread/coordinator/session before one attempt; lost responses are outcome_unknown, uncertain approval falls back visual, and no path leaves awaiting_user.
- [ ] #6 src/runtime/codex-realtime/tests/adapter.test.ts drives decoded 0.151.0 fixtures through start, SDP, readiness, every item/thread/timeline event, paging/recovery, identity mismatch, lost response, stop, and cleanup, proving canonical transcript order and every closed failure outcome.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Resolve the frozen contract seam before implementation: move the host-facing correlation, transcript, event, request, and outcome types plus their opaque browser-media brands into one neutral shared root entrypoint; keep src/ui/codex-realtime's public names unchanged by importing and re-exporting those exact types. Runtime then imports only the neutral public entrypoint. This requires parent approval and ownership for shared/UI policy changes.
2. Add src/runtime/codex-realtime with one public factory and private reducer. Consume CodexSession, IdentityAuthority, semantic-context, instructions, and protocol values only through their root entrypoints. Mint one wire realtimeSessionId per start, build the exact V3/WebRTC/breeze/bemTags request, and accept SDP/readiness only after exact captured identity checks.
3. Reduce only item-scoped live events into canonical transcript records, classify thread-level error/closed and forbidden audio/WebSocket events as phase/diagnostic changes, and preserve one stable item identity/order across live delivery and recovery.
4. Exhaust timeline pages with repeated-cursor detection, merge recovered and live entries deterministically, and revalidate child, epoch, linked thread, coordinator, media session, and wire realtime session before each single mutation attempt. Map lost responses to outcome_unknown and never leave awaiting_user.
5. Add same-owner adapter tests with decoded Codex 0.151.0 fixtures covering start, SDP, readiness, every realtime/timeline case, pagination loops, merge order, identity mismatch, lost responses, stop, and cleanup. Run only focused sequential named 6G/1G transient systemd services for tests, strict typing, Oxlint, and formatting; report each unit's result and memory peak.

Approved seam: create src/shared/codex-realtime-host as the one declaration site for browser-media identities and host-facing types; src/ui/codex-realtime keeps its public names through exact re-exports, and repository policy enforces both the neutral root and the unchanged runtime-to-UI prohibition.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parent approved the neutral shared contract extraction and expanded ownership only to the new shared module, exact UI import/re-export wiring, and boundary-policy enforcement. The wire protocol RealtimeSessionId remains the distinct src/shared/codex-workbench-identity brand; browser-media identity names will be explicit inside runtime code.

Implementation checkpoints: 08426a97935ea20a75ca893f3e2b64e4890c35fd extracts the single neutral host contract and exact UI re-exports; a33db45acf329dc02e8b652c84b9070079f81aa1 adds the Codex 0.151.0 V3 adapter, identity-bound transcript reducer, exhaustive timeline recovery, one-attempt commands, and same-owner tests.

Final focused evidence, every allocating command in a named transient systemd service with MemoryMax=6G and MemorySwapMax=1G: archboard-task1430203-final3-tests-08426a9.service passed 58 tests and 991 assertions across adapter, neutral-boundary, UI public API, and unchanged WebRTC media behavior at 51.6M peak and 0B swap; archboard-task1430203-final3-types-08426a9.service passed both TypeScript projects at 1.7G peak and 0B swap; archboard-task1430203-final3-lint-08426a9.service passed scoped Oxlint and Oxfmt at 543.9M peak and 0B swap; archboard-task1430203-final3-format-08426a9.service passed at 28.5M peak and 0B swap. git diff --check passed. The known high-memory codex-realtime-boundary compiler owner, broad fingerprint, browser, and OOM lanes were not run per delegation constraints; the new cheap neutral-boundary owner directly proves one declaration site, exact UI re-export routing, neutral runtime imports, and the continued runtime-to-UI ban.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-31 12:38
---
PLAN_APPROVAL_REQUIRED: runtime cannot import src/ui/**, but RealtimeHost and its opaque browser-media brands exist only in src/ui/codex-realtime. A sound implementation needs a neutral shared host-contract extraction and unchanged UI re-exports, or an explicit rejected alternative such as a runtime-to-UI type import, duplicated lookalike contract, or casts.
---
<!-- COMMENTS:END -->
