---
id: TASK-274.02
title: Re-ask the grader once when a verdict misses what the harness requires
status: Done
assignee:
  - '@claude'
created_date: '2026-09-19 00:40'
updated_date: '2026-09-19 01:13'
labels: []
dependencies: []
parent_task_id: TASK-274
priority: high
ordinal: 486000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In batch 2026-09-18T23-44-56-390Z the grader passed 5 runs' pictures but left one declared capture without an observation (rubric.md requires one per capture, grader.ts everyCaptureSeen enforces it), so their visual standing is 'incomplete'; and it answered 2 S14 runs with invented feature names instead of the declared ones (off-checklist, set aside). The harness detects both only at report time and never asks again, so a grader lapse costs a run's comparison. Grading is in src/runtime/skill-evaluation/lib/grading-run.ts, grader-runner.ts, claude-grader.ts, codex-grader.ts, grader.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After a grading call returns, each run's verdict is checked for the harness's own obligations: every declared feature answered by its declared name and none invented, and an observation for every capture supplied to it
- [x] #2 A verdict short of them is sent back once in the same grader session, naming exactly what is missing for which run; the answer replaces the verdict only if it validates, and the attempt is recorded
- [x] #3 A verdict still short after the retry is filed as today, so the report's incomplete and off-checklist handling is unchanged
- [x] #4 Works for both grader runners (claude and codex) and does not change the batch input digest; grader usage from the retry is counted
- [x] #5 Behavioural tests own the check and the single retry, with no live model call
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. grader.ts: one shortfall check, verdictShortfall(expected, captures, verdict, supplied), built from checklistGaps (declared features unanswered, names invented) and the capture-observation logic shared with everyCaptureSeen (declared, taken captures without a supplied, inspected and observed entry; nothing when a capture failed, since no answer can mend that). A retry prompt that continues the session, names each run and what it lacks, relists the pictures, and ends like every grading prompt.
2. grading-images.ts: merge the delivery of the original call and the retry for one run (same session, so a picture delivered on either call reached the grader); the receipt is written after the replacing verdict, so it hashes the bytes filed.
3. grading-run.ts: after a call files verdicts, read each run's manifest (scenario, captures) and the call's delivery, compute shortfalls; if any and the session has an id, run exactly one retry call on the same session (claude --resume <id>, codex exec resume <thread>) for those runs only. A retried answer replaces the filed verdict only when it validates and has no shortfall left; otherwise the original stays as today. The retry is a call in session.json (so usage counts it under either semantics) carrying retry: { of, runs: [{ run, asked, replaced, remaining }] }.
4. Tests without a model: fake claude and a new fake codex that lapse on a run's first answer (and optionally again); owners for the shortfall check, the single retry, replacement with a matching receipt, keep-original when still short, usage counted, same-session continuation for both runners.
5. evals/README.md: document the retry. Gate lint, fmt:check, type-check, test:modules.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented in a80452e0.
- Check: verdictShortfall (lib/grading-retry.ts) = checklistGaps unmentioned/invented + unobservedCaptures (lib/grader.ts), which shares capturesComplete/observedCaptures with everyCaptureSeen, so the retry reads a verdict exactly as the report does. A capture the harness failed to take is never asked for, since no answer mends it. Obligations come from the run's run.json (scenario, captures) as records.ts reads them; a run without a manifest is held to nothing.
- Retry: gradeChunk sends at most one retry per call, only when the session has an id, for the short runs only, via runner.call with sessionId = session.threadId (claude --resume <id>; codex exec resume <thread> with the retried runs' images attached again). Prompt = graderPrompt(continuing) with a preface naming each run and what it lacks.
- Replacement: only when the retried answer parses against the output schema and has no shortfall; receipt written after the new verdict with combinedDelivery (pictures delivered on either call of the session). Otherwise the first verdict and receipt stay (outcome still-short or no-answer).
- Record: the retry is a normal call in session.json (usage/callUsage counted by sessionUsage under either semantics) with retry: { of, runs: [{ run, asked, outcome, remaining }] }.
- Refactor to stay under max-lines: session schema + verdict filing -> lib/grading-session.ts; retry checks/prompt -> lib/grading-retry.ts. evals/README.md documents it.
- Tests: tests/grader-retry.test.ts with fake claude and a new fake codex (tests/fake-codex.ts, shared answers in tests/fake-grader-answer.ts). Gate: lint, fmt:check, type-check, test:modules (3351 pass) all green.

Review fixes in a0c0e97a.
- Owed retries: after grading any pending chunks, gradeBatch re-asks every filed verdict that verdictShortfall reads as short and that no calls[].retry.runs[] names, once each, in the same session, grouped by the call that filed it (retry.of = that call), chunked by --chunk. The first delivery comes from the verdict's receipt (readReceipt in grading-images.ts, same integrity checks as suppliedCaptures, which now uses it). Originals stay filed unless an answer mends them. A read-only dry run of this detection against .skill-evals/2026-09-18T23-44-56-390Z (no model call) finds exactly the 6 short verdicts: da122f0472, db0497c9d3, e1aaba0e3c, e270658bf9 (filed by call 14) and f4f159fc3c, f772f195c7 (call 15). The session has a thread id, so a plain `bun run eval:skill grade <batch> --grader claude` will re-ask them with --resume.
- AC#1 reading: the check is the report's (checklistGaps + unobservedCaptures). A retry is triggered only by a declared feature left unanswered or by an offered capture left unobserved. An invented extra name alone changes nothing the report reads, and a retry redraws the whole verdict, so it is not asked about. When a retry is sent, the invented names are still named in its prompt and recorded. A capture the harness could not offer (an imagesForRun failure) is never asked for.
- Replacement: a retried answer replaces the verdict when it lacks nothing the report reads, or when what it still lacks is a strict subset of what was asked. remaining is recorded either way.
- Tests added: an unanswered-only unit case; no retry when there is no session id (fake codex without thread.started); the no-answer outcome and no second attempt; a mixed retry (replaced + still-short) and a partial improvement (replaced, remaining recorded); invented-only and unofferable captures not asked; the owed pass on a batch whose session lost its retry record, with receipts present; nothing asked a third time.
- The owed pass is documented in evals/README.md and does not touch the input digest. Gate: lint, fmt:check, type-check and test:modules (3361 pass) are green.

Full gate on a quiet tree: lint, fmt:check, type-check, build:frontend exit 0; test:modules 3361/0, test:system 168/0, test:repository 8/0, test:serial-browser 0 failing files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Grading re-asks once, in the same session, when a filed verdict leaves a declared feature unanswered or an offered capture unobserved (the report's own checks); a retried answer replaces the verdict when it lacks nothing or strictly less, and what remains is recorded in session.json. An owed-retry pass in gradeBatch re-asks short verdicts no retry has named, reading first delivery from receipts, so an interrupted pass or an older batch is covered: a plain grade of the 23:44 batch re-asks exactly its 6 short verdicts (calls 14 and 15). Commits a80452e0, a0c0e97a. Two review rounds. Full gate on a quiet tree: lint, fmt:check, type-check, build:frontend exit 0; test:modules 3361/0, test:system 168/0, test:repository 8/0, test:serial-browser 0 failing files.
<!-- SECTION:FINAL_SUMMARY:END -->
