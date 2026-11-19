---
id: TASK-652
title: >-
  archboard-deepen deepens shallow modules and wide interfaces without a human
  gate
status: To Do
assignee: []
created_date: '2026-11-19T14:03:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-651
priority: high
type: feature
ordinal: 1112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Why

TASK-651 makes the code check fail on wide interfaces (INTERFACE_WIDE) and shallow modules (MODULE_SHALLOW), and its findings name the smell and the principle without a fix: the owner wants agents to reason about the redesign themselves. The owner also wants that redesign to run autonomously: "an autonomous version of improve-codebase-architecture, aided by archboard", where two advisors take the place of the user at every gate. This repository needs it first: after TASK-651, model, workbench, renderer, codex-realtime-voice, codex-app-server, workspace and timing must be narrowed in this stack.

## Design

A shipped, model-invoked skill `skills/archboard-deepen/SKILL.md`. Its description triggers on: the code check reports INTERFACE_WIDE or MODULE_SHALLOW, or an agent is asked to deepen modules or improve the architecture without a human gate. It is self-contained (users do not have the third-party improve-codebase-architecture, codebase-design or grilling skills) and loads the `archboard` skill for every architecture operation. Steps, each ending on a checkable completion criterion:

1. Scope: the modules the findings name, or a direction given; otherwise Archboard locality (change frequency) for hot spots.
2. Explore: interface inspection of callers and dependencies, the deletion test (does deleting the module concentrate complexity or just move it?), the deep-module vocabulary (module, interface, depth, seam, adapter, leverage, locality), and ADRs in the area.
3. Report: a self-contained HTML report outside the checkout, one card per deepening candidate (files, friction, proposed change, locality and leverage, tests that survive at the seam, a before and after picture rendered from an Archboard proposal, a strength badge), and a top recommendation.
4. Advisor gate (replaces the human): two advisor sub-agents, of different model families where the harness offers them, each pick and rank candidates independently, then each sees the other's picks; take what they agree on, and settle the rest after at most two rounds, recording the reason.
5. Grill by advisors: for each chosen candidate, the advisors answer the design questions (constraints, dependencies, the shape of the deepened module, what sits behind the seam, which tests survive), independently and then against each other; settle and record each decision. Update the domain glossary and ADRs as decisions settle.
6. Build: one Archboard proposal for the whole redesign, one ticket per candidate owning a slice of it, implementation in an isolated worktree per ticket, ordered so that a widely used module goes first and alone; the footprint gate before each merge; the code check passes on the touched modules.
7. Review: a review loop until a round finds nothing.
8. Hand off: the report, the decisions with their reasons, and the result. Interrupt the owner only for a decision that reverses one the owner already made.

The finding messages and the archboard skill state the principles (narrow interfaces, deep modules, testing at the seams); this skill carries the process, never a prescribed fix for a finding.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 skills/archboard-deepen/SKILL.md exists as a shipped, model-invoked skill whose description triggers on INTERFACE_WIDE or MODULE_SHALLOW findings and on autonomous deepening requests, and whose body carries the eight steps with checkable completion criteria
- [ ] #2 It is self-contained: it needs no third-party skill, and it loads the archboard skill for locality, interface inspection, proposals, renders, the footprint and adoption
- [ ] #3 The advisor gate and the advisor grilling say how to run two independent advisors, how they see each other's answers, and how open points are settled and recorded
- [ ] #4 archboard init installs it with the other shipped skills, the release includes it, and tracked symlinks expose it in .claude/skills and .agents/skills
- [ ] #5 The archboard skill points agents to it where INTERFACE_WIDE and MODULE_SHALLOW are described, and the site install and pull-request pages name it
- [ ] #6 The skill-link and init tests cover it, and the skill follows writing-for-agents (one source of truth, leading words, no restated environment)
<!-- AC:END -->
