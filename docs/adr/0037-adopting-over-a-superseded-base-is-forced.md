---
status: accepted
---

# Adopting a proposal built on a superseded architecture must be forced

Canonical adoption supersedes the live variant operation below. Superseded proposals still require explicit comparison before authorized forced adoption.
[ADR 0062](0062-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.

Amends
[ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md). ADR
0023 let any coherent draft, including a competing branch, be adopted without
reparenting. Tracked as TASK-331. The user decided it on 2026-09-24.

Two proposals branched from the same current variant can both be adopted. The
second adoption silently drops the change of the first. On a scratch vault,
TASK-1 adds A and is adopted. Then TASK-2 adds B and is adopted. The current
variant has B and not A.

A draft follows its predecessor only while that predecessor is a draft or
current. After another adoption makes the predecessor historical, nothing more
reaches the draft. So the draft can be adopted, and nothing says what it leaves
out.

## Decision

If a draft stands on a historical variant, the adoption is refused as
`PARENT_SUPERSEDED` unless it is forced. What the draft stands on is its parent.
If that parent is a draft, it stands on the parent of the parent, and so on. A
historical variant on that line is one that a later adoption superseded after
the line was branched from it.

The refusal names the superseded variant, the variant adopted over it, and the
current variant. It also names the two ways on. The author can branch again from
the current variant and state the change again. Or, if leaving out the other
change is intended, the author can adopt with `--force`.

A forced adoption says so in its record with `forced: true`. The board
afterwards shows which architecture is current. The record shows that somebody
chose to drop what the later adoption brought, and did not miss it.

Nothing else changes. A draft whose line reaches the current variant adopts as
before. So does the first adoption on a board nobody had built, because no
variant there is historical. The adoption input and the adoption record each
gain one optional field. The contract version stays the same, as it did for
ADR 0036.

## Considered and rejected

Refuse outright, with no force. A proposal branched from a historical variant to
bring back what it described is a real case. The refusal of a historical variant
already tells the author to branch from it. Refusing that branch too leaves no
way to make an earlier architecture current again.

Rebase the draft onto the current variant automatically. That changes the
ancestry of the draft, and ADR 0023 keeps ancestry as a record of where a state
came from. The rebase also has to merge two proposals that nobody compared.
