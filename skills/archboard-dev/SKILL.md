---
name: archboard-dev
description: Working on archboard's own source. It holds the board proposal of a task from planning to closing, the sweep after a removal or rename, where the tracked skills live, how to maintain the consumer skill, and facts the code does not show. Use it to plan or close a task, change this repo or its skills, remove or rename what a reader sees, or test a server change.
---

# Working on archboard

Always-on rules are in `AGENTS.md`; procedures for running and verifying the
Archboard server are in `TESTING.md`. This skill holds only what neither the code nor
those documents will tell you.

## A task's board proposal

The dogfood vault is `.archboard/vault`, and only `./bin/dogfood` writes it. It
is how the next agent learns this repository. A task therefore changes it the
way it changes the code. During planning, you draw a proposal. When the task
closes, you adopt it. Edit a current variant in place only to correct a board
that was already wrong about code the task does not change.

While you plan, before `backlog task edit --plan`:

1. **Name the affected boards.** If the task adds, removes, renames or rewires
   anything a board draws, or adds something the board's question needs, the
   board is affected. `.archboard/README.md` gives the scope of each board.
   Done: the plan names every affected board, or it says that no board is
   affected (a test or a wording fix).
2. **Branch one proposal per affected board, named by the task id:**
   `./bin/dogfood semantic branch "<board>" --as TASK-123 --summary "<task title>" --expect-version <n> --doing "..."`.
   If code needs a board of its own, `semantic new` makes it as a draft that
   nobody has built. The proposal on the board above it gains the part that
   drills down to it.
3. **Draw the planned architecture on each proposal** with the
   [propose and compare](../archboard/references/propose-compare.md) recipe of
   the consumer skill. A planned part binds to the path that the plan gives
   it. A planned relationship states the mechanism that the plan intends.
   Done: `semantic compare` reports exactly the changes that the plan makes.
4. **Name each proposal in the plan** as `<board>@TASK-123`. Commit the vault
   files with the plan.

When the task closes, before you mark any acceptance criterion:

1. **Inspect each proposal against the code as built.** Apply the evidence
   rules of the consumer skill to every part and relationship that the
   comparison reports as added or changed: a source line for each
   relationship, and a binding to the file that owns each part. Every place
   where the build left the plan is a deviation.
2. **Correct the proposal to what was built**, not to what was planned. In
   the same edit, give it the `summary` the board should carry once it is
   current: the board's scope, not the task title and not a date. Done:
   every entry that `semantic compare` reports has a source line behind it.
3. **Adopt it:**
   `./bin/dogfood semantic adopt "<board>" --variant TASK-123 --reason "<what the task changed>" --expect-version <n> --doing "..."`.
   If the proposal holds a disagreement, adoption is refused until
   `semantic resolve` settles it ([variants](../archboard/references/variants.md)).
4. **If adoption is refused as `PARENT_SUPERSEDED`,** another task adopted a
   proposal after you branched, and adopting yours would drop its change.
   Branch a new proposal from the current variant, restate this task's change
   on it from the old proposal's own change, read with
   `semantic compare "<board>" --variant TASK-123 --against <its parent>`,
   shelve the old proposal with that reason, and adopt the new one. Use
   `--force` only when dropping the other task's change is intended.
5. **Run `./bin/dogfood check`.** Done: it reports no diagnostics. Commit the
   vault files with the closing.

If a task closes without its change, shelve its proposals with the reason.

## Removing or renaming something

Every description of archboard outlives the code it describes unless the change
that removes the code removes the description too. The drawing workflow went on
2026-09-12, and weeks later the glossary still defined Element and Stencil,
every write command's help listed a refusal no route could send, INSTALL.md
named a directory that did not exist, the environment still used the fork's
names, and the block `install-skill` writes into other repositories told agents
that `status` prints the vault (TASK-310). So a change that removes, renames or
redefines anything a person or an agent can see (a command, option, environment
variable, route, answer field, refusal, concept, file or directory) ends with a
sweep, in the same change:

