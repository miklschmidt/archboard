---
id: TASK-663.04
title: >-
  The upgrade tool moves a vault to kinds and effects through a reviewed
  inventory
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-22T03:39:00Z'
updated_date: '2026-11-22T04:33:00Z'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Store: readUpgradeInventory(vault) lists every relationship of an old-format vault (current, plus each relationship a draft adds or re-kinds), grouped by the root module of its source, with old kind, ends, bindings, anchor, label; kind prefilled from the old kind except the retired data, effect and gap empty. A draft that does not read refuses the inventory, naming it.
2. Store: upgradeArchitectureModel(vault, request) refuses an inventory that is stale, incomplete, or names a missing effect, an unknown kind or a gap without mutation, listing each relationship. A complete one writes format 2 modules, a configuration without dash or the retired data kind and without entries that restate an old built-in, and re-bases each draft on its upgraded predecessor (new baseline checkpoint, predecessor revision, compact changes). It installs through the existing journal as an upgrade installation; ids stay; the answer lists the gaps.
3. CLI: archboard upgrade inventory --out <dir> writes one file per root; archboard upgrade install --inventory <dir> merges them and sends one request. Server routes for both.
4. Skill: one paragraph on filling the inventory with the classification rule.
5. Upgrade examples/canonical-model, examples/web-shop (through its history fixture, procedure in docs/agents/readme-assets.md) and site/model with judged inventories kept in artifacts/; update scripts that author relationships (readme-assets, build-pipeline-example, move-source, site render) to state effects.
6. Gates: types, lint:all, format, test lanes.
<!-- SECTION:PLAN:END -->
