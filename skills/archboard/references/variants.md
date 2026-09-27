# Variants, comparison and lifecycle

## Branching

`archboard semantic branch <board> --as "<name>" [--from <variant>] [--summary "<one line>"] --expect-version <n> --doing "..."`
derives a draft from the variant `--from` names, or without it from the one the
board's name opens: the current variant, or on a board nobody has built the
draft no other draft came before.
The draft carries every subject with its id, designates nothing, and is changed
afterwards by ordinary `semantic edit <board> --variant "<name>"` batches.
Competing proposals are two drafts off the same predecessor; a proposal on a
proposal names its draft in `--from`.

An edit that names no variant — neither `--variant` nor a `variant` in the batch
— edits the variant the board's name opens: the current architecture, or on a
board with no current variant its draft; where the two differ, the command line wins
([edit](edit.md) step 3), on `semantic resolve` too. A change meant as a
proposal that landed on the current architecture is not repaired by editing the
file, but by reading the family again and moving the meaning with ordinary
writes.

## What a comparison counts

The current variant is now, and every other variant — a proposal, history, a
shelved one — is read against it, subject by subject, by id, so it says how that
variant differs from what exists. The current variant is read against nothing. A
board nobody has built has no now: there a draft is read against the one it came
from, and its first draft against nothing. `semantic compare --against <variant>`
reads it against any other variant you name. What is compared:

- **Nodes**: name, kind, responsibility, description, parent, groups, binding,
  drill-down. A renamed group changes nothing (the name is in `config.yaml`).
- **Relationships**: from, to, kind, label, description and effective traffic
  (`{}` and the explicit defaults are equal). `emphasis` is presentation intent
  and never a change.
- **Flows and steps**: a flow's name, summary and participants (as a set); a
  step's ends, label, kind, note, repeat and its position in the sequence.
- **Walkthroughs and beats**: a beat's heading, body, subjects (as a set), view
  and position.
- **Views** belong to the board and are never a variant change.

Kept ids read as continuing (unchanged or changed); ids only on the variant read
against as removed; ids only on the variant being read as added. On history
read against now, a part the current variant added is therefore `removed`.

### Edge identity

Keep the id when a relationship continues, including when its endpoint, kind,
or several other properties change. To state a replacement, put the old id in
`removeEdges` and add the new relationship without an id in the same batch.
The comparison follows ids: the continuing relationship is changed, while the
replacement is removed plus added. Renaming a node changes no relationship;
its endpoint id still names the same node.

### Sequence identity

Keep the flow's id for the same exchange and each step's id for the same action,
even when its order or payload moves; add new actions and remove obsolete ones.
A flow rewritten without ids compares as a deletion beside an addition.

## Comparing before you report

**Every variant but the current one is drawn as the comparison with the current
one** (on a board nobody has built, with the draft it came from), whatever you
asked for: added, removed and changed subjects are marked, removed ones stay on
the page, and the receipt names the other side under `comparedWith`. The current
variant draws plain, and so does the first draft of a board nobody has built, so
parts added to a proposal arrive already marked as added, and its picture is
read against the current variant, not on its own.

Each variant is laid out fresh. Compare subjects by identity and Standing;
a card moving or a container shrinking does not itself mean the architecture
changed. The viewer animates continuing identities between their new positions.

Read the saved family, draw the current variant and the proposal through the
same board view (`semantic rasterize <board> --view <view> --out /tmp/current.png`, then again
with `--variant <draft>` to `/tmp/proposal.png`), and open both. Check the ids
and the pictures: the added, removed, changed and untouched subjects match the
change you meant; a removed flow, call or participant is drawn as removed in the
proposal's picture (absence from a picture is not evidence of a shown deletion);
a continuing exchange compares step by step, so an entirely new sequence needs
an explanation grounded in the change. When the saved comparison is right and
the picture omits a change, report the renderer defect and leave the meaning as
it is.

## Disagreements

When the predecessor moves after a draft was branched, the write reaches the
draft too, and where both changed the same thing the draft holds a disagreement
in its `reconciliation`: `issues`, each with a `subject`, a `kind`, an optional
`field`, `mine`, `theirs`, a `repair` line and, where one side removed a subject
the other changed, a `changed` list of `{ field, before, after }`. A draft under
an unsettled draft waits, and the family lands whole or not at all.

