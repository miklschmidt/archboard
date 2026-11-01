# Read the design lens

The design lens is the set of reads that state facts about a design.
`model inspect` and `model compare` read the model. `model locality` and `model footprint` read Git through code bindings.
Each fact is a question, and the source answers it.
Report the facts and the parts behind them, and leave the judgment to the user.

| Question                                               | Read                                              |
| ------------------------------------------------------ | ------------------------------------------------- |
| What do callers of this module reach?                  | `model inspect <module>`                          |
| Where does this group meet the rest of the model?      | `model inspect --group <id>`                      |
| What does this proposal change for callers?            | `model compare --state <proposal>`                |
| How do competing proposals measure side by side?       | `model compare --state <one> --beside <other>`    |
| Which modules change often, and which change together? | `model locality`                                  |
| Did a branch stay inside its proposal?                 | `model footprint --base <ref> --state <proposal>` |

`model inspect` and `model compare` state their facts in words on standard error, then answer in JSON on standard output.
Each read takes `--state`. `model inspect` also takes `--checkpoint`.

## Interface

`model inspect <module>` reads the whole state before any reading narrows it.
The interface comes from relationships, so it says which parts callers reach.
Every relationship kind counts, and flow steps do not.
`check code` holds the interface to what the code exposes.

- `entryPoints`: the parts that a relationship from outside reaches, each with `reachedBy`. A caller depends on each one.
- `hiddenParts`: the parts that nothing outside reaches. A change to one reaches no caller that the model draws.
- `callers`: the modules where those relationships start, once each. An interface change costs each of them.
- `outgoing`: relationships that leave the module. A long list asks what the module depends on to do its job.
- `passThrough`: entry points with no parts that send one relationship, of the kind that they receive. Ask what each hides. If you remove it and connect its callers to the part it calls, does only a line go?
- `onContainer`: relationships that end on the module itself. Each makes a caller and no entry point, because the model names no part. `archboard check` fails on such an end, so read the source and move it to the part that owns the code.

Say a state's facts in the model's terms:

- If `holdsParts` is false, say that the module holds no parts. It has no interface.
- If `callers` is empty, say that the model draws no caller. Every part is then hidden, because nothing outside reaches it.
- Report each of the five `measures` on its own, with the parts behind it.

`model inspect --group <id>` lists the `members`, the `internal` relationships, the `boundary` relationships with their direction, and the `neighbors`.
A relationship that reaches a part of a member reaches that member. One between two parts of a member crosses nothing.
Boundary relationships ask how much the group depends on the rest of the model, and what depends on it.

## Comparison

An interface change costs every caller, and a change inside a module costs one module.
So `comparison.interfaceChanges` comes first, and `comparison.subjects` follows.
`model compare` selects its default base as `model read --compare` does. `--against` names another.

- `entryPointsAdded`, `entryPointsRemoved`: entry points that are not parts of the module in the other state.
- `becameEntryPoints`, `becameHidden`: parts in both states that moved into or out of the interface.
- `callersGained`, `callersLost`: modules that start or stop reaching the module.
- `unchanged`: containers that the comparison read and found the same.

An interface change sets no comparison status. When a new caller reaches a part, the part stays unmarked.

`comparison.interfaceMeasures` puts the five counts of each state side by side.
`states` lists the selected state, its base, then each `--beside`, and each row's `byState` follows that order.
The words list containers whose counts differ. The JSON holds every container.

To design it twice, draft two proposals from one predecessor and compare them with `--beside`.
Report each row and what each proposal asks of its callers. Let the user choose.

## Locality

`model locality` reads the year before HEAD, or the period from `--since <date>`.

- `hotspots`: bound modules ranked by `count`, the commits that changed them. The count measures commits, and it says nothing about size or complexity.
- `coupling`: pairs that change together, with `shared` commits and `degree`. With `unjoined` true, nothing in the model joins the pair. Ask whether the model misses a dependency, or whether two modules carry one decision.
- `leftOut`: large commits that both readings leave out, because they make unrelated modules look coupled.
- `skipped`: modules that the read left out, with the reason. Say that the read skipped a module, because commits can still change it.
- `attribution` on a hotspot: the precision of the reading. Report a path-wide reading as path-wide.

## Footprint

`model footprint --base <ref>` reads the commits from the merge base to HEAD. `--head <ref>` names another end.
Without `--state`, it answers with `changed`.
With a proposal, it answers with three lists:

- `namedAndChanged`: the branch changed what the proposal names.
- `changedNotNamed`: the branch changed a module that the proposal leaves out. Ask whether the branch left the plan, or the plan misses a module.
- `namedNotChanged`: the proposal names a module that the branch left alone. Ask whether the work remains, or the module needs no code change.

A footprint keeps large commits and marks each with `large`.
`skipped` lists each module that it did not read.
It is information, so it changes no exit status.
