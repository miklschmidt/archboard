---
id: TASK-530
title: Ship @archboard/codex-realtime-voice as a public MIT package
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
labels: []
dependencies: []
priority: high
type: feature
ordinal: 938000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants any developer to add a realtime Codex voice agent to a project. TASK-517 extracted packages/agent-workbench but left publication out: it has no README, is private and unbuilt, declares no dependencies, depends on BUSL workspace packages, hard-codes Archboard identity on the wire and in prompts, and exports 230 names while a host needs about 12. Archboard's host still assembles its internals. Decisions (owner, 2026-10-25): name @archboard/codex-realtime-voice, MIT, relicense and bundle the code it needs, a framework-agnostic browser client plus React hooks, npm-ready in this repository with the owner running the publish, Bun only for now.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An outside Bun project installs the packed tarball and runs a voice agent from the README quickstart with no Archboard code
- [ ] #2 The package and every bundled source are MIT, and the published manifest declares its dependencies and peers
- [ ] #3 Archboard and the example use only the public entries that an outside developer uses
- [ ] #4 No Archboard name reaches Codex, the browser or a prompt unless the host supplies it
<!-- AC:END -->
