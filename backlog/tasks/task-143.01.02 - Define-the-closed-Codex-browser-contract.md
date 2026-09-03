---
id: TASK-143.01.02
title: Define the browser-only Codex workbench model
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:06'
updated_date: '2026-09-03 21:23'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.08.05
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/shared/codex-browser-model
  - src/runtime/codex-approvals
  - src/server/codex-workbench
  - src/server/canvas/lib/codex-workbench-browser-gateway.ts
  - src/server/canvas/lib/codex-workbench-lifecycle.ts
  - src/server/canvas/lib/codex-workbench-production.ts
  - src/server/canvas/tests/codex-workbench-ordinary-approvals.test.ts
  - src/server/canvas/tests/codex-workbench-composed-approval-lifecycle.test.ts
  - src/server/canvas/tests/support/codex-workbench-generation-fixture.ts
  - tests/system/canvas-state/codex-workbench-application.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 172000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Define only the browser-facing workbench state and user-intent model that has no Codex vendor equivalent. Consume the generated, normalized wire views, reverse-request handling, and ingress boundaries owned by TASK-143.08.02 and TASK-143.08.03. This leaf does not define, validate, normalize, or mirror a Codex request, response, notification, policy, integer, or private path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The browser-only model covers the reachable readiness, account, thread-link, timeline, queue, settings, approval, text-command, semantic-delivery, coordinator, voice, command-lease, and delivery-outcome states needed by the workbench; every Codex-origin value is imported from the recovered normalized module rather than copied into a browser DTO.
- [x] #2 One projection adapter maps recovered protocol and domain outputs into browser-only states, handles every reachable producer outcome, excludes secrets and vendor-private paths, and contains no app-server ingress parser or reverse-request router.
- [x] #3 The browser action and result union describes only user intents issued by the workbench and maps each intent to one existing host owner; it consumes recovered generated request or result types where they apply and refuses unsupported actions explicitly.
- [x] #4 Focused tests cover browser projection, secret exclusion, domain-only state, and public action results. They do not repeat generated-type conformance, app-server ingress validation, BrowserUseOriginPolicy, i64 normalization, tool resolution, formatter, linter, alias, fixture-cleanup, or prose checks.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the rejected generated-import-free browser package with one browser-only state, intent, and result contract derived from the recovered codex-app-server-contract and opaque identity exports. Remove app-server ingress, reverse-request, wire-policy, and vendor-private path ownership from this module.
2. Add one projection adapter that accepts normalized producer views, returns the closed browser snapshot, excludes secrets and private paths by construction, and exhaustively maps every reachable readiness, account, link, timeline, queue, settings, approval, semantic, coordinator, voice, lease, and delivery outcome.
3. Define a closed user-intent union with one explicit host owner per intent, generated request/result-derived payloads where applicable, and an explicit unsupported-action refusal. Preserve only compatibility needed by current browser/server consumers; move no protocol authority back into the browser package.
4. Replace the old conformance-heavy suite with focused module tests for projection, secret/private-path exclusion, domain-only state, action ownership, supported results, and unsupported refusal.
5. Run the exact focused module tests, affected TypeScript compilation, scoped Oxlint and Oxfmt checks, direct import/contract probes, and git diff checks. Record durations and execution notes, commit, leave the task In Progress, and stop for independent review.

6. Remediation: replace the permission JSON catch-all with a closed browser permission presentation selected from the generated RequestPermissionProfile, and make account mapping exhaustively keyed by the generated account union.
7. Make CodexWorkbenchPort expose normalized/domain owner views. Centralize every browser conversion in projectCodexBrowserState and remove canvas/server-side parallel DTO assembly.
8. Make the production gateway dispatch table the single exhaustive action authority with an explicit unsupported refusal and generated-derived owner request/result types where Codex methods apply.
9. Retain terminal ordinary approvals until an existing authored acknowledgement boundary removes them. Replace shallow tests with focused projection, dispatch, and gateway lifecycle owners.
10. Run only the affected browser-model, approval, gateway, scoped TypeScript, lint, format, contract, and diff checks. Commit remediation separately and callback the parent for rereview.

11. Second remediation: expose generated-derived approval owner records from codex-approvals without BrowserApproval construction or browser-model dependencies.
12. Project all seven approval families only inside projectCodexBrowserState, using one exhaustive generated file-access mapping and omitting cwd and every path-bearing/private field.
13. Preserve terminal settlement acknowledgement and production dispatch behavior; replace approval projector tests with owner-record and public projection coverage plus a gateway leak proof.
14. Run only affected focused tests, both TypeScript configs, scoped lint/format, boundary grep, and diff checks; commit separately and callback for rereview.

