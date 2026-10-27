---
id: TASK-549.08
title: Adopt or shelve a proposal without growing current history files
status: In Progress
assignee:
  - '@codex-backend'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T23:53:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.07
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 938000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 8.

## What to build

Adopted and shelved history must remain readable without growing every current architecture file.

An agent explicitly adopts a settled proposal or shelves it with a reason. Readers can reopen and compare the retained result afterward.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.07
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent explicitly adopts a settled proposal or shelves it with a reason. Readers can reopen and compare the retained result afterward.
- [ ] #2 Refuse superseded adoption by default. Forced adoption requires comparison and installs the complete resolved proposal. Code commits, merges, and approval never adopt it.
- [ ] #3 Preserve ancestry, prior state, documents, reasons, and lifecycle timestamps. Remove active proposal files only within the durable operation.
- [ ] #4 Repeated requests create one lifecycle event. The same later edit produces the same current-file delta after zero or many completed proposals.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm the supplied clean checkout at signed integration e28c69457986363ac26aad68131260ae988ce723. Keep frontend, browser tests, review, publication, adoption, and closure with the parent.
2. Create accurate TASK-549.08 draft proposals on Board persistence, Command interface, and Archboard server routes. Publish the exact shared contract in the durable task directory.
3. Use red-green tests through the approved public architecture operations with real files and Git. Extend the existing candidate, archive record, reader, claim closure, signed journal, recovery, retry, and event paths for adoption and shelving.
4. Cover superseded and forced adoption, unsettled refusal, preserved completed readings and dependent proposals, interrupted removal and installation, exact retries, signing, and bounded current-file churn. Keep adapters thin.
5. Update consumer guidance, ADR0061, domain terms, test ownership, and evaluation inputs. Pause and simplify duplicate ownership. Run affected evidence, merge latest integration, sign commits, release claims, stop only this worktree server, and save backend handoff. Keep all criteria unchecked and task proposals draft.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend implementation assignment accepted in supplied isolated checkout /home/msc/Projects/t3code/.t3/worktrees/archboard/t3-ce48997f, branch t3/ce48997f. HEAD and feat/canonical-module-model both equal signed e28c69457986363ac26aad68131260ae988ce723. TASK-549.07 is Done. No initial merge is needed. Parent owns frontend and browser acceptance. No child agents, reviews, push, PR, task closure, or proposal adoption are authorized.

Created draft architecture proposals before source changes: Board persistence@TASK-549.08 (VtLhJvof, version182), Command interface@TASK-549.08 (xfpVZpm5, version201), and Archboard server routes@TASK-549.08 (y5OB41xO, version167). The early exact contract is /home/msc/.local/state/archboard-implementation/task-549/task-549.08-contract.md. The first public real-file/Git adoption test failed on absent protocol, then passed with complete installation, both exact readings and one retained lifecycle event after retry. All acceptance criteria remain unchecked.
<!-- SECTION:NOTES:END -->
