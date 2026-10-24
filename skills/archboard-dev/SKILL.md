---
name: archboard-dev
description: >-
  Working on archboard's own source. It holds the board proposal of a
  task from planning to closing, and the sweep after a removal or rename. It also
  holds where the tracked skills live, how to maintain the consumer skill, and
  facts that the code does not show. Use it to plan or close a task, or to change
  this repo or its skills. Also use it to remove or rename what a reader sees, or
  to test a server change.
---

# Working on archboard

Always-on rules are in [AGENTS.md](../../AGENTS.md). The procedures to run the Archboard server
and make sure
that it works are in [TESTING.md](../../TESTING.md). This skill holds only what neither the code nor those
documents will tell you.

## A task's board proposal

The dogfood vault is `.archboard/vault`, and only `archboard` writes it. It
is how the next agent learns this repository. A task therefore changes it the
way it changes the code. During planning, you draw a proposal. When the task
closes, you adopt it. Edit a current variant in place only to correct a board
that was already wrong about code the task does not change.

While you plan, before `backlog task edit --plan`:

1. Name the affected boards.
   If the task adds, removes, renames or rewires anything that a board draws, the board is
   affected. If the task adds something that the board's question needs, the board is also
   affected. [.archboard/README.md](../../.archboard/README.md) gives the scope of each board.
   Done: the plan names every affected board, or it says that no board is
   affected (a test or a wording fix).
2. Branch one proposal per affected board, named by the task id:
   `archboard semantic branch "<board>" --as TASK-123 --summary "<task title>" --expect-version <n> --doing "..."`.
   If code needs a board of its own, `semantic new` makes it as a draft that
   nobody has built. The proposal on the board above it gains the part that
   drills down to it.
3. Draw the planned architecture on each proposal with the
   [propose and compare](../archboard/references/propose-compare.md) recipe of
   the consumer skill. A planned part binds to the path that the plan gives
   it. A planned relationship states the mechanism that the plan intends.
   Done: `semantic compare` reports exactly the changes that the plan makes.
4. Name each proposal in the plan as `<board>@TASK-123`. Commit the vault
   files with the plan.

When the task closes, before you mark any acceptance criterion:

