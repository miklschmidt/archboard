---
id: TASK-323
title: 'Rename the canvas server and bin/canvas, and stop calling the server the host'
status: To Do
assignee: []
created_date: '2026-09-23 23:08'
labels:
  - naming
dependencies: []
references:
  - CONTEXT.md
  - package.json
priority: medium
type: chore
ordinal: 555000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The server that runs the boards, the browser connection and Codex is called the "canvas server", a name carried over from the Excalidraw MCP fork, and the launcher script is bin/canvas (installed as the archboard command through package.json). Canvas is the glossary term for the pannable surface in the browser, so the name says the wrong thing. Code, docs and prompts also call the same server "the host" (src/shared/codex-realtime-host, canvas-codex-host, CanvasCodexWorkbenchHost, 17 design and ADR files). The user wants one plain name everywhere, including the launcher, and no "host". About 60 files say "canvas server"; src/server/canvas is its module; the architecture boards in .archboard/vault name a "Canvas server" node (rename its name only, never its id). The new name is the user's decision.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The user chose the new name, recorded in CONTEXT.md with canvas server and host under Avoid
- [ ] #2 Code, docs, skills, help text, prompts and the architecture boards use the new name and never "canvas server" or "host" for the server
- [ ] #3 The launcher script has the new name, and bin/dogfood, INSTALL.md and every documented command use it
<!-- AC:END -->
