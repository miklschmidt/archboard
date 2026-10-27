---
status: accepted
---

# A proposal nobody will carry out is shelved, not deleted

Compact proposal lifecycle operations supersede live variant shelving below. The independent archive preserves the final proposal, baseline, and shelving reason.
[ADR 0062](0062-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.

Extends
[ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md),
which gave a variant three lifecycles: current, draft and historical. TASK-261
tracks this decision.

A draft can outlive its proposal. Two drafts in this repository's own vault got
there. `Archboard server` / `Readable layout` proposes nothing architectural:
every node is shared, every relationship is byte-identical, and the draft
retargets one drill-down and adds one walkthrough step. `Semantic renderer` /
`Readable layout` converged on its parent outright.

Neither draft can be adopted. Adoption freezes the accurate current variant into
history and promotes a variant that says the same thing. So under ADR 0023 they
stay drafts forever. Only a draft inherits, so every edit to either parent
merges into them. Each such edit can raise a disagreement that somebody must
settle before anything on that line can be adopted. A spent proposal is a
standing tax on the board it hangs off.

## Decision

A variant has a fourth lifecycle, `shelved`. A shelved variant is a proposal
nobody intends to carry out. The board keeps it under its name so the thinking
is not lost.

The word is chosen against words that already have another meaning here:

- CONTEXT.md's historical entry forbids `abandoned`.
- A historical variant is `superseded`.
- The word `spent` belongs to same-write handles.
- The word `dropped` names what a merge does to a subject.
- The word `withdrawn` names a person's optimistic edit that was rolled back
  (ADR 0022).

Shelving is not deletion, and the decision rejects deletion. Other boards
address a variant by name. A drill-down names a target board and a variant. A
named target never falls back to whichever variant is current (ADR 0023). It
reports that there is nothing there.

The two spent drafts above name each other, so deleting either leaves the
other's link opening nothing. The vault checker cannot see this, because it
checks the board name and level. Keeping the variant under its name leaves every
link resolving. The viewer discloses what each link opens.

Shelving is a fifth transition, beside create, branch, edit, settle and adopt.
It goes through the one write boundary that the other four use. That means the
same lease, the same expected-version check, one version advance and one atomic
write (ADR 0016). It takes the reason the proposal was let go. The board records
what was shelved, at what time and for what reason, the way it already records
each time the designation moved.

The reason is required where an adoption's reason is optional. The board
afterwards says which architecture is implemented. Nothing says whether a
proposal was tried, refused, overtaken or forgotten.

A shelved variant stops following its predecessor, and lets go of anything it
was holding. Following was never a property of ancestry. Only a draft follows
what it came from, so this follows from the word, not from an arrangement.
Clearing the standing is a decision. A proposal nobody carries out has nothing
to settle. Requiring settlement first means finishing an argument to abandon it.

A shelved variant refuses content edits and adoption, for the same reason that
history refuses them. The way out is the same: branch a proposal from it. Its
name, its content and its ancestry are exactly as they were left. As with
history, the refusal is narrow. It fires only for a batch that changes variant
content, because views and level belong to the board rather than to any variant.

Shelving itself refuses four variants:

- The current variant. There is no proposal there to let go. Shelving it makes a
  board that says what is built say nothing.
- A historical variant, because it is not a live proposal.
- A variant that is already shelved, because it is not a live proposal.
- A draft that other drafts still stand on, and the refusal names them. Shelving
  it leaves those proposals derived from a state that stopped moving. Nothing on
  the board says so.

[ADR 0031](0031-existence-is-a-fact-about-a-variant-never-about-a-node.md)
supersedes the first reason given here, that a board with no current
architecture is not a board. A board for something nobody built yet has none.

Readers keep listing a shelved variant under its lifecycle, wherever draft and
historical are already distinguished. These places are the variant bar, the
navigator's markers, and the drill-down's disclosure of what a link opens.

## Consequences

A board's family stops growing monotonically in cost. A proposal that is over
stops charging every edit to its parent. The record of what was proposed, and of
how the proposal ended, survives in the one place somebody who looks for it will
be: the board it was proposed on.

Nothing becomes reversible. There is no un-shelving, for the same reason that
there is no un-adopting. The record says a decision was made. The way to propose
the same thing again is a new proposal branched from the old one. That is also
the way to say that the thinking resumed.

The lifecycle enum is now four values wide. An older build refuses a document
that this build wrote. It does not misread the document, because the contract is
strict. There is no compatibility layer. ADR 0023 already says that authored
boards are repaired rather than migrated.
