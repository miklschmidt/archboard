---
id: TASK-130.09
title: 'Convert bind, lock, and one-write proofs to native process tests'
status: To Do
assignee: []
created_date: '2026-08-28 01:05'
updated_date: '2026-08-28 06:12'
labels: []
dependencies:
  - TASK-130.01
  - TASK-086
  - TASK-130.06
references:
  - scripts/check-local-bind.mjs
  - scripts/check-lock.mjs
  - scripts/check-one-write.mjs
  - TASK-086
  - docs/adr/0016-one-writer-at-a-time-per-board.md
parent_task_id: TASK-130
priority: high
type: task
ordinal: 144000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
check-local-bind, check-lock, and check-one-write prove behavior that an in-process test cannot answer. Convert their orchestration and assertions to typed Bun tests while retaining real competing processes, real loopback sockets, and write counting on the wire.

TASK-086 owns generic canvas startup and cleanup. This task owns only the bind, lease-exclusion, claim and hold, and one-write product proofs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-local-bind, check-lock, and check-one-write are replaced by typed native system tests with no in-process substitute for their competing-process or wire observations.
- [ ] #2 Bind tests distinguish the owned child from a foreign or stale responder and preserve the public refusal and recovery behavior on loopback ports.
- [ ] #3 Lock tests run at least two real processes against one vault and preserve lease acquisition, denial, expiry or recovery, claim interaction, content revocation, and camera non-revocation behavior asserted today.
- [ ] #4 One-write tests count real note-changing requests through the proxy and prove each requested align, patch, promote, import, or batch action reaches the note as exactly one write under one lock acquisition.
- [ ] #5 Owned canvas processes use TASK-086 lifecycle behavior; proxy and competitor processes add equivalent typed ownership, bounded shutdown, stderr retention, exit waiting, and cleanup proof.
- [ ] #6 Assertion failure and interrupted-process fixtures leave no owned child, listener, proxy, lease, port, or vault and identify process death separately from a product assertion.
- [ ] #7 Every test source file is at most 500 lines and representative foreign-bind, double-writer, stale-lease, and accidental multi-write mutations fail before the legacy scripts are deleted.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Dependencies and real-process boundary. Keep TASK-130.01 and completed TASK-086, and add TASK-130.06 as an explicit dependency. Native authoring may overlap on its exact disjoint paths after TASK-130.01/TASK-086, but task completion and reconciliation wait for TASK-130.06 and import its tests/system/support/owned-canvas.ts for every healthy canvas. The foreign responder, failed start, competitor, and counting proxy remain real separate processes because those are the observations under test. Do not replace them with in-process calls, add a declaration shim, or change product behavior. TASK-130.11 owns final lane-name consolidation and final docs, not these predecessor deletions.

2. Exact module-owned mapping under src/runtime/engine/tests from the in-process portions of scripts/check-lock.mjs:
- board-lock-lease.test.ts owns free writes, held refusals and data, holder renewal, release authority, joined writes, lease expiry/recovery, wait relationships, canonical and nested lock-file identity, and unreadable stale lock recovery.
- board-lock-announcements.test.ts owns note-watch passenger failure, immediate held announcements, renewal silence, LOCK_FREE_LINGER_MS free announcements, eight-write read-only transition coalescing, and the one registered broadcast sink.
- board-claim.test.ts owns claim creation/reason, hold identity, twenty joined writes without gaps, extension, person takeover, revocation told once, camera versus content takeover, idle renewal, explicit deadline expiry, late release, and no-claim controls.
These tests import only the public board-lock, logger, and timing module-root entrypoints. They never inspect private lock implementation.

3. Exact tests/system-owned mapping under tests/system/process-contracts:
- scripts/check-local-bind.mjs -> local-bind.test.ts.
- scripts/check-lock.mjs real API/process cases -> board-lock-api.test.ts, cross-process-lock.test.ts, and lock-source-policy.test.ts.
- scripts/check-one-write.mjs -> element-ops-one-write.test.ts, apply-one-write.test.ts, promotion-delete-bridge-one-write.test.ts, import-one-write.test.ts, snapshot-one-write.test.ts, and write-boundary-policy.test.ts.
local-bind.test.ts exclusively owns exact child-PID health, IPv4 loopback binding, IPv6 refusal, foreign/stale responder distinction, same-port second-child failure, no-vault server and CLI refusals, stylesheet reachability, frontend-only static serving, dist and dotfile denial, public messages, exit statuses, and recovery without touching pre-existing files.

