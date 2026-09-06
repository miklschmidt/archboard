---
id: TASK-156
title: Teach architecture levels and drill-down linking in the archboard skill
status: To Do
assignee: []
created_date: '2026-09-06 23:05'
updated_date: '2026-09-06 23:32'
labels: []
dependencies: []
references:
  - skills/archboard/SKILL.md
  - skills/archboard/references/architecture-workflow.md
  - CONTEXT.md
  - src/ui/code-target/index.ts
  - src/ui/canvas/use-canvas-session.ts
  - docs/adr/0013-a-node-records-a-level-only-to-differ-from-its-board.md
priority: medium
type: bug
ordinal: 308000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user reports that the archboard skill does not teach agents how to work with level or drill-down linking. Inspection of the authored skill and references finds a --level service creation example and general advice to stay at one level, but no explanation of the level model or a drill-down linking workflow.

Correction to the original task: the existence of a documented domain concept does not establish browser support. Level is metadata: a node inherits its board's level unless it states an override (CONTEXT.md and ADR 0013). Setting a level does not create a link or enable navigation.

Concrete reported workflow: mTLS strangler and Platform strangler are saved at system; Strangler foundation is saved at service. The agent attached [[platform-migration@strangler-foundation]], but clicking this Obsidian-style link does not navigate to that board in Archboard. Those board levels are reported by the agent, not independently read from the user's vault during this triage.

Implementation inspection confirms the missing browser integration: src/ui/canvas/use-canvas-session.ts attaches createCodeTargetLinkHandler as onLinkOpen. src/ui/code-target/index.ts handles reserved code-target URLs and leaves other links to Excalidraw; it does not resolve Obsidian board links into pane navigation. Persistence of a link and support for it in Obsidian are distinct from navigation inside the Archboard browser.

Agents need accurate instructions for choosing levels and organizing overview/internals boards, without being taught an invented clickable-link workflow. The original acceptance criteria requesting a working drill-down link expose a product prerequisite, not merely missing prose. This task currently covers skill guidance; implementing browser navigation requires an explicit scope decision (expand this task or track a separate product bug). Do not mark the linking workflow complete merely because metadata and link text were saved, and do not claim level alone enables drill-down.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The skill explains what level means, how to choose and set a board's level using the current supported vocabulary, and how node-level inheritance and explicit overrides work.
- [ ] #2 The skill explains when to use a drill-down and how to create, attach, inspect and follow a link from a node to the board describing its internals using supported interfaces.
- [ ] #3 An agent following the skill can complete a concrete example spanning an overview board and a linked board of internals, with correct levels and a working drill-down link; the example is verified against the current CLI and domain model.
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-09-06 23:07
---
Triage correction: the original description incorrectly assumed clickable drill-down was an existing browser capability. Current link handling supports code targets, not Obsidian board-link navigation. Original acceptance criteria remain open; a browser implementation is not authorized by a documentation-only task. User supplied concrete failing target [[platform-migration@strangler-foundation]].
---

author: @codex
created: 2026-09-06 23:32
---
The user has now requested implementation of TASK-156 after the missing browser capability was explained. Implement the existing working-drill-down acceptance criteria, including the minimal browser navigation prerequisite and accurate skill guidance. This supersedes the earlier documentation-only scope pause; level metadata alone must still never be described as creating navigation.
---
<!-- COMMENTS:END -->
