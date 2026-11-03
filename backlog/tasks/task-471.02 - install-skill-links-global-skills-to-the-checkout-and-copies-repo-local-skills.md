---
id: TASK-471.02
title: install-skill links global skills to the checkout and copies repo-local skills
status: In Progress
assignee:
  - '@claude'
created_date: 2026-10-14 14:39
updated_date: '2026-11-03T04:26:00Z'
labels: []
dependencies: []
parent_task_id: TASK-471
ordinal: 818000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard is installed by cloning it. The installer copies the skills into the global skills directory and refuses a symlink there, so every `git pull` leaves the installed skills behind until somebody reruns it. The owner decided: a global install is a symlink, a repo-local install is a copy. A repo-local copy is committed with the repository and read on other machines, so it must carry no path of the machine that installed it. Today the generated INSTALL.md copy holds absolute checkout paths.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 By default, and with `--agent claude-code`, the installer makes `archboard` and `archboard-pr` in the global skills directory symlinks to the `skills/` directories of the checkout that runs it, and it regenerates their generated files in that checkout
- [x] #2 A repeated global install changes nothing, and an existing copy or a link to another place is replaced, with output that names what was replaced
- [ ] #3 `--local` copies both skills, generated files included, into `.agents/skills` or `.claude/skills` of the repository being set up, and a symlink in the way is refused with nothing changed
- [x] #4 `--dir` copies when the directory is inside the repository being set up, and links otherwise
- [ ] #5 No file of an installed or generated skill holds a path of the machine that ran the installer, and a test holds this for a linked and a copied install
- [ ] #6 The installer warns when `archboard` on PATH does not resolve to this checkout
- [ ] #7 INSTALL.md, the help of install-skill, both shipped skills and the archboard-dev skill describe linking and copying
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. A global install (default, --target, --agent) and a --dir outside the repository being set up link each skill to the checkout's skills/<skill>; a --dir inside that repository keeps copying.
2. A link install regenerates the consumer skill's generated files in the checkout, writing only changed files so a rerun changes nothing and readers never see a missing file.
3. A link already pointing at the checkout is left alone; a copy or a link elsewhere is replaced, and a diagnostic names it.
4. Update install-targets system tests, INSTALL.md, install-skill help and skill docs.
5. Leave --local (AC 3), machine-path-free copies (AC 5) and the PATH warning (AC 6) for follow-up.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Global installs (default, --target, --agent) and a --dir outside the repository now link each skill to the checkout's skills/<skill>; a --dir inside the repository copies, and still refuses a symlink in the way. The receipt names install: link|copy. prepareSkillArtifacts writes only changed files through a temporary file and removes stale ones, so a rerun changes nothing and a concurrent reader never sees a missing file. Proof: tests/system/cli/install-targets.test.ts fails 11/12 on the old installer and passes 12/12; bun run check passes 21/21 lanes. Open: AC 3 (--local), AC 5 (copied INSTALL.md holds checkout paths), AC 6 (PATH warning), AC 7 (shipped skills do not mention installation).
<!-- SECTION:NOTES:END -->
