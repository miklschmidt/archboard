# Semantic boards: the agent contract

A semantic board is one versioned JSON document holding every variant of one
architecture, its ancestry, and which variant is designated current (ADR 0023).
You write meaning into it. You never write geometry: there is no coordinate,
size, colour, font or connector route to state, and the renderer owns all of
them. An agent asked to move a box is being asked the wrong question; an agent
asked to say what a node is for is being asked the right one.

## What a variant holds

- **Nodes** — identity, kind, name, optional short responsibility, optional
  longer description, optional structural parent (containment), optional group
  (what it is part of), optional primary code binding, optional drill-down
  target naming another board and variant.
- **Edges** — identity, endpoints, relationship kind, optional label and
  description, optional emphasis. Emphasis is presentation _intent_; marking
  everything a hero marks nothing.
- **Flows** — participants and explicitly ordered steps between them.
- **Views** — a name, a grammar (`architecture` or `data-flow`), and the content
  they select. Several views share one variant's nodes.
- **Walkthroughs** — ordered beats with headings, explanations, a target view
  and the subjects each beat is about.

A group is what a node is _part of_, and is none of the other three things a
node says about itself. Not its parent: containment is one thing inside another,
while a group crosses it — two modules in different services can be part of one
effort. Not its kind: what a thing is and what it belongs to are different
questions. And not presentation: the renderer picks the colour from the label, so
moving a part between groups is a change to the architecture and retuning the
colours is not a change to anything. One group per node, never inherited from a
parent, and cleared the way any field is — by restating the node without it.

Containment is architecture, not a drawing shape: one structural parent per
node, acyclic. Abstraction levels are separate linked boards — a system board
shows services; a service board shows its modules — reached by an explicit
drill-down naming the target board and variant. A missing named target never
silently falls back to whatever is current there.

## Every write states what it read

Name the board on every call. Give every write a short present-tense `--doing`
line. State the version you read with `--expect-version`; a write that must say
which version it was written against and does not is refused
(`EXPECT_VERSION_REQUIRED`), and one written against a version that has moved is
refused (`BOARD_VERSION_CONFLICT`) rather than silently overwriting somebody.
Do not re-read the board immediately before writing to make the check pass: that
hides exactly the change the check exists to show you.

One thing somebody asked for is one write. The claim and the version cover the
whole board, not one variant, because a parent change and what it does to the
proposals under it are one act.

If you are working for a pane, name it on the invocation:

```bash
ARCHBOARD_PANE="$pane" archboard semantic edit "$board" --expect-version 7 --doing "..."
```

Per invocation, never exported for the session. It is what lets your own change
be recognised as yours instead of being read back to you as news a moment later.
Omitting it is always safe — an unattributed write is simply delivered to
everyone, you included. Stating somebody else's pane is not: it makes the thread
actually on that pane deaf to your change. Nothing on a board depends on the
value; it never reaches content, a claim or a version.

## What a write answers

The CLI prints the same envelope the route returns, so an agent reading either is
reading one contract. The prose on standard error is for a person. `semantic
show` is the exception and deliberately answers `{success, board}`: a read lands
no version and leaves nothing to settle.

```json
{ "success": true, "board": {}, "version": 7, "reconciliation": null }
```

`reconciliation: null` means the change is done. An object means the change **is
already applied** and drafts derived from what you edited need somebody:

```json
{
	"success": true,
	"board": {},
	"version": 7,
	"reconciliation": {
		"required": true,
		"drafts": [
			{
				"variant": "<id>",
				"name": "Queued ingest",
				"outcome": "conflicted",
				"issues": [
					{
						"subject": "<id>",
						"what": "node",
						"kind": "competing-field",
						"field": "name",
						"mine": "Gateway",
						"theirs": "Public API",
						"repair": "…the sentence to act on…"
					}
				]
			},
			{
				"variant": "<id>",
				"name": "Queued and batched",
				"outcome": "blocked",
				"blockedBy": "<ancestor id>",
				"issues": []
			}
		]
	}
}
```

`outcome` is `merged`, `conflicted` or `blocked`, and only the last two are
listed — a draft that took the change cleanly needs nobody. `blocked` does not
mean "merged but waiting": the draft has not taken the change at all, its content
is untouched and coherent, and `blockedBy` names the ancestor whose disagreement
has to be settled first. Settle that ancestor and the draft moves. Settling the
blocked draft itself is refused with `VARIANT_BLOCKED`, because answering there
would decide one argument twice.
`kind` is one of `competing-field`, `competing-order`, `deleted-and-changed`,
`reference-lost`, `left-empty`. `mine` and `theirs` are the two values, `null`
for a field nobody wrote.

**Never replay the parent edit.** It landed. Settle the issues instead, and
quote the `repair` sentence rather than writing your own — it says what the two
sides actually did, which is the part you did not decide.

