---
id: TASK-471
title: Installing archboard leaves no machine path behind and nothing to resync
status: To Do
assignee: []
created_date: '2026-10-14 14:39'
labels: []
dependencies: []
ordinal: 816000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard is installed by cloning it, yet `install-skill` copies the skills into `~/.agents/skills` or `~/.claude/skills`, so every `git pull` leaves them stale until somebody reruns it (on the owner's machine the copy was a week old and lacked `archboard-pr`). The block that it writes into a repository's CLAUDE.md or AGENTS.md is tracked and shared, but it holds absolute paths of the machine that ran it, and it restates the skill. The owner also wants plain `archboard` to work in a set-up repository without exporting a variable. The subtasks split this into the default vault, the skill install, and the block.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A person who clones archboard, links the CLI and runs `archboard install-skill` once gets global skills that follow each `git pull` and `bun install` with no further step
- [ ] #2 No skill file and no setup block that archboard installs or writes holds a path of the machine that ran the installer
<!-- AC:END -->
