---
status: accepted
---

# A relationship states how it travels and what it does

The owner decided on 2026-11-22 that every relationship states two things: its kind, how it
travels, and its effect, what it does (owner decisions 23 to 27, TASK-663). Two advisors settled
the rest in two rounds. [ADR 0095](0095-a-picture-is-read-through-a-lens.md) records how a picture
is read through these two fields.

This record amends [ADR 0024](0024-vault-configuration-owns-vocabulary-and-presentation.md),
[ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md) and
[ADR 0046](0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md).

## Context

Pictures of many modules were unreadable. Of this repository's 1328 relationships, 78% were
`call` and 12% `dependency`. A `call` said only that one part invokes another: it did not say
whether the part changes something, reads something or only works out an answer. A reader asks
one question at a time, such as where state changes, and the picture could not answer it.

A first design put the answer in the kind, with `mutation`, `query` and `compute` beside `http`
and `event`. Then an HTTP request that changes state had to choose between two true kinds. The
owner split the two questions into two fields.

## Decision

### The kind says how a relationship travels

The kind names the mechanism between the two named ends. Archboard has eleven built-in kinds:

| Kind         | How it travels                                                                     |
| ------------ | ---------------------------------------------------------------------------------- |
| `call`       | In process: a function, a method or a value used at run time.                      |
| `http`       | An HTTP request.                                                                   |
| `rpc`        | A remote procedure call with its own contract, such as gRPC or JSON-RPC.           |
| `event`      | A named message that the source publishes and that listeners receive.              |
| `queue`      | Work that the source puts on a queue for a worker.                                 |
| `stream`     | Successive bytes or records with no message name: a pipe, a stream, a media track. |
| `spawn`      | The source starts a process.                                                       |
| `render`     | The source places the target's component in its output.                            |
| `storage`    | The source reads or writes through a store's own interface: files, SQL, keys.      |
| `dependency` | A declared requirement. Nothing of the target runs at run time.                    |
| `other`      | A labelled relationship that fits no kind.                                         |

The built-in kinds sit under a vault's own. A vault adds a kind with an id of its own, and its
entry for a built-in id replaces that kind whole. A kind that the vault adds must name its color,
because the kind is the color of its lines. The configuration refuses one without a color at
`relationshipKinds.<id>.color`.

`data` is gone. Its place for direct store access is taken by `storage`. Of the 34 `data`
relationships in this repository, 25 meant "data passes", and the old name invites that again.

### The effect says what a relationship does

The effect has three values:

- `mutation`: the operation can change state or have an effect outside the caller.
- `query`: it reads held or fetched state, such as a store, the clock or a context.
- `compute`: its answer follows from what the source hands over alone.

Every relationship states its effect, a vault's own kinds included. Only a `dependency` may
omit it, and the omission means "a declared requirement only". A dependency may also state one.

An agent classifies each relationship from the code by the work the source asks the target to do.
It reads the callee or its contract and asks in order:

1. Can the operation have a side effect? Then it is a `mutation`. A conditional write, a
   publication, an acknowledgement that removes work and the installing of a subscription are
   side effects. Follow delegated work. A return value does not make a write a read.
2. Otherwise, does it read held or fetched state? Then it is a `query`.
3. Otherwise, it is a `compute`.

Doubt about a side effect resolves to `mutation`. A relationship that stands for several
operations takes the strongest effect among them: `mutation`, then `query`, then `compute`.

Every kind is judged by its operation, never by its kind. An event publication or a queue
submission mutates, and a peek at retained work queries. A spawned short-lived transform
computes, one that reads a Git ref queries, and the start of a persistent server mutates. A
`render` is judged by placing the component and by what it does when it mounts.

These are rules of evidence, and they live in the authoring guidance of the archboard skill. The
schema holds the three values and the exception for `dependency`, with no table of the effects
each kind allows.

### The module files change format

Module files move to format 2 (`"schemaVersion": 2`), whose relationships state an effect. A
write of a relationship without one is refused whole. The refusal names the module file, the
path `outgoing.<n>.effect` and the relationship's id.

A vault is in the old format when a module file has format 1 or its configuration records a
`dash` on a kind. Such a live vault opens read-only with one diagnostic, `UPGRADE_REQUIRED`, which
names the upgrade, and not with one error for each relationship. The vault check warns once.
Every edit is refused with the same diagnostic until the vault is upgraded. A claim, a retention
and the import of an old bundle still work, because they write no live module.

