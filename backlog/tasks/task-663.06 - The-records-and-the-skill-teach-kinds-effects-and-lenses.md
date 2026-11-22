---
id: TASK-663.06
title: The records and the skill teach kinds, effects and lenses
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-22T03:39:00Z'
updated_date: '2026-11-22T04:26:00Z'
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
- [ ] #1 Two ADRs record the vocabulary and the reading contract, and the amended ADRs link them
- [ ] #2 CONTEXT.md defines Effect and Lens, and Relationship kind names how it travels
- [ ] #3 The archboard skill teaches the built-in kinds, the effect rule and repository-specific kinds once
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ADR 0094 (vocabulary with effect) and ADR 0095 (reading contract with lenses); numbers above every other branch's ADRs (deepen/module-depth holds up to 0093). Describe what TASK-663.01 built as the code at 24193b76fc; for the drawing (663.02), lenses (663.03), the upgrade tool (663.04) and the dependency check (663.05) write what settled-effect.md decides and name each section that task may adjust.
2. Amend ADRs 0024, 0025, 0046, 0057 and 0070; add references to 0065 and 0066.
3. CONTEXT.md: Relationship kind names how it travels; Effect beside it; Lens under Reading; Relationship, Vault vocabulary, Vault policy, Line, Shared trunk, Legend, Reading, Filter, Render recipe follow; Upgrade beside Migration.
4. archboard skill: the kinds, the effect rule and repository-specific kinds taught once in authoring.md Map the code; canonical-models (add-relationship example states its effect, --lens, lens note), schemas (vault-config), design-lens (a lens changes no count), SKILL.md (relationship row, UPGRADE_REQUIRED). The upgrade paragraph stays for 663.04.
5. Gates: format, lint:all, types, test:modules, test:repository, test:system, test:solo.
<!-- SECTION:PLAN:END -->
