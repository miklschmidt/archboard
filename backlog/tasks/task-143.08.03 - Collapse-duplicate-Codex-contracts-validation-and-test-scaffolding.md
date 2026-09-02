---
id: TASK-143.08.03
title: 'Collapse duplicate Codex contracts, validation, and test scaffolding'
status: To Do
assignee: []
created_date: '2026-09-02 01:36'
labels: []
dependencies:
  - TASK-143.08.02
references:
  - docs/agents/boundaries.md
  - src/runtime/codex-protocol
  - src/shared/codex-browser-model
  - src/ui/workbench-runtime/tests
  - tests/system/repository-policy
parent_task_id: TASK-143.08
priority: high
type: task
ordinal: 261000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deepen the recovered Codex protocol and browser modules after generated types become authoritative. Remove parallel literal sets, schemas, validation passes, hashes, identity records, error shells, and tests that restate tools, documentation, or each other. Preserve the genuinely useful transport, epoch, gateway recovery, approval broker, thread-link classifier, realtime adapter, media-session, and browser-lane behavior. Centralize only semantically identical code; do not create generic core, utils, misc, migration, or compatibility buckets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ThreadStatus, TurnStatus, approval decisions, server-request methods, turn/start, turn/steer, thread/fork, thread/inject_items, queue params, call identity, and effect hashing each have one authoritative owner derived from TASK-143.08.02.
- [ ] #2 One app-server ingress validation and one browser ingress validation protect untrusted data; sequenced deltas validate changed fields only, and the browser does not reparse the complete merged snapshot after each delta.
- [ ] #3 Before deleting tests, a retained-owner matrix maps each reachable success, progress, empty, partial, failure, and recovery behavior to one module, process, or browser owner. Duplicate reload, shutdown, exit-race, approval, remediation, state-matrix, and submission-fencing cases are removed or folded into that owner.
- [ ] #4 The Tailwind, Oxfmt, TypeScript-alias, Oxlint-alias, and authored-contract scaffolding that tests tool resolution, fixture cleanup, or copied prose is removed. The real Vite production build, frontend style entry, normal formatter and linter commands, opener browser workflow, module boundaries, and one stable ownership check remain.
- [ ] #5 Only identical call identity, effect hash, error construction, child/session fake, socket fake, or deep-freeze behavior is shared. Differently constrained isRecord, boundedText, and lifecycle helpers stay local unless the deletion test proves one module owns the same semantics.
- [ ] #6 The resulting production and test tree has fewer concepts, validation passes, cases, and lines than ba1aacee, with focused and broad checks proving retained behavior and no weakened rule, timeout, assertion, or browser gate.
<!-- AC:END -->
