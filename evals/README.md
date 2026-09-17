# Evaluating the archboard skill

These files are the canonical inputs of an on-demand, human-triggered model
evaluation. Nothing here runs under `bun run check`; every author run and the
grading session calls a model, and a person decides when.

They live here, at the repository root, and in no skill package: an author
reads whatever the installed skill carries, and inputs shipped inside it were
read (TASK-212). A fast test refuses an
`evals/` directory inside `skills/archboard`, the frozen baseline or an
install.

| File               | Holds                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `evals.json`       | The scenarios: prompt, Flask revision, source paths, expected-feature checklist, deterministic outcome checks, guardrails, the skill files (`guidance`) an author of it is expected to read, report group. A prompt says what a person would say (the question, the level, the names the checks anchor on, an explicit product request); the checklist names what the skill must add on its own. |
| `pins.json`        | What a comparison holds constant: Flask commits, the authors' Codex version, model and settings, repetitions, the frozen baseline's location.                                                                                                                                                                                                                                                    |
| `graders.json`     | What each grader runner holds constant: executable, exact version, model, effort, read posture, usage semantics. Not a batch input: chosen at grade time.                                                                                                                                                                                                                                        |
| `fixtures/S..json` | Each scenario's starting vault: a policy patch, whether the checkout is registered, and the boards laid through the CLI so every id is product-minted.                                                                                                                                                                                                                                           |
| `coverage.json`    | The 14-part inventory: every schema path and behavioural branch, the scenarios that exercise it, the expected use, and who owns the evidence.                                                                                                                                                                                                                                                    |
| `rubric.md`        | What the blinded grader is told.                                                                                                                                                                                                                                                                                                                                                                 |

## Commands

```bash
bun run eval:skill check                     # validate the inputs; no model
bun run eval:skill run                       # both arms, every scenario, pinned repetitions
bun run eval:skill run --arm candidate --scenario S03,S09 --repetitions 1 --concurrency 2
bun run eval:skill run --resume .skill-evals/<batch>   # finish a batch, keeping completed runs
bun run eval:skill grade .skill-evals/<batch> --grader claude [--chunk 6] [--claude /path/to/claude]
bun run eval:skill grade .skill-evals/<batch> --grader codex  [--chunk 6] [--codex /path/to/codex]
bun run eval:skill report .skill-evals/<batch>   # again, without grading; grade writes one too
bun run eval:skill pin                       # rewrite the version pins from PATH; no model
```

Use a Codex executable matching `pins.json` for the authors. The repository's
app-server dependency can be a different version, and `bun run` puts its
executable first on `PATH`. In that case pass `--codex /absolute/path/to/codex`
to `run`; resumed runs reuse the recorded executable unless explicitly
overridden. The harness checks its version before any model call.

