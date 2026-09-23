---
id: TASK-320
title: An agent's archboard commands reach the canvas that runs it
status: To Do
assignee: []
created_date: '2026-09-23 21:36'
labels:
  - codex
dependencies: []
references:
  - src/runtime/codex-process/lib/environment.ts
priority: medium
type: bug
ordinal: 552000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Codex child environment is an allowlist (src/runtime/codex-process/lib/environment.ts) with no ARCHBOARD_URL, and a shell command an agent runs does not load a checkout's .envrc. An agent on a canvas at another port that runs `archboard ...` therefore reaches http://127.0.0.1:3000, the default. Since several canvases now share one machine (TASK-313), the Docs canvas agents had to pass ARCHBOARD_VAULT by hand (see the saved prefix rules in the Codex home).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An archboard command an agent runs reaches the canvas that started that agent, on any port, without the agent naming it
- [ ] #2 One owner proves it for a canvas on a port other than 3000
<!-- AC:END -->
