# Evaluating the archboard skill

These files are the canonical inputs of an on-demand, human-triggered model
evaluation. Nothing here runs under `bun run check`; every author run and the
grading session calls a model, and a person decides when.

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
8. The canvas stopped, whatever happened. A failed or cancelled run is still a
   row with its error.

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
