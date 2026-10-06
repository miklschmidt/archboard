---
id: TASK-369.01
title: Decide how the history lens reads Git and where it answers
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:18'
updated_date: '2026-10-06 10:05'
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
- [x] #1 An ADR records how commits map onto parts (files, directories, renames), which parts are skipped, the filters, the command surface and the severity of each reading
- [x] #2 The ADR records that the readings are derived and never stored (ADR 0015) and never drawn as traffic (ADR 0027)
- [x] #3 `CONTEXT.md` defines change coupling, hotspot, staleness and footprint as the ADR names them, with _Avoid_ lines that include temporal coupling
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Draft ADR 0045 from the task's open questions and the subtasks it serves. 2. Add the glossary entries to CONTEXT.md. 3. An independent reviewer verifies every claim against the code, Git and code-maat's source, settles the open points and fixes the text. 4. Accept and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Drafted by one agent and reviewed by an independent one on 2026-10-06 (the user delegated acceptance to that review). The reviewer renamed staleness to Behind, sweep to Large commit and window to Period, because each word already had a meaning here. It corrected the code-maat min-revs rule and reversed the draft on walkthrough edits. CONTEXT.md names the reading Behind, and its Avoid line lists staleness.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ADR 0045 decides that commits map onto parts through their bound files, read at each registered checkout's HEAD, on request and never stored or drawn. Behind goes in archboard check --code. Hotspots and change coupling go in semantic locality, and the footprint goes in semantic footprint. All four are information. CONTEXT.md defines Behind, Hotspot, Change coupling, Footprint and Large commit, and Change coupling avoids temporal coupling. Verified by an independent review against bindings, compareVariants, the cited commits and code-maat's source.
<!-- SECTION:FINAL_SUMMARY:END -->
