---
id: TASK-477
title: A GitHub repository is named by its owner and name beside GitHub's mark
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 15:03'
updated_date: '2026-10-15 16:04'
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
- [x] #1 Every label that names a repository shows a repository on github.com by its owner and name beside GitHub's mark: the navigator's repository row, a pane header crumb that enters another repository, the About page's Opens cell, the Working now list, the move dialog's targets and the opener settings' repository choice.
- [x] #2 Any other repository, and an untracked vault, is named as before.
- [x] #3 The whole identity stays available on hover and to assistive technology.
- [x] #4 The navigator filter finds a GitHub repository by any part of its identity, and it marks a match only in the words that the row shows.
- [x] #5 Tests own the shown name and the filter's match, and DESIGN.md describes the mark.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Boards: none is affected. The new module src/ui/repository-name is small shared chrome, as src/ui/variant-lifecycle is, and Browser application draws neither. Shell, Board move and Board viewer only gain an import of it.
2. src/ui/repository-name: a pure shownRepository(identity) that gives the owner and name of an identity on github.com, case-insensitively, and the identity unchanged otherwise. RepositoryName draws GitHub's mark (RiGithubLine) and that name, with the whole identity as its title, and the host as hidden text so that assistive technology reads the whole identity. Its GitHubMark gives the navigator's marker its icon. The rule is its own entrypoint, shown-name.ts, because the navigator's rows are pure and import no React.
3. Navigator: RepositoryLine shows the shown name beside GitHub's mark, titled GitHub repository. navigator-rows matches the filter on the shown name, and a match elsewhere in the identity gives the zero-length marker, as a board's match elsewhere does. The row's accessible label keeps the whole identity.
4. RepositoryOf in PaneHeader, OpensCell in AboutParts, WorkingNow, MoveTargets and RepositoryField use RepositoryName. Sentences (notices, GoDeeper's words, bindingTip) keep the identity.
5. Tests: a rendered repository-name test owns the shown name, the mark, the hover title and the hidden host (github.com in either case, another host, a name with no host, an owner with no name). navigator-repositories.test.tsx owns the row and the filter on a GitHub repository. Tests that read the identity from those labels follow the change.
6. Docs: DESIGN.md (Navigation) and PRODUCT.md, where they say how a repository is named.
7. Look at it at 1920x1080 in both themes: the navigator, the move dialog and the opener settings.
8. Close: bun run check together with TASK-476, the code check's behind reading, and readme:check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built in c1c61bfa1. The module src/ui/repository-name holds the rule in shown-name.ts, an entrypoint with no React for the navigator's pure rows, and RepositoryName with GitHubMark in its index. The rule takes github.com/ away only when an owner and a name follow it, and it leaves any other identity and an untracked vault's registry name whole.

Navigator: rowLook in RepositoryLine gives the marker (GitHub's mark, titled GitHub repository), the owner and name, and the whole identity as the name's hover title. The row's accessible label keeps the whole identity. navigator-rows matches the filter on the shown name, and a match that reaches into the host gives the zero-length marker, as a board's match elsewhere does. TreeRowName's title takes undefined, as TreeRowMarker's does.

Other labels: RepositoryOf in PaneHeader, the About page's Opens cell, Working now, MoveTargets and RepositoryField use RepositoryName. In the Opens cell GitHub's mark stands under the level mark, so both names start on one line. RepositoryField's closed field formats its value with the same name, where it showed the whole identity. Sentences keep the whole identity: notices.ts, shell-actions.ts, GoDeeper's words and bindingTip.

Tests: tests/repository-name.test.tsx renders the name for five identities, and it owns the rule, the mark, the hover title and the hidden host. It replaced the pure test of the rule in 1f9845b8a. It fails under each of five breakages: no hidden host, no hover title, the host left visible, the mark on every name, and a host in capitals kept. navigator-repositories.test.tsx owns the row's name and mark and the filter. It fails when the filter matches the whole identity, because the mark then lands on g. Since 961499229 it also holds an untracked vault's row to the repository mark, because the row draws its own marker and not RepositoryName, and it fails when every row gets GitHub's mark. The About page and Working now tests still find the whole identity in the text, because assistive technology gets the host as hidden text.

Docs: DESIGN.md (Navigation) and PRODUCT.md. The style checker counts the same hits in both files before and after, and none on the changed lines.

Looked at at 1920x1080: the navigator's row in both themes, and the opener settings' select. The move dialog lists no target on this machine, because the navigator knows one repository, and its module test renders the targets. A one-off check, which this task does not keep, added assertions to the existing tests of Working now, the move dialog, the About page and a drill into another repository. They held GitHub's mark and the whole identity as the hover title in each entry, target, Opens cell and pane header crumb, and all of them passed. One more, on the navigator test, held the untracked vault's row to its whole name with no hover title, and it passed.

Gate: bun run check passed in full on 961499229, the last commit of both tasks, from 17:53 to 18:03: lint, format, types, the frontend build, 4720 module tests with 1 skipped, 240 system tests, 27 repository tests and the 19 browser files.

Boards: none is affected, as planned. The code check's behind reading names Board viewer: 2 commits since 6aa9accce, through Semantic viewer and Render stage states. They are c1c61bfa1 of this task and e20dc563f of TASK-476. It names Browser application: 2 commits since b168159d3, through Shell and Board move. They are c1c61bfa1 and the test commit 961499229. c1c61bfa1 changes how those parts name a repository and how the navigator's filter matches one. Its one new import is src/ui/repository-name, which no part binds of its own. 961499229 changes only a test of Shell. So the words of those parts stay true. The test commit 1f9845b8a puts no board behind. The code check, run on a private server, finds the same 20 findings as at the close of TASK-475.

README: bun run readme:check lists all 16 assets as stale, as it does on main, so no asset that was current went stale.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A repository on github.com is now named by its owner and name beside GitHub's mark in the navigator's row, a pane header crumb, the About page's Opens cell, Working now, the move dialog and the opener settings (c1c61bfa1). Any other repository and an untracked vault keep their whole name and the repository mark. Every label keeps the whole identity on hover and for assistive technology, and a sentence, such as a notice, still names the whole identity. The navigator filter finds a repository by its whole identity and marks only the words that the row shows. Verified by repository-name.test.tsx (1f9845b8a) and navigator-repositories.test.tsx (961499229), which fail when the behavior breaks, by a one-off check of the other labels through their tests, by 1920x1080 screenshots of the navigator in both themes and of the opener settings, and by bun run check on 961499229.
<!-- SECTION:FINAL_SUMMARY:END -->
