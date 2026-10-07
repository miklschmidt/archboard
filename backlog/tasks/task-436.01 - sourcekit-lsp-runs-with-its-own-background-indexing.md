---
id: TASK-436.01
title: sourcekit-lsp runs with its own background indexing
status: To Do
assignee: []
created_date: '2026-10-07 00:36'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-436
ordinal: 695000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check turns off the background indexing of sourcekit-lsp (`backgroundIndexing: false`) and gives `language-server-unready` for a package whose `.sourcekit-lsp/config.json` turns it on. It is the one place where the code check still changes what a configured server does (TASK-433). The owner decided that a configured server runs as it runs in an editor. Nobody measured the default, because no Swift toolchain was available.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The code check passes no `backgroundIndexing` option to sourcekit-lsp, and a package that turns background indexing on is not unready
- [ ] #2 A run of the code check waits until sourcekit-lsp finished its index, and then asks it
- [ ] #3 INSTALL.md, the setup reference of the archboard skill and an amendment of ADR 0046 say that sourcekit-lsp builds a package itself on the first run
- [ ] #4 Where a Swift toolchain is available, the first run and a later run on one package are measured, and the notes give the numbers
<!-- AC:END -->
