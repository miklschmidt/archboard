---
id: TASK-143.01.14
title: Compose the production Codex workbench graph
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:47'
updated_date: '2026-09-01 09:26'
labels: []
dependencies:
  - TASK-143.01.10
  - TASK-143.01.11
  - TASK-143.02.03
  - TASK-143.05.04
  - TASK-143.06.02
  - TASK-143.07.04
  - TASK-143.07.06
  - TASK-143.01.16
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - >-
    backlog/tasks/task-143.01.14 -
    Register-the-Codex-gateway-with-the-canvas-server.md
  - src/runtime/codex-approvals/lib/broker.ts
  - src/runtime/codex-approvals/lib/contract.ts
  - src/runtime/codex-approvals/tests/listener-ownership.test.ts
  - src/runtime/codex-dynamic-tools/index.ts
  - src/runtime/codex-dynamic-tools/lib/contract.ts
  - src/runtime/codex-process/lib/process.ts
  - src/runtime/codex-protocol/lib/config-schemas.ts
  - src/runtime/codex-protocol/tests/config-layers.test.ts
  - src/runtime/codex-realtime/index.ts
  - src/runtime/codex-realtime/lib/adapter.ts
  - src/runtime/codex-realtime/lib/contract.ts
  - src/runtime/codex-realtime/tests/adapter-races.test.ts
  - src/runtime/codex-realtime/tests/adapter.test.ts
  - src/runtime/codex-session/index.ts
  - src/runtime/codex-session/lib/contract.ts
  - src/runtime/codex-session/lib/session.ts
  - src/runtime/codex-session/tests/session.test.ts
  - src/runtime/codex-session/tests/support.ts
  - src/runtime/codex-thread-context/index.ts
  - src/runtime/codex-thread-context/lib/contract.ts
  - src/runtime/codex-thread-context/lib/controller.ts
  - src/runtime/codex-thread-context/lib/delivery.ts
  - src/runtime/codex-thread-context/tests/controller.test.ts
  - src/runtime/codex-thread-context/tests/delivery-support.ts
  - src/runtime/codex-workhorse-operations/tests/queue-support.ts
  - src/runtime/codex-workhorse-queue/lib/contract.ts
  - src/runtime/codex-workhorse-queue/lib/queue.ts
  - src/runtime/codex-workhorse-queue/tests/queue.test.ts
  - src/runtime/codex-workhorse-queue/tests/shutdown.test.ts
  - src/server/canvas/codex-workbench-adapters.ts
  - src/server/canvas/codex-workbench-application.ts
  - src/server/canvas/codex-workbench-browser.ts
  - src/server/canvas/codex-workbench-generation.ts
  - src/server/canvas/codex-workbench-owner.ts
  - src/server/canvas/codex-workbench-production.ts
  - src/server/canvas/codex-workbench.ts
  - src/server/canvas/lib/application.ts
  - src/server/canvas/lib/codex-workbench-adapters.ts
  - src/server/canvas/lib/codex-workbench-application.ts
  - src/server/canvas/lib/codex-workbench-browser.ts
  - src/server/canvas/lib/codex-workbench-production.ts
  - src/server/canvas/lib/codex-workbench.ts
  - src/server/canvas/tests/codex-workbench-adapters.test.ts
  - src/server/canvas/tests/codex-workbench-application.test.ts
  - src/server/canvas/tests/codex-workbench-browser.test.ts
  - src/server/canvas/tests/codex-workbench-generation.test.ts
  - src/server/canvas/tests/codex-workbench.test.ts
  - src/server/codex-workbench/lib/contract.ts
  - src/server/codex-workbench/lib/gateway.ts
  - src/server/codex-workbench/tests/gateway-command-owners.test.ts
  - src/shared/timing/timing.ts
  - tests/system/process-contracts/fixtures/codex-realtime-process.ts
  - tests/system/repository-policy/codex-workbench-composition.test.ts
  - src/server/canvas/lib/codex-workbench-error.ts
  - src/server/canvas/lib/codex-workbench-generation-contract.ts
  - src/server/canvas/lib/codex-workbench-retained-policy.ts
  - src/server/canvas/tests/codex-workbench-reload-failures.test.ts
  - src/server/canvas/tests/codex-workbench-terminal-cleanup.test.ts
  - src/server/canvas/tests/support/codex-workbench-owner-fake.ts
  - tests/system/canvas-state/codex-workbench-production-cleanup.test.ts
  - tests/system/canvas-state/support/codex-production.ts
  - src/server/canvas/tests/codex-workbench-application-recovery-races.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 241000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the one production composition root in the canvas server. It instantiates every accepted runtime port and dynamic approval, authority, context, operation-ID, and lifecycle adapter once, routes every server request exhaustively, supplies replaceable closures to kept state, and registers the closed browser contract. It contains no protocol reducer, approval lookalike, identity minting rule, or target-selection policy. Delegation profile: gpt-5.6-sol, medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The composition instantiates process, identity and OperationId authority, epoch and session, workhorse transaction, realtime, seven-family approval broker, general dispatcher with all five injected adapters, coordinator dispatcher, semantic delivery, coordinator, queue, callbacks, spoken gate, and browser gateway exactly once.
