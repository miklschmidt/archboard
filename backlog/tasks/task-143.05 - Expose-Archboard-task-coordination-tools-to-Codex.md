---
id: TASK-143.05
title: Expose Archboard task coordination tools to Codex
status: To Do
assignee: []
created_date: '2026-08-30 13:07'
labels: []
dependencies:
  - TASK-143.01
references:
  - docs/design/desktop-app-server-sharing-research.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Give the Codex agent running inside Archboard its own small, typed task-coordination tool catalogue. An Archboard-authored `archboard_app` MCP adapter forwards tool discovery, calls, cancellation, and calling-thread metadata to the workbench runtime, which delegates task state and lifecycle operations to the dedicated Archboard-owned app-server. This is an internal coordination interface, not a return to exposing canvas operations over MCP, and it does not import or execute the proprietary Desktop `codex-app-tools` bundle.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The dedicated app-server starts with one `mcp_servers.archboard_app` configuration whose executable, arguments, working directory, inherited environment, startup timeout, tool timeout, eager availability, and per-tool approval modes come from one typed manifest; startup fails with an actionable error when the MCP adapter cannot become ready
- [ ] #2 The MCP catalogue contains exactly `create_thread`, `fork_thread`, `list_threads`, `read_thread`, `send_message_to_thread`, `wait_threads`, `set_thread_title`, and `set_thread_archived`; no Desktop navigation, sidebar, handoff, sharing, usage-reset, automation, workspace-dependency, browser, or voice-device tool is exposed
- [ ] #3 List, read, wait, and title calls use the configured default approval mode; create, fork, send, and archive require explicit approval. The server remains small enough to stay out of deferred tool discovery, and a generated or deterministic configuration check enforces those policies
- [ ] #4 Every call requires executor-supplied calling thread, turn, and tool-call identity, preserves cancellation, accepts only the registered tool namespace and schema, and returns typed text, image, or audio MCP content without trusting caller-supplied routing metadata
- [ ] #5 Task operations delegate to the typed workbench session and documented app-server thread, turn, metadata, and event methods; the MCP layer owns no thread store, app-server process, project registry, worktree policy, or second lifecycle state machine
- [ ] #6 `send_message_to_thread` and `wait_threads` reject a target that would wait on or re-enter the currently executing tool turn. Errors name the blocked task and the safe caller action; cancellation releases every pending wait and host request
- [ ] #7 The adapter and host connection use Archboard-authored strict TypeScript, runtime decoding, an allowlisted environment, and a private per-process local channel. Repository checks reject imports, execution paths, or copied assets from the proprietary bundled `codex-app-tools` package
- [ ] #8 A real-process contract test starts the exact configured Codex binary, confirms app-server reports the eight `archboard_app` tools with their schemas and approval policy, exercises each tool against isolated tasks, proves calling-thread routing and self-target refusal, cancels a wait, and confirms shutdown leaves no MCP child or private socket behind
<!-- AC:END -->
