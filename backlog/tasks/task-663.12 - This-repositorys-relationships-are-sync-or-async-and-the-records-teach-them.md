---
id: TASK-663.12
title: This repository's relationships are sync or async, and the records teach them
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-22T14:12:00Z'
updated_date: '2026-11-22T15:00:00Z'
labels:
  - feature
dependencies: []
parent_task_id: TASK-663
ordinal: 1158000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The vault holds 1,027 call relationships, and the ADRs, glossary, design rules and skill still teach call (spec section 7).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No relationship in .archboard/vault has kind call
- [x] #2 Each relationship's sync or async kind agrees with its anchored call site, or its note says why
- [x] #3 ADR 0094 and 0095, CONTEXT.md, DESIGN.md and the archboard skill references describe sync, async, the decoration, the joining rule, hideEffects and the lenses
- [ ] #4 archboard check reports no new warning
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Amend ADR 0094 and 0095 in place (unshipped, same task family): sync and async replace call, effect decoration, joining rule, hideEffects, lenses and fallback, status line above the picture; extend Considered and rejected with the owner's reasons.
2. Update CONTEXT.md (Sync, Async, Effect decoration; Call retired), DESIGN.md line and legend rules, skills/archboard references authoring.md (classify sync/async from call timings, when to add a vault kind), upgrade.md (seeds, CALL_TIMING_MISMATCH), canonical-models.md (lenses, --hide-effect, examples).
3. Upgrade examples/canonical-model and site/model through archboard upgrade on an isolated server; upgrade examples/web-shop over its restored history and refresh history.import.json by a fresh public export (docs/agents/readme-assets.md#canonical-fixtures).
4. Upgrade this repository's vault: inventory seeds from code facts, read each blank in code and decide it, keep ids and effects, install, then archboard check and review CALL_TIMING_MISMATCH findings.
5. Run types, lint, format and the system tests that read the examples; check acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Records: ADR 0094 and 0095 amended in place (format 2 unshipped), CONTEXT.md gains Sync, Async and Effect decoration, DESIGN.md's line and legend rules follow the owner's decoration, the archboard skill teaches sync/async classification from call sites, CALL_TIMING_MISMATCH, the new lenses and --hide-effect.
Vault: archboard upgrade inventory seeded 543 sync and 223 async from code facts; 261 blanks were read in code by five parallel readers (decisions with file:line notes in artifacts/t663-12/decisions/*.tsv, filled inventory in artifacts/t663-12/vault-inventory) and installed: 733 sync, 294 async, ids and effects kept, no call left. A sample of 12 seeded entries agreed with their call sites. The config drops the rpc and event overrides (old colors; event shared spawn's fuchsia).
Examples: canonical-model (Dispatch async) and site/model (server awaits the renderer core, async) upgraded over copies and written as minimal edits; web-shop upgraded over its restored history with a fresh history.import.json export (clock async, reservations and sold-out filter sync, as its flows say). canonical-explanations.test.ts reads sync instead of call.
Blocker: archboard check code and check embeds fail reading history: RecordedModuleEditSchema reuses StructureChangeSchema, whose kind refine refuses call in recorded intents (packages/model/src/shared/canonical-contracts/schemas/model-operations.ts:123-128, 263-269). Owned by TASK-663.08.

Evidence: no relationship in .archboard/vault, examples or site/model has kind call (grep). archboard check semantics: 0 warnings, 0 errors. archboard check code over a history-free copy of this commit: 3 CALL_TIMING_MISMATCH, each read in code and kept async with a description saying why (import left to run; camera flight that calls back); its 4 warnings are module depth (MODULE_SHALLOW Scene, Repository queries, timing; EXPOSED_UNUSED CallTiming in code-intel from TASK-663.09), none about kinds. AC4 stays open: in place, archboard check, check code, check embeds and even model read fail with ARCHITECTURE_UNAVAILABLE because RecordedModuleEditSchema refuses call in recorded history (TASK-663.08's schema). Re-run archboard check after that fix; the README embeds of this vault will then also need a refresh after TASK-663.10.
<!-- SECTION:NOTES:END -->
