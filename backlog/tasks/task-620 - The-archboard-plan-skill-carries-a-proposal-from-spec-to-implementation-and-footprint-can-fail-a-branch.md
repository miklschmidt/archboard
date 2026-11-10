---
id: TASK-620
title: >-
  The archboard-plan skill carries a proposal from spec to implementation, and
  footprint can fail a branch
status: Done
assignee:
  - '@claude'
created_date: '2026-11-09T19:36:00Z'
updated_date: '2026-11-09T20:06:00Z'
labels: []
dependencies: []
ordinal: 1066000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A user grills out a feature and runs Matt Pocock's to-spec, to-tickets and implement-spec skills. Those skills write a spec, split it into tickets and implement them, but they never show the change as architecture, and nothing holds the implementation to the architecture that the user approved. Archboard can author a proposal, link to it in the browser and compare a branch with it through `model footprint`. A consumer skill has to inject those steps into the three Pocock skills through its description trigger, because those skills only run on a slash command. Skills hint, they do not enforce: `model footprint` always exits 0 on findings, so a local ticket merge has no gate. The pull-request Action already gates a pull request with `out-of-plan: fail`, but implement-spec merges ticket branches into an integration branch with no pull request.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A shipped skill `skills/archboard-plan` has a trigger-only description that names to-spec, to-tickets and implement-spec, and is installed beside archboard and archboard-pr
- [x] #2 The skill adds an architecture proposal to the spec, gives each ticket one slice of the proposal with a browser link, and holds each ticket merge to the proposal
- [x] #3 The skill makes the agent record the reason for a deviation in the proposal history and on the ticket
- [x] #4 `archboard model footprint --state <draft> --fail-outside` exits 1 when the branch changed a module that the draft does not name, and 0 when it changed none
- [x] #5 `--fail-outside` without a draft is refused
- [x] #6 The consumer skill, the docs site and the installation docs describe the new option and skill
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Write skills/archboard-plan/SKILL.md in the format of to-spec, to-tickets and implement-spec, with a trigger-only description.
2. Add --fail-outside to model footprint (apps/cli history.ts), exit 1 as outcome outside, refuse without a draft.
3. Ship the skill: init BUNDLED_SKILLS, release compile, symlinks, install docs.
4. Docs: design lens, pull-requests guide.
5. Proposal WxPQKLMm for Model footprint, Init and Executable compile; adopt on the branch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Affected modules: vKEsyHFk/XppR9owz#MrE3v2T6 (Model footprint), vKEsyHFk/XppR9owz#XgeEM0Pb (Init), vKEsyHFk#5pa5C2WH (Executable compile). Proposal WxPQKLMm, predecessor iY0ACR2l, adopted on this branch.
The pull-request Action already gates a pull request with out-of-plan: fail; --fail-outside is for merges without a pull request.
The first gate run on this branch failed on five directory-bound containers (Packages, Agent CLI, workspace, Commands, Release) only through their children. The gate now passes a container that holds another changed module (rules/outside-draft.ts). The draft history records this reason.
Remaining gate deviations on this branch, with reasons: Installation changed only a doc comment (no architectural meaning); Architecture inputs is the vault, which changed because it holds the proposal. Model footprint shows as planned and unchanged because its binding names the modelFootprintContract declaration, and the change is in historyCommand.
The browser link opens the checkout that the registry chooses; the skill tells the agent to run archboard repo use for a worktree. Verified by opening the link in the app.
A --doing line holds 140 characters at most.
Sol review (gpt-6.1-sol, xhigh): round 1 found S1-S3 (skill) and S4 (path normalization), all taken; round 2 approved.
Not done: no skill evaluation scenario under evals/ (human-run). Follow-up candidate: the pull-request Action still lists containers outside the plan.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the shipped archboard-plan skill and the `model footprint --fail-outside` gate.

The skill triggers on to-spec, to-tickets and implement-spec in a repository with a vault. It adds a proposal to the spec, gives each ticket a slice with a browser link, gates each ticket merge with the footprint, and makes the agent record each deviation in the proposal history and on the ticket. init and the release ship it beside archboard and archboard-pr.

`--fail-outside` exits 1 (outcome outside) when the branch changed a module outside the draft, except a directory-bound container of another changed module, and refuses the option without a draft. Docs: design lens, pull-requests guide, install docs.

Verification: unit test of the gate rule; system test of exit 0, 1 and 2 against a real draft; init, skill link and frontmatter tests; lint, format, types, test:modules, test:repository, test:system; site build; the gate run on this branch; the proposal link opened in the app. Sol review approved in round 2.

Risk: the pull-request Action still lists containers outside the plan, so CI and the CLI gate can differ on containers.
<!-- SECTION:FINAL_SUMMARY:END -->
