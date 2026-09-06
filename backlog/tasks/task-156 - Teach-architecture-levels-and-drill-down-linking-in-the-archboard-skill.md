---
id: TASK-156
title: Teach architecture levels and drill-down linking in the archboard skill
status: Done
assignee:
  - '@codex'
created_date: '2026-09-06 23:05'
updated_date: '2026-09-06 23:54'
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
- [x] #1 The skill explains what level means, how to choose and set a board's level using the current supported vocabulary, and how node-level inheritance and explicit overrides work.
- [x] #2 The skill explains when to use a drill-down and how to create, attach, inspect and follow a link from a node to the board describing its internals using supported interfaces.
- [x] #3 An agent following the skill can complete a concrete example spanning an overview board and a linked board of internals, with correct levels and a working drill-down link; the example is verified against the current CLI and domain model.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reuse the existing pane-specific board-open API to follow exact [[board-key]] element links, preserving code targets and reporting failures through the shell. Do not derive navigation from level metadata.
2. Teach level vocabulary, inheritance/overrides, and the create/attach/inspect/follow overview–internals workflow in the authored archboard skill; sync derived skills.
3. Verify the CLI example and rendered drill-down in disposable state through the serial browser runner, including an explicit variant, pane isolation, missing-target recovery and unchanged persisted notes. Run bun run check serially, record evidence, and commit only TASK-156.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Material value: a person can follow an overview node to its internals in the same pane, and an agent can create and verify that link from accurate skill guidance. Reuses existing board resolution/navigation; no new level-driven state or link protocol. Base HEAD and codex/task-143-144-workbench both resolve to f45057c70a0187909b1fe614aa336f9f806dddd1.

Implemented exact [[board-key]] link handling by reusing the existing pane-specific open API, leaving code-target and ordinary-link behavior delegated to the original handler. The disposable CLI/browser example passed in 6.34 seconds: create/add/promote/update/get/describe/check, level inheritance and override, right-pane drill-down, reported variant missing-target failure and recovery, navigator return, and byte-identical persisted notes across navigation. Added an unsupported-alias refusal assertion before the complete gate. Authored skill updated and derived copies synced; skill-creator quick_validate.py passes in a temporary uv environment.

Complete gate first run: lint, formatting, root/frontend types, 2,660 module tests (23.57s), 309 system tests (145.38s), 9 repository tests (2.55s), and the new drill-down browser owner (6.19s including alias refusal) passed. The browser chain stopped at the pre-existing fullscreen rectangle-settle timeout; a peer task browser lane was also active. Checked the unmodified f45057c7 base in a disposable source copy with its own dependencies: fullscreen passed (7.09s). Current branch focused fullscreen then passed (7.11s). No tests/timeouts/rules were weakened; rerunning the full serial browser lane after checking for peer heavy processes.

Final validation: the complete serial browser lane passed (exit 0), 24 tests across all 20 normal owners. The new overview/internals owner passed in 6.13s with 21 assertions; fullscreen passed in 7.08s, and existing code-target activation, ordinary external links, note persistence, and workbench owners all passed. Together with the first complete gate’s green lint, formatting, both TypeScript projects, 2660 module tests, 309 system tests and 9 repository tests, every normal gate stage is verified. The initial bun run check invocation itself exited 1 on the documented intermittent fullscreen timeout; it was not reported as a clean single invocation.

At the user’s request, coordinated directly with Implement TASK-155 undo history fix: it held new browser/heavy runs while this complete browser lane finished, and was sent an explicit lane-free handoff afterward. All servers, vaults, sockets, homes and the baseline source copy were disposable and outside the checkout; the user’s live server and vault were untouched. Only canonical skills/ inputs and test/source changes are tracked; synced skills, generated contract/build outputs, logs and screenshots remain untracked. No lint/type rule or shadcn exception was changed.
<!-- SECTION:NOTES:END -->

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

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented same-pane drill-down for exact [[board-key]] element links, including explicit variants, using the existing server board resolver. Missing or unsupported targets produce actionable shell notices; code-target and ordinary link navigation remain intact.

The authored archboard skill now teaches system/service/module selection, board level updates, node inheritance and overrides, and a verified create/attach/inspect/follow example. All three acceptance criteria are proven by the disposable CLI and real-browser owner. Every normal gate stage passed; the full browser lane passed after the initial fullscreen timing failure, which is recorded above. Skills were synced and quick_validate.py passed.
<!-- SECTION:FINAL_SUMMARY:END -->
