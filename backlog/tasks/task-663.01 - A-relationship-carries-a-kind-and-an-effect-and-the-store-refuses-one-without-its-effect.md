---
id: TASK-663.01
title: >-
  A relationship carries a kind and an effect, and the store refuses one without
  its effect
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T03:39:00Z'
updated_date: '2026-11-22T04:21:00Z'
labels: []
dependencies: []
parent_task_id: TASK-663
ordinal: 1145000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The vocabulary and the store side of TASK-663. Kinds (how it travels): call (in-process), http, rpc, event, queue, stream, spawn, render, storage (direct store access, replacing data), dependency, other (labelled). Effect (what it does): mutation, query, compute; only dependency may omit it, and an omitted effect means a declared requirement only. Built-in kinds sit under a vault's own, and a vault's own kind must name its color. Lines' dash leaves the kind policy (it follows the effect). Lenses are configured in the vault: a defaultLens and lenses with one show or hide list of selectors naming a kind, an effect, or both. Module files move to a new format; a live vault in the old format opens read-only with one diagnostic naming the upgrade; retained history stays exact.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A relationship without an effect is refused on write, except a dependency, with an error naming the relationship and the field
- [x] #2 The built-in kinds are the eleven listed, data is gone, and a vault kind without a color is refused at its configuration path
- [x] #3 A live vault in the old format opens read-only with one diagnostic naming the upgrade, and every write to it is refused
- [x] #4 Retained checkpoints read exactly as stored, with their own policy
- [x] #5 Lens configuration (defaultLens, lenses with show or hide selectors) validates, and a selector naming an unknown kind or effect is reported at its path
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Vocabulary: an effect enum (mutation, query, compute); the eleven built-in kinds (data becomes storage) as defaults a vault's own entries sit over by id; a kind the vault adds must name its color; dash leaves the authored kind policy (the resolved look keeps it only for the old format).
2. Lenses in the vault policy: defaultLens and lenses with one show or hide list of selectors (kind, effect or both); built-in lenses as data; validated against the effective kinds, each refusal at its path; all is reserved.
3. Formats: module files move to schemaVersion 2, whose relationships state an effect unless the kind is dependency; schemaVersion 1 and the old config decode exactly as before (legacy decoder).
4. Store: decodeModel reads either format; a live old-format vault reads with one UPGRADE_REQUIRED diagnostic (readOnly) and every edit intent is refused with it; retained checkpoints decode with their own policy and modules; writers write schemaVersion 2; init writes only what a vault owns.
5. Comparison counts an effect as changed only when both sides state one.
6. Fixtures: tests that write get new-format fixtures; examples and this repository's vault stay old; exact historical fixtures stay exact.
7. Gates: types, lint:all, format, test:modules, test:repository, test:system, test:solo.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Effect lives on the relationship (SemanticEdgeSchema), optional in memory; module format 2 (ModuleDocumentSchema) requires it on every kind but dependency, so the candidate decode refuses a write at file, outgoing.N.effect and the relationship id. Format 1 and the old config decode exactly (dash kept as the recorded look). decodeModel sets readOnly (UPGRADE_REQUIRED) on old inputs; initialCandidate refuses every edit intent with it; retained readings drop it. Claims, retention (model retain) and import of an old bundle stay allowed: they write no live module. Legacy board migration still installs format 1, so a migrated vault is read-only until the upgrade (TASK-663.04). Built-in lenses are policy data here; drawing them is TASK-663.03. all may be renamed but not narrowed, so a resolved policy reads back as configuration. The core still takes a dash per kind: a kind without one draws solid until TASK-663.02 draws by effect; recipe fingerprints leave lenses out, so tracked embeds stay current. Policy fields keep their old order and the predecessor digest reads the configuration form, so retained history from before lenses still matches (examples/web-shop history import). Tests that write use tests/fixtures/current-format-vault, a format-2 copy of examples/canonical-model; examples and .archboard/vault stay format 1. check:model on this repository: one UPGRADE_REQUIRED warning, and two ANCHOR_SYMBOL_MISSING on anchors citing VaultConfigurationSchema in model-read.ts and inputs.ts (now parseVaultPolicy); the vault cannot be edited until it is upgraded (TASK-663.07). The three MODULE_SHALLOW warnings it also prints come from the stack below.

Verification: types, lint:all, format:check, test:modules (5337 pass), test:repository (173), test:system (227), test:solo (15) and test:serial-browser (50 of 50 owners) all pass. site render: the four architecture drawings it writes are byte-identical; it then stops at the step that edits its copy of examples/web-shop, which is old format and refused until TASK-663.04 upgrades the example. scripts/readme-assets, build-pipeline-example and move-source also edit vaults and will be refused on old-format examples the same way.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A relationship now carries an effect (mutation, query, compute). Module files move to format 2, which requires an effect on every kind but dependency; a write without one is refused at the module file, outgoing.N.effect and the relationship id. The eleven built-in kinds (call, http, rpc, event, queue, stream, spawn, render, storage, dependency, other; data is gone) sit under a vault's own, a kind the vault adds must name its color, and dash leaves the authored kind policy. Lenses are configured in the vault policy (defaultLens, lenses with one show or hide list of kind/effect selectors, the six built-ins as data) and validated at their paths. A live vault in the old format (format-1 modules or an old config) reads with one UPGRADE_REQUIRED diagnostic, the vault check warns once, and every edit intent is refused. Retained checkpoints read exactly with their own policy; policy field order and the predecessor digest stay as before, so history from before this change still matches. Tests that write use tests/fixtures/current-format-vault; examples and this repository's vault stay old format, so check:model now reports the upgrade warning and two stale anchors until TASK-663.04 and .07. Evidence: structure.test.ts (AC1), configuration.test.ts (AC2, AC5), checkpoints.test.ts and configuration-routes.test.ts (AC3, AC4), model-inspect system test over the exact web-shop history (AC4). All required lanes and the browser lane pass.
<!-- SECTION:FINAL_SUMMARY:END -->