board-lock-api.test.ts exclusively owns pane initial lock state, human hold before edit, report joining its hold, agent wait/refusal body and current document/version, read/open exemptions, release broadcasts, two-pane contention, API claim/reason/doing, twenty writes under one claim, person takeover, partial-document told-once response, invalid claim authority, and cleanup. cross-process-lock.test.ts exclusively owns two real canvases over one vault, cross-process denial/recovery, lock-file visibility, watcher-originated remote hold broadcasts before touch, person takeover at the second canvas, no claim resurrection, and first-agent revocation. lock-source-policy.test.ts owns the existing one lock-path owner, one broadcast sender, one exported sink registration, and no other lock-directory access scan; it is a narrow architecture contract, not a second repository-policy framework.

element-ops-one-write.test.ts exclusively counts one real wire write for align, distribute, lock, unlock, group, ungroup, and the labelled/wired move, while retaining exact geometry, group membership, touched elements, labels, arrows, settlement, origin, and feed behavior. apply-one-write.test.ts exclusively owns mixed create/update/delete apply, minted IDs, compact touched and summary output, optional full document, invalid-ID zero-write refusal, isolated-copy atomic failure, browser versus agent classification, human hold settlement, and canonical document acknowledgement. promotion-delete-bridge-one-write.test.ts owns seven-line stencil promote/demote, missing target zero-write refusal, multi-delete and refusal, and two-part bridge create/remove as one write each with exact receipts.
import-one-write.test.ts owns image-bearing replace and merge import, exact elements/files/note bytes, single batch broadcast, held replace, source tagging, version, and no partial exposure. snapshot-one-write.test.ts owns element-only restore, cross-board zero-write refusal, empty file membership, repeat restore, held restore, exact broadcast/version/note results, and unchanged source snapshot. write-boundary-policy.test.ts proves that every note-changing request observed by the real proxy crosses the sole write boundary and therefore the sole lock-acquisition path, with no bypass. It does not duplicate proxy wire counts and adds no independent acquisition counter or instrumentation.

4. Same-owner support and fixtures. Add tests/system/process-contracts/support/owned-peer-process.ts as the single typed owner for non-canvas competitors and proxies in this task: explicit argv/env, PID, stderr, early exit, bounded SIGTERM then owned-PID SIGKILL, awaited exit, and idempotent dispose. It is not a canvas starter and does not compete with TASK-130.06. Add support/counting-proxy.ts for typed loopback forwarding and per-method/path write records, support/process-http.ts for request/response/body and liveness capture, and support/static-probes.ts for collision-safe dist probe creation/restoration. Add fixtures/import-scenes.ts and snapshot-scenes.ts for typed authored scene inputs only. Expected counts, statuses, bytes, order, and state transitions remain in owning tests. Each test, support, and authored TS fixture is at or below 500 physical lines. No general process/test framework, mutable global fixture, or declaration-only shim.

5. Protected behavior, timings, and cleanup. Preserve real process competition and loopback wire counting; exact health.pid ownership; all public exit/status/body/stderr distinctions; twenty-write claim sequences; the exact proof chain in which the real proxy proves one note-changing write request per intent and write-boundary-policy.test.ts proves each request crosses the sole write-boundary/lock-acquisition path, with no independent acquisition counter or instrumentation; zero writes on refusal; label/arrow movement tolerances including the existing 0.5 near check; exact note/image/snapshot bytes; origin tags; request and event order. Import CLAIM_LEASE_MS, LOCK_FREE_LINGER_MS, LOCK_LEASE_MS, LOCK_RENEW_MS, LOCK_WAIT_CAP_MS, LOCK_WATCH_MS, and REPORT_IDLE_SETTLE_MS from src/shared/timing/timing.ts and preserve their tested pull-against relationships and named margins. Every child, proxy, listener, lease, port, vault, and temporary file is registered before assertions and disposed in finally; process death is reported separately with stderr.

