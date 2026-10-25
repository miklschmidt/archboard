---
id: TASK-532.02
title: History readings name their board and own which variants they read
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-25T02:40:00Z'
labels: []
dependencies: []
references:
  - docs/adr/0045-git-history-is-read-through-bindings-on-request.md
  - docs/adr/0055-packages-own-behavior-and-apps-compose-it.md
parent_task_id: TASK-532
ordinal: 953000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
readFootprint and the locality reading take already-resolved board and variant objects, so the server holds ADR 0045's rule on which variants the history lens reads: apps/server/src/server/rules/footprint/footprint-variants.ts (159 lines) and readableVariant in locality-route.ts. The refusal codes are string literals in the server and again in the CLI. The code check already takes names and resolves boards inside code-intel, so the two readings are the odd ones out.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 readFootprint and locality.read take the vault, board name and variant names, and return a reading or a typed refusal
- [ ] #2 footprint-variants.ts and readableVariant are gone from the server; the rules live privately in code-intel and the refusal codes come from its shared history entry
- [ ] #3 Lifecycle, default-comparison and unresolved-head cases are tested through the code-intel operations; route tests keep status mapping and cancellation
<!-- AC:END -->