A retained checkpoint reads exactly as stored, with its own policy and modules
([ADR 0065](0065-checkpoints-retain-architecture-without-selecting-current.md)). A reading from
before the upgrade keeps its recorded look: its kinds keep their dash.

A comparison counts an effect as changed only when both sides state one. Otherwise every
relationship would read as changed against a base from before the upgrade.

### The upgrade

TASK-663.04 builds this step and may adjust this section.

An upgrade tool, separate from legacy board migration, moves an old vault to the current format.
It writes an inventory of every relationship, dependencies included, grouped by root module, with
its old kind, its anchor and its evidence. Agents fill each one with a kind and an effect from the
code. The tool gives no default effect. A gap, an effect that the agent could not establish, is
listed, and a side effect that cannot be ruled out is a `mutation`. Installing writes the current
format only from a filled inventory that somebody reviewed, and keeps every relationship id.

### The drawing

TASK-663.02 draws this and may adjust this section.

The kind is the color of a line: every kind but `call` has an ink of its own, paired for both
themes. The effect is the line type: solid for `mutation`, dashed for `query` and dotted for
`compute`. A dependency that states no effect has a pattern of its own. Every line has one filled
arrowhead, which says the direction only. Of the kind's look, `dash` leaves the vault policy.

A colored line's label carries the kind's name, because color must not be the only carrier of
meaning (WCAG 2.2 AA, [PRODUCT.md](../../PRODUCT.md)). A label with no kind name is a `call`.

Several relationships drawn as one line wear the strongest effect, as one relationship that
stands for several operations does. A comparison keeps its standing colors over the line, and the
line type still says the effect. The legend holds the kind switches and a read-only effect key.

### The code check on dependencies

TASK-663.05 builds this and may adjust this section.

A dependency means that nothing of the target runs at run time. The code check reports, as
information, a dependency whose evidence is a call into a function or a value of the target. Of
the 157 anchored dependencies in this repository, 102 cited one. The agent then states the call
and its effect.

## Considered and rejected

- **The effect as a kind** (`mutation`, `query` and `compute` beside `http`). A relationship has
  a mechanism and an effect at once, so one field makes an HTTP mutation choose between two true
  answers.
- **Retiring `call`** (owner decision 24). Decision 25 replaced it: `call` stays as the in-process
  kind, and what retires is the relationship that states nothing about its effect.
- **`data-read` and `data-write`.** They put the read and write axis on stores only. A lens of
  changes would then miss every HTTP or RPC call that changes state.
- **A table of the effects each kind allows**, such as "an event always mutates" or "a spawn always
  mutates". The same kind spans all three effects here: one Git command reads blobs, a `dot`
  process lays a graph out, and a detached process starts a server. The store would also need to
  know whether a vault had redefined a built-in id.
- **No built-in store kind, with each vault defining its own.** Every vault with a database would
  invent a word, and the part kinds `datastore` and `cache` of a fresh vault would have no true
  kind to reach them.
- **Keeping the name `data`.** It invited "data passes", as 25 of 34 relationships here show.
- **A ban on an effect for a dependency.** Owner decision 26 says that a dependency may omit it,
  which narrows nothing else.
- **Refusing to read an old vault.** A person who updates Archboard could no longer look at the
  model, and the agents who classify it could not read it. Retained history needs the old reading
  anyway.
- **One error for each relationship without an effect.** In the current format the schema leaves
  none to report. In the old format the inventory lists them, so one diagnostic is enough.
- **A default effect in the upgrade.** It would bring back the unclassified relationship under
  another name.
- **A check on a share of plain calls, or a finding on calls that mutate** (`CALLS_MUTATING`). The
  rule tells an author to write `mutation` in doubt, and a finding would then question the author
  for following it. The upgrade's list of gaps does that job once, when somebody can act on it.
- **A dash-dot line for mixed effects.** It is a fourth pattern for a rule that "the strongest
  effect" already answers, and a picture would change when an author splits one relationship into
  two with no change in the code.
- **The kind's color kept under a comparison, with a status mark beside the label.** It redraws
  every compared line, and the line type already says the effect under a standing color.

## Consequences

- Every vault upgrades. Until it does, it reads and refuses every write.
- The examples, the site's model and this repository's vault are upgraded in TASK-663.04 and
  TASK-663.07.
- A picture of an old checkpoint looks as it did when it was retained.
