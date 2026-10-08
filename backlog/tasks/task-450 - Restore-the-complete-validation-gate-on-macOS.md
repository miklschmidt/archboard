---
id: TASK-450
title: Restore the complete validation gate on macOS
status: Done
assignee:
  - '@codex'
created_date: '2026-10-08 11:54'
updated_date: '2026-10-08 12:26'
labels: []
dependencies: []
references:
  - TESTING.md
  - docs/agents/test-suite.md
type: bug
ordinal: 733000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Chromium sandbox task exposed failures in the normal module, system, and browser lanes. The user requests that every failure be fixed rather than documented as a limit. Focused runs reproduce filename casing, code reference, missing vault, Codex shutdown, and shell geometry failures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every normal module test passes with isolated fixture state and no dependence on the user Git signing configuration or vault.
- [x] #2 The shutdown process contract proves pending responses settle before child teardown for SIGINT and SIGTERM.
- [x] #3 Every normal browser owner passes through the serial adapter, including the shell geometry matrix.
- [x] #4 The complete bun run check gate passes without weaker assertions, ignored files, disabled rules, or reduced coverage.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Use the failing focused owners as the diagnosis loop, then correct fixture assumptions about filesystem casing, Git signing, and the mandatory vault. Preserve the behavior and assertions each owner protects.
2. Correct the process fixture so graceful shutdown signals the server leader first. Keep forced group cleanup for a server that does not settle. Prove all request classes answer before child teardown.
3. Compare shell matrix measurements and fix the cause of geometry differences. Run the full serial browser inventory and repair every later failure it exposes.
4. Run the complete bun run check gate with the installed agent-browser executable and approved execution for Chromium. Keep every configured rule and normal test owner. Commit tested slices and closing evidence.
No board is affected by the initial fixture repairs. They change test setup and test process control, not the product architecture. Any product repair will be assessed against the vault before implementation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Focused repairs pass: board identity collisions use distinct filenames on case-insensitive disks, and case-only rename assertions inspect directory spelling. Git fixtures exclude user signing configuration and reject failed commands. Production fixtures supply an owned vault before module imports and a temporary account home at the operating-system boundary because Bun captures the native home at startup. Graceful signal tests target the server first so it can settle pending Codex responses. The shell matrix waits for transient activity to expire and retains every geometry assertion. No product architecture changed.

Checkpoint 62c9fe2c passes focused failures, lint, and both TypeScript projects. The vault check reports zero diagnostics. The code check retains its existing rasterizer anchor warning and interface information. The Archboard server, Board persistence, and Command interface boards remain accurate: this commit changes only tests within their bound directories, not their responsibilities or relationships. No proposal or README asset refresh is required.

The first complete run passed 4432 module tests, 197 system tests, and 24 repository tests. Its browser lane uncovered an uncontrolled initial theme in status legibility and drawn-picture owners: Chrome inherited macOS dark mode. Both owners now choose light mode through the existing shell control before measuring the dark transition. The drawn-picture owner also waits for the entrance animation to finish before retaining SVG identity. Original color, cache, and SVG identity assertions remain intact. Focused owners now pass, and the full browser inventory is running.

The full browser run also found a nonexistent agent-browser a11y command. The opener owner now injects pinned axe-core 4.14.0 and runs every default rule on the same dialog. It requires a real violations array rather than treating a missing result as success. The native role and label finders cannot resolve the button-backed custom radio, although Chromium exposes it correctly. The owner now clicks its live accessibility-tree reference. The repaired opener passes all 148 assertions, and the text workbench passes all 38 assertions. No audit rule or behavioral assertion was disabled.

Final gate on committed code: bun run check exited 0. Lint, formatting, both TypeScript projects, and the frontend build passed. Tests: 4432 module, 197 system, 24 repository, and 24 browser cases across all 19 normal browser owners. Total: 4677 passed, zero failed. Evidence: /private/tmp/archboard-task-450-final-check.log. No rules, assertions, discovery paths, or normal owners were weakened or excluded. Pre-push review pinned c660a3f7...8752e909: Chromium, fixture/lifecycle, browser/audit, Chromium/environment boundary, and fixture/browser boundary reviewers each report zero open Standards findings and zero open Spec findings. Reviewers needed no repair commits. Reviewed native sandbox ABI and caller error routing, filesystem and Git isolation, mock restoration, shutdown ordering, browser inventory, theme/animation observations, and all default accessibility audit rules. Origin remains at c660a3f7 after fetch.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Repair the failing macOS fixtures, signal ordering, and browser observations. The complete bun run check gate passes all 4677 tests with zero failures. Every normal browser owner runs, and the dialog uses a real pinned accessibility audit. Standards and specification reviews pass with no open findings. Code commits: 62c9fe2c and 8752e909.
<!-- SECTION:FINAL_SUMMARY:END -->
