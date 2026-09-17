---
id: TASK-256.07
title: Say where the proposal leaves each relationship
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 17:40'
updated_date: '2026-09-17 19:45'
labels: []
dependencies: []
references:
  - src/shared/semantic-board/lib/compare.ts
parent_task_id: TASK-256
ordinal: 457000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S02 asks the author to report what the comparison shows, and 4 of 6 runs of the 2026-09-17T16-31-08 batch failed it — two in each arm, so the TASK-243 and TASK-253 wording did not move it. Every failing answer named the removed stacks and the added part and stopped there, leaving out the two context relationships that now land on the new part, which is the whole point of the proposal. There is nothing for the author to read it off: the semantic namespace is new, edit, branch, show, resolve, adopt, inspect, render and rasterize, and none of them prints a comparison. compareVariants (src/shared/semantic-board/lib/compare.ts) runs in the canvas, in the renderer overlay and in the harness check, never in an answer to the agent. semantic edit returns the whole board document, and propose-compare.md step 3 tells the author to check "the answer's comparison", which no answer carries. So the author is left to report from the change it intended, or to read the overlay colours off its own picture, and half the runs reported the parts and forgot the relationships.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An agent can read the comparison between a variant and its predecessor from the CLI: what was added, removed, changed and left alone, relationships included with the endpoints they now have
- [x] #2 The propose-and-compare recipe has the author read that comparison and answer from it, and stops pointing at a comparison no answer carries
- [x] #3 The recipe's worked example shows the answer naming a relationship whose endpoint moved
- [x] #4 The skill text stays about archboard's own source and passes the eval:skill check leak guard
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
CLI SURFACE (recorded before implementing, since it is new agent-facing contract)

  archboard semantic compare <board> [--variant <id|name>]

Shape and why:
- Lives in the semantic namespace beside show/inspect/render: positional board name, optional --variant
  resolved by id or name and defaulting to the current variant, exactly as 'semantic inspect' and
  'semantic render' spell it. Nothing new is invented about how a board or a variant is addressed.
- Schema-driven contract through defineCommand: one Zod result schema, one 'json' output case,
  declared shared:['url'], prerequisites:['server'], effects:['read'], one GET
  /api/semantic-boards/board relationship, refusals [CANVAS_UNREACHABLE, NO_PREDECESSOR].
- It compares the named variant against its DIRECT PREDECESSOR (variant.parent) and takes no
  --against. That is the one comparison the product already draws everywhere (canvas overlay,
  renderer overlay, evaluation harness); a free-form 'compare any two variants' would be a second
  meaning of comparison that nothing else in the product shows.
- No new server route and no new store code: compareVariants is pure, so the command reads the
  aggregate through readSemanticBoardAnswerOnCanvas and compares locally, the same way
  'semantic inspect' runs the pure inspectGroup locally.
- Refuses with NO_PREDECESSOR (exit 2, CliUsageError) when the named variant is a root, naming the
  variants of this board that do have one.

Result JSON (stdout):
  { success, board, version, variant {id,name,lifecycle}, against {id,name,lifecycle},
    nodes[], edges[], flows[], steps[], walkthroughs[], beats[], warnings[] }
Every entry is { id, standing: added|removed|changed|unchanged, fields: [{field,before,after}], ...identity }.
- standing (not 'kind') because 'kind' is already a node's and a relationship's own field.
- Relationship and step entries carry from/to ids AND fromName/toName, so 'where it now lands' is
  readable without cross-referencing; names resolve over the variant first, then the predecessor, so
  a removed endpoint still has a name.
- Removed subjects come back as the predecessor had them (compareVariants already does this), so the
  answer says what was taken away as well as what is there.
- Unchanged subjects are included: AC#1 asks for what was left alone.
- SubjectStandingSchema in shared/semantic-board/lib/rendering.ts is exported from the module index
  and reused, rather than a second spelling of the four standings.

stderr diagnostics (for a person, structure not prose): a counts line per subject kind that moved,
then one line per added/removed/changed relationship saying where it now lands in node names.

Steps:
1. Export SubjectStandingSchema from @/shared/semantic-board/index.
2. New src/cli/commands/semantic-compare.ts: result schema, pure answer assembly exported for tests,
   contract, diagnostics.
3. Register 'compare' under semantic in src/cli/commands/run.ts.
4. Add the 'semantic compare' entry to docs/design/cli-command-audit.json and bump surface counts,
   the same way TASK-207 added 'semantic inspect'.
