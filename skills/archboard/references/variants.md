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

A draft holds the whole architecture at its point, not only its own change.
Archboard refuses two edits that break this. To make such an edit on purpose,
confirm its code with `--confirm <code>` (or `"confirm": ["<code>"]` in the
batch). The write then lands and warns with the same code:

- `PART_RECREATED`: the edit adds a node without an `id` while an ancestor
  variant holds one with the same name, or exactly the same binding, under an
  id this variant lacks. The refusal names that id and variant. To bring the
  part back, state that `id` instead ([restore](#disagreements)). Confirm only
  when the new node is a different part.
- `INHERITANCE_DROPPED`: the edit removes more than half of the nodes the
  variant holds from its predecessor. The refusal names how many. Confirm only
  a deliberate redesign.

### Documents a variant draws

A variant names the repository documents it draws in `documents`: a design
document, an ADR, a task, a plan. Each entry is `{ repo, path }`, spelled as a
binding spells them, with `commit` when the variant draws one exact version of
the document and `branch` when the document lives only on a branch, such as a
pull request's. A design document changes while it is reviewed, so a draft
that draws a design pins the commit it was drawn from.

- `semantic edit` and `semantic new` take `documents` in the batch. An edit
  that states it replaces the whole list of the variant it lands on, and only
  that variant's. `[]` removes the list, and a batch without `documents` keeps
  it.
- `semantic branch` copies the list of the variant it branches from. Add the
  proposal's own documents with an edit, and leave out one that the proposal no
  longer stands on.
- `semantic show` returns each variant with its `documents`. To find the draft
  that draws a design, read the drafts' lists for the design document's path.
- `archboard check code` reads the references of every variant it reads, as
  it reads a binding of the same repository and ref. A file that is not at
  that version is `DOCUMENT_PATH_MISSING`, at `variants.<id>.documents.<n>`:
  name the file where it is now, pin a commit that holds it, or remove it.

Archboard's own `Board persistence` board shows it. The proposal of the task
that added `documents` names the decision it builds. The ADR is on the
default branch and stays at its path, so the reference pins no version:

```bash
archboard semantic edit "Board persistence" --variant TASK-498 --expect-version 73 --doing "naming the decision the proposal builds" <<'JSON'
{
  "documents": [
    { "repo": "github.com/miklschmidt/archboard", "path": "docs/adr/0054-a-variant-names-the-repository-documents-it-draws.md" }
  ]
}
JSON
```

A file that moves, such as a task that is archived, reads
`DOCUMENT_PATH_MISSING` after the move. Pin a reference to such a file to a
commit that holds it.

### A stack of pull requests

Each pull request of a stack on a vault board is one proposal. Each proposal
holds the whole architecture with the changes of every pull request below it.

1. Branch the first pull request's proposal from the variant that reads as the
   code before the stack, usually the current variant.
2. Branch each later one from the proposal below it: `--from "<proposal below>"`.
3. State only that pull request's change, as edits to its proposal. Never
   remove a part because the pull request does not touch it. That includes a
   part that the design plans for a later pull request. Never add a part again
   that a proposal below removed: state its original `id`.
4. To show one pull request on its own, use a view that selects the parts it
   changes, or `semantic compare --against "<proposal below>"`, which marks
   what that proposal changed.
5. To hold the whole stack to its code, run `archboard check code --every-draft`.
   It reads every draft of every board. It reads each draft against the branch
   (or commit) that its bindings name and no proposal below names: the pull
   request's own branch. A binding that names a branch or commit that the
   checkout does not have out is read at that ref from Git, without a checkout
   and without touching the working tree, in every check: its bound path and
   symbol, the anchors, the evidence between parts and the interface of a
   module. A language server reads files on disk, so a use that no import
   resolves stays as code facts read it (`ref-without-language-server`, once
   for the repository and ref). In a draft, every part in a repository is read
   at the draft's own branch, whatever older branch its binding pins, because
   in a stack that branch holds the layers below it. A part that pins a branch
   the draft's branch does not hold, such as a later pull request's, keeps its
   own. A relationship whose two ends are then read at different code is
   skipped (`refs-differ`): no one code holds both. A ref the checkout cannot resolve
   is skipped with the ref named (`ref-not-checked-out`). A binding that names
   no branch is read against the checkout's files, and so is a draft that
   names none.
   `archboard semantic footprint --head <ref>` also reads a ref that is not
   checked out, and a part pinned to such a ref without `--head`, up to that
   ref.

The code check warns with `INHERITED_PART_DROPPED` when a draft lacks a bound
node that the variant it was branched from holds, and the code of the draft's
branch still holds that node's path, and its symbol when the binding names
one. The code says that the part still exists, so the draft most likely
dropped it by mistake. State the node's original `id` in that draft to bring
it back. The warning's `dropped` field names the earlier variant, the branch,
the commit, and the file and line that hold the symbol. A node whose bound
code is not on that branch gets no warning. This includes a part that a later
pull request builds, so the check cannot find every dropped part: the
write-time refusals above stay the guard. The check skips a draft, and says
why, when the checkout has no such branch (`draft-ref-missing`) or when the
draft names several branches and none of them is its own
(`draft-refs-ambiguous`).

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
  and never a change, and an `anchor`, on a relationship or a step, is
  bookkeeping and never a change. A binding is compared whole, so a new
  `symbol` changes its node.
- **Flows and steps**: a flow's name, summary and participants (as a set); a
  step's ends, label, kind, note, repeat and its position in the sequence.
- **Walkthroughs and beats**: a beat's heading, body, subjects (as a set), view
  and position.
- **Views** belong to the board and are never a variant change.
- **Interfaces** come first, in `interfaceChanges`: each container whose
  interface moved. They set no standing ([propose and compare](propose-compare.md),
  step 3). `interfaceMeasures` puts the five counts of each container on each
  variant read side by side, and `--beside` adds a competing proposal
  ([design it twice](propose-compare.md#design-it-twice)). They mark no change.

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
read against the current variant, not on its own. To draw a variant against
another one, such as a proposal that stacks on the proposal below it, add
`--against <variant>` to `semantic render`, `semantic rasterize` or
`semantic record`: it marks only what the variant changes over the one named, and
the picture carries no "Planned" frame.

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
  When the `subject` is a flow (`field` `steps`), together they left a step in
  a place neither side chose, such as between two steps the other side moved
  into a decision or loop. Answered by `mine`, or an edit telling the order you
  mean.
- `deleted-and-changed`: One removed a subject the other changed. Answered by
  `mine`, or stating the subject again under its id.
- `reference-lost`: Merging the predecessor would leave this draft referring to
  something no longer there. The draft keeps its own version of only that part,
  such as the node its relationship points to, and still takes the rest of the
  change, such as a rename in the same edit. Answered by `mine`, which keeps
  that part, or an edit saying what it should say.
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
`deleted-and-changed` node, relationship or flow the draft removed, state it
again with its original `id` (the `subject` of the issue) and the fields you
want; that one write restores the identity and settles that issue. An ordinary
edit can also restore a removed node, relationship or flow without an open
disagreement when its id remains in the direct predecessor or recorded
reconciliation base. A restored flow's steps may keep the step ids that flow
holds there. State the original id and full properties, reconnect references,
and remove any copy in the same batch. An id that only another variant holds,
such as a sibling's or an older ancestor's, is refused with
`RESTORE_UNCONFIRMED`, which names each id and the variants that hold it. Add
`--confirm RESTORE_UNCONFIRMED` to restore it anyway; the answer warns
`RESTORED_FROM_OTHER_VARIANT` for each one. Ids no variant holds and ids of
another subject kind are refused; a removal and restatement of the same id in
one batch is contradictory.
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
editable, the previous current becomes historical and refuses ordinary edits,
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

## Correct a historical description

Use `semantic correct` to repair a historical diagram against its code at that
point in history. Use ordinary edits for current variants and drafts.

First, inspect suggested commits:

```bash
archboard semantic correct Payments --variant Initial --suggest
```

The answer uses the recorded supersession time and each repository's HEAD
ancestry. These commits are guesses. Inspect the Git history and replace a
guess if the variant describes another commit or branch. If the time is
unknown, supply commits explicitly.

Read the board and put the correction in a JSON file. The
[payload schema](generated/semantic-correct-input.schema.json) names its fields. `reason` explains the
mistake. `revisions` names a full commit hash for every repository that the
corrected variant references. `edit` accepts the ordinary content batch,
summary and documents. It cannot change shared views or board level.

```json
{
	"reason": "The initial implementation called storage directly",
	"revisions": [
		{ "repo": "github.com/acme/payments", "commit": "0123456789abcdef0123456789abcdef01234567" }
	],
	"edit": { "removeEdges": ["edge-id"] }
}
```

Preview the candidate at the version that the board reported:

```bash
archboard semantic correct Payments --variant Initial --expect-version 8 --input correction.json
```

Read the candidate, including each inheriting draft, the code findings and the
skipped evidence. The code check reads
Git trees, never local edits. It cannot prove every responsibility or label.
Inspect the historical source for those claims. Preview writes nothing.

Apply the inspected correction with the same payload and expected version:

```bash
archboard semantic correct Payments --variant Initial --expect-version 8 --input correction.json --apply --doing "correcting the historical storage call"
```

The write repeats the code check and refuses warnings. It records the reason,
commits and correction time on the historical variant. Its identity, ancestry,
lifecycle and adoption records stay unchanged. Inheriting drafts receive
nonconflicting content corrections and keep their own changes. Conflicts remain
visible and block dependent drafts. The answer's `reconciliation` names each
draft and what it did. Current, historical and shelved successors stay
unchanged. A summary or document correction reaches no draft. A stale board
version refuses the correction. Read the board again and inspect a new preview.
