# Variants, comparison and lifecycle

## Branching

`archboard semantic branch <board> --as "<name>" [--from <variant>]
[--summary "<one line>"] --expect-version <n> --doing "..."` derives a draft
from the current variant, or from the variant `--from` names. The draft carries
every subject with its id, designates nothing, and is changed afterwards by
ordinary `semantic edit <board> --variant "<name>"` batches. Competing proposals
are two drafts off the same predecessor; a proposal on a proposal names its
draft in `--from`.

An edit that names no variant — neither `--variant` nor a `variant` in the
batch — edits the current architecture. Where the two name different variants
the command line wins, and the write warns naming both; `semantic resolve`
settles the two the same way. A change meant as a proposal that landed on the
current architecture is not repaired by editing the file, but by reading the
family again and moving the meaning with ordinary writes.

## What a comparison counts

A proposal is read against its direct predecessor, subject by subject, by id:

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

Kept ids read as continuing (unchanged or changed); ids only on the predecessor
as removed; ids only on the proposal as added.

### Edge identity

Count the authored properties that differ from the predecessor's relationship
with the same id: `from`, `to`, `kind`, `label`, `description`, `emphasis`,
`traffic` (once, as a whole). One difference keeps the id: a clarified label,
or the same labelled call now landing on a new node. Two or more make it a
replacement: put the old id in `removeEdges` and add the new relationship
without an id, in the same batch. The CLI counts after resolving names and
defaults, across separate edits too. Compare endpoint ids, not names; renaming
a node changes no relationship.

### Sequence identity

Keep the flow's id for the same exchange and each step's id for the same action,
even when its order or payload moves; add new actions and remove obsolete ones.
A flow rewritten without ids compares as a deletion beside an addition.

## Comparing before you report

**A variant with a predecessor is drawn as the comparison with it**, whatever
you asked for: added, removed and changed subjects are marked, removed ones
are still on the page, and the receipt names the other side under
`comparedWith`. Only a variant that came from nothing draws plain. So parts
added to a derived variant — a proposal, or a current variant that was adopted
from something — arrive in the picture already marked as added, and a picture
of one is read against its predecessor rather than as a board on its own.

Read the saved family and draw predecessor and proposal through the same
board view (`semantic rasterize <board> --view <view> --out current.png`,
then the same with `--variant <draft>` to `proposal.png`), and open both.
Check both the ids and the pictures: the added, removed, changed and
untouched subjects match the change you meant; a removed flow, call or
participant is drawn as removed in the proposal's picture (absence from the
picture is not evidence of a shown deletion); a continuing exchange compares
step by step, so an entirely new sequence needs an explanation grounded in the
change. When the saved comparison is right and the picture omits a change,
report the renderer defect and leave the meaning as it is.

## Disagreements

When the predecessor moves after a draft was branched, the write reaches the
draft too. Where both changed the same thing, the draft holds a disagreement in
its `reconciliation` (`issues`, each with a `subject`, a `kind`, an optional
`field`, `mine`, `theirs`, a `repair` line, and — where one side removed a
subject the other changed — a `changed` list of `{ field, before, after }`);
a draft under an unsettled draft waits, and the family lands whole or not at
all.

| Kind                  | Meaning                                                                                 | Answered by                                         |
| --------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `competing-field`     | Both changed one field of one subject.                                                  | `mine` or `theirs`                                  |
| `competing-order`     | Both moved the same step or beat, to different positions.                               | `mine`, or an edit telling the order you mean       |
| `deleted-and-changed` | One removed a subject the other changed.                                                | `mine`, or stating the subject again under its id   |
| `reference-lost`      | Merging the predecessor would leave this draft referring to something no longer there.  | `mine`, or an edit saying what it should say        |
| `left-empty`          | Both removed different parts of one flow or walkthrough; merged, it would hold nothing. | `mine`, or an edit putting back what it should hold |

`theirs` is a choice between two values, and only `competing-field` has two:
asking for it on any other kind is refused, the whole call lands nothing, and
the refusal names every choice in the batch rather than only the one it could
not take — so read it as naming the payload, not the disagreements. Answer the
competing fields as sides in one `resolve`, and settle the rest as ordinary
edits. `mine` is always available, on every kind.

Settle with `archboard semantic resolve <board> --variant <draft>
--expect-version <n> --doing "..."` and a JSON of `choices`, each naming the
`subject` (and `field` where the issue has one) and a `side`: `mine` keeps the
draft's answer, `theirs` takes the predecessor's. Answer part of it and the
rest stays open, reported in the answer. A third answer is not a side: write it
as an ordinary edit. For a `deleted-and-changed` node the draft removed, state
the node again with its original `id` (the `subject` of the issue) and the
fields you want; that one write restores the identity and settles that issue.
Only an id an open disagreement names may come back this way; any other absent
id is refused. Settling also catches the draft up with everything else the
predecessor decided.

Every value in that third answer is read, never retyped: the issue's `changed`
carries each field the other side moved with the value it moved to, and
`archboard semantic show <board>` carries the rest of the node as the
predecessor has it. Carry each one across character for character. A field
composed from memory, or blended with the neighbouring `responsibility`, is a
sentence nobody wrote, and reporting it as the current description is a false
report. The disagreement lines printed under a write are an index into those
values and not the values themselves: a long one is cut to fit the line.

## Adoption

`archboard semantic adopt <board> --variant <name> --reason "<why>"
--expect-version <n> --doing "..."` moves the current designation: the adopted
variant becomes current and stays editable, the previous current becomes
historical and stops being editable, every proposal still says what it was
derived from, and nothing is renamed. The move is recorded with its reason. A
draft holding a disagreement, or derived from one that is, is refused until it
is settled. Adopt when asked, and report which variant is current and which
became historical.

A proposal nobody will carry out is shelved rather than left standing:
`archboard semantic shelve <board> --variant <name> --reason "<why>"
--expect-version <n> --doing "..."`. It keeps its name and everything it says,
and a link naming it still opens it, but it stops following its predecessor —
so it no longer collects disagreements somebody has to settle for a change
nobody will make. Like history it takes no content edits and cannot be adopted;
branch from it to propose it again. Shelve only when asked, or when a draft you
were told to reconcile turns out to propose nothing.

## Claims

A claim keeps the board between your writes, and each write is still one
`--doing` step. `--for 1h` says how long; claim again to extend. Every pane
showing the board says who holds it and why, and offers the control that ends
it.