Run the complete normal gate, `bun run check`, before declaring completion.
If any check fails, run the remaining checks and normal lanes to expose every failure.
[TESTING.md](../../TESTING.md#7-test-a-change) explains how to continue after an early failure.
Repair reproducible failures in a separate Backlog task, including failures outside the original change.
Ground each repair in the observed failure and its cause.
Keep every normal owner, assertion, lint rule, and timeout contract.
An unchanged file does not prove that its failure predates this session.
After the repairs, run `bun run check` to completion and require a pass.
Record each repair and the passing gate result before closing the original task.

1. Inspect each proposal against the code as built. The code check reads most
   of it ([ADR 0046](../../docs/adr/0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md)),
   and you read the rest.
   - Run `archboard check code --variant TASK-123`. It reads the draft
     of that name on every board that has one, and the current variant on every
     other board, so one run covers every proposal of the task. A restated
     proposal (`TASK-123 after TASK-122`) has a name of its own: the run for
     `TASK-123` does not read it, and its board reads at the current variant
     there. Run the check once for each name that the task's proposals carry. A
     name that no board has is refused, and the refusal lists the drafts that
     exist.
   - Separate what your proposals change from what was already there. The
     dogfood boards carry findings that no task introduced (TASK-367.27 corrects
     them), and the exit status is 1 for any warning in the vault. So compare
     the run with the same run without `--variant`:
     ```bash
     findings() {
       archboard check code "$@" 2>&1 >/dev/null |
         sed -n -E '/^(warning|information): [A-Z_]+:/p' |
         sed -E 's/:variants\.[^.]+\./:/' | sort
     }
     diff <(findings) <(findings --variant TASK-123)
     ```
     `>` is a finding that your proposals introduce. `<` is one that they clear,
     as they should when they draw what the code does. A finding in both runs
     is not about your proposals: leave it, unless it is about a part that your
     commits changed (step 7 reads those boards). Each finding line carries its
     code beside its severity. Timings, evidence, skips and history lines are
     outside this comparison.
   - Act on each `>` line by its code. Correct the proposal to what the code
     does. If the code is wrong, fix the code and run the check again.
     - `ANCHOR_PATH_MISSING`, `ANCHOR_SYMBOL_MISSING`, `BINDING_SYMBOL_MISSING`
       and `BINDING_PATH_MISSING` are warnings: the proposal names code that is
       not there. A named draft says that its code is built, so a planned part
       that nobody built, or built elsewhere, reads `BINDING_PATH_MISSING`. That
       is a deviation. Cite or bind what was built, or drop the part.
     - `ANCHOR_MISMATCH` holds the anchor against its relationship. Its message
       says why. A symbol that is defined outside the code of both ends needs
       an anchor that cites what an end defines or calls, or the binding of the
       part whose code it is. An evidence kind that the relationship's kind
       refuses (a name used only as a type, under `call`) needs the kind that
       names what the code does, or the anchor of the real use. Information on
       a candidate: read the line that its evidence names, and then decide.
     - `RELATIONSHIP_UNDRAWN` is a warning when the use is resolved, and
       information on a candidate. The code of one bound part reaches another
       with no relationship or step between them, or between parts that hold
       them. Draw it with its anchor if the board's question needs it. Change
       the code if it should not reach. One finding lists every part that
       reaches its subject.
     - `RELATIONSHIP_BACKWARDS` and `RELATIONSHIP_UNSUPPORTED` are information,
       about a relationship with no anchor: the code runs it the other way, or
       shows no accepted evidence. Anchor every relationship that you add or
       change. A relationship with an anchor is judged only by its anchor.
     - `ENTRY_POINT_UNEXPOSED` and `CALLER_UNDRAWN` hold a container against
       its module's interface
       ([ADR 0044](../../docs/adr/0044-a-containers-interface-is-what-relationships-from-outside-reach.md)).
       For the first, make the callers use what the module exposes, or expose
       what they use. If the board's question needs the caller that the
       second names, draw it. `EXPOSED_UNUSED` is information: a `>` line names an export
       that your commits added and nothing outside the module uses. Remove it,
       unless a caller is part of the task.
   - Read by hand what the check does not cover, with the evidence rules of the
     consumer skill:
     - A part's responsibility and `description`. The binding proves a file or
       symbol exists, not that the part does what its words say.
     - A relationship's kind and label. The check only tests the evidence kinds
       that the vault's `evidence` key lists for a kind, and never a flow step's.
     - Code that the check reads only as text: a file that no adapter reads.
       The table in `packages/code-intel/src/runtime/operations/code-facts/adapters.ts` names the
       extensions and file names that an adapter reads. For any other file, the
       skip `text-only` says that anchors and symbols were tested by name and
       nothing judged undrawn, backwards or unsupported. The skip
       `symbol-unparsed` means a file did not parse. The skip
       `expression-not-followed` means that the check cannot tell the names
       there. They come from a Nix expression that the static reading of a
       flake did not follow, or from a Helm template, which only Helm renders.
       A part that was skipped has no finding, and that is not the same as
       clear.
     - A relationship across a network hop, through an event bus or through a
       value that a part receives. Anchor the code that sends or subscribes.
     - A part with no binding, and a binding into a repository that this
       machine has not registered or has no chosen checkout for
       (`archboard repo add`, `repo use`). The checkout that holds the
       vault stands for its own repository, registered or not, so a task in a
       worktree is checked against that worktree.

     Every place where the build left the plan is a deviation.
2. Correct the proposal to what was built, not to what was planned.
   In the same edit, give it the `summary` that the board will carry as the
   current variant:
   the board's scope, not the task title and not a date.
   Done: every `>` finding of step 1 is corrected or explained in the task
   notes (a candidate that you read, a network hop), and every entry that
   `semantic compare` reports has a source line behind it: an anchor for a
   relationship, a binding for a part.
3. Set the task's commits against each proposal
   ([ADR 0045](../../docs/adr/0045-git-history-is-read-through-bindings-on-request.md)).
   The footprint says which parts the commits changed and which of them the
   proposal named. It reads `HEAD`, so commit the task's code first. It compares
   the proposal with the current variant, so run it before adoption:
   an adopted proposal is refused as `NOTHING_TO_COMPARE`.
   - The base is the commit before the task's first code commit. Every task
     commit carries a `Refs: TASK-123` trailer, so the trailer finds the start
     without a note that somebody forgot to write. The commit that recorded the
     plan is the wrong anchor, because plans are written days before the work
     and the range would then hold that time of other work. Write the dot of a
     subtask id as `[.]`. A task on a branch uses `main` as the base.
     ```bash
     base=$(git rev-parse "$(git log --reverse --format=%H --grep='^Refs:.*TASK-123\b' -- . ':!backlog' ':!.archboard' | sed -n 1p)^")
     ```
   - For each proposal, run
     `archboard semantic footprint "<board>" --base "$base" --variant TASK-123`.
     The answer's `current` must be the proposal's parent. If it is not,
     another task adopted since you branched, and that task's parts read as
     removed by your proposal. Restate first (step 5), and read the footprint
     of the restated proposal, by its own name.
   - Other work falls in the range: tasks that committed meanwhile, on the same
     files or on others. `git log --format='%h %(trailers:key=Refs,valueonly,separator=%x20) %s' "$base"..HEAD`
     names the task of each commit. The parts that only their commits changed
     belong to the closing of those tasks. Leave them out of your notes.
   - `namedAndChanged` is the plan as built.
   - `changedNotNamed`, for a part that your commits changed. Ask what step 1
     of planning asks: did the commit add, remove, rename or rewire something
     that the board draws, or change what the part is for? Then add it to the
     proposal with the evidence of step 1, and run the footprint and the code
     check again until the part is in `namedAndChanged`. Otherwise the commit
     changed how the part works inside (a fix, a refactor, a test), and the
     board stays true: write one line in the task notes with the part, the
     commit and why. Decide it here, because after adoption an addition costs a
     second proposal. A container bound to a directory reads as changed whenever
     anything inside changed, so it needs a line only for what the proposal does
     not name inside it.
   - `namedNotChanged`, read with `named`. A part named by `part` (added,
     changed, removed) that no commit changed is a deviation: the plan was not
     built, or its code is not where the binding says. Correct the proposal, as
     in step 2. A part named only by a relationship is normal, because a new
     caller does not change the file of what it calls.
   - `skipped` parts are in no list, so none of them reads as unchanged. A
     `drill-down` part opens another board (in another repository, the board
     of that repository's chosen checkout): run this step on that board when
     the task has a proposal there. For another reason, read
     `git log -- <path>`. A repository `unread` lacks the base: run `git log`
     in that checkout. A commit with `large` set (over 30 files) is a sweep,
     such as a rename or a format run. Read its subject. Parts that only it
     changed are not parts the task meant to change: explain them in the task
     notes and do not add them.

   Done: every part in `changedNotNamed` and `namedNotChanged` is in a proposal
   or in the task notes, and the notes say that the footprint was read against
   that base.

4. Adopt it:
   `archboard semantic adopt "<board>" --variant TASK-123 --reason "<what the task changed>" --expect-version <n> --doing "..."`.
   If the proposal holds a disagreement, adoption is refused until
   `semantic resolve` settles it ([variants](../archboard/references/variants.md)).
5. If adoption is refused as `PARENT_SUPERSEDED`, another task adopted a
   proposal after you branched. If you adopt your proposal anyway, the adoption
   drops the change of that task.
   Branch a new proposal from the current variant, and name it
   `TASK-123 after TASK-122`, so that `--variant` reads it and not the old one.
   On it, restate the change of this task from the change of the old proposal.
   Read that change with
   `semantic compare "<board>" --variant TASK-123 --against <its parent>`.
   Shelve the old proposal with that reason, run steps 1 and 3 on the new one by
   its own name, and adopt it.
   Use `--force` only to drop the change of the other task on purpose.
6. Run `archboard check semantics`. The full `archboard check` also runs the
   code check, and the dogfood vault's own findings make it exit 1, so its exit
   status does not show a diagnostic of the task.
   Done: it reports no diagnostics. Commit the vault files with the closing.
7. Run `archboard check code` and read `behind` (ADR 0045). It lists,
   for each board and each part, the commits to bound files after the
   board's current variant last changed. An adoption moves that point, so
   your adopted boards read clean. Read every other board that your task's
   commits put behind. That board describes code the task changed, and no
   proposal of the task names it. Read the parts that the commits changed
   against the code, and the findings of this run on that board. The
   comparison of step 1 cannot show them, because it reads the same code in
   both runs: code of the task that reaches a bound part of that board shows
   only here, as `RELATIONSHIP_UNDRAWN` or an anchor that no longer holds.
   Correct a board that is now wrong, or say in the task notes why it is still
   right. Behind is information: a count never fails the check, and a board
   that is right stays behind until its next change.

If a task closes without its change, shelve its proposals with the reason.

## The README's assets

The README shows the renderer, the shell, the example vault, some of the
dogfood boards and CLI output. A task that changes any of them can leave the
README showing an older product. Before such a task closes, run
`bun run readme:check`. If it lists an asset that your change made stale,
refresh it with `bun run readme:assets <name>` and look at what it wrote.
Commit the files with `docs/readme/assets.json`. Codex assets spend the
owner's Codex usage: list them in the report for a person to run.
`docs/agents/readme-assets.md` says how each asset is made.
The `architecture` SVGs are tracked embeds of the `Archboard` board, so
`archboard check` warns `EMBED_OUTDATED` on them after a change to what its
overview draws, and names `EMBED_RENDERER_CHANGED` as information after a
renderer change. Draw them again with `bun run readme:assets architecture`,
which cuts their faces, rather than with `check --fix`, which writes the full
render.

## Removing or renaming something

Every description of archboard outlives the code it describes unless the change
that removes the code removes the description too. The drawing workflow went away on
2026-09-12. Weeks later, the glossary still defined Element and Stencil. The help of every
write command listed a refusal that no route was able to send. INSTALL.md named
a directory
that did not exist, and the environment still used the names of the fork. The block that
`install-skill` wrote into other repositories told agents that `status` prints the vault
(TASK-310), and it held paths of the installing machine (TASK-471.03).

So a change that removes, renames or redefines anything that people or agents can see must
end with a sweep in the same change. Such a thing is a command, option,
environment variable, route, answer field, refusal, concept, file or directory. The sweep
has these steps:

1. Find every place that states it.
   Run `git grep -n -i` on each spelling of the old name, and read every hit. Look in the
   root documents (`README.md`, `INSTALL.md`, `TESTING.md`, `AGENTS.md`). Look in the
   `CONTEXT.md` entries and their `_Avoid_` lines, and in both skills. Look in the help
   text, the refusal descriptions and the exit-code help under `apps/cli`. Look
   in code comments and in test names.
   Done: every hit is still true or is history. Backlog tasks, ADR bodies
   and `docs/design/skill-evals/baseline` stay as written.
2. Delete what only served it.
   If the server stops sending something, remove the client code that handled it. Also
   remove the refusal that the contracts declare for it, and its exit-code line. An export
   that nothing imports is dead: `git grep -w <symbol>` finds it only in its own file.
   Done: nothing handles, declares or exports what can no longer happen.
3. Retire the decision.
   An ADR whose subject is gone gets `status: superseded` and a closing line
   that names the
   task.
   Done: the ADRs that cite it still point at something true.
4. Say which copies stay stale.
   `bun run generate:skill-artifacts` carries INSTALL.md and the schemas into the skill.
   The skill in `~/.agents/skills` or `~/.claude/skills` changes only after
   `archboard install-skill` runs there again. So the report must tell the reader
   to run that command.

## Stating a fact where it cannot drift

- A condition on an option lives in the command contract (`requiredWhen`,
  `requiresShared`, `excludesShared`), and help derives it from there. The
  same condition written into a description drifts from the check:
  `semantic record` said `--doing` was always required.
- Every environment variable is named `ARCHBOARD_*`. Renaming or removing one
  refuses the old name by name, as `removedEnvironmentMessage` does, also when
  it comes from `.env`. A silent fallback to the default URL starts a second
  Archboard server over the same vault, and an ignored vault setting
  addresses another vault than the person means.
- Every server call names its vault (ADR 0049), and the server has no default.
  A new board route mounts `requireVault` and reads the vault with
  `vaultOfRequest`. Server memory about a board is keyed with `boardMemoryKey`
  (vault and board together), never by the board name alone. The system test
  requesters add `?vault=` for you, and `openObservedPane` takes a `vault`.
  A system test makes its vault with `vaultIn(<dir>)` and runs a command in
  that directory. It sets no environment variable that names a vault. The "Isolated servers and
  vaults" section of `docs/agents/test-suite.md` has the rules.
- A tab session has one coordinator and one workhorse for each checkout
  (ADR 0050). A workhorse is keyed by its tab session and its checkout
  (`workhorseLinkKey`), and the checkout of a vault is `checkoutOfVault`. A pane
  reads the workhorse of the checkout of its vault, which can change while the
  pane stays open, so ask for it on every read. Never key workhorse state, a
  thread link or an approval by the tab session alone.
- An optional field is a promise to every reader of its object. Adding one means
  finding every path that reads the object and making each honour it: a
  binding's `branch` and `commit` were accepted and stored while the local
  opener ignored them (TASK-311).
- Compare a claim in a document with the code or the command that it names, never with
  another document. A rewrite starts from an audit that pairs
  each claim with its evidence, a `file:line` or a command's output.
- A tracked document holds no fact about one machine (what is a symlink there,
  which directories exist). Such a fact is false on the next machine.

## Moving Codex to a new version

Archboard runs the exact `@openai/codex` that `package.json` pins, and every
Codex fact in the code was read in that version's source. A bump is complete
only at this point: nothing states a version that nobody re-read.

1. Pick the version and its source.
   `bun info @openai/codex version` names npm's latest. In a clone of
   `github.com/openai/codex`, run `git fetch --tags` and check out `rust-v<version>`.
   Done: the clone sits at the tag.
2. Diff what Archboard uses between the old and new tags.
   Diff `codex-rs/app-server-protocol/src/protocol` for the wire shapes and for the serde
   attributes of each new field. A generated `T | null` is sent as `null` unless serde
   skips it. Diff the `app-server` request processors for the methods in
   `packages/codex-app-server/src/runtime/protocol/protocol-methods.ts`. Diff realtime
   (`core/src/realtime_conversation*`, `realtime_history.rs`,
   `session/world_state.rs`, `codex-api/src/endpoint/realtime_websocket`). Diff the model
   list (`models-manager`): `gpt-6-sol` must still be listed with `low` effort.
   Done: every change is named as adopted, ignored or a behaviour change.
3. Bump the pin in three places:
   `package.json`, `expectedCodexVersion` in
   `scripts/generate-codex-app-server-contract.ts` and `CODEX_PROTOCOL_VERSION`
   in `packages/codex-app-server/src/runtime/protocol/protocol-version.ts`. `bun install` updates
   `bun.lock` and generates the new contract beside the old one under
   `packages/codex-app-server/src/shared/protocol/generated/versions/`. So
   `diff -r` of the two version directories is the wire change. A fresh
   worktree runs `bun install` at the old pin first, so the old contract
   exists to diff.
   Done: `bun run ensure:codex-contract` passes.
4. Adapt the schemas to `bun run type-check`.
   Each handwritten Zod schema in `packages/codex-app-server/src/runtime/schemas` and `packages/codex-app-server/src/runtime/protocol` is proved against the
   generated type in both directions. `__codexGeneratedWireMustExtendSchemaInput` means
   that the schema refuses something that the new wire sends.
   `__schemaOutputMustExtendCodexGeneratedWire` means that the schema lacks a
   field that the
   wire now requires. Change the schema, never the check. Then add each new
   required field to the fixtures. These include the fake Codex servers under
   `tests/system/server-state/fixtures` and `tests/system/process-contracts`,
   whose payloads only the system lane decodes.
   Done: type-check, the `packages/codex-app-server` and `packages/workbench` tests pass.
5. Re-read every version-bound claim.
   `git grep -n "<old version>" -- ':!bun.lock' ':!backlog'` finds them. Code
   and TypeScript fixtures take the version from `CODEX_PROTOCOL_VERSION` or
   `CODEX_PROTOCOL_BINARY_VERSION`. The standalone fake Codex executables
   write it literally and move to the new one. A claim about Codex behaviour
   moves only after somebody re-reads its cited source at the new tag. Correct the claim
   where it no longer holds. A measurement names the version that it was measured on.
   Done: the grep finds only history.
6. Run the gate as `.claude/rules/agent-work.md` describes. Then smoke a signed-in server.
   Start one on a free port, and copy `examples/web-shop` to `<scratch>/.archboard/vault`.
   Name the scratch directory with `-C <scratch>` on each command that uses a vault. Use the
   default state directory, so that the server uses the Archboard Codex sign-in of the machine.
   If the workbench of a server is not ready, the server exits with "The production Codex
   workbench did not become ready". Open the server in a browser and send one message.
   The first message starts the coordinator and then the workhorse. The workhorse works in
   `<scratch>`, and the coordinator in `codex-workbench/canvases/<port>/coordinator` in the
   state directory. A server that found
   its model records the `thread/start` of the coordinator as delivered. It records it in
   `codex-workbench/canvases/<port>/epoch/epoch-manifest.json`
   in the state directory.
   Done: `status` reported it running, the message was answered, the manifest holds that
   record, and the server was stopped.

## The tracked skills

Only shippable, repository-authored Archboard skills live under `skills/`.
This directory owns `archboard`, `archboard-pr` and `archboard-dev`.
`.claude/skills/` and `.agents/skills/` reach them through tracked symlinks, so an edit is live at once.
A new skill needs both symlinks and their two `!` lines in `.gitignore`.
For other skills, use the exact path in the skill catalog.
`skills experimental_install` installs the third-party skills listed in `skills-lock.json`.
Keep those installed skills untracked outside `skills/`. Other repositories use the copies that
`archboard install-skill` put in `~/.agents/skills/archboard` and `~/.agents/skills/archboard-pr`.
`BUNDLED_SKILLS` in `apps/cli/src/cli/operations/install-skill/skill-destination.ts` names the skills it ships.
To refresh those copies, run that command again. Keep the shipped skills free of
machine-specific paths, because they run outside this repo.

## Reading and observing work

Read each procedure once per session.
If a tool clips a result, retrieve only the missing section.
Bound each independent output when batching reads.
Discover code paths with `rg --files` before reading guessed filenames.
Observe long commands through their process session and the browser lane summaries.
Keep full logs outside the checkout, or in ignored files.
The `# browser-lane` JSON lines report selected, started, completed, and finished owners.
The finished line carries the exit status, including prerequisite failures and interrupted runs.
An owner completes only after its cleanup audit passes.

## Generated skill files

The consumer skill also ships derived files under
`skills/archboard/references/generated/` (ignored). These are JSON Schemas for the
persisted board document, the vault configuration and the `semantic new` and
`semantic edit` payloads. They are rendered from the Zod authorities with
`z.toJSONSchema`. The derived files also include an installation-local copy of
`INSTALL.md`. One owner, `packages/skills` (`runtime/operations/distribution`), writes them. `bun install`, the
staging step of the installer and `bun run generate:skill-artifacts` all call it.

After you change a schema or `INSTALL.md`, run `bun run generate:skill-artifacts`. Never
hand-edit a generated file or add a second schema definition. Change the Zod schema and
regenerate. The generated INSTALL copy belongs to the machine-local install. It records
whether its source checkout has working-tree changes. Its escaped absolute links depend on
the active checkout that also supplies the CLI.

## Maintaining the consumer skill

`skills/archboard` is what an agent in another repository reads to use
archboard. It is measured, not eyeballed, and it goes stale the moment the
product moves. A change to a CLI contract is a trigger: a command, option, ordering,
default, exit code or answer shape. A change to a diagram grammar or a renderer promise is
also a trigger. Changes to
semantic identity or comparison rules, vault vocabulary or grouping, schema generation or
distribution, installation, or verification behaviour are triggers too. If the trigger
fires, do these steps in the same change:

1. Update the recipe, reference, example and schema link that the change touches
   (`skills/archboard/SKILL.md` and `references/`). A recipe that the CLI
   now refuses is a defect, not a token saving.
2. Update the evaluation inputs under `evals/` at the repository root.
   These are the scenario whose `expectedFeatures` or `outcomes` the change alters, its
   fixture, and the row of `coverage.json` that maps the feature. A new
   user-facing feature or a new branch of a closed enum needs a scenario, an
   expected use and an evidence owner. Mechanical validation and generated
   metadata get a runtime owner (a fast test), never a forced authored
   decoration. The inputs live outside every skill package on purpose. An
   author reads whatever the installed skill carries. The batch of
   2026-09-14 showed authors that read the scenario, the fixture and the rubric
   that measured them (TASK-212). A fast test refuses an
   `evals/` directory inside the consumer skill, the frozen baseline or a
   prepared copy.
3. Run `bun run generate:skill-artifacts`, then
   `bun test packages/skills tests/system/cli/install-targets.test.ts` and
   `bun run check`.

The success contract of the skill is the fewest total author tokens per
successfully completed workflow, not the shortest document. The five common
paths are architecture from code, sequence through the sequence grammar, edit one
batch, propose and compare, and answer from a saved board. Each path runs on SKILL.md plus
its own recipe under `references/` (`create-architecture`, `create-sequence`, `edit`,
`propose-compare`, `read`). That recipe is the one targeted reference that a common path
needs. For each run, the evaluation command records whether the author read the recipe
that the scenario names. Source investigation, the required reads, the writes and the
verification are necessary work. Help, listing, configuration and check calls that the
context already answers are not.

The frontmatter description is the trigger. Conditional material is behind a
pointer, and the pointer says in which case to read it. Every link works in the
installed package, and this includes the
generated schemas and the INSTALL.md copy. Every guardrail in
`docs/design/skill-evals/preservation-assessment.md` keeps a home and an
evidence owner.

### Portable rules, grounded examples

Agents read the consumer skill in codebases that archboard never saw, in any language. So
the skill speaks in two registers and keeps them apart:

- Portable rules.
  Everything shared (`SKILL.md`, the catalogue, reference prose, refusal tables, the check
  steps of a recipe) uses computer-science vocabulary. It draws this vocabulary from every
  programming style that a reader can work in. A rule then reads as true for an
  object-oriented service, a functional pipeline and a UI component tree alike:
  - structure: module, function, class and method, component, closure, package
  - flow of control: caller and callee, handler, hook, callback, composition,
    recursion, entry point
  - data and effects: props and state, value passed or returned, side effect,
    configuration file, cache
  - asynchrony: event and subscription, promise and await, stream, message,
    queue, retry limit, cleanup

  Sometimes a rule uses the terms of one programming style (a class and its methods). Then
  the rule names the equivalent of another style beside it (a module and its functions, a
  component and its children).

- Grounded examples.
  Each recipe carries one worked example about archboard's own source: the payload and the
  evidence paragraph beside it. Archboard's names (a lease, a board store, a vault, a
  semantic write) stay inside that example. A rule that needs them points at the example
  ("the self step above") instead of repeating them.

Before you add a sentence to shared guidance, read it as an agent in an
unfamiliar codebase. If it only holds with archboard's names, it is
example material and goes in the worked example of a recipe. If it only holds
for one evaluation scenario, it is a fix for that scenario and stays out of
the skill.

A batch analysis names failing runs. The skill change is the portable pattern behind them,
stated in portable terms and shown in an archboard example. One scenario can be what
reveals the pattern. A rule is judged by whether it holds in any codebase, not by how many
scenarios exposed it.

The evaluated codebase appears nowhere in either package. `bun run eval:skill check`
refuses its names and every board, view, variant, group and quoted symbol that a scenario
grades. Every batch before 2026-09-17 is void, because the recipes were the
answers of that
codebase (`evals/README.md`).

### Evaluating a change

`evals/README.md` is the manual. `bun run eval:skill` is the command.
`evals/rubric.md` is what the grader reads. The evaluation command runs real Codex authors
(gpt-6-luna, high reasoning) on pinned Flask checkouts. It runs three repetitions per
scenario per skill version in parallel with isolated state. It runs an installed baseline
(`docs/design/skill-evals/baseline/archboard`) against an installed candidate (the live
`skills/archboard`). Both arms get the same CLI, prompts, fixtures and pins.

Then one grader session grades every run of the batch itself, and it reuses what
it read of
Flask. The grader is blinded to the arm, and it gives per-run feature verdicts, scores and
evidence. Its prompt tells it in these words: "Do not use subagents. Inspect the source
and grade every run yourself in this session."

Choose the grader at grading time, not at author run time.
`--grader codex` is gpt-6-astra with high reasoning in a read-only sandbox, with the
pictures attached. `--grader claude` is claude-opus-5 with high effort and Read/Grep/Glob
only. It gets none of the configuration of the operator. It opens the pictures from the
workspace, and the stream shows which pictures it opened. Both read the same prompt.
`evals/graders.json` pins each runner outside the batch digest, so both graders can grade
one batch, and the report says where they agree.

Reports separate discovery, operations and code investigation. They separate author usage
from grader usage, counted per runner: the last cumulative reading of Codex, and
the sum of
calls of Claude. They separate the primary workflows from the broad case, and they list
every failure. A person starts every run. `bun run check` never does.

Read the comparison honestly. If `pins.json` and the fixtures are untouched, a skill-only
change is comparable. A product change that makes an old recipe unexecutable is a changed
contract. The baseline arm then fails early and cheaply, and that is not a token saving.
Say so in the report.

In that case, repin both arms on the new CLI. Capture a new baseline before you claim an
improvement.

Semantic compliance needs every expected feature to pass (traffic,
containment, configured kinds, TASK-207 grouping and the rest of the
checklist). A missing or incorrect required feature fails the run, whatever the
picture looks like. The report shows every waived feature. Percentage
targets come from a measured baseline, never from a plan.

Three facts about the evidence that the first batch had to teach:

- A board patched with Codex's editing tool is a `file_change` item, not a command.
  The evaluation command keeps every file change of the stream. It fails the write
  guardrail on a board file under the vault, and it shows the grader the list. A final
  board that is right proves nothing about how it got there. A command that reads a board
  file (`sed -n`, `jq`, `python -m json.tool` with its output discarded) is a read.
  `semantic edit --help` is not a write attempt. Commands that reach for `evals/`, the
  source of the evaluation command or the directory of another run are recorded as
  exposure. A contaminated run is listed apart. It blocks the token comparison, but it is
  not called a board failure.

- The evaluation command takes the pictures. The author never supplies one.
  Every scenario declares `captures`: the boards, views and variants that its request
  names, both sides of a comparison, and the sequence view of a sequence. After
  the author
  ran, the evaluation command draws each capture through `archboard semantic rasterize` at
  native scale. It also does this after a failed run in which the server is still up. It
  records provenance (version, variant, view, size, SVG digest), and it cuts a large
  capture into native-scale tiles. It lists a capture that it was not able to take as
  failed, with the reason. A declared view that the author never made is a failed capture,
  never a default picture.

  The evaluation command attaches every capture and its required native-detail
  tiles to the
  grading call. It records successful delivery against the image and verdict
  hashes, and it
  requires observations for each capture. Missing images, incomplete tiles, stale evidence
  or missing observations make visual evaluation incomplete, and they prevent token
  efficiency claims. Rasterizing needs a Chromium-family executable
  (`ARCHBOARD_RENDERER_CHROMIUM` names one).

- Codex's `turn.completed` usage is the thread's cumulative total.
  A resumed grading call reports the total cost of the session up to that call. So a
  session costs its last reading, and the share of each call is the growth since the
  previous call. In the 2026-09-14 batch, the sum of the calls counted the first call
  fifteen times over. `evals/pins.json` pins this, and
  `docs/design/skill-evals/2026-09-14-batch-corrections.md` records what it
  changed.

## Facts that will mislead you

- In a worktree, `archboard` is not the main checkout's CLI. `archboard` on
  PATH links to the main checkout, but inside another archboard checkout it
  runs that checkout's own `bin/archboard` (ADR 0049). So a worktree's
  commands run the worktree's source and reach the worktree's own server: port
  3000 is the main checkout's, and a linked worktree takes a port from 10000
  to 19999 that its path decides. To test a server change, run
  `archboard restart` in the worktree. The owner's server on
  3000 keeps running. If a command finds a server of another checkout's
  source on its port, it refuses and names both checkouts.
- A pane key carries a variant, but a board name never does.
  `payments@<variant>` is an address, and `readSemanticBoard` on one throws, because a
  board is one document that holds the whole family. Split it first (`parseBoardKey`, or
  `aggregateOf` on the server). The board is the key for everything that a board has: the
  file, the lease, the claim, and what an agent said it was doing. Only what is drawn
  depends on the variant. If you get this wrong once, you get the same bug three
  times over.
- The board of a pane can be null. A fresh vault holds no board. A pane
  registers before it has a board, or nobody can show it the first board that
  somebody makes.
- A refused write is the design (ADR 0006 as it now stands): a stale version is
  reported and nothing is written. Do not "fix" a refusal by reading the board
  again and retrying. That makes the check pass by construction, and it hides the change
  that the check was meant to notice.
- To test pane switching, use two boards, never two panes on one board. A switch reaches
  the socket of one pane, and a regression then looks like the other pane being replaced.
- The browser holds board content only as a read-only cache. One part is a query that the
  pane reads again on the announcement of the board. The other part is pictures stamped
  with the board version, policy fingerprint and renderer build. Before the
  browser shows a
  picture, it makes sure that these stamps are current. The browser never holds
  a copy that
  it edits or that it answers from without that test (ADR 0023).
- Read `bun run type-check` by its exit status.
  tsc colours `error` and `TS2345` as separate sequences, so `grep 'error TS'` matches
  nothing and a failing check looks clean. Lint's type-aware rules are not the compiler
  either: a refactor that passes `bun run lint` can still fail type-check.
- Text width is measured by the canvas of whatever draws the picture, with the diagram
  fonts loaded. Under Bun, this is an `@napi-rs/canvas` canvas that the renderer host
  installs as `OffscreenCanvas`. In a browser, it is the canvas of that browser.
  Never add a
  font measurer. Pictures can differ between browsers, because each matches what that
  browser paints. `tests/system/browser/measured-text.test.ts` holds the Bun
  canvas to what
  Chrome draws. The two agree to under one percent.
