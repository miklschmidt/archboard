---
status: accepted
---

# Each duration lives with its owner

The owner decided this on 2026-11-13 (TASK-634). It supersedes one part of
[ADR 0016](0016-one-writer-at-a-time-per-board.md): every duration of the product in one place.
[ADR 0042](0042-the-picture-answers-the-hand-and-a-card-opens-by-flight.md) repeats that rule, and
this decision supersedes it there too.

## Context

ADR 0016 found that the durations of a lock pull against each other: shortening one deadline moves
what another one has to cover. It kept every duration of the product in one shared package. Beside
each value it wrote what the value pulls against. The next person to tune a value then sees what
else it moves.

That package grew into a bag of values. It held a group of durations for each part of the product:
the lock, the pane, the server's stop, the Codex child, the voice, the recording, the picture's
motion and others. Almost every group had one reader. So the package hid nothing. It moved each
group away from the code that reads it, and every new group widened its public interface. The
reasons beside the values named relations between groups of different owners, but nothing checked
them. A person who halved one value learned what else it broke only from a failure in use.

## Decision

- Each duration belongs to the package or app whose behavior it governs. It lives in that owner's
  own constants file, beside the code that reads it. The shared package of durations is gone.
- A group is private to its owner. If code of another package reads a group, the owner exports
  it, and that code imports the export. No value is written in two places.
- Where a lower package needs a value that a higher package owns, the higher package passes it in.
  The process package, for example, receives the TERM grace and the freeze wait of a Codex process
  group from the Codex package that owns them.
- A relation between durations of two owners is checked. Either the dependent value is computed
  from the other owner's export, or a test of the owner that can see both values asserts the
  relation. A comment can explain a relation, but it does not stand alone as its only record.
- A relation inside one owner stays with that owner, as a computed value or as a test of its own.

## Considered and not chosen

- **Keep the shared package and add tests to it.** The tests check the relations. But the
  package still moves every group away from its reader and grows with every owner.
- **Give each owner a copy of every value it reads.** It needs no new exports, but two copies of
  one value drift apart without a sign, which is the failure ADR 0016 set out to stop.
- **A system test for every relation.** A system test sees only the exports of a package, so it
  needs the same exports as an import does, and it puts the check far from both owners.

## Consequences

- A reader finds a duration beside the code that reads it, with its reason.
- An export that another package reads widens that owner's interface. Each package's interface
  ceiling rose by exactly the groups it now exports, and the ceiling of the shared package went
  away with it. The total width of the packages fell.
- If one owner tunes a value past what another owner needs, the test of that relation fails.
- The values themselves did not change.
