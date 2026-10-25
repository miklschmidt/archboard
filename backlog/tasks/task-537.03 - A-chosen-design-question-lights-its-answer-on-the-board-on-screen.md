---
id: TASK-537.03
title: A chosen design question lights its answer on the board on screen
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T17:04:00Z'
updated_date: '2026-10-25T19:46:00Z'
labels:
  - design-questions
  - ui
dependencies:
  - TASK-537.01
  - TASK-537.02
parent_task_id: TASK-537
type: feature
ordinal: 930000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0057 (TASK-537.02) lets a chosen design question light its answer. Without the light, a person reads a list of names and still has to find each part on the picture. The Overview draws every container closed (ADR 0052), so many answers sit inside a container that the view does not open.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Choosing a question leaves its subjects and the containers that hold them lit, and recedes the rest. Nothing is written
- [ ] #2 A subject that the view does not draw is lit through the nearest drawn container, and the region says how many subjects the view hides
- [ ] #3 A pick shows its own Light, and letting go of the pick brings the light of the chosen question back
- [ ] #4 Choosing a group or a walkthrough step lets the question go, and choosing a question lets the pick and the group go
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Built on ADR 0057 while it is still proposed: the owner asked to see the light working before accepting it (TASK-537.02 criterion 5).

1. One hook, use-placed-choice.ts, keeps a choice beside the board and the resolved variant it was made on, and lets it go on navigation, when the variant stops offering it, or when something displaces it. The group selection moves onto it, and the design question uses it too.
2. A rule, design-questions.ts, names the questions (for now the pass-through one) and gives the subjects of each answer. connections.ts gains the light of an answer: its subjects and every container that holds them, or no light when none of them is drawn.
3. usePicking keeps the chosen question. A walkthrough or a group displaces it. Choosing a question lets the pick, the group and the walkthrough go. A pick does not let it go.
4. useLighting lights the chosen question's answer when nothing is poked and the light does not stand down, so a pick or a hover shows its own light and letting go brings the question's light back.
5. DesignQuestions gets a pressed row that chooses the question and lets it go, and says how many subjects the view hides while it is chosen.
6. Tests: the stage harness for the four criteria, and the rule for the light.
7. A dark screenshot of the light on a board for the owner.

Board proposal: Board viewer@TASK-537.03 (Light connections, List design questions and Viewer entry point descriptions; the two relationship labels into them).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built while ADR 0057 is still proposed: the owner asked to see the light before accepting it. Screenshots (dark, the Board viewer board, because no web shop board has an entry point that passes one call on): the Overview lights the three closed containers that hold the five entry points, and the row says the view hides all five.

Escape with nothing picked lets the question go, as it lets a group go. With a pick, Escape lets the pick go and the answer's light comes back. The shell design doc and the Light entry of CONTEXT.md say so.

The group selection moved onto use-placed-choice.ts, which the question shares: one place keeps a choice on the board and variant it was made on.

Closing:
- archboard check --code with and without --variant TASK-537.03: no difference (41 findings in both). The two Board viewer findings (EXPOSED_UNUSED on Walkthrough replay, and on the Board viewer node of Semantic renderer) are not about parts this task changed.
- Footprint read against base 4acc6767f (the plan commit, parent of the first code commit 20441874c): namedAndChanged Render stage states, Viewer entry point, Light connections, List design questions; changedNotNamed and namedNotChanged empty. Unbound containers and drill-downs skipped.
- Adopted Board viewer@TASK-537.03 at version 154 with the board's scope as its summary. archboard check: 0 diagnostics.
- Behind: Browser application's Board stage (SemanticBoardStage.tsx) changed in 20441874c. Still right: the stage passes the chosen question to its view and sidebar, and composes the same stage.
<!-- SECTION:NOTES:END -->
