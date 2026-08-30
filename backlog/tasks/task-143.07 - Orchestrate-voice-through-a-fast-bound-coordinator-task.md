---
id: TASK-143.07
title: Orchestrate voice through a fast linked coordinator thread
status: To Do
assignee: []
created_date: '2026-08-30 14:13'
updated_date: '2026-08-30 14:45'
labels: []
dependencies:
  - TASK-143.01
  - TASK-143.05
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/agent-workbench-ui-library-research.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 169000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Give each thread link between a pane and workhorse one persistent, inspectable Codex coordinator thread for low-latency voice conversation. The coordinator is a normal capable thread in the same Archboard ownership domain, with a globally configured fast model, effort, preferred priority service, ordinary workbench sandbox and approvals, exact role instructions, host-bound workhorse operations, and event-driven callbacks. It answers and investigates directly when that is fastest, performs only bounded immediate board actions itself by default, and delegates, queues, or steers sustained work only where the target thread can receive the required Archboard context safely.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A controllable thread link between a pane and workhorse can explicitly create or reuse exactly one linked coordinator thread in the same Archboard ownership domain. It persists across voice stops and starts while the thread link remains valid, is never written into the board note, and is invalidated with the link on child exit or explicit rebind.
- [ ] #2 Global workbench settings select the coordinator model and effort, initially gpt-5.6-luna and medium. The runtime exhausts model/list pagination and requires that model's supportedReasoningEfforts to contain the selected effort. It sends the selected model, config.model_reasoning_effort, and serviceTier priority on thread/start when that model advertises priority in serviceTiers; otherwise it visibly starts with the model's default tier. Unavailable model or effort disables coordinator start with an actionable reason
- [ ] #3 The coordinator receives the ordinary workbench sandbox and approval policy and may use normal Codex web, shell, repository, and Archboard capabilities. Its exact instructions make direct investigation and answers the default for quick questions, allow one explicit unambiguous Archboard operation as one canonical write under claim, doing, version, and one-write rules, and make sustained code or repository mutation and multi-step work default to workhorse delegation
- [ ] #4 The archboard_workhorse namespace contains exactly inspect_workhorse, delegate_to_workhorse, manage_workhorse_queue, and steer_workhorse. A separate archboard_voice namespace contains exactly resolve_spoken_approval with the tagged verdict schema defined below. The host supplies every bound identity and rejects caller-selected targets, cross-ownership-domain threads, prior-epoch state, unknown operations, and self-targeting. Neither namespace exposes a wait operation.
- [ ] #5 delegate_to_workhorse starts an idle workhorse turn with exact Archboard additionalContext. It may use thread/queue/add only for an Archboard-created workhorse whose persisted developerInstructions and dynamic-tool manifest are proven to match; an attached busy workhorse can receive a related correction only through turn/steer with exact additionalContext and expectedTurnId, while unrelated work is refused with an actionable wait-until-idle reason rather than queued without context. Every delegation has stable correlation in both timelines.
- [ ] #6 A global workhorse-intervention setting offers Explicit corrections, Coordinator judgment, and Never steer, defaults to Explicit corrections, is shown on the linked coordinator, and applies only to future decisions. Under the default, steer_workhorse accepts only a clear user correction, narrowing, or change to the active assignment. Unrelated work is queued only for a manifest-matched Archboard-created workhorse; an attached busy workhorse receives the actionable refusal defined above.
- [ ] #7 The coordinator never blocks in a wait tool. The session reduces authoritative workhorse turn, exhaustive queue, failure, and pending-request events into stable callback records keyed by child, coordinator, workhorse, source event and correlation. With voice inactive, a callback is appended once to coordinator history through thread/inject_items without starting a turn. With voice active, it is appended once as realtime developer context and only terminal or attention policy may request speech. Delivery is buffered while a coordinator turn or dynamic call is active, never reenters that call, and resumes in order after settlement; browser reconnect rehydrates the ledger only on the same child.
- [ ] #8 Coordinator and workhorse retain separate canonical app-server timelines. The workbench cross-links each delegation, queued submission, queue mutation, steer, attention event, callback, and terminal result without presenting the two agents as one history
- [ ] #9 The normal coordinator thread model, not the realtime backing model, is the spoken-approval classifier. Realtime V3 has no typed dynamic-tool path: a final spoken reply must first produce a V3 delegation into a later ordinary coordinator turn, and only that turn may call archboard_voice.resolve_spoken_approval with {approvalId, verdict: accept|decline}. The host validates the typed verdict against its stored record and never trusts model-supplied request details. A request that is itself blocking the coordinator turn is visual-only; every request class is otherwise eligible when the coordinator is free, one-time accept or decline is actually offered, and exactly one global pending slot is available.
- [ ] #10 The spoken gate is an atomic none -> presenting -> awaiting_user -> resolving -> accepted|declined|expired/cancelled state machine. Its immutable record includes approvalId, child epoch, coordinator thread, requesting thread, turn, call or JSON-RPC request, realtime session, exact stored description, target state token, effect fingerprint, offered decisions, and expiry. The host speaks the stored description with thread/realtime/appendSpeech and enters awaiting_user only after the session-scoped final assistant transcript matches the expected description sequence; 0.151.0 supplies no correlated speech item ID, so this residual voice race is explicitly accepted and named in UI/docs. Resolution compare-and-swaps every identity and state before setting resolving, executes only the stored effect once, and expires on timeout, target change, realtime close, child or coordinator replacement, or visual resolution. Duplicate, stale, early, ambiguous, or mismatched replies are inert. A coordinator dynamic effect returns approval_required before waiting for speech so its original item/tool/call is never left blocking the classifier turn.
- [ ] #11 Generated-contract and real-process tests cover coordinator reuse, model validation, priority fallback, all intervention settings, direct one-write board action, idle delegation, Archboard-created busy queue add and exhaustive list, mixed-entry-preserving update/cancel/reorder, thread/queue/start after interruption, attached-busy steer or refusal with exact context, no-wait responsiveness, inactive and active callback delivery, no reentrant callback during a dynamic call, every target and prior-epoch refusal, coordinator-free spoken accept and decline, coordinator-blocked visual-only fallback, second-request refusal, description correlation, every expiry and compare-and-swap race, and child-exit invalidation. TASK-143.03 and TASK-143.04 exclusively own rendered coverage.
<!-- AC:END -->
