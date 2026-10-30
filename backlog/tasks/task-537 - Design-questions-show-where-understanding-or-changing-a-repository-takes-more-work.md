---
id: TASK-537
title: >-
  Design questions: show where understanding or changing a repository takes more
  work
status: To Do
assignee: []
created_date: '2026-10-25T17:03:00Z'
labels:
  - design-questions
  - ui
dependencies: []
documentation:
  - >-
    docs/adr/0044-a-containers-interface-is-what-relationships-from-outside-reach.md
  - docs/adr/0045-git-history-is-read-through-bindings-on-request.md
  - >-
    docs/adr/0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md
  - .claude/skills/improve-codebase-architecture/SKILL.md
priority: high
type: feature
ordinal: 925000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An architect who runs the survey step of the improve-codebase-architecture skill has to open the inspector of each container one at a time, and read the code check in a terminal. The board package already derives pass-through entry points, containers with no hidden part and containers with no entry point (ADR 0044). The code check finds callers and tests that reach private code and exposed names nobody uses (ADR 0046). The history lens finds change coupling that no relationship joins (ADR 0045). Nothing shows them together, and nothing shows them on the picture.

This experience lists them as questions over the whole repository in the Board tab. A chosen question lights its answer on the picture, and a result can ask the agent the deletion question ("Delete X. What do its callers lose?"). Every row is a question, never a verdict (ADR 0044 refuses a score, a combined number and the word "shallow").

Measured on 2026-10-25 over the current variants of the 17 dogfood boards: 96 containers, 36 pass-through entry points in 17 containers (13 in Commands on Command interface), 29 containers with no hidden part, 23 with no entry point.

The owner decided on 2026-10-25: a question asked of the agent is sent at once, as the diagnostics bell sends a repair. A chosen question lights its answer as attention, through a new ADR.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 From one region of the Board tab, a person finds every pass-through entry point, container with no hidden part, container with no entry point, code check leak and unjoined pair of the repository, without opening an inspector
- [ ] #2 An agent gets the same questions from the CLI
- [ ] #3 No row, count or light gives a verdict, a score or a combined number
<!-- AC:END -->
