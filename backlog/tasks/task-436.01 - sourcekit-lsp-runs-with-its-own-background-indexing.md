---
id: TASK-436.01
title: sourcekit-lsp runs with its own background indexing
status: Done
assignee:
  - '@codex-language'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 01:37'
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
- [x] #1 The code check passes no `backgroundIndexing` option to sourcekit-lsp, and a package that turns background indexing on is not unready
- [x] #2 A run of the code check waits until sourcekit-lsp finished its index, and then asks it
- [x] #3 INSTALL.md, the setup reference of the archboard skill and an amendment of ADR 0046 say that sourcekit-lsp builds a package itself on the first run
- [x] #4 Where a Swift toolchain is available, the first run and a later run on one package are measured, and the notes give the numbers
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

Closing footprint: base 19b1b5317b56920628b7da9dae78764ca27ac161. The restated proposal parent is TASK-436.09, ZbBkF1bH. Language servers is named and changed. Swift readiness inside Code check is an internal change. Other unnamed changes belong to concurrent analysis tasks. No named part lacks its source change. The conditional Swift measurement does not apply because this machine has no Swift toolchain.

Final gate: bun run check exits 0 in 436 seconds with 4,597 passing tests, including the complete serial browser lane. Lint, formatting, root and frontend types, and builds pass. The refreshed server runs sixteen boards. The delivery code pass exits 0 with zero diagnostics and zero warnings. Complete gate log: /tmp/archboard-task436-final-check-2.log. Delivery evidence: /tmp/archboard-task436-delivery-code.json.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
SourceKit keeps its own background indexing and the analysis waits for index synchronization. Focused protocol tests and the full gate pass. Documentation states the first-run build behavior. Live Swift timing remains unavailable because this machine lacks the toolchain.
<!-- SECTION:FINAL_SUMMARY:END -->
