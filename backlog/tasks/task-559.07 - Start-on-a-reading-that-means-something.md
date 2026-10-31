---
id: TASK-559.07
title: Start on a reading that means something
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-30T16:44:00Z'
updated_date: '2026-10-30T23:59:00Z'
labels:
  - frontend
dependencies:
  - TASK-559.05
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 979000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The product opens on the migration notice of an unrelated repository, and a second pane does the same. The switcher must also handle 312 checkouts on this machine.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An address, the last reading, or a repository chooser decides the start, and an unrelated repository never opens by default
- [ ] #2 No repository, no model, a planning model and a legacy model each show their own state and action
- [ ] #3 A loading message appears only after a delay, and names the destination
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Decide the start once, before any pane exists: the address, then this browser's last reading, then the chooser. A machine that lists exactly one repository with a model has nothing to choose.
2. Remove openingVault, /api/served-vault and the served field, so no server rule can pick a repository from a list.
3. Let a chooser row open a repository with no model or a legacy model, and address it with repoX alone.
4. Give no repository, no model, a planning model and a legacy model one state each, with one action.
5. Name the destination in every loading message, after PICTURE_MS.waitNotice.
6. Judge each state at 1920 by 1080 in both themes in the real pane, and fix what the critique finds.
7. Update the design record, CONTEXT.md, the ADR and the tests.
<!-- SECTION:PLAN:END -->
