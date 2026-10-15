---
id: TASK-478.01
title: >-
  A picture drawn against a named variant marks only what it adds, without the
  planned frame
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-15 15:39'
labels: []
dependencies: []
parent_task_id: TASK-478
priority: high
type: feature
ordinal: 840000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A stacked pull request needs a picture of only its own change. Today `semantic render` draws a variant against the current variant, or on a board with no current variant against the variant it was branched from, and always inside the "Planned" frame on such a board (ADR 0031). On a built board, the marks then include every PR below in the stack. On an unbuilt board, every PR picture says nothing is built, although the PR builds code. The device trust stack (Platform #599 to #615) worked around both by copying each proposal into a temporary vault, and then explained the workaround in the PR bodies. The user decided that each PR is drawn against the PR below it, without the frame. `semantic compare --against` already names the variant to read against (src/cli/commands/lib/read-against.ts); the pictures and recordings cannot.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `semantic render`, `semantic rasterize` and `semantic record` take `--against <variant>`; the picture, and every frame of the recording, marks what the drawn variant adds, changes and removes relative to the named variant, the same entries that `semantic compare --against` reports
- [ ] #2 A picture or recording drawn with `--against` carries no planned frame, also on a board with no current variant; without `--against`, render output is byte-identical to today
- [ ] #3 An unknown `--against` variant is refused as `semantic compare --against` refuses it; `--against` with `--no-comparison` is refused, and so is `--against` naming the drawn variant itself
- [ ] #4 The render and rasterize receipts name the `--against` variant as `comparedWith`, and a replay of a recorded talk draws the same comparison
- [ ] #5 ADR 0031 records that a picture drawn against a named variant reads relative to that variant and carries no frame
- [ ] #6 The `archboard` consumer skill documents `--against` on render, rasterize and record, the `evals/` inputs follow where a scenario covers comparison pictures, and test owners cover the three commands
<!-- AC:END -->