- [ ] #2 One exhaustive router handles all eleven generated server request variants: seven broker families, item/tool/call, currentTime/read, token refresh, and attestation. Each reaches its sole owner or reviewed protocol error, dynamic approval never enters the seven-family broker, and no default branch responds generically.
- [ ] #3 kept() stores only version-neutral serializable state, stable process handles, and replaceable closures; no generation-bound class instance, decoder, route handler, callback, approval decision, effect authority, or UI adapter survives reload.
- [ ] #4 Startup installs identity decoders, dynamic dispatcher registrations, lifecycle signals, router, approval projection, and browser gateway before readiness. Shutdown stops browser, realtime, and queue, cancels dynamic approvals and waits, settles ordinary requests, closes JSON-RPC, TERM or KILLs the child, and removes listeners; browser disconnect and child exit cannot leave resumable authority, and duplicate owner registration refuses.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Remove the broad canvas-index export and add one narrow production entrypoint imported only by the canvas application. Wire start before HTTP readiness and exact async shutdown into the existing signal path.
2. Refactor transport/session/approval ownership so the composed workbench installs the sole eleven-variant reverse-request listener. Keep standalone auto-registration only through an explicit supported option and prove one receive/respond attempt per family with real constructors.
3. Redesign retained ownership around one stable child/transport boundary. Reload replaces generation-bound listeners and owners without closing stdin; terminal shutdown closes transport and process once. Reject every duplicate active install and release registration only after failure, child exit, or shutdown.
4. Replace ad hoc teardown with a staged cleanup ledger active before the first constructor. Use it for constructor, registration, hook, initialization, child-exit, browser-disconnect, reload, and shutdown paths so every acquired owner retires even when another cleanup step fails.
5. Add direct application, real-factory routing, two-generation reload, failure-injection, child-exit race, duplicate-owner, and stable policy tests. Remove source-regex tests that duplicate behavioral proof.
6. Run the requested capped sequential validation lanes, including one fresh hot-reload owner after removing the eager import, then update task notes without checking AC and commit on top of 8de971a0 for independent fixed-base review.

7. Add the approved process-lifetime unbound binding controller in src/runtime/codex-thread-context. Preserve the immutable fixed-target leaf, own one subscription and one child/session event ledger across exact CAS bind/rebind/clear transitions, and integrate its proven workhorse binding into production composition before application readiness.

8. Implement the concrete canvas host owner in the application seam: one semantic publisher/context source, dynamic visual-approval owner, exact caller/target/context/operation/lifecycle adapters, browser projection/actions, and reviewed runtime bindings. Dynamically install the narrow workbench entrypoint before HTTP listen, replace only hooks on reload, and await exact shutdown/failure cleanup.

9. Add direct production-application owners for construction cardinality, readiness ordering, sole routing, reload identity, shutdown/child-exit/startup-failure cleanup, and duplicate refusal; then run capped validation and callback the fixed-base parent.

10. Wire the concrete Codex browser protocol through the existing canvas WebSocket connection owner. Decode connect, snapshot, lease, command, and subscribe requests at the application boundary; send gateway messages on that socket; retire the exact browser/pane connection on close and reload; and prove the public socket workflow including approval resolution.

11. Replace browser-authored turn payloads with codex-instructions constructors using the lease-bound pane, child, epoch, thread link, operation identity, board, and semantic context. Bind semantic delivery through exact CAS on create, attach, relink, stale disconnect, and child exit without selecting a fallback pane.

12. Add the smallest queue lifecycle authority needed to gate new work, cancel or drain accepted work, and revoke binding authority during shutdown and child exit. Bind realtime remote media to the authoritative browser connection and return the existing explicit unavailable result when no media owner is attached.

13. Replace the mutable partial component assembly with an explicit complete object checked by satisfies. Split the broad canvas workbench entrypoint into production application, production composition, and test-only entrypoints while preserving deep-module boundaries.

14. Restore behavioral retained-state policy by installing and reloading with caller-supplied retained state, asserting the exact allowlist and rejecting generation-bound values. Add multi-pane, honestly-unbound, session-boundary, queue lifecycle, remote-media, WebSocket, reload, and stale-CAS owners.

15. Run capped sequential focused, type, lint, formatting, policy, live WebSocket, and safe reload verification. Correct the protected artifact evidence through Backlog CLI, keep status and AC unchanged, commit on top of b9ef7228, and callback the parent with the fixed-base range.

16. Replace focus-based semantic capture with one exact pane-bound snapshot and prove two-pane lease isolation.

17. Give thread-link mutation and disconnect cleanup one post-mutation controller token, and implement genuine current-child attach/relink through authoritative classification.

18. Add opaque WebSocket instance ownership so reconnect replacement and out-of-order close cannot revoke the new logical browser.

19. Add one continuous browser realtime session identity across start, append, and stop, then implement the browser-local peer/media owner and terminal cleanup.

20. Preserve exact dynamic approval termination causes for child exit, host shutdown, replacement, and reload.

21. Split the adapter implementation by behavior and strengthen retained-state value enforcement with negative mutation owners.

22. Add a production application WebSocket proof crossing the real gateway and approval owner, run capped validation, update Backlog evidence, commit, and callback the parent.

23. Make the canvas application retain one exact current socket per client id. Let stale closes retire only their own socket and Codex bridge state; gate selection, hold, pane, note-open, and semantic cleanup on exact current ownership.

24. Split command-lease retirement from durable browser-connection teardown. Keep binding and realtime authority across release, expiry, and reacquire; invoke disconnect hooks exactly once only for socket close or replacement, child exit, and host shutdown.

25. Replace retained generation-capturing lifecycle closures with one plain control cell and stable wrappers. Put current generation operations in explicit replaceable slots, poison old slots in tests, and remove impossible lexical-capture claims in favor of structural and behavioral policy.

26. Move the browser workbench media owner into src/ui/codex-realtime/lib behind a narrow module entrypoint. Add an explicit media installation/readiness handshake and closed unavailable or negotiation_failed outcomes for missing APIs, permission failure, SDP failure, replacement, and success.

27. Move cross-module WebSocket coverage to tests/system. Start the actual canvas application, drive its real socket decoder and production gateway/approval owner through overlap, stale close, lease release/reacquire, approval at-most-once, reload, and terminal cleanup, with cleanup registered before acquisition.

28. Keep module tests on module-root contracts and add focused regressions for each reachable race, poisoned reload slot, nested or prototype retention path, and media readiness state. Remove the fake module proof that overstates production coverage.

29. Run only the requested focused capped owners, both TypeScript projects, lint, format, inventory, boundary, and diff checks; append evidence through Backlog CLI, keep TASK-143.01.14 In Progress with AC unchecked, commit above f01cc33a, verify the protected hash, and callback the parent.

30. Establish a replacement socket in the gateway at WebSocket acceptance, before any prior instance can close, and prove the no-request reconnect race.

31. Bind every ordinary approval family to the exact browser link lifecycle and settle browser disconnect, child exit, and shutdown exactly once without disturbing release, transfer, expiry, or link changes.

32. Capture settled semantic input from the thread-context controller current exact pane binding and reject stale or cleared bindings instead of selecting focus.

