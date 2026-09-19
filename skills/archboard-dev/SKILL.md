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
successfully completed workflow, not the shortest document. The five common
paths (architecture from code, sequence through the data-flow grammar, edit one
batch, propose and compare, answer from a saved board) run on SKILL.md plus its own recipe under
`references/` (`create-architecture`, `create-sequence`, `edit`,
`propose-compare`, `read`), the one targeted reference a common path needs; the
harness records per run whether the recipe the scenario names was read; source investigation, the required reads, the writes and the
verification are necessary work, and help, listing, config and check calls the
context already answers are not. The frontmatter description is the trigger;
conditional material sits behind a pointer that says when to read it; every
link, including the generated schemas and the INSTALL.md copy, works in the
installed package. Every guardrail in
`docs/design/skill-evals/preservation-assessment.md` keeps a home and an
evidence owner.

### Portable rules, grounded examples

The consumer skill is read by agents working in codebases archboard has never
seen, in any language, so it speaks in two registers and keeps them apart:

- **Portable rules.** Everything shared (`SKILL.md`, the catalogue, reference
  prose, refusal tables, the check steps of a recipe) uses computer-science
  vocabulary, and draws it from every paradigm a reader might be working in, so
  a rule reads as true for an object-oriented service, a functional pipeline
  and a UI component tree alike:
  - structure: module, function, class and method, component, closure, package
  - flow of control: caller and callee, handler, hook, callback, composition,
    recursion, entry point
  - data and effects: props and state, value passed or returned, side effect,
    config file, cache
  - asynchrony: event and subscription, promise and await, stream, message,
    queue, retry limit, cleanup

  A rule illustrated in one paradigm's terms (a class and its methods) names
  another paradigm's equivalent beside it (a module and its functions, a
  component and its children).

- **Grounded examples.** Each recipe carries one worked example about
  archboard's own source: the payload and the evidence paragraph beside it.
  Archboard's names (a lease, a board store, a vault, a semantic write) stay
  inside that example; a rule that needs them points at the example ("the
  self step above") instead of repeating them.

Before adding a sentence to shared guidance, read it as an agent in an
unfamiliar codebase would. When it only holds with archboard's names, it is
example material and goes in a recipe's worked example. When it only holds
for one evaluation scenario, it is a fix for that scenario and stays out of
the skill. A batch analysis names failing runs; the skill change is the
portable pattern behind them, stated in portable terms and shown in an
archboard example. One scenario may be what reveals the pattern: a rule is
judged by whether it holds in any codebase, not by how many scenarios exposed
it.

The evaluated codebase appears nowhere in either package: `bun run eval:skill
check` refuses its names and every board, view, variant, group and quoted
symbol a scenario grades, and every batch before 2026-09-17 is void because
the recipes were that codebase's answers (`evals/README.md`).

### Evaluating a change

`evals/README.md` is the manual; `bun run eval:skill` is the command;
`evals/rubric.md` is what the grader reads. The harness runs real
Codex authors (gpt-5.6-luna, high reasoning) on pinned Flask checkouts, three
repetitions per scenario per skill version in parallel with isolated state, an
installed baseline (`docs/design/skill-evals/baseline/archboard`) against an
installed candidate (the live `skills/archboard`), the same CLI, prompts,
fixtures and pins for both; then ONE grader session grades every run of the
batch itself, reusing what it read of Flask, blinded to the arm, with per-run
feature verdicts, scores and evidence, and told in these words: "Do not use
subagents. Inspect the source and grade every run yourself in this session."
The grader is chosen when grading runs, never when the authors run:
`--grader codex` (gpt-6-astra, high reasoning, read-only sandbox, pictures
attached) or `--grader claude` (claude-opus-5, high effort, Read/Grep/Glob
only, none of the operator's settings, pictures opened from the workspace and
the stream showing which). Both read the same prompt; `evals/graders.json`
pins each runner outside the batch digest, so one batch can be graded by both
and the report says where they agree. Reports separate discovery from
operations from code investigation, author usage from grader usage (counted
per runner: Codex's last cumulative reading, Claude's sum of calls), primary
workflows from the broad case, and list every failure. A person starts every
run; `bun run check` never does.

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
  capture, never a default picture. The harness attaches every capture and
  its required native-detail tiles to the grading call, records successful
  delivery against the image and verdict hashes, and requires observations
  for each capture. Missing images, incomplete tiles, stale evidence or
  missing observations make visual evaluation incomplete and prevent token
  efficiency claims. Rasterizing needs a
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
- The browser holds board content only as a read-only cache: a query the pane
  reads again on the board's own announcement, and pictures stamped with the
  board version, policy fingerprint and renderer build that are checked before
  they are shown. Never a copy the browser edits or answers from unchecked
  (ADR 0023).
- **Text width is measured by the canvas of whatever draws the picture**, with
  the diagram fonts loaded: under Bun an `@napi-rs/canvas` canvas the renderer
  host installs as `OffscreenCanvas`, in a browser its own. Never add a font
  measurer; pictures may differ between browsers, because each matches what
  that browser paints. `tests/system/browser/measured-text.test.ts` holds the
  Bun canvas to what Chrome draws; the two agree to under one percent.
