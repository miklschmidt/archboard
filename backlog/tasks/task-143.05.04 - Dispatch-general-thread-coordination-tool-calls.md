---
id: TASK-143.05.04
title: Dispatch general thread-coordination tool calls
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 17:03'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.05.01
  - TASK-143.05.02
  - TASK-143.05.03
references:
  - docs/design/desktop-app-server-sharing-research.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-dynamic-tools
parent_task_id: TASK-143.05
priority: high
type: task
ordinal: 187000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own item/tool/call validation, exact target/transaction policy, and response construction for the six general tools. Session, wait graph, broker, link, and catalogue remain separate ports. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Calls validate full logical identity/manifest and the target matrix across current/prior epoch, provenance, loaded membership, controllability, self/other, and notLoaded/idle/systemError/active; create/list have target N/A.
- [ ] #2 create_thread is confirmed thread/start then turn/start; no title is accepted. fork_thread is thread/fork then turn/start only when prompt is present. send_message_to_thread is turn/start for idle targets and refuses active targets. Every RPC boundary has exact confirmed/partial/outcome_unknown compensation semantics with no retry.
- [ ] #3 wait_threads attention means a target-owned pending broker request or systemError; completion means matching terminal turn/thread events. Tool list/read preserve pages and return child/epoch/query-bound cursors, while authority reads use the session's exhaustive ports.
- [ ] #4 Successful create/fork records confirmed identity and hashes; cleanup failure remains inspect_only. This module constructs general tool responses; transport writes each once.
- [ ] #5 Co-located fake-port tests cover every schema/matrix/transaction/page/attention/cancellation/cycle/uncertainty cell; TASK-143.01.15 owns composed real-process coverage.
<!-- AC:END -->
