---
id: TASK-143.07
title: Orchestrate voice through a fast bound coordinator task
status: To Do
assignee: []
created_date: '2026-08-30 14:13'
updated_date: '2026-08-30 14:18'
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
Give each thread link between a pane and workhorse one persistent, inspectable Codex coordinator task for low-latency voice conversation. The coordinator is a normal capable task on the same owned app-server child, with a globally configured fast model, effort, preferred priority service, ordinary workbench sandbox and approvals, exact role instructions, host-bound workhorse operations, and event-driven callbacks. It answers and investigates directly when that is fastest, performs only bounded immediate board actions itself by default, and delegates or queues sustained work without blocking on or casually interrupting the workhorse.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A controllable thread link between a pane and workhorse can explicitly create or reuse exactly one linked coordinator on the same child. The coordinator persists across voice stops and starts while that thread link remains valid, is never written into the board note, and is invalidated with the thread link on child exit or explicit rebind
- [ ] #2 Global workbench settings select the coordinator model and effort, initially gpt-5.6-luna and medium. The runtime exhausts model/list pagination and requires that model's supportedReasoningEfforts to contain the selected effort. It sends the selected model, config.model_reasoning_effort, and serviceTier priority on thread/start when that model advertises priority in serviceTiers; otherwise it visibly starts with the model's default tier. Unavailable model or effort disables coordinator start with an actionable reason
- [ ] #3 The coordinator receives the ordinary workbench sandbox and approval policy and may use normal Codex web, shell, repository, and Archboard capabilities. Its exact instructions make direct investigation and answers the default for quick questions, allow one explicit unambiguous Archboard operation as one canonical write under claim, doing, version, and one-write rules, and make sustained code or repository mutation and multi-step work default to workhorse delegation
- [ ] #4 The coordinator dynamic namespace contains exactly inspect_workhorse, delegate_to_workhorse, manage_workhorse_queue, and steer_workhorse. The host supplies the bound workhorse identity and rejects caller-selected targets, cross-process tasks, unavailable thread links, replacement-child state, unknown operations, and self-targeting. No wait operation exists
- [ ] #5 delegate_to_workhorse starts an idle bound workhorse turn with the exact Archboard additional context or adds a busy request to the generated app-server thread queue. manage_workhorse_queue can list, update, cancel, and reorder only that workhorse's queued coordinator delegations. Every action has a stable correlation and appears in both linked timelines
- [ ] #6 A global workhorse-intervention setting offers Explicit corrections, Coordinator judgment, and Never steer, defaults to Explicit corrections, is shown on the linked coordinator, and applies only to future decisions. Under the default, steer_workhorse accepts only a clear user correction, narrowing, or change to the active assignment; unrelated requests are queued
- [ ] #7 The coordinator never blocks in a wait tool. Authoritative app-server workhorse turn, queue, failure, and pending-request events route through the bound session as callbacks; the coordinator inspects details on demand. Terminal and attention callbacks can become spoken updates, granular progress remains visual, and inactive-voice callbacks remain in coordinator history for the next startup brief
- [ ] #8 Coordinator and workhorse retain separate canonical app-server timelines. The workbench cross-links each delegation, queued submission, queue mutation, steer, attention event, callback, and terminal result without presenting the two agents as one history
- [ ] #9 The coordinator owns the accepted spoken-approval policy: it may classify any pending request as low risk with no host-side request-class exclusion. Only after the exact pending request is described may a contextual final user affirmation choose the offered one-time accept; spoken decline is allowed; partial transcripts, coordinator speech, session grants, and policy amendments never count. The UI and docs name that model classification is part of the security boundary
- [ ] #10 Generated-contract, process, and rendered tests cover coordinator reuse, model validation, priority fallback, all intervention settings, direct one-write board action, delegation, busy queue add/update/cancel/reorder, related steer, unrelated queue, no-wait responsiveness, event callbacks, linked timelines, every target refusal, contextual one-time spoken accept and decline, and child-exit invalidation
<!-- AC:END -->
