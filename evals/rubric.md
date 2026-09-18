# Grading rubric

You grade anonymous runs of an agent that authored architecture boards about
Flask with the `archboard` CLI. A run is a request, the Flask revision it was
about, the boards before and after, rendered diagrams, the harness's
deterministic verdicts, and the commands the author ran. You are never told
which configuration produced a run, and you do not guess.

Read the source the request names in the pinned checkout before you judge a
run's truth. The same revision recurs across runs; reuse what you read.

## Per-feature verdicts

Every run declares an expected-feature checklist. Return one verdict per
declared feature:

- `pass`: the feature is present AND expresses the actual architecture in the
  source. Presence alone is not a pass.
- `missing`: the feature is absent where the scenario required it.
- `incorrect`: present, but it says something the source contradicts, or it
  uses the product wrongly (a container as a call target, a renamed identity, a
  variant edited when a proposal was asked, or a display name where only an id
  can name the subject: a group membership, or a relationship or step, which
  have no name — a node takes either).
- `not-applicable`: only when the request itself made the feature impossible.
  Every declared feature is required; a `not-applicable` is surfaced in the
  report as a waiver and needs a reason a reader can check.

Cite evidence for each verdict: a source file and symbol, a board and node or
edge id, a render file, or a command. A verdict without evidence is not a verdict.

Missing or incorrect declared features fail semantic compliance even when the
diagram looks plausible.

## What correct use means

- **Configured vocabulary**: node kinds, relationship kinds, levels and group
  ids are the vault's configured keys. Inventing one, or changing the
  configuration to make a write pass when the request did not ask for
  vocabulary, is incorrect. Extending the configuration when the request asked
  for it is the feature.
- **Containment and receivers**: `parent` says the child is part of the
  parent. A relationship lands on the part that actually receives the call;
  ending on a container that has children is incorrect unless the source
  really addresses the whole module.
- **Identity**: a restated node or relationship keeps its id. A rename that
  produced a new id, or a removal beside an addition where the source shows a
  change, is incorrect. Compare a proposal against its direct predecessor:
  added, removed, changed and unchanged subjects, with continuing edges kept
  and replaced edges new. A relationship is a continuation when at most one
  of its authored properties (`from`, `to`, `kind`, `label`, `description`,
  `emphasis`, effective `traffic`) differs from the predecessor's relationship
  with the same id, so a call that now lands on a new node under its old id
  is correct; two or more differences make it a replacement, which removes
  the old id and adds a new relationship. Emphasis is presentation intent and
  not a semantic change; effective traffic is. Board views belong to the
  board and are not variant changes.
- **Traffic**: `traffic: {}` is the defaults; stated `speed`/`volume` are
  positive finite numbers; omission is off. Traffic illustrates flow; it is
  not measurement, and a run that presents it as telemetry is incorrect. A
  static render cannot show motion; judge persisted traffic from the saved
  board and never claim you observed animation.
- **Groups**: memberships are the configured ids in `groups`, explicit on
  each member, never inherited from a container and never a singular text
  field. Inspection reports members, internal relationships, boundary
  relationships with direction, and immediate neighbours.
- **Bindings**: `binding.repo` is the registered repository identity and
  `binding.path` is the repo-relative file that implements the node's stated
  responsibility. An import, registration or invocation site is incorrect.
  A planned part or an implementation unavailable for inspection stays
  unbound; an inspected implementation in another registered repository may
  bind there. Optional branch, commit and confirmedAt say only what was
  actually confirmed.
- **Drill-down**: `{kind: "current"}` follows the target board's designation;
  `{kind: "named", name}` opens that variant and never falls back to current.
- **Flows**: participants in column order; steps in sequence; `sync`, `async`,
  `return` and `self` as the source justifies; `self` exactly when both ends
  are the same node; `repeat` exactly where the source fixes the count, and a
  `note` for a branch, a caveat, or a loop over a list of unknown length — one
  whose length data or an application's own registrations decide, such as the
  hooks an application registered.
- **Views**: `architecture` or `data-flow`; a selection that names
  relationships shows only those; one that names none shows every relationship
  among the kept nodes; endpoints, participants and containers come along.
- **Walkthroughs**: ordered beats with heading and body; subjects are nodes,
  relationships, flows or steps; an opening beat may name none; a beat keeps
  its id through rewording and reordering.
- **Lifecycle**: a proposal is a draft derived from its predecessor, which is
  the current variant unless `--from` names another;
  adoption moves the designation with a reason and leaves the previous current
  historical; a draft holding disagreements is settled with `mine`/`theirs`
  choices or a third answer through an ordinary edit, and only then adopted.
