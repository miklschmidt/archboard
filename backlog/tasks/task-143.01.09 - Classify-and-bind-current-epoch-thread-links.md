---
id: TASK-143.01.09
title: Classify and bind current-epoch thread links
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-09-03 18:27'
labels: []
dependencies:
  - TASK-143.01.05
  - TASK-143.01.08
  - TASK-143.01.17
  - TASK-143.08.05
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-thread-link
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 179000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fully discover, classify, and bind one current-epoch pane thread link by joining paginated persisted thread rows with paginated loaded thread IDs. No loaded-list response is treated as a Thread object.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The classifier exhausts thread/list and thread/loaded/list, joins loaded IDs to Thread rows by exact ThreadId, and never infers membership from recency, status, or a partial page.
- [ ] #2 Execution requires current child/epoch, literal top-level source cli|vscode|exec|appServer, loaded membership, and canAcceptDirectInput === true; custom/subAgent/unknown sources and false/null capability have distinct refusal reasons.
- [ ] #3 Persisted-not-loaded, notLoaded, systemError, stale child, prior epoch, unknown provenance/source, absent join row, and outcome-unknown creation remain inspect-only with actionable reasons.
- [ ] #4 Bindings compare-and-swap pane/link identity and tests cover cursor exhaustion, repeated cursors, disappearing rows, duplicate IDs, stale responses, all four allowed sources, all refused source variants, and every refusal.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Refactor the existing classifier just enough to classify one target from already exhausted typed SessionThread and ThreadId inventories, retaining authored refusal precedence and generated status/source types.
2. Add one public candidate-discovery result to the authoritative CodexThreadLinkPort. Exhaust thread/list and thread/loaded/list once, exact-join by ThreadId, derive current-child provenance only from the durable epoch manifest, freeze the result, and reject cursor or authority-generation changes instead of publishing a partial or stale list.
3. Keep executable adoption in the existing classifyAndBind and pane/link CAS store. Expose each candidate's exact target and classification so the downstream browser workbench can bind through that boundary without a second classifier or store.
4. Add focused module tests for both inventories' pagination and repeated cursors, duplicate/disappearing rows, allowed and refused sources/capabilities/statuses, prior/stale/current epoch authority, discovery generation conflicts, and discovery-to-CAS adoption. Run focused thread-link tests plus exact formatter, linter, TypeScript, and diff checks only.

Review remediation:
1. Replace the public candidate's raw ThreadLinkTarget and ThreadLinkClassification with a closed browser-safe projection: opaque selectionId, threadId, state, reason, normalized source kind, status, loaded, and canAcceptDirectInput.
2. Keep exact targets, SessionThread rows, durable records, and proofs in one per-port in-memory closure. Invalidate its selection map at every discovery start and consume a valid selection before resolving it.
3. Add a host resolver that maps the opaque selection identity back to its retained exact target and calls the existing two-pass classifyAndBind plus pane/link CAS boundary. Reject unknown, cross-port, stale, and replayed selection identities with one deterministic conflict.
4. Add focused module owners proving JSON-serialized discovery output cannot contain raw thread/proof/provenance/path/repository/turn/diagnostic data and proving valid, stale, forged, cross-port, and replayed selection behavior. Run focused thread-link tests, root TypeScript, and exact lint/format/diff checks only.

Second review remediation:
1. Add one epoch-owned resolveThreadOwnershipProvenance query with the recovered authored ownership contracts: create_thread/thread/start and fork_thread/thread/fork are created ownership; thread_link/thread/read is attached ownership. Ignore every other kind/RPC pair.
2. Make candidate discovery ask that epoch resolver for the last ownership-establishing committed or inspect-only record instead of selecting the last record that merely names the thread.
3. Align the thread-link epoch fixture default with canonical create_thread/thread/start ownership.
4. Add focused regressions proving a later committed read cannot shadow valid ownership and an unrelated-only committed record yields unknown_provenance and cannot produce an executable binding. Run focused thread-link tests, the affected epoch owner, root TypeScript, and exact lint/format/diff checks only.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the public codex-thread-link module: typed full-page thread/list plus thread/loaded/list classification, exact ThreadId joins, authored refusal precedence, current child/epoch and operation provenance checks, and a frozen CAS pane binding store with live-epoch stale-response refusal. Added 23 focused module tests covering every refusal reason and binding race. Validation: oxfmt, oxlint, and tsc pass; focused module lane passes (23/23). The targeted repository boundary/inventory command was started but the cgroup terminated it at the 6 GB cap during the heavy boundary suite before inventory ran.

Remediation commit ec844d52 seals executable adoption: the public binding store accepts only unbound/inspect-only CAS snapshots, createCodexThreadLink owns its store, and classifyAndBind requires two live classification passes plus a revalidated durable epoch proof. Complete persisted epoch-record/manifest integrity and caller-evidence checks now guard current child, epoch, operation, and thread provenance; retained session/proof data is transitively cloned and frozen. Thread-start uncertainty is recognized only from the authored settlement condition on the thread/start wire boundary; create/fork initial turn turn/start uncertainty falls back to unknown_provenance. Refusal precedence is evaluated from ADDITIONAL_CONTEXT_POLICY with a runtime conformance owner, and overlapping tests cover all 15 reasons plus stale-child and malicious injected-store hostiles. Validation under named systemd cgroups: scoped oxfmt check passed (30.2M peak), oxlint passed with 0 warnings/errors (619.6M), tsc --noEmit passed (1.6G), and 32 focused tests passed (109 expectations, 44.8M). The previously attempted heavy repository boundary lane remains intentionally not rerun because it was terminated at the 6G cap.

