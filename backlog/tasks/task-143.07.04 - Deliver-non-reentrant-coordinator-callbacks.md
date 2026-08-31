---
id: TASK-143.07.04
title: Deliver non-reentrant coordinator callbacks
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-31 21:28'
labels: []
dependencies:
  - TASK-143.01.07
  - TASK-143.02.03
  - TASK-143.06.01
  - TASK-143.07.01
  - TASK-143.07.03
  - TASK-143.01.16
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-coordinator-callbacks
  - tests/system/canvas-state/callback-hot-reload.test.ts
  - tests/system/fixtures/callback-hot-entry.ts
  - docs/design/codex-workbench-authored-contracts.md
  - tests/system/repository-policy/codex-authored-contracts.test.ts
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 195000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deliver non-reentrant coordinator callbacks from normalized semantic and workhorse-operation events using a closed callback union and canonical developer-role bytes. The callback path never blocks in wait_threads.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The closed callback union covers operation accepted/queued/started/progress/attention/completed/failed/outcome_unknown and semantic change/focus/selection with immutable operation/thread/turn/queue/session correlation.
- [ ] #2 After dequeue, the module revalidates current child/coordinator/realtime/link and chooses exactly one path: active realtime appendText, or inactive inject_items only for operation/queue/attention callbacks; semantic callbacks are silent while voice is inactive.
- [ ] #3 Each callback uses exactly one developer-role message with one input_text part matching the canonical bytes, is attempted once, and settles delivered/not_delivered/outcome_unknown without fallback retry to the other path.
- [ ] #4 Buffer order, coalescing, callback-during-callback, active-to-inactive race, stale session/link, child exit, lost response, reload, and bounded overflow are tested with no reentrant turn or duplicate narration.
- [ ] #5 src/runtime/codex-coordinator-callbacks/tests/callbacks.test.ts exhausts the closed callback union, realtime/inject routing, ordering, coalescing, reentrancy, lifecycle races, stale identity, overflow, reload, and every delivery outcome using the canonical bytes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the accepted callback encoder, routing, and authority code unchanged. Remove the ordinary bun:test query-wrapper reload claim and its test-only subscription instrumentation.
2. Add an owned callback hot-process fixture that starts under bun --hot, watches a random temporary generation token, and cache-busts the production codex-coordinator-callbacks public module for each generation. Each generation calls the public installCodexCoordinatorCallbacks against one kept record.
3. Add a focused system owner that writes generation 2 to the watched token, waits for the same process to report a second callback graph evaluation, and proves changed installer identity, one retained callback identity, one four-listener cohort, one delivery and narration for one source event, and exactly four cleanup calls after repeated disposal. Kill the process group and remove the temporary directory on every path.
4. Run the focused hot-process owner and callback/encoder owners, both TypeScript graphs, scoped lint/format, authored policy, inventory, diff, clean tree, file lengths, source restrictions, and protected artifact checks in sequential capped transient units. Preserve known broad OOM evidence without rerunning those lanes.
5. Keep TASK-143.07.04 In Progress with every acceptance criterion unchecked for independent rereview.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the closed coordinator callback boundary in src/runtime/codex-coordinator-callbacks. Normalization covers all eight workhorse operation events plus semantic change/focus/selection with frozen correlation; the instance-scoped coordinator uses a bounded FIFO, eligible coalescing, non-reentrant draining, post-dequeue child/epoch/coordinator/link/session revalidation, active appendText or inactive operation/queue/attention inject_items routing, silent inactive semantic callbacks, one canonical developer message, and one-attempt delivered/not_delivered/outcome_unknown settlement without wait_threads or fallback. Implementation commit: b1f76af0 from fixed BASE 5842f4383bed569d876d0a05e747e551b49b74e9. Final capped validation in archboard-1430704-finalval-02.service with cgroup path printed: scoped Oxfmt check passed for 7 files; scoped Oxlint passed with 0 warnings/errors; both TypeScript graphs passed; focused callbacks passed 7 tests and 140 assertions; repository test inventory passed 39 tests and 69 assertions; git diff --cached --check passed before commit. Preserved known mandated 6G plus 1G capped-OOM fingerprints for the repository boundary, module-scope, and broad repository-policy owners; those lanes were not rerun. Protected /home/msc/Projects/archboard/src-DlBR1tzg.js remains 1,516,136 bytes with SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Task remains In Progress and acceptance criteria remain unchecked pending independent review.

Remediation of reviewer findings 1-5 replaces generic context delivery with deterministic closed callback bytes, coordinator-only inactive injection, and a narrow developer-role realtime session adapter. Each enqueued callback freezes the accepted binding revision, exact classifier target and durable provenance, plus wire/browser realtime generation when active. Delivery classifies that exact target as its last asynchronous authority read, then synchronously rechecks child, ready coordinator, binding, callback correlation, and generation before one RPC. Post-attempt authority loss settles outcome_unknown with no fallback. The authored contract now pins the byte grammar and route policy. Focused owners split below 500 lines and cover all eleven variants, exact snapshot bytes, hostile mutation and bounds, queue tuples, semantic focus/selection, inactive operation families, active developer request shape, authority races, one-attempt outcomes, FIFO/coalescing/overflow, listener cleanup, disposal, and kept reload subscriptions.

