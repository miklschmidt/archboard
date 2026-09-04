---
id: TASK-143.03.07
title: Present Codex approval requests
status: In Progress
assignee:
  - '@claude-opus'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-04 02:55'
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
