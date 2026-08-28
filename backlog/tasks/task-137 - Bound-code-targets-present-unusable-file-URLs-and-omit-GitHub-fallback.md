---
id: TASK-137
title: Bound code targets present unusable file URLs and omit GitHub fallback
status: To Do
assignee: []
created_date: '2026-08-28 15:35'
labels: []
dependencies:
  - TASK-136
references:
  - >-
    docs/adr/0018-code-targets-resolve-at-presentation-and-local-opening-is-a-server-capability.md
  - docs/adr/0011-bindings-name-a-repository.md
documentation:
  - CONTEXT.md
type: bug
ordinal: 153000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Current outbound presentation emits browser-unusable file:// URLs for existing files, drops existing directory targets because it checks isFile(), and emits no target when a GitHub repository is unavailable locally. Bound elements must instead receive a working target derived at presentation time from their one portable binding.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every outbound browser and caller presentation recomputes the code target from the canonical binding and current checkout registry; no local-versus-remote classification, absolute path, internal target, or GitHub URL is persisted
- [ ] #2 When a matching registered checkout contains the bound real path, both files and directories receive an internal Archboard code target addressed by board and element identity
- [ ] #3 When the local target is unavailable and the repository identity is on github.com, presentation derives an HTTPS target for the bound path using the recorded commit when present, otherwise the recorded branch, otherwise HEAD; file and directory paths both open correctly
- [ ] #4 A registered checkout whose repository identity changed, a missing local path, or a symlink escaping the checkout is not presented as local; a missing local path falls back to GitHub when possible
- [ ] #5 Repository identities on other hosts receive no invented remote target, and unrelated human-authored Excalidraw links retain their stored value and browser behavior
- [ ] #6 Adding, moving, forgetting, or invalidating a checkout changes the next presented target without changing the board note
- [ ] #7 Regression checks fail on the current behavior and prove browser-visible local file and directory actions, GitHub fallback with no checkout, commit then branch then HEAD precedence, survival after a human edit, and absence of all derived targets in the raw note
<!-- AC:END -->
