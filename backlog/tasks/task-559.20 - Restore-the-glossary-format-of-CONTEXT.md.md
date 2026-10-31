---
id: TASK-559.20
title: Restore the glossary format of CONTEXT.md
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T02:02:00Z'
updated_date: '2026-10-31T02:35:00Z'
labels:
  - docs
dependencies: []
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 992000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Commit 56447f6f6 in pull request 19 replaced the glossary with prose: 1,042 lines and 124 defined terms became 177 lines and no defined terms. Main still holds the glossary, with 120 terms. The file lost its Avoid lists, so agents lost the words that must not be used, and later work added rules such as 'Do not call it a legend' in prose. The domain-modeling skill sets the format in GLOSSARY-FORMAT.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CONTEXT.md follows GLOSSARY-FORMAT.md: a title, a short description, a Language section, term groups, and each term as a bold name, a definition of one or two sentences, and an Avoid line where other words exist
- [x] #2 Each of the 120 terms on main is kept, renamed, moved to a group for retained legacy formats, or removed because the concept no longer exists, and each decision was made by reading the code
- [x] #3 Every concept in the current prose file stays defined, with no implementation detail
- [x] #4 The vocabulary of the reader redesign is defined, including Legend, right panel, door, start and last reading, and Key is listed as a word to avoid
- [x] #5 Every link in CONTEXT.md resolves
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the intent first: TASK-549 and its notes, TASK-559, ADR 0066 to 0069, the recursive decomposition record and the reader redesign. Board and level are retired on purpose, so code alone does not settle a term.
2. Decide each of the 120 terms on main as keep, rename, retained or remove, from those records and the live code.
3. Rewrite CONTEXT.md to GLOSSARY-FORMAT.md. Keep every concept of the prose file, add the reader and recursive reading vocabulary, and use the owner's five definitions as written.
4. Check that each rule that leaves the file already lives in CLAUDE.md, an ADR or the docs, and report any rule with no home.
5. Validate shape, style and links, and run the complete gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote CONTEXT.md to GLOSSARY-FORMAT.md: 175 terms in 15 groups. Of the 120 terms on main, 93 stay, 17 take a new word, 2 merge into Legacy board and 8 go. 65 terms are new, including the owner's Legend, Right panel, Door, Edge tab, Group tag, Change list, Walk and Place, which were written as the owner decided and not checked against the code.

Removed: Everything, Standing-for node, Tracked embed, Presentation intent, Level, Scorecard, Behind, Implementation brief.

Open doubts for the owner: Trace has no control in the canonical right panel, and only the retained recording's inspector calls it. Docs say reader and the glossary keeps User from main. Drill-down and level are listed under Avoid, and a migrating owner still meets them in a mapping plan and in vault configuration.

Rules with no home in CLAUDE.md, an ADR or the docs: an explicit removal and addition declare a replacement of a relationship. An original saved talk stays exact retained history and replay recreates no live writer. A stale comparison cannot authorize code inspection.

Verification: the complete gate exited 0 with 21 of 21 tasks, on the file before Change list, Walk and Place. Those three terms and two one-word repairs came after the gate. The format check, shape check and term ledger pass on the final file. The machine crashed at 03:06, and the file was written after the reboot.
<!-- SECTION:NOTES:END -->
