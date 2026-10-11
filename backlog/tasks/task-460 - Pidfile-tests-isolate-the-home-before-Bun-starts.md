---
id: TASK-460
title: Pidfile tests isolate the home before Bun starts
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-11 15:53'
updated_date: '2026-10-11 16:00'
labels: []
dependencies: []
type: bug
ordinal: 807000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The merged TASK-325 pidfile owner fails four cases on macOS. Its fixture changes HOME after Bun starts, but homedir still resolves the operator home. The owner can reach real server pidfiles instead of its temporary state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 All four original pidfile behaviors pass with state confined to a temporary root on macOS and Linux.
- [ ] #2 The fixture refuses an unisolated state path before any write or sweep.
- [ ] #3 The complete normal gate passes with every existing assertion and timeout contract retained.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No board is affected because this repair changes only the test fixture. Supply the temporary home before starting the process that exercises pidfile behavior. Keep all four original cases and assertions. Refuse any resolved state directory outside that root. Run the focused owner, review the repair, and run the complete gate.

Run the repaired pidfile owner in the macOS native CI job, as well as the complete Linux gate, to retain coverage of startup home isolation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Review fixed two fixture contracts: the parent now requires a machine-readable completion receipt from the selected original body, so a zero-test runner success cannot pass; and the child captures its dedicated process group before spawning descendants, so parent cleanup reaps a sleep left by a timed-out runner. The five-second child execution bound remains. Group cleanup has a separate five-second bound within the unchanged fifteen-second preloaded normal case timeout. Focused owner passes all four registrations, and full type checking and configured test lint pass.

Boundary review keeps the fixture cleanup poll independent of product timing (TASK-154). The module owner uses its own 10 ms test cadence because importing tests/system support would cross the configured test-owner boundary. Both ownership and duration-independence rules remain enabled.
<!-- SECTION:NOTES:END -->
