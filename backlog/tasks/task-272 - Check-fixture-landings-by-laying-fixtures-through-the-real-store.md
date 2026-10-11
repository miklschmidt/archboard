---
id: TASK-272
title: Check fixture landings by laying fixtures through the real store
status: Done
assignee:
  - '@implementer'
created_date: '2026-09-18 13:23'
updated_date: '2026-10-11 14:02'
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
- [x] #1 The fixture-landing check lays each fixture step through the store's own transitions and reads the resulting boards, rather than modelling the store
- [x] #2 After every step, every variant's content is checked with the same rule as the no-edge-to-container-with-children run check, with dependency edges allowed
- [x] #3 landings.ts's model of merge, carry-down, resolution, name matching and containment is retired, and its tests run against the new check
- [x] #4 Every miss the TASK-269 reviews found (M1, M2, P1, P2, R1, the draft-removal and sibling-draft cases) is refused, now by the store's own behaviour
- [x] #5 A fixture that does not lay at all is refused by eval:skill check instead of during a batch
- [x] #6 The 15 fixtures pass, and the check runs wherever scripts/evaluate-skill.ts gates a batch
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New lib/laying.ts: lay each fixture step through the store's transitions (placeholders resolved against the board so far), read every variant after every step with the run check's rule (edgesOnContainers, dependency allowed). 2. Retire landings.ts, drop it from suite.ts/index.ts. 3. scripts/evaluate-skill.ts loadedSuite lays fixtures after loadSuite, so check/run/grade/report all gate on it. 4. Move landings.test.ts to laying.test.ts, add R2/R3 and does-not-lay cases; suite.test.ts uses layFixture.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Two further misses found in TASK-269 round 5, recorded here because they are this task's to close rather than landings.ts's to chase. Both come from one root the walk does not model: merging a part's NAME between a draft and its predecessor. When a draft renames a part by id and the predecessor later restates it by its old name alone, the walk has to guess whether the carried statement means the draft's part, and either guess can split one part into two, which hides a landing. R2: new board A, X; branch Draft; Draft renames X to X2 by id and adds A->X2; current restates X by name alone; current adds child c under X. The store keeps X2 with c under it and A->X2 lands. R3 is the mirror: the same steps up to current's restatement, then Draft restates X2 by name alone and adds c under X2; A->X2 lands. TASK-269 closes R2 (a regression its own round-5 commit introduced) and records R3 as the one known miss. Laying fixtures through the real store closes both, because the store does the field-by-field name merge itself. Add both as tests of the new check.

vault.ts does not import suite.ts (the task premise was stale); laying.ts lives beside both anyway and is called from the script after loadSuite, as the task offers. Run-check rule shared: outcomes-board.edgesOnContainers(content, allowedKinds). Tests only count a landing when the fixture laid (problems() fails on 'does not lay'), which exposed that the old resolve case named a node the draft removed: unreachable for a fixture, replaced by a real conflict resolved to the predecessor's parent. Real fixtures: 20, not 15. Probe: appending an edit naming a parent nothing created to evals/fixtures/S01.json made 'eval:skill check' fail with 'fixtures that do not lay' (file restored). Stale elsewhere, outside my write scope: .archboard/vault/Skill evaluation.semantic.json (3 descriptions cite landings.ts) and TASK-368.04 line 78.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixtures are now laid through the store's own transitions by src/runtime/skill-evaluation/lib/laying.ts (layFixture, layingProblems); landings.ts and its model are deleted. scripts/evaluate-skill.ts loadedSuite runs the check after loadSuite, so check, run, grade and report refuse a fixture that does not lay or that lands a non-dependency relationship on a part with children. Evidence: tests/laying.test.ts (18 pass: kinds, later child, M1/M2/P1/P2 variant cases, R1 rename-survives, R2, R3, resolution, sibling drafts, does-not-lay), tests/suite.test.ts (every fixture lays, 20 real fixtures), bun scripts/evaluate-skill.ts check ok, probe with a broken S01 refused; tsc, oxlint type-aware and oxfmt clean for the touched scope.
<!-- SECTION:FINAL_SUMMARY:END -->