15. Third remediation: make normalized approval requests broker-owned and deeply immutable at ingestion; expose deeply readonly views and prove returned nested data cannot mutate later views or settlement.
16. Delete duplicate elicitation presentation shaping from codex-approvals, retaining only the smallest supported-schema predicate used by spoken eligibility.
17. Make every projectApproval family arm return BrowserApproval directly and preserve generated-family exhaustiveness at TypeScript.
18. Add one-shot acknowledgement for expiry and child-exit after snapshot publication, plus immediate disconnect acknowledgement when no browser remains; keep authored response acknowledgement unchanged.
19. Run only focused approval/browser-model/gateway lifecycle tests, both TypeScript configs, scoped lint/format, boundary grep, and diff checks; commit separately and callback for rereview.

20. Fourth remediation: gate pane-bound disconnect cancellation on the final live connection whose authoritative pane link still matches the closing presenter.
21. Settle approval child-exit first in the composed lifecycle, publish its final decision and transport outcome while connections remain live, then terminate gateway connections.
22. Route initial and delta snapshots through one post-construction spontaneous-terminal acknowledgement helper; retire owner-reported spontaneous terminals immediately when the connection registry is empty.
23. Export DeepReadonlyApprovalRequest, use it for every approval request callback/view exposure, and remove the test-only getRequest method.
24. Add deterministic final-presenter, zero-connection, initial-snapshot, and real broker-to-gateway child-exit owners. Run only the requested focused tests and static gates, commit separately, and callback the parent.

25. Fifth remediation: derive queue submissions from Pick<SessionQueuedSubmission, "id" | "input"> and voice transcript entries from the selected RealtimeTranscriptRecord fields, keeping browser field projection closed.

26. Derive ordinary-approval presenter context only from a fresh pane binding during disconnect; retain the lease-captured binding only for thread-link, realtime, and dynamic teardown callbacks.

27. Add a focused lease-then-relink regression that cancels and acknowledges the current-link approval while proving the old captured lease context cannot clear current durable link state.

28. Run only focused projection, gateway, and approval owners plus both TypeScript configs, exact lint, format, boundary, and diff checks; commit separately and callback the parent.

29. Sixth remediation: remove command cwd, file-change grantRoot, apply-patch grantRoot, and legacy exec cwd from BrowserApproval and projectApproval; extend the existing seven-family projection owner to reject every injected private path.

30. Move authored session and reverse-response validators from codex-browser-model into codex-protocol. Make browser login and approval command schemas carry JSON only, derive their public intent types from generated contracts, and normalize them through codex-protocol and codex-approvals before dispatch.

31. Delete the settled-cache capacity-fill and oversized-delta capacity tests from the ordinary gateway owner, and remove the now test-only public settled-limit export. Do not create an opt-in suite for two redundant implementation-capacity probes.

32. Run only the affected browser-model, protocol, transport, session, approval, projection, and gateway owners, both TypeScript configs, scoped lint/format/diff and boundary probes; commit separately and callback the parent.

33. Seventh remediation: delete the complete ordinary transport test that fills configured queued-frame and stderr-retention limits. Retain no replacement because existing transport/adversarial ownership already covers stderr delivery and rejection behavior; leave repository-wide opt-in classification to TASK-148.13.
34. Derive the browser network-policy decision arm from the generated decision with Extract and Pick<host | action>. Project those two fields explicitly, and extend the existing seven-family path owner with a structurally valid future private field that fails against the current spread.
35. Run only the exact projection red/green owner, affected browser-model/transport/projection tests, both TypeScript projects, scoped Oxlint/Oxfmt, the relevant test-inventory policy, and diff checks. Commit separately and callback the parent.

36. Eighth remediation: expose immutable dynamic-approval owner views composed from the existing DynamicToolApprovalRequest and lease binding, and remove browser DTO production from the canvas approval owner.

37. Make projectCodexBrowserState the sole dynamic approval effect/card projector. Validate dynamic response commands against the projected snapshot, retain exact owner settlement checks, and delete BrowserDynamicApprovalActions.pending.

38. Add one focused projection owner covering create_thread, fork_thread, and send_message_to_thread with private authority/path exclusion and stable closed output. Delete the unused server-request-scalars module without replacement.

39. Run only focused dynamic approval, projection, gateway, owner, both TypeScript, scoped lint/format, boundary/import, and diff checks. Commit separately and callback the parent for rereview.

40. Ninth remediation: capture each presented DynamicToolApprovalRequest as a structured-cloned, recursively frozen owner graph and expose it as a DeepReadonly-derived request view without a parallel semantic type.

41. Project the nine public dynamic identity fields explicitly and reuse the adopted fork beforeTurnId for its effective boundary, so future identity descendants are omitted instead of rejected.