1. **Find every place that states it.** `git grep -n -i` each spelling of the
   old name and read every hit: the root documents (`README.md`, `INSTALL.md`,
   `TESTING.md`, `DESIGN.md`, `AGENTS.md`), `CONTEXT.md` entries and their
   `_Avoid_` lines, both skills, help text, refusal descriptions and the
   exit-code help under `src/cli`, the setup block in
   `src/cli/commands/lib/repo-setup-block.ts`, code comments and test names.
   Done when every hit is still true or is history: Backlog tasks, ADR bodies
   and `docs/design/skill-evals/baseline` stay as written.
2. **Delete what only served it.** When the server stops sending something,
   remove the client code that handled it, the refusal the contracts declare
   for it and its exit-code line. An export that nothing imports is dead:
   `git grep -w <symbol>` finds it only in its own file. Done when nothing
   handles, declares or exports what can no longer happen.
3. **Retire the decision.** An ADR whose subject is gone gets
   `status: superseded` and a closing line naming the task. Done when the ADRs
   that cite it still point at something true.
4. **Say which copies stay stale.** `bun run generate:skill-artifacts` carries
   INSTALL.md and the schemas into the skill. The skill in `~/.agents/skills`
   or `~/.claude/skills` and the block in each repository change only when
   `archboard install-skill` runs there again, so the report says to run it.

## Stating a fact where it cannot drift

- A condition on an option lives in the command contract (`requiredWhen`,
  `requiresShared`, `excludesShared`), and help derives it from there. The
  same condition written into a description drifts from the check:
  `semantic record` said `--doing` was always required.
- Every environment variable is named `ARCHBOARD_*`. Renaming one refuses the
  old name by name, as `renamedUrlMessage` does. A silent fallback to the
  default URL starts a second Archboard server over the same vault.
- An optional field is a promise to every reader of its object. Adding one means
  finding every path that reads the object and making each honour it: a
  binding's `branch` and `commit` were accepted and stored while the local
  opener ignored them (TASK-311).
- A claim in a document is checked against the code or the command it names,
  never against another document. A rewrite starts from an audit that pairs
  each claim with its evidence, a `file:line` or a command's output.
- A tracked document holds no fact about one machine (what is a symlink there,
  which directories exist). Such a fact is false on the next machine.

## Moving Codex to a new version

Archboard runs the exact `@openai/codex` that `package.json` pins, and every
Codex fact in the code was read in that version's source. A bump is done when
nothing states a version that was not re-read:

1. **Pick the version and its source.** `bun info @openai/codex version` names
   npm's latest. In a clone of `github.com/openai/codex`, `git fetch --tags`
   and check out `rust-v<version>`. Done: the clone sits at the tag.
2. **Diff what Archboard uses** between the old and new tags:
   `codex-rs/app-server-protocol/src/protocol` (wire shapes, and each new
   field's serde attributes: a generated `T | null` is sent as `null` unless
   serde skips it), the `app-server` request processors for the methods in
   `src/runtime/codex-protocol/lib/methods.ts`, realtime
   (`core/src/realtime_conversation*`, `realtime_history.rs`,
   `session/world_state.rs`, `codex-api/src/endpoint/realtime_websocket`) and
   the model list (`models-manager`: `gpt-6-luna` must still be listed with
   `high` effort). Done: every change is named as adopted, ignored or a
   behaviour change.
3. **Bump the pin in three places:** `package.json`, `expectedCodexVersion` in
   `scripts/generate-codex-app-server-contract.ts` and `CODEX_PROTOCOL_VERSION`
   in `src/runtime/codex-protocol/lib/version.ts`. `bun install` updates
   `bun.lock` and generates the new contract beside the old one under
   `src/shared/codex-app-server-contract/generated/versions/`, so
   `diff -r` of the two version directories is the wire change; a fresh
   worktree runs `bun install` at the old pin first, so the old contract
   exists to diff.
   Done: `bun run ensure:codex-contract` passes.
