---
id: TASK-143.03.07
title: Present Codex approval requests
status: In Progress
assignee:
  - '@claude-opus'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-04 09:34'
labels: []
dependencies:
  - TASK-143.05.02
  - TASK-143.03.01
  - TASK-144.19
  - TASK-143.01.21
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-approvals
  - src/ui/workbench-approvals/tests/approval-surface.test.tsx
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 204000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Render and resolve the seven ordinary app-server human-interaction request families and the distinct dynamic create, fork, and send coordination approvals from the closed browser contract. Ordinary broker responses and dynamic dispatcher decisions keep their real identities and lifecycles. Spoken eligibility annotates genuine ordinary binary approvals only; dynamic coordination approval remains fresh and visual. This module is the complete approval workbench and owns no host mutation or protocol response. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Cards cover command execution, file change, permissions, legacy exec and apply, multi-question requestUserInput, MCP elicitation, openai form and URL elicitation, plus create_thread, fork_thread, and send_message_to_thread dynamic effects. Each uses its real discriminated identity; dynamic cards disclose the exact target, prompt, effective fork boundary, OperationId, and expiry without fabricating ApprovalId or turn identity.
- [ ] #2 Ordinary forms support every reviewed field, secret, permission, and safe-URL rule. Dynamic cards permit one approve or decline decision only, retain the immutable effect hash, and never offer a session grant, target edit, hidden boundary, or approval_required resume action.
- [ ] #3 Only genuine ordinary accept or decline approvals may be spoken-eligible. Multi-field input, secrets, URLs, scoped permissions, unsupported forms, coordinator-blocking requests, and every dynamic coordination approval remain visual-only.
- [ ] #4 Pending, app-global off-focus visibility, stale ownership or effect, expiry, cancellation, browser or child disconnect, approved, declined, delivered, not_delivered, outcome_unknown, terminal approval_required, and authoritative reconciliation retain the original immutable target, remove dead authority, and return focus accessibly.
- [ ] #5 src/ui/workbench-approvals/tests/approval-surface.test.tsx exhausts all seven ordinary families and all three dynamic effects, field validation, secret non-echo, safe and unsafe URLs, spoken eligibility, exact effect disclosure, app-global focus, stale, expired, cancelled, and disconnected decisions, terminal no-resume behavior, and delivered, not_delivered, or outcome_unknown reconciliation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the closed browser contract (BrowserApprovalSchema seven families, BrowserDynamicApprovalSchema three effects), the transport captured-target command API, the broker binding/spoken envelope, ADR 0019, DESIGN.md, and the UI aesthetics contract; confirm the module owns projection plus rendering only and never constructs a host mutation, lease, or transport owner.
2. Define src/ui/workbench-approvals/contract.ts: one discriminated card union keyed by the real approvalKind and dynamic tool, a lifecycle/authority status, broker-identity disclosure rows, a unified reviewed-field descriptor covering user_input questions, MCP/openai elicitation fields, command amendments and permission scope, offer descriptors, spoken annotation, and an app-global beacon.
3. Implement the pure lib: fields.ts (descriptors), form.ts (reducer, defaults that never project a secret, validation for required/type/bounds/items/enum/format and safe http(s) URLs), offers.ts (per-family offers from availableDecisions, dynamic approve/decline only, defensive spoken gate that demands a pending genuine binary approval), response.ts (exact CodexServerResponseByMethod payload per family), dynamic.ts (exact target, prompt, effective fork boundary, both OperationIds, immutable effect hash, expiry, terminal no-resume), status.ts (every AC #4 lifecycle plus transport disconnect/stale reconciliation, dead-authority removal), focus.ts (focus-return decision), projection.ts.
4. Implement rendering: WorkbenchApprovals surface with an always-present app-global beacon live region and a focus anchor, OrdinaryApprovalCard, DynamicApprovalCard, ApprovalFormFields; semantic theme tokens only, static Tailwind classes through cn, exhaustive typed class maps, Base UI Button through src/ui/button, secrets rendered as non-echo password controls with no value in markup.
5. Dispatch through the transport captured-target API: capture the target when the pending card is offered, refuse a stale capture, and send approvalRespond / dynamicApprovalRespond drafts only; classify delivered, not_delivered and outcome_unknown from the command result and transport error.
6. Tests under src/ui/workbench-approvals/tests: approval-surface.test.tsx renders all seven ordinary families and all three dynamic effects with secret non-echo, safe and unsafe URLs, spoken eligibility, exact dynamic effect disclosure, app-global visibility and focus return; approval-forms, approval-lifecycle and approval-dispatch own field validation, every AC #4 state, terminal no-resume and delivered/not_delivered/outcome_unknown reconciliation. Shared fixtures live in the same test owner. No package.json, shell, or browser-inventory edit.
7. Verify: bun run type-check, lint, fmt:check, build:frontend, focused module tests, test:repository, test:modules; record counts and any unrelated failures in the notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented src/ui/workbench-approvals as the complete approval workbench: contract.ts (public card, status, field, offer, beacon and submission types), lib/vocabulary.ts, lib/status.ts (one lifecycle vocabulary for both kinds plus dead-authority removal), lib/fields.ts, lib/form.ts, lib/offers.ts, lib/response.ts, lib/disclosure.ts, lib/projection.ts, lib/focus.ts, lib/submit.ts, and the rendered WorkbenchApprovals, ApprovalCard and ApprovalFieldControl. The module receives a transport, instantiates no owner, claims no lease, and writes no protocol response: it hands the transport one typed approvalRespond or dynamicApprovalRespond draft together with the target captured while the offers were on screen, so a navigated workbench is refused (approval_not_pending, dynamic_approval_not_pending, link_changed, link_required) rather than retargeted.

Decisions taken and why:
- Command execution and file change offers are built one-to-one from the host's availableDecisions, including the proposed exec-policy and network-policy amendment arms. The browser never composes an amendment of its own, so there is no amendment form and no way to widen a decision the host did not offer.
- Spoken eligibility is annotated only when the host says eligible AND the request is a command execution whose offered set is exactly accept plus decline AND it is still pending. That mirrors the broker's own gate (src/runtime/codex-approvals/lib/response.ts), so a host annotation the browser cannot confirm degrades to visual-only instead of being trusted. Dynamic coordination approvals carry no spoken field and are always visual-only.
- Permissions: the browser contract publishes requestedScope.network and the requested fileAccess modes but no paths, while GrantedPermissionProfile.fileSystem is a path list. Rather than invent one, the card grants network access, grant scope (turn or session) and strictAutoReview, discloses the requested file-access modes, and states plainly that Archboard will not invent a path list. Declining sends the broker's own empty grant shape ({}, scope turn).
- Legacy applyPatchApproval and execCommandApproval have no availableDecisions, so the card offers approved, denied with an optional person-written rejection (defaulting to a fixed sentence), and abort. No approved_for_session is ever offered unasked.
- App-global visibility is an always-present assertive live region ('data-approvals-scope=app-global') that carries every card's title, phase and immutable target, so a pending request and every terminal outcome are readable when the workbench region does not have focus.
- Focus return is a pure decision (approvalDecisionSignature plus approvalFocusReturn) applied by one effect that only calls focus() on the tabindex=-1 surface heading; the projection rebuilds its cards each snapshot, so a signature rather than array identity is what the surface compares.
- A pending request whose expiry has passed on the clock renders as expired with its authority removed and says the host has not published a terminal record yet, matching the transport's own expiresAtMs > now() refusal.

Two lint-configuration changes were needed and are the minimum to satisfy AC #5's named .tsx owner: tools/oxlint-plugin-archboard.js isTypedTestSource now accepts a .tsx file under src/ui (tsconfig.frontend.json is the gate that reads src/ui/**/*.tsx, so the rule's stated intent still holds; .js and .jsx and .tsx elsewhere stay refused, and tests/system/repository-policy/boundaries.test.ts still passes), and the .oxlintrc.jsonc 500-line test cap now also matches src/*/*/tests/**/*.tsx. No package.json dependency, src/ui/shell, tsconfig, or browser-inventory edit was made. React Testing Library and happy-dom are not present in this repository and adding them would be a serialized root dependency edit, so the rendered assertions use renderToStaticMarkup the way src/ui/workbench-coordinator, workbench-board-status and workbench-timeline tests already do, with interaction proved through the same exported pure decision, form and submit functions the components call.

Verification from the worktree: bun run type-check passed; bun run lint passed; bun run fmt:check passed (1075 files); bun run build:frontend passed; bun test --isolate over workbench-approvals, workbench-transport, workbench-runtime and codex-browser-model passed 144 tests, 992 expect() calls, 16 files; the module's own four files are 93 tests with 370 expect() calls; bun run test:repository passed 122 tests, 1060 expect() calls, 18 files; bun run test:modules passed 2059 tests, 18994 expect() calls, 224 files. No unrelated failures.
<!-- SECTION:NOTES:END -->