6. Red and parity proof. Keep all three scripts while native tests are authored. In disposable checkouts, prove old/new failures for a foreign responder satisfying health, IPv6/listen broadening, a second writer entering one vault, stale lease never recovering, a claim gap between two of twenty writes, missing remote hold broadcast, align looping over element PUTs, partial apply persistence, promote writing per stencil line, bridge writing twice, replace import exposing empty state, and snapshot restore retaining old files. Compare representative exact statuses, bodies, stdout/stderr, note bytes, request sequence, the real proxy's one-write-request-per-intent record, the write-boundary-policy.test.ts sole-boundary/lock-acquisition-path proof, and cleanup evidence before deletion. Interrupt competitor, proxy, and canvas cases and prove no live PID/listener/vault/lease remains.

7. Serialized package and deletion cutover. Once parity is recorded, the reconciliation owner performs one integration:
- Map package.json test:bind to bun test tests/system/process-contracts/local-bind.test.ts.
- Map test:lock to bun test src/runtime/engine/tests/board-lock-lease.test.ts src/runtime/engine/tests/board-lock-announcements.test.ts src/runtime/engine/tests/board-claim.test.ts tests/system/process-contracts/board-lock-api.test.ts tests/system/process-contracts/cross-process-lock.test.ts tests/system/process-contracts/lock-source-policy.test.ts.
- Map test:one-write to bun test tests/system/process-contracts/element-ops-one-write.test.ts tests/system/process-contracts/apply-one-write.test.ts tests/system/process-contracts/promotion-delete-bridge-one-write.test.ts tests/system/process-contracts/import-one-write.test.ts tests/system/process-contracts/snapshot-one-write.test.ts tests/system/process-contracts/write-boundary-policy.test.ts.
- Delete scripts/check-local-bind.mjs, scripts/check-lock.mjs, and scripts/check-one-write.mjs.
Do not land native files before this atomic mapping/deletion cutover. TASK-130.02 inventory must remain green and reach each file exactly once. TASK-130.11 later folds these keys into final lanes; it does not delete these scripts.

8. Exact focused validation:
bun test src/runtime/engine/tests/board-lock-lease.test.ts src/runtime/engine/tests/board-lock-announcements.test.ts src/runtime/engine/tests/board-claim.test.ts
bun test tests/system/process-contracts/local-bind.test.ts tests/system/process-contracts/board-lock-api.test.ts tests/system/process-contracts/cross-process-lock.test.ts tests/system/process-contracts/lock-source-policy.test.ts
bun test tests/system/process-contracts/element-ops-one-write.test.ts tests/system/process-contracts/apply-one-write.test.ts tests/system/process-contracts/promotion-delete-bridge-one-write.test.ts tests/system/process-contracts/import-one-write.test.ts tests/system/process-contracts/snapshot-one-write.test.ts tests/system/process-contracts/write-boundary-policy.test.ts
Then audit PIDs/listeners/vaults/leases, run bun run type-check, bun run lint, bun run fmt:check, bun run check, and git diff --check sequentially. Eventual categories are module for the three src/runtime/engine tests and system for tests/system/process-contracts; TASK-130.11 owns final package names.

9. Overlap and integration boundary. Exact native filenames are disjoint from TASK-130.03/.04/.05/.08/.10 even though src/runtime/engine/tests is a shared directory. tests/system/support/owned-canvas.ts is read-only and owned by TASK-130.06. package.json is the only authored-file overlap with every predecessor and is reconciled one task at a time. .08 and .09 may author in parallel only on disjoint native files after TASK-130.01/TASK-086; because TASK-130.06 is an explicit dependency of both, neither task completes or enters reconciliation until .06 is integrated, then .08 and .09 integrate sequentially with full validation. TASK-130.10 waits for .06/.08/.09, and TASK-130.11 is last.
<!-- SECTION:PLAN:END -->
