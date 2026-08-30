---
id: TASK-143.02.01
title: Define the private Codex realtime package contract
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
labels: []
dependencies: []
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - packages/codex-realtime
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 181000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a private workspace package at `packages/codex-realtime` with one browser-only export map and strict public lifecycle types. The package boundary serves Archboard's real voice consumer now; publication, compatibility promises, and a hypothetical second consumer remain out of scope while the repository is private.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The package root exposes opaque application thread-link context, injected realtime adapter commands, lifecycle events, state, and errors through one export map.
- [ ] #2 Public source has no Archboard, React, assistant-ui, Tailwind, generated-protocol, credential, Node, or server import and uses only browser APIs/types.
- [ ] #3 Its private package manifest, strict TypeScript config, lint/format inclusion, and consumer fixture work through the export map without adding publication tooling or committed derived artifacts.
<!-- AC:END -->