42. Extend the focused owner and three-family projection proofs with source-alias mutation, runtime deep freeze, compile-time nested readonly, exact identity keys, and private identity omission.

43. Run only focused dynamic owner/projection/gateway/settlement tests, type probes, both TypeScript configs, scoped lint/format, boundary/import, and diff checks. Commit separately and callback the parent for rereview.

44. Tenth remediation: normalize fork arguments.beforeTurnId and effect.effectiveBoundary.beforeTurnId independently, preserving an already-issued authority boundary and adopting a raw boundary when needed.

45. Add one focused self-fork owner whose requested beforeTurnId is null while its effective boundary is the caller turn; preserve the existing other-fork assertions.

46. Run only the exact dynamic projection red/green owner, directly affected gateway/owner checks, both TypeScript configs, scoped lint/format/diff, commit separately, and callback the parent.

47. Eleventh remediation: accept the authoritative ThreadLinkSnapshot at the sole projection boundary and replace the browser vendor-source mirror with one closed sourcePresentation category that discloses only standard, subagent, custom, or unknown provenance.
48. Remove the gateway pre-projection browser parse and add focused subagent/custom projection owners proving useful categories while agent_path, nicknames, roles, parent identities, and arbitrary custom/private strings remain absent.
49. Restrict effective turn-boundary adoption to IdentityValidationError code invalid-shape; rethrow wrong-domain and unissued canonical identities. Add valid issued, genuine raw, wrong-domain, and foreign-unissued owners.
50. Run only focused thread-link, dynamic projection/gateway, both TypeScript projects, exact scoped lint/format/boundary/diff checks; commit separately and callback the parent for rereview.

51. Twelfth remediation: replace BrowserTimeline projection input with a readonly CodexTimelineProjectionInput derived from branded SessionTurn identity/status, the generated timeline cursor, and the owner-selected item presentation union; keep the future producer out of this leaf.
52. Rebuild the timeline, every item arm, each turn, and output metadata inside projectCodexBrowserState so private extensions cannot cross the browser boundary. Add one focused non-null command-item owner with top-level, turn, item, and domain-turn extensions.
53. Project granular approval-policy booleans and active permission profile id/extends explicitly. Add decoded loose-object extensions at both nested settings records and prove projection success, omission, public values, and deep freeze.
54. Run only focused timeline/settings projection and affected browser/gateway/type owners, both TypeScript projects, exact scoped lint/format/boundary/diff checks; commit separately and callback the parent for rereview.

55. Thirteenth remediation: replace the browser-derived timeline projection input with an independent readonly owner presentation union whose item identities and statuses come from SessionThreadItem, whose approval identity comes from ItemApprovalIdentity, and whose cursor comes from the generated timeline response.

56. Make projectCodexBrowserState translate the independent owner discriminators, nested domain items, turn presentation metadata, and cursor into all seven BrowserTimeline arms; retain private-extension omission and deep-freeze ownership without adding a producer or adapter.

57. Confirm unsafe_url has no producer or consumer, delete the unreachable CodexApprovalErrorCode member, and adjust only genuine exhaustiveness owners if any appear.

58. Run focused timeline red/green projection and type owners, affected approval error checks, both TypeScript configs, exact scoped lint/format/boundary/diff checks; commit separately and callback the parent for rereview.

59. Integrate the fourteen review-clean commits into the canonical TASK-143/144 workbench branch, preserve the existing coordinator and timeline contracts at overlapping seams, repair only compatibility failures exposed by direct production and type owners, then finalize from focused evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rebuilt the browser-facing contract against the recovered Codex 0.151.0 generated and normalized exports. The package now has one closed projection adapter, generated request/result-derived owner views, a complete 19-intent owner table, and explicit unsupported-action refusal. Projection selects only browser fields, rejects secret-bearing inputs, strips account email and thread-private settings, deep-freezes snapshots, and preserves domain-only identity authority.

Ordinary approval cards now retain authoritative lifecycle, decision and delivery outcome, current binding, spoken eligibility, exact requested permission profiles, and full elicitation constraints. The broker projects pending and terminal states from its single settlement record. The obsolete generated-conformance contract test and browser tool-result mirror were removed; focused projection, action, approval, and gateway owners remain.

Focused red/green evidence: the affected gateway lane initially rejected its legacy approval fixture as invalid_projection; after adding lifecycle, binding, and spoken authority, the exact test passed 1/1 and the affected test set passed 86/86 with 608 expectations in 1.17s. Scoped TypeScript passed in 0.77s, Oxlint in 0.17s, Oxfmt in 0.09s, boundary grep and git diff checks passed. No broad check, browser, repository, system, or full-suite command was run.

