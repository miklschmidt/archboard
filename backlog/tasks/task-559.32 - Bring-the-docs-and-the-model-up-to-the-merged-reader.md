---
id: TASK-559.32
title: Bring the docs and the model up to the merged reader
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T06:36:00Z'
updated_date: '2026-10-31T06:38:00Z'
labels:
  - docs
  - model
dependencies: []
parent_task_id: TASK-559
priority: medium
ordinal: 1004000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the door, card, label, column, Measures and relationship merges, the docs and this repository's own model lag behind the code. CONTEXT.md lacks new terms and keeps retired ones, docs/design/reader-redesign.md still states removed rules, no ADR records the door, tab and rule 6 changes, and the model does not describe model inspect or Measures. Four relationships are stale and six containers warn CONTAINER_PASS_THROUGH since the repair.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CONTEXT.md holds the new terms and removes the retired ones, in its glossary format
- [ ] #2 reader-redesign.md, blocks-planned-layout.md and ADRs 0044, 0061, 0062 and 0064 no longer state what the code does not do
- [ ] #3 One new ADR records doors, the edge tab, removal of rule 6, one-click doors and landing whole
- [ ] #4 The three unplaced rules of the glossary work stand in their owners, and voice-prompt.ts no longer says boards
- [ ] #5 The model describes model inspect, Measures, the right panel context and doors, and the four stale relationships are gone
- [ ] #6 archboard check on this repository reports no warning that this work caused, or each one left has a reason in the notes
<!-- AC:END -->
