---
id: TASK-537.03
title: A chosen design question lights its answer on the board on screen
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T17:04:00Z'
updated_date: '2026-10-25T22:13:00Z'
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
- [x] #1 Choosing a result of a question lights every subject of its answer and the containers that hold them, with the chosen result's relationships and the parts at their other ends, and recedes the rest. Nothing is written
- [ ] #2 The camera frames the chosen result with the parts at the other ends of its relationships, at a size a person can read. When the view does not draw it, the pane opens the whole board first
- [x] #3 The Board tab stays open while the person goes from one result to the next, the current result's row is pressed, and choosing that row again lets the question go
- [x] #4 A pick shows its own Light, and letting go of the pick brings the light of the chosen question back
- [x] #5 Choosing a group or a walkthrough step lets the question go, and choosing a question lets the pick and the group go
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

Revision after the owner saw the first build (2026-10-25). In the Overview the light stood on three closed containers while the region named five entry points nobody could see, and in Everything the five lit cards were too small to read. The owner chose a step-through: the camera goes to one result at a time while the others stay lit, using the result rows.

8. A result row is a step of the chosen question, not a pick: the Board tab stays open, so the next row is one click away. The row of the current step is pressed. Choosing it again lets the question go. This replaces criterion 2 of TASK-537.01 (a result picked its part). The light row and its count of hidden subjects go.

9. The step lights the whole answer with the containers, plus what a pick of the current result lights: its relationships and the parts at their other ends. That shows the callers and the one call it passes on, which is what the question asks about.

10. The camera frames the current result with the parts at the other ends of its relationships (useSubjectFocus takes the parts around the subject). A result the view does not draw opens the whole board first, as showing a part already does.

11. ADR 0057, CONTEXT.md, the shell design doc and the stage tests follow. QA in a dark browser at 1920x1080 on the Board viewer board: every step readable, with every screenshot shown to the owner.
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

Step-through build (2439711c7, 054fc87a6, cc165802b). Each result row is a step. A step lights the whole answer with its containers, plus the step subject's relationships and the parts at their other ends. It rings the subject with the attention ring a walkthrough step uses, and the camera frames the subject with those parts. The light row and its hidden count are gone. The row hover preview stays on every row except the pressed one, because after a click the pointer still rests on that row and would hide the step light.

QA in a dark Chromium at 1920x1080 on the Board viewer board (no web shop board has a pass-through entry point), from the Overview: each of the five steps opened Everything, pressed its row, kept the Board tab open, ringed its entry point and lit 19 to 21 subjects. Camera scale per step: Picture cache 0.42, Board reads 0.39, Follow drill-downs 0.54, Keep the drill trail 0.56, Picture departure 0.33. At 0.33 to 0.42 the card names read and the descriptions do not, because a caller sits far from the entry point. The owner decides whether a step needs a floor on its zoom.

QA found TASK-545: the view null that the fit asked for is the Overview since ADR 0052, so the first build never opened the whole board.

Board: the commits changed List design questions, Light connections, Viewer entry point and Render stage states inside. Board viewer still says what each does: the result rows still show a result and ask the agent about it, and the stage still hands the light the chosen question. archboard check --code reports 41 findings, the same as before the step-through, and none is about the touched files.

Gate after the step-through: bun run check stops only on the two waived wide-boards layout timing tests (4958 pass). test:system 257 pass, test:repository 142 pass, test:serial-browser all pass. Criterion 2 stays open: three steps frame at scale 0.33 to 0.42, where descriptions do not read. Waiting on the owner for that and for ADR 0057.
<!-- SECTION:NOTES:END -->
