---
id: TASK-166
title: Make board workspaces addressable with TanStack Router
status: To Do
assignee: []
created_date: '2026-09-09 12:50'
labels: []
dependencies:
  - TASK-164
references:
  - docs/agents/frontend.md
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - docs/adr/0020-board-work-never-depends-on-a-browser-session.md
  - docs/adr/0022-the-note-decides-and-a-persons-edit-is-optimistic.md
  - src/ui/board-library/lib/library-hash.ts
  - 'https://tanstack.com/router/latest/docs/routing/code-based-routing'
  - 'https://tanstack.com/router/latest/docs/guide/search-params'
type: enhancement
ordinal: 317000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Board and comparison navigation is currently ephemeral React state, so a person cannot restore a workspace from its URL or use browser Back/Forward for deliberate board navigation. The user approved code-based TanStack Router within existing UI module boundaries. Scope: open board/comparison and active pane. Selection, pending edits and voice remain session state; settings routes are not part of the initial scope. Before implementation, agree the URL vocabulary, invalid/missing-board recovery, history push versus replace behavior (including agent-driven navigation), and pending-edit handling. Decide pane-session reuse explicitly. Preserve the existing one-shot #addLibrary flow. Reconcile URL restoration wording with ADRs 0015 and 0020 without changing note authority.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A URL restores the requested board or comparison and active pane on direct load and reload; Back/Forward follows deliberate board navigation.
- [ ] #2 Invalid or missing targets and refused or pending board switches have agreed, visible recovery, with URL and displayed workspace consistent.
- [ ] #3 Navigation preserves pending-edit/version/hold contracts and unaffected mounted pane, workbench and voice lifecycles; library-install hash handling still works.
- [ ] #4 Code-based TanStack Router consumes existing module interfaces; approved dependencies are pinned and no competing navigation state or generated route tree is introduced.
- [ ] #5 Focused runtime/browser coverage verifies URL restoration, history and recovery; bun run check passes.
<!-- AC:END -->
