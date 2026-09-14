---
name: archboard-dev
description: Working on archboard's own source — restart semantics, taking a fix from upstream without merging, syncing the tracked skills, and the handful of facts that are not derivable from the code and will otherwise cost an afternoon. Use when changing this repo, cherry-picking from upstream, or verifying a canvas change.
---

# Working on archboard

Always-on rules are in `AGENTS.md`; procedures for running and verifying the
canvas are in `TESTING.md`. This skill holds only what neither the code nor
those documents will tell you.

## Taking something from upstream

Archboard is not kept mergeable with `yctimlin/mcp_excalidraw`. Never
`git merge upstream/main`; it drags back conventions this repo replaced. The
remote exists for reference and for taking one specific fix:

```bash
git fetch upstream
git log -p upstream/main -- path/to/file.ts   # read before taking
git cherry-pick <sha>                          # only when it clearly applies
bun run check
```

Prefer reimplementing their fix our way over importing their structure. The npm
package `mcp-excalidraw-server` is releases behind the git tag; never install it.

## Syncing skills

`skills/` is the single tracked source; `bun scripts/sync-skills.ts` replaces
`.agents/skills/` and `.claude/skills/` from it, leaving third-party skills
(`skills experimental_install`, pinned in `skills-lock.json`) alone.
`~/.agents/skills/archboard` symlinks into the synced copy so other repos use
the same canvas skill. Keep the `archboard` skill free of machine-specific
paths; it runs outside this repo.

The consumer skill also ships derived files under
`skills/archboard/references/generated/` (ignored): JSON Schemas for the
persisted board document, the vault configuration and the `semantic new` and
`semantic edit` payloads, rendered from the Zod authorities with
`z.toJSONSchema`, plus an installation-local copy of `INSTALL.md`. One owner,
`src/runtime/skill-distribution`, writes them; the sync script, the installer's
staging step and `bun run generate:skill-artifacts` all call it. Never hand-edit
a generated file or add a second schema definition; change the Zod schema and
regenerate. The generated INSTALL copy belongs to the machine-local install: it
records when its source checkout has working-tree changes and its escaped
absolute links depend on the active checkout that also supplies the CLI.

## Maintaining the consumer skill

`skills/archboard` is what an agent in another repository reads to use
archboard; it is measured, not eyeballed, and it goes stale the moment the
product moves. **Trigger:** any change to a CLI contract (a command, option,
ordering, default, exit code or answer shape), a diagram grammar or renderer
promise, semantic identity or comparison rules, vault vocabulary or grouping,
schema generation or distribution, installation, or verification behaviour.
When it fires, in the same change:

1. Update the recipe, reference, example and schema link the change touches
   (`skills/archboard/SKILL.md` and `references/`). A recipe that the CLI
   would now refuse is a defect, not a token saving.
2. Update the evaluation inputs under `evals/` at the repository root: the
   scenario whose `expectedFeatures` or `outcomes` the change alters, its
   fixture, and the row of `coverage.json` that maps the feature. A new
   user-facing feature or a new branch of a closed enum needs a scenario, an
   expected use and an evidence owner; mechanical validation and generated
   metadata get a runtime owner (a fast test), never a forced authored
   decoration. The inputs live outside every skill package on purpose: an
   author reads whatever the installed skill carries, and the batch of
   2026-09-14 showed authors reading the scenario, the fixture and the rubric
   they were being measured against (TASK-212); a fast test refuses an
   `evals/` directory inside the consumer skill, the frozen baseline or a
   prepared copy.
3. `bun scripts/sync-skills.ts`, then `bun test src/runtime/skill-evaluation
tests/system/cli/install-targets.test.ts` and `bun run check`.

The success contract the skill is held to: the fewest total author tokens per
successfully completed workflow, not the shortest document. The four common
paths (architecture from code, sequence through the data-flow grammar, edit one
batch, propose and compare) run on SKILL.md plus at most one targeted
reference; source investigation, the required reads, the writes and the
verification are necessary work, and help, listing, config and check calls the
context already answers are not. The frontmatter description is the trigger;
conditional material sits behind a pointer that says when to read it; every
link, including the generated schemas and the INSTALL.md copy, works in the
installed package. Every guardrail in
`docs/design/skill-evals/preservation-assessment.md` keeps a home and an
evidence owner.

### Evaluating a change

