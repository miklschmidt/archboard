---
id: TASK-679
title: Teach consumer agents how to author a codebase model
status: Done
assignee: []
created_date: '2026-11-25T17:43:00Z'
updated_date: '2026-11-25T17:56:00Z'
labels: []
dependencies: []
ordinal: 1169000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Consumer agents still lack practical end-to-end guidance for authoring a codebase model from scratch (mapping after model init, picking root modules and boundaries, module kinds and external vs doors, groups, check-code evidence kinds and anchor rules, binding granularity effects, relationship directionality and anti-patterns, emphasis/traffic, and flow authoring), and core model Zod schemas carry no field descriptions for archboard model schema or /docs/reference/schemas/. site/src/content/docs/first-map.mdx also has arbitrary time estimates and lacks high-level modeling rules.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 skills/archboard/references/authoring.md preserves v0.6.0 kind/effect guidance (ADR 0094) and adds codebase mapping from scratch, module kinds/external/groups, check-code evidence kinds, binding granularity, and relationship directionality/anchors/emphasis/traffic
- [x] #2 skills/archboard/SKILL.md, references/schemas.md, and evals/rubric.md point accurately to authoring.md and concrete v0.6.0 source-evidence catalogue rows without duplicating prose
- [x] #3 Core model Zod schemas (module, relationship with effect, flow step, binding, anchor, document reference, vault-config) carry plain-English descriptions in archboard model schema and /docs/reference/schemas/
- [x] #4 site/src/content/docs/first-map.mdx removes the Time column and two-hour estimate, adds concise v0.6.0 modeling guidance, and builds cleanly with all site guards passing
- [x] #5 Skill link/citation/leakage tests, CLI schema tests, model tests, eval:skill check, lint, type-check, formatting, and archboard check pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Re-applied and verified all consumer authoring skill updates, Zod schema descriptions, record-format test prose-annotation fix, and first-map.mdx updates on docs/consumer-model-authoring branched from origin/main (v0.6.0).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added end-to-end codebase mapping, module kinds/external/groups, binding granularity, check-code evidence kinds, and relationship authoring rules to skills/archboard/references/authoring.md while preserving v0.6.0 ADR 0094 kind/effect guidance; aligned SKILL.md, schemas.md, and evals/rubric.md; added plain-English .meta({ description }) metadata across core model and code-binding Zod schemas (and updated record-format.test.ts to ignore JSON Schema description prose annotations without changing RECORD_FORMAT); removed the Time column and two-hour estimate from site/src/content/docs/first-map.mdx and added concise v0.6.0 modeling guidance.
<!-- SECTION:FINAL_SUMMARY:END -->
