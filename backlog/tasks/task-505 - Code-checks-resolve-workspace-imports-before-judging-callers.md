---
id: TASK-505
title: Code checks resolve workspace imports before judging callers
status: Done
assignee:
  - '@codex'
created_date: '2026-10-22 03:24'
updated_date: '2026-10-22 04:32'
labels: []
dependencies: []
references:
  - >-
    packages/code-intel/src/runtime/operations/code-facts/modules/module-resolution.ts
  - TASK-501
priority: high
type: bug
ordinal: 912000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-501 board repairs exposed false EXPOSED_UNUSED information after TASK-500 moved source to workspace packages. The static TypeScript module resolver reads relative imports and tsconfig paths, but not manifest imports or workspace package exports. A direct probe cannot resolve #ui/clients/pane-session/pane-report-sender.ts from pane-core.ts even though apps/web/package.json declares #* and pane-core imports and calls createPaneReportSender. The code check then says that all 41 pane-session names have no outside caller. More containers now make this existing resolver gap visible. This undermines interface and dependency findings. TASK-501 keeps singular bindings and repairs board ownership separately.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The code check resolves owner-local # imports and declared workspace package exports from the checkout metadata that it reads
- [x] #2 A real caller through either workspace import form prevents false EXPOSED_UNUSED and contributes the correct code evidence
- [x] #3 Resolution stays inside the selected checkout and revision, including historical Git readings, and leaves external packages unresolved
- [x] #4 Focused regressions cover the observed pane-session caller and a cross-package public entry without weakening existing checks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Restore static TypeScript import resolution through manifest-local imports and workspace package exports. Keep the existing checkout-file reader so historical Git trees and checkout containment stay authoritative. Add focused regressions for real callers through both forms, then run the normal gate together with the required renderer repairs. This corrects the internal analyzer, so no product architecture board changes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User explicitly requested the resolver defect fixed ASAP on 2026-10-22. Reproduction: #ui/clients/pane-session/pane-report-sender.ts resolves to undefined from pane-core.ts despite its package imports declaration. The real importing file calls createPaneReportSender, while code check reports it unused.

Commit 6964cd0fa resolves manifest-local imports and declared workspace exports from CheckoutFiles and supplied text reads. All 39 focused tests pass, including pane-session callers, public package calls, containment, and cached source bytes across historical manifest changes. Targeted lint and formatting pass. The first live code pass clears the false Board move unused-export finding and exposes 30 missing-relationship identities. Source-backed board corrections reconcile architectural calls, while notes explain pure helper and data-node dependencies outside each board question. Browser visual ownership now binds components, with a child for voice box presence, instead of treating all workbench UI roles as one visual owner. Complete gate remains pending.

The reconciled live code pass has zero structural diagnostics and zero ANCHOR_MISMATCH. Pane session now has 31 of 41 names unused, down from the incorrect 41 of 41. Fourteen RELATIONSHIP_UNDRAWN identities intentionally remain: Archboard omits timing/error helpers, code-intel recovery-command formatting, and reverse dependencies from stored data. Its skills package relationships already represent the evaluator process dependencies on process, board, renderer, and walkthrough. Server boards omit browser-local rendering, pure board-address helpers, workhorse checkout identification, and CLI-only bound-vault discovery. Live panes address parsing and normalization do not read or write the board store. Those source-backed omissions keep each board focused on its stated question. No checker policy, warning, or code evidence is suppressed. Evidence: /tmp/archboard-task505-root-boards.md and /tmp/archboard-task505-backend-boards.md.

Final acceptance on source commit 0e53dbb2b: bun run check passed with exit 0 in 586.74 seconds. Modules: 4,869 passed, 1 skipped, 0 failed. System: 257 passed. Repository: 135 passed. All 19 serial browser owners completed with 27 passed tests. Log: /tmp/archboard-final-check-4.log. Timing: /tmp/archboard-final-validation-timing-4.json. The separate renderer run passed 709 tests, skipped 1, and failed none in 139.29 seconds. No assertions, normal owners, lint rules, or timeout contracts were weakened.

The final worktree restart and both overview rasterizations passed. The Browser application and Semantic renderer PNGs were inspected and remain readable. The refreshed code pass reports zero structural diagnostics and zero ANCHOR_MISMATCH, down from 82 at baseline. It still exits 1 for five baseline ANCHOR_SYMBOL_MISSING warnings and fourteen scope-explained RELATIONSHIP_UNDRAWN warnings. Twenty-one EXPOSED_UNUSED information findings remain. No findings are suppressed. Evidence: /tmp/archboard-closing-code-check.json, /tmp/archboard-closing-browser.png, /tmp/archboard-closing-renderer.png, and /tmp/archboard-closing-timings.json.

Acceptance criteria 1 through 4 are covered by the 39 focused resolver and code-evidence tests, including observed pane-session calls, public workspace entries, private-path refusal, containment, and manifest changes across historical revisions. The final live evidence retains the corrected caller counts. The resolver reads the supplied checkout snapshot and does not consult installed packages. Source-backed current-board corrections describe existing calls exposed by the repair. The internal analyzer correction changes no public architecture or binding model.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Resolved owner-local # imports and declared workspace exports from the selected checkout and revision. Real calls now contribute dependency evidence and prevent false unused-export findings. All 39 focused tests and the complete normal gate pass. The boards draw relevant resolved calls and retain documented utility omissions without suppressing findings.
<!-- SECTION:FINAL_SUMMARY:END -->
