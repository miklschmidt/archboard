---
id: TASK-143.01.17
title: Freeze authored Codex instructions and dynamic-tool manifests
status: To Do
assignee: []
created_date: '2026-08-30 16:25'
updated_date: '2026-08-30 17:27'
labels: []
dependencies:
  - TASK-143.01.03
references:
  - docs/design/codex-workbench-authored-contracts.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - docs/design/codex-workbench-authored-contracts.md
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 247000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the human-reviewed, byte-exact source contract for capabilities, login policy, thread profiles, workhorse/coordinator instructions, additionalContext, realtime handoff, spoken classifier input, and all dynamic-tool catalogues. Luna workers may load/hash/validate/dispatch; they may not author or reinterpret these bytes. Delegation profile: gpt-5.6-sol, xhigh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The document freezes literal InitializeCapabilities, all-six login policy plus refused Bedrock setup, top-level source set, workhorse/coordinator ThreadStartParams profiles, exact settings field mapping, session port list, twelve timing values, role instructions, separator, additionalContext, and realtime start choices/default voice.
- [ ] #2 Literal eager namespace manifests freeze ordered tools/descriptions/strict schemas/limits/results/refusals/approval mapping, exact target-state table, and create/fork/send/list/read/wait RPC bodies, pages, projections, and partial outcomes.
- [ ] #3 The document distinguishes UserInput turn/start and turn/steer bodies from developer-role thread/inject_items, and freezes complete TurnStartParams, TurnSteerParams, and ThreadForkParams included fields and omissions.
- [ ] #4 resolve_spoken_approval arms only from one matching final user item after the effect prompt; exact classifier bytes and child/thread/turn/call/manifest/session/item/sequence/effect/expiry validation supply the sole approval identity.
<!-- AC:END -->
