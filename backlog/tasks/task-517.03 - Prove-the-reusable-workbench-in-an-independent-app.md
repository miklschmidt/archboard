---
id: TASK-517.03
title: Prove the reusable workbench in an independent app
status: To Do
assignee:
  - '@codex'
created_date: '2026-10-24 11:38'
updated_date: '2026-10-24 11:40'
labels: []
dependencies:
  - TASK-517.02
parent_task_id: TASK-517
priority: high
type: task
ordinal: 928000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A minimal second consumer demonstrates that the extraction works without Archboard concepts. It also gives future consumers a runnable example of the supported interface.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The app starts from public interfaces without an Archboard server, board, or vault.
- [ ] #2 Fast controlled tests exercise conversation, live voice negotiation, workhorse completion, approval handling, session isolation, and distinct stop actions.
- [ ] #3 Usage documentation names the host inputs and startup requirements, and the complete normal gate passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
This delivery contributes the independent consumer to Archboard@TASK-517 and the shared interfaces on the other parent proposals.
1. Add a minimal apps/workbench-example host with its own storage, instructions, context, tools, and admitted checkout.
2. Connect a small browser consumer to the public browser entry. Keep process entry files thin.
3. Exercise the production factory and shared media interface with controlled protocol fixtures and a checkout without a vault.
4. Cover conversation, voice negotiation, long work completion, approval handling, isolation, and distinct stop actions at their cheapest credible owners.
5. Document startup prerequisites and host responsibilities. Keep generated output ignored.
6. Run the complete normal gate and record any required live microphone acceptance as a limitation of automated evidence.
7. Simplify the result and commit with Refs: TASK-517.03.
The parent owns parallel review, board adoption, and final acceptance evidence.
<!-- SECTION:PLAN:END -->
