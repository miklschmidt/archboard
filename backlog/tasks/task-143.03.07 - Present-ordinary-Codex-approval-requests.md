---
id: TASK-143.03.07
title: Present ordinary Codex approval requests
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 16:58'
labels: []
dependencies:
  - TASK-143.05.02
  - TASK-143.03.01
  - TASK-144.19
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-approvals
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 204000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Render and resolve every ordinary app-server human-interaction request from the approval broker. Spoken eligibility is only an annotation for genuine binary approvals; this module remains the complete visual fallback. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Cards cover command execution, file change, permissions, legacy exec/apply, multi-question requestUserInput, MCP elicitation, openai/form, and URL elicitation with their real discriminated identities and no fabricated turn.
- [ ] #2 Forms support multiple questions, required/optional validation, secret values without echo/persistence, reviewed permission profile/scope, supported openai field types, safe URL schemes, cancel/decline, and explicit unsupported-schema/unsafe-URL refusal.
- [ ] #3 Only genuine accept/decline approvals may be spoken-eligible; multi-field input, secrets, URLs, permissions with scope, unsupported forms, and any request blocking the coordinator remain visual-only.
- [ ] #4 Pending, app-global off-focus visibility, stale ownership, expiry, broker cancellation, delivered, not_delivered, outcome_unknown, and authoritative reconciliation each retain the original immutable target and return focus accessibly.
<!-- AC:END -->