33. Publish fresh lifecycle and gateway-facing callable identities from each source generation while retaining only reviewed stable process ports.

34. Split browser WebSocket/media ownership out of codex-realtime and guard every post-await media write by exact run identity.

35. Harden retained-state structural validation against prototype spoofing, intrinsic mutation, and nested or attached methods.

36. Make the cross-module system owner fail-safe from its first acquisition and extend the real server proof across all production seams named by review.

37. Run focused public-boundary owners and repository checks without repeating the documented OOM aggregates; record any unavailable prerequisites explicitly.

38. Re-review the complete remediation diff, preserve the protected artifact hash, commit on the rejected head, and send the parent a finding-by-finding callback.

39. Replace reload forwarding wrappers with a fresh source-generation operation record. Stable kept wrappers dispatch only through the current control cell, and tests poison the retired generation methods while asserting every callable identity changes.

40. Make terminal shutdown continue through every teardown stage, aggregate actionable failures, clear retained slots and authority in a final guarantee, release registration, and allow a later clean install after each injected failure.

41. Publish a new media replacement ticket before awaiting any old-run disposal. Fence every attach, start, and continuation by that ticket and prove an A/B/C delayed-disposal race in adversarial completion order.

42. Register production system cleanup before temp-root and fixture acquisition. Track partial sockets, servers, children, and roots in reverse order, and inject failures at setup, listen, first socket open, and child start.

43. Run the focused reload identity, terminal failure matrix, media triple-overlap, production setup cleanup, actual production server, inventory, boundary, type, lint, format, and diff owners under named 6 GiB systemd scopes without repeating known OOM fingerprints.

44. Keep status and AC unchanged, commit above f3948b7a, verify the protected artifact, and send the parent the required four-finding rereview callback.

45. Replace retained ownerHooks, child callbacks, and loose cleanup arrays with one exact current generation source record and named registration ledger. Refresh the complete record on reload, validate its nested shape, and poison every retired callback in behavioral owners.

46. Make generation registration removal and installation failure-isolated. Publish the new complete set only after full installation, restore the old complete set only after clean rollback, and terminally release the owner when removal, partial cleanup, or rollback cannot prove a complete set.

47. Make projection and every named cleanup terminally idempotent by clearing ownership before invocation. Add removal, install, partial-cleanup, rollback, projection, aggregate-error, shutdown-cache, and reinstall matrices without weakening any existing owner.

48. Arm production socket cleanup before the post-construction hook and add actual src/server.ts system cases for hook throw, socket error, early close, and timeout. Prove partial sockets and listeners close, a same-client reconnect can claim and release authority, processes exit, roots disappear, and observable cleanup order is reversed.

49. Reassess the 1,654-line composition module after the lifecycle fix. Extract only a cohesive private lifecycle unit if it reduces concepts without a cycle or new public contract; otherwise record the concrete boundary reason and retain the advisory as review risk.

50. Run the focused generation, reload, terminal, media, production cleanup, actual server, hot-reload, socket, inventory, lint, formatting, both TypeScript projects, frontend build, and diff owners in sequential named 6 GiB systemd scopes. Do not retry documented OOM fingerprints.

51. Keep TASK-143.01.14 In Progress with AC unchecked, verify the protected hash, commit above de56927d, and send the required six-finding callback to parent thread 01a053f2-e36f-7911-9859-09d259b86aea.

52. Replace the retained generation graph with a minimal process-lifetime runtime containing only the stable process owner and lifecycle tickets; keep every assembled generation, owner, decoder, adapter, route, callback, approval, and authority exclusively behind the replaceable current source slot.
53. Extract private routing and lifecycle modules. The lifecycle unit owns ticket reservation, startup publication fences, synchronous dispatch revocation, rollback, child retirement, and terminal teardown; the composition root owns factory assembly and public wiring.
54. Add hostile-descendant retained-policy owners, public-wrapper shutdown revocation coverage, and a delayed createGeneration/shutdown/replacement race proving a stale start cannot overwrite or release the replacement runtime.
55. Replace synthetic socket emission cases with real loopback peers for refused/reset connection, accepted early close, and accepted withheld WebSocket upgrade timeout, then prove the next actual src/server.ts start recovers without socket, listener, process, authority, or root leaks.
56. Run the focused and complete viable validation lanes sequentially in named transient systemd user units capped at 6 GiB memory and 1 GiB swap; preserve the protected artifact hash, keep status and all acceptance criteria unchanged, commit above c55d5594, and callback the fixed-base parent with finding-by-finding evidence.

57. Add failing adversarial owners for stale reload publication after old cleanup, stale rollback publication after reactivation, shutdown during candidate activation, child exit in each reload gap, guarded production initialization, synchronous application revocation, and router privacy.

58. Replace the single currentGeneration pointer with one lifecycle transaction and an exact live-generation resource ledger. Let shutdown invalidate the transaction and synchronously stop every owned member before any await; fence every continuation and publication by runtime, ticket, phase, child, transport, and transaction ownership.

59. Move transport exit observation to one process-lifetime retained observer and terminal latch. Remove generation-owned exit registration, consume the exact event through the current private lifecycle dispatch, and forbid ready publication without an open transport and exact current child.

60. Pass a transaction activation guard into production initialization. Check it after every await and before epoch, lifecycle, readiness, browser-state, and coordinator mutations, staging account-derived publication until coordinator readiness is proven.

61. Give the canvas application a synchronously available production shutdown handle and remove the request router from every root entrypoint. Add repository policy that only the private lifecycle implementation may import the private router.

62. Run the new adversarial owners first, then the focused non-hot lanes and viable repository gates sequentially in named 6 GiB memory and 1 GiB swap units. Keep status and AC unchanged, preserve the protected hash, commit above 0b0f9cab, and callback the parent with finding-by-finding evidence.

63. Replace the retained exit listener/disposer record with an exact replaying terminal-event bridge and one replaceable source handler; attach it at stable-kernel acquisition and poison the retired handler after reload.

64. Acquire the first identity ledger and transport synchronously from the exact spawned child before awaiting generation construction; cover exit-before-transport-listener, exit-during-factory, and exit-before-activation schedules with one-shot cleanup and deterministic recovery.

