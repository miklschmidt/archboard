---
id: TASK-367.02
title: Decide how boards carry evidence and how the code check reads it
status: To Do
assignee: []
created_date: '2026-09-29 01:15'
labels:
  - code-check
  - semantic-model
dependencies:
  - TASK-367.01
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: high
type: docs
ordinal: 610000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposal 1 of docs/design/design-checks.md needs decisions before code. The open ones are listed there: the names of the anchor and the binding symbol fields, how a vault's relationship kinds map to evidence kinds (a default by kind name, or a new configuration key under ADR 0024), where findings appear (a CLI command, a route, diagnostics with a subject), and the safety rules (files only, no state, no credentials, no evaluation). The engine choice (tree-sitter candidates resolved by language servers) waits for the spike. New dependencies need the user's approval, so this task asks for it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An ADR records the anchor, the binding symbol, the evidence kinds and their mapping to relationship kinds, the command surface, which variants the check reads, the engine, and the safety rules
- [ ] #2 `CONTEXT.md` defines the new terms the ADR picks, each with an _Avoid_ line
- [ ] #3 The user approved `web-tree-sitter` and the grammar packages, or chose others, and the ADR names them
- [ ] #4 The design note states each decision or points at the ADR
<!-- AC:END -->
