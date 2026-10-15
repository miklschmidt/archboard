---
id: TASK-471.03
title: >-
  install-skill writes no setup block, and archboard-pr triggers on the vault
  directory
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 14:40'
updated_date: '2026-10-15 08:31'
labels: []
dependencies:
  - TASK-472.09
parent_task_id: TASK-471
ordinal: 819000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The block that `install-skill` writes into a repository's CLAUDE.md or AGENTS.md is tracked and shared, but it holds absolute paths of the machine that ran the installer, and it restates the archboard skill. ADR 0049 (2026-10-14) leaves the block nothing to say: the CLI finds the vault at `<git root>/.archboard/vault` with nothing exported, `ARCHBOARD_VAULT` is removed, and the server URL is derived. The block's one other use is the trigger of the archboard-pr skill, which today fires on "a repository whose AGENTS.md or CLAUDE.md names ARCHBOARD_VAULT". This task depends on the migration task that removes `ARCHBOARD_VAULT`; add that dependency when the migration tasks exist.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `install-skill` writes no block into CLAUDE.md or AGENTS.md
- [ ] #2 Rerunning `install-skill` in a repository that holds a block from an earlier version removes that block and leaves the rest of the file unchanged, and its output says so
- [ ] #3 The archboard-pr skill triggers on a repository that has `.archboard/vault`, and no shipped skill names `ARCHBOARD_VAULT`
- [ ] #4 A test holds that no file that `install-skill` writes into a repository contains a path of the machine that ran it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. install-skill stops writing the CLAUDE.md/AGENTS.md block; setUpRepository (lib/repo-setup.ts) makes <repo>/.archboard/vault and removes an earlier block from CLAUDE.md and AGENTS.md, leaving every other byte, and reports removedBlocks plus a diagnostic. 2. Options --vault, --doc, --yes go (the vault is always <repo>/.archboard/vault, nothing is asked); --no-doc becomes --no-setup. 3. archboard-pr description triggers on a repository with .archboard/vault. 4. Tests: install-targets.test.ts (no block, removal byte-for-byte, no machine path in any written file). 5. Eval harness install stops reading the block.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: install-skill options --vault, --doc and --yes are removed (the vault is always <repo>/.archboard/vault and nothing is asked or written into a document), --no-doc is --no-setup. The receipt's setup is {repo, vault, vaultCreated, vaultIgnored, removedBlocks}; removedBlocks lists the CLAUDE.md/AGENTS.md files a block was cut from, and a diagnostic line per file says so. Removal deletes the markers, what is between them and the newline after the end marker; every other byte stays, and only CLAUDE.md and AGENTS.md at the repository root are looked at. The guard for the archboard checkout itself is gone (nothing is written there now). The skill-evaluation harness installs with --repo only and no longer reads or records the block. Left for TASK-471.02: resolveInvocation in skill-destination.ts has no caller now; 471.02's PATH warning will use it.

Board closing: Skill evaluation@TASK-471.03 corrected (summary is the board's scope; Skill install description says the run's vault is the .archboard/vault the checkout already holds) and adopted. The install-skill parts of this task are on Command interface@TASK-472.09 (Install skill: vault made at the root of the git checkout that holds --repo or the working directory, checkoutRootOf in repo-setup.ts; Repository setup: line-anchored block removal, CRLF safe, never past another begin marker), adopted with that task. Code check with and without --variant TASK-471.03: no difference. Footprint on Skill evaluation read against base f57fab66c (parent of the first code commit 10f827af3): Skill install named and changed; Evaluation harness (container) changed only by install.ts, which is named; Evaluation inputs (evals) changed only by wording in evals/README.md, so the board stays true. skill-destination.ts (resolveAgent return type, 10f827af3) and the withoutOldBlock re-export from install-skill.ts (4ca78b0ff) changed how Commands works inside, not what it draws.
<!-- SECTION:NOTES:END -->
