---
id: TASK-549.22
title: Preserve legacy walkthroughs, bookmarks, and addresses
status: To Do
assignee: []
created_date: '2026-10-26T05:26:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.14
  - TASK-549.21
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 952000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 22.

## What to build

Migration must preserve existing navigation and presentations without retaining duplicate model content.

Complete the migration preview with dynamic walkthrough readings, imported bookmarks, former names, and explicit legacy address mappings.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.14, TASK-549.21
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Complete the migration preview with dynamic walkthrough readings, imported bookmarks, former names, and explicit legacy address mappings.
- [ ] #2 Expand referenced views into walkthrough beats. Preserve other named views as bookmarks that own no model content.
- [ ] #3 Resolve migrated subject and state targets without fallback to similar names or current content. Unpinned external historical references remain explicitly unresolved.
- [ ] #4 A reader can play the converted walkthrough and follow a legacy address within the preview. The original vault still remains authoritative.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->
