---
status: accepted
---

# A proposal nobody will carry out is shelved, not deleted

Extends [ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md),
which gave a variant three lifecycles: current, draft and historical. Tracked as
TASK-261.

A draft can outlive its proposal. Two drafts in this repository's own vault got
there: `Canvas server` / `Readable layout` proposes nothing architectural — every
node shared, every relationship byte-identical, one drill-down retargeted and one
beat added — and `Semantic renderer` / `Readable layout` has converged on its
parent outright. Neither can be adopted: adoption freezes the accurate current
variant into history and promotes a variant that says the same thing. So under
ADR 0023 they stay drafts forever, and only a draft inherits, so every edit to
either parent merges into them and can raise a disagreement somebody must settle
before anything on that line can be adopted. A spent proposal is a standing tax
on the board it hangs off.

## Decision

**A variant has a fourth lifecycle, `shelved`: a proposal nobody intends to carry
out, kept under its name so the thinking is not lost.** The word is chosen against
the ones already spoken for — `abandoned` is what CONTEXT.md's historical entry
forbids, `superseded` is what a historical variant is, `spent` belongs to
same-write handles, `dropped` is what a merge does to a subject, and `withdrawn`
is a person's optimistic edit rolled back (ADR 0022).

**Shelving is not deletion, and deletion is rejected.** A variant is addressed by
name from other boards: a drill-down names a target board and a variant, and a
named target never falls back to whichever variant is current (ADR 0023) — it
simply reports that there is nothing there. The two spent drafts above name each
other, so deleting either leaves the other's link opening nothing, and the vault
checker cannot see it because it checks the board name and level. Keeping the
variant under its name leaves every link resolving and the viewer disclosing what
it opens.

**Shelving is a fifth transition, beside create, branch, edit, settle and adopt.**
It goes through the one write boundary the other four do: same lease, same
expected-version check, one version advance, one atomic write (ADR 0016). It
takes the reason the proposal was let go, and the board records what was shelved,
when and why, the way it already records each time the designation moved. The
reason is required where an adoption's is optional: the board afterwards says
which architecture is implemented, but nothing says whether a proposal was tried,
refused, overtaken or simply forgotten.

**A shelved variant stops following its predecessor, and lets go of anything it
was holding.** Following was never a property of ancestry — only a draft follows
what it came from — so this falls out of the word rather than being arranged.
Clearing the standing is a decision: a proposal nobody is carrying out has
nothing to settle, and requiring settlement first would mean finishing an
argument in order to abandon it.

**Content edits and adoption are refused on a shelved variant, for the reason
history refuses them and with the same way out: branch a proposal from it.** Its
name, its content and its ancestry are exactly as they were left. As with
history, the refusal is narrow — it fires only when a batch changes variant
content, because views and level belong to the board rather than to any variant.

**Shelving itself refuses four variants.** The current one, because there is no
proposal there to let go, and shelving it would leave a board that said what is
built saying nothing. (The first reason given here, that a board with no current
architecture is not a board, is superseded by
[ADR 0031](0031-existence-is-a-fact-about-a-variant-never-about-a-node.md): a board
for something nobody has built has none.)
A historical one and one already shelved, because neither is a live proposal. And
a draft that other drafts are still standing on, naming them: shelving it would
leave those proposals derived from a state that has stopped moving, with nothing
on the board to say so.

**Readers keep listing a shelved variant under its lifecycle**, wherever draft
and historical are already distinguished — the variant bar, the navigator's
markers, and the drill-down's disclosure of what a link opens.

## Consequences

A board's family stops growing monotonically in cost: a proposal that is over
stops charging every edit to its parent. The record of what was proposed, and of
how the proposal ended, survives in the one place somebody looking for it will
be — the board it was proposed on.

Nothing becomes reversible. There is no un-shelving, for the reason there is no
un-adopting: the record says a decision was made, and the way to propose the
same thing again is a new proposal branched from the old one, which is also the
way to say that the thinking was picked back up.

The lifecycle enum is now four values wide. A document written by this build and
read by an older one is refused rather than misread, because the contract is
strict; there is no compatibility layer and ADR 0023 already says authored boards
are repaired rather than migrated.
