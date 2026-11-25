---
status: accepted
---

# A picture is read through a lens

The owner decided on 2026-11-22 that a picture is drawn through a lens: a named question that
chooses which lines draw and says how many it left out (owner decisions 20, 22 and 25, TASK-663).
Two advisors settled the rest in two rounds. A lens selects relationships by the kind and the
effect that [ADR 0094](0094-a-relationship-states-how-it-travels-and-what-it-does.md) records.

This record amends [ADR 0024](0024-vault-configuration-owns-vocabulary-and-presentation.md),
[ADR 0057](0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md) and
[ADR 0070](0070-doors-are-buttons-and-every-relationship-has-a-line.md).

Amended on 2026-11-22 (TASK-663.08 to TASK-663.12): the lenses select `sync` and `async` where
they selected `call`, a new lens finds sync computes, a reader hides effects by hand as well as
kinds, and the lens and its outcome stand above the picture.

Amended on 2026-11-25: the legend picks a lens from a `Select` dropdown showing each lens's
question under its name instead of a multi-row tab grid, and separates `Kinds`, `Effects`,
`Hidden by <lens>` and `Line marks` into bounded sub-groups so read-only line marks cannot be
mistaken for hidden items.

## Context

Since ADR 0070, every relationship has a line. In this repository, a scope with 20 or more lines
had a median of 39 of them. A reader asks one question at a time: how does traffic flow, where
does state change, what depends on what. The filter of a reading hides kinds by hand, and it takes
away every part that drew only hidden lines, so it cannot serve as the way a picture opens.

## Decision

### A lens is a named question in the vault policy

A lens has an id, a name, an optional question and exactly one list: `show` draws only the
relationships that its selectors match, and `hide` draws all but those. Each selector names a
kind, an effect, or a kind with an effect, and when it names both, both must match. A relationship
matches the list when any selector matches it. A relationship that states no effect matches no
selector that names one.

The vault configuration holds the lenses under `lenses` and the default under `defaultLens`. The
configuration refuses a selector that names a kind or an effect that is not in effect at its path,
such as `lenses.<id>.show.<n>.kind`, and a default lens that does not exist at `defaultLens`.

The built-in lenses sit under a vault's own, and a vault's lens with a built-in id replaces it
whole:

| Id             | Name                  | Question                                                           | List                                                                  |
| -------------- | --------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `main`         | Main lines            | Mutations and traffic between processes                            | hide `dependency`, and `query` and `compute` on `sync` and on `async` |
| `effects`      | Side effects          | Where does state change?                                           | show `mutation`                                                       |
| `sync-compute` | Sync compute          | Where does the caller wait while another part works out an answer? | show `sync` with `compute`                                            |
| `network`      | Network               | How does traffic flow between processes?                           | show `http`, `rpc`, `queue`, `event`, `stream`                        |
| `reads`        | Reads                 | Where is held or fetched state read?                               | show `query`                                                          |
| `dependencies` | Declared dependencies | What depends on what without a run-time call?                      | show `dependency`                                                     |
| `all`          | All relationships     | Every relationship in this scope                                   | hide nothing                                                          |

The lenses are offered in this order. "Side effects" is the old Effects, named in the owner's
words ("a map of calls with side effects"). "Sync compute" is the owner's hunt, the case that
`main` hides: "when i look at a diagram and i see an synchronous compute call, that's when i would
dig deeper and likely plan work to make that call async."

`main` is the default lens of a vault that names none. It shows every mutation, however it
travels, and all traffic between processes. It leaves out declared dependencies and the queries
and computes in process. It is the owner's "leave out plain calls and dependencies" in the terms
of ADR 0094. An address, a recipe or a policy of the call era that hides `call` reads as hiding
both `sync` and `async`. A selector that names `call` is refused, and the refusal names `sync`
and `async`.

`all` shows every relationship in every vault. A vault may rename it, but its list stays
`hide: []`, so `Show all` means one thing everywhere.

A reading of the old format, from before the upgrade, has one lens, `all`, and opens on it. An
Effects picture of such a reading would otherwise say that nothing changes state.

### What a lens draws

TASK-663.03 builds this section and may adjust it.

A lens takes away lines, and with them each part and door whose every line it took. This is the
rule of the filter since TASK-647: a part that drew only hidden lines leaves the picture, and a
part that never drew a line stays, as do open frames, the subjects of a focus and the members of
an exact imported view. The owner decided on 2026-11-22 that a lens follows it: a picture that
kept parts with nothing attached contradicted TASK-647. The filter (`--hide-kind`, and the kind
switches of the legend) still hides kinds by hand after the lens. Choosing a lens clears the kinds
hidden by hand, and `Show all` selects `all` and clears them. When a lens the reader named leaves
no part, the reading says that the lens leaves out every line of the scope, and offers every
relationship.

The picture says how many lines the lens left out: `N lines left out`. It counts the lines that
`all` draws at the same scope, focus and comparison and that the lens leaves out whole. A joined
line that keeps one of its relationships counts nothing.