Final capped validation: archboard-1430704-remediate-final-01.service printed cgroup and passed 17 callback tests, 21 affected session/realtime/thread-link tests, both TypeScript graphs, scoped Oxlint, scoped Oxfmt check, 44 authored-contract and inventory tests, staged diff check, clean unstaged diff, source lengths, and protected artifact hash/size. archboard-1430704-remediate-sourcegate-03.service separately proved no casts, wait dependency, RealtimeHost, or user role in callback lib and exactly one realtimeAppendText plus one threadInjectItems call site. Preserved known 6G plus 1G capped-OOM fingerprints for broad repository boundary, module-scope, and repository-policy owners; those lanes were not rerun. Protected artifact remains 1,516,136 bytes with SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Task remains In Progress and all acceptance criteria remain unchecked for independent rereview.

Second remediation pass closes the accepted rereview gaps. The encoder now applies the 1,024 UTF-8 byte ID limit to both correlation.queuedSubmissionId and each queuedSubmissionIds entry. Focused tests cover 1,024-byte ASCII and multibyte acceptance plus 1,025-byte rejection for both locations. Queue validation now uses the exact add, update, delete, reorder, and start RPC table; every valid pair serializes and every rotated hostile mismatch fails before encoding. The authored contract and reviewed digest pin both rules.

Reload evidence now imports a focused fixture with generation=1 and generation=2 query tokens around one kept record. Both module generations have distinct evaluation identities and call the public installer. They reuse one callback instance and one four-listener cohort. One emitted operation produces one delivery, and repeated disposal leaves exactly four cleanup calls.

Capped validation archboard-1430704-remediate2-final-01.service printed its cgroup and passed 19 callback/encoder/reload tests, 21 affected session/realtime/thread-link tests, both TypeScript graphs, scoped Oxlint and Oxfmt, 44 authored-contract and inventory tests, staged diff, clean unstaged diff, all callback TypeScript files at or below 500 lines, source restrictions, and the protected artifact check. Known broad capped-OOM fingerprints were preserved and not rerun. The protected artifact remains 1,516,136 bytes with SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Task remains In Progress with every AC unchecked for independent rereview.

Third remediation supersedes the prior second-pass reload statement: the query-token fixture did not prove a callback module reload because its wrapper generations statically reused the cached callback index. That fixture and its test-only subscription instrumentation are removed.

The replacement owner launches an owned bun --hot process, watches a random temporary generation token, and directly cache-busts the production codex-coordinator-callbacks public module on each generation. Both generations call the public installer against one kept record. Process-visible assertions prove the same PID reaches generation 2, the production installer identity changes, the callback instance identity is retained, exactly one four-listener cohort remains, one emitted operation causes one delivery and one narration, repeated disposal produces exactly four cleanup calls, and only two protocol records exist. Process-group termination and temporary-directory removal run on every success or failure path.

Final capped validation archboard-1430704-remediate3-final-03.service printed cwd and cgroup, completed successfully with MemoryMax=6G and MemorySwapMax=1G, and passed the real hot-reload owner, callback suite, both TypeScript graphs, scoped Oxlint and Oxfmt, authored-contract and inventory owners, staged/unstaged diff checks, file-length and source restrictions, and exactly two route callsites. Peak memory was 1.7G with no swap. Known broad capped-OOM lanes were preserved and not rerun. Protected /home/msc/Projects/archboard/src-DlBR1tzg.js remains 1,516,136 bytes with SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Task remains In Progress with every acceptance criterion unchecked for independent rereview.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-31 20:50
---
Remediation started from reviewer findings 1-5. Acceptance criteria remain unchecked and the task remains In Progress.
---

author: @codex
created: 2026-08-31 21:07
---
Remediation is ready for independent rereview. Task status and acceptance criteria intentionally remain unchanged.
---

author: @codex
created: 2026-08-31 21:12
---
Second remediation pass started for the accepted singular-ID, queue-pair, and real module-generation findings. Status and acceptance criteria remain unchanged.
---

author: @codex
created: 2026-08-31 21:18
---
Second remediation pass is ready for independent rereview. Status and acceptance criteria remain unchanged.
---

author: @codex
created: 2026-08-31 21:22
---
Third remediation pass replaces the cached query-wrapper test with an owned bun --hot system owner that directly cache-busts the production callback public module.
---

author: @codex
created: 2026-08-31 21:28
---
Third remediation is ready for independent rereview. The previous query-wrapper reload claim is explicitly superseded; status and acceptance criteria remain unchanged.
---
<!-- COMMENTS:END -->
