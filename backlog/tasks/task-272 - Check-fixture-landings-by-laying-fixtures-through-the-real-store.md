---
id: TASK-272
title: Check fixture landings by laying fixtures through the real store
status: To Do
assignee: []
created_date: '2026-09-18 13:23'
updated_date: '2026-09-18 13:30'
labels: []
dependencies: []
references:
  - src/runtime/skill-evaluation/lib/landings.ts
  - src/runtime/skill-evaluation/lib/vault.ts
  - src/runtime/skill-evaluation/lib/suite.ts
  - src/runtime/skill-evaluation/tests/suite.test.ts
  - TASK-269
priority: medium
type: enhancement
ordinal: 479000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-269 added a guard that refuses a fixture whose relationship lands on a part with children, by walking each fixture's steps in landings.ts and modelling what the store would do. Five review rounds on it each found a real miss, and every one had the same root: the walk re-implements the store's semantics approximately - its field-by-field merge, the carry-down of an edit into drafts, resolutions, name matching after a rename, containment ordering - and each approximation leaked somewhere new. The last round's fixes leave the walk honest about what it does not model, but it cannot be made complete by adding cases, and landings.ts now sits exactly at the 600-line policy cap.

The whole class disappears if the check lays each fixture through the real store and reads the resulting boards. TASK-269's worker established this is feasible and cheap. The import cycle that ruled it out is real but narrow: vault.ts imports FixtureStepSchema from suite.ts as a runtime value, so suite.ts cannot import vault.ts - but nothing requires the check to live in suite.ts. A new module can import both suite.ts and vault.ts (for resolvePlaceholders) plus the store's pure transitions from its index without a cycle. It is already proven: suite.test.ts's "every fixture lays" test does exactly this in-process today, with transitionOf(resolved).apply(before, at), no canvas, no CLI and no vault on disk. The worker estimated about half a day.

One design point: loadSuite throws on suiteProblems, so either the scripts call the laying check after loadSuite, or loadSuite moves beside the new module. A side benefit: a fixture that does not lay at all would then be refused at check time rather than hours into a paid batch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The fixture-landing check lays each fixture step through the store's own transitions and reads the resulting boards, rather than modelling the store
- [ ] #2 After every step, every variant's content is checked with the same rule as the no-edge-to-container-with-children run check, with dependency edges allowed
- [ ] #3 landings.ts's model of merge, carry-down, resolution, name matching and containment is retired, and its tests run against the new check
- [ ] #4 Every miss the TASK-269 reviews found (M1, M2, P1, P2, R1, the draft-removal and sibling-draft cases) is refused, now by the store's own behaviour
- [ ] #5 A fixture that does not lay at all is refused by eval:skill check instead of during a batch
- [ ] #6 The 15 fixtures pass, and the check runs wherever scripts/evaluate-skill.ts gates a batch
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Two further misses found in TASK-269 round 5, recorded here because they are this task's to close rather than landings.ts's to chase. Both come from one root the walk does not model: merging a part's NAME between a draft and its predecessor. When a draft renames a part by id and the predecessor later restates it by its old name alone, the walk has to guess whether the carried statement means the draft's part, and either guess can split one part into two, which hides a landing. R2: new board A, X; branch Draft; Draft renames X to X2 by id and adds A->X2; current restates X by name alone; current adds child c under X. The store keeps X2 with c under it and A->X2 lands. R3 is the mirror: the same steps up to current's restatement, then Draft restates X2 by name alone and adds c under X2; A->X2 lands. TASK-269 closes R2 (a regression its own round-5 commit introduced) and records R3 as the one known miss. Laying fixtures through the real store closes both, because the store does the field-by-field name merge itself. Add both as tests of the new check.
<!-- SECTION:NOTES:END -->
