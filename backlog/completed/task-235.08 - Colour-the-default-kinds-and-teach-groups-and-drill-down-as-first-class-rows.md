---
id: TASK-235.08
title: Colour the default kinds and teach groups and drill-down as first-class rows
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 18:52'
updated_date: '2026-09-15 19:07'
labels: []
dependencies: []
references:
  - src/shared/semantic-policy/index.ts
  - skills/archboard/SKILL.md
  - skills/archboard/references/authoring.md
  - docs/adr/0025-containment-and-type-own-distinct-visual-channels.md
parent_task_id: TASK-235
ordinal: 403000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Across the batch groups were missed in 16 runs per arm and drillDown in 18 (baseline) and 14 (candidate); every capture is gray. Colour cannot come from groups (ADR 0025: containment and type own the visual channels; groups assign no colour) and only node kinds and relationship kinds carry a colour in config.yaml. DEFAULT_SEMANTIC_POLICY ships every kind without a colour, so every fresh vault and every evaluation vault is neutral unless an author edits config.yaml, which the skill forbids outside vocabulary requests and the config-untouched guardrail refuses. The fix that improves every board at once is coloured defaults. Groups and drill-down are taught in the authoring reference but the workflows never walk the author to them.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 DEFAULT_SEMANTIC_POLICY gives each node kind and each non-neutral relationship kind a palette colour; external and other stay neutral so an outside part reads as outside
- [x] #2 Existing policy, store, renderer and evaluation tests pass with the coloured defaults
- [x] #3 The create and edit workflows tell the author to check config.yaml groups for the concerns the parts belong to and to list the vault boards for a drill-down target before writing, and the catalogue rows for groups and drillDown say so
- [x] #4 The skill says colour is a property of a kind in config.yaml, never of a board or a group
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
DEFAULT_SEMANTIC_POLICY colours 13 node kinds and 6 relationship kinds; external, other, call and dependency stay neutral. bun test over semantic-policy, semantic-board-store, semantic-renderer, skill-evaluation and vault-diagnostics: 400 pass. create-architecture.md step 1 reads groups and lists boards before the payload; catalogue rows say so; authoring.md says colour is a kind property in config.yaml, never a board or group property. INSTALL.md notes the coloured defaults.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fresh vaults are no longer gray and the workflows walk authors to groups and drill-down; verified by the module tests and grep.
<!-- SECTION:FINAL_SUMMARY:END -->
