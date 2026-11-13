# Read the design lens

The design lens reports facts for a design decision.
`model inspect` and `model compare` read architecture.
`model locality` and `model footprint` read Git through code bindings.
Support each fact with its subjects and source evidence. Leave the judgment to the user.

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
`--head <ref>` selects another end. Without `--state`, the result is `changed`.
If the vault's repository resolves the head, the command reads the vault as that head holds it, so `--state` names a proposal of that branch.
`--model-at checkout` reads the vault on disk instead, for a proposal that you edit and did not commit to the head.
`vaultRead` names the vault that the command read: `{"at":"checkout"}`, or `{"at":"ref"}` with the ref and its commit.
In the browser, Measures shows the same answer in `What this branch changed`.
With a proposal, it reports:

- `namedAndChanged`: Branch changes that the proposal names.
- `changedNotNamed`: Changed modules absent from the proposal. Investigate work outside the plan or an incomplete proposal.
- `namedNotChanged`: Proposed modules without code changes. Identify unfinished work or explain why no code change is needed.

Footprints retain large commits with `large` and list unread modules in `skipped`.
`unboundFiles` lists each changed file that no module is bound to, because no module shows that change. The vault's files are not listed.
Findings alone change no exit status.
Each changed module lists in `holds` the other changed modules that are bound inside it.
It lists them only when they bind each file that the commits changed in its own binding.
If the commits also changed a file that only the outer module binds, its `holds` is empty.
An unchanged module lists none.
With a proposal, `--fail-outside` exits 1 when a module in `changedNotNamed` has empty `holds`.
It names each failing module on standard error.
The pull-request Action excludes modules with nonempty `holds` from its group of modules changed outside the plan.
If an older CLI omits `holds`, the Action counts every changed module absent from the plan.
A file in `unboundFiles` never fails the gate.
If a repository cannot read the requested base or head, the command names it and exits with status 2.
Source refs stay local. The command retains no source history.

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