Review remediation replaces the raw permission profile with a generated-derived, path-free network/file-access summary; maps generated account types through an exhaustive record; and strips sandbox writable roots at the sole projectCodexBrowserState seam. Canvas now supplies normalized owner views, while the gateway owns one exhaustive dispatch table and explicit unsupported-command refusal. Terminal ordinary approvals survive in the command-result snapshot, then leave broker state through explicit acknowledgement; the next snapshot omits them. The redundant browser action-owner module and shallow mapping test were removed and replaced by projection, dispatch, and lifecycle checks.

Remediation red/green: the focused lane first exposed two stale expectations (permission access and voice readiness), then passed 86/86 with 582 expectations in 1.12s. Root TypeScript passed in 1.78s; frontend TypeScript in 0.46s; scoped Oxlint in 0.18s; scoped Oxfmt in 0.08s; boundary grep and git diff checks passed. The system fixture was adapted only so root TypeScript covers the public port; no system, repository, browser, broad check, or full-suite lane was run. TASK-143.01.02 remains In Progress for independent rereview.

Second review remediation removed the last ordinary-approval browser projector from codex-approvals. The broker now exposes ApprovalOwnerView: the generated-derived normalized request, owner settlement snapshot including decision, and spoken eligibility. BrowserProjectionPort carries those views unchanged. projectCodexBrowserState is now the only public owner-to-browser adapter; its private approval helper exhaustively maps all seven families. codex-approvals no longer imports codex-browser-model, and its response input is a generated CodexServerResponseByMethod-derived union.

Permission presentation now omits cwd and selects only network plus file-access classes. One browser access record supplies the reviewed deny/read/write vocabulary, while a satisfies Record<CodexFileAccess, string> check keys it exhaustively from PermissionsApprovalRequest params; a generated access addition fails TypeScript. The production gateway test injects cwd, read, write, denied-entry, and unreviewed future private paths and proves none reach the snapshot. The former broker browser-projector tests and shared parallel projector were deleted; normalized owner-view tests and public seven-family projection tests replace them. Terminal result visibility and acknowledgement remain unchanged.

Second-remediation red/green: the first focused run exposed three stale tests tied to the removed broker projector/schema boundary; after moving their observable owners, the final affected lane passed 92/92 with 1,060 expectations in 0.84s. Root TypeScript passed in 1.88s; frontend TypeScript in 0.46s; scoped Oxlint in 0.19s; scoped Oxfmt in 0.09s; boundary grep and git diff checks passed. No system, repository, browser, broad check, or full-suite lane was run. TASK-143.01.02 remains In Progress for independent rereview.

Third review remediation implemented:
- Approval ingestion now structured-clones the generated request once, recursively freezes the broker-owned graph, preserves source identity only for duplicate-delivery detection, and exposes deeply readonly owner views. The mutation regression changes the source after ingestion and attempts returned command, decision-array, and binding-object mutations; later views and settlement retain the canonical request.
- codex-approvals deleted elicitation field projection helpers and retains only supportsSpokenFormSchema for spoken eligibility. Browser field shaping remains solely in codex-workbench approval-projection.
- projectApproval now returns BrowserApproval directly. Every family constructs mutable browser-owned arrays/objects where generated owner data is deeply readonly, while the existing browser boundary parse remains.
- Terminal delivery intent distinguishes authored_response from after_publish. Gateway publication gathers terminal IDs only after emitting each changed snapshot, then the canvas adapter acknowledges spontaneous terminals. Authored response terminals remain through the command result and are acknowledged afterward. Browser disconnect cancels and immediately acknowledges because no browser can receive that card.
- Focused regressions cover immutable nested ownership, expiry/child-exit after-publish intent, one-snapshot expiry/stale publication, authored response visibility and late refusal, and disconnect no-retention.
Validation: 103 focused approval/browser-model/workbench gateway/canvas browser tests passed (1094 assertions); root and frontend tsc passed; oxlint passed; full format check passed; git diff --check passed. Broad system, serial-browser, module, repository, and check lanes were intentionally not run.

