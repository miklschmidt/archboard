---
id: TASK-325
title: stop never orphans a live server it does not recognize
status: To Do
assignee: []
created_date: '2026-09-24 01:07'
labels:
  - cli
dependencies: []
priority: medium
type: bug
ordinal: 560000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the health service name changed (TASK-324), archboard stop run by the new CLI against a server started by the old code answered "Archboard server is not running; stale pidfile removed (pid 2428646)" while that pid was alive and listening on the port, and start then refused because the port was taken. The pidfile was deleted without stopping anything, so the server was orphaned until it was killed by hand (2026-09-24). A pidfile whose process is alive and holds the port is not stale, whatever its health check answers.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 stop keeps the pidfile of a process that is alive and listening on the server's port, and says what answers there and how to stop it, instead of reporting nothing running
- [ ] #2 A pidfile whose process is gone is still removed as stale
- [ ] #3 One owner proves both
<!-- AC:END -->
