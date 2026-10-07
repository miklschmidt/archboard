---
id: TASK-436.01
title: sourcekit-lsp runs with its own background indexing
status: In Progress
assignee:
  - '@codex-language'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 00:50'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep the language-server module and project lookup; remove Swift backgroundIndexing override and index/config readiness guards. Archboard server proposal is coordinated by the parent because its Language servers description changes.
2. Keep workspace/synchronize with index=true as the barrier before questions; prove a package without a prebuilt index and one enabling background indexing are asked only after synchronization.
3. Update INSTALL.md, setup reference and ADR 0046 amendment. Measure first/later runs only if Swift toolchain is available.
4. Run focused language-server/code-check tests, generate skill artifacts, simplify and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed the unused initialization-options mechanism and the Swift index/config preflight guards. workspace/synchronize with index=true remains the readiness barrier; focused Swift language-server and code-check owners passed (6 tests). Generated ignored skill artifacts. Swift and sourcekit-lsp are absent from PATH, so the conditional live first/later package measurement cannot run on this machine. Primary SourceKit 6.2.4 Workspace.swift confirms synchronize waits for the build graph and up-to-date index.
<!-- SECTION:NOTES:END -->