Fourth review remediation:
- Disconnect cleanup now derives an ordinary approval presenter context from the current pane binding, independent of command lease ownership. It checks the existing connection registry for another live connection with the same pane, link revision, and link value. The first of two presenters leaves the approval pending and usable; the final presenter cancels and acknowledges it.
- The composed child-exit order now settles ordinary approvals first and terminates the gateway last. Spontaneous broker terminals publish only after transport outcome is known. The real broker-to-gateway owner observes one stale terminal with cancelled decision and delivered outcome, then acknowledgement and connection disposal.
- Initial and delta snapshots use the same terminal-ID collector and acknowledgement action. A constructed initial snapshot carries a spontaneous terminal once; the next snapshot omits it. With no live connections, the gateway asks the owner for after-publish terminals and retires them immediately.
- codex-approvals exports DeepReadonly and DeepReadonlyApprovalRequest. ApprovalOwnerView, getCurrentBinding, and getSpokenEligibilityFacts use the deep readonly request. The unused getRequest method was removed. TypeScript expectation checks reject nested mutation at each public seam.
Red evidence against d15914f2: the focused base archive failed zero-connection retirement, initial-snapshot acknowledgement, and final-presenter preservation; the composed base archive separately failed to publish the child-exit terminal. Both disposable archives were removed. Green evidence: 93 focused approval, gateway, and composed lifecycle tests passed with 1002 assertions. Root and frontend tsc, oxlint, full format check, boundary probes, and git diff check passed. Broad system, browser, module, repository, full test, and check lanes were not run.

Fifth review remediation derives queue projection submissions directly from Pick<SessionQueuedSubmission, "id" | "input"> and transcript entries from a five-field Pick<RealtimeTranscriptRecord>. The copied queue shape and string-widened transcript status are gone; owner changes at those selected fields now reach TypeScript while browser output selection stays in projectCodexBrowserState.

Disconnect now reads the current pane binding for BrowserPresenterContext every time. The lease-captured state.binding remains exclusive to thread-link, realtime, and dynamic teardown. The regression claims revision 0, relinks to revision 1, presents a current-thread approval, then closes the final presenter. Against c2150567 it failed because the approval remained; after the fix the approval is retired and the simulated durable current-link state remains bound.

Validation: 94 focused approval, projection, gateway, and composed canvas lifecycle tests passed with 1005 assertions. Root and frontend tsc passed. Oxlint passed. The full format check passed across 1008 files. Derived-type boundary probes and git diff checks passed. No broad system, serial-browser, module, repository, full-test, or check lane ran.

Sixth review remediation:
- BrowserApproval no longer carries command cwd, file-change grantRoot, apply-patch grantRoot, or legacy exec cwd. The sole projection now selects user-input question and option fields explicitly. Its seven-family owner injects 12 private paths across command, file, user-input, elicitation, permissions, apply-patch, and exec inputs and proves none enter browser JSON.
- Authored initialize/login policy and every reverse-response validator moved from codex-browser-model to codex-protocol. Browser command schemas retain only JSON ingress; UI intent types derive from generated public request/result contracts, while server actions consume SupportedLoginAccountParams and ApprovalResponse from their runtime owners. The gateway normalizes through those owners before dispatch, and focused tests prove unsupported login and malformed approval values never reach actions.
- The two ordinary capacity probes (settled-cache fill and 500-approval oversized delta) were deleted instead of creating an opt-in suite for redundant implementation probes. The settled-cache limit is private again.

Red evidence against bfc379f0: the seven-family projection owner failed before projection when a loose user-input extension reached the strict browser DTO. Green evidence: that exact owner passes 1/1 with 20 assertions, including every injected private path. Final affected module validation passed 685/685 tests with 4,853 assertions in 2.15s; composed canvas validation passed 4/4 with 29 assertions; focused repository inventory/composition/retirement policy passed 47/47 with 184 assertions. Root and frontend TypeScript, exact scoped Oxlint, exact scoped Oxfmt, boundary probes, and git diff checks passed. No broad module, system, browser, full-test, or check lane ran. TASK-143.01.02 remains In Progress for parent rereview.

Seventh review remediation:
- Deleted the complete ordinary transport case that blocked stdin, filled every configured regular queue slot, asserted overflow backpressure, and wrote beyond the configured retained-stderr limit. No smaller replacement was added because the case combined capacity/load proofs and existing transport ownership already covers ordinary protocol delivery, rejection, cleanup, and stderr flow. package.json still selects this file through test:modules, but the synthetic case is gone. No test owner path, package selector, or inventory changed, so the inventory policy was not run. Repository-wide normal/opt-in classification remains TASK-148.13.
- Browser command network-policy decisions now name a generated-derived presentation type: Extract selects the generated network-policy arm and Pick limits its amendment to host and action. projectCommandDecision selects those fields explicitly. The existing seven-family projection owner adds a structurally valid future privatePath to the owner decision, asserts the exact projected host/action value, and proves the private field never enters browser JSON.

Red evidence against 4b94dff6: the exact seven-family projection test returned refused when the future network-policy field crossed through the spread. Green evidence: the exact owner passed with 22 assertions. Final focused protocol, transport, browser-model, projection, and gateway validation passed 596/596 tests with 3,634 assertions in 0.85s. Root and frontend TypeScript, exact scoped Oxlint/Oxfmt, boundary probes, and git diff checks passed. No broad module, system, repository, browser, full-test, or check lane ran. TASK-143.01.02 remains In Progress for parent rereview.

