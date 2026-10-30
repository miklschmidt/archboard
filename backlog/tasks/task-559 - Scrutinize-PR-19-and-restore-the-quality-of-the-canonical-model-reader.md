---
id: TASK-559
title: Scrutinize PR 19 and restore the quality of the canonical model reader
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-30T15:18:00Z'
updated_date: '2026-10-30T15:51:00Z'
labels:
  - frontend
  - review
dependencies: []
references:
  - https://github.com/miklschmidt/archboard/pull/19
  - docs/design/operator-canvas-shell.md
  - docs/adr/0068-one-live-canonical-model-and-consumer-path.md
priority: high
ordinal: 972000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #19 (feat: replace boards with a canonical module model) is not ready to merge into main. Run this task after the test suite reaches its target of about two minutes. PR #19 stays unmerged until the owner accepts the result of this task.

The owner reviewed the running branch and reported three problems:

- The change removed all transitions.
- Navigation is janky.
- The UI is poorly done.

The owner also asked for a scrutiny pass over the implementation of PR #19. Do the scrutiny pass first. Its findings decide part of the repair work.

The integration of PR #19 with the Rust renderer found these facts. Each one is a lead for the scrutiny pass. None of them is a complete list.

- `ModelResponse` in `ArchitectureModelStage.tsx` keys its frame on the model identity, so the frame and the header rebuild when a reading finishes loading. A menu that is open at that moment closes.
- The sidebar tabs disappear while a new reading loads.
- `use-model-catalog.ts` follows every repository in the navigator. `watchArchitectureModel` polls a complete read of each one and compares it with `JSON.stringify`. The server used 58 percent of one core with one tab open.
- Opening the archboard repository transfers about 6 MB of checkpoints and 2.7 MB of model content.
- `prepareContentHere` puts the complete render request in the query key.
- The first draw of this repository's root reading took 4.9 s in a browser. One Blocks solve took 3.2 s. Another reading took about 40 s. A separate agent is working on the solve time, so read its result before you measure again.
- The registry named `/tmp/integrate/wt19` as the chosen checkout for 40 ms at 15:46:09 on 2026-10-30, with no known cause. Find out which caller did this.

Before PR #19, the board canvas owned the transitions. Compare with origin/main at 396bfd9add2f to find what the canonical reader lost. The picture motion code is under `apps/web/src/ui/clients/semantic-board-canvas/picture/`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A scrutiny pass over the complete PR 19 diff against origin/main is written down, and each finding is fixed or carries an owner decision
- [ ] #2 Each transition that origin/main shows for an action exists for the same action in the canonical reader
- [ ] #3 Changing a reading, scope, grammar or comparison keeps the header, the sidebar and any open control in place, with no rebuild and no flash
- [ ] #4 The canonical reader matches docs/design/operator-canvas-shell.md at 1920 by 1080, and the owner accepts the result by eye
- [ ] #5 A first draw of this repository's root reading finishes in less than 500 ms in a browser
- [ ] #6 A tab that is open and idle costs the server no more than a few percent of one core
- [ ] #7 The owner approves the merge of PR 19
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner, 2026-10-30, on this task: the whole UX around navigating the new data model needs redesign. The Blocks renderer, which was supposed to reduce area significantly in PR 24, creates obscene amounts of dead space. The UI, the starting point, and the amount of information in the small right sidebar overwhelm the user. The levers that gather information for readable diagrams are good, and the data model suits recursive decomposition, but the UX execution is atrocious. The task needs redesign by agents, focused on the user journey, done autonomously, with a council of Astra and Opus finding the path.

Owner, 2026-10-30: numbered containers such as Layer 4 and Layer 6 are too abstract, and a person cannot relate them to the code or project structure. In this repository's model, Layer 0 to Layer 7 have kind other and no code binding, and each states an import rule. Layers 1 to 4 hold one child each. The rule comes from tests/system/repository-policy/package-graph.test.ts.

Owner decision, 2026-10-30: delete the Layer 0 to Layer 7 containers from this repository's model. Do not replace them with groups, because more groups oversaturate the drawings. Show a module's code path on its card and let navigation read like the repository. The consumer skill and archboard check must catch containers with no code and no job of their own.
<!-- SECTION:NOTES:END -->
