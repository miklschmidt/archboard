# Evaluating the archboard skill

These files are the canonical inputs of an on-demand, human-triggered model
evaluation. Nothing here runs under `bun run check`; every author run and the
grading session calls a model, and a person decides when.

They live here, at the repository root, and in no skill package: an author
reads whatever the installed skill carries, and inputs shipped inside it were
read (TASK-212). A fast test refuses an
`evals/` directory inside `skills/archboard`, the frozen baseline or an
install.

| File               | Holds                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `evals.json`       | The scenarios: prompt, Flask revision, source paths, expected-feature checklist, deterministic outcome checks, guardrails, report group.               |
| `pins.json`        | What a comparison holds constant: Flask commits, Codex version, author and grader models and settings, repetitions, the frozen baseline's location.    |
| `fixtures/S..json` | Each scenario's starting vault: a policy patch, whether the checkout is registered, and the boards laid through the CLI so every id is product-minted. |
| `coverage.json`    | The 14-part inventory: every schema path and behavioural branch, the scenarios that exercise it, the expected use, and who owns the evidence.          |
| `rubric.md`        | What the blinded grader is told.                                                                                                                       |

## Commands

```bash
bun run eval:skill check                     # validate the inputs; no model
bun run eval:skill run                       # both arms, every scenario, pinned repetitions
bun run eval:skill run --arm candidate --scenario S03,S09 --repetitions 1 --concurrency 2
bun run eval:skill run --resume .skill-evals/<batch>   # finish a batch, keeping completed runs
bun run eval:skill grade .skill-evals/<batch> [--chunk 6]
bun run eval:skill report .skill-evals/<batch>
```

Use a Codex executable matching `pins.json`. The repository's app-server
dependency can be a different version, and `bun run` puts its executable first
on `PATH`. In that case pass `--codex /absolute/path/to/codex` to `run`; `grade`
and resumed runs reuse the recorded executable unless explicitly overridden.
The harness checks its version before any model call.

Output lands under the ignored `.skill-evals/`: `cache/flask.git` (one bare
clone), and one directory per batch holding `batch.json`, `blinding.json`
(anonymous id to arm; never given to the grader), `runs/<arm>/<scenario>/<n>/`
and `grader/`.

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
   into `captures/`: one PNG per declared board, view and variant, with its
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
run's bundle, boards and renders under its anonymous id, then runs ONE Codex
session with the grader model and effort from `pins.json`, in chunks of runs;
the second chunk onwards resumes the same thread. The prompt carries the
rubric and says, in these words: "Do not use subagents. Inspect the source and
grade every run yourself in this session." The structured answer is enforced
with `--output-schema`; per-run verdicts are filed under `grader/verdicts/`,
and the session's own usage under `grader/usage.json`, apart from the authors'.

## Reports

`report` joins each run's manifest with its verdict and writes `report.md` and
`report.json`: per scenario, per primary workflow, and the broad mapping case
on its own; successes, guardrail violations, outcome failures, semantic
compliance failures and waived features; median tokens per run (cached input
is a subset of input and is never added to it); mean grader scores; the
candidate's median-token change against the baseline; and every run that did
not succeed. Percentage targets are set only after a baseline is measured.

## Reproducing a baseline

The baseline is `docs/design/skill-evals/baseline/archboard`, frozen before the
TASK-211 rewrite, and it runs on the same CLI as the candidate. Both arms use
identical prompts, fixtures, pins and settings. Changing any pin starts a new
baseline; the harness refuses a Codex executable whose version differs from
the pin. The batch also records content digests for its complete suite inputs,
both skill packages and the implementation/dependency files, plus its Bun
version. Resume refuses changed content or a different job selection before
touching saved results; concurrency may change. Grade and report refuse changed
scenario inputs so earlier results cannot be assessed against a new checklist.

## What the grader sees, and what it must look at

The grading workspace stages each run's `bundle.json`, `boards/`, `renders/`
and `captures/`. The capture list names each required diagram and its saved
board version, view, variant, dimensions, SVG digest and native detail tiles.
All paths exposed to the grader are relative to its anonymous run.

On every grading call, including a resumed call, the harness attaches each
available capture and every required native-resolution tile directly with
Codex 0.154.0's `--image` option. The prompt identifies the pictures in their
attachment order. Missing files, invalid PNG headers, mismatched dimensions
or missing native detail tiles leave that capture explicitly incomplete.
Image decode or call failures cannot produce a successful delivery receipt.

The grader must visually inspect the attached pictures, list their labels in
`visual.inspectedCaptures`, and supply `visual.observations` as an array of
`{capture, observation}` entries, one per capture. Only a successful grading
call gets a harness-owned `<run>.json.images.json` receipt beside its verdict;
it records the supplied image IDs, relative paths and SHA-256 digests and the
exact verdict digest. Reports check those bytes again, so stale receipts and
self-reported inspection alone cannot qualify a visual pass or assessed failure.
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

`turn.completed` carries the thread's `total_token_usage`. In a resumed thread
that is cumulative: the second grading call reports the first call's tokens
again, plus its own. So a call's own usage is the growth since the previous
reading (`callUsage` in `grader/session.json`), and the session costs its last
reading (`grader/usage.json`), never the sum of its calls. Verified without a
model from the retained rollout of the 2026-09-14 batch, whose per-step
`token_count` events show `total_token_usage` climbing through the resumed
calls; `pins.json` pins the rule and the fast tests hold it.

## Correcting a report

A batch's artifacts are never rewritten. When the harness's reading of the
evidence changes, the batch stays as it was measured and a corrections
document beside the design notes names the batch, each correction, every
contaminated run and what remains comparable; the first is
`docs/design/skill-evals/2026-09-14-batch-corrections.md`. `report` refuses a
batch whose inputs no longer match the checked-in inputs, so a corrected
reading of an old batch is written by hand from the retained files, not by
re-running `report` against a changed checklist.
