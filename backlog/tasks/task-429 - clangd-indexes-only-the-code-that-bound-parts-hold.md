---
id: TASK-429
title: clangd indexes only the code that bound parts hold
status: To Do
assignee: []
created_date: '2026-10-06 21:48'
labels:
  - code-check
dependencies: []
priority: low
ordinal: 692000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-367.15 makes clangd rebuild its background index on every code-check pass, from a copy of the whole compile_commands.json. Its review measured 1.5 s on Redis and 54 s on the whole of LLVM, so every pass over a checkout of LLVM size fails once after the 30 s bound and keeps its candidates. Indexing only the commands of files that bound parts hold would bound the cost by the board, not the checkout. It changes answers: an anchor defined in code no part binds reads as its declaration, and the order of opened files matters again there, which is why TASK-367.15 kept the whole index.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A pass over a checkout whose full index takes longer than the bound still resolves the candidates of its bound parts
- [ ] #2 An anchor whose definition lies in code no part binds is judged as it is with the full index, or the answer says why not
- [ ] #3 The time per pass on Redis does not grow
<!-- AC:END -->