The lens and its outcome stand in one status line above the picture, in the reader and in
exports: `Main lines · 66 lines left out`. At zero there is no count. The status stands even when
the picture has no legend. It moved there from the legend and from the foot of an export, because
a reader reads the picture's question before its lines, and a note at the foot was found last.

Where the default lens would draw no line and `all` would draw some, a reading that names no lens
reads through `all`, and the status says so: `Main lines has no lines here · Showing all
relationships`. The owner decided this on 2026-11-22 (TASK-663), because in this repository the
default drew nothing in modules that only compute, such as Painting. Manual filters apply
after that choice. Hiding every line by hand keeps the chosen lens. A lens the reader names is a
question, and an empty picture with its note answers it, so a named lens never gives way. The
reading records the lens it drew, `all`, so its recipe redraws the same picture.

`model render` and `model rasterize` take `--lens <id>`, by id only. An unknown lens is refused
with the list of lenses. A sequence or a flowchart refuses `--lens`, because it draws every
participant and step of its flow. `--hide-kind` stays and hides kinds beyond the lens.

A reading, its address and a render recipe hold the lens id, not its selectors, so a changed lens
restyles old pictures as a changed policy does (ADR 0024). A reading, a recipe, a walkthrough beat
or a bookmark from before lenses names no lens, and it reads through `all` with its hidden kinds
kept, which is what it drew. A new reading that names no lens reads through the vault's default.

### A reader hides kinds and effects by hand

After the lens, a reader hides kinds (`hideKinds`) and effects (`hideEffects`) by hand. The
tokens of `hideEffects` are `mutation`, `query`, `compute` and `declared`, the last for a
dependency that states no effect. A relationship draws when the lens shows it and neither its
kind nor its effect is hidden. The filters act on each relationship before lines join, so the
joins, the cards and the count of lines left out are worked out again after them. Choosing a
lens clears both lists, and `Show all` selects `all` and clears both.

The address, the render recipe and the CLI carry `hideEffects`: `model render` and `model
rasterize` take `--hide-effect`, repeatable, beside `--hide-kind`. An unknown token is refused
before the command reaches the server.

### The legend offers the lenses

The `Relationships` section of the legend opens with a `Select` dropdown that lists every lens in
the order above with its question under its name. Under it stand up to four bounded sub-groups,
separated by hairline rules: `Kinds` (each kind's sample in its ink, with an eye), `Effects` (each
effect's sample in neutral ink with its head, with an eye), `Hidden by <lens>` (dimmed rows that the
active lens hides, with no switch, because turning them on would contradict the lens), and
`Line marks` (the read-only marks of emphasis, traffic and comparison). The rows come from the whole
scope, so hiding one moves no row. Clicking a row's name shows only that row, and its eye still
turns it on and off. Choosing the active lens again clears manual kind and effect filters.

## Considered and rejected

- **A lens that keeps every part of its scope.** The advisors first chose it, because the
  default pictures of this repository lost 430 of 677 parts and 33 of 117 scopes had nothing left.
  The default lens now gives way to `all` where it would draw no line, so no scope opens empty,
  and the owner chose the rule of TASK-647 over bare cards.
- **A lens as one list of kind ids.** `main` and `all` then could not be written as
  configuration, and a vault that restated its default as a list would leave its own new kinds out
  of it.
- **Two lists, of kinds and of effects, that must both pass.** It cannot say "a query in process"
  without also catching a query over HTTP, so the default could never separate the two.
- **A `main` that keeps queries in process.** The audit in TASK-663 counts lines in wide scopes
  through both candidates and reports them, so the owner can change the default with that
  evidence. With selectors, the change is one line of configuration.
- **An `http` lens and a `messages` lens.** One `network` lens answers how traffic flows, and a
  vault adds a lens of one kind if it wants one.
- **The id `data` for the lens of queries.** A lens named Data that leaves out every write of data
  misleads.
- **The id `overview` for the default.** The glossary avoids that word for a reading.
- **A lens found by its name on the command line.** A lens id is a word that a person chose, as a
  kind id is, and `--hide-kind` takes ids only.
- **"0 lines left out".** A count of none reads as noise.
- **No filter of effects by hand**, which the first version of this record chose, because the
  built-in lenses named every useful cut of three effects. Once the effect was a row of the
  legend with its own sample, a reader expected it to switch as a kind does, and isolating one
  pair of kind and effect from `all` took six clicks. `hideEffects` costs an address field, a
  recipe field and a flag.
- **Every lens falling back to `all` when it draws nothing.** A lens the reader named is a
  question, and an empty picture with its status answers it. Only the implicit default gives way.
- **The lens and its count at the foot of the picture or in the legend.** The reader met the
  question after the lines, and a closed legend hid it.
- **Switches on rows that the lens leaves out.** Turning one on would draw lines that the chosen
  lens hides, so the reader would no longer read through the lens they chose.
- **A semantic check on the share of plain calls.** ADR 0094 replaces it with the effect that
  every relationship states.

## Consequences

- A picture opens on fewer lines than before, and says above the picture which lens it reads
  through and how many lines it left out.
- Tracked embeds stay current: the recipe's fingerprint reads no lens definition, and a recipe
  from before lenses reads through `all`.
