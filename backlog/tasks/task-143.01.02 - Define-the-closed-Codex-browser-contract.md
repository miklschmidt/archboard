---
id: TASK-143.01.02
title: Define the browser-only Codex workbench model
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:06'
updated_date: '2026-09-03 18:18'
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
  - src/server/codex-workbench/lib/projection.ts
  - src/server/codex-workbench/tests/support.ts
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
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rebuilt the browser-facing contract against the recovered Codex 0.151.0 generated and normalized exports. The package now has one closed projection adapter, generated request/result-derived owner views, a complete 19-intent owner table, and explicit unsupported-action refusal. Projection selects only browser fields, rejects secret-bearing inputs, strips account email and thread-private settings, deep-freezes snapshots, and preserves domain-only identity authority.

Ordinary approval cards now retain authoritative lifecycle, decision and delivery outcome, current binding, spoken eligibility, exact requested permission profiles, and full elicitation constraints. The broker projects pending and terminal states from its single settlement record. The obsolete generated-conformance contract test and browser tool-result mirror were removed; focused projection, action, approval, and gateway owners remain.

Focused red/green evidence: the affected gateway lane initially rejected its legacy approval fixture as invalid_projection; after adding lifecycle, binding, and spoken authority, the exact test passed 1/1 and the affected test set passed 86/86 with 608 expectations in 1.17s. Scoped TypeScript passed in 0.77s, Oxlint in 0.17s, Oxfmt in 0.09s, boundary grep and git diff checks passed. No broad check, browser, repository, system, or full-suite command was run.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:39
---
Course correction, 2026-09-02: the generated-import-free contract is rejected because it contradicts repository boundaries and already drifted from Codex 0.151.0. Preserve maximal head b0938164 and ancestor 54643b59 only as behavior evidence; rebuild this leaf after TASK-143.08.05 and do not merge that chain.
---
<!-- COMMENTS:END -->