- **Reading**: a read-only request writes nothing; the answer comes from the
  saved board through the CLI. Judge an answer by what it identifies, not by
  its phrasing: a feature that asks the answer to name something passes when
  that thing is named or unambiguously identified in any words.

## What the skill adds unprompted

A request names the question, the level and a few names; knowing the product
is the author's job. Judge what the run added against the source independently
of what the request said, row by row in the vocabulary of the table below,
which the skill's own catalogue uses.

What the run added is the walk's subject, scoped as the skill scopes the
author's own walk: walk the catalogue for what you add (references/edit.md), and
a board you were asked to extend is not yours to silently repair. What the run
added is:

- on a board the run created, the whole board;
- on a board it changed, every subject it created, and every existing subject
  it gave a new value in any field — a relationship restated to carry traffic,
  a node restated with a membership or a binding, a beat restated to name a
  different part. A subject restated with every field unchanged, a removal,
  and every subject the run never wrote add nothing.

The rows that ask whether the board should hold a new exchange, subset or
explanation — `flow`, `view`, `walkthrough` — are in the walk only on a board
the run created; a flow, view or walkthrough the run did add is walked like
any other subject, its steps for `repeat` and `note`. A row the source
justifies only on inherited subjects is the fixture's omission: leave it out of
`unprompted` and list it under concerns as `fixture:`, the way an inherited
inaccuracy is listed below. A run that added nothing has no subject: a
read-only request, an adoption, a write that only removed. Its `unprompted`
list is empty and its behaviouralCompleteness is `null`; that is the rule, not
a missing result.

| Row            | The source justifies it when                                                                                                                                                                                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `external`     | a caller, library, service, shell or hypothetical part lies outside the checkout                                                                                                                                                                                                                                                                                                         |
| `binding`      | a file's body implements a part's responsibility                                                                                                                                                                                                                                                                                                                                         |
| `containment`  | a part is defined inside another                                                                                                                                                                                                                                                                                                                                                         |
| `relationship` | one body calls, renders, reads from, emits an event or message to, depends on or publishes to another; a return travelling back is a flow step, not a second relationship                                                                                                                                                                                                                |
| `traffic`      | a relationship is on the forward path one request or event takes on every pass, a call every normal pass makes included even where an error could skip it; never teardown or cleanup, an error path, an optional hook most passes skip, startup, registration or a one-shot call                                                                                                         |
| `emphasis`     | the board's question has a spine, the path its answer runs along: `hero` on that spine — about a third of the relationships, never past half — and `muted` on the lines that are only context. Emphasis is a property of a line and of nothing else; a node and a step carry none. A board with no spine (a catalogue of parts, a dependency map) marks nothing, which is correct for it |
| `repeat`       | a step loops over a list the source fixes, or up to a retry limit                                                                                                                                                                                                                                                                                                                        |
| `note`         | a step branches on a condition, loops over a list of unknown length (data, or what an application registered), reads an environment variable, or carries a caveat                                                                                                                                                                                                                        |
| `groups`       | a part's concern is a configured group id                                                                                                                                                                                                                                                                                                                                                |
| `flow`         | the question is about an ordered exchange                                                                                                                                                                                                                                                                                                                                                |
| `view`         | a reader wants one path, one container's internals or the two sides of a change alone                                                                                                                                                                                                                                                                                                    |
| `walkthrough`  | the code enforces an ordering or invariant the reader needs explained                                                                                                                                                                                                                                                                                                                    |
| `drillDown`    | a part's internals already have a board in the vault                                                                                                                                                                                                                                                                                                                                     |
| `description`  | a mechanism does not fit a one-line responsibility                                                                                                                                                                                                                                                                                                                                       |

Return `unprompted`: one entry per row the source justifies for what the run
added, at the request's level, with verdict `used` (it is there, and it says
what the source says) or `missed` (it is absent and a reader of the code would
have wanted it), evidence and a one-line reason. Leave out rows the source does
not justify, and rows the request itself named (those are expected features).
A row added without source support is not `used`; it is an incorrect feature
and lowers semanticCorrectness. The request not naming a row is no defence for
a miss; the skill is expected to teach it. The skill also tells the author to
say which rows it used and which it judged not to apply, so a run that names
the rows it left out is obeying it: judge that judgement against the source — a
row the source justifies is `missed` however well the author argued it away —
and let the saying of it cost nothing.

Score **behaviouralCompleteness** (0-10): does what the run added use every
semantic the source justifies for it, beyond what the request named? Score the
walk's subject, never the inherited rest of the board. 10: every row the source
justifies for what the run added is used, which includes the case where the
source justifies nothing beyond what the request named; 5: what it added
carries its parts and calls and little else the source justified for it; 0: it
stops at what the request spelled out when the source justified much more for
what it added. Return `null` exactly when the run added nothing.

