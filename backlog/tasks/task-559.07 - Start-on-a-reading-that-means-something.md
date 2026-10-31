---
id: TASK-559.07
title: Start on a reading that means something
status: Done
assignee:
  - '@claude'
created_date: '2026-10-30T16:44:00Z'
updated_date: '2026-10-31T01:19:00Z'
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
- [x] #1 An address, the last reading, or a repository chooser decides the start, and an unrelated repository never opens by default
- [x] #2 No repository, no model, a planning model and a legacy model each show their own state and action
- [x] #3 A loading message appears only after a delay, and names the destination
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Branch feat/reader-start. Start rule: the address, then this browser's last reading, then one listed repository with a model, then the chooser (ADR 0069, docs/design/reader-redesign.md). /api/served-vault and the served field are gone. install-skill registers the repository it sets up. A picture no longer waits forever for a picture store that never answers (PICTURE_MS.storeWait). help.test.ts ran a real command in the checkout and wrote to the owner's registry on a fresh worktree's first gate, so it now has a registry of its own; this probably explains the /tmp/integrate/wt19 entry in TASK-559. Not yet aligned: the tracked model module LMJVhlqw still says the page resolves its served vault.

Merged in 4214f6f81 from feat/reader-start. The gate passed 21 of 21 tasks, exit 0. Start rule in ADR 0069. Open: a chooser page answers browser show with BROWSER_REQUIRED and its message still says to open the plain address; the model module LMJVhlqw says that the page resolves its served vault; source-checkout fails when an outside process probes a new port.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The plain address no longer opens an unrelated repository. One rule, made in the browser before any pane exists, decides the start: an address, then this browser last reading, then the one repository with a model, otherwise a chooser. No repository, a missing repository, no model, a planning model and a legacy model each show their own state and action, and a loading message appears after 800 ms and names its destination. The gate on 4214f6f81 passed 21 of 21 tasks in 166 seconds. ADR 0069 records the rule.
<!-- SECTION:FINAL_SUMMARY:END -->
