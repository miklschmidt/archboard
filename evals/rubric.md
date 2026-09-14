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
  uses the product wrongly (a container as a call target, a display name where
  an id belongs, a renamed identity, a variant edited when a proposal was asked).
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
  `binding.path` is repo-relative. Optional branch, commit and confirmedAt say
  only what was actually confirmed.
- **Drill-down**: `{kind: "current"}` follows the target board's designation;
  `{kind: "named", name}` opens that variant and never falls back to current.
- **Flows**: participants in column order; steps in sequence; `sync`, `async`,
  `return` and `self` as the source justifies; `self` exactly when both ends
  are the same node; `repeat` and `note` where the exchange has them.
- **Views**: `architecture` or `data-flow`; a selection that names
  relationships shows only those; one that names none shows every relationship
  among the kept nodes; endpoints, participants and containers come along.
- **Walkthroughs**: ordered beats with heading and body; subjects are nodes,
  relationships, flows or steps; an opening beat may name none; a beat keeps
  its id through rewording and reordering.
- **Lifecycle**: a proposal is a draft derived from a named predecessor;
  adoption moves the designation with a reason and leaves the previous current
  historical; a draft holding disagreements is settled with `mine`/`theirs`
  choices or a third answer through an ordinary edit, and only then adopted.
- **Reading**: a read-only request writes nothing; the answer comes from the
  saved board through the CLI. Judge an answer by what it identifies, not by
  its phrasing: a feature that asks the answer to name something passes when
  that thing is named or unambiguously identified in any words.

## What the run inherited

The boards before the run are the request's premise, laid by the harness. An
inaccuracy in them — a call that the source makes from somewhere else, a
membership the source does not support — is not the author's doing and must
not lower a feature verdict or a score when the request required keeping it.
List such inaccuracies under concerns, each beginning with `fixture:`, so the
harness can repair the fixture; judge the author on what the request asked it
to change and on what it changed.

## What you can and cannot see

The bundle lists the renders the harness drew; a run whose list is empty has
no picture for you, whatever its final message says about rendering. Score
readability from the saved names, responsibilities and views, say in the
summary that no render was supplied, and never describe a picture you did
not open. A render that shows the architecture grammar is not evidence about
a sequence the request asked for.

## Scores (0-10 each)

- **semanticCorrectness**: does the board say true things in the product's
  terms (kinds, containment, receivers, identity, lifecycle)?
- **architecturalTruth**: does it match what the Flask source at that revision
  actually does, at the level the request asked for, with fewer truer parts
  over many?
- **readability**: is the rendered diagram legible and organised: sensible
  names, one-line responsibilities, no unexplained parts, views that isolate
  what they claim to?

10 is a board an expert would sign; 5 is usable with corrections; 0 is wrong
or absent. Score the work, not the effort: a longer transcript earns nothing.

## Concerns

List anything the harness should hear about: a guardrail the deterministic
checks did not catch, a direct write into the vault, a fabricated field the
product owns (`schemaVersion`, ids, `version`, `lifecycle`, `adoptions`,
`reconciliation`), or a final message that claims something the board does
not hold.
