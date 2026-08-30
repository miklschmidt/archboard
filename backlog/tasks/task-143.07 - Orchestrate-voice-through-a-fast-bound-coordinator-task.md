---
id: TASK-143.07
title: Orchestrate voice through a fast linked coordinator thread
status: To Do
assignee: []
created_date: '2026-08-30 14:13'
updated_date: '2026-08-30 15:44'
labels: []
dependencies:
  - TASK-143.01
  - TASK-143.05
  - TASK-143.06.01
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/codex-workbench-delivery-map.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 169000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integration milestone for byte-exact coordinator/voice tool catalogue, coordinator lifecycle/settings, queue policy, bound workhorse operations, semantic/operation callbacks, spoken approval gate, and dynamic-call dispatch delivered by TASK-143.07.01-.07.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One same-epoch capable coordinator starts with the persisted catalogue, validates Luna/medium/priority fallback, retains ordinary tools/approvals, and delegates sustained work while allowing quick investigation and one bounded board write.
- [ ] #2 Exactly four host-bound workhorse operations plus spoken resolver enforce queue/attached-busy/intervention policy without caller targets or a wait tool; catalogue and dispatcher remain separate.
- [ ] #3 Callbacks consume semantic and operation correlations, buffer non-reentrantly, dispatch inactive inject-items at most once with explicit uncertainty, and use only guarded active realtime append.
- [ ] #4 The spoken gate holds broker identity and later normal coordinator verdict; codex-approvals alone constructs responses, revalidates effects, and settles exactly once with visual fallbacks/race disclosure.
<!-- AC:END -->
