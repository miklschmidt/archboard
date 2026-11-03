---
id: TASK-567
title: >-
  Answer links to local files open in the editor, and the conversation column
  never scrolls
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-03T13:39:00Z'
labels: []
dependencies: []
ordinal: 1016000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Codex writes a local file in its answer as a markdown link to the absolute path, such as /Users/msc/.t3/worktrees/Platform/archboard-architecture-model/scripts/k8s/service-certificate-observation-command.ts:24. The browser resolved that as a page of the Archboard server, so the link broke. The user also saw two scroll bars in the conversation tab: the conversation scrolls, and the column under it scrolled too, which hid the header and left empty space under the composer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A link in an answer to an absolute file path, with an optional :line, :line:column, #Lline or #LlineCcolumn, opens that file at that line through the configured opener
- [ ] #2 The server opens a named file only inside a checkout that the request vault reads, including through links, and refuses any other path with TARGET_OUTSIDE_CHECKOUT and a next step
- [ ] #3 Web links in answers still open in a new tab
- [ ] #4 The conversation column never scrolls, so the conversation shows one scroll bar and keeps its header in view
- [ ] #5 ADR 0018 records the amendment, and a proposal records the changed architecture
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a path request to the open route, resolved as the binding it would be in the innermost checkout the vault reads. 2. Parse Codex file links in the answer renderer and open them through a context the application offers. 3. Clip the conversation column with an inline style, because react-resizable-panels sets overflow auto inline. 4. Tests: link rule, rendered link, route system test, shell layout browser assertion. 5. ADR 0018 amendment and a model proposal.
<!-- SECTION:PLAN:END -->