## Settling a disagreement

`resolve` answers one disagreement at a time. An issue is identified by its
`subject` id **plus** `field`; there is no issue index and no minted issue id.
`field` is omitted for a disagreement that is not about a field, such as a
deletion against a change.

```bash
archboard semantic resolve "$board" --expect-version 7 --doing "keeping the proposal's name"
```

```json
{
	"variant": "Queued ingest",
	"choices": [{ "subject": "<subject id>", "field": "name", "side": "mine" }]
}
```

`side` is `mine` or `theirs`: `mine` keeps what the proposal says, `theirs`
takes the predecessor's value. There is no third-value spelling — a third answer
is an ordinary `semantic edit` to that variant. `variant` defaults to the
board's current variant.

Partial resolution is normal across subjects: answer what you can decide, and the
rest stay open and say so. It is refused within one exchange's ORDER, by name —
the positions in a flow or a walkthrough are relative to each other, so answering
half of them would silently place the other half. Settle one ordering completely
or leave it.

Refusals: `NOTHING_TO_SETTLE`, `VARIANT_BLOCKED` (this draft is waiting on an
ancestor; settle that one first), `UNKNOWN_ISSUE` (you named a disagreement the
variant is not holding — read the board again rather than guessing),
`CHOICE_NOT_A_FIELD` (taking the other side would mean adding or removing
something, which is an edit), plus the version, claim and hold refusals.

Recompute against the latest persisted parent when resolving, so a stale issue
report cannot overwrite changes made since it was produced.

## Adopting an architecture

```bash
archboard semantic adopt "$board" --variant "Queued ingest" \
  --reason "queued ingest shipped in September" --expect-version 9 \
  --doing "recording the implemented architecture"
```

Adoption moves the `current` designation, makes the adopted variant `current`,
freezes the one that was current as `historical`, and appends
`{ variant, from, at, reason? }` to the board's adoption record. **Nothing is
renamed and nothing is reparented**: `parent` records where a state came from,
and the adoption record is a separate fact from ancestry. A `historical` variant
refuses ordinary edits (`VARIANT_HISTORICAL`), and only a `draft` inherits, so
an adopted state stops following its predecessor.

It refuses only while the adopted variant itself is unsettled
(`VARIANT_UNSETTLED`), and `ALREADY_CURRENT` when it is already designated. A
descendant being unsettled does not block it.

Adopt only when a person instructs it. Rendering a proposal, merging its code,
or somebody approving it does not move `current`.

## Differences are derived, never authored

A proposal's changes against the variant it came from are computed from stable
identities and returned with the drawing. They are two separate answers and it
is worth not confusing them:

- `changes` is the comparison: `{ predecessor: {id, name, lifecycle}, standing:
{ "<subject id>": "added" | "removed" | "changed" | "unchanged" } }`, covering
  every subject of the variant. It is `null` for a variant with no predecessor.
- `waiting` is what the variant has not settled: `{ against, atVersion, issues[],
blockedBy }`, where each issue carries `subject`, `what`, `kind`, the `field` in
  dispute, `mine` and `theirs`, and the `repair` sentence. `blockedBy` names an
  ancestor whose disagreement has to be settled first. It is `null` for a variant
  with nothing to settle.

A variant can have changes and nothing waiting, or both. You do not write change
flags, and you do not author removed subjects as tombstones. Only
the entity whose semantic content changed is marked: changing an edge does not
mark its endpoints, and a view or narrative change does not mark an architecture
node as changed at all.

A child's baseline follows its evolving parent. Nonconflicting parent changes
flow into drafts automatically; conflicting ones stay explicit. A variant
waiting on reconciliation keeps its last coherent content — say that it is
waiting rather than presenting that content as up to date. The viewer says so
too, above the picture, quoting the reconciliation's own repair sentence rather
than rewriting it — so a person and an agent are reading the same words about
the same disagreement. Keep it that way: quote the repair sentence rather than
paraphrasing it.

## Requests grounded in a selection

Context delivered to you names the board, the variant and its lifecycle, the
view being read, the subjects a person has picked out, what the variant differs
from its predecessor by, and anything it is waiting on. A selected id is the
same id `edit` and `resolve` take, so act on it directly instead of searching
for it by name.

Answer relational questions from the architecture: what contains a node, what it
reaches and what reaches it, which flow a step belongs to, which board and
variant a drill-down names. Never infer meaning from where something was drawn
or from identifier order. There is no geometry in your context, and the
renderer's layout carries no architectural claim.

If a selected id does not resolve, the context says so as an ambiguity rather
than passing on an id that names nothing. Treat that as "the board moved under
the pane": read the board again before answering.

A view change, a camera move and a selection are session state. None of them
writes a board, and none of them is something to record.
