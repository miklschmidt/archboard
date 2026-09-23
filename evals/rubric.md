# Grading rubric

You grade anonymous runs of an agent that authored architecture boards about
Flask with the `archboard` CLI. A run is a request, the Flask revision it was
about, the boards before and after, rendered diagrams, the harness's
deterministic verdicts, and the commands the author ran. You are never told
which configuration produced a run, and you do not guess.

Read the source the request names in the pinned checkout before you judge a
run's truth. The same revision recurs across runs; reuse what you read. A run
whose bundle has `revision: null` and no `sources` plans an architecture nobody
has built, and has no source to read: judge it as [Planning runs](#planning-runs)
says.

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
diagram looks plausible, except a feature whose finding is on the `skill` axis
(below) and names a passage the feature does not cite, which is a finding about
the skill and fails no run.

## Findings

Every verdict short of a `pass` carries a `finding`; a `pass` carries none
(`null`). A finding states what the run did (`did`), what the skill told it to
do, quoted (`taught`), where the skill says it (`passage`: a citation such as
`SKILL.md#essentials`, a file of the skill staged beside the runs and one of its
headings), and the difference between the two (`gap`). Its `axis` says which
authority the verdict answers to, and the three are never the same kind of
failure:

- `conformance`: the run departed from what the skill teaches. Judge it against
  the passage the feature cites, and quote it. Where that passage and this
  rubric's summary of the same rule disagree, the passage governs: the rubric
  restates the skill and is not a second source of it. What the request itself
  states — a board's exact name and level, a file to write, a count or a band
  the request sets — the skill has the author meet by turning the request into
  checks (`SKILL.md#evidence-before-a-write`), so falling short of it is a
  conformance finding citing that passage.
- `truth`: the run did what the skill teaches and the board still says
  something the source contradicts. Judge it against the source, not the
  skill, and let `gap` say what the source does instead. A board that followed
  the skill and is still wrong is a truth finding, never a departure from the
  skill.
- `skill`: the feature expects something that neither the passages it cites
  nor anything else in the skill teaches. That is a finding about the skill or
  the scenario, not a failure of the run, and it does not count against
  semantic compliance; `taught` says what the skill says instead, or that it
  says nothing. It is never for what the request states (that is conformance,
  above), and never for a rule the skill states in a passage the feature did not
  cite: cite that passage and judge conformance.
  A finding naming a passage the feature cites is counted as conformance
  whatever axis it carries, since the scenario declares that passage teaches
  the feature. If that passage does not in fact teach it, file the finding all
  the same and name the feature and the passage in a concern beginning
  `fixture:` (the scenario's citation).

A `not-applicable` verdict carries the axis the feature would have been judged
on, cites its passage, and says in `gap` how the request made the feature
impossible; it is reported as a waiver whatever its axis.

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
  continuing relationship, is incorrect. Compare a proposal against its direct predecessor:
  added, removed, changed and unchanged subjects, with continuing edges kept
  and replaced edges new. A continuing relationship keeps its id even when
  its endpoint, kind or several authored properties change. Explicit removal
  of the old id plus addition without an id declares a replacement and compares
  as removed plus added. Emphasis is presentation intent and
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
  An implementation unavailable for inspection stays unbound; a planned part,
  which belongs on a draft, binds only to a path the request states for it; an
  inspected implementation in another registered repository may bind there.
  Optional branch, commit and confirmedAt say only what was actually confirmed.
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
  the variant the board's name opens (its current variant, or on a board with
  none its draft) unless `--from` names another; a part nobody has built is on a
  draft, never on the current variant; adoption moves the designation with a
  reason and leaves the previous current historical, and on a board that had no
  current variant leaves nothing historical; a draft holding disagreements is settled with `mine`/`theirs`
  choices or a third answer through an ordinary edit, and only then adopted.
- **Reading**: a read-only request writes nothing; the answer comes from the
  saved board through the CLI. Judge an answer by what it identifies, not by
  its phrasing: a feature that asks the answer to name something passes when
  that thing is named or unambiguously identified in any words.

## What the skill adds unprompted

A request names the question, the level and a few names; knowing the product
is the author's job. Judge what the run added against the source independently
of what the request said, row by row in the vocabulary of the table below.
The rows and their conditions are the skill's own catalogue
(`SKILL.md#everything-the-code-shows`); the table restates them, and wherever
the two differ the skill's row governs.

What the run added is the walk's subject, scoped as the skill scopes the
author's own walk: walk the catalogue for what you add (references/edit.md),
and a board you were asked to extend is not yours to silently repair or
silently repeat. What the run added is:

- on a board the run created, the whole board;
- on a board it changed, every subject it created, and every existing subject
  it gave a new value in a field the run authored — a relationship restated to
  carry traffic, a node restated with a membership or a binding, a beat
  restated to name a different part. A subject restated with every field
  unchanged adds nothing, and neither does anything the product writes as the
  consequence of a command: the fields it owns (listed under Concerns),
  timestamps, the relationships and walkthrough references a removed part
  takes with it, and the subjects a branch carries into a new draft, which keep
  their ids. None of that is authored by the run. A subject the run never wrote
  adds nothing.

Every row is in the walk, each asked of what the run added and decided by its
own condition. On a board the run changed, `view` and `walkthrough` ask whether
what the run added is a subset or a why the request's question is about; `flow`
is decided by its row alone, on a board the run created or changed alike. A
flow, view or walkthrough the run added is walked like any other subject, its
steps for `repeat` and `note`.

A row the request's own words rule out is not a miss: a request that says
nothing else changes fences every row it did not name off the subjects it did,
and the skill's nearest rule agrees, changing an existing board only where the
request covers it. A fenced row, like a row the source justifies only on
inherited subjects, is the fixture's omission: leave it out of `unprompted` and
list it under concerns as `fixture:`, the way an inherited inaccuracy is listed
below. A run that added nothing has no subject: a read-only request, an
adoption, a write that only removed. Its `unprompted` list is empty and its
behaviouralCompleteness is `null`; that is the rule, not a missing result.

| Row            | The source justifies it when                                                                                                                                                                                                                                                                                                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `external`     | a caller, library, framework, runtime, shell or hosted service lies outside what this codebase owns (drawn `external`, unbound); never a part of this codebase a reader reaches through another board, and never a part nobody has built yet, which is a proposal on a draft                                                                                                             |
| `binding`      | a file's body implements a part's responsibility                                                                                                                                                                                                                                                                                                                                         |
| `containment`  | a part is defined inside another                                                                                                                                                                                                                                                                                                                                                         |
| `relationship` | one body calls, renders, reads from, emits an event or message to, depends on or publishes to another; a return travelling back is a flow step, not a second relationship                                                                                                                                                                                                                |
| `traffic`      | a relationship is on the forward path one request or event takes on every pass, a call every normal pass makes included even where an error could skip it; never teardown or cleanup, an error path, an optional hook most passes skip, startup, registration or a one-shot call                                                                                                         |
| `emphasis`     | the board's question has a spine, the path its answer runs along: `hero` on that spine — about a third of the relationships, never past half — and `muted` on the lines that are only context. Emphasis is a property of a line and of nothing else; a node and a step carry none. A board with no spine (a catalogue of parts, a dependency map) marks nothing, which is correct for it |
| `repeat`       | a step loops over a list the source fixes, or up to a retry limit                                                                                                                                                                                                                                                                                                                        |
| `note`         | a step branches on a condition, loops over a list of unknown length (data, or what an application registered), reads an environment variable, or carries a caveat                                                                                                                                                                                                                        |
| `groups`       | a part's concern is a configured group id                                                                                                                                                                                                                                                                                                                                                |
| `flow`         | the request asks for the exchange itself (what happens, in what order, for one request, job, interaction or startup), on a new board or an existing one; a board asked to describe how something travels through the parts is parts, containment and calls (SKILL.md's Which recipe) and is not owed a flow because what it draws runs in order                                          |
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
variant, view, dimensions, the digest of the SVG it was drawn from). Every
grading prompt, a resumed call's included, lists every available capture and
every required native-scale tile in order, and says how they reach you: either
attached to the prompt itself, or in the workspace at the listed paths for you
to open with your file-reading tool. Either way, visually inspect every listed
image and tile. Reading the SVG text or the board
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
records which images reached you on a successful call (the ones it attached,
or the ones it saw you open), binds that
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
  over many? A planning run is scored as [Planning runs](#planning-runs) says.
- **readability**: is the captured diagram legible and organised, as you saw
  it: sensible names, clear short responsibilities whose complete text is
  legible, no unexplained parts, views that isolate what they claim to, nothing
  clipped or overlapping? Score it
  from the listed captures you visually inspected; a run with no capture you
  could inspect scores
  what the saved names and views support and no more, and its summary says
  no picture was seen.

10 is a board an expert would sign; 5 is usable with corrections; 0 is wrong
or absent. Score the work, not the effort: a longer transcript earns nothing.

## Planning runs

A planning run's request states an architecture nobody has built; its bundle
has `revision: null` and no `sources`, and the author worked in an empty
repository. There is no source, so the request, and any document it names, is
the whole of the evidence, and wherever the sections above judge against the
source, judge against what the request states and what it necessarily implies.

- **Lifecycle**: a board for something nobody has built has no current
  variant: it was created with `"lifecycle": "draft"`, and every variant on it
  is a draft or shelved. A planning board that designates a current variant
  says the plan is built, and is incorrect in semanticCorrectness.
- **Bindings**: a binding on a draft may name a path that does not exist yet,
  and `archboard check` does not report it, so `check-clean` holds for correct
  planning work. A binding the request gives no path for is invented.
- **architecturalTruth**, substituted: does every part, containment and
  relationship trace to something the request states or necessarily implies,
  at the level it asked for, with fewer truer parts over many, and with no
  mechanism presented as decided that the request leaves open? A plausible
  mechanism nobody stated is a guess, and scores as a claim the source
  contradicts would.
- **behaviouralCompleteness**, substituted: a catalogue row is justified when
  the request states what that row describes: a count it fixes is a `repeat`,
  a condition it names a `note`, a path it calls the spine `emphasis`. A row
  the request says nothing about is not `missed`, and one the run added
  without a sentence behind it is not `used`.

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
