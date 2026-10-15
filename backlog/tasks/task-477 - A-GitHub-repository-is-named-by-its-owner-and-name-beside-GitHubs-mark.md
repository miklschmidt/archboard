---
id: TASK-477
title: A GitHub repository is named by its owner and name beside GitHub's mark
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-15 15:03'
updated_date: '2026-10-15 15:04'
labels: []
dependencies: []
references:
  - src/ui/shell/components/RepositoryLine.tsx
  - src/ui/shell/lib/navigator-rows.ts
  - src/runtime/engine/git.ts
priority: medium
type: enhancement
ordinal: 840000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shell names a repository by its identity: host/owner/name as its origin remote spells it (repoIdentityFromRemote in src/runtime/engine/git.ts), or the directory name of a repository with no remote. An untracked vault is named by its registry name. On 2026-10-15 the owner reviewed the navigator. Its repository row reads github.com/miklschmidt/archboard and wraps onto two lines in the 320px column, and the host says little that a mark cannot say. The owner asked for the github.com part to go, with a GitHub icon in its place for a GitHub repository. A sentence that names a repository, such as a notice, an explanation or a tooltip on the way to code, keeps the whole identity, because a sentence has no room for a mark.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every label that names a repository shows a repository on github.com by its owner and name beside GitHub's mark: the navigator's repository row, a pane header crumb that enters another repository, the About page's Opens cell, the Working now list, the move dialog's targets and the opener settings' repository choice.
- [ ] #2 Any other repository, and an untracked vault, is named as before.
- [ ] #3 The whole identity stays available on hover and to assistive technology.
- [ ] #4 The navigator filter finds a GitHub repository by any part of its identity, and it marks a match only in the words that the row shows.
- [ ] #5 Tests own the shown name and the filter's match, and DESIGN.md describes the mark.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Boards: none is affected. The new module src/ui/repository-name is small shared chrome, as src/ui/variant-lifecycle is, and Browser application draws neither. Shell, Board move and Board viewer only gain an import of it.
2. src/ui/repository-name: a pure shownRepository(identity) that gives the owner and name of an identity on github.com, case-insensitively, and the identity unchanged otherwise. RepositoryName draws GitHub's mark (RiGithubLine) and that name, with the whole identity as its title, and the host as hidden text so that assistive technology reads the whole identity. A RepositoryMark gives the navigator's marker its icon.
3. Navigator: RepositoryLine shows the shown name beside GitHub's mark, titled GitHub repository. navigator-rows matches the filter on the shown name, and a match elsewhere in the identity gives the zero-length marker, as a board's match elsewhere does. The row's accessible label keeps the whole identity.
4. RepositoryOf in PaneHeader, OpensCell in AboutParts, WorkingNow, MoveTargets and RepositoryField use RepositoryName. Sentences (notices, GoDeeper's words, bindingTip) keep the identity.
5. Tests: repository-name owns the shown name (github.com, another host, a name with no host, a registry name). The navigator rows test owns the filter on a GitHub repository. Tests that read the identity from those labels follow the change.
6. Docs: DESIGN.md and the shell doc where they describe a repository's row or name.
7. Look at it at 1920x1080 in both themes: the navigator, the move dialog and the opener settings.
8. Close: bun run check together with TASK-476, the code check's behind reading, and readme:check.
<!-- SECTION:PLAN:END -->
