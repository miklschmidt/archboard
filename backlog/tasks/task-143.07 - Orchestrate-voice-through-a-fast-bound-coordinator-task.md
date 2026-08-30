---
id: TASK-143.07
title: Orchestrate voice through a fast linked coordinator thread
status: To Do
assignee: []
created_date: '2026-08-30 14:13'
updated_date: '2026-08-30 16:29'
labels: []
dependencies: []
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
Integration milestone for byte-exact coordinator/voice catalogues, capable Luna/medium coordinator lifecycle/settings, sole queue port, four bound workhorse operations, correlated callbacks, one-slot later-turn spoken approval gate, and dynamic-call dispatcher. Ordering is expressed by leaves.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One current-epoch capable gpt-5.6-luna medium coordinator starts with reviewed bytes/catalogues, normal Codex tools/approvals, fully proven settings, and priority only when advertised.
- [ ] #2 Exactly four host-bound workhorse operations plus spoken resolver enforce created/attached/busy/queue/steer policy without caller targets, synchronous wait, or duplicate turn on uncertainty.
- [ ] #3 Callbacks use one closed correlated union and select one guarded active append or eligible inactive injection after dequeue; semantic callbacks stay silent while voice is inactive.
- [ ] #4 The spoken gate schedules a later ordinary coordinator turn and codex-approvals alone settles the validated request exactly once, with visual fallback for every race/uncertain state.
<!-- AC:END -->
