---
id: TASK-369.01
title: Decide how the history lens reads Git and where it answers
status: To Do
assignee: []
created_date: '2026-09-29 01:18'
labels:
  - history
  - semantic-model
dependencies: []
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-369
priority: high
type: docs
ordinal: 649000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposal 3 of docs/design/design-checks.md maps commits onto parts through bindings. Open questions: since when is a board stale (its last write, or the last change of its current variant)? Which ref counts for a vault that spans several repositories? Where do the readings answer: `archboard check`, `semantic inspect`, or a command of their own? Are they warnings or information? Which filters apply: code-maat uses commits of 30 files or fewer, at least 5 revisions, at least 5 shared revisions and a degree of 30%?
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An ADR records how commits map onto parts (files, directories, renames), which parts are skipped, the filters, the command surface and the severity of each reading
- [ ] #2 The ADR records that the readings are derived and never stored (ADR 0015) and never drawn as traffic (ADR 0027)
- [ ] #3 `CONTEXT.md` defines change coupling, hotspot, staleness and footprint as the ADR names them, with _Avoid_ lines that include temporal coupling
<!-- AC:END -->
