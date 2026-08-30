---
id: TASK-143.03
title: Control a live Codex task from the agent workbench
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 14:18'
labels: []
dependencies:
  - TASK-140.03
  - TASK-140.08
  - TASK-143.01
  - TASK-143.07
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the collapsible claim and progress workbench with explicit Codex workhorse attachment, linked coordinator disclosure, text control, queue and approval state, and global coordinator settings through the dedicated child. Use assistant-ui ExternalStoreRuntime plus a reviewed Tailwind 4 shadcn/Base UI source subset. Archboard owns the closed reducer, workhorse and coordinator links, command adapter, browser lease, dynamic and spoken approval presentation, and reference-mockup-derived styling. Diff review remains deferred.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The focused pane can start a workhorse for the current checkout or attach one that the dedicated child proves loaded and controllable. Fresh and same-child-reconnected Archboard tasks stay visible; loaded systemError, direct-input false or null, rejoin refusal, and persisted notLoaded ownership unknown appear disabled with exact reasons and never receive input
- [ ] #2 The thread link and its optional persistent coordinator restore after browser reconnect only while the same child and canvas session remain alive, never persist into the board note, and never follow another active task implicitly. Child exit invalidates both. The workhorse stays primary; a linked disclosure exposes coordinator identity, model, service tier, transcript, state, intervention policy, and cross-links
- [ ] #3 Global workbench settings select coordinator model, supported effort, and workhorse-intervention policy with defaults gpt-5.6-luna, medium, and Explicit corrections. The policy also offers Coordinator judgment and Never steer. Validation, priority request and standard fallback, effective values, and future-decision-only application are visible and keyboard operable
- [ ] #4 Replacing a thread link is refused while its workhorse has an active turn, pending reverse request, queued coordinator delegation, pending dynamic-tool or spoken approval, or voice session; the workbench names the action needed to resolve it first
- [ ] #5 Composer submit, steer, stop, streamed text, reasoning summary, command, dynamic and ordinary tool progress, queue state, file-change status, completion, interruption, failure, callback, and unknown item fallback reflect the canonical closed browser reducer
- [ ] #6 Only the browser lease owner renders command and file approvals, tool user input, MCP elicitation, permissions, and legacy approval cards. Command cards show every generated reason, action, cwd, network, permission, amendment, and offered decision; present decision arrays are authoritative, omitted or null fields use the exact generated legacy set, fabricated or stale decisions fail, and every card disables after one response or resolution
- [ ] #7 Archboard general dynamic-tool approvals, bound coordinator operations, and spoken approval eligibility are distinct visible states. General create, fork, and arbitrary send require the reviewed card; coordinator delegation and exact callback routes follow TASK-143.07. A spoken-eligible request shows that coordinator model classification is the security boundary, the exact request just described, and that only one-time accept or decline is available
- [ ] #8 Existing claim reason, doing history, and Take back control remain available and visually distinct from workhorse turn, coordinator, queue, and voice state so board ownership is not confused with task execution
- [ ] #9 Keyboard-only task and coordinator disclosure, global settings, composer, queue controls, approvals, stop, collapse, and focus return work with visible focus. Streaming and callback announcements are batched in named logs rather than spoken token by token
- [ ] #10 Rendered browser coverage proves empty, fresh, reconnected, all unavailable states, workhorse running, coordinator linked and invalidated, all intervention settings, priority and fallback, queue add/update/cancel/reorder, server and dynamic approvals, spoken eligibility, owner loss, failure, stopped, disconnected, one and two panes, desktop, 420 pixel, light, dark, collapsed, and fullscreen through the real application
- [ ] #11 The exact @assistant-ui/react version is pinned. Production module-graph inspection excludes AssistantTransport, assistant-cloud, assistant-ui syntax-highlighting, assistant-ui voice elements or runtime, and assistant-ui diff-review modules while permitting Archboard internal realtime modules; the stable check runs in bun run check
<!-- AC:END -->