65. Replace the canvas application installed boolean protocol with explicit idle/preparing/installed/stopping/stopped ownership, publish synchronous shutdown authority before start awaits, and aggregate concurrent startup/shutdown failures.

66. Run the three adversarial owners first, then the requested focused non-hot module and production owners plus sequential static gates under named 6 GiB/1 GiB systemd scopes; do not rerun documented OOM aggregates.

67. Preserve the protected artifact, task status, and unchecked AC, commit above 91991bce, and send the fixed-base parent the required finding-by-finding callback before local final.

68. Refuse prepare deterministically in stopping before touching terminal ownership; clear terminal intent only when a new prepare begins from idle or fully stopped.

69. Publish the exact shutdown promise and clear installed ownership before invoking production teardown, then return that promise to every concurrent shutdown caller through success or rejection.

70. Add installed-overlap and cleanup-rejection owners first, run focused non-hot capped validation without known OOM aggregates, preserve protected state, commit above 127e5cad, and callback the parent.

71. Preserve the settled shutdown authority through stopped so same-source and replacement-source shutdown calls return the exact cached success or rejection promise.

72. Replace terminal authority synchronously when recovery prepare begins, define failed recovery ownership without reviving the retired installation, and prove it with focused owners.

73. Run exact replacement-source owners first, then sequential capped focused non-hot gates, update evidence, commit above fb3b05f5, and callback the parent.

74. Add one gated recovery owner that overlaps blocked startup with same-source and replacement-source shutdown, then proves the failed recovery promise replaces the settled teardown result.

75. Publish the exact recovery prepare operation as stopped terminal ownership before throwing either its startup error or combined startup and teardown AggregateError.

76. Run the exact owner first, then sequential capped focused non-hot and static gates, update evidence, commit above 2be7641a, and callback the parent.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the production Codex workbench composition root. It owns one retained process, replaces generation closures across reload, creates the reviewed runtime graph and five dynamic adapters once, installs all three dynamic namespace registrations, routes the closed eleven-method server-request union exhaustively, gates readiness on complete registration and session initialization, and performs ordered best-effort shutdown through browser/realtime/queue settlement, transport close, child TERM/KILL ownership, and final listener removal.

Added focused module owners for routing, reload retention, duplicate-owner refusal, failed-start cleanup, construction/startup order, and shutdown order. Added a repository-policy owner for constructor/adapter call-site cardinality, router exhaustiveness, and kept-state restrictions.

Validation: focused module owners 6 pass / 0 fail; composition policy 3 pass / 0 fail; test inventory 39 pass / 0 fail; codex realtime process contract 4 pass / 0 fail; resource cleanup process contract 8 pass / 0 fail; both TypeScript projects pass; scoped Oxlint and oxfmt pass; direct module-scope analysis of codex-workbench.ts reports zero findings or waivers. The canonical module-scope-policy and boundaries owners were also attempted separately inside the required 6 GiB memory / 1 GiB swap scopes; each was OOM-killed at the cgroup ceiling, so no pass is claimed for those full owners. Protected artifact SHA-256 remains 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6.

Independent fixed-base review of 8de971a0 found seven valid issues: the graph was not registered by the production application, session and approval owners self-registered alongside the exhaustive router, reload closed the retained transport, child exit did not retire all live owners or ready state, startup cleanup began after construction, the broad canvas index eagerly imported the full Codex graph, and same-owner duplicate installation was accepted. Remediation started; AC remains unchecked.

Remediation scope decision: TASK-143.01.14 owns the full production host bindings and all five dynamic adapters, then installs the graph in the real canvas lifecycle. TASK-143.01.15 verifies that completed graph; TASK-143.03.01 consumes the server gateway and does not instantiate owners. No fake, nullable, no-op, or deferred production bindings are acceptable.

Architecture decision: preserve createCodexThreadContextDelivery as the immutable fixed-target leaf and add an unbound process-lifetime controller in src/runtime/codex-thread-context. The controller owns the sole feed subscription and lifetime at-most-once ledger, consumes exact workhorse/thread-link authority through CAS, starts unbound, and never fabricates or selects a target. This approved scope expansion belongs to TASK-143.01.14; completed TASK-143.06.02 remains unchanged.

Remediation checkpoint: fixed listener ownership, retained graph reload, synchronous child retirement, construction/start failure cleanup, strict duplicate-owner refusal, and narrow canvas export. Added the approved process-lifetime thread-context controller with one subscription, a lifetime event ledger, exact CAS bind/rebind/clear, replaceable hooks, and child-exit revocation. Focused validation is green (46 tests / 272 assertions), both TypeScript projects pass, scoped Oxlint and oxfmt pass, and the protected artifact hash is unchanged.

Remaining blocker: the real canvas application still does not construct the full production host bindings/five dynamic adapters or await installation before HTTP readiness. That seam requires the concrete browser action/projection, semantic publisher/context capture, dynamic visual-approval, exact caller/target authority, and wait/lifecycle owners; landing only a lifecycle shell would violate the explicit no-placeholder/no-lazy-install direction. Reviewer finding 1 therefore remains open and TASK-143.01.14 is not ready for final review or AC completion.

Production application remediation complete and ready for fixed-base review. The real canvas application now creates the concrete semantic, visual-approval, caller/target/context/operation/lifecycle, browser projection/action, process, realtime, queue, and thread-context bindings; dynamically installs the narrow workbench entrypoint before HTTP listen; replaces only generation source hooks on reload; and awaits ordered terminal cleanup on startup failure, child exit, browser disconnect, signals, and server bind failure. All seven review findings are addressed.

Direct verification: a fresh empty-vault server remained running after the graph reached readiness, /health returned healthy, and SIGINT shut the process down cleanly. Final focused composition/application/adapter/protocol owners passed; both TypeScript projects passed; scoped Oxlint and oxfmt passed. The broader relevant runtime lane passed 192 owners except for one entrypoint-policy failure caused by an over-broad export, which was reverted and its isolated owner then passed. The full repository owner was OOM-killed at the required 6 GiB memory / 1 GiB swap ceiling after boundary checks; its isolated inventory owner passed. The previously recorded fresh hot-reload owner remains 4/4 and was not rerun.

