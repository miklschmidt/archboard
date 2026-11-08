---
id: TASK-601
title: >-
  `archboard init` installs the skills with the skills CLI and hands language
  server setup to an agent
status: Done
assignee:
  - '@claude'
created_date: '2026-11-08T00:04:00Z'
updated_date: '2026-11-08T00:52:00Z'
labels: []
dependencies:
  - TASK-599
references:
  - apps/cli/src/cli/commands/install-skill/operations/install-skill.ts
documentation:
  - docs/adr/0076-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
ordinal: 1038000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A repository names its language servers in a committed file now (TASK-599), but choosing and installing the right server for each language cannot be automated: it depends on the languages and on how the repository installs its tools (nix, devenv, devbox, a package manager). `archboard install-skill` set up a repository and linked the skills by hand, beside the skills CLI that the README recommends. The owner asked on 2026-11-08 to rename it to `init`, to install the skills through the skills CLI, and to end setup by handing the language servers to an agent.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `archboard install-skill` is renamed to `archboard init`, and every caller, test and document follows. No alias remains
- [x] #2 `init` installs the archboard and archboard-pr skills of this installation globally with the skills CLI, run through bun, pnpm or npx. In a TTY it asks which of the runners found on PATH to use, in that order, or to skip. Without a TTY it uses the first one found, and with none it skips. The manual link and copy code and its options are gone
- [x] #3 `init` still makes or finds the vault, registers the checkout, and removes the block of an earlier version
- [x] #4 In a TTY, `init` ends by asking whether Claude Code or Codex, each only when found on PATH, sets up the language servers, or to skip. It starts the chosen agent in the repository with a prompt to set up the language servers
- [x] #5 Without a TTY, `init` assumes that an agent runs it, and its answer ends with the same prompt and says that setup is not finished until the agent sets up the language servers
- [x] #6 The prompt tells the agent to follow the archboard skill setup reference, to prefer the repository own tool installation, and to confirm its plan with the user before it installs or writes anything
- [x] #7 INSTALL.md, the archboard skill and ADR 0076 describe `init`. The skill evaluation harness keeps working
- [x] #8 Each new behavior has one test owner, and tests of the removed link and copy behavior are deleted
- [x] #9 The skills CLI installs the skills for Codex always, and for Claude Code only when `claude` is on the PATH
- [x] #10 The site hero shows the install and `archboard init` with tabs for npm, pnpm, yarn and bun in place of its list of facts, the quick start holds the same commands, and the site no longer says that Archboard runs from a clone
- [x] #11 The CLI sets NO_COLOR only when its stdout is not a terminal, and then drops an inherited FORCE_COLOR, so a command and the agent that init starts keep their colours at a terminal
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope: on 2026-11-08 the owner added two criteria while the work ran: Claude Code gets the skills only when `claude` is on the PATH (AC 9), and the site hero and quick start install with a package manager switcher (AC 10).

Evidence (2026-11-08): `archboard install-skill` now exits 2 with Unknown command. tests/system/cli/init.test.ts (9 tests) runs the real CLI on a scratch PATH with a stand-in bun: without a terminal it calls `bun x skills@1.7.6 add <skills> -g -y --agent codex --skill archboard archboard-pr`, adds `claude-code` when a `claude` is on the PATH, stops with exit 1 and no repository change when the skills CLI fails, keeps every setup behavior, and ends the answer with `next`. apps/cli/tests/cli/commands/init/rules/setup-choices.test.ts owns the runner order. A drive through a real pseudo-terminal showed both pickers: Enter on bun ran the skills CLI without -y for claude-code and codex, and Enter on Claude Code started it in the repository with the prompt; Skip on both printed the later install command and ended the answer with the prompt in `next`. The release-executable test compiles a release and runs `init` there; its PATH has no runner, so the skills step skips. The evaluation harness registers its checkout with `repo add` and lays the package itself (install.test.ts and failed-captures.test.ts pass). The site builds with astro check at 0 errors, and screenshots at 1440x900 and 390x844 show the switcher in the hero and the quick start, kept in sync, with no horizontal scroll. Model: proposal 0lFlN04l adopted; its code check cleared the four stale-path findings and added none; the README architecture drawings were drawn again.

Owner requests later on 2026-11-08: Bun installs `archboard` like the other package managers (site, INSTALL.md, the Bun smoke step of the release workflow and docs/agents/releasing.md), and the CLI sets NO_COLOR only when stdout is not a terminal (AC 11). Evidence for AC 11: tests/system/cli/output-colour.test.ts failed first with Bun's two-line FORCE_COLOR warning and passes now; `bunx vp run test:system` passes 235 of 235, where the three tests that expect one stderr line failed before; a drive through a pseudo-terminal recorded `NO_COLOR=unset` in the Claude Code that init started. Sol round 1 found that `repo language-server rust ./rust-server` stored `rust-server`, a name on the PATH; every stored path from the checkout root now starts with `./`.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`archboard install-skill` is now `archboard init`. It installs the archboard and archboard-pr skills with the skills CLI, for Codex, and for Claude Code when `claude` is on the PATH, started by bun, pnpm or npx: at a terminal the person picks the runner or skips, and without one init takes the first found. It still makes and registers the vault and removes the old block. Last, it hands the language servers to an agent, because their setup depends on the repository: at a terminal it starts Claude Code or Codex with a prompt that has the agent confirm its plan first, and without a terminal the answer ends with that prompt in `next`. INSTALL.md, the README, ADR 0076 and the site follow; the site hero and quick start install with an npm, pnpm, yarn or bun switcher. Risks: the pnpm and yarn install lines are not covered by the release smoke test, which installs with npm and bun only, and `yarn global add` works only with Yarn 1. The skills CLI copies the skills, so a person runs init again after an update.
<!-- SECTION:FINAL_SUMMARY:END -->
