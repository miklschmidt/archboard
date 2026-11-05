---
id: TASK-579.03
title: A release server names its version, and restart builds nothing
status: Done
assignee:
  - '@claude'
created_date: '2026-11-05T14:58:00Z'
updated_date: '2026-11-05T15:45:00Z'
labels: []
dependencies:
  - TASK-579.01
references:
  - packages/server-lifecycle/src/runtime/services/staleness.ts
  - packages/server-lifecycle/src/runtime/operations/restart.ts
  - apps/cli/src/cli/operations/server/status.ts
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: task
ordinal: 1024000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A release never changes on disk except by an install, and npm normalizes file times, so the module-time staleness check says nothing after an upgrade. ADR 0075 decides a warning that names `archboard restart`, not a refusal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `/health` reports the version and the mode
- [x] #2 When the running server version differs from the installed one, `archboard status` and other commands warn on stderr and name `archboard restart`; commands still work
- [x] #3 In release mode `archboard restart` stops and starts the server and runs no build
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. /health reports version and mode from installation(). 2. The CLI transport warns once on stderr when a release server runs another version, names archboard restart, and does not refuse (release vs release is compared by version, not location). 3. restart in release mode builds nothing. 4. status shows version and mode. Tests: release-version rule, restart no-build, /health system assertion.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: the warning lives in the CLI transport identity probe (server-client-transport.ts) so every command, including status, warns once on stderr; release vs release skips the OtherSourceError location check and compares versions (an upgraded release can move). restart silences the warning for itself. Release restart: bundleToServe('release') reads the bundle and spawns no build. status also reports version and mode. Evidence: packages/server-lifecycle/tests/runtime/rules/release-version.test.ts, tests/runtime/operations/restart.test.ts, tests/system/server-state/staleness-source.test.ts (/health version+mode). By hand: a copy of bun beside an archboard-release.json acted as a release; against a stand-in /health of version 0.0.1 'archboard status' printed the warning naming archboard restart on stderr and exited 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
/health and `archboard status` report version and mode. In a release, a command that meets a release server of another version warns once on stderr and names `archboard restart` (rule in server-lifecycle rules/release-version.ts, check in server-client-transport.ts); two releases compare by version, so an upgrade in a new path warns instead of refusing as another source. A release restart builds nothing. Checkout mode keeps the source-time check. Verified after merge: server-lifecycle tests 30 pass (restart.test.ts spies Bun.spawn for a release; release-version.test.ts), workspace tests 50 pass; the implementer ran test:system 234 pass and test:repository 163 pass.
<!-- SECTION:FINAL_SUMMARY:END -->
