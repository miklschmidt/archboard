---
id: TASK-007
title: 'compare: structured semantic diff between two variants'
status: To Do
assignee: []
created_date: '2026-08-19 14:50'
updated_date: '2026-08-19 18:37'
labels:
  - needs-triage
dependencies:
  - TASK-003
ordinal: 7000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Structured output only; prose is the agent's job, never the tool's
- [ ] #2 Diff is keyed on node identity, not element ids or geometry
- [ ] #3 The data is sufficient to explain the difference without a second call: nodes and edges added, removed and changed, with what changed about each
- [ ] #4 Layout change is represented in a way that carries meaning, not raw coordinate deltas
- [ ] #5 What is unchanged is stated, so the agent can say what is stable
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 18:37
---
Emphasis corrected by the user. I had scoped this toward narratability and a 1000-token voice budget; that is wrong. The consumer is a full GPT-5.6-sol Codex thread that can narrate, and can ask clarifying questions back through GPT-Live — that round trip already works in the harness. So the tool's job is SUFFICIENCY: make sure the data needed to explain the difference between two boards is present. Do not pre-digest it into prose, and do not truncate for a budget the agent does not have.

User: 'we just need to make sure the data is there to explain what the difference is between the two boards.'

This unblocks their end-to-end voice testing — they cannot test the loop without it.
---
<!-- COMMENTS:END -->