4. **Adapt the schemas to `bun run type-check`.** Each handwritten Zod schema
   in `src/runtime/codex-protocol/lib` is proved against the generated type
   in both directions: `__codexGeneratedWireMustExtendSchemaInput` means the
   schema refuses something the new wire sends,
   `__schemaOutputMustExtendCodexGeneratedWire` means it lacks a field the
   wire now requires. Change the schema, never the check. Then add each new
   required field to the fixtures, including the fake Codex servers under
   `tests/system/server-state/fixtures` and `tests/system/process-contracts`,
   whose payloads only the system lane decodes. Done: type-check and the
   `src/runtime/codex-*` tests pass.
5. **Re-read every version-bound claim.**
   `git grep -n "<old version>" -- ':!bun.lock' ':!backlog'` finds them. Code
   and TypeScript fixtures take the version from `CODEX_PROTOCOL_VERSION` or
   `CODEX_PROTOCOL_BINARY_VERSION`; the standalone fake Codex executables
   write it literally and move to the new one. A claim about Codex behaviour
   moves only after its cited source is re-read at the new tag, and is
   corrected where it no longer holds; a measurement names the version it was
   measured on. Done: the grep finds only history.
6. **Run the gate** as `.claude/rules/agent-work.md` describes, then **smoke a
   signed-in server**: start one on a free port against a scratch copy of
   `examples/web-shop`, with the default state directory so it uses the
   machine's Archboard Codex sign-in. A server whose workbench is not ready
   exits with "The production Codex workbench did not become ready"; one that
   signed in and found its model records the coordinator's `thread/start` as
   delivered in `codex-workbench/canvases/<port>/epoch/epoch-manifest.json`
   in the state directory. Done: `status` reported it running, the manifest
   holds that record, and the server was stopped.

## The tracked skills

`skills/` is the single source. `.claude/skills/` and `.agents/skills/` reach
this repository's skills through tracked symlinks, so an edit is live at once;
the third-party skills beside them are installed by `skills experimental_install`
from `skills-lock.json` and stay untracked. Other repositories use the copy
`archboard install-skill` put in `~/.agents/skills/archboard`; run it again to
refresh that copy. Keep the `archboard` skill free of machine-specific paths; it
runs outside this repo.

The consumer skill also ships derived files under
`skills/archboard/references/generated/` (ignored): JSON Schemas for the
persisted board document, the vault configuration and the `semantic new` and
`semantic edit` payloads, rendered from the Zod authorities with
`z.toJSONSchema`, plus an installation-local copy of `INSTALL.md`. One owner,
`src/runtime/skill-distribution`, writes them; `bun install`, the installer's
staging step and `bun run generate:skill-artifacts` all call it. After changing a
schema or `INSTALL.md`, run `bun run generate:skill-artifacts`. Never hand-edit
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
3. `bun run generate:skill-artifacts`, then `bun test src/runtime/skill-evaluation
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
Codex authors (gpt-6-luna, high reasoning) on pinned Flask checkouts, three
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
  the author ran, and after a failed run where the server is still up, the
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
- **Read `bun run type-check` by its exit status.** tsc colours `error` and
  `TS2345` as separate sequences, so `grep 'error TS'` matches nothing and a
  failing check looks clean. Lint's type-aware rules are not the compiler
  either: a refactor that passes `bun run lint` can still fail type-check.
- **Text width is measured by the canvas of whatever draws the picture**, with
  the diagram fonts loaded: under Bun an `@napi-rs/canvas` canvas the renderer
  host installs as `OffscreenCanvas`, in a browser its own. Never add a font
  measurer; pictures may differ between browsers, because each matches what
  that browser paints. `tests/system/browser/measured-text.test.ts` holds the
  Bun canvas to what Chrome draws; the two agree to under one percent.
