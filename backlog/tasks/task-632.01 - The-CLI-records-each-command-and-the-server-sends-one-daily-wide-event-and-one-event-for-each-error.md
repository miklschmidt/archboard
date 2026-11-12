---
id: TASK-632.01
title: >-
  The CLI records each command, and the server sends one daily wide event and
  one event for each error
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-12T23:14:00Z'
updated_date: '2026-11-12T23:37:00Z'
labels: []
dependencies: []
parent_task_id: TASK-632
priority: medium
type: feature
ordinal: 1075000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
This is the base that the other subtasks add records to. The CLI runs under agents, often many times a minute, so it must never wait on the network: it writes local records, and the long-running server sends them. One event for each command would pass the free PostHog quota as usage grows, so the server rolls a day of records into one wide event for each installation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each CLI command writes one local record: the command, its exit code, its duration, the calling agent and whether Archboard's own workbench ran it. The CLI makes no network call for telemetry
- [ ] #2 The server sends one wide event for each installation and finished UTC day, with counts by command, agent and exit code, and whether two agents worked within the same half hour
- [ ] #3 An unexpected CLI or server error sends one wide event within minutes, with its context and the stack frames of Archboard's own code, but no message text and no path outside Archboard
- [ ] #4 No event holds a module, file, repository or model name, a path, a prompt or an error message
- [ ] #5 Nothing is recorded or sent when CI is detected, when DO_NOT_TRACK or ARCHBOARD_TELEMETRY=0 is set, or after archboard telemetry off; archboard telemetry status says which applies
- [ ] #6 The first command after install prints a one-time notice to stderr that names what is sent and how to turn it off
- [ ] #7 A failed or slow send never changes a command's result or the server's behavior, and unsent records stop after seven days
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Proposal: state e3T8Mjgq (Anonymous usage as wide events), predecessor TGDLt5Ea, model vKEsyHFk, vault .archboard/vault. It adds the telemetry package (vKEsyHFk#EbMc8PH2 or a sibling id in the receipt), the external PostHog EU Cloud, and their relationship.
1. ADR 0079 records the decision.
2. packages/telemetry (layer 3, over workspace): consent rules from env, std-env and settings; the state files (settings.json with the installation id, days/<date>.jsonl, errors/<id>.json); record and error writers; the daily rollup; the sender that claims files by rename and posts each event to eu.i.posthog.com/i/v0/e/ with a five-second timeout.
3. The CLI writes one command record in runCliWith, an error record for exit code 1, prints the one-time notice, and gains archboard telemetry on|off|status.
4. The server starts the sender in its lifetime and records unhandled route errors.
5. The workbench passes the telemetry directory and a workbench marker to its Codex child, because the Codex environment is an allowlist.
6. The test preload sets ARCHBOARD_TELEMETRY=0. INSTALL.md and PRODUCT.md say what is sent and how to turn it off.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-13: implemented. packages/telemetry (layer 3) holds the consent rules, the record files, the daily rollup and the sender. The CLI records each command in runCliWith and an error report for exit code 1, prints the notice once, and gains archboard telemetry [on|off|status]. The server starts the sender in its lifetime (telemetry-sender) and records unhandled route errors. The workbench gives its Codex child ARCHBOARD_TELEMETRY_DIR and ARCHBOARD_TELEMETRY_RUNNER=workbench, or ARCHBOARD_TELEMETRY=0 when usage is off, because the Codex environment is an allowlist that drops XDG_STATE_HOME. The test preload sets ARCHBOARD_TELEMETRY=0. std-env 4.3.0 is a root dependency. The timing ceiling rose from 37 to 38 for TELEMETRY_MS, a new owner group.
Proposal e3T8Mjgq also has the Telemetry command part under Commands and relationships from runCliWith, Telemetry command, Service routes, Application lifetime and Application policy to telemetry, and from telemetry to State directory, Atomic file replacement and Installation. archboard check --state e3T8Mjgq: no errors or warnings, and no information finding names telemetry. Current keeps one information finding (the CLI and server reach Packages) until adoption.
Checks: lint:policy clean; tsc clean for changed files (the worktree has no core build, so the renderer's generated imports fail as on main); bun test packages/telemetry 12 pass; apps/cli 118 pass; apps/server with workbench server tests 79 pass; tests/system/repository-policy pass.
Open: no event was sent to the real PostHog project. The owner can start a server from this branch, run a command, then look for a $exception or, the next UTC day, a daily usage event with surface=product.
<!-- SECTION:NOTES:END -->
