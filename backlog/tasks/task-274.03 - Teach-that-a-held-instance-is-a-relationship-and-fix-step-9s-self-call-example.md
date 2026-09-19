---
id: TASK-274.03
title: >-
  Teach that a held instance is a relationship, and fix step 9's self-call
  example
status: To Do
assignee: []
created_date: '2026-09-19 00:40'
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
- [ ] #1 The skill states, portably and across paradigms, that holding, constructing-and-storing or being handed an instance is a relationship from the holder, and containment is only where a part is defined; it sits where an author choosing between parent and an edge meets it
- [ ] #2 Every self-call example in SKILL.md and the references is true under the rule that a self step is exactly one whose from and to are the same drawn node
- [ ] #3 No evals/evals.json or rubric.md edit; every skill citation still resolves (bun run eval:skill check)
- [ ] #4 SKILL.md grows by no more than about 400 bytes; derived copies resynced; gate passes
<!-- AC:END -->
