---
id: TASK-446
title: Workhorse inspection reports actual work and Stop ends its whole work tree
status: In Progress
assignee:
  - '@claude'
created_date: 2026-10-07 19:57
updated_date: '2026-11-13T00:16:00Z'
labels:
  - voice
  - coordinator
  - workhorse
dependencies: []
references:
  - src/runtime/codex-workhorse-operations
  - src/runtime/codex-coordinator-tools
  - src/server/archboard/lib/codex-workbench-session-bindings.ts
documentation:
  - docs/adr/0048-a-workhorse-stop-ends-the-whole-work-tree.md
priority: high
type: bug
ordinal: 729000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the October 7 voice session, inspection returned active status with no turn identity. The coordinator twice claimed that work stopped without sending an interruption. Queue access rejected the owned workhorse, and manual interruption left a spawned agent running. The user needs one reliable stop across speech and the workbench, with evidence of what ended. See ADR 0048 and the session trace in the implementation notes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Inspection reports the current request, authoritative active turn, recent progress, spawned agents, pending requests, and observed stop result. Failed reads remain visibly unavailable.
- [ ] #2 Queue operations recognize the genuine owned workhorse using canonical source and ownership evidence. Inspection never substitutes an empty queue after a failed ownership test.
- [ ] #3 Steering targets the current workhorse turn and rejects stale targets. It never uses the coordinator turn identity.
- [ ] #4 Spoken Stop and workbench Stop interrupt current work and all spawned descendants, clear pending requests, and preserve voice and unrelated tab sessions.
- [ ] #5 Stop accounts for descendants accepted during cancellation and work that restarts during settlement. Success requires evidence that all affected work ended.
- [ ] #6 New work is refused during stopping or an unresolved stop. After confirmed completion, only a fresh explicit user request starts work.
- [ ] #7 Partial or unconfirmed outcomes name remaining work and recovery actions. A request acknowledgment or missing turn identity never proves a successful stop.
- [ ] #8 Fast contract tests reproduce the original failures and cover source metadata, real API summary shapes, cancellation races, empty work, partial failure, and tab isolation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
This plan replaces the plan of October 7. The code moved since then: the coordinator tools live in runtime/voice/coordinator/tools-and-work, TASK-472.11 added stop_workhorses, and stopWorkhorses in server/sessions/services/workhorses.ts only interrupts the running turn. TASK-446 deepens that stop and adds no second tool. ADR 0048 defines the behavior.

Proposal: "A workhorse stop ends its whole work tree" (BlKbD4yG), model vKEsyHFk, on Current TGDLt5Ea. It replaces the shelved drafts 93RlBGLx, yM7DOqT4 and zFIdZB1Y, which stood on pre-canonical board states.

1. Add server/sessions/services/stop.ts (Work tree stop). It marks the workhorse stopping before any effect. Each pass reads the workhorse thread, lists its sub-agents at any depth through thread/list with ancestorThreadId and every source kind, deletes each queued request of each thread, and interrupts each running turn, the workhorse first. It repeats until one pass after the last interrupt sees no running turn and no queued request, or a shared settle time from @archboard/timing runs out. The outcome is stopped, idle, partial or unconfirmed, with the remaining threads and the recovery actions.
2. Keep the stop phase in the workhorse state. Stopping, partial and unconfirmed refuse new work. After a confirmed stop, the coordinator turn that asked for it cannot start work. Tab sessions guard every entry that starts work: operations delegate, steer and queue changes, the queue component (browser queue and explanations), New conversation, ensureStarted, and typed start and steer.
3. Route the workbench Stop (the interrupt command of Typed message actions) and the coordinator's stop_workhorses through the same stop. Widen the stop_workhorses result to the observed outcome, the remaining work and the recovery, and update the coordinator instructions.
4. Inspection reads turns through thread/turns/list, the request and recent progress of the running turn, sub-agents through thread/list, and the queue only for the created workhorse. A failed read is listed as unavailable, never empty. inspect_workhorse adds the last stop outcome.
5. Steering reads the running workhorse turn itself and sends it as expectedTurnId. The coordinator call's turn is no longer an input.
6. Fast contract tests: the incident reproduction (summary with empty turns, distinct coordinator and workhorse turns), canonical source metadata, nested and late sub-agents, a restart during settlement, partial and unreadable outcomes, empty work, refusal during and after a stop, and tab isolation.
7. Run focused tests and bun run check, rebase onto main, reconcile the proposal with any new Current (TASK-319 is being adopted in parallel), adopt it, and finalize the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Planning only. Runtime implementation has not started.

