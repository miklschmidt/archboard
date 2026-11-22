---
id: TASK-663.04
title: >-
  The upgrade tool moves a vault to kinds and effects through a reviewed
  inventory
status: To Do
assignee: []
created_date: '2026-11-22T03:39:00Z'
labels: []
dependencies:
  - TASK-663.01
parent_task_id: TASK-663
ordinal: 1148000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The first step of the upgrade tool (owner decision 8 moves legacy migration there; none exists yet). For a vault in the old format it writes an inventory of every relationship, per root module, with its old kind, anchor and evidence, for agents to fill with a kind and an effect from the code; there is no default effect. Installing a filled, reviewed inventory writes the new format; a gap (an effect the agent could not establish) is listed, and a side effect that cannot be ruled out is a mutation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The upgrade writes an inventory of every relationship of an old-format vault, grouped by root module
- [ ] #2 Installing an inventory with a missing effect is refused, naming each relationship
- [ ] #3 Installing a complete inventory writes the new format and keeps every relationship id
- [ ] #4 The archboard skill says how an agent fills the inventory, with the classification rule
<!-- AC:END -->