`evals/README.md` is the manual; `bun run eval:skill` is the command;
`evals/rubric.md` is what the grader reads. The harness runs real
Codex authors (gpt-5.6-luna, high reasoning) on pinned Flask checkouts, three
repetitions per scenario per skill version in parallel with isolated state, an
installed baseline (`docs/design/skill-evals/baseline/archboard`) against an
installed candidate (the live `skills/archboard`), the same CLI, prompts,
fixtures and pins for both; then ONE gpt-6-astra session at high reasoning
grades every run of the batch itself, reusing what it read of Flask, blinded
to the arm, with per-run feature verdicts, scores and evidence, and told in
these words: "Do not use subagents. Inspect the source and grade every run
yourself in this session." Reports separate discovery from operations from
code investigation, author usage from grader usage, primary workflows from the
broad case, and list every failure. A person starts every run; `bun run
check` never does.

Read the comparison honestly. A skill-only change is comparable when
`pins.json` and the fixtures are untouched. A product change that makes an
old recipe unexecutable is a changed contract: the baseline arm then fails
early and cheaply, and that is not a token saving; say so in the report, repin
both arms on the new CLI, and capture a new baseline before claiming an
improvement. Semantic compliance needs every expected feature to pass (traffic,
containment, configured kinds, TASK-207 grouping and the rest of the
checklist); a missing or incorrect required feature fails the run whatever the
picture looks like, and the report surfaces every waived feature. Percentage
targets come from a measured baseline, never from a plan.

Two facts about the evidence that the first batch had to teach:

- **A board patched with Codex's editing tool is a `file_change` item, not a
  command.** The harness keeps every file change of the stream, fails the
  write guardrail on a board file under the vault, and shows the grader the
  list; a final board that is right proves nothing about how it got there. A
  command that reads a board file (`sed -n`, `jq`, `python -m json.tool`
  with its output discarded) is a read, and `semantic edit --help` is not a
  write attempt. Commands that reach for `evals/`, the harness source or
  another run's directory are recorded as exposure; a contaminated run is
  listed apart and blocks the token comparison without being called a board
  failure.

- **The harness takes the pictures; the author never supplies one.** Every
  scenario declares `captures`: the boards, views and variants its request
  names, both sides of a comparison, the data-flow view of a sequence. After
  the author ran, and after a failed run where the canvas is still up, the
  harness draws each through `archboard semantic rasterize` at native scale,
  records provenance (version, variant, view, size, SVG digest), cuts a large
  one into native-scale tiles, and lists a capture it could not take as
  failed with the reason; a declared view the author never made is a failed
  capture, never a default picture. The grader is told to open every capture
  as an image and to name the ones it opened; the report downgrades a visual
  pass the harness cannot corroborate to incomplete. Rasterizing needs a
  Chromium-family executable (`ARCHBOARD_RENDERER_CHROMIUM` names one).

- **Codex's `turn.completed` usage is the thread's cumulative total.** A
  resumed grading call reports everything the session has cost so far, so a
  session costs its last reading and each call's share is the growth since the
  previous one; summing the calls counted the first call fifteen times over in
  the 2026-09-14 batch. `evals/pins.json` pins this, and
  `docs/design/skill-evals/2026-09-14-batch-corrections.md` records what it
  changed.

## Facts that will mislead you

- **A pane key carries a variant; a board name never does.** `payments@<variant>`
  is an address, and `readSemanticBoard` on one THROWS, because a board is one
  document holding the whole family. Split it first (`parseBoardKey`, or
  `aggregateOf` on the server). Everything a board has — the file, the lease,
  the claim, what an agent said it was doing — is keyed by the board; only what
  is drawn depends on the variant. This is the same bug three times over if you
  get it wrong once.
- **A pane's board may be null.** A fresh vault holds no board, and a pane that
  could not register until one existed could never be shown the first board
  somebody makes.
- A refused write is the design (ADR 0006 as it now stands): a stale version is
  reported and nothing is written. Do not "fix" a refusal by reading the board
  again and retrying — that makes the check pass by construction and hides the
  change it was meant to notice.
- Test with two boards when checking pane switching, never two panes on one
  board: a switch reaches one pane's socket, and a regression looks like the
  other pane being replaced.
- The browser holds no board content. If you find yourself wanting to cache
  something the server knows, the answer is a query the pane re-reads on the
  board's own announcement, not a copy (ADR 0023).
- **Text width is measured against the real font files, with no browser.**
  `tests/system/browser/measured-text.test.ts` holds the engine to what Chrome
  actually draws; the two agree to under one percent, and an estimate is out by
  tens of them.
