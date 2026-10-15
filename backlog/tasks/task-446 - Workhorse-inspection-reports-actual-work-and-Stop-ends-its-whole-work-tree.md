---
id: TASK-446
title: Workhorse inspection reports actual work and Stop ends its whole work tree
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 19:57'
updated_date: '2026-10-15 08:51'
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
This task gives users and the coordinator inspectable work and one reliable Stop operation. ADR 0048 defines the agreed behavior.

Affected proposals: Codex workhorse@TASK-446, Voice coordinator@TASK-446, and Agent workbench@TASK-446.

1. Reproduce the incident through the existing operations contract fixtures. Use real thread summaries with empty turns, canonical source metadata, and distinct coordinator and workhorse turn identities.
2. Keep inspection and Stop inside codex-workhorse-operations. Add internal inspection.ts and stop.ts helpers rather than a new controller or service. Derive wire types from the generated Codex contract.
3. Build inspection from authoritative turn and item pages, thread state, native descendant pages, and the owned queue. Bound recent history. Report unavailable reads explicitly. Fix provenance against canonical Codex source and existing Archboard ownership records. Do not infer an empty queue from refusal.
4. Use the same authoritative workhorse turn lookup for steering. Remove the coordinator turn identity from the expected target. Preserve stale-target refusal.
5. Add stop_workhorse to the reviewed coordinator contract and dispatcher. Route the workbench Stop action through the same operations owner. Preserve operation staging, epoch outcomes, serial mutation ordering, tab ownership, and existing coordinator callbacks.
6. Record stopping before effects. Refuse new submissions through every local path, including delegation, queue additions, direct browser input, and thread creation. Keep inspection and recovery available. Preserve this refusal after partial or unconfirmed outcomes. Derive recovery state from existing durable operation records rather than another ledger.
7. Enumerate every native descendant through ancestorThreadId with pagination and without the top-level interactive source filter. Authorize cancellation through proven root ownership and native ancestry only. Preserve restrictions on ordinary input to sub-agents.
8. Interrupt the root and active ancestors first. Clear pending requests on affected threads. Interrupt active descendants and observe each targeted turn ending. Re-read and enumerate again for late accepted children, mailbox-triggered restarts, and natural-completion races.
9. Bound settlement through shared timing constants. An interrupt acknowledgment starts observation and never proves success. Return progress promptly through the existing callback path so voice remains usable. Report complete only after all observed work ends and pending requests are empty. Name remaining work and recovery actions for partial or unconfirmed results. Preserve other tabs and the shared Codex process.
10. Distinguish a workhorse turn ending from the whole work tree stopping in coordinator news and outcome reporting. After success, accept only a fresh explicit user request. Recovery can inspect or retry Stop without restarting work.
11. Use the cheapest contract owners for the original metadata failures, steering identity, nested and late descendants, interrupted queues, late restarts, partial failures, empty work, and tab isolation. Exercise both Stop entry points against the shared operation. Avoid prose snapshots and duplicate upstream protocol tests.
12. Run focused tests and bun run check. Inspect the proposals against the built code, read their code findings and commit footprints, and restate drafts if another task changed their parents. Adopt only when implementation meets the acceptance criteria. Pause to simplify before closing.

The drafts preserve current board content. Existing container entry points remain unchanged. The workbench gains a caller of workhorse operations. Operations gain explicit inspection and interruption relationships with the existing Codex session.
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
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-10-15 08:51
---
TASK-472.11 adds the coordinator tool stop_workhorses (archboard_workhorse namespace, no input), which calls the tab session's stopWork(null) and answers {stopped: [{checkout, outcome: interrupt_sent | idle}]}; the coordinator instructions say to call it when the person asks to stop and to claim a stop only on workhorse news that the turn ended. TASK-446 deepens stopWork (sub-agents, pending requests, observed end of work, ADR 0048) and adds no second tool.
---
<!-- COMMENTS:END -->
