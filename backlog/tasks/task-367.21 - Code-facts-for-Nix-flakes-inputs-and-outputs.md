---
id: TASK-367.21
title: 'Code facts for Nix flakes: inputs and outputs'
status: To Do
assignee: []
created_date: '2026-09-29 01:16'
labels:
  - code-check
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 629000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nix tells nothing about run time, but it shows software dependencies that no other file makes explicit. A flake's inputs are pinned in `flake.lock`, which is JSON. Its outputs are the packages, shells, overlays and system configurations it builds. The check never evaluates Nix, because evaluation can fetch from the network and run code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The inputs in `flake.lock` are build dependencies of the flake
- [ ] #2 The outputs in `flake.nix` are definitions addressed by attribute path, such as `packages.x86_64-linux.archboard`, found by a static parse
- [ ] #3 A part bound to a flake output gets the binding check, and a relationship to a flake input is supported by the lock
- [ ] #4 The check never runs `nix`
<!-- AC:END -->
