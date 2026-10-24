---
id: TASK-518
title: Restore Chromium prerequisites for the browser gate
status: Done
assignee:
  - '@codex'
created_date: '2026-10-24 12:15'
updated_date: '2026-10-24 12:47'
labels: []
dependencies: []
references:
  - tests/system/browser/shell-layout.test.ts
priority: high
type: bug
ordinal: 929000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TASK-517.01 browser gate and focused shell owner fail before opening the page. Temporary failure-chain diagnostics show that Chromium exits 127 because libgbm.so.1 is missing. Browser cleanup raises SuppressedError and hides the original launch error. The reported Settings line is not evidence of a dialog defect. This repair restores the test environment and preserves all product behavior and browser assertions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The configured Chromium executable starts successfully with all required shared libraries.
- [x] #2 The existing shell-layout owner runs with its original keyboard and focus assertions and no temporary diagnostics.
- [x] #3 The browser inventory and complete normal gate pass without timeout or lint rule changes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected. This is a local test environment prerequisite.
1. Capture the suppressed launch error and identify missing Chromium libraries.
2. Use an existing working Chromium installation or restore the required local browser dependencies.
3. Remove temporary diagnostics and keep the original shell-layout owner unchanged.
4. Run the full browser inventory and the complete normal gate.
5. Record the environment repair and exact evidence in Backlog. Commit related task records with Refs: TASK-518.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The failure chain names Chromium exit 127 and libgbm.so.1 missing. Both agent-browser open and cleanup close fail for this same prerequisite. No Settings dialog behavior ran. Temporary diagnostics were removed and the original shell-layout file restored.

This machine is NixOS. A Playwright cache executable lacks its shared-library closure. Existing system Chromium is available at /run/current-system/sw/bin/chromium, so no installation is needed. Validation will use the installed wrapper for both browser executable variables.

All 19 canonical browser owners passed with exit 0 using /run/current-system/sw/bin/chromium for both browser variables. The shell owner passed its original Settings assertions. No product or test change was required. Evidence: /tmp/task518-browser-inventory.log and /tmp/task518-browser-inventory.exit. The complete gate awaits the renderer timing repair.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Selected the installed system Chromium wrapper for browser validation. The prior Playwright cache binary lacked NixOS libraries. No product or test changes were needed. All 19 browser owners passed, and the complete gate exited 0 at 3af12506e. Evidence: /tmp/task518-browser-inventory.log and /tmp/task517.01-check-repaired.log.
<!-- SECTION:FINAL_SUMMARY:END -->
