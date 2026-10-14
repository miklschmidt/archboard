---
id: TASK-471.02
title: install-skill links global skills to the checkout and copies repo-local skills
status: To Do
assignee: []
created_date: '2026-10-14 14:39'
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
- [ ] #1 By default, and with `--agent claude-code`, the installer makes `archboard` and `archboard-pr` in the global skills directory symlinks to the `skills/` directories of the checkout that runs it, and it regenerates their generated files in that checkout
- [ ] #2 A repeated global install changes nothing, and an existing copy or a link to another place is replaced, with output that names what was replaced
- [ ] #3 `--local` copies both skills, generated files included, into `.agents/skills` or `.claude/skills` of the repository being set up, and a symlink in the way is refused with nothing changed
- [ ] #4 `--dir` copies when the directory is inside the repository being set up, and links otherwise
- [ ] #5 No file of an installed or generated skill holds a path of the machine that ran the installer, and a test holds this for a linked and a copied install
- [ ] #6 The installer warns when `archboard` on PATH does not resolve to this checkout
- [ ] #7 INSTALL.md, the help of install-skill, both shipped skills and the archboard-dev skill describe linking and copying
<!-- AC:END -->