Protected artifact is unchanged from fixed base 7f37c1a903492bbd7d02699df069f2d2bc3dccba and current HEAD (git object f56a8a8364ee677027f1e5eb31fb0644a18d338b); its actual SHA-256 is 3ffcfa2c2a07af83f4074c7e785a87aa1bb1df7a81bdbce58385525d2159cccb. The earlier 22f897... note was stale evidence, not a file change. AC remains unchecked for parent review.

Fixed-base remediation after b9ef7228 addresses all ten rejection findings. The retained canvas WebSocket server now owns the public Codex request bridge (connect, snapshot, lease claim/renew/release, account read, command, subscribe, close), derives browser and pane identity from server-owned registration, and was exercised over a real loopback WebSocket. Text start and steer use the canonical codex-instructions constructors with host-issued clientUserMessageId values, turnTrigger archboard, exact lease-bound context, and an authoritative in-progress turn read. Create, attach, and relink replace the semantic controller with the exact returned thread-link CAS proof; stale disconnects cannot clear a newer binding. Production no longer selects paneIds()[0] or fabricates a headless pane.

Queue shutdown closes admission and drains accepted work before composition cancels dynamic approvals and waits and continues authority teardown. The realtime server adapter is explicitly the protocol half rather than a false DOM host; realtimeStart returns the typed SDP answer through the browser command result for browser-local peer/media attachment, while negotiation failure is an explicit not_delivered command refusal. Component assembly is a complete object checked with satisfies. The catch-all canvas workbench barrel was removed in favor of narrow application, generation, owner, production, adapter, and browser entrypoints. A behavioral repository-policy owner installs and reloads through a sealed caller-supplied retained object and enforces the exact retained-key allowlist.

Validation: focused remediation owners 151 pass / 0 fail / 791 assertions; public socket owners including a real loopback WebSocket 3 pass / 0 fail; realtime process contract 4 pass / 0 fail / 65 assertions; both TypeScript projects pass; full Oxlint passes; full oxfmt check passes. The broad module lane passed the affected owners and continued near the end before its outer runner received SIGTERM, so no complete-lane pass is claimed. The repository aggregate again received the known polite-termination/OOM-family behavior after boundary owners; its relevant composition policy is included in the green focused lane and no aggregate pass is claimed.

Protected artifact evidence correction: the authoritative protected file is /home/msc/Projects/archboard/src-DlBR1tzg.js and its SHA-256 is 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. The prior 3ffcfa2c2a07af83f4074c7e785a87aa1bb1df7a81bdbce58385525d2159cccb statement referred to the wrong tracked design document and is superseded. TASK-143.01.14 remains In Progress and all acceptance criteria remain unchecked for parent review.

Fresh implementation ownership from checkpoint 56001eb2fb3d724d822aa658c8abecbbb7a6c2b5 resolves the ten fixed-base review findings without changing task lifecycle state. The browser gateway now binds leases, cached commands, realtime sessions, public socket ownership, and disconnect cleanup to the exact WebSocket instance, so replacement and out-of-order close cannot revoke current authority and hot reload can reuse the one retained live instance. Realtime start, append, and stop share one opaque session handle; the browser owns the existing WebRTC and microphone media session and cleans it on terminal disconnect, replacement, failure, unavailable, and disposal. Thread create, attach, relink, and disconnect use the exact post-CAS controller token; attach records durable current-child attached provenance before authoritative classification. Operation context is captured from the exact lease-bound pane rather than focus or first-pane fallback. Dynamic approval and generation cleanup preserve exact host_shutdown and child_disconnected terminal causes. Retained-state enforcement now checks the exact root shape and rejects hidden generation owners on processes, closures, routes, callbacks, approvals, effects, decoders, sessions, gateways, and UI media. The old catch-all adapter implementation was replaced by narrow behavior modules and named public exports. A real loopback WebSocket proof crosses the canvas socket owner, production gateway, approval broker, lease replacement, realtime lifecycle, terminal unavailable delta, and cleanup. Fresh production installation now creates its state root before constructing CodexProcess, which restores startup from an empty XDG state directory. Verification under the required 6 GiB memory and 1 GiB swap cgroups: both TypeScript projects pass; full Oxlint and oxfmt checks pass; focused remediation and policy owners pass 63 tests with 476 assertions; application and installation owners pass 12 tests with 35 assertions; inventory policy passes 39 tests with 69 assertions; fresh hot reload passes 4 tests with 66 assertions. The broader affected module lane and isolated full module-scope policy were attempted under the cap and were OOM-killed near the ceiling, so no aggregate pass is claimed for those lanes. Protected artifact /home/msc/Projects/archboard/src-DlBR1tzg.js remains SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Fixed base is 7f37c1a903492bbd7d02699df069f2d2bc3dccba. Status remains In Progress and all acceptance criteria remain unchecked for parent review.

Fresh remediation above f01cc33a addresses all eight parent findings. Application cleanup is exact-socket owned: stale closes cannot erase the replacement pane, selection, hold, note-open state, or gateway lease, and reload-time close uses the exact browser/pane/socket tuple even before any post-reload request. Lease release, transfer, and expiry now retire only command authority; durable semantic/realtime/approval teardown runs once only for exact socket replacement/close, child exit, or host shutdown.

Retained ownership now uses one plain control cell with stable wrappers and a replaceable current-slot record. Reload severs the retired slot record, replaces the generation facade, and policy tests poison retired snapshot/gateway slots while exercising the current wrappers; nested root/control/process/slot and custom prototype attachments fail closed without claiming impossible lexical closure introspection.

The browser media owner moved into src/ui/codex-realtime/lib behind the sole reviewed index entrypoint. Attach returns explicit ready/unavailable state, exact sockets publish media readiness, replacement resets readiness, and missing APIs, permission denial, SDP failure, attach failure, success, and cleanup are covered. The canvas hook is a thin consumer and no visual contract changed.

Cross-module WebSocket proof moved to tests/system. One system owner crosses real WebSocket framing, gateway, approval broker, at-most-once approval response, replacement, media handshake, realtime start/append/stop, and terminal cleanup. A second starts src/server.ts and proves overlapping application sockets preserve pane/selection/hold/gateway authority through stale close and retire them on exact close. The existing real bun --hot owner now proves connect/claim/reload/renew on the retained application socket.