Eighth review remediation:
- CanvasDynamicApprovalOwner now exposes immutable authoritative request/binding views and no longer imports codex-browser-model or constructs BrowserDynamicApproval/BrowserDynamicApprovalEffect values. BrowserDynamicApprovalActions no longer carries a parallel pending DTO reader.
- projectCodexBrowserState is the sole dynamic-card/effect projector. It explicitly selects each create, fork, and send field, adopts raw target identities through the trusted decoder, omits authority tokens and private descendants, and produces the closed schema-validated snapshot. Gateway pending validation reads that projected snapshot; the owner retains an exact current-binding comparison before settlement.
- The DTO-only terminal gateway fixture was deleted because the real owner removes terminal dynamic approvals at settlement and cannot expose that state. The unused server-request-scalars module had no consumers and was deleted without relocation.

Red evidence: the first root TypeScript run after changing the contract failed at every stale DTO seam (old browser.pending consumers, DTO projection inputs, and two-argument projection calls). Green evidence: 76 focused dynamic model/projection/gateway/canvas tests passed with 458 assertions; the new three-family projection owner passed with exact closed keys, identity targets, private-path/authority omission, and frozen output. Root and frontend TypeScript, exact scoped Oxlint/Oxfmt, 46 boundary/inventory tests with 135 assertions, import/retirement probes, and git diff checks passed. No broad module, system, browser, full-test, or check lane ran. TASK-143.01.02 remains In Progress for parent rereview.

Ninth review remediation:
- DynamicApprovalOwnerRequest is a type-only DeepReadonly<DynamicToolApprovalRequest> derivation. The canvas owner structured-clones each presented request, recursively freezes the owned graph, and discards the caller alias; no second semantic request model was added. Correlation selects the nine authored identity fields plus effectHash, so omitted future identity descendants cannot break response lookup.
- projectCodexBrowserState now constructs the exact nine-field browser identity and reuses the already-adopted fork beforeTurnId for effectiveBoundary. A structurally valid futurePrivateIdentity field is deliberately omitted, not passed into strict-schema refusal.
- Compile-time probes reject nested argument and boundary mutation. The runtime owner proof mutates the caller argument after presentation, rejects retained-graph mutation, preserves the original projected request, and settles expiry with the original identity and hash.

Red evidence: before implementation, the exact three-family projection owner failed 0/1 because the future identity field made the adapter return refused. Green evidence: the focused dynamic model/projection/gateway/canvas lane passed 76/76 with 473 assertions. Root and frontend TypeScript, exact scoped Oxlint/Oxfmt, the 7 boundary-policy tests with 66 assertions, import residue probes, and git diff checks passed. No broad module, system, browser, topology, stress, capacity, performance, full-test, or check lane ran. TASK-143.01.02 remains In Progress for parent rereview.

Tenth review remediation:
- Fork projection now treats requested and effective turn boundaries as separate authority values. arguments.beforeTurnId is adopted from the authored request. effectiveBoundary.beforeTurnId resolves an already-issued turn first and adopts only a raw boundary fallback.
- A focused self-fork owner models the reachable contract: requested beforeTurnId is null, effective relation is self, and the boundary is the caller identity turn. Projection accepts it, preserves the null argument, emits the caller turn boundary, and freezes both nested records. The existing other-fork equality owner remains unchanged.

Red evidence against 595b48a7: the exact dynamic projection file passed the existing three-family owner and failed the new self-fork owner 1/2 because projection returned refused. Green evidence: 55 focused dynamic schema/projection/gateway/recovery/owner/correlation tests passed with 368 assertions. Root and frontend TypeScript, exact scoped Oxlint/Oxfmt, and git diff checks passed. No broad lane ran. Topology is unchanged and no known residue remains in this remediation. TASK-143.01.02 remains In Progress for parent rereview.

Eleventh review remediation:
- BrowserProjectionInput now accepts the authoritative ThreadLinkSnapshot. projectCodexBrowserState is the sole adapter and emits sourcePresentation only: standard, subagent, custom, unknown, or null for unbound. The BrowserThreadLink schema no longer contains the vendor source union, parent identity, agent path/nickname/role, or arbitrary custom detail; the gateway no longer pre-parses domain state as a browser DTO.
- Effective fork-boundary fallback is limited by IdentityValidationError.code to invalid-shape. Canonical wrong-domain and foreign-unissued turn identities rethrow into invalid_projection; an issued self boundary and a genuine raw other-thread boundary still project.

