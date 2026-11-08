---
id: TASK-599
title: A repository configures its language servers in a committed file
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T23:38:00Z'
updated_date: '2026-11-08T00:36:00Z'
labels: []
dependencies: []
references:
  - packages/workspace/src/runtime/store/language-servers.ts
  - >-
    packages/code-intel/src/runtime/language-servers/operations/server-command.ts
  - apps/cli/src/cli/commands/repo/operations/language-server.ts
documentation:
  - >-
    docs/adr/0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md
ordinal: 1037000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check read language server configuration only from the machine registry (`repos.json`), one checkout at a time. A repository that installs its servers through nix, devenv or devbox, so that they work on every machine and in CI, still needed `archboard repo language-server` on each machine and in each worktree. This repository worked around that with a `bun install` hook (TASK-584). ADR 0046 (TASK-433) rejected configuration in a checkout and kept servers opt-in per checkout. On 2026-11-08 the owner reversed that: a repository already comes with commands to run, so a committed server command needs no trust step, and the machine registration and the repository file must not be two separate things.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The code check reads `.archboard/language-servers.json` at the root of every checkout that it reads, registered or not, with no trust step. The file maps a language to a command and its arguments
- [x] #2 A machine-wide `language-servers.json` in the Archboard state directory fills each language that the repository file does not name. The repository file wins per language. Without either, TypeScript keeps its default rule
- [x] #3 A relative command in the repository file names a program relative to the checkout root, so a repository can commit a wrapper script. The machine-wide file accepts only a name on the PATH or an absolute path
- [x] #4 `archboard repo language-server <language> <command>` writes the repository file of the working directory checkout, or of the chosen checkout that `--repo` names, `--global` writes the machine-wide file, and `--remove` removes a language. Without a language, the command shows both files and their servers. The checkout need not be registered
- [x] #5 The registry holds no language servers. `repo list` and `repo forget` no longer mention them, and a stored `servers` field is ignored
- [x] #6 A file that is not valid JSON or does not match the schema makes the check say `language-server-missing` with the file and the problem, for every language that it would decide
- [x] #7 This repository commits `.archboard/language-servers.json` with Rust on `scripts/rust-analyzer`, and `bun install` no longer writes the machine registry
- [x] #8 ADR 0046 carries an amendment by this task. INSTALL.md, the archboard skill setup reference and the CLI help describe the files, the precedence and that a repository file runs without a trust step. Generated skill artifacts and evals follow
- [x] #9 Each new behavior has one test owner, and tests that only held the registry servers are deleted
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence (2026-11-08): a real `./bin/archboard check code` in this checkout started rust-analyzer through the committed `.archboard/language-servers.json` (`scripts/rust-analyzer`, a path from the checkout root) with no server skips; with the file moved away, Rust reported `language-server-missing` with the new detail. A registry entry with an old `servers` field lists no servers in `repo list`, and `repo language-server` in that checkout reports both files empty (`checkoutOf` in registry-file.ts reads only the known fields). No scenario under evals/ names language servers, so no evaluation changed. Tests: packages/workspace/tests/runtime/store/language-servers.test.ts owns the files and precedence; apps/cli/tests/cli/commands/repo/operations/language-server.test.ts owns the command; apps/cli/tests/cli/commands/vault/operations/language-server-configuration.test.ts owns the check end to end; the registry-servers tests are deleted. test:modules 4955 pass before the interface refactor, test:repository 170 pass after it. The workspace interface stays at its ceiling of 40 names (ADR 0058) because the code check asks one operation, passServers. Model: proposal lOtqXMAp adopted; its draft code check cleared one finding and added none.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A repository now names its language servers in a committed `.archboard/language-servers.json`, and a global `language-servers.json` beside the registry fills each language that the repository file leaves out. The code check reads both with no trust step, as the owner decided on 2026-11-08. `archboard repo language-server` shows and writes these files (`--repo`, `--global`, `--remove`), and the registry no longer holds servers. A relative command in the repository file is a path from the checkout root, so this repository commits Rust on `scripts/rust-analyzer`, and `bun install` no longer writes the machine registry. A file that cannot be read gives `language-server-missing` with the file and the problem. ADR 0046 carries the amendment, and INSTALL.md and the skill setup reference describe the files. Risk: a machine that configured servers in `repos.json` loses them until its repository commits the file or the user writes the global file.
<!-- SECTION:FINAL_SUMMARY:END -->
