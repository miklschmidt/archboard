---
id: TASK-222
title: Grade skill evaluation batches with a Claude runner chosen at grade time
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 09:56'
updated_date: '2026-09-15 10:40'
labels: []
dependencies: []
references:
  - src/runtime/skill-evaluation
  - scripts/evaluate-skill.ts
  - evals/README.md
  - evals/pins.json
  - docs/design/skill-evals/2026-09-14-batch-corrections.md
priority: high
type: feature
ordinal: 382000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The skill evaluation grader can only be Codex: the grader model, effort and version are batch inputs in evals/pins.json, the command line and event parsing are Codex-only, images reach the grader by --image, and one batch holds one grader directory. We want to grade a batch with Claude Code (claude-fable-5-1) and to grade the same batch with both graders to compare them, so the grader must be chosen when grading runs, not when authors run. Design decided in session on 2026-09-15: grader constants move out of the batch input digest into evals/graders.json; grade takes a required --grader codex|claude with --codex/--claude executable overrides defaulting to PATH lookup; new batches write graders/<name>/ and a legacy grader/ directory reads as codex; the Claude runner is claude -p with --output-format stream-json, --json-schema, one session resumed per batch (--session-id then --resume), --tools Read,Grep,Glob, --setting-sources "", --strict-mcp-config, a fixed short system prompt and the same user prompt as Codex, cwd at the staged workspace; image receipts derive from Read tool events in the stream (main image and every tile must be opened, else visual incomplete); a Read outside the workspace, a version mismatch or missing structured output files the call as an error; Claude usage is per call (session = sum), normalized into the existing usage shape with the raw usage and modelUsage kept; version pins are exact with refusal; a pin command rewrites version pins from PATH binaries. Probes verified on claude 2.1.269: structured_output field on resume, per-call usage, isolation flags leave no plugins/MCP/skills loaded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 bun run eval:skill grade <batch> --grader claude grades every pending run with claude-fable-5-1 at the pinned effort in one session resumed across chunks, files per-run verdicts and per-call usage under graders/claude/, and refuses a claude whose --version differs from the pin
- [x] #2 bun run eval:skill grade <batch> --grader codex behaves as today except its artifacts land under graders/codex/; a batch with a legacy grader/ directory reports as codex unchanged
- [x] #3 --grader is required; --codex and --claude override the executable and default to the PATH lookup of the grader name
- [x] #4 Grader constants (model, effort, version, posture, usage semantics per runner) live in evals/graders.json outside the batch input digest and are recorded in each grading session; changing them does not refuse grading of an existing batch
- [x] #5 A Claude verdict counts a capture as inspected only when the stream shows the main image and every required tile were read; otherwise the run is visual incomplete, and a Read outside the workspace, a missing structured output or a schema violation files the call as an error rather than a verdict
- [x] #6 Claude usage is recorded per call with the raw result usage, modelUsage and cost, normalized into the shared usage shape, and the session usage is the sum of calls; the report labels each grader usage with its runner semantics
- [x] #7 report writes one report.md and report.json carrying every grader that graded the batch, with per-grader tables and, for runs both graded, side-by-side verdicts, agreement share on semantic pass/fail and visual standing, and mean absolute score difference per dimension
- [x] #8 bun run eval:skill pin reads codex --version and claude --version from PATH, rewrites every version pin, and prints each change and whether it starts a new baseline
- [x] #9 Model-free tests own the Claude command line, the stream parser, the read receipts and the verdict filing through a fake claude executable; bun run check passes; evals/README.md, TESTING.md and the archboard-dev skill describe the runner choice; no author or grader model runs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move grader constants out of the batch input digest: evals/graders.json (codex and claude runner blocks: executable, version, model, effort, posture, usage semantics), GradersSchema and LoadedSuite.graders in suite.ts, pins.json loses codex.grader, inputDigest excludes graders, batch.json no longer needs them.
2. Runner seam: lib/grader-runner.ts defines the GraderRunner contract (version, argv, environment, one call returning session id, events text, per-call or cumulative usage, structured output text, read receipts, failure); lib/codex-grader.ts moves the existing Codex argv, CODEX_HOME filling, --output-schema/-o and --image delivery behind it; lib/claude-grader.ts implements claude -p with stream-json, --json-schema, --session-id/--resume, Read/Grep/Glob only, --setting-sources "" and --strict-mcp-config, a fixed system prompt and the shared user prompt; lib/claude-events.ts parses the stream (session id, Read tool uses and their results, permission denials, the result line: usage, cost, modelUsage, structured_output) and redacts base64 image payloads from the retained events file.
3. grading-run.ts becomes runner-agnostic: graders/<name>/ per grader with a shared graders/workspace/, legacy grader/ read as codex; session.json records runner, version, settings and per-call raw usage; callUsage and sessionUsage take the runner usage semantics (cumulative vs per-call); a Claude call that read outside the workspace, returned no structured output or violated the schema is filed as an error.
4. Image receipts: for Codex delivery stays the --image list; for Claude the receipt holds only images whose Read succeeded, and suppliedCaptures requires main image and every tile; suppliedCaptures/filedVerdict/graderUsage take the grader name.
5. Prompt: graderPrompt takes the delivery mode; only the attachment sentence differs between runners.
6. Reports: records built per grader; BatchReport = one Report per grader plus agreement over runs both graded (side-by-side verdicts, semantic and visual agreement share, mean absolute score difference per dimension); report.md carries per-grader sections and the agreement section; report.json {graders: {name: {report, runs}}, agreement}.
7. CLI: grade <batch> --grader <codex|claude> (required), --codex/--claude executable overrides defaulting to Bun.which(name); new pin command rewriting pins.json codex.version and graders.json versions from PATH binaries, printing each change and whether it starts a new baseline.
8. Tests: claude argv and posture flags; stream parser (reads, denials, result usage, structured output, redaction); receipts from reads incl. missing tile; a fake claude executable (Bun script) driving gradeBatch end to end: verdict filing, resume by session id, outside-read error, per-call usage sum; legacy grader/ layout reads as codex; agreement numbers; graders.json outside the digest; existing Codex owners updated to the new paths.
9. Docs: evals/README.md (runner choice, layout, Claude posture, usage semantics per runner, pin command, retained batch note), TESTING.md, skills/archboard-dev/SKILL.md, sync skills; bun run check; no author or grader runs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: evals/graders.json holds both runner pins outside the batch input digest (suite.ts GradersSchema, provenance.ts excludes graders); pins.json lost codex.grader. Runner seam lib/grader-runner.ts; Codex runner lib/codex-grader.ts (argv, CODEX_HOME, --image, -o, resume) and Claude runner lib/claude-grader.ts (claude -p stream-json, --json-schema, --tools Read,Grep,Glob, --setting-sources "", --strict-mcp-config, fixed system prompt, --session-id/--resume, PATH+HOME env with CLAUDE_CONFIG_DIR/ANTHROPIC_API_KEY forwarded) with lib/claude-events.ts parsing the stream (session, reads with image/error outcome, permission denials, per-call usage normalized as input = uncached + cache read + cache write, cost, modelUsage, structured_output) and redacting base64 image payloads in the retained events file. grading-run.ts is runner-agnostic: graders/<name>/ with shared graders/workspace/, legacy grader/ read as codex (lib/grader-layout.ts); session.json records runner, version, settings, raw usage; usage semantics per runner in lib/grader-usage.ts. Prompt differs between runners only in the image delivery sentence. Reports: records per grader, BatchReport with one Report per grader and agreement (lib/report-agreement.ts); report.json is {graders:[{grader,report,runs}],agreement}. CLI: grade --grader required, --codex/--claude override defaulting to Bun.which; pin command (lib/pin-versions.ts). Tests: claude-grader.test.ts, claude-grading.test.ts with tests/fake-claude.ts driving gradeBatch end to end (verdicts, receipts incl. unopened tile, session resume, per-call sum, outside read and no-output errors, version refusal, legacy layout), grader-agreement.test.ts (agreement, batch markdown, pin). Docs: evals/README.md, TESTING.md, skills/archboard-dev/SKILL.md synced. Probes on claude 2.1.269 verified: structured_output on resume, per-call usage, isolation flags load no plugins/MCP/skills, reads outside cwd denied by Claude Code with a permission_denied event.

