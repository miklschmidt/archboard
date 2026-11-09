---
id: TASK-618
title: A reader opens a model snapshot in the browser with no Archboard server
status: To Do
assignee: []
created_date: '2026-11-09 01:20'
labels:
  - frontend
dependencies:
  - TASK-616
  - TASK-617
references:
  - apps/web/src/main.tsx
  - apps/web/src/ui/architecture-drawing/model-reader/access/clients/queries.ts
  - >-
    apps/web/src/ui/architecture-drawing/canvas/picture/reads/clients/retained-reads.ts
  - apps/web/src/ui/walkthroughs/replay/clients/start-replay.ts
ordinal: 1064000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A snapshot file is only useful if a reader can open it where it is shared. The canvas already draws in the browser from a reading (projectModel, then the renderer core and the painter), but it reads that reading, the vault check and the icons from the server, and only walkthrough replay installs a local source. A read-only page that takes a snapshot instead of a server lets a team host the canvas on any static file host.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A second page of the browser build, snapshot.html, opens the snapshot that its snapshot query parameter names
- [ ] #2 The page draws the snapshot state with the renderer core and the painter, and shows its comparison state when the snapshot has one
- [ ] #3 The page sends no request to /api and opens no socket
- [ ] #4 The page offers no action that writes, and it loads no agent, workbench or voice code
- [ ] #5 A snapshot of an unknown format version shows which format versions the page reads
- [ ] #6 The page follows the light or dark preference of the system
- [ ] #7 A rendered test proves that the page reads a fixture snapshot without a server request
<!-- AC:END -->
