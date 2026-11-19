---
id: TASK-648
title: >-
  A reader opens a file beside the picture, and the picture shows the modules
  that own it
status: Done
assignee:
  - '@claude'
created_date: '2026-11-18T23:20:00Z'
updated_date: '2026-11-19T00:00:00Z'
labels: []
dependencies: []
references:
  - >-
    docs/adr/0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md
priority: high
ordinal: 1086000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard navigates from architecture to code: a module opens its bound code in an editor. The opposite direction is missing. An architect who reads a file cannot see which modules own it, and cannot go from a symbol in the code to the part of the picture that binds it. The owner asked for a file browser and a code view beside the picture, with bound symbols that select their modules, and with the picture kept in view. The owner suggested @pierre/trees for the tree; the code view is our own view on the Shiki that the app already ships, because @pierre/diffs cannot render a symbol as a component. Reading whole files changes the quoting exception of ADR 0046, so a new ADR records that.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Code key in the pane header opens a file tree and a code view beside the picture inside the pane; the tree, the code view and the picture resize by dragging, and the sizes persist in the browser
- [x] #2 The tree lists the Git-listed files of the vault repository and of each repository a binding names; a file the server never quotes is dimmed with its reason
- [x] #3 Opening a file selects its owners by the code check rule of ADR 0046 (symbol, then file, then deepest directory): owners that share a parent are shown in that scope, otherwise the picture focuses them; a file no module binds says so and leaves the picture alone
- [x] #4 The code view shows the whole file with syntax colours that follow the theme, and each symbol that a module binds is a focusable button that selects that module; hovering it lights the module in the picture
- [x] #5 With the code view open, selecting one bound module in the picture opens its file in the tree and the code view, scrolled to its symbol, without changing the selection
- [x] #6 A binary, oversized, never-quoted or missing file shows the refusal in the code view, and its owners still come from its path
- [x] #7 The server routes that list and read files keep the guards of ADR 0046 (own origin, registered checkout, containment, Git-listed, never-quoted list, Kubernetes Secret, 1 MiB) and a new ADR records the extended exception
- [x] #8 Tests cover the server routes contract and the owner rule for a file; DESIGN.md, the frontend guide and the canonical architecture model describe the new surface
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Architecture: proposal 3rxaeOO6 'Code browser beside the picture' (predecessor current 1wIcvaUQ, model vKEsyHFk, vault .archboard/vault). New subjects: Code browser vKEsyHFk#2EpLFgGU, Code files route vKEsyHFk#fCXk4gkF, File owners vKEsyHFk#8sC6QgHh; relationships sfvQPYux, iBUsuXmL, fiQ2exOC, VelaZ2cn.
1. Contract: packages/code-intel/src/shared/protocol/code-files.ts (CodeFilesSchema, CodeFileSchema), exported from @archboard/code-intel/code-check.
2. Server (delegated to an implementer): file-owners.ts in code-intel runtime (the code check's narrowest-binding rule for one file of a reading), handlers/code-files with GET /api/code/files and GET /api/code/file, the guard pipeline of source-lines extracted and shared, ADR 0080 amending the quoting exception of ADR 0046, route tests.
3. Browser: ui/architecture-drawing/code-browser behavior: Code key in the pane header, Resizable [tree | code] beside the picture, @pierre/trees file tree with module decorations, own code view on the existing Shiki (moved to a shared highlighting owner) with bound symbols as buttons, open file selects owners (shared parent: showHere, else focus), picture selection opens the bound file, codeX in the URL.
4. Docs: DESIGN.md, docs/agents/frontend.md, site audit. Finish the proposal and compare/footprint.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: types, lint:policy, lint:tests, lint:css, format:check, test:repository and test:modules (5123 pass) pass. archboard check code --state 3rxaeOO6 has no warnings after the route's anchors moved to codeCheck.run. Browser check in both themes with agent-browser: the Code key opens the tree and the code view beside the picture; opening a file scopes the picture to its owners' parent and selects them; a bound symbol is a button and hovering it lights its module; picking or opening a module opens its bound file and scrolls to the symbol; Back restores the earlier file; a binary file, a never-quoted file and an unowned file show their reason; dragging a divider resizes the panels and the size survives a reload.
Proposal 3rxaeOO6 now describes the implementation: Source excerpt (nbkmjsU3) and its edges are removed, because the excerpt reads the file route; Model queries reads the Code files route; the route depends on Git process commands. model footprint lists modules changed outside the plan whose architecture did not change: parents of the new modules, Model address and Workspace routing (the file search params), Fetch semantic reads, Selection inspector, Code warnings and Code findings memory (the derived RememberedFindings type), and the moved code highlighter.
Never-quoted files end with a ⊘ mark in the tree in place of words, because a deep row truncated the words. Opening a file by a pasted address leaves the picture and the selection as the address says; only a pick in the tree moves the picture.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A reader can now go from code to architecture. A Code key in the reading heading opens a file tree (@pierre/trees) and a code view (the app's own Shiki highlighter) beside the picture, in resizable panels whose sizes persist. Opening a file asks the new GET /api/code/file route for the whole file and its owners by the ADR 0046 binding rule, then moves the picture to those owners and selects them. Each bound symbol in the code is a focusable button that selects its module, and hovering it lights the module in the picture. Picking or opening a bound module opens its file at its symbol. The server routes keep the ADR 0046 guards, recorded in ADR 0080; the old source-lines route is gone, and the evidence excerpt reads the file route. @pierre/diffs was not used, because it cannot render a custom component per token. Risks: very deep tree rows still truncate long names until the reader widens the tree; the tree reads the registered checkout, which may differ from the worktree being edited.
<!-- SECTION:FINAL_SUMMARY:END -->