Final remediation follow-up commit f7c281c: thread/start outcome-unknown classification now depends only on validated durable status=inspect_only, outcome=outcome_unknown, and rpc=thread/start; arbitrary diagnostics such as "response was lost" and "settlement lost" are accepted, while create/fork initial-turn turn/start records remain authored unknown_provenance. The root CodexThreadLinkOptions now requires ThreadLinkEpochAuthority, the observation-only classifier retains optional authority modes, and createCodexThreadLinkBinding is parameterless with no static-snapshot or injected-store option. Compile fixtures enforce missing epoch, snapshot-only, injection, executable-bind, and valid downstream shapes. Added deterministic between-pass hostiles for source, status, direct-input capability, target provenance, and durable current-record changes. Validation under named systemd cgroups (MemoryMax=6G, MemorySwapMax=1G; cgroup paths printed): oxfmt check passed at 31.2M, tsc --noEmit passed at 1.6G, oxlint passed with 0 warnings/errors at 607.8M, and 35 focused tests passed with 120 expectations at 48.5M. Heavy policy lane was not run.

Finalization evidence: two independent reviews were clean for e53d27a7..f7c281c3. AC1 is proven by the exhausted paginated exact-join and cursor-failure tests; AC2 by the four allowed-source, status, capability, durable-epoch, and live classify-and-bind tests; AC3 by the persisted-not-loaded, stale/prior, provenance, arbitrary thread/start diagnostic, and turn/start countercase tests; AC4 by the 35-test binding/classifier/precedence/type lane plus formatter, linter, TypeScript, and diff checks. No Definition-of-Done items were defined.

Reopened with user approval after TASK-143.03.03 proved that no public authoritative candidate-discovery result reaches the browser consumer.

Reimplemented current-epoch candidate discovery on fixed base 23cc54fbc3405a7c5b80bb8de796ae2b53bd5e25. The existing classifier now classifies targets from one already exhausted typed SessionThread/ThreadId join, and the authoritative CodexThreadLinkPort exposes one frozen discovery generation for downstream browser consumers. Discovery reads only the durable epoch store, retains current, stale, prior, and thread/start outcome-unknown provenance, rejects cursor loops and manifest-generation changes, and sends selected targets back through the existing two-pass classifyAndBind plus pane/link CAS boundary. No second classifier or binding store was added.

Focused validation: bun test src/runtime/codex-thread-link/tests passed 41 tests and 142 assertions in 6.51s; bunx tsc --noEmit --pretty false passed in 1.92s; exact-file oxlint passed in 0.14s; exact-file oxfmt check passed in 0.10s; git diff --check passed. No full, system, repository, browser, stress, performance, or tooling lane ran.

Independent-review remediation after 9c94a7ae: replaced public raw ThreadLinkTarget/ThreadLinkClassification candidates with the exact browser-safe projection selectionId, threadId, state, reason, source, status, loaded, and canAcceptDirectInput. Custom and subagent source payloads normalize to closed display tags. Exact targets, SessionThread rows, durable operation records, proofs, paths, repository metadata, turns, content, and diagnostics now remain in one per-port host closure.

Each UUID selection is scoped to one successful discovery generation and port, bound to the discovery epoch-manifest CAS, and consumed before resolution. New discovery, manifest change, cross-port use, unknown/forged input, or replay returns the same actionable conflict. A valid selection resolves the retained target only through the existing two fresh classifications and pane/link CAS adoption.

The focused browser-safe seam owner asserts the public discovery and candidate key sets exactly and proves serialized values exclude target, classification, proof, provenance, cwd/path, workspaceRoot, hashes, repository metadata, turns/content, custom payload, and outcome-unknown diagnostics. It would fail against 9c94a7ae, whose public candidate directly contained target and classification. Lifecycle coverage proves valid selection, cross-port, forged, superseded-generation, changed-manifest, and replay behavior.

Focused validation: bun test src/runtime/codex-thread-link/tests passed 43 tests and 167 assertions in 7.64s; root bunx tsc --noEmit --pretty false passed in 1.79s; exact-file oxlint passed in 0.15s; exact-file oxfmt check passed in 0.09s; git diff --check against 9c94a7ae passed. No broad module, system, repository, browser, check, stress, performance, or tooling suite ran.

Second independent-review remediation: candidate discovery now delegates ownership provenance to the epoch-owned resolveThreadOwnershipProvenance query. Its exact authored contracts are create_thread/thread/start and fork_thread/thread/fork as created ownership, plus thread_link/thread/read as attached ownership; all other kind/RPC pairs are ignored. The resolver scans backward for the latest ownership-establishing committed or inspect-only record, so a later read that merely names the thread cannot shadow valid authority. An unrelated-only record leaves the candidate unknown_provenance and its opaque selection cannot bind executable. The real thread-link fixture now defaults to canonical create_thread/thread/start. Focused validation: bun test src/runtime/codex-thread-link/tests passed 45 tests and 171 assertions in 9.40s; the affected epoch owners passed 11 tests and 49 assertions in 1.50s; root bunx tsc --noEmit --pretty false passed in 1.79s; exact-file oxlint passed with no findings in 0.12s; exact-file oxfmt check passed in 0.09s; git diff --check passed. No broad module, system, repository, browser, check, stress, performance, or tooling suite ran. Task remains In Progress for parent review.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:39
---
Course correction, 2026-09-02: duplicate worktrees at maximal head 3e1670af contain candidate-discovery behavior worth preserving, but no detached head may merge before recovery. Reimplement that behavior on the recovered base; the duplicate worktree receives no separate replay.
---
<!-- COMMENTS:END -->
