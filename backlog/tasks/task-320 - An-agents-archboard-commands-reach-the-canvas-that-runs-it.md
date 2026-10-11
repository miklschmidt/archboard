---
id: TASK-320
title: An agent's archboard commands reach the canvas that runs it
status: Done
assignee: []
created_date: '2026-09-23 21:36'
updated_date: '2026-10-11 13:50'
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
- [x] #1 An archboard command an agent runs reaches the canvas that started that agent, on any port, without the agent naming it
- [x] #2 One owner proves it for a canvas on a port other than 3000
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11 audit: duplicate of TASK-379 (d376f8987). The Codex child environment sets ARCHBOARD_URL, ARCHBOARD_VAULT and ARCHBOARD_NO_AUTOSTART=1 (src/runtime/codex-process/lib/environment.ts:150-152). Verified: tests/system/process-contracts/codex-workbench-storage.test.ts runs two servers at once and asserts each child's ARCHBOARD_URL is its own server's base; src/runtime/codex-process/tests/storage.test.ts uses port 3404. Both pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Duplicate of TASK-379, which already made the Codex child inherit ARCHBOARD_URL, ARCHBOARD_VAULT and ARCHBOARD_NO_AUTOSTART=1, so an agent's archboard command reaches the canvas that started it on any port. Verified 2026-10-11: codex-workbench-storage.test.ts (two servers at once, each child pointed at its own) and codex-process/tests/storage.test.ts (port 3404) pass.
<!-- SECTION:FINAL_SUMMARY:END -->
