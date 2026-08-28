---
id: TASK-087
title: Pin and test the Obsidian plugin format Archboard depends on
status: To Do
assignee: []
created_date: '2026-08-21 12:18'
updated_date: '2026-08-28 00:35'
labels: []
dependencies: []
references:
  - docs/design/vendor/README.md
  - docs/design/vendor/ExcalidrawData.ts
  - docs/adr/0017-a-note-keeps-its-own-record-of-where-its-images-went.md
  - scripts/check-obsidian-md.mjs
priority: medium
type: task
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Archboard preserves and follows the Obsidian Excalidraw plugin Embedded Files record, but the source used for that decision was saved without its upstream identity. The original vendored blob matches the plugin default branch at commit 36a32940bac50fd60fb379b18a9f38668f941108, whose manifest version is 2.26.4.

Record that exact repository commit and plugin version beside the reading copy and ADR 0017. Exercise one note that this pinned plugin wrote, so the interop check has an external authored input instead of comparing Archboard only with itself. Keep this as a format contract. Do not automate the Obsidian desktop application, provision a GUI test environment, or build a plugin execution framework.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The upstream repository, commit 36a32940bac50fd60fb379b18a9f38668f941108, and plugin version 2.26.4 are recorded beside the vendored reading copy and linked from the format decision.
- [ ] #2 Every plugin behavior Archboard relies on names the upstream method or region from which it was read.
- [ ] #3 check-obsidian-md exercises a checked-in note authored by the pinned plugin, including its Embedded Files record and drawing block, and fails when Archboard no longer preserves or follows that record.
- [ ] #4 No Obsidian application automation, GUI environment provisioning, plugin runtime adapter, or second format implementation is added.
<!-- AC:END -->
