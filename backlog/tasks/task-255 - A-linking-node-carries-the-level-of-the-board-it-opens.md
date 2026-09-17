---
id: TASK-255
title: A linking node carries the level of the board it opens
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-17 17:38'
updated_date: '2026-09-17 19:45'
labels: []
dependencies: []
references:
  - docs/adr/0013-a-node-records-a-level-only-to-differ-from-its-board.md
  - src/shared/semantic-policy/index.ts
  - .skill-evals/2026-09-17T16-31-08-093Z/report.md
ordinal: 449000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Node kind `external` has been carrying two meanings. The skill defines it as a part outside the checkout (a library, a shell, a caller), while archboard's own vault uses it to join one board to another: 14 of the 18 `external` nodes in .archboard/vault carry a `drillDown` and name a part of this codebase. Links that point DOWN already use the target's own nature (`Canvas server` is `service`, `Semantic board store` is `module`), so the vault is inconsistent with itself as well as with the skill. Evaluation authors read the ambiguity the other way: in the 2026-09-17T16-31-08 batch, 3 of 6 S14 runs modelled werkzeug, jinja and click as `package` rather than `external`, and the grader counted it a failure.

The user settled it. `external` means third-party code outside this codebase. A node that stands for something another board describes takes that board's level as its kind — System, Service, Module — so a reader sees where one level joins the next. And a drill-down is an affordance on a part that is really there: a node added only to carry a link is a button, and a diagram has no buttons. It must show actual callers; if those abstract to a different system, that abstraction is the node. Linking UP belongs on a container, never on a card standing beside the parts. Linking DOWN or sideways belongs on cards — a module board showing `calls this module` draws an edge to a node whose kind is `module` and whose link opens it.

What an implementer will find: `system` is not in the default vocabulary at all (src/shared/semantic-policy/index.ts, DEFAULT_SEMANTIC_POLICY). Nothing validates a `drillDown` today — the vault checker's codes are VAULT_UNREADABLE, BOARD_UNREADABLE, DUPLICATE_BOARD, INVALID_CONFIG, INVALID_CONTENT and UNKNOWN_VOCABULARY (src/runtime/semantic-board-store/lib/diagnostics.ts, vocabulary.ts), so a link to a board the vault does not hold is not reported either. A node may also carry its own `level`, which ADR 0013 says is recorded only when it differs from its board; no node in the tracked vault carries one, so how that field relates to the kind a standing-for node takes has to be stated rather than assumed. The migration is not a rename: several vault cards exist only to point up (`Archboard system`, `System overview`, `Workbench subsystem`) and are the buttons this decision removes, so the boards that carry them need the real caller drawn or the link moved onto the container.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The default vocabulary offers a kind for every configured level, including `system`
- [x] #2 A decision record states what `external` means, that a node standing for what another board describes carries that board's level as its kind, that a drill-down is an affordance on a real participant and never a node added to carry a link, that an upward link belongs on a container and a downward or sideways link on a card, and how all of that relates to the `level` field ADR 0013 governs
- [x] #3 CONTEXT.md and the archboard skill say the same in the words an author needs when choosing a kind
- [x] #4 The vault checker reports a node that exists only to carry its `drillDown`, a `drillDown` naming a board the vault does not hold, and a kind that disagrees with the level of the board it opens
- [ ] #5 The tracked .archboard/vault carries the decision: no card exists only to link, upward links sit on containers, and `external` is left only where the part is outside this codebase
- [x] #6 bun run check passes and the derived skills are synchronized
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read ADR form (0013, 0024, 0026) and the domain-modeling skill's decision guidance.
2. Add a `system` node kind to DEFAULT_SEMANTIC_POLICY so every configured level has a kind to stand for it.
3. Write docs/adr/0029: what `external` means, that a node standing for another board carries that board's level as its kind, that a drill-down is an affordance on a real participant, that an upward link belongs on a container and a downward/sideways link on a card, and how that relates to the node `level` ADR 0013 governs.
4. Teach CONTEXT.md the same words (Kind, Drill-down, and a Standing-for entry).
5. Teach skills/archboard/SKILL.md and references/authoring.md the same in an author's words (my two files only).
6. Add drill-down diagnostics to the vault checker: a node that exists only to carry its drillDown, a drillDown naming a board the vault does not hold, and a kind that disagrees with the target board's level.
7. Focused tests for the three diagnostics; run eval:skill check for the leak guard.
8. Record what the vault will need for TASK-257; do not rewrite the dogfood boards.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Vocabulary: DEFAULT_SEMANTIC_POLICY gains a `system` node kind (RiApps2Line, sky), so every default level has a kind a standing-for node can carry. src/runtime/semantic-board-store/tests/drill-down.test.ts holds the invariant that every configured default level has a kind of the same name.

