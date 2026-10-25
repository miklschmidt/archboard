---
id: TASK-534
title: Long CLI help descriptions are written as paragraphs and lists
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T03:59:00Z'
updated_date: '2026-10-25T04:03:00Z'
labels:
  - cli
  - docs
dependencies: []
priority: low
ordinal: 930000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A command contract description is the body of its --help. Thirteen commands still print one paragraph of more than 120 words (semantic footprint 458, semantic move 307, semantic edit 277, semantic record 258, semantic locality 225, semantic compare 205, semantic resolve 164, semantic rename 152, semantic inspect 145, semantic replay 141, semantic branch 139, repo add 137, semantic adopt 136 words, measured 2026-10-25). The owner called the check code description, which was the same shape, unreadable. TASK-526.01 (PR #3) taught the help renderer paragraphs, headings ending in a colon, list items with a hanging indent, and code spans in backticks, and rewrote the check commands in that form.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each of the thirteen descriptions is split into paragraphs, headings and lists, and keeps every fact, flag and code it named before
- [x] #2 No command help prints a paragraph of more than about 80 words
- [x] #3 A contract file that the longer text would push over the line bound keeps its help text in a module beside it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Capture the old --help of the 13 commands. 2. Rewrite each description as paragraphs, headings and lists (array of lines joined with newline), moving long texts to a help module where a contract file nears 600 lines. 3. Compare old and new help for flags, finding and refusal codes. 4. Run lint, fmt, tsc, bun test apps/cli.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Compared old and new --help of all 13 commands: no flag, backtick code or uppercase code disappeared. Added codes taken from each contract's own refusals: PARENT_SUPERSEDED (adopt), UNKNOWN_GROUP (inspect), MOVE_STOPPED, MOVE_SAME_REPOSITORY, BOARD_HELD, BOARD_EXISTS, MOVE_NEEDS_IDENTITY (move). Longest paragraph or list item now 64 words (record, locality), was 137 to 458. semantic edit and semantic branch help moved to board/board-help.ts because board.ts was at 593 lines. Lint, fmt check, tsc and bun test --isolate apps/cli pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rewrote the thirteen long command descriptions as paragraphs, headings ending in a colon and dash lists, written as arrays of lines joined with newline. Moved the edit and branch texts to board/board-help.ts to stay under the 600-line bound. No command behavior changed. Verified by comparing flags and codes in old and new --help, and by lint, fmt, tsc and the apps/cli tests.
<!-- SECTION:FINAL_SUMMARY:END -->