Validation under named systemd user scopes with MemoryMax=6G and MemorySwapMax=1G: final lint 0 warnings/errors; oxfmt check passes; both TypeScript projects pass; focused behavioral/system lane 64 pass / 0 fail / 314 assertions; hot reload 4 pass / 0 fail; inventory 39 pass / 0 fail; isolated deep-import/test-owner boundary 1 pass / 0 fail; isolated realtime sole-entrypoint contract 1 pass / 0 fail. The aggregate boundary owner and the isolated realtime dependency-graph and real module-scope owners were attempted but OOM-killed at the fixed cgroup ceiling, so no pass is claimed for those aggregates. Protected artifact /home/msc/Projects/archboard/src-DlBR1tzg.js remains SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Status remains In Progress and all AC remain unchecked for parent review.

Fresh rejection remediation above 4d24d3ba closes all nine review findings. Replacement socket authority transfers at acceptance before the retired close. All seven ordinary approval families cancel once on exact browser, child, or host teardown. Semantic capture uses only the controller current exact pane. Reload publishes new lifecycle callable identities over the reviewed stable lifecycle port. Browser media is a separate codex-workbench-media module with exact-run guards after asynchronous boundaries, leaving codex-realtime policy unchanged. Retained-state policy rejects spoofed callable prototypes, intrinsic mutations, and attached values. The actual src/server.ts production owner now proves initialization, epoch/coordinator readiness, pre-request reconnect, gateway decoder, lease release/reacquire, exact same-board semantic context, real ordinary and dynamic approvals with one response each, media ready/unavailable, dynamic thread creation, child exit, and terminal gateway cleanup. System cleanup is registered before first acquisition. Validation: focused module/runtime lane 108 pass, 0 fail, 718 assertions; actual production server owner 1 pass, 0 fail, 29 assertions; application WebSocket system owners 2 pass, 0 fail, 23 assertions; lint, formatting check, both TypeScript projects, frontend build, test inventory, diff check, and restored realtime boundary byte comparison pass. The realtime dependency-graph policy aggregate was attempted under the required 6 GiB memory and 1 GiB swap scope and OOM-killed after its first two assertions; its source is byte-identical to f01cc33a and no aggregate pass is claimed. Protected artifact remains SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Status remains In Progress and every AC remains unchecked for parent rereview.

Second rejection remediation above f3948b7a addresses all four rereview findings. Reload now rebuilds fresh route, notification, exit, replaceHooks, stop, finishStop, and five owner-slot identities; retained state holds only the reviewed process/generation state ports, while stable wrappers dispatch through the current control cell. Tests poison both installation/current owner slots and the complete original generation facade before exercising the replacement. Terminal cleanup attempts graph, process, realtime, queue, listener, projection, approvals, and epoch stages independently, aggregates simultaneous failures, clears current/runtime and authority in a final release, clears the shutdown-promise cache, and permits a clean reinstall after every injected failure. Browser media publishes the new run and start-operation tickets before any await, fences every continuation by exact run/operation identity, and an A/B/C race proves C remains active for delayed A disposal resolve or reject. The actual production system owner registers root, canvas, sockets, and children before later acquisition, cleans them in reverse order, closes partial sockets on open error/timeout, and proves root setup, fixture setup, listen, first-socket, and child-start failures leave no process, listener, socket, or directory leak. Final named 6 GiB/1 GiB validation: canvas/media modules 45 pass, 0 fail, 385 assertions; actual production/hot-reload/socket/setup system owners 12 pass, 0 fail, 135 assertions; composition policy 4 pass, 0 fail, 46 assertions; repository inventory passed its complete real-checkout assertions; lint has 0 warnings/errors; formatting, both TypeScript projects, frontend build, and diff check pass. The realtime and protocol dependency-boundary owners were attempted separately and hit the documented cgroup OOM fingerprint at 6 GiB, so no pass is claimed for those two owners. Protected artifact /home/msc/Projects/archboard/src-DlBR1tzg.js remains SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. Status remains In Progress and all AC remain unchecked for parent rereview.

Third rejection remediation above de56927d resolves all six rereview findings. Retained generation state now has one exact current source record and one named registration ledger. Successful reload constructs fresh hook, child-retirement, route, notification, exit, replacement, stop, and finalization callables; old listeners are inert by exact-current dispatch, and behavioral owners poison every retired hook and callback before exercising leaked listeners and terminal shutdown. The nested retained-state policy validates the exact generation, registration, hook, callback, and callable shapes.

Reload is transactional and failure-isolated. Every registration clears ownership before cleanup; all removal failures are aggregated; a new generation publishes only after complete installation; a prior generation is restored only after clean partial cleanup and complete rollback; otherwise the owner terminally releases authority. The removal, new-install, rollback, partial-cleanup, projection, cached-shutdown, aggregate-error, and reinstall matrices cover every reachable named stage. Projection cleanup specifically proves its slot is null before a throwing disposer executes and that later cleanup still runs.

The production socket helper now arms message, error, open, close, timeout, and pending-request cleanup before invoking the post-construction hook. The actual src/server.ts cleanup owner injects hook throw, socket error, early close, and timeout; each partial socket closes with zero listeners, a same-client recovery socket connects and claims/releases the lease, and teardown is observed in socket, canvas, root order with all recorded processes stopped.

The composition root was reassessed rather than left larger. A private retained-policy module plus private error and registration contract extracted structural enforcement without changing public entrypoints or creating a runtime mode. src/server/canvas/lib/codex-workbench.ts is now 1,631 lines, below the rejected 1,654-line version, and targeted module-scope analysis reports zero findings or waivers.

Final named 6 GiB/1 GiB validation: focused generation/reload/terminal/owner/policy owners 47 pass, 0 fail, 459 assertions; production canvas workbench system owners 8 pass, 0 fail, 116 assertions; hot reload 4 pass, 0 fail, 66 assertions; media 8 pass, 0 fail, 34 assertions; inventory 39 pass, 0 fail, 69 assertions; the complete module lane exited successfully; actual frontend build, full lint, formatting check, both TypeScript projects, protected diff check, and targeted module-scope analysis pass. The aggregate boundary owner was attempted once and OOM-killed at the documented cgroup ceiling after six passing cases; it was not retried and no aggregate pass is claimed. Protected artifact /home/msc/Projects/archboard/src-DlBR1tzg.js remains SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. TASK-143.01.14 remains In Progress with all AC unchecked for parent rereview.

