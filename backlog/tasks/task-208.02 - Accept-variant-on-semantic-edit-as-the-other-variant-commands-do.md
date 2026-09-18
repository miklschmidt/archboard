---
id: TASK-208.02
title: Accept --variant on semantic edit as the other variant commands do
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-16 02:26'
updated_date: '2026-09-18 11:36'
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
- [ ] #1 `archboard semantic edit <board> --variant <name>` targets that variant, and a payload naming a different variant is overridden by the flag with a warning naming both, never refused
- [ ] #2 The generated help lists the option and the skill edit recipe shows it
- [ ] #3 The flag-wins rule reads the same across the variant commands: `semantic resolve` already overrides a payload variant, and says so the same way
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a `--variant` option to the `semantic edit` command contract (src/cli/commands/semantic.ts): ingress schema, declared parameter so generated help and the Commander parser carry it, description and a second example.
2. One shared helper in src/cli/commands/lib/semantic-input.ts, `targetedVariant`, folds the flag into the stated change: the flag alone selects the variant, an agreeing `variant` is one statement, and a different one is overridden by the flag with a warning naming both. Never a refusal.
3. The warning goes out as a command diagnostic, which the contract's presentation puts on standard error with every other warning, so the JSON answer on stdout is still the board.
4. `semantic resolve` (src/cli/commands/semantic-lifecycle.ts) already let the flag win silently: route it through the same helper so the two commands say the rule once, and say it in its description too.
5. tests/system/semantic-boards/variant-targeting.test.ts against an owned canvas: the flag targets the variant; flag and payload agreeing is accepted; two different ones land on the flag's variant, leave the payload's untouched, exit 0 and warn naming both on stderr with the board still on stdout; settling does the same through resolve.
6. Skill: edit.md and variants.md say the flag wins and the write warns naming both.
7. Verify: the focused system tests, the generic help owner, the contract artifacts owner, type-check, lint, format.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented on feat/semantic-boards.

- src/cli/commands/semantic.ts: `semantic edit` declares a `--variant <variant>` option (ingress schema, parameter, description, second example). `editedVariant` folds the flag into the stated batch before it is parsed against VariantEditInputSchema: the flag alone selects the variant, a batch `variant` equal to it (after trimming) is accepted, and a batch naming a different one throws CliUsageError (exit 2) quoting both, before anything is sent to the canvas.
- tests/system/semantic-boards/variant-targeting.test.ts (new, its own owned canvas): --variant lands the change on the proposal and leaves the current variant alone; flag and batch agreeing is accepted; two different ones exit 2, name both, and leave the version and every variant untouched. It is a new file because workflow.test.ts and lifecycle.test.ts are both at the 500-line lint cap.
- skills/archboard/references/edit.md: step 3 says --variant is how the variant is named (as on inspect/render/rasterize/adopt), that the batch field says the same thing, and that two different ones are refused; a second command line shows the flag. variants.md: proposals are edited with `semantic edit <board> --variant`, and an edit naming no variant edits the current architecture.

Verified: bun test tests/system/semantic-boards/variant-targeting.test.ts (3 pass); src/cli/command-routing/tests/help.test.ts + src/cli/command-contract/tests + comparison-answer (all pass; the help owner asserts every declared option appears in generated help); tests/system/cli/command-contract-artifacts.test.ts (3 pass); bunx tsc --noEmit clean; oxlint and oxfmt clean on the changed files.

Commits: 3ec50b86 (CLI + test), b77476a4 (skill references).

Reworked after the user's decision that --variant must always override a payload variant (a warning, never an error). Supersedes the refusal described above.

- src/cli/commands/lib/semantic-input.ts: new shared `targetedVariant(stated, asked)` returns the change to parse plus the diagnostics to print. The flag always wins; when the stated `variant` differs it emits one line — `Warning: --variant "X" and the stated change's \`variant\` "Y" name two different variants. The command line wins, so this lands on "X".` The comparison is of what was typed (an id against a name for the same variant reads as a difference and costs a line, not a write).
- src/cli/commands/semantic.ts: `semantic edit` uses the helper and prepends its diagnostics to describedWrite; the CliUsageError path is gone; the description now says the command line wins.
- src/cli/commands/semantic-lifecycle.ts: `semantic resolve` was overriding the payload variant silently; it now goes through the same helper and its description states the same rule, so criterion #3's two commands explain it once.
- Warning channel: command diagnostics, which the contract's output presentation writes to stderr (`presentation: ["diagnostics", "result"]`). Nothing was invented and stdout stays the machine-readable board — the test parses it.
- tests/system/semantic-boards/variant-targeting.test.ts: four cases — flag targets the variant; flag and payload agreeing; flag and payload differing lands on the flag's variant with the payload's untouched, exit 0, one stderr line naming both, and the version on stdout advanced by one; resolve settles the flag's draft and warns the same way.
- skills/archboard/references/edit.md and variants.md now say the flag wins and the write warns naming both (variants.md also points at resolve). SKILL.md and propose-compare.md left to their owner as instructed.

Verified: bun test tests/system/semantic-boards/variant-targeting.test.ts + lifecycle.test.ts (11 pass); workflow.test.ts + tests/system/cli/command-contract-artifacts.test.ts (19 pass); src/cli/command-routing/tests/help.test.ts + src/cli/command-contract/tests (47 pass); bunx tsc --noEmit clean for my files (the one remaining error, src/runtime/skill-evaluation/lib/report-markdown.ts, belongs to another worker's in-flight change); oxlint and oxfmt clean on every file I touched.

Commits: c664873c (CLI + shared helper + tests), 39cfd42a (skill references).
<!-- SECTION:NOTES:END -->
