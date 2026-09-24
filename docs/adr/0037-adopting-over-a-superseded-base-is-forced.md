---
status: accepted
---

# Adopting a proposal built on a superseded architecture must be forced

Amends [ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md),
which let any coherent draft, including a competing branch, be adopted without
reparenting. Tracked as TASK-331; decided by the user on 2026-09-24.

Two proposals branched from the same current variant can both be adopted, and
the second adoption silently drops the first one's change. On a scratch vault:
TASK-1 adds A and is adopted, TASK-2 adds B and is adopted, and the current
variant has B and not A. A draft follows its predecessor only while that
predecessor is a draft or current. Once another adoption makes it historical,
nothing more reaches the draft. So the draft can be adopted, and nothing says
what it leaves out.

## Decision

**A draft standing on a historical variant is refused as `PARENT_SUPERSEDED`
unless the adoption is forced.** What the draft stands on is its parent, and
then that parent's parent for as long as each is a draft. A historical variant
on that line is one that a later adoption superseded after the line was
branched from it. The refusal names the superseded variant, the variant adopted
over it, and the current variant. It also names the two ways on: branch again
from the current variant and state the change again, or adopt with `--force`
when leaving out the other change is intended.

**A forced adoption says so in its record** with `forced: true`. The board
afterwards shows which architecture is current. The record shows that somebody
chose to drop what the later adoption brought, and did not miss it.

**Nothing else changes.** A draft whose line reaches the current variant adopts
as before. So does the first adoption on a board nobody had built, because no
variant there is historical. The adoption input and the adoption record each
gain one optional field. The contract version stays the same, as it did for
ADR 0036.

## Considered and rejected

**Refuse outright, with no force.** A proposal branched from a historical
variant to bring back what it described is a real case. The refusal of a
historical variant already tells the author to branch from it. Refusing that
branch too would leave no way to make an earlier architecture current again.

**Rebase the draft onto the current variant automatically.** That changes the
draft's ancestry, and ADR 0023 keeps ancestry as a record of where a state came
from. It would also have to merge two proposals that nobody compared.