Fourth rejection remediation above c55d5594 resolves the six retained-lifecycle and recovery findings. The retained runtime is now an exact process-lifetime kernel containing the stable process, identity ledger, transport, operation ticket, readiness flags, and release state; assembled generations, owners, routes, decoders, callbacks, approvals, authorities, sessions, gateways, and UI adapters exist only behind the replaceable current source. The structural policy enforces exact root and kernel shapes and recursively rejects hostile Map/Set entries, callable attachments, prototype spoofing, and intrinsic mutation.

A private lifecycle unit now owns reservation tickets, activation publication fences, synchronous public and internal dispatch revocation before the first shutdown await, transactional reload and rollback, exact stale-start cleanup, child retirement, and terminal release. A private exhaustive router owns the eleven generated request variants. The composition root now owns only graph assembly and public wiring and is 654 lines. Delayed start, replacement, reload, rollback, leaked-listener, and shutdown-during-activation owners prove stale work cannot publish over or release the current runtime.

Production reload constructs a fresh runtime graph while reusing only the reviewed process, identity, transport, and browser-lease ledgers. Exact transport identity is replaced and restored on rollback; the browser connection and command lease survive a clean reload through the current gateway without retaining a generation-bound gateway. Synthetic socket.emit failure injection was removed. Real loopback peers now exercise connection refusal, accepted early close, and a withheld WebSocket upgrade timeout; each partial socket is closed and listener-free, followed by a successful actual src/server.ts recovery that connects, claims, and releases authority.

Final named 6 GiB memory / 1 GiB swap validation: lifecycle owner matrix 22 pass, 0 fail, 108 assertions; Codex transport/session/identity/canvas/gateway lane 150 pass, 0 fail, 1,404 assertions; hot-reload, actual production server, real network cleanup, and application socket lane 11 pass, 0 fail, 174 assertions; inventory 39 pass, 0 fail, 69 assertions; full lint 0 warnings/errors; formatting check, both TypeScript projects, frontend build, targeted module-scope policy, and diff check pass. The complete module aggregate was attempted once and OOM-killed at the fixed 6 GiB memory plus 1 GiB swap ceiling; it was not retried and no aggregate pass is claimed. Protected artifact /home/msc/Projects/archboard/src-DlBR1tzg.js remains SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. TASK-143.01.14 remains In Progress and every acceptance criterion remains unchecked for parent rereview.

Fifth rejection remediation above 0b0f9cab resolves the six lifecycle findings as one transaction boundary. Reload now owns an explicit transaction plus a live-generation ledger covering the old graph, candidate, and rollback graph. Shutdown increments the exact runtime ticket, invalidates the transaction, revokes retained dispatch, detaches the stable exit observer, and synchronously calls stop on every owned graph before its first await. Every create, activate, candidate cleanup, old cleanup, rollback, and final publication continuation rechecks the exact retained runtime, ticket, phase, process child identity, open transport, terminal latch, and transaction owner. Deferred old-cleanup and rollback-activation schedules prove a stale continuation cannot overwrite a replacement runtime, state, gateway, or slots.

Child exit moved out of source generations into one process-lifetime retained observer with an exact terminal-event latch. Generation activation no longer removes exit observation. An exit during a waiting factory, candidate activation, or old cleanup revokes authority synchronously, selects the exact current settlement owner, and cleans every live graph once. Ready publication requires the same child PID and stdio handles plus an open transport. Shutdown-during-candidate owners cover success, activation failure, and cleanup failure and prove the old graph stops and finalizes exactly once.

Production initialization now receives the lifecycle transaction guard. Session initialization, account read, and coordinator ensure check it before their side effects and after every await; account-derived session, browser, child, and coordinator readiness publishes only after the complete staged result remains current. Three deferred owners retire initialization at each await and prove no later readiness mutation occurs. The canvas application caches the loaded production module during prepare and invokes its shutdown entrypoint synchronously, so every retained wrapper refuses before deferred graph cleanup or any later await.

The request router is private again. codex-workbench-generation.ts and the composition root no longer export it. Generation behavior still drives all seven ordinary families, both item/tool/call owners, and the three session methods through the installed transport listener. Repository policy scans the module and permits only lib/codex-workbench-lifecycle.ts to import the private router. The composition root remains smaller than the accepted split at 643 lines.

Final sequential named 6 GiB memory / 1 GiB swap validation: adversarial lifecycle, production initialization, application revocation, and policy lane 32 pass, 0 fail, 150 assertions; focused transport/session/identity/gateway/canvas module lane 161 pass, 0 fail, 1,454 assertions; actual src/server.ts composition, application socket, real first-socket failure recovery, startup cleanup, and stale-socket system lane 8 pass, 0 fail, 118 assertions; inventory 39 pass, 0 fail, 69 assertions. Both TypeScript projects, full lint with 0 warnings/errors, formatting check, frontend build, targeted module-scope analysis with zero findings/waivers, and diff check pass. The documented complete module and aggregate boundary OOM fingerprints were not rerun and no pass is claimed for them. Protected artifact /home/msc/Projects/archboard/src-DlBR1tzg.js remains SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. TASK-143.01.14 remains In Progress and every acceptance criterion remains unchecked for parent rereview.

Sixth rejection remediation above 91991bce resolves the three rereview findings. The retained child-exit observer/disposer was replaced by an exact two-field process-lifetime bridge: one terminal event latch and one replaceable source-handler record. The sole transport listener closes only over that bridge, records the exact child/epoch event before dispatch, and has no retained listener or disposer slot. Every ready or rollback publication installs a fresh handler identity; an adversarial reload poisons the retired handler and proves the stable listener reaches only the replacement. Retained policy enforces the exact bridge/handler shapes and rejects attached callbacks and authority descendants.

