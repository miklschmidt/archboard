---
id: TASK-450
title: Restore the complete validation gate on macOS
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-08 11:54'
updated_date: '2026-10-08 12:00'
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
- [ ] #1 Every normal module test passes with isolated fixture state and no dependence on the user Git signing configuration or vault.
- [ ] #2 The shutdown process contract proves pending responses settle before child teardown for SIGINT and SIGTERM.
- [ ] #3 Every normal browser owner passes through the serial adapter, including the shell geometry matrix.
- [ ] #4 The complete bun run check gate passes without weaker assertions, ignored files, disabled rules, or reduced coverage.
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
<!-- SECTION:NOTES:END -->
