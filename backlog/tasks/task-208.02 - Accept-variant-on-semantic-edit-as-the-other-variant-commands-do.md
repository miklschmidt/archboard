---
id: TASK-208.02
title: Accept --variant on semantic edit as the other variant commands do
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 02:26'
updated_date: '2026-09-18 11:53'
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
- [x] #1 `archboard semantic edit <board> --variant <name>` targets that variant, and a payload naming a different variant is overridden by the flag with a warning naming both, never refused
- [x] #2 The generated help lists the option and the skill edit recipe shows it
- [x] #3 The flag-wins rule reads the same across the variant commands: `semantic resolve` already overrides a payload variant, and says so the same way
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

Round 2 review findings addressed.

1. (must-fix) The override warning is now emitted at the point of detection through `context.diagnostic(...)` in both semantic.ts and semantic-lifecycle.ts, not carried in the returned `diagnostics`, which are only presented once a write comes back. A mistyped --variant is refused by the server, and the author still sees what the flag overrode. stdout is untouched; the success-path ordering is unchanged because the warning was already first.
2. (must-fix) The line no longer claims the two are different variants — an id and a name for one variant are two spellings the CLI cannot tell apart without the read this task exists to spare, and that read would sit outside the lease. It now says what happened: `Warning: --variant "X" overrides the stated change's \`variant\` "Y"; this lands on "X".` The helper's comment records why identities are not resolved first.
3. (should-fix) New pure owner src/cli/commands/tests/targeted-variant.test.ts covers all branches — no flag with and without a stated variant, flag alone, agreeing (whitespace included), overriding, and a stated variant that is not a name — asserting the resulting `stated.variant` and the diagnostics count, so a regression that warned on every --variant fails. Canvas case 2 dropped; the canvas suite keeps landing and side effects. The module-entrypoints lint rule forbids a test importing `commands/lib`, so `targetedVariant` is re-exported from the root file src/cli/commands/semantic.ts with a comment saying why.
4. (should-fix) `toHaveLength(1)` restored on both warning assertions, and a fourth canvas case covers the refused write that must still warn.
5. (optional) The positional `variants[0].content.nodes[0]` double cast is gone; a new `idOfPart(variant, part)` helper finds the part by name.
6. (optional) The @-address refusal in src/server/canvas/lib/semantic-write-requests.ts now names --variant alongside the stated change. Its assertion in lifecycle.test.ts was a prose lock; it now asserts the refusal quotes the address it would not take, which is the behaviour.
8. (optional) edit.md no longer caches a list of variant commands (already incomplete); it says "every variant command".

Left to the coordinator as instructed: propose-compare.md (finding 7) and `bun scripts/sync-skills.ts` (finding 9). Correction to the earlier note: tests/** is capped at 500 lines, src/** at 600.

Verified: bun test src/cli/commands/tests/targeted-variant.test.ts (6 pass); tests/system/semantic-boards/variant-targeting.test.ts + lifecycle.test.ts + workflow.test.ts (27 pass); src/cli/command-routing/tests/help.test.ts + src/cli/command-contract/tests + src/cli/commands/tests (60 pass); tests/system/cli/command-contract-artifacts.test.ts (3 pass); tsc clean for every file I touched (remaining errors are another worker's renderer test); oxlint and oxfmt clean.

Commits: 6194678a (code and tests), bac0a3b8 (edit.md).

Round 3: review clean. Two cosmetic nits taken — the unit owner's header no longer miscounts the branches it covers, and the warning ends "this write names \"X\"" rather than "this lands on \"X\"", which read as a contradiction beside the server's "no variant called X" on the next line and is true in both branches. Re-verified after the change: the unit owner (6 pass), the canvas suite (4 pass), both lint lanes and oxfmt clean on the two files.

Raised and deferred: the reviewer would rather `targetedVariant` were not re-exported from semantic.ts — the rule is shared equally by `semantic edit` and `semantic resolve`, so naming either as its owner is arbitrary, and semantic.ts is at 524 of its 600-line cap, so a later split would move the test's import for no behavioural reason. It proposes promoting lib/semantic-input.ts to its own module-root entrypoint (src/cli/commands/semantic-input.ts), which docs/agents/boundaries.md blesses. Judged defensible as it stands (the re-export is documented and the precedent is install-skill.ts:411-413, not comparisonAnswer, which is implemented in the file that exports it) and deferred to the user rather than widening this task.

Commit: 22d3523d.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
`archboard semantic edit <board> --variant <id|name>` now targets a variant the way inspect, render, rasterize, adopt and resolve already do, so a variant edit no longer costs a refused call first.

Where the flag and the stated change's own `variant` are not written the same, the flag wins and the write says so: one warning line naming both, emitted at the point of detection through `context.diagnostic`, so it survives a write the server refuses — which is exactly the run a mistyped flag produces. It never refuses, and stdout stays the board alone. The line says what happened ("--variant \"X\" overrides the stated change's \`variant\` \"Y\"; this write names \"X\"") rather than claiming the two are different variants, because resolving an id against a name would need the board read this change exists to spare, outside the lease.

One helper, `targetedVariant`, carries the rule, so `semantic edit` and `semantic resolve` — which already let the flag win, silently — explain it once and the same way. The generated help lists the option from the contract; the skill's edit recipe and variants page state the rule; the @-address refusal names --variant as a place the variant can be said.

Verified: src/cli/commands/tests/targeted-variant.test.ts covers every branch of the rule as a pure function (6 pass) and fails if a regression warns on every --variant; tests/system/semantic-boards/variant-targeting.test.ts drives a real canvas (4 pass) for the flag targeting a proposal, the override landing on the flag's variant with the payload's untouched and exit 0, a mistyped flag warning before its refusal with the version unmoved, and resolve behaving identically; lifecycle.test.ts and workflow.test.ts still pass (27 across the three); the generic help owner and the contract-artifact owner pass (60 and 3); `archboard semantic edit --help` lists --variant; tsc, oxlint and oxfmt clean on every file touched. Independently reviewed over three rounds, the last clean against the running CLI.

Deferred to the user: promoting lib/semantic-input.ts to its own module-root entrypoint so `targetedVariant` need not be re-exported from semantic.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
