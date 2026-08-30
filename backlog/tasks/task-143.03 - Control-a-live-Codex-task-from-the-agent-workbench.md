---
id: TASK-143.03
title: Control a live Codex task from the agent workbench
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 12:26'
labels: []
dependencies:
  - TASK-140.03
  - TASK-140.08
  - TASK-143.01
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the collapsible claim and progress workbench with explicit Codex task attachment and text control. Use assistant-ui ExternalStoreRuntime for conversation composition and a small reviewed set of shadcn/Base UI source for interaction behavior. Archboard owns the closed browser reducer, connection-scoped task binding, command adapter, reverse-request lease, and visual styling. Diff review remains deferred.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The focused pane can start a task for the current checkout or attach a task that the selected app-server proves is loaded and controllable by this connection. The task picker uses the session source-kinds policy, keeps a newly created appServer task visible after fresh listing or reconnect, shows loaded systemError, canAcceptDirectInput false or null, and rejoin refusal as disabled with the reported reason, and shows persisted notLoaded as disabled with ownership unknown. The first release never resumes or sends input to either unavailable class
- [ ] #2 The pane binding restores after browser reconnect for the same live canvas session without changing thread configuration, never persists into the board note, and never follows a newly active Desktop or app-server task without an explicit user action
- [ ] #3 Replacing a pane binding is refused while its task has an active turn, pending reverse request, or voice session; the workbench names the action needed to stop or resolve that state first
- [ ] #4 Composer submit, steer while active, stop, streamed assistant text, reasoning summary, command and tool progress, file-change status, completion, interruption, failure, and unknown item fallback reflect the canonical closed browser reducer
- [ ] #5 Only the browser lease owner renders browser-routed command and file approvals, tool user input, MCP elicitation, permissions approval, and legacy approval cards. A command approval is discriminated by kind as command or writeStdin and shows its reason, command, cwd, parsed actions, network host and protocol, additional filesystem and network permissions, and proposed exec or network policy amendments when present. A present availableDecisions array is authoritative in its given order, including an explicitly empty array which renders no reply controls and names that the server offered no action. When the field is omitted or null, the decoder reproduces the generated-protocol legacy set exactly: network context gives accept, acceptForSession, the first proposed allow-network amendment when present, then cancel; additional permissions gives accept then cancel; otherwise accept, the proposed exec amendment when present, then cancel. A fabricated, stale, or no-longer-available decision is rejected. Local-only and unsupported server requests never render. Every card names the requesting task and action, disables after one response or server resolution, and shows the exact method-policy terminal response after owner loss
- [ ] #6 Existing claim reason, doing history, and Take back control remain available and are visually distinct from Codex turn state so board ownership is not confused with task execution
- [ ] #7 Keyboard-only task selection, composer, disclosure, approval, stop, collapse, and focus return work with visible focus; streaming announcements are batched in a named log rather than spoken token by token
- [ ] #8 Rendered browser coverage proves empty, fresh-and-reconnected appServer listing, running, loaded-system-error, loaded-direct-input-false, loaded-direct-input-null, rejoin-refused, notLoaded-ownership-unknown, command approval, writeStdin approval, network target, additional permissions, proposed policy amendments, present ordered decisions, omitted decisions, null decisions, explicitly empty decisions, fabricated or stale decision refusal, owner-loss, failure, stopped, disconnected, reconnected, one-pane, two-pane, desktop, 420 pixel, light, dark, collapsed, and fullscreen states through the real application
- [ ] #9 The exact @assistant-ui/react version is pinned in package.json and bun.lock. A deterministic production module-graph inspection excludes the exact resolved assistant-ui package module IDs or import paths for AssistantTransport, assistant-cloud, assistant-ui syntax-highlighting, assistant-ui voice elements or runtime, and assistant-ui diff-review modules; it does not match generic voice words and explicitly permits Archboard internal realtime voice modules after TASK-143.04. This stable check runs in bun run check
<!-- AC:END -->
