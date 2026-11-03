---
id: TASK-567
title: >-
  Answer links to local files open in the editor, and the conversation column
  never scrolls
status: Done
assignee:
  - '@claude'
created_date: '2026-11-03T13:39:00Z'
updated_date: '2026-11-03T13:59:00Z'
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
- [x] #1 A link in an answer to an absolute file path, with an optional :line, :line:column, #Lline or #LlineCcolumn, opens that file at that line through the configured opener
- [x] #2 The server opens a named file only inside a checkout that the request vault reads, including through links, and refuses any other path with TARGET_OUTSIDE_CHECKOUT and a next step
- [x] #3 Web links in answers still open in a new tab
- [x] #4 The conversation column never scrolls, so the conversation shows one scroll bar and keeps its header in view
- [x] #5 ADR 0018 records the amendment, and a proposal records the changed architecture
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a path request to the open route, resolved as the binding it would be in the innermost checkout the vault reads. 2. Parse Codex file links in the answer renderer and open them through a context the application offers. 3. Clip the conversation column with an inline style, because react-resizable-panels sets overflow auto inline. 4. Tests: link rule, rendered link, route system test, shell layout browser assertion. 5. ADR 0018 amendment and a model proposal.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence: answer-file.test.ts (link forms), answer-links.test.tsx (file link opens, web link keeps new tab), tests/system/code-targets/answer-path.test.ts (opens at line with a real opener process; outside path and outward symlink refused with TARGET_OUTSIDE_CHECKOUT, nothing launched). Browser run against a real Codex answer: both links rendered as open buttons, the real server refused /etc/hostname with the notice, and the intercepted request for source.txt carried path, line 1 and the vault. Scroll: the column had inline overflow auto from react-resizable-panels; a scroll into view moved the column by 300 px before the fix and 0 after. shell-layout.test.ts asserts it and fails without the fix (Received -300). The exact overflow on the reporter machine was not reproduced; the fix removes the column scroll for any overflow. ADR 0018 amendment; proposal 4XGQBqQA left as a draft, not adopted. bun run check passes, 21 of 21 tasks. Sol review: 2 rounds with gpt-6.1-sol at xhigh, approved; S1 (export ceiling) fixed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Links in agent answers to local files now open the file at its line through the code opener, held to the checkouts the vault reads, and the conversation column clips instead of scrolling, which removes the second scroll bar.
<!-- SECTION:FINAL_SUMMARY:END -->
