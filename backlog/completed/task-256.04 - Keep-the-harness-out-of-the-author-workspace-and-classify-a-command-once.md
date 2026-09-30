---
id: TASK-256.04
title: Keep the harness out of the author world and stop losing what a command was
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 17:39'
updated_date: '2026-09-17 19:01'
labels: []
dependencies: []
references:
  - src/runtime/skill-evaluation/lib/classify.ts
  - .skill-evals/2026-09-17T16-31-08-093Z/report.md
parent_task_id: TASK-256
ordinal: 454000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Two pieces of harness bookkeeping showed up in the 2026-09-17T16-31-08 batch, and investigating them found a third that is worse.

Harness files sit in the author's own world. prepareRunDirectory (src/runtime/skill-evaluation/lib/isolation.ts:48-89) builds the run root with the author's cwd at flask/ and, beside it, snapshot/ (the pre-run board state the checks diff against, written before the author starts), author.jsonl (the author's transcript, streamed live during the run), and codex-home/ holding the operator's real Codex credentials. Baseline S01 r3 read snapshot/Flask_JSON.json instead of running semantic show; candidate S08 r2 ran rg over its own author.jsonl. Reads cannot be forbidden — Codex workspace-write restricts writes, not reads — so the only real remedy is to move the harness's own records out of the directory the author works in.

The exposure detector has blind spots that matter more than either. exposureOf (classify.ts:272-284) knows the checkout's evals/ and skill-evaluation source, and other runs under <batch>/runs/ — but not <batch>/blinding.json, which maps every anonymous run id to its arm, nor <batch>/batch.json, nor the OTHER arm's skill package in the checkout (readsSkill at classify.ts:98-100 calls any path matching skills/archboard innocent discovery). A sibling run's bundle.json, which carries expectedFeatures and the harness outcomes verbatim, is detected but not prevented, and with concurrency 3 siblings finish mid-batch. Baseline S08 r2 read paths above its own run and nothing recorded it: every run in the batch reports exposure 0/0/0.

The classification claim in the earlier description was wrong. There is one classifier, called once (classifyCommands, classify.ts:292, from author.ts:296). The count disappears afterwards: RunManifestSchema.commandCounts (records.ts:55-61) is a bare z.object without a product-source key, so parsing run.json strips it, and records.ts:204 then supplies a constant 0. Nine runs recorded a product-source read; report.json says 0 for all forty. The grader reads the real class from bundle.json and writes concerns about reads the report then denies. And the rule itself is broken: readsProductSource (classify.ts:167-173) matches any script containing the checkout root, but the whole batch tree lives under that root, so all 17 hits are a run reading its own vault, snapshot or Flask checkout. Not one is a read of archboard's source.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The harness's own records — the board snapshot, the author transcript, the verdicts and the bundle — do not sit in the directory the author works in
- [x] #2 A read of the batch tree outside the run, of blinding.json, or of either arm's skill package in the checkout is recorded as exposure
- [x] #3 The report reads the class each run recorded, for every class, and a class cannot be dropped silently by the manifest schema
- [x] #4 A read inside a run's own directory is never classified as a read of the product's source
- [x] #5 Fast tests own the manifest round-trip and the classification rule
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Split the run directory in two (isolation.ts). The author's world moves to <run>/world/ and holds only what the author owns: flask/, vault/, home/, bin/, state/, config/, tmp/, repos.json and archboard.log (the CLI refuses to start when LOG_FILE_PATH names a directory it cannot write, so the CLI log must stay inside the sandbox). Everything the harness keeps stays at <run>/: snapshot/, author.jsonl and the other author streams, last-message.md, boards/, renders/, captures/, canvas.log, outcomes.json, guardrails.json, commands.json, file-changes.json, bundle.json, run.json, and codex-home/ with the operator's credentials. writable_roots becomes [world], so the author can no longer write a harness record either; Codex's own process (unsandboxed) still writes codex-home/ and last-message.md.

Relocation consequence: nothing the report, the grader staging or resume reads moves. run.json, bundle.json, boards/, renders/ and captures/ keep their paths under <batch>/runs/<arm>/<scenario>/<n>/, so the seven batches already under .skill-evals/ report exactly as they do now; only the author's own world descends one level, and a re-run of a failed job wipes and rebuilds its run directory anyway.

2. Teach the exposure detector the whole batch tree (classify.ts). ExposureRoots.runRoot becomes ExposureRoots.world (the only part of the batch tree a run may read) and gains skillPackages. 'other-run' widens from <batch>/runs/ to any mention of the batch root outside the run's own world, so blinding.json, batch.json, a sibling run's bundle.json and the run's own harness records above its world are all recorded. A new kind 'skill-package' records a read of either arm's package in the checkout (skills/archboard and pins.baselineSkill.location) - both are batch provenance, and reading either is reading what is being measured. author.ts passes the new roots.

3. Stop the product-source rule from matching the batch tree (classify.ts). readsProductSource ignores a mention of the archboard checkout that continues into the batch root, so a run reading its own vault, snapshot, Flask checkout or records is never called a read of archboard's source; the module-layout pattern still catches a real one.

4. Keep the class the run recorded (new lib/run-manifest.ts). Move RunManifestSchema there beside a writeRunManifest the author uses for both the completed and the failed manifest, so one module owns what is written and what is read. commandCounts carries every CommandClass, with a 'satisfies Record<CommandClass, ...>' that fails type-check when a class is added and is not read; each count defaults to 0 so a manifest written before a class existed still parses. exposure gains skill-package with the same default. records.ts drops the constant 'product-source': 0 and re-exports the schema.

5. Tests. evidence.test.ts (the classification owner) moves to the new layout and gains the rules: a read inside the run's world or its records is not product-source, a read of the checkout's source still is; the batch root outside the world, blinding.json and either skill package are exposure. A new tests/run-manifest.test.ts owns the round trip: a manifest written by the harness with a product-source count and a skill-package exposure is read back with both intact, and an old manifest without them still parses. Update the exposure literals in the report and grader tests for the new kind.

6. Run the targeted lanes: bun test on the skill-evaluation tests (evidence, run-manifest, report-completeness, blinding-and-reports, grader-agreement, failed-captures, events), plus bun run eval:skill check. No full gate, no batch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented, all four repairs.

Harness records left the author's world (isolation.ts). prepareRunDirectory now lays the author's world at <run>/world/ — flask/, vault/, home/, bin/, state/, config/, tmp/, repos.json and archboard.log — and keeps snapshot/, author.jsonl and the other author streams, last-message.md, boards/, renders/, captures/, canvas.log, outcomes.json, guardrails.json, commands.json, file-changes.json, bundle.json, run.json and codex-home/ at the run directory beside it. writable_roots is now [world], so the author cannot write a harness record either. archboard.log had to stay inside the world: src/runtime/engine/logger.ts throws when LOG_FILE_PATH names a directory it cannot write, which would have killed every CLI call the author makes. codex-home/ outside the sandbox is safe: the 2026-09-14 batch's grader ran with sandbox_mode = read-only and no writable_roots at all and still wrote .skill-evals/2026-09-14T13-50-10-617Z/grader/codex-home/sessions/, so Codex's own process is not subject to the sandbox it applies to the commands it runs.

Nothing the report, the grader staging or resume reads moved, so the seven saved batches read exactly as before.

Exposure (classify.ts). ExposureRoots.runRoot became .world and gained .skillPackages; 'other-run' widened from <batch>/runs/ to any mention of the batch root outside the run's world, which takes in blinding.json, batch.json, a sibling run and the run's own records; a new kind 'skill-package' records a read of either arm's package in the checkout (skills/archboard and pins.baselineSkill.location, the two packages batch provenance already hashes). The kind is additive and defaults to 0, so no saved manifest stopped parsing.

Product source (classify.ts). readsProductSource ignores a mention of the archboard checkout that continues into the batch root, so a run reading its own vault, snapshot, records or Flask checkout is no longer called a read of archboard's source; the module-layout pattern still catches a real one, and a command naming both still counts.

The class the run recorded (new lib/run-manifest.ts). The schema that reads run.json now also writes it: writeRunManifest validates against RunManifestSchema before writing, and both the completed and the failed manifest go through it. commandCounts names every CommandClass with 'satisfies Record<CommandClass, z.ZodDefault<z.ZodNumber>>' and each count defaults to 0; records.ts dropped the constant 'product-source': 0.

Verification (no full gate; it runs centrally).
- bun test src/runtime/skill-evaluation/tests/ — 145 pass, 0 fail, 21 files, 3.0s. Includes failed-captures.test.ts, which executes a real run end to end against a fake checkout and reads the records back from the run directory.
- Red first, then green, for the two rules the acceptance criteria name: with readsProductSource restored to its old form, evidence.test.ts fails 2 tests (a run reading its own vault called product-source); with 'product-source' removed from the manifest schema, run-manifest.test.ts fails 2 tests (the count read back as undefined and as 0).
- A class cannot be dropped silently: adding a class to CommandClass fails type-check at run-manifest.ts:34 (the satisfies clause), records.ts and classify.ts. Checked by adding one and removing it again.
- Read-only over the saved batches, without rewriting a report: buildBatchReport now reads 9 of the 90 runs of 2026-09-17T16-31-08 as having read product source, 17 reads in all (the saved report.json, written by the old reader, says 0 for every run), and 11 runs / 21 reads for 2026-09-16T00-32-53. Every saved manifest still parses. Those recorded reads are the ones the description identifies as a run reading its own tree; the classifier fix applies to new runs, and no saved classification was rewritten. Note the description says forty runs; the batch holds ninety manifests.
- bun x tsc --noEmit: clean for every file this task touches (src/runtime/skill-evaluation/lib/outcomes-family.ts reports errors from another worker's in-flight edit in the same wave).
- Policy lint, baseline lint over the module's tests, and oxfmt --check: clean.
- bun run eval:skill check: suite ok, 15 scenarios, 15 fixtures, 14 coverage parts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The author's world moved to <run>/world/ with writable_roots pointing only there, so the snapshot, transcript, verdicts and bundle sit beside it out of reach; exposure now covers the batch tree outside the run, blinding.json and either arm's skill package; and the manifest schema names every command class under a type-level guard so the report stops denying reads the run recorded. Verified in the wave gate: lint, fmt:check and type-check clean, the frontend build, 3572 module tests, the system lanes for semantic-boards/cli/canvas-state/process-contracts/code-targets, the repository lane, and the full serial browser lane at exit 0 with no failures.
<!-- SECTION:FINAL_SUMMARY:END -->
