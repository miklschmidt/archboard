---
id: TASK-530.04
title: Codex tool namespaces and record prefixes are host identity
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T02:24:00Z'
labels: []
dependencies: []
parent_task_id: TASK-530
type: task
ordinal: 950000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-530.01 made the service name and thread source host options, but the coordinator tool namespaces (archboard_workhorse, archboard_voice, archboard_coordinator), the coordinator tool description that says users talk with Archboard by voice, the spoken-approval classifier prompt naming archboard_voice, and the archboard: record prefix (WIRE_PREFIX in codex-app-server) and the app-server client name are still hard-coded. Manifests and digests are module-level constants registered by installDynamicRegistrations, and about ten call sites compare literal names.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An outside host's Codex threads, prompts and stored records carry no Archboard name unless the host supplies it
- [ ] #2 Archboard passes its existing names and its thread profiles, manifest digests and stored records stay byte-identical
- [ ] #3 Incoming tool calls are matched by role, not by a literal Archboard name
<!-- AC:END -->
