---
id: TASK-096
title: Stop filtering pane status through a hand-maintained field list
status: To Do
assignee: []
created_date: '2026-08-22 17:47'
updated_date: '2026-08-28 00:35'
labels: []
dependencies: []
references:
  - src/ui/shell/Shell.tsx
  - src/ui/canvas/useCanvasSession.ts
  - scripts/check-fixed-point.mjs
priority: high
type: bug
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shell still drops a PaneStatus when samePaneStatus decides that selected fields are unchanged. Three visible marks have already been omitted from that list and swallowed until browser checks caught them. publishStatus runs on discrete session events, so this filter is not protecting a render-rate path.

Remove the hand-maintained equality decision. Every published PaneStatus replaces the stored status for its pane. Keep the existing event-driven publication points and browser coverage for held state, external-note state, and agent doing lines. Do not replace the list with a generic deep-equality module, schema reflection, generated comparator, or new state framework.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every PaneStatus passed to the shell becomes the current status for that pane; no hand-maintained field list decides whether it is significant.
- [ ] #2 Held state, note-written-elsewhere state, board identity, element count, connection state, and all doing entries still reach the visible shell in the browser checks.
- [ ] #3 The change adds no generic deep equality, generated comparator, schema reflection, or replacement state framework.
<!-- AC:END -->