Decision: docs/adr/0029-a-node-standing-for-another-board-carries-that-boards-level.md. It records that `external` is third-party code this codebase does not own; that a node standing for what another board describes carries that board's level as its kind; that a drill-down is an affordance on a part that is really there and never a node added to carry a link; that an upward link belongs on a container and a downward or sideways one on a card; and how that relates to ADR 0013.

Correction to the task description: a semantic node has NO `level` field. SemanticNodeSchema (src/shared/semantic-board/lib/content.ts) is strict and carries id, name, kind, responsibility, description, parent, groups, binding, drillDown. The `level` ADR 0013 governs is on the legacy promotion path (`promote --level`, src/runtime/engine/lib/board-address.ts), where a node is Excalidraw element metadata. The ADR therefore says the kind is how a semantic node says it sits at another level, and that no `level` field is being added.

Vocabulary in the author's words: CONTEXT.md gains **External** and **Standing-for node**, and **Kind**, **Level** and **Drill-down** are amended. skills/archboard/SKILL.md: the `external` and `drillDown` catalogue rows and the 'Keep it true' drill-down bullet. skills/archboard/references/authoring.md: the `kind` and `drillDown` field rows, plus two new paragraphs and the check codes in the Drill-down section. The other five references are other workers' this wave and were not touched.

Checker: new src/runtime/semantic-board-store/lib/drill-down.ts, called from checkSemanticVault after every board is read (the level a link must match is a fact about the vault, not the board). Three warnings: DRILL_DOWN_ONLY_NODE (a node with a drillDown and no relationship, no children and no part in a flow), DRILL_DOWN_UNKNOWN_BOARD, DRILL_DOWN_LEVEL_MISMATCH. Warnings rather than errors per ADR 0026: the board still draws and the repair is an ordinary agent write. Nothing was added at the write boundary: refusing a write would mean reading another board inside this board's lease, and the answer goes stale on a rename anyway.

What the vault will need (TASK-257 owns it; nothing under .archboard/vault was touched here). Running the new checker over the tracked vault reports 26 DRILL_DOWN_LEVEL_MISMATCH and 2 DRILL_DOWN_ONLY_NODE, and no unknown board:
- Link-only cards to delete, with the real caller drawn or the link moved onto the container: `CLI modules` on Command dispatch and `System overview` on Command interface. `Archboard system` (Agent workbench, Browser application, Canvas server) and `Workbench subsystem` (Codex session) each have one edge, so they are not caught by DRILL_DOWN_ONLY_NODE, but they are the same upward buttons the decision removes and need the same treatment by hand.
- Kinds to change to the target board's level: `external` -> `system` for the four cards opening Archboard; `external` -> `service` for the cards opening Canvas server, Browser application, Agent workbench and Command interface; `app` -> `service` for Agent CLI and Browser on Archboard; `module` -> `service` for Workbench client and Codex workbench, which open the Agent workbench service board; `function`/`package` -> `module` for Render driver, Compound layout, SVG painters, Card measurement and Pretext, which open module boards.
- .archboard/vault/.archboard/config.yaml defines no `system` node kind. It must gain one before any board can carry it; writes are refused for an unconfigured kind. I did not edit it: it is a vault file, and the same rewrite owns it. Suggested entry matching the shipped default: `system: { name: System, icon: RiApps2Line, color: sky }`.
- src/runtime/semantic-renderer/tests/wide-boards.test.ts holds a recorded scorecard per tracked board; rewriting the boards will move those numbers and that owner will need re-recording.

Verification: bun test src/runtime/semantic-board-store/tests --isolate --max-concurrency=1 (139 pass, 0 fail, the 6 new drill-down owners included); bun test src/runtime/skill-distribution/tests (8 pass); bunx tsc --noEmit clean; oxlint policy and baseline configs clean over the changed directories; oxfmt --check clean; bun run eval:skill check ok (15 scenarios, 15 fixtures, 14 coverage parts). AC 5 is left unchecked: it is the vault rewrite TASK-257 owns and depends on this task. AC 6 is left unchecked: bun run check and bun scripts/sync-skills.ts run centrally for this wave.

Gate run lane by lane (lint, fmt, type-check, frontend build, module, system, repository and serial browser lanes) all clean, and bun scripts/sync-skills.ts synced both authored skills. Acceptance criterion 5 is left for TASK-257, which rewrites the vault; the checker reports 26 DRILL_DOWN_LEVEL_MISMATCH and 2 DRILL_DOWN_ONLY_NODE against the tracked vault today.
<!-- SECTION:NOTES:END -->
