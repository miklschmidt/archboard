---
id: TASK-143.01.02
title: Define the browser-only Codex workbench model
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:06'
updated_date: '2026-09-03 18:38'
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
  - src/server/canvas/lib/codex-workbench-production.ts
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
- [ ] #1 The browser-only model covers the reachable readiness, account, thread-link, timeline, queue, settings, approval, text-command, semantic-delivery, coordinator, voice, command-lease, and delivery-outcome states needed by the workbench; every Codex-origin value is imported from the recovered normalized module rather than copied into a browser DTO.
- [ ] #2 One projection adapter maps recovered protocol and domain outputs into browser-only states, handles every reachable producer outcome, excludes secrets and vendor-private paths, and contains no app-server ingress parser or reverse-request router.
- [ ] #3 The browser action and result union describes only user intents issued by the workbench and maps each intent to one existing host owner; it consumes recovered generated request or result types where they apply and refuses unsupported actions explicitly.
- [ ] #4 Focused tests cover browser projection, secret exclusion, domain-only state, and public action results. They do not repeat generated-type conformance, app-server ingress validation, BrowserUseOriginPolicy, i64 normalization, tool resolution, formatter, linter, alias, fixture-cleanup, or prose checks.
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
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rebuilt the browser-facing contract against the recovered Codex 0.151.0 generated and normalized exports. The package now has one closed projection adapter, generated request/result-derived owner views, a complete 19-intent owner table, and explicit unsupported-action refusal. Projection selects only browser fields, rejects secret-bearing inputs, strips account email and thread-private settings, deep-freezes snapshots, and preserves domain-only identity authority.

Ordinary approval cards now retain authoritative lifecycle, decision and delivery outcome, current binding, spoken eligibility, exact requested permission profiles, and full elicitation constraints. The broker projects pending and terminal states from its single settlement record. The obsolete generated-conformance contract test and browser tool-result mirror were removed; focused projection, action, approval, and gateway owners remain.

Focused red/green evidence: the affected gateway lane initially rejected its legacy approval fixture as invalid_projection; after adding lifecycle, binding, and spoken authority, the exact test passed 1/1 and the affected test set passed 86/86 with 608 expectations in 1.17s. Scoped TypeScript passed in 0.77s, Oxlint in 0.17s, Oxfmt in 0.09s, boundary grep and git diff checks passed. No broad check, browser, repository, system, or full-suite command was run.

Review remediation replaces the raw permission profile with a generated-derived, path-free network/file-access summary; maps generated account types through an exhaustive record; and strips sandbox writable roots at the sole projectCodexBrowserState seam. Canvas now supplies normalized owner views, while the gateway owns one exhaustive dispatch table and explicit unsupported-command refusal. Terminal ordinary approvals survive in the command-result snapshot, then leave broker state through explicit acknowledgement; the next snapshot omits them. The redundant browser action-owner module and shallow mapping test were removed and replaced by projection, dispatch, and lifecycle checks.

Remediation red/green: the focused lane first exposed two stale expectations (permission access and voice readiness), then passed 86/86 with 582 expectations in 1.12s. Root TypeScript passed in 1.78s; frontend TypeScript in 0.46s; scoped Oxlint in 0.18s; scoped Oxfmt in 0.08s; boundary grep and git diff checks passed. The system fixture was adapted only so root TypeScript covers the public port; no system, repository, browser, broad check, or full-suite lane was run. TASK-143.01.02 remains In Progress for independent rereview.
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
<!-- COMMENTS:END -->
