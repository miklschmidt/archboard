---
id: TASK-208.02
title: Accept --variant on semantic edit as the other variant commands do
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-16 02:26'
updated_date: '2026-09-18 11:27'
labels: []
dependencies: []
parent_task_id: TASK-208
ordinal: 421000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the 2026-09-16 skill evaluation batch five to six author runs per arm first ran `semantic edit <board> --variant <name>` and got exit 2, then retried with `variant` inside the payload. inspect, render, rasterize and adopt all accept `--variant`; edit alone takes it only in the JSON. Every variant edit pays a wasted call, and the refusal does not say where the variant goes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard semantic edit <board> --variant <name>` targets that variant, and a payload naming a different variant is refused with both names
- [ ] #2 The generated help lists the option and the skill edit recipe shows it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a `--variant` option to the `semantic edit` command contract (src/cli/commands/semantic.ts): ingress schema gains the selector, the parameter is declared so generated help and the Commander parser carry it, and the description says the change lands on that variant.
2. In the handler, fold the flag into the stated batch before it is parsed: the flag alone selects the variant; a stated `variant` equal to it is accepted; a stated `variant` that differs is refused as a usage error (exit 2) naming both, with nothing written.
3. Cover it in tests/system/semantic-boards/workflow.test.ts against the owned canvas: an edit with --variant lands on the proposal and leaves the current variant untouched; a payload naming another variant exits 2, names both variants and moves no version. Help coverage comes from the existing generic help test, which asserts every declared option appears.
4. Update the skill: skills/archboard/references/edit.md step 3 shows --variant, and variants.md says the flag is how a batch names the proposal (the payload field still works).
5. Verify: focused system test, src/cli/command-routing/tests/help.test.ts, and type-check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on feat/semantic-boards.

- src/cli/commands/semantic.ts: `semantic edit` declares a `--variant <variant>` option (ingress schema, parameter, description, second example). `editedVariant` folds the flag into the stated batch before it is parsed against VariantEditInputSchema: the flag alone selects the variant, a batch `variant` equal to it (after trimming) is accepted, and a batch naming a different one throws CliUsageError (exit 2) quoting both, before anything is sent to the canvas.
- tests/system/semantic-boards/variant-targeting.test.ts (new, its own owned canvas): --variant lands the change on the proposal and leaves the current variant alone; flag and batch agreeing is accepted; two different ones exit 2, name both, and leave the version and every variant untouched. It is a new file because workflow.test.ts and lifecycle.test.ts are both at the 500-line lint cap.
- skills/archboard/references/edit.md: step 3 says --variant is how the variant is named (as on inspect/render/rasterize/adopt), that the batch field says the same thing, and that two different ones are refused; a second command line shows the flag. variants.md: proposals are edited with `semantic edit <board> --variant`, and an edit naming no variant edits the current architecture.

Verified: bun test tests/system/semantic-boards/variant-targeting.test.ts (3 pass); src/cli/command-routing/tests/help.test.ts + src/cli/command-contract/tests + comparison-answer (all pass; the help owner asserts every declared option appears in generated help); tests/system/cli/command-contract-artifacts.test.ts (3 pass); bunx tsc --noEmit clean; oxlint and oxfmt clean on the changed files.

Commits: 3ec50b86 (CLI + test), b77476a4 (skill references).
<!-- SECTION:NOTES:END -->
