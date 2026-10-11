---
id: TASK-453
title: Make agent validation reproducible and record session completion rules
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-11 14:22'
updated_date: '2026-10-11 16:27'
labels: []
dependencies: []
references:
  - docs/design/2026-10-08-session-retrospective.md
type: enhancement
ordinal: 734000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The October 8 session relied on an external browser CLI, retried invalid skill paths, and closed with test failures until the user corrected its scope. Implement the authorized retrospective proposals for pinned tooling, macOS regression coverage, useful progress evidence, and agent guidance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The browser lane resolves a pinned repository-owned CLI and reports actionable prerequisite diagnostics without another project or ambient wrapper.
- [x] #2 Hosted macOS coverage includes the sandbox startup regression and repaired platform-specific fixtures.
- [x] #3 Guidance limits skills/ to shippable repository-authored Archboard skills and records the requirement to repair reproducible normal-gate failures before closing.
- [x] #4 Authored repository navigation links resolve, and long test runs expose compact progress without reducing coverage or hiding failures.
- [x] #5 The complete local gate and scoped standards/specification reviews pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pin the previously exercised agent-browser 0.31.1 in this checkout, resolve its executable explicitly, and improve bounded prerequisite diagnostics.
2. Extend the existing macOS job with the startup regression and repaired platform fixtures.
3. Correct skill ownership pointers, add normal-gate completion and bounded-reading guidance to archboard-dev, and extend existing navigation link validation.
4. Emit compact structured browser-lane progress while retaining ordinary output, serial execution, cleanup, and exit status.
5. Run focused owners, the complete local gate, and parallel scoped standards/specification reviews.
No board is affected: these changes alter developer test tooling, CI selection, and agent documentation, not the product modules or relationships that the vault draws.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented pinned agent-browser 0.31.1 native resolution, prerequisite diagnostics, macOS owner selection, navigation links, completion guidance, and structured progress. Six scoped Standards/Spec reviews fixed findings in commits b9fe728c, fd7e800a, db5dfa80, 38129d13, bdab5a5f, and 5fe44e5a. Complete local gate: 4678 passing tests, zero failures, all 19 browser owners completed cleanup audits, final exit 0. Final lint, formatting, types, and 7 focused tests pass. Linux opener: 1 pass, 24 assertions. Linux tooling: 5 pass, 15 assertions. Dogfood structural check passes; code check reports the existing unrelated drawRequest anchor warning. No task commits changed bound product parts. Hosted macOS execution remains pending explicit approval to publish the reviewed branch.

Hosted macOS job 114495510604 passes in run 38148069388 at c80c70d6. It executes the selected startup regression and platform owners. The user approved branch publication and draft PR #1. The Linux complete gate remains running.

The second hosted run 38150616626 passes the wide-board case and macOS job, but its board-flight recorder fails with a missing SVG. The exact local flight owner passes with all 54 assertions, and all ten remaining browser owners pass. Later local runs reproduce a drained-stdin shutdown race and vendor macOS keyboard event storm. TASK-456 and TASK-457 record their separate repairs. Complete final gates remain pending.

Main integration creates duplicate IDs for two independent task records. The supported backlog doctor repair moves the imported cross-process lock task to TASK-458 and git-opener watchdog task to TASK-459. Their original content remains unchanged. The reported TASK-454 proposal reference belongs to the independent TASK-454 wide-layout repair and remains correct. Main branch records remain untouched. The previous final gate stops before completion because integration changes its source snapshot; a fresh integrated gate is required.

The integrated README assessment reports the same 16 stale assets and zero manifest problems as origin/main at 68e7f0e. An isolated archive comparison proves that none becomes newly stale on this branch. The measured layout scheduling repair preserves drawing bytes in its before/after probe; the task changes no README demonstration.

The integrated gate passes 4746 tests and all 19 cleanup audits. A later unchanged gate fails because Bun 1.4.2 traps before loading the renaming fixture server, at zero milliseconds and 3.78 MB RSS. The exact renaming owner then passes 2 tests and 24 assertions. Both Bun versions pass repeated startup probes. Remaining repository and browser lanes pass, including all 19 cleanup audits. The full gate is rerunning without code, assertion, or timeout changes.

An earlier macOS checkout setup times out in git remote add. The native test command passes locally with the hosted Bun 1.4.0: 138 tests and 711 assertions. The earlier hosted run's 18 fixture setup failures have no established cause. The fresh hosted macOS job passes all 138 tests. Hosted Linux rerun evidence remains pending.

The user reports repeated desktop Chrome default-browser prompts and directs this session to use Chrome for Testing. Local setup selected the installed Chrome for Testing 150.0.7871.24. The ignored checkout .env names its absolute executable path in both AGENT_BROWSER_EXECUTABLE_PATH and ARCHBOARD_RENDERER_CHROMIUM. Both resolver calls return that testing executable. No test browser remains running.

The macOS guidance requires both selections before every local lane or gate. Machine-specific paths stay in ignored configuration. No test or timing contract changes. The TASK-461 timing proposal remains unapplied.
<!-- SECTION:NOTES:END -->
