---
id: TASK-143.01.17
title: Freeze authored Codex instructions and dynamic-tool manifests
status: To Do
assignee: []
created_date: '2026-08-30 16:25'
updated_date: '2026-08-30 16:58'
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
- [ ] #1 The document freezes literal InitializeCapabilities, all-six login support/refusal policy, workhorse/coordinator ThreadStartParams profiles and omissions, coordinator settings update/notification, role instructions, separator, additionalContext, and realtime start choices.
- [ ] #2 Literal eager namespace manifests freeze ordered tools/descriptions/strict schemas/limits/results/refusals/approval mapping and the exact create/fork/send/wait multi-RPC/page semantics.
- [ ] #3 resolve_spoken_approval accepts only verdict accept|decline. The gate arms only from one matching final user item after the effect prompt, bound to immutable child/thread/realtime-session/item/sequence; assistant output can never arm it.
- [ ] #4 The exact later ordinary coordinator classifier input bytes are frozen, and host validation supplies the sole approval identity only after child/thread/turn/call/manifest/session/item/sequence/effect/expiry checks.
<!-- AC:END -->
