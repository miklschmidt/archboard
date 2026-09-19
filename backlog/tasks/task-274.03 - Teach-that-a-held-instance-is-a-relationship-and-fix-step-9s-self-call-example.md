---
id: TASK-274.03
title: >-
  Teach that a held instance is a relationship, and fix step 9's self-call
  example
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-19 00:40'
updated_date: '2026-09-19 00:48'
labels: []
dependencies: []
parent_task_id: TASK-274
priority: high
ordinal: 487000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two portable gaps in skills/archboard. (1) The containment row says 'a part defined inside another' but nothing says what is NOT containment; authors read 'the app owns X' / an object stored in a field as containment (S01: candidate 5 of 6 runs across two batches). The user approved the rule: an instance held in a field (composition, a reference kept on an object, a dependency injected or constructed and stored) is a relationship, not containment; containment is where the code is defined. (2) Runbook step 9 and references/create-sequence.md give 'a method calling another of its own' as a self step. When both methods are drawn as separate participants, a call between them is a message between two columns, not a self step; the rule itself (self exactly when from and to are the same drawn node) is right, the example contradicts it (S05: all 3 candidate runs drew preprocess_request as a self step on full_dispatch_request). Memory rule skill-examples-never-from-evals: rules generic across paradigms, archboard names only inside worked examples.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The skill states, portably and across paradigms, that holding, constructing-and-storing or being handed an instance is a relationship from the holder, and containment is only where a part is defined; it sits where an author choosing between parent and an edge meets it
- [x] #2 Every self-call example in SKILL.md and the references is true under the rule that a self step is exactly one whose from and to are the same drawn node
- [x] #3 No evals/evals.json or rubric.md edit; every skill citation still resolves (bun run eval:skill check)
- [ ] #4 SKILL.md grows by no more than about 400 bytes; derived copies resynced; gate passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. SKILL.md catalogue containment row: add the portable rule that an instance a part holds, captures, builds and keeps, or is handed (object field, closure capture, injected dependency, props/context) is a relationship from the holder, whatever the request calls ownership; parent is where a part is defined.
2. SKILL.md runbook step 5: replace 'which parts hold which as children' (ambiguous with a held instance) with wording about definition; step 9: say a call between two parts each drawn as a column is a message, not a self step.
3. authoring.md Containment and receivers: one clause pointing the same way.
4. create-sequence.md step 1: reword 'a method calling another of its own' so it is true under the same-drawn-node rule; grep skills/archboard for every other self-call example.
5. Keep SKILL.md growth <= ~400 bytes; bun run eval:skill check; sync skills; gate fmt:check, test:modules, test:repository; commit by path.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit be8388bb. SKILL.md 21873 -> 22236 bytes (+363). Catalogue containment row now says an instance a part holds (object in a field, closure capture, dependency handed via props/context or built and kept) is a relationship from the holder even when the request says it owns it. Step 5 says 'defined inside' instead of 'hold ... as children'. Step 9 adds that a call between two parts each with a column is a message. authoring.md Containment and receivers: parent = defined inside; holding an instance is a relationship. create-sequence.md step 1: 'a method of a class drawn whole calling another' replaces 'a method calling another of its own'. Grep of skills/archboard found no other self-call examples that contradict the same-node rule (create-sequence step 3 and sequences-views-walkthroughs table already state it). eval:skill check suite ok; skills resynced and diff-clean; fmt:check, test:modules (3338 pass), test:repository (8 pass) green.

Review fixes, commit 83ee9acf: 'holds/holding' -> 'defines/defining' in evidence rule 3 and authoring.md receivers section; containment row says 'a component defined inside another' and 'An instance a part holds or renders is not its child', naming '(a constructor argument, props, context)'; step 9 parenthesis now '(one step with it at both ends, never a call between two parts that each have a column)'; create-sequence step 1 'a method calling another method of a class that is one column', rewrapped. SKILL.md now 22265 bytes (+392 over 21873). eval:skill check ok; resynced; test:modules 3341 pass, test:repository 8 pass; fmt:check fails only on other workers' uncommitted src/runtime/skill-evaluation files, the three skill files pass oxfmt --check.

Independent review, two rounds; round 2 clean (83ee9acf): 'holds' no longer means containment anywhere, containment row says 'a component defined inside another', held or rendered instances and constructor injection named. SKILL.md +392 bytes. AC#4 (gate) held for the final full gate.
<!-- SECTION:NOTES:END -->