Validation: bunx tsc --noEmit clean; lint:policy and lint:baseline clean; fmt:check clean; bun test --isolate src/runtime/skill-evaluation 105 pass (claude-grading.test.ts drives gradeBatch through the fake claude: per-run verdicts, receipts, --session-id then --resume with the same id, per-call usage summed 40 tokens, unopened tile leaves no receipt, outside read and no structured output filed as errors, version 0.0.1 refused before any call, legacy grader/ reads as codex; grader-agreement.test.ts covers agreement shares and score differences, per-grader markdown with both usage labels, and pin rewriting pins.json codex.version with startsNewBaseline true and graders.json without touching other fields). CLI: grade refuses a missing or unknown --grader, pin --help present. bun run eval:skill check: 15 scenarios, 15 fixtures, 14 coverage parts. bun run check: lint, fmt:check, type-check, build:frontend pass; test:modules 3068 pass with 4 pre-existing failures in semantic-renderer/semantic-rasterizer tests that fail identically on the stashed untouched tree; test:system (163 pass), test:repository (8 pass) and test:serial-browser (all pass, exit 0) run explicitly. No author or grader model run; probes were three tiny claude -p calls outside the harness.

Follow-up fix: a batch authored before graders.json existed (e.g. .skill-evals/2026-09-15T03-21-37-188Z) recorded pins that still carried codex.grader and older prose, so its input digest no longer matched. assertBatchInputs now recomputes the digest from the batch's own recorded pins and accepts it when those differ from today's only in the grader block, $comment and usageSemantics; a changed author pin still refuses. Covered in provenance.test.ts; verified report accepts that batch. The 2026-09-14 batch still refuses because TASK-212 changed its scenario inputs, as its corrections document says.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Grading a skill evaluation batch now names its grader at grade time: --grader codex keeps the Codex runner, --grader claude runs claude-fable-5-1 through claude -p with stream-json, --json-schema, Read/Grep/Glob only, no operator settings, one resumed session, and read receipts derived from the stream. Grader constants moved to evals/graders.json outside the batch digest, batches hold graders/<name>/ with a shared workspace and legacy grader/ reads as codex, usage is counted per runner, the report carries one section per grader plus their agreement, and eval:skill pin rewrites version pins from PATH. Verified with model-free tests including a fake claude executable driving a whole pass, the full lint/type/format gate, and every test lane (4 pre-existing unrelated module failures reproduce on the untouched tree).
<!-- SECTION:FINAL_SUMMARY:END -->