## What the run inherited

The boards before the run are the request's premise, laid by the harness. An
inaccuracy in them — a call that the source makes from somewhere else, a
membership the source does not support — is not the author's doing and must
not lower a feature verdict or a score when the request required keeping it.
The same goes for what the inherited boards leave out: a row the source
justifies only on inherited subjects is the fixture's omission. List both
under concerns, each beginning with `fixture:`, so the harness can repair the
fixture; judge the author on what the request asked it to change and on what it
changed.

## What you can and cannot see

The bundle's `captures` list is what you can see: one PNG per diagram the
request asked for (every board, view and variant it named, both sides of a
comparison, the data-flow view of a sequence, and where the scenario asks,
every view the author made on a board), taken by the harness from the
final saved board at native scale, each with its provenance (board version,
variant, view, dimensions, the digest of the SVG it was drawn from). The
harness attaches every available capture and all required native-scale
tiles directly to each grading prompt, including resumed calls; the prompt
names them in attachment order. Visually inspect every attached image and
tile. An image viewing tool is available for further inspection if useful.
Reading the SVG text or the board
JSON, seeing that a file exists, or the author's claim to have looked is not
looking at a diagram; only a picture you visually inspected counts, and you
say which in
`visual.inspectedCaptures`.

A capture whose `ok` is false has no picture, and its `detail` says why (a
view the author never made, a variant that does not exist, a rasterizer
failure). Never describe it, and never let the architecture picture stand in
for the sequence the request asked for: a capture of the wrong view is a
missing capture. Older `renders/` SVGs are the deterministic checks' own
evidence, not yours.

Write `visual.observations` as an array of `{capture, observation}` entries,
one per capture inspected. For each, describe:
names and labels readable at native scale; nothing cut off at the page edge;
no cards, labels or lines drawn over one another; every relationship's
endpoints on the parts it names, arrowheads where the meaning says; for a
sequence, the participants in the stated order with every message readable
in order, returns and repeats distinguishable. The visual verdict is `pass`
only for a run whose every listed capture and required tile you visually
inspected and found legible;
`fail` when you saw a defect; `incomplete` when a capture was not taken or
you did not inspect one or a required tile was unavailable. The harness
records which images it supplied on a successful call, binds that
receipt to the exact image and verdict bytes, and requires an observation for
every capture. Without complete required evidence, either a claimed pass or
fail is incomplete for comparison; the raw verdict remains available. A still
capture shows
traffic marks at their first frame and proves nothing about animation.

## Scores (0-10 each)

- **semanticCorrectness**: does the board say true things in the product's
  terms (kinds, containment, receivers, identity, lifecycle)?
- **architecturalTruth**: does it match what the Flask source at that revision
  actually does, at the level the request asked for, with fewer truer parts
  over many?
- **readability**: is the captured diagram legible and organised, as you saw
  it: sensible names, clear short responsibilities whose complete text is
  legible, no unexplained parts, views that isolate what they claim to, nothing
  clipped or overlapping? Score it
  from the attached captures you visually inspected; a run with no capture you
  could inspect scores
  what the saved names and views support and no more, and its summary says
  no picture was seen.

10 is a board an expert would sign; 5 is usable with corrections; 0 is wrong
or absent. Score the work, not the effort: a longer transcript earns nothing.

## Concerns

List anything the harness should hear about: a guardrail the deterministic
checks did not catch, a direct write into the vault, a fabricated field the
product owns (`schemaVersion`, ids, `version`, `lifecycle`, `adoptions`,
`reconciliation`), or a final message that claims something the board does
not hold. A final message saying which catalogue rows the author judged not to
apply is what the skill asks for, and is no concern: where you disagree, the
row is a `missed` entry in `unprompted`.

Reading the installed skill, its references and the generated schemas is what
the skill asks for. Reading the archboard product's own source (the checkout
that provides the CLI: `src/runtime`, `src/cli`, its tests) is different: the
author went past the skill, the schemas and `--help` to how the product is
built, which means a question none of them answered. The bundle's commands
carry the class `product-source` for each such read. List every one under
concerns beginning with `tooling:`, saying what the author was looking for
(the field, the command, the refusal it was repairing) and whether the skill,
a generated schema or a CLI answer should have supplied it. Judge the board on
what it says, not on the reading.

The prefix marks that class alone. A harness failure the author did not cause —
a rasterizer that produced no picture — is a concern without it. A CLI refusal
the author read and repaired is the ordinary use the skill teaches, and is no
concern at all.
