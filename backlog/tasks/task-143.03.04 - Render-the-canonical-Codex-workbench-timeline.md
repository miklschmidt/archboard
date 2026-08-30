---
id: TASK-143.03.04
title: Render the canonical Codex workbench timeline
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.03.02
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-timeline
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 201000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Render the complete decoded Codex 0.151.0 ThreadItem union as bounded, escaped, accessible timeline content. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Exhaustive rendering covers userMessage, hookPrompt, agentMessage, functionCallOutput, plan, reasoning, commandExecution, fileChange, mcpToolCall, dynamicToolCall, collabAgentToolCall, subAgentActivity, webSearch, imageView, sleep, imageGeneration, enteredReviewMode, exitedReviewMode, and contextCompaction.
- [ ] #2 Large commands/output/reasoning/diffs/tool payloads are bounded with explicit expand/collapse; text/control characters are escaped and copyable without injecting markup or terminal control.
- [ ] #3 Links permit only reviewed safe URL schemes, local file/image payloads use typed fallbacks for missing/malformed/inaccessible data, and unsafe URLs/media render inert diagnostics.
- [ ] #4 Keyboard order, semantic headings/lists/statuses, live-region policy, screen-reader names, item identity, and expanded state survive timeline updates without focus loss or duplicate content.
<!-- AC:END -->