Red evidence against 1869aec0: the new thread-link owner received no sourcePresentation and the canonical wrong-domain/unissued boundary owner projected both invalid identities. Green evidence: 105 focused browser-model, projection, gateway, dynamic owner/correlation, transport, and runtime tests passed with 950 assertions in 0.70s. Root TypeScript passed in 1.84s and frontend TypeScript in 0.43s. Exact scoped Oxlint/Oxfmt, source-boundary probes, and git diff checks passed. No broad module, system, repository, browser, full-test, or check lane ran. Topology is unchanged; no known remediation residue remains. TASK-143.01.02 remains In Progress for parent rereview.

Twelfth review remediation:
- BrowserProjectionInput.timeline now accepts CodexTimelineProjectionInput, a readonly owner selection with branded SessionTurn id/status and the generated thread/timeline/list cursor. projectCodexBrowserState rebuilds the timeline, each turn, and all seven item presentation arms field by field. No live producer, history store, protocol mirror, or second adapter was added; TASK-143.01.10 retains producer ownership.
- projectSettings now rebuilds granular approvalPolicy from its five reviewed booleans and activePermissionProfile from id/extends. Loose normalized extension members remain accepted at the protocol boundary but cannot enter the strict browser DTO.
- The timeline and nested-settings owners live in projection-closure.test.ts after scoped Oxlint correctly rejected growing projection.test.ts past the 500-line limit. The original file is 420 lines, the new file is 244 lines, and the focused inventory owner proves the new module owner runs exactly once through test:modules. No lint rule or lane was changed.

Red evidence against c95ac1fe: both the non-null timeline with private extensions and valid loose nested settings records returned invalid_projection. Green evidence: 50 focused projection, browser-model, gateway, transport, and runtime tests passed with 293 assertions in 0.50s; the focused test-inventory owner passed 39/39 with 69 assertions. Root TypeScript passed in 1.87s and frontend TypeScript in 0.46s. Exact scoped Oxlint/Oxfmt, closure probes, and git diff checks passed. No broad module, system, repository, browser, full-test, or check lane ran. No known remediation residue remains; future live timeline production stays explicitly deferred to TASK-143.01.10. TASK-143.01.02 remains In Progress for parent rereview.

Thirteenth review remediation:
- CodexTimelineItemProjectionInput no longer imports or derives BrowserTimeline. Its seven-arm readonly owner union uses nested SessionThreadItem Pick selections for agent message, MCP/dynamic tool, command execution, file change, reasoning identity, and plan; ItemApprovalIdentity plus pending/settled/cancelled ApprovalState owns the approval arm. SessionTurn owns turn id/status and the generated thread/timeline/list response owns the cursor. Reasoning text and turn summary/output flags remain explicit presentation facts.
- projectCodexBrowserState alone maps the independent owner discriminators to all seven browser media arms. It maps approval pending/settled/cancelled exhaustively to pending/resolved/cancelled, selects turn presentation metadata and cursor, and omits every injected domain, item, approval, presentation, and top-level extension. No live producer, store, protocol mirror, or alternate adapter was added; TASK-143.01.10 retains producer ownership.
- unsafe_url had no source occurrence beyond CodexApprovalErrorCode, so the stale public arm was deleted without a replacement test or runtime change. No producer, consumer, or exact exhaustiveness owner existed.

Red evidence against 2801d884: the independent seven-arm domain-shaped owner returned invalid_projection while the settings closure owner remained green. Green evidence: the focused projection-closure owner passed 2/2 with 35 assertions in 0.10s. Root TypeScript passed in 1.75s and frontend TypeScript in 0.35s. Exact scoped Oxlint, Oxfmt, browser-timeline-input residue, unsafe_url residue, positive domain-derivation, and git diff checks passed. No broad module, system, repository, browser, full-test, or check lane ran. Topology is unchanged. No known remediation residue remains; future live timeline production stays deferred to TASK-143.01.10. TASK-143.01.02 remains In Progress for parent rereview.

Canonical integration replayed the exact fourteen reviewed commits onto 354706fa with one-to-one positional mapping. Conflict resolution retained coordinator configured and effective host facts while moving all browser shaping into the sole server projection; timeline UI/provider ownership remained intact. Focused production validation exposed two integration seams and both received narrow compatibility fixes: ordinary approval responses now use the original opaque transport request handle while owner views stay cloned and frozen, and coordinator disclosure consumes the closed sandbox and source-presentation browser fields without writable-root or vendor-source leakage. Final evidence: 180 focused module/UI tests across 30 exact files passed with 1,756 assertions; the exact application and production system owners passed 2/2 with 51 assertions; test-inventory policy passed 54/54 with 66 assertions; root and frontend TypeScript passed; Oxlint and Oxfmt passed on the exact 62 changed tracked TypeScript paths; boundary, diff, fourteen-commit count, and range-diff checks passed. No broad module, system, repository, browser, full-test, or check lane ran.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:39
---
Course correction, 2026-09-02: the generated-import-free contract is rejected because it contradicts repository boundaries and already drifted from Codex 0.151.0. Preserve maximal head b0938164 and ancestor 54643b59 only as behavior evidence; rebuild this leaf after TASK-143.08.05 and do not merge that chain.
---

