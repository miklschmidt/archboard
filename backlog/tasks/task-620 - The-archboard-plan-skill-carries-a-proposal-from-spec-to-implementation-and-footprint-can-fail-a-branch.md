---
id: TASK-620
title: >-
  The archboard-plan skill carries a proposal from spec to implementation, and
  footprint can fail a branch
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-09T19:36:00Z'
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
- [ ] #1 A shipped skill `skills/archboard-plan` has a trigger-only description that names to-spec, to-tickets and implement-spec, and is installed beside archboard and archboard-pr
- [ ] #2 The skill adds an architecture proposal to the spec, gives each ticket one slice of the proposal with a browser link, and holds each ticket merge to the proposal
- [ ] #3 The skill makes the agent record the reason for a deviation in the proposal history and on the ticket
- [ ] #4 `archboard model footprint --state <draft> --fail-outside` exits 1 when the branch changed a module that the draft does not name, and 0 when it changed none
- [ ] #5 `--fail-outside` without a draft is refused
- [ ] #6 The consumer skill, the docs site and the installation docs describe the new option and skill
<!-- AC:END -->
