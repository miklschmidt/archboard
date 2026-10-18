---
id: TASK-498
title: >-
  A board and its variants name the repository documents they state, such as a
  design document, a task or an ADR
status: To Do
assignee: []
created_date: '2026-10-18 13:15'
labels:
  - schema
  - cli
  - skill
dependencies: []
priority: high
type: enhancement
ordinal: 863000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board holds no link to the documents it draws. In the Docs-Architecture-Design vault, one design (Platform Doc-0072 and TASK-0417) is a draft on four boards under four names, and an agent explaining its pull request could not tell which draft on a board was the design and which a rejected alternative. The design document also changed through the stack (Doc-0072 grows from 338 to 499 lines between #589 and #615), and nothing says which version a draft draws. The owner asked for a metadata field that couples a board to repository tasks, documents and ADRs. Where the field lives (board, variant or both) and how a reference names a repository, path and branch are open: bindings already name a repository, a path and a branch for a part.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An ADR decides where a document reference lives and what it names
- [ ] #2 A board or a variant can name repository documents, and show returns them
- [ ] #3 `archboard check` reports a reference whose document is missing at the branch it names
- [ ] #4 The archboard and archboard-pr skills read a draft's documents to find a design and its version, and write them when they draw one
<!-- AC:END -->
