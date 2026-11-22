---
id: TASK-663.04
title: >-
  The upgrade tool moves a vault to kinds and effects through a reviewed
  inventory
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T03:39:00Z'
updated_date: '2026-11-22T05:03:00Z'
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
- [x] #1 The upgrade writes an inventory of every relationship of an old-format vault, grouped by root module
- [x] #2 Installing an inventory with a missing effect is refused, naming each relationship
- [x] #3 Installing a complete inventory writes the new format and keeps every relationship id
- [x] #4 The archboard skill says how an agent fills the inventory, with the classification rule
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence: packages/model/tests/runtime/upgrade/operations/install.test.ts (inventory grouped by root; refusal names Shop#Dispatch and Shop#Record and leaves files unchanged; complete install writes format 2, keeps ids, lists gaps, retries to the same receipt; a draft moves onto the upgraded state and reads in the current format). CLI run over a copy of examples/web-shop: 9 root files, 33 relationships, install refused with exit 2 while unfilled, installed when filled, idempotent on retry. Skill: skills/archboard/references/upgrade.md, routed from SKILL.md for UPGRADE_REQUIRED.
Design notes: the upgrade installs through the existing journal as an upgrade installation; its operation id is the inventories' digest; each draft is re-based on its upgraded predecessor (new baseline, predecessor revision, compact changes), so drafts are neither left in the old format nor behind. A draft that does not read refuses the inventory, naming it. The configuration drops dashes, the retired data kind and every entry that only restates an old default (name, color, arrowhead), so built-in inks and evidence apply.
Examples: judged classifications in artifacts/upgrade/*.decisions.tsv (ignored), filled inventories beside them. web-shop's history.import.json is a fresh export over its restored history (old checkpoints exact). tests/fixtures/old-format-vault replaces examples/canonical-model as the old vault of the checkpoints test.
Lanes: types, lint:all, format:check, test:modules (5340 pass), test:repository (173), test:system (227), test:solo (15) all pass; serial-browser not run (no browser or renderer change). check:model: UPGRADE_REQUIRED, 2 ANCHOR_SYMBOL_MISSING, 3 MODULE_SHALLOW, as expected.
Outside scope, not fixed: readme:assets code-evidence fails on the code check's depth answer (depth[0].names missing), from the module-depth layer. README clips (hero, history, ...) need re-recording and attaching after TASK-663.02 changes the drawing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built the first step of the upgrade tool: archboard upgrade inventory writes every relationship of an old-format vault (current state plus each one a draft adds or re-kinds) as one file per root module, and archboard upgrade install refuses an incomplete inventory, naming each relationship, or writes the current format in one durable installation that keeps every id, cleans the configuration and re-bases each draft. The archboard skill teaches filling the inventory with the effect rule. examples/canonical-model, examples/web-shop (with a fresh history fixture) and site/model are upgraded through the tool; the scripts that author relationships state effects, and the site render, pipeline example and README web-shop/sequence drawings work again. All required lanes pass.
<!-- SECTION:FINAL_SUMMARY:END -->
