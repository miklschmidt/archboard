# Read the design lens

The design lens reports facts for a design decision.
`model inspect` and `model compare` read architecture.
`model locality` and `model footprint` read Git through code bindings.
Support each fact with its subjects and source evidence. Leave the judgment to the user.
[Module depth](#module-depth) is the exception: the code check judges it.

| Question                                       | Read                                              |
| ---------------------------------------------- | ------------------------------------------------- |
| What do callers reach?                         | `model inspect <module>`                          |
| Where does a group meet the rest of the model? | `model inspect --group <id>`                      |
| What does a proposal change for callers?       | `model compare --state <proposal>`                |
| How do proposals compare?                      | `model compare --state <one> --beside <other>`    |
| Which modules change often or together?        | `model locality`                                  |
| Did the branch stay within its proposal?       | `model footprint --base <ref> --state <proposal>` |

Each read accepts `--state`. `model inspect` also accepts `--checkpoint`.
Inspect and compare write prose to standard error and JSON to standard output.

## Interface

An interface is the set of parts that callers reach.
`model inspect <module>` reads the complete state before scope or filters narrow it.
Every relationship kind counts. Flow steps do not.
Use `check code` to compare the modeled interface with source.

The result reports:

- `entryPoints`: Parts reached from outside, with `reachedBy` for each dependency.
- `hiddenParts`: Parts that no modeled outside caller reaches.
- `callers`: Distinct source modules that depend on the interface.
- `outgoing`: Relationships that leave the module.
- `passThrough`: Childless entry points that send one relationship of the kind they receive.
- `onContainer`: Relationships ending on the container, with a caller but no named entry point.

For `passThrough`, ask what the part hides and whether removing it removes anything beyond a line.
For `onContainer`, follow [endpoint repair](authoring.md#give-each-container-a-job).
If `holdsParts:false`, state that the module has no parts or interface.
If `callers` is empty, state that the model draws no caller and all parts are hidden.
Report the five `measures` separately with their subjects.

Group inspection lists `members`, `internal` relationships, directed `boundary` relationships, and `neighbors`.
A relationship reaching a member's part reaches that member.
A relationship between two parts of the same member crosses no group boundary.
Use boundary facts to explain dependencies in both directions.

## Comparison

An interface change affects callers. An internal change affects one module.
The result therefore lists `comparison.interfaceChanges` before `comparison.subjects`.
For base selection and revision rules, follow [proposal comparison](canonical-models.md#create-and-compare-compact-proposals).

Interface changes include:

- `entryPointsAdded`, `entryPointsRemoved`: Entry points absent as parts in the other state.
- `becameEntryPoints`, `becameHidden`: Continuing parts that enter or leave the interface.
- `callersGained`, `callersLost`: Modules that start or stop reaching it.
- `unchanged`: Containers with equal interfaces in both readings.

An interface change alone sets no subject comparison status.
A new caller can reach a part while that part stays unmarked.

`comparison.interfaceMeasures` compares five counts per state.
`states` lists selected state, base, then each `--beside`. Each row's `byState` follows that order.
Prose names containers with different counts. JSON includes every container.

To compare alternatives, create sibling proposals and use `--beside`.
Explain each row and the demands on callers, then let the user choose.

## Locality

Locality reports which bound modules change in nearby commits.
`model locality` reads the year before HEAD, or starts at `--since <date>`.
Its result includes:

- `hotspots`: Modules ranked by commit `count`, not size or complexity.
- `coupling`: Pairs that change together, with `shared` commits and `degree`.
- `leftOut`: Large commits excluded from hotspots and coupling because they connect unrelated changes.
- `skipped`: Unread modules and reasons, not proof that no commits changed them.
- `attribution`: Precision for a hotspot. Describe path-wide evidence as path-wide.

If `unjoined:true`, the model does not connect the pair.
Investigate a missing dependency or one decision spread across two modules.

## Footprint

A footprint compares branch changes with modeled subjects.
`model footprint --base <ref>` reads from the merge base to HEAD.
`--head <ref>` selects another end. Without `--state`, the footprint reads the current state, and the result is `changed`.
If the head adopted that current state, because its current state differs from the merge base's, the footprint reads it as a proposal against the merge base's current state. A proposal that a branch drafts and adopts before it merges stays the plan of that branch.
If the vault's repository resolves the head, the command reads the vault as that head holds it, so `--state` names a proposal of that branch.
`--model-at checkout` reads the vault on disk instead, for a proposal that you edit and did not commit to the head.
`vaultRead` names the vault that the command read: `{"at":"checkout"}`, or `{"at":"ref"}` with the ref and its commit.
In the browser, Measures shows the same answer in `What this branch changed`.
With a proposal, it reports:

- `namedAndChanged`: Branch changes that the proposal names.
- `changedNotNamed`: Changed modules absent from the proposal. Investigate work outside the plan or an incomplete proposal.
- `namedNotChanged`: Proposed modules without code changes. Identify unfinished work or explain why no code change is needed.
- `preexisting`: Modules the proposal adds whose bound code the branch does not add, so a picture marks them as added without new code. If their code exists at the merge base, model it in Current first. Otherwise repair the binding.

A module counts as changed only when its bound code differs between the merge base and the head. A change that a later commit undoes, or that a merge brings in again from a lower layer of a stack, does not count.
Footprints retain large commits with `large` and list unread modules in `skipped`.
`unboundFiles` lists each changed file that no module is bound to, because no module shows that change. The vault's files are not listed.
Findings alone change no exit status.
Each changed module lists in `holds` the other changed modules that are bound inside it.
It lists them only when they bind each file that the branch changed in its own binding.
If the branch also changed a file that only the outer module binds, its `holds` is empty.
An unchanged module lists none.
With a proposal, `--fail-outside` exits 1 when a module in `changedNotNamed` has empty `holds`.
It names each failing module on standard error.
The pull-request Action excludes modules with nonempty `holds` from its group of modules changed outside the plan.
If an older CLI omits `holds`, the Action counts every changed module absent from the plan.
A file in `unboundFiles` never fails the gate.
The branch adds code to a module when it adds a file inside its binding that the merge base lacks, or the declaration that its binding names. A renamed file adds none. Each module states this in `newSource`.
A module bound to a directory that gains a new file is therefore not preexisting.
With a proposal, `--fail-preexisting` exits 1 when `preexisting` is not empty.
The pull-request Action lists these modules in its comment. Its `preexisting` input warns by default and fails only when set to `fail`.
If a repository cannot read the requested base or head, the command names it and exits with status 2.
Source refs stay local. The command retains no source history.

## Module depth

The code check measures each bound TypeScript, Swift, C, C++ and Objective-C module from its code. Unlike the reads above, it gives verdicts, as findings.
It also counts the exports of a bound Terraform module, Nix flake and Helm chart by kind, and judges none of them: a variable, an output or a value is there for callers. Terraform keeps its own `VARIABLE_PASSED_THROUGH` and `MODULE_SHALLOW`.
`depth` lists each module's exports by kind (`functions`, `classes`, `methods`, `values`, `types`) and `logic`, the calls, operators, conditions, loops and hidden values behind them.
The counts are evidence. Never turn them into a score.
A type is what declares nothing a caller runs: a TypeScript interface, alias or enum; a C or C++ struct, union or enum with no methods, a typedef or an alias; a Swift protocol, alias or enum with no methods; an Objective-C protocol.
A C function macro is a function, and a Swift struct is a class.

`archboard check code --fail-shallow-modules` judges the modules that the branch touched since its base, uncommitted changes included.
`--base <ref>` names the base. Without it, the default base decides.
A vault policy with `codeCheck: { failShallowModules: true }` turns the gate on for plain `archboard check`.
`BASE_UNRESOLVED` means the check could not read the branch. Name a base that resolves; never treat it as a pass.

Clear each finding at its seam. Never silence one.

- `EXPOSED_VALUE`: callers read an exported value, so they hold logic that belongs to the module.
  With one reader, move the value into that reader and stop exporting it.
  With several, move what they compute from it into the module, behind a function such as `restartDelayMs(attempt)`.
  Where a caller needs the value itself, export a function that returns it.
  An export that can be called is a function, even when a call makes it: a compound component made by `Object.assign(Root, { Item })`, or the helper that `cva(...)` returns.
  The check follows the name that `Object.assign` extends, and asks the language server whether any other value can be called.
  A schema cannot be called, so it is a value. A contract module keeps its schemas inside and exports a parse function and the types derived from them:

  ```ts
  const UserSchema = z.object({ name: z.string() });
  export type User = z.infer<typeof UserSchema>;
  export function parseUser(input: unknown): User {
  	return UserSchema.parse(input);
  }
  ```

- `EXPOSED_VALUE_COMPUTED`: two or more modules write the same math on one exported value or getter. The evidence lists every line that writes it.
  The math is logic the exporter owns. Give the exporter a function that does it, make every caller call that function, and stop exporting the value that no caller reads any more:

  ```ts
  // Before: two callers each compute the backoff on the exported durations.
  Math.min(PROCESS_MS.restartMax, PROCESS_MS.restartBase * 2 ** attempt);
  // After: the timing module owns it, and keeps the durations inside.
  export function restartDelayMs(attempt: number): number {
  	return Math.min(PROCESS_MS.restartMax, PROCESS_MS.restartBase * 2 ** attempt);
  }
  ```

  The match ignores the callers' own names and operand order, and follows one local variable. Equality, comparison and bitwise operators are no math.
  Two pieces of math that only share a shape, such as a deadline and a jitter, also match. One function on the exporter clears both.

- `CODE_PASS_THROUGH` (information): a function or public method only passes its call on with its own parameters.
  Give it a decision of its own, such as a default, a check or a translation, or let callers call the code it passes to.
  A function that calls a value its own file keeps hidden, such as `parse(input)` over a hidden schema, is the module deciding and has no finding.
- `REEXPORT_PASS_THROUGH`: the module passes on a name that another module defines.
  Through one door it is information. It is a warning when files outside both modules also import the defining module directly: two doors to one name.
  Keep one door. Stop passing the name on, or make every caller import it through this module.
- `EXPOSED_UNUSED`: no file outside the module uses an exported name, as code or as a type. A test is no user.
  Stop exporting it. If files of the module use it, keep it out of the module's root files.
  It is a warning only after a complete read: every file outside the module parsed, every relative import resolved, no whole-module import.
  A caller outside this checkout, such as the users of a published package, or a framework that loads a route or a story by its file, makes it information once you draw that caller in the model.
  Methods are not judged unused, because their uses go through values, so an implementation used through its interface counts as used. Members the language calls are never counted or judged: a constructor, `toString`, a C++ destructor or operator, a Swift initializer, `hash(into:)` or `encode(to:)`, an Objective-C initializer, `dealloc` or `description`.
- `MODULE_SHALLOW`: every export of the module that is not a type has `EXPOSED_VALUE`, `EXPOSED_VALUE_COMPUTED` or a pass-through finding. A class stands for its public methods. Clear those findings, and it clears.
  If nothing is left to hide, merge the module into its callers.

Each exported name gets at most one finding. `EXPOSED_UNUSED` comes first, because its remedy removes the name.

A language can force a constant. No exemption exists, so use the seam that replaces it:

- A `switch` case label or an array size: export a predicate or a method that answers the question.
- An `as const` object with types derived from it: export the type, with `isKind` and `allKinds`.
- An attribute argument or a decorator value: let the module ship the attribute.
- A compile-time condition such as `#if`: move the condition into the module.

Exported types count for no verdict, so an exported union or enum keeps the compiler's exhaustive checks.

## Integrate with improve-codebase-architecture

Use Archboard alongside [improve-codebase-architecture](https://github.com/mattpocock/skills/tree/main/skills/engineering/improve-codebase-architecture).
Keep that skill's exploration, candidate selection, and design discussion.
During exploration, use [locality](#locality) to find active modules and [interface inspection](#interface) to examine their callers and dependencies.

For candidate designs, use the [proposal workflow](canonical-models.md#create-and-compare-compact-proposals) to describe intended changes without changing Current.
Use [comparison](#comparison) to explain each candidate's effect on callers.
Use [canonical renders](canonical-models.md#initialize-and-consume-one-live-model) for the before-and-after architecture pictures in its HTML report.

During implementation, keep the chosen proposal aligned with the code.
Use [footprint](#footprint) to account for branch changes against that proposal.
Follow [proposal completion](canonical-models.md#complete-a-proposal) for adoption or shelving under the owner's authorization.
