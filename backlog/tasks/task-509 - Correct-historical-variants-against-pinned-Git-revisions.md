---
id: TASK-509
title: Correct historical variants against pinned Git revisions
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-23 02:27'
updated_date: '2026-10-23 02:31'
labels: []
dependencies: []
ordinal: 916000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Historical variants can contain diagram mistakes. Authors need a deliberate correction path that describes the code at the historical point rather than current code. The current write boundary refuses all historical content edits, and variants do not record a complete revision per repository.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Ordinary edits still refuse historical content changes.
- [ ] #2 An explicit correction identifies immutable Git commits for the repositories it describes and refuses unavailable revisions.
- [ ] #3 The correction keeps variant identity, ancestry, lifecycle, and adoption history, with a recorded reason and revision evidence.
- [ ] #4 The author can inspect proposed corrections and run the code check against the stated historical revisions before writing.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Proposals: Board persistence@TASK-509, Command interface@TASK-509, Archboard server routes@TASK-509. Add a dedicated correction transition and command, with preview/write routes. 2. Require a reason and explicit immutable commits per referenced repository. Suggest commits from adoption time without treating the guess as proof. 3. Preview an in-memory candidate with comparison and code findings using Git trees, including when the commit equals dirty HEAD. Write repeats validation and uses the existing lease and expected-version boundary. Preserve all other variants and adoption records. 4. Record correction evidence on the historical variant, update ADR and consumer guidance, and add behavior tests. 5. Run the complete gate, inspect and adopt proposals, and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User approved the explicit correction design. Adoption timestamps can suggest candidate commits, but preview and write use explicit immutable commits after inspection.
<!-- SECTION:NOTES:END -->