Initial startup now acquires the exact identity ledger, identity authority, and transport synchronously from the published child before awaiting generation construction. Transport exit events are one-shot, replayable, and cleared after delivery; transport construction also detects a child whose exitCode/signalCode was already terminal. The startup owner covers exit before bridge subscription, while the factory waits, and after factory return during activation. Each schedule leaves no current slots, does not remain starting, owns one listener, cleans each partial graph once, stops the process once, and permits a clean subsequent install.

The canvas application now has explicit idle/preparing/installed/stopping/stopped phases. It receives the already-loaded production module, publishes its shutdown owner before installation/start can await, invokes production revocation exactly once during preparation, treats shutdown as terminal intent, waits cleanup, never republishes installed state afterward, and preserves simultaneous startup and shutdown failures in one AggregateError. A clean reinstall after that aggregate failure is proven.

Final named 6 GiB memory / 1 GiB swap validation: required adversarial owners 18 pass, 0 fail, 116 assertions; focused process/transport/session/identity/gateway owners 161 pass, 0 fail, 1,480 assertions; focused canvas/transport owners 62 pass, 0 fail, 378 assertions; actual src/server.ts production, application socket, real first-socket recovery, startup cleanup, and stale-socket owners 8 pass, 0 fail, 118 assertions; inventory 39 pass, 0 fail, 69 assertions. Both TypeScript projects, full lint with 0 warnings/errors, formatting check, frontend build, protected diff check, and direct module-scope analysis of every changed production module pass with zero findings or waivers. The repository-wide module-scope aggregate was attempted once and OOM-killed at the fixed cgroup ceiling; it was not retried and no aggregate pass is claimed. Protected artifact /home/msc/Projects/archboard/src-DlBR1tzg.js remains SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. TASK-143.01.14 remains In Progress and every acceptance criterion remains unchecked for parent rereview.

Seventh rejection remediation above 127e5cad closes the stopping/prepare overlap in the application state machine only. prepare now branches on every phase before mutating local or retained ownership. A call during stopping refuses with an actionable wait-then-prepare error; it cannot clear terminal intent, replace the shutdown promise, mark preparing, start, or reload. A replacement source instance sees the same shared stopping phase and refuses too.

Shutdown now creates and publishes its exact promise before invoking production teardown, marks installed ownership false and phase stopping synchronously, and returns that same promise through every same-source or replacement-source caller. Cleanup success or rejection is cached until an explicit prepare begins from stopped. If shutdown finishes while an earlier preparation still awaits readiness, phase remains stopping and blocks reinstall until that preparation settles; only then does the owner publish stopped. A new prepare from stopped clears the prior terminal ownership and starts one clean installation.

The exact overlap owners start installed, block cleanup, call shutdown A, call prepare from a replacement source, and call shutdown B. Before release they prove A===B, shutdownCalls=1, reloadCalls=0, installed=false, phase=stopping, and retained shutdown authority unchanged. Success and rejection variants prove stable settlement, concurrent refusal, no cached-state corruption, and explicit clean reinstall. Final sequential named 6 GiB/1 GiB validation: application overlap owner 7 pass, 0 fail, 57 assertions; focused non-hot canvas/transport owners 64 pass, 0 fail, 409 assertions; actual src/server.ts production/application socket/setup cleanup/stale-socket owners 8 pass, 0 fail, 118 assertions. Both TypeScript projects, lint with 0 warnings/errors, formatting check, and diff check pass. No known OOM fingerprint was rerun. The protected artifact remains SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. TASK-143.01.14 remains In Progress and all AC remain unchecked.

Eighth rejection remediation above fb3b05f5 keeps the settled terminal result in shared application ownership. The stopped phase retains the retiring source shutdown function, so same-source and replacement-source calls return the original promise object after either fulfillment or rejection. A recovery prepare replaces that function before installation begins. If recovery startup fails, its exact rejected prepare promise becomes the new stopped result; later shutdown calls replay it until another explicit recovery begins. The retired installed owner never returns and teardown does not repeat.

Post-settlement success and rejection owners prove exact promise and error identity across replacement source construction, one teardown, no reload, no extra start, and one fresh ownership cycle after explicit recovery. A failed-recovery owner proves synchronous authority replacement, exact failed-prepare replay through a third source, no teardown during startup failure, and a later clean recovery with a distinct shutdown promise. Final named 6 GiB/1 GiB validation: exact application owner 8 pass, 0 fail, 79 assertions; focused non-hot canvas and transport owners 65 pass, 0 fail, 431 assertions; production system owners 8 pass, 0 fail, 118 assertions. Both TypeScript projects, lint with 0 warnings and errors, formatting, and diff checks pass. No known OOM fingerprint was rerun. The protected artifact remains SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. TASK-143.01.14 remains In Progress and all acceptance criteria remain unchecked.

Ninth rejection remediation above 2be7641a fixes the combined recovery schedule. When recovery startup fails after concurrent teardown, the application publishes the exact recovery prepare operation as stopped terminal ownership before throwing. This applies to the original startup error and the combined startup plus teardown AggregateError. The final transition retains that owner. Same-source and replacement-source shutdown calls replay the exact promise and reason without another install, reload, or teardown. One gated owner runs both fulfilled and rejected concurrent teardown schedules, checks B, C, and D promise identity, holds counters at two installs, two starts, zero reloads, and two teardowns, then proves one later explicit recovery cycle. Final named 6 GiB/1 GiB validation: exact application owners 9 pass, 0 fail, 114 assertions; focused non-hot canvas and transport owners 66 pass, 0 fail, 466 assertions; production system owners 8 pass, 0 fail, 118 assertions; repository inventory 39 pass, 0 fail, 69 assertions. Both TypeScript projects, lint with 0 warnings and errors, formatting, and diff checks pass. No known OOM fingerprint was rerun. The protected artifact remains SHA-256 22f897b2af2cf20f0252a8283db930e03a321ef2ad2916d714acd421c83540a6. TASK-143.01.14 remains In Progress and all acceptance criteria remain unchecked.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Made failed recovery preparation supersede any concurrent teardown result with its exact promise and exact startup or aggregate rejection. Gated success and failure schedules, prior application owners, focused non-hot, production, inventory, type, lint, format, and diff checks pass. Task status and acceptance criteria remain unchanged for parent rereview.
<!-- SECTION:FINAL_SUMMARY:END -->
