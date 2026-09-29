---
id: TASK-367.05
title: archboard check --code reports anchors and bound symbols that no longer hold
status: To Do
assignee: []
created_date: '2026-09-29 01:15'
updated_date: '2026-09-29 01:16'
labels:
  - code-check
  - cli
  - skill
dependencies:
  - TASK-367.03
  - TASK-367.04
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: high
type: feature
ordinal: 613000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
This is the tracer bullet of the code check: the whole path from a stored anchor to a finding, in any language, before any parser exists. It reads text only. Every open canvas polls the plain check every 5 seconds (`src/ui/semantic-board-canvas/lib/queries.ts`), so reading source must not run inside that poll.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For the current variant of every board in a registered checkout, the check reports an anchored file that does not exist, an anchor symbol that the file does not contain, and a bound symbol that the bound file does not contain
- [ ] #2 `--variant <name>` checks a named draft on request. Historical and shelved variants are never read
- [ ] #3 The code pass runs on its own route or from a cache keyed on the checkout HEAD, never inside the check that canvases poll
- [ ] #4 Repositories this machine has not registered stay silent, and the exit status follows `archboard check`
- [ ] #5 Findings carry their subject, and the consumer skill's verification step names the command
<!-- AC:END -->
