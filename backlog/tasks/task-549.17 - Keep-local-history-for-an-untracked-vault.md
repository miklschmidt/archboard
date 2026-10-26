---
id: TASK-549.17
title: Keep local history for an untracked vault
status: In Progress
assignee:
  - '@codex-local-history'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-26T15:48:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.03
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 947000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 17.

## What to build

Architecture work outside a source repository still needs durable local history.

An owner explicitly initializes a private bare archive for a vault outside a source repository. Existing model operations then retain and reopen its history.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.03
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An owner explicitly initializes a private bare archive for a vault outside a source repository. Existing model operations then retain and reopen its history.
- [ ] #2 Initialization never creates or changes a source repository. The vault remains local-only until an explicit publication destination exists.
- [ ] #3 The same signing, recovery, and diagnostic contracts apply. Published architecture contains no private machine paths.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm b5be713977e7829f16b404314af9fd8f653f70be and the approved runtime seam. Read shared archive, durable edit, publication, and policy owners.
2. Create Board persistence@TASK-549.17, Command interface@TASK-549.17, and Archboard server routes@TASK-549.17 through CLI claims and doing lines. Record the early contract outside the repo.
3. Add explicit private bare archive initialization outside source repositories. Resolve both archive locations through the same private archive interface and retain checkout-specific transaction ownership.
4. Use short red-green runtime slices with real files and Git for initialization, retain/reopen, durable edit/recovery, signing, isolation, and local-only publication. Add thin CLI/HTTP translations.
5. Update ADR 0059, consumer instructions, examples, evaluation coverage, and architecture proposals. Run focused runtime/adapter tests, types, lint, and formatting. Preserve the 241/188 width gate and unrelated baseline findings.
6. Merge the latest integration into this branch, simplify the result, finalize proven criteria, adopt affected proposals, release claims, stop the server, and deliver signed commits with exact evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner approved full graph and public runtime tests with real temporary files and Git. This task adds repository-independent durable history for untracked-vault owners through the existing archive, installation, and publication engine. No frontend changes, child agents, review, push, PR action, or real external publication are authorized in this implementation slice.

Public runtime slices prove explicit bare initialization, source preservation, exact retention/reopen, signing refusal, signed private edits, explicit temporary-local publication/fetch, and interrupted edit recovery. Red evidence caught private journal lookup after a new source repository appeared; lookup now stays with private history. CLI/HTTP setup composition passes across restart. Three TASK-549.17 proposals exist, but their drawing edits are paused at parent direction after shared Git-owner fan-out. No further architecture CLI calls will run until the parent clears the pause. Shared runtime regressions and static gates are in progress.

Sequential architecture CLI read with explicit server URL passed after process pressure subsided. All three proposals now describe delivered source. Lint and both type projects pass. Width remains 243/188 with exactly two new public names and no ceiling changes. One existing shallow-fetch case exceeded its 15-second timeout while the broad runtime group overlapped the code scan. It will rerun alone after that group finishes. Code evidence found two proposal issues, now corrected; ten unrelated baseline warnings remain outside the affected boards. S20 metadata errors remain at this baseline and are fixed in the separate .04 source awaiting integration.
<!-- SECTION:NOTES:END -->
