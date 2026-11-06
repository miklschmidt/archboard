---
id: TASK-583
title: Agents name proposals and states by their names when they write to a person
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-06T17:12:00Z'
updated_date: '2026-11-06T17:34:00Z'
labels:
  - skills
dependencies: []
ordinal: 1027000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner reads replies, PR bodies and task notes, and a state ID such as s3dmAjji tells them nothing. The consumer skill already asks authors to name each proposal for what it changes, but it did not ask agents to use that name when they talk to a person.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The consumer skill tells an agent to call each proposal and state by its name in replies, questions, PR bodies and task notes, and to keep the state ID for commands
- [x] #2 The archboard-pr skill names proposals by name in the visible PR body and leaves the IDs to the state comment
- [x] #3 The archboard-pr description triggers on writing or updating a PR body in a repository with a vault, together with any other PR-body skill
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the rule to Say what each proposal changes in skills/archboard/SKILL.md. 2. Point the archboard-pr skill's Write and post section at it. 3. Rewrite the PR 49 body to follow it.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The owner saw no diagrams in PR bodies: the agent loaded the generic pr skill, whose trigger is writing a PR body, and archboard-pr's description never named a PR body or the pairing. The description now leads with writing or updating a PR body and says to load it together with any other PR-body skill.

The archboard-pr skill now has the PR that implements a proposal adopt it on its own branch, so code and architecture merge together and no follow-up PR is needed. It says how to carry a proposal that the default branch superseded (a copy on current, then shelve the original) and to raise a draft whose code is already merged. The consumer skill says that a request to prepare the implementing PR requests that adoption. test:repository: 163 pass.
<!-- SECTION:NOTES:END -->