- `competing-field`: Both changed one field of one subject. Answered by `mine`
  or `theirs`.
- `competing-order`: Both moved the same step or beat, to different positions.
  Answered by `mine`, or an edit telling the order you mean.
- `deleted-and-changed`: One removed a subject the other changed. Answered by
  `mine`, or stating the subject again under its id.
- `reference-lost`: Merging the predecessor would leave this draft referring to
  something no longer there. Answered by `mine`, or an edit saying what it
  should say.
- `left-empty`: Both removed different parts of one flow or walkthrough; merged,
  it would hold nothing. Answered by `mine`, or an edit putting back what it
  should hold.

`theirs` is a choice between two values, and only `competing-field` has two:
asking for it on any other kind is refused, the whole call lands nothing, and
the refusal names every choice in the batch, not only the one it could not take,
so read it as naming the payload, not the disagreements. Answer the competing
fields as sides in one `resolve` and settle the rest as ordinary edits; `mine`
is available on every kind.

Settle with
`archboard semantic resolve <board> --variant <draft> --expect-version <n> --doing "..."`
and a JSON of `choices`, each naming the `subject` (and `field` where the issue
has one) and a `side`: `mine` keeps the draft's answer, `theirs` takes the
predecessor's. Answer part of it and the rest stays open, reported in the
answer. A third answer is not a side: write it as an ordinary edit. For a
`deleted-and-changed` node or relationship the draft removed, state it again with its
original `id` (the `subject` of the issue) and the fields you want; that one
write restores the identity and settles that issue. An ordinary edit can also
restore a removed node or relationship without an open disagreement when its
id remains in the direct predecessor or recorded reconciliation base. State
the original id and full properties, reconnect references, and remove any
copy in the same batch. Unknown ids, sibling-only ids, and ids of another
subject kind are refused; a removal and restatement of the same id in one
batch is contradictory.
Settling also catches the draft up with everything else the predecessor decided.

Every value in that third answer is read, never retyped: the issue's `changed`
carries each field the other side moved with its new value, and
`archboard semantic show <board>` carries the rest of the node as the
predecessor has it. Carry each across character for character: a field composed
from memory, or blended with the neighbouring `responsibility`, is a sentence
nobody wrote, and reporting it as the current description is a false report.
The disagreement lines printed under a write are an index into those values, not
the values: a long one is cut to fit the line.

## Adoption

`archboard semantic adopt <board> --variant <name> --reason "<why>" --expect-version <n> --doing "..."`
moves the current designation: the adopted variant becomes current and stays
editable, the previous current becomes historical and stops being editable,
every proposal still says what it was derived from, and nothing is renamed. The
move is recorded with its reason. On a board that had no current variant there
is no previous current: adoption is the moment its architecture starts existing,
and nothing becomes historical. A draft holding a disagreement, or derived
from one that is, is refused until it is settled. Adopt when asked, and report
which variant is current and which, if any, became historical.

A draft built on a variant that a later adoption made historical is refused as
`PARENT_SUPERSEDED`: two proposals off one current variant, one adopted, then
the other. Adopting it would drop what the first adoption brought, because a
historical variant passes nothing on. The refusal names the superseded variant
and the variant adopted over it. Branch a new proposal from the current variant,
state the change on it again from what the old one itself changed —
`semantic compare <board> --variant <old> --against <its parent>`, since read
against the current variant it would also undo the other adoption — and shelve
the old one with that reason. Add `--force` only when dropping the other change
is intended; the adoption record then says `forced: true`.

A proposal nobody will carry out is shelved rather than left standing:
`archboard semantic shelve <board> --variant <name> --reason "<why>" --expect-version <n> --doing "..."`.
It keeps its name and everything it says, and a link naming it still opens it,
but it stops following its predecessor — so it no longer collects disagreements
somebody has to settle for a change nobody will make. Like history it takes no
content edits and cannot be adopted; branch from it to propose it again. Shelve
only when asked, or when a draft you were told to reconcile turns out to propose
nothing.

## Claims

A claim keeps the board between your writes, and each write is still one
`--doing` step. `--for 1h` says how long; claim again to extend. Every pane
showing the board says who holds it and why, and offers the control that ends
it.
