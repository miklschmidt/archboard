---
id: TASK-663.06
title: The records and the skill teach kinds, effects and lenses
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T03:39:00Z'
updated_date: '2026-11-22T04:34:00Z'
labels: []
dependencies: []
parent_task_id: TASK-663
ordinal: 1150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two ADRs (the vocabulary with effect; the reading contract with lenses), Effect beside Relationship kind and Lens under Reading in CONTEXT.md, the classification rule taught once in the archboard skill's Map the code, and amendments to ADRs 0024, 0025, 0046, 0057, 0065, 0066 and 0070. The classification rule, in order: can the operation have a side effect (including a conditional write, a publication, an acknowledgement that removes work, installing a subscription; follow delegated work)? mutation. Otherwise does it read held or fetched state? query. Otherwise compute. Doubt about a side effect is a mutation. A relationship covering several operations takes the strongest. Every kind is judged by its operation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Two ADRs record the vocabulary and the reading contract, and the amended ADRs link them
- [x] #2 CONTEXT.md defines Effect and Lens, and Relationship kind names how it travels
- [x] #3 The archboard skill teaches the built-in kinds, the effect rule and repository-specific kinds once
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ADR 0094 (vocabulary with effect) and ADR 0095 (reading contract with lenses); numbers above every other branch's ADRs (deepen/module-depth holds up to 0093). Describe what TASK-663.01 built as the code at 24193b76fc; for the drawing (663.02), lenses (663.03), the upgrade tool (663.04) and the dependency check (663.05) write what settled-effect.md decides and name each section that task may adjust.
2. Amend ADRs 0024, 0025, 0046, 0057 and 0070; add references to 0065 and 0066.
3. CONTEXT.md: Relationship kind names how it travels; Effect beside it; Lens under Reading; Relationship, Vault vocabulary, Vault policy, Line, Shared trunk, Legend, Reading, Filter, Render recipe follow; Upgrade beside Migration.
4. archboard skill: the kinds, the effect rule and repository-specific kinds taught once in authoring.md Map the code; canonical-models (add-relationship example states its effect, --lens, lens note), schemas (vault-config), design-lens (a lens changes no count), SKILL.md (relationship row, UPGRADE_REQUIRED). The upgrade paragraph stays for 663.04.
5. Gates: format, lint:all, types, test:modules, test:repository, test:system, test:solo.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ADR numbers 0094 and 0095 sit above every other branch's ADRs (deepen/module-depth holds up to 0093), so no merge collides. What TASK-663.01 built is described from the code at 24193b76fc (module format 2, UPGRADE_REQUIRED, the eleven kinds, the colored vault kind, lens configuration and the six built-in lenses, comparison of effects). The sections that parallel tasks build name the task that may adjust them: ADR 0094 'The upgrade' (663.04), 'The drawing' (663.02), 'The code check on dependencies' (663.05); ADR 0095 'What a lens draws' (663.03); the amendments to 0025 (663.02) and 0046 (663.05). In the skill, these lines describe settled but unbuilt behavior: canonical-models.md render section (--lens, the left-out note, refused on a flow grammar) and the lens control bullet (663.03); authoring.md 'check code reports a dependency whose evidence is a call' (663.05); the arrowhead field in the vault-kind example stays while the code requires it (663.02 may drop it). CONTEXT.md Shared trunk ('one kind and one effect'), Line and Legend follow the settled drawing (663.02). The upgrade's how-to paragraph is left to 663.04; SKILL.md only says what UPGRADE_REQUIRED means. Not touched, outside scope: docs/design/reader-redesign.md rule 3 (a mixed line wears a neutral style; the strongest-effect rule belongs there, 663.02), DESIGN.md, PRODUCT.md, and the site's schemas page blurb for vault-config (lenses missing).
Verification: the vault-kind YAML example parses through createVaultConfigurationSchema, and a kind without a color is refused at relationshipKinds.workflow.color. format:check, lint:all, types, test:modules (5336 pass), test:repository (173), test:system (227), test:solo (15) pass. check:model: UPGRADE_REQUIRED, two ANCHOR_SYMBOL_MISSING, three MODULE_SHALLOW, as expected.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Two ADRs record the decision: 0094 says a relationship states how it travels (kind) and what it does (effect), and 0095 says a picture is read through a lens. ADRs 0024, 0025, 0046, 0057, 0065, 0066 and 0070 link to them. CONTEXT.md adds Effect beside Relationship kind (which now names how it travels), Lens under Reading and Upgrade beside Migration, and updates Relationship, Vault vocabulary, Vault policy, Line, Shared trunk, Legend, Reading, Filter and Render recipe. The archboard skill teaches the built-in kinds, the ordered effect rule with examples, and a vault's own kinds once, in authoring.md 'Choose the kind and the effect'. canonical-models, schemas, design-lens and SKILL.md follow (an example relationship states its effect, render takes a lens). The sections that 663.02 to .05 build name the task that may adjust them. All required lanes pass.
<!-- SECTION:FINAL_SUMMARY:END -->