5. Owner: src/cli/commands/tests/comparison-answer.test.ts over the pure assembly - added, removed,
   changed and unchanged in one answer, a relationship whose endpoint moved coming back as changed
   with its new endpoints and their names, a removed relationship still naming its old endpoints,
   and steps/beats carrying their place. (No canvas is started: routing and registration are already
   owned by the discovery-driven CLI system owner and the contract-artifacts owner.)
6. Point skills/archboard/references/propose-compare.md step 3 at 'semantic compare' instead of
   'the answer's comparison', and make its worked example name a relationship whose endpoint moved.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented.

CLI surface added: `archboard semantic compare <board> [--variant <id|name>]`, in
src/cli/commands/semantic-compare.ts and registered under semantic in src/cli/commands/run.ts
between show and inspect. It reads the aggregate through readSemanticBoardAnswerOnCanvas and runs
the pure compareVariants locally - no new server route, no store change - the way semantic inspect
runs the pure inspectGroup locally. Refuses a root variant (NO_PREDECESSOR, exit 2) naming the
board's derived variants.

Answer (stdout JSON): success, board, version, variant, against, then nodes/edges/flows/steps/
walkthroughs/beats, each entry { id, standing, fields:[{field,before,after}], ...identity }, sorted
by id so two readings are comparable. Relationship and step entries carry from/to plus fromName/
toName, resolved over this variant first and the predecessor second, so a removed relationship still
says which parts it joined and a moved one says where it now lands. 'standing' rather than 'kind'
because a part and a relationship each already have a 'kind'. Unchanged subjects are included.
stderr carries counts per subject kind and one line per relationship that is not unchanged, saying
where it lands and - when an end moved - which part it used to land on.

SubjectStandingSchema (the four standings, already in shared/semantic-board/lib/rendering.ts for the
render answer) is now exported from the module index and reused rather than respelled.

docs/design/cli-command-audit.json gained the 'semantic compare' entry (introducedBy TASK-256.07)
and surface counts moved to 38 subcommands / 71 paths, the same way TASK-207 added semantic inspect.

skills/archboard/references/propose-compare.md: step 2 now restates the two relationships by the ids
step 1 read with their new endpoint and their existing labels (so the worked example is a move, not
a deletion beside an addition, per TASK-256.05's rule), and runs semantic compare beside the two
rasterizes. Step 3 no longer points at 'the answer's comparison' that no answer carries: it reads
semantic compare's answer, says what that answer contains, and reports from it - naming the two
relationships the comparison calls 'changed' with 'to' moved from Lock files to Lease table.

Validation (targeted, --max-concurrency=1, no canvas started deliberately):
- bun test src/cli/commands/tests/comparison-answer.test.ts: 7 pass (new owner over the pure answer)
- bun test src/cli/command-contract/tests src/cli/command-routing/tests: 47 pass
- bun test tests/system/cli/command-contract-artifacts.test.ts: 3 pass (audit renders, generation is
  deterministic, checkout unchanged)
- bun test tests/system/repository-policy/boundaries.test.ts: 8 pass
- bun test src/shared/semantic-board/tests: 139 pass
- bunx tsc --noEmit: clean; type-aware oxlint on the changed source: clean; oxfmt applied
- bun run eval:skill check: suite ok, 15 scenarios, 15 fixtures, 14 coverage parts (AC#4 leak guard)
- bun run generate:cli-contract: the new command appears in the audit table and the proof reference

Not verified here: a live end-to-end run against a board that has a predecessor, because starting a
canvas was out of scope for this worker. One invocation of 'semantic compare' did reach the real
board-read path (it refused with 'no semantic board at <path>'), which proves routing, parsing, the
server prerequisite and the board client; that invocation auto-started a canvas, which was stopped
again immediately (archboard stop, pid confirmed gone).

Left for whoever owns the skill's own text: SKILL.md's 'Reads' bullet and references/read.md still
list only 'semantic show', 'semantic' and 'semantic inspect --group'; 'semantic compare' belongs
there too. Those files are owned by other workers in this batch.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard semantic compare <board> [--variant] answers what a proposal did to its predecessor: every subject as added, removed, changed or unchanged, each relationship carrying the parts its ends now land on and the fields that moved. It compares against the direct predecessor, the one comparison the canvas, the renderer overlay and the harness already draw, and runs the pure compareVariants locally with no new server route. The propose-and-compare recipe now reads that answer instead of one no answer carried, and its worked example restates the moved relationships by id. Verified in the wave-2 gate, run lane by lane because the box was too short on memory for bun run check in one process: lint, fmt:check and type-check clean, the frontend build, 3450 module tests, 163 system tests, the repository lane, and the full serial browser lane at exit 0 with no failures. The derived skills were synced with bun scripts/sync-skills.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
