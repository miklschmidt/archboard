---
id: TASK-143.01.20
title: Issue canonical workbench operation identities
status: To Do
assignee: []
created_date: '2026-08-31 14:25'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.01.19
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/shared/codex-workbench-identity
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 256000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add one shared branded host-owned OperationId domain for every Archboard workbench mutation correlation. The identity authority mints, validates, parses, and serializes it without borrowing browser-command, JSON-RPC, dynamic-call, approval, thread, or turn domains. TASK-143.01.11, TASK-143.05.04, and TASK-143.07.03 consume this single authority instead of minting strings. Delegation profile: gpt-5.6-luna, xhigh.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 OperationId is a distinct opaque branded identity with one host issuer and exact parser and serializer; callers cannot adopt server strings, cast another identity domain, or mint through a second module.
- [ ] #2 Minted operation IDs satisfy the durable epoch token and authored context/result bounds, remain unique within the owned child session, serialize deterministically, and reject empty, malformed, wrong-domain, unissued, or stale values.
- [ ] #3 The public capability split preserves validator, issuer, and trusted decoder authority: ordinary consumers receive only the narrow operation-ID capabilities they need, and server-owned identity adoption remains unavailable.
- [ ] #4 Runtime and compile fixtures prove operation IDs round-trip, cannot interchange with every existing identity domain, cannot be caller-fabricated, and provide the exact reusable type consumed by workhorse start, general dynamic tools, and coordinator workhorse operations.
<!-- AC:END -->
