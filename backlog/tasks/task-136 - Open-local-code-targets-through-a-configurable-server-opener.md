---
id: TASK-136
title: Open local code targets through a configurable server opener
status: To Do
assignee: []
created_date: '2026-08-28 15:35'
labels: []
dependencies: []
references:
  - >-
    docs/adr/0018-code-targets-resolve-at-presentation-and-local-opening-is-a-server-capability.md
documentation:
  - CONTEXT.md
type: feature
ordinal: 152000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A person activating code that exists in a registered checkout can open its file or directory through the loopback Archboard server. One machine-wide opener is configurable from the frontend and never turns portable board metadata into a machine-specific path or command.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The frontend has a global opener settings panel with the platform-native default, editor presets, custom executable and argv fields containing {path}, validation, reset, and a test against a chosen registered checkout root
- [ ] #2 Opener configuration is stored as machine state outside the vault, survives a server restart, and a saved change applies to every pane on the next activation without reloading
- [ ] #3 A local code-target activation sends board and element identity through a same-origin POST; GET, cross-origin requests, browser-supplied absolute paths, and elements without a resolvable binding open nothing
- [ ] #4 Before launching, the server re-reads the canonical binding, verifies the registered checkout still has the recorded repository identity, accepts existing files and directories, and rejects real paths that escape through a symlink
- [ ] #5 The server launches the configured executable with an argument array and no shell; the platform-native default works on each supported host or returns an actionable unavailable error
- [ ] #6 A successful activation leaves the canvas open, while launch failure names what failed, links to opener settings, and offers an explicit GitHub action when runtime presentation can derive one
- [ ] #7 Automated checks exercise the public settings and activation contracts, process launch with a controlled fake opener, file and directory targets, refusals, persistence, and immediate cross-pane application
<!-- AC:END -->
