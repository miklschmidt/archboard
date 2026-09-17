---
id: TASK-256.13
title: 'A refused key says where it is, like every other refusal'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 18:12'
updated_date: '2026-09-17 19:01'
labels: []
dependencies: []
references:
  - src/shared/semantic-board/lib/input.ts
parent_task_id: TASK-256
ordinal: 464000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A payload with an unknown key is refused with `Error: Unrecognized key: "emphasis"` followed by the usage block — the key, and nothing about where it sat. Every other refusal in the same family gives a path: a wrong relationship kind in the same batch answered `variants.3tPbdMhM.content.edges.oN6O907D.kind: "return" is not configured`. The strict-object rejection is correct — emphasis is a relationship field and FlowStepInputSchema (src/shared/semantic-board/lib/input.ts:119-131) is strict — but the author cannot tell which of several places it used the key is the offending one. In the 2026-09-17T16-31-08 batch a baseline S07 run put emphasis on four flow steps AND on the relationships, where it is legal; the refusal named only the key, so the author stripped emphasis from the whole payload and lost it where it belonged.

The same shape as the two other findings in this batch: the product reports that something is wrong and withholds what the author needs to act. One refusal is one author turn spent guessing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A refusal for an unrecognized key names the path to it, as a refusal for a bad value already does
- [x] #2 A payload carrying the same unknown key in two places names both, or names the first and says how many
- [x] #3 A test owns the refusal's shape without locking its wording
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Locate the renderer: `parseInput` in src/cli/command-contract/lib/execution.ts is the one place a CLI input refusal is worded, for both the argv ingress and every mid-handler `context.parse` (so every semantic write). It throws `parsed.error.issues[0]?.message`, dropping `issue.path` and every issue after the first.
2. Confirm Zod carries what is missing: a probe against zod 4.4.3 shows an `unrecognized_keys` issue carries `path: ['flows', 0, 'steps', 0]` and `keys: ['emphasis']`, one issue per offending object. Nothing in src/shared/semantic-board/lib/input.ts needs to change; the strict objects are right and already report where they sat.
3. Make the refusal say the location the way the rest of the product does: prefix each issue with its dotted path (`flows.0.steps.0: Unrecognized key: \"emphasis\"`), the spelling the store's vocabulary refusal already uses; an issue with an empty path keeps its bare message.
4. Name more than one place: list the first few issues joined on one line and, when there are more, say how many remain, so the same key used twice is named twice rather than stripped everywhere.
5. Own it in src/cli/command-contract/tests/runner.test.ts, the owner of the runner: a proof contract whose handler parses a nested strict schema, asserting the refusal's structure — exit status 2, a path naming the offending element, both offending locations present, and a count when there are more than the listed few — never its wording.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The renderer was the whole of it; no schema changed.

**What was dropping the path.** \`parseInput\` in \`src/cli/command-contract/lib/execution.ts\` is the single place a CLI input refusal is worded — for the argv ingress and for every mid-handler \`context.parse\`, which is how every semantic write validates its stated document. It threw \`parsed.error.issues[0]?.message\`, so both the path and every issue after the first were discarded. A probe against zod 4.4.3 confirmed an \`unrecognized_keys\` issue already carries \`path: ["flows", 0, "steps", 0]\` and one issue per offending object; `src/shared/semantic-board/lib/input.ts` needed no change, and none was made.

**The change.** `parseInput` now renders each issue as `<dotted path>: <message>`, the spelling the store already uses for a location (`variants.<id>.content.edges.<id>.kind: ...`), lists the first few and counts the rest, and leaves a path-less issue with its bare message. Against the real `VariantEditInputSchema`, the payload from the finding now answers:

`edges.0.emphasis: Invalid option: expected one of "normal"|"hero"|"muted"; flows.0.steps.0: Unrecognized key: "emphasis"; flows.0.steps.2: Unrecognized key: "emphasis"; flows.0.steps.3: Unrecognized key: "emphasis"; and 2 more like it`

— which is the fact the author was missing: the key is a value problem on the relationship and an unknown key on the steps, and the steps are named.

**Owner.** Four cases in `src/cli/command-contract/tests/runner.test.ts` (the runner is what parses input), driving a proof contract whose handler validates a nested strict document. They assert structure only: exit status 2 on a `CliUsageError`, nothing on stdout, the dotted location of each refused element, that a legal sibling is not named, that a payload with more offending places than the refusal lists still accounts for the remainder by number, and that a problem with no location produces no empty prefix. No prose, snapshot or full-output equality.

**Evidence.**
- `bun test src/cli/command-contract/tests/runner.test.ts` — 17 pass, 0 fail.
- Reverting only the thrown line to `issues[0]?.message` makes exactly the three new location cases fail, the first with the reported `Unrecognized key: "emphasis"` and nothing else; restoring it passes again.
- `bun test src/cli` — 47 pass, 0 fail. `bun test tests/system/cli/command-contract-artifacts.test.ts` — 3 pass, 0 fail.
- `bunx tsc --noEmit` clean; both lint lanes clean over `src/cli/command-contract`.

**Two notes for whoever reads this next.** The task says a bad value already reports a path; the example it quotes (`variants.<id>.content.edges.<id>.kind: ... is not configured`) comes from the vault vocabulary check in `src/runtime/semantic-board-store/lib/vocabulary.ts`, not from this renderer — a schema-caught bad value was losing its path too, and now does not. And the HTTP write boundary (`src/server/canvas/lib/semantic-write-requests.ts`) already used `z.prettifyError`, so the server route named the path all along; the CLI, which refuses first, was the one that did not.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every CLI input refusal names where the problem is: parseInput was throwing issues[0].message alone, so a bad value lost its path as surely as an unknown key did. It now renders each issue as a dotted path with its message, lists the first few and counts the rest. Verified in the wave gate: lint, fmt:check and type-check clean, the frontend build, 3572 module tests, the system lanes for semantic-boards/cli/canvas-state/process-contracts/code-targets, the repository lane, and the full serial browser lane at exit 0 with no failures.
<!-- SECTION:FINAL_SUMMARY:END -->