`grade` names its grader every time: `--grader codex` or `--grader claude`.
The grader is not part of the batch: the same batch can be graded by both,
each into its own directory, and `report` then carries both and how they
agree. The executable is the grader's own name found on `PATH` unless
`--codex` or `--claude` names one; it must report the exact version pinned in
`graders.json`, and `bun run eval:skill pin` rewrites every version pin from
the executables on `PATH`, saying which change starts a new baseline (only
the authors' Codex version in `pins.json` does).

Output lands under the ignored `.skill-evals/`: `cache/flask.git` (one bare
clone), and one directory per batch holding `batch.json`, `blinding.json`
(anonymous id to arm; never given to the grader), `runs/<arm>/<scenario>/<n>/`
and `graders/`: one shared staged `workspace/` and one directory per grader
that has graded, `codex/` or `claude/`. A batch graded before there was a
choice holds a single `grader/` directory instead, which reads as the Codex
grader, untouched.

## What one author run is

1. A private directory: its own `HOME`, `CODEX_HOME` (the operator's
   `auth.json` copied in, a `config.toml` written by the harness, nothing else
   of the operator's), vault, repository registry, logs, and an `archboard` on
   `PATH` that runs this checkout.
2. Flask cloned from the bare cache at the scenario's pinned commit, with the
   real origin recorded so the repository identity is `github.com/pallets/flask`.
3. A canvas of its own on a free port, against the run's vault.
4. `archboard install-skill --agent codex --repo <flask> --vault <vault> --yes`.
   For the baseline arm the installed skill is then replaced by the frozen
   package under `docs/design/skill-evals/baseline/archboard` and prepared with
   the same generated files. The install is verified independently: the skill
   files and generated schemas exist, and the setup block in the checkout's
   `AGENTS.md` names the run's vault.
5. The fixture laid through the CLI, then a snapshot of every board.
6. `codex exec --json --skip-git-repo-check -C <flask> -m <author model>
-c model_reasoning_effort="high" -c approval_policy="never" -s workspace-write
-o last-message.md "<prompt>"`, its event stream retained as `author.jsonl`.
7. Every board read back, renders and inspections the checks asked for, the
   checker's report, the deterministic outcome checks and guardrails, the
   command classification, and the blinded `bundle.json`.
8. Every capture the scenario declares, taken by the harness through
   `archboard semantic rasterize` from the final saved board at native scale
   into `captures/`: one PNG per declared board, view and variant (a
   declaration with `"views": "every"` instead of a `view` becomes one PNG per
   board view the author made, none when there are none), with its
   provenance (board version, variant, view, dimensions, the SVG digest), and
   for a bitmap wider or taller than 1600 px a grid of native-scale tiles
   drawn with `--region`. A capture the harness could not take (a view the
   author never made, a variant that does not exist, no Chromium) is listed
   as failed with the reason; a declared view is never replaced by the
   whole-board picture. The author never supplies a capture, and its own
   SVG or PNG files are not evidence.
9. The canvas stopped, whatever happened. A failed or cancelled run is still a
   row with its error; where its canvas was still up, the declared captures
   are taken of the partial state and recorded like any other, and where
   they could not be, they are recorded as not taken. Nothing stands in for
   a picture.

Rasterizing needs a Chromium or Google Chrome executable on `PATH`, or one
named by `ARCHBOARD_RENDERER_CHROMIUM`, which the harness forwards into every
run; without one every capture of the batch fails by name and no visual
verdict can stand.

Runs of one batch execute in parallel with bounded concurrency; nothing is
shared between them but the read-only Flask cache.

## Grading

`grade` stages a read-only workspace with the pinned Flask checkouts and every
run's bundle, boards, renders and captures under its anonymous id, then runs
ONE session of the chosen grader with the model and effort from
`graders.json`, in chunks of runs; the second chunk onwards resumes the same
session. Both runners read the same user prompt: it carries the rubric and
says, in these words: "Do not use subagents. Inspect the source and grade
every run yourself in this session." Only the one sentence about how the
pictures arrive differs. Per-run verdicts are filed under
`graders/<name>/verdicts/`, the session under `graders/<name>/session.json`
with the runner, its version and the settings it ran under, and the
session's own usage under `graders/<name>/usage.json`, apart from the authors'.

The Codex runner is `codex exec --json` in a read-only sandbox with the
structured answer enforced by `--output-schema` and written by `-o`, every
picture attached with `--image` on every call, and the thread resumed with
`codex exec resume`. Its private `CODEX_HOME` under the grader directory
carries the operator's `auth.json` and a harness-written `config.toml`. The
sandbox blocks writes and not reads, so the harness reads the stream: any
call whose commands name a path outside the staged workspace, or whose file
changes land outside it, is filed as an error rather than a verdict, and the
answer Codex wrote is discarded; the same posture the Claude runner has.

The Claude runner is `claude -p --output-format stream-json` with
`--json-schema` enforcing the same answer, `--tools Read,Grep,Glob` and nothing
else (no Bash, no subagents), `--setting-sources ""` and `--strict-mcp-config`
so none of the operator's settings, hooks, plugins or MCP servers reach it,
one short fixed system prompt recorded in the session, and the working
directory set to the staged workspace so no CLAUDE.md or project memory is
discovered. The session is started with `--session-id` and continued with
`--resume`, which needs session persistence on. It runs under the operator's
own Claude login (`PATH` and `HOME`; `CLAUDE_CONFIG_DIR` and
`ANTHROPIC_API_KEY` forwarded when set), never a copied credential. Claude
Code itself refuses a read outside the working directory, and the harness
files any call whose stream shows a read or a refusal outside the workspace
as an error rather than a verdict, as it does a call with no structured
answer or one that violates the schema.

## Reports

`grade` ends by writing the report, and `report` writes it again without grading. It joins each run's manifest with each grader's verdict and writes
`report.md` and `report.json`: one section per grader that graded the batch,
each with per scenario, per primary workflow, and the broad mapping case on
its own; successes, guardrail violations, outcome failures, semantic
compliance failures and waived features; median tokens per run (cached input
is a subset of input and is never added to it); mean grader scores, among
them behavioural completeness (how far a board uses the semantics the source
justifies beyond what the request named, judged row by row in the rubric's
catalogue vocabulary, with the missed rows counted per arm); the
candidate's median-token change against the baseline; and every run that did
not succeed. When two graders graded the batch, a final section puts their
verdicts side by side for every run both graded, with the share of runs where
semantic pass/fail and visual standing agree and the mean absolute score
difference per dimension. `report.json` is `{ graders: [{ grader, report,
runs }], agreement }`. Percentage targets are set only after a baseline is
measured.

## The skill never carries an evaluation's answers

Every worked example in the skill is about archboard's own source, never the
evaluated codebase. Until 2026-09-17 each recipe's example was the answer to a
scenario (the request pipeline, the JSON provider, the contexts proposal, the
CLI startup exchange), and later rounds added rules shaped by single scenario
failures, so every author of both arms read the checklist inside the package it
was measured on. **Every batch run before that date is void**: its scores
measure recall of those answers, and no comparison between them is evidence
about the skill. `bun run eval:skill check` now refuses a candidate or frozen
baseline package that names the evaluated framework, or any board, view,
variant, group or quoted symbol a scenario or fixture grades on. When a batch
analysis suggests a skill change, state the rule for any codebase and show it
on archboard; a rule you can only state with a scenario's names is teaching
that scenario.

## Reproducing a baseline

The baseline is `docs/design/skill-evals/baseline/archboard`, a copy of
`skills/archboard` frozen at the revision `pins.json` names (the last accepted
skill; promoting a candidate replaces the copy and rewrites that pin), and it
runs on the same CLI as the candidate. Both arms use
identical prompts, fixtures, pins and settings. Changing any pin starts a new
baseline; the harness refuses a Codex executable whose version differs from
the pin. `graders.json` is deliberately outside that digest: a grader is
chosen when grading runs, and changing its pins never makes a batch
un-gradable. A batch recorded before `graders.json` existed carries a grader
block inside its recorded pins; the input check recomputes its digest from
those recorded pins and accepts it when they differ from today's only in that
block and in prose, so such a batch can still be graded and reported. The
batch also records content digests for its complete suite inputs,
both skill packages and the implementation/dependency files, plus its Bun
version. Resume refuses changed content or a different job selection before
touching saved results; concurrency may change. Grade and report refuse changed
scenario inputs so earlier results cannot be assessed against a new checklist.

## What the grader sees, and what it must look at

The grading workspace stages each run's `bundle.json`, `boards/`, `renders/`
and `captures/`. The capture list names each required diagram and its saved
board version, view, variant, dimensions, SVG digest and native detail tiles.
All paths exposed to the grader are relative to its anonymous run.

On every grading call, including a resumed call, the prompt lists each
available capture and every required native-resolution tile with its
workspace-relative path. With the Codex runner the harness attaches them
directly with Codex 0.154.0's `--image` option, in the listed order. With the
Claude runner the grader opens them itself with its Read tool, and the
retained stream shows every file it opened and whether it came back as an
image; the retained stream replaces the image bytes with their size, since the
pictures stay in the workspace. Missing files, invalid PNG headers, mismatched
dimensions or missing native detail tiles leave that capture explicitly
incomplete. Image decode or call failures cannot produce a successful delivery
receipt.

The grader must visually inspect the pictures, list their labels in
`visual.inspectedCaptures`, and supply `visual.observations` as an array of
`{capture, observation}` entries, one per capture. Only a successful grading
call gets a harness-owned `<run>.json.images.json` receipt beside its verdict;
it records the supplied image IDs, relative paths and SHA-256 digests and the
exact verdict digest. For the Codex runner "supplied" means attached; for the
Claude runner it means the stream shows the main image and every tile of that
capture were opened as images, and a capture with one tile unopened has no
receipt. Reports check those bytes again, so stale receipts and self-reported
inspection alone cannot qualify a visual pass or assessed failure.
Missing required evidence makes the effective evaluation incomplete while the
raw grader verdict and its observations remain available. Historical runs
without delivery receipts remain visually incomplete. Delivery is verified;
the image-grounded observations remain the grader's judgment.

Visual failure prevents an overall success and counts as a quality regression
when it worsens relative to the baseline. Incomplete visual evidence leaves
quality unassessed. Both prevent efficiency claims while retaining raw semantic
scores and usage. A still capture pauses traffic at its first frame and proves
nothing about motion.

## Evidence the harness keeps, and what it refuses to infer

An author has two ways to change a file: a shell command, recorded as a
`command_execution` item, and Codex's own editing tool, recorded as a
`file_change` item and nothing else. The harness keeps both. Every file
change lands in `file-changes.json` and in the bundle; a `.semantic.json`
under the run's vault fails the `doing-on-writes` guardrail, and the manifest
counts it as `directWrites`. A command that reads a board file (`sed -n`,
`jq`, `python -m json.tool … >/dev/null`, `2>&1`) is a read; only a redirect
into a board file, an in-place editor, a file command whose target is one, or
a script that opens one for writing counts as a direct write. `semantic edit
--help` and a text search for the words `semantic edit` are not write
attempts.

Commands that reach for material an author must not see are recorded as
exposure, by kind: `evaluation-inputs` (this directory, by path or by the
canonical file names), `harness-source` (`src/runtime/skill-evaluation`), and
`other-run` (another run's directory under the batch). The bundle carries the
kind beside each command and the counts; the report lists every contaminated
run apart, and a scenario with a contaminated run reports no token change,
because a run that read the checklist it is measured against measures the
reading, not the skill. Contamination is an audit finding and is kept
distinct from the board's correctness: the outcome checks and the grader's
feature verdicts still say what the board is.

## Usage semantics

Each runner counts its own way, and `graders.json` pins the rule per runner;
the report's usage line names which applied.

Codex: `turn.completed` carries the thread's `total_token_usage`. In a resumed
thread that is cumulative: the second grading call reports the first call's
tokens again, plus its own. So a call's own usage is the growth since the
previous reading (`callUsage` in `session.json`), and the session costs its
last reading (`usage.json`), never the sum of its calls. Verified without a
model from the retained rollout of the 2026-09-14 batch, whose per-step
`token_count` events show `total_token_usage` climbing through the resumed
calls; the fast tests hold it.

Claude: the `result` line's `usage` is this call's own, resumed or not, so the
session costs the sum of its calls. Claude reports uncached input, cache reads
and cache writes apart; the normalized reading takes input as their sum and
cached as the cache reads, and the raw usage, `modelUsage` by model (a small
side call by another model appears there) and `total_cost_usd` are kept
beside it in `session.json`. Verified with a resumed probe session on claude
2.1.269 on 2026-09-15; the fast tests hold it.

## Correcting a report

A batch's artifacts are never rewritten. When the harness's reading of the
evidence changes, the batch stays as it was measured and a corrections
document beside the design notes names the batch, each correction, every
contaminated run and what remains comparable; the first is
`docs/design/skill-evals/2026-09-14-batch-corrections.md`. `report` refuses a
batch whose inputs no longer match the checked-in inputs, so a corrected
reading of an old batch is written by hand from the retained files, not by
re-running `report` against a changed checklist.
