---
id: TASK-559.20
title: Restore the glossary format of CONTEXT.md
status: To Do
assignee: []
created_date: '2026-10-31T02:02:00Z'
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
- [ ] #1 CONTEXT.md follows GLOSSARY-FORMAT.md: a title, a short description, a Language section, term groups, and each term as a bold name, a definition of one or two sentences, and an Avoid line where other words exist
- [ ] #2 Each of the 120 terms on main is kept, renamed, moved to a group for retained legacy formats, or removed because the concept no longer exists, and each decision was made by reading the code
- [ ] #3 Every concept in the current prose file stays defined, with no implementation detail
- [ ] #4 The vocabulary of the reader redesign is defined, including Legend, right panel, door, start and last reading, and Key is listed as a word to avoid
- [ ] #5 Every link in CONTEXT.md resolves
<!-- AC:END -->
