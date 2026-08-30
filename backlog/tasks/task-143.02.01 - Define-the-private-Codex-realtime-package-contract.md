---
id: TASK-143.02.01
title: Define the private Codex realtime package contract
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 15:48'
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
Define the complete private browser lifecycle API and package manifest in `packages/codex-realtime` before root registration or implementation. The package serves Archboard now; publication and hypothetical compatibility remain out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The public export fixes opaque host binding, injected start/offer/answer/append/stop adapter commands, media options, resource factories for tests, lifecycle phases, transcript events, level samples, and unsubscribe/dispose results as closed discriminated types.
- [ ] #2 The contract defines idempotency and legal outcomes for start, mute, unmute, stop, dispose, late events, same-binding restart, binding replacement, permission/device loss, and adapter/ICE/SDP/data-channel/audio failures.
- [ ] #3 Public source imports no Archboard, React, assistant-ui, Tailwind, generated protocol, credentials, Node, or server module and uses only browser APIs/types through one export map.
- [ ] #4 Contract and consumer fixtures prove exhaustive events/errors, opaque application context, no leaked WebRTC/media objects, and package use only after TASK-143.02.04 repository governance.
<!-- AC:END -->
