---
id: TASK-302.02
title: The agent timeline carries the evidence a person monitors
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-23 03:20'
labels: []
dependencies: []
parent_task_id: TASK-302
priority: high
ordinal: 524000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The workbench cannot show what an agent is doing because the server projection throws the evidence away (codex-timeline-projection.ts, thread-projection.ts, browser-thread.ts): the person never sees their own prompt (userMessage is not projected), every command loses cwd, exit code, duration and output, file changes lose their paths, tool calls lose arguments, duration and error, turns lose their timing and error message, and turn/plan/updated and thread/tokenUsage/updated are decoded but never forwarded. The redesigned conversation panel renders prompts, work rows with evidence, a live plan and a context warning from these fields. Codex-shaped types derive from the generated contract so a Codex bump breaks type-check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The browser timeline carries the person's prompts as items in turn order, including steers, with their text
- [ ] #2 Command items carry cwd, exit code, duration and a bounded tail of the aggregated output with a truncation flag
- [ ] #3 File change items carry each changed path with its kind (add, delete, update with move path) and added and removed line counts, bounded in number
- [ ] #4 Tool call items carry the server or namespace, a bounded compact argument summary, duration and an error message when the call failed
- [ ] #5 Web search items carry their query; a context compaction appears as a marker item
- [ ] #6 Each turn carries its start and completion time in milliseconds, its duration and, when failed, the Codex error message
- [ ] #7 Each turn carries the latest plan Codex published for it (explanation and steps with status) while the server holds it
- [ ] #8 The timeline carries the thread token usage (total, last and model context window) when Codex has reported it
- [ ] #9 The snapshot stays within its byte budget with long outputs and many turns; owners cover projection, bounds and the delta wire
<!-- AC:END -->