The October 7 incident used coordinator 01a117d2-d800-74e0-94d9-37c3d2975a8b and workhorse 01a117d2-d888-7f90-972a-dea970a32f39. The workhorse spawned 01a117d6-1747-7ae1-8f9d-9a02acb0781f.

Times are UTC. Delegation started at 19:26:04. The user requested Stop at 19:26:57. At 19:27:00, inspection returned active status, null activeTurnId, and an empty queuedSubmissionIds array. The coordinator claimed success at 19:27:02 and 19:27:38 without any interruption or steering call. The child started at 19:27:49. Queue access refused unknown_provenance. Manual interruption ended the workhorse at 19:28:23. The child continued until 19:33:19 and changed no files.

Persisted coordinator rollout lines 52 and 56 record delegation. Lines 79, 91, and 96 record the first Stop and false success. Lines 116, 128, and 133 record the second. Lines 154 and 159 record the queue refusal and correction. Workhorse lines 66 and 84 record child creation and interruption. Child line 132 records completion. The rollouts belong to the Archboard private Codex home, dated 2026/10/07.

Source evidence: codex-thread-link reads thread summaries and includeTurns:false fallbacks. Generated Thread.ts defines empty turns for those summaries. codex-workhorse-operations/lib/internal.ts scans that empty array for activeTurnId. lib/queue.ts exposes no promised progress. lib/link-provenance.ts requires provenance.threadSource archboard, but codex-session/lib/contract.ts uses canonical source vscode. codex-workbench-session-bindings.ts supplies the coordinator call turn as the steering target. The coordinator tool manifest has no Stop. codex-workbench-text-actions.ts interrupts one thread directly.

A read-only replay through the existing fixture returned active status with null activeTurnId and exited 1. It changed no repository files.

Protocol facts come from Codex rust-v0.160.1, commit c3e23d4c4385619ecec78408766e46b7fa7dd9ad. turn/interrupt targets one loaded thread and does not cascade. Its acknowledgment precedes turn/completed delivery. Native ancestry listing supports all-depth pagination. Interrupted durable queues pause. Accepted child input can survive parent cancellation. Pending mailbox input can start a later turn. The public API exposes no atomic tree-stop or spawn seal. Repeated observation therefore needs bounded partial and unconfirmed outcomes.

The board check passes with no diagnostics. semantic compare matches the planned module responsibilities and relationships. Current content remains unchanged. No proposal is adopted.

2026-10-17: this task's board proposals were rebuilt on the current architecture, which holds the board's calls as flows (TASK-482.07). Each is now named 'TASK-446 after TASK-482.07' on every board that had one (Agent workbench, Browser application, Codex workhorse, Voice coordinator, as applicable); the old 'TASK-446' drafts stood on parents later adoptions made historical, were renamed 'TASK-446 (before flows)' and shelved. A former name stays with the shelved draft, so read and adopt the new proposal by its new name. Calls of the change are steps of the board's flows.

2026-11-13: proposal 'A workhorse stop ends its whole work tree' (BlKbD4yG) created on Current TGDLt5Ea. archboard check --state BlKbD4yG reports 15 warnings, each for code that the plan adds: stop.ts (BINDING_PATH_MISSING, ANCHOR_PATH_MISSING), guardWorkhorse in sessions.ts and the interrupt anchor in text-actions.ts (ANCHOR_SYMBOL_MISSING). The drafts 93RlBGLx, yM7DOqT4 and zFIdZB1Y are shelved with a reason that names BlKbD4yG.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-10-15 08:51
---
TASK-472.11 adds the coordinator tool stop_workhorses (archboard_workhorse namespace, no input), which calls the tab session's stopWork(null) and answers {stopped: [{checkout, outcome: interrupt_sent | idle}]}; the coordinator instructions say to call it when the person asks to stop and to claim a stop only on workhorse news that the turn ended. TASK-446 deepens stopWork (sub-agents, pending requests, observed end of work, ADR 0048) and adds no second tool.
---
<!-- COMMENTS:END -->