author: @codex
created: 2026-09-03 18:24
---
Review remediation started from six verified findings against 23cc54fb..4b6a2965. The task stays In Progress.
---

author: @codex
created: 2026-09-03 18:38
---
Review remediation implemented and validated at the permitted focused boundaries. Preparing a separate commit and parent rereview callback; task remains In Progress.
---

author: @codex
created: 2026-09-03 18:43
---
Second review remediation started at 07ad656d. Approval owner state will replace the remaining codex-approvals browser DTO projector; task remains In Progress.
---

author: @codex
created: 2026-09-03 18:56
---
Second approval-authority remediation is green at the permitted focused boundaries. Preparing its separate commit and parent rereview callback; task remains In Progress.
---

author: @codex
created: 2026-09-03 19:02
---
Third review remediation started at eb487758. The task remains In Progress.
---

author: @codex
created: 2026-09-03 19:09
---
Third review remediation is implemented and focused validation is green. TASK-143.01.02 remains In Progress pending parent re-review.
---

author: @codex
created: 2026-09-03 19:17
---
Fourth review remediation started at d15914f2. TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 19:25
---
Fourth review remediation is green at every requested focused boundary. TASK-143.01.02 remains In Progress for parent rereview.
---

author: @codex
created: 2026-09-03 19:34
---
Fifth review remediation started at c2150567. TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 19:36
---
Fifth review remediation is green at every requested focused boundary. TASK-143.01.02 remains In Progress for parent rereview.
---

author: @codex
created: 2026-09-03 19:46
---
Sixth review remediation started at bfc379f0 for the three final Spec findings. TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 19:56
---
Sixth review remediation is green at every requested focused boundary. Preparing its separate commit and parent rereview callback; TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 20:02
---
Seventh review remediation started at 4b94dff6 for the ordinary capacity owner and network-policy projection. TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 20:04
---
Seventh review remediation is green at every requested focused boundary. Preparing its separate commit and parent rereview callback; TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 20:13
---
Eighth review remediation started at cd1826d5. The task remains In Progress.
---

author: @codex
created: 2026-09-03 20:21
---
Eighth review remediation is green at every requested focused boundary. Preparing its separate commit and parent rereview callback; TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 20:27
---
Ninth review remediation started at 302e170f. The exact three-family projection owner is red because a future identity field currently reaches strict-schema refusal. TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 20:30
---
Ninth review remediation is green at every requested focused boundary. Preparing its separate commit and parent rereview callback; TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 20:34
---
Tenth review remediation started at 595b48a7 for the reachable self-fork boundary case. TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 20:35
---
Tenth self-fork remediation is green at every requested focused boundary. Preparing its separate commit and parent rereview callback; TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 20:41
---
Eleventh review remediation started at 1869aec0 for closed thread-source presentation and authoritative turn-boundary refusal. TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 20:46
---
Eleventh remediation is green at every requested focused boundary. Preparing its separate commit and parent rereview callback; TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 20:55
---
Twelfth review remediation started at c95ac1fe for timeline and nested-settings closure. TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 20:59
---
Twelfth timeline/settings remediation is green at every requested focused boundary. Preparing its separate commit and parent rereview callback; TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 21:08
---
Thirteenth review remediation started at 2801d884. Replacing the browser-derived timeline input and deleting the unreachable unsafe_url error arm; TASK-143.01.02 remains In Progress.
---

author: @codex
created: 2026-09-03 21:10
---
Thirteenth timeline-owner and approval-error remediation is green at every requested focused boundary. Preparing its separate commit and parent rereview callback; TASK-143.01.02 remains In Progress.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Defined and integrated the closed browser-only Codex workbench contract with one domain-to-browser projection, exhaustive user-intent ownership, private-field exclusion, approval lifecycle handling, and independent timeline owner input. Preserved the existing coordinator and timeline UI contracts, fixed opaque reverse-request identity and closed-settings compatibility, and verified the result with 180 focused module/UI tests, two exact production-facing system owners, test-inventory policy, both TypeScript projects, scoped Oxlint/Oxfmt, and source-range audits.
<!-- SECTION:FINAL_SUMMARY:END -->
