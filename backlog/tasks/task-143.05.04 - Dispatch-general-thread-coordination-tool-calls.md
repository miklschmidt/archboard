---
id: TASK-143.05.04
title: Dispatch general thread-coordination tool calls
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.05.01
  - TASK-143.05.02
  - TASK-143.05.03
references:
  - docs/design/desktop-app-server-sharing-research.md
modified_files:
  - src/runtime/codex-dynamic-tools
parent_task_id: TASK-143.05
priority: high
type: task
ordinal: 187000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own item/tool/call validation, exact target-policy matrix, and dynamic-tool result construction for the six general coordination tools. Session, wait graph, broker, link, and catalogue remain separate ports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each call validates child, epoch, executing thread/turn/call, namespace, tool, manifest hash, and strict args; create/list have target N/A while target-bearing tools classify current/prior epoch, known/unknown provenance, loaded membership, controllability, self/other, and status notLoaded/idle/systemError/active independently.
- [ ] #2 Successful create/fork records the confirmed returned ThreadId in the current epoch manifest with instruction and manifest hashes; failed cleanup is inspect_only and a lost create/fork/send response is outcome_unknown without retry or recency inference.
- [ ] #3 List/read inspect without loading; fork/send/wait follow the complete checked matrix; create/fork/arbitrary send obtain fresh broker approval; self-fork alone binds server beforeTurnId and no caller override.
- [ ] #4 This module alone constructs general dynamic-tool responses, then TASK-143.01.06 writes them; cancellation before dispatch prevents mutation and after dispatch preserves delivered/not_delivered/outcome_unknown.
- [ ] #5 Real-process tests exercise every schema and matrix cell, approval verdict, cursor exhaustion, cycle, cancellation boundary, lost response, text-only result, cleanup, and two-home/prior-epoch refusal.
<!-- AC:END -->
