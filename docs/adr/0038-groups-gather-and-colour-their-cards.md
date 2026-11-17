---
status: accepted
---

# Groups gather and color their cards

Supersedes the color-scope rule of
[ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md) and the
group clause of
[ADR 0024](0024-vault-configuration-owns-vocabulary-and-presentation.md).
Tracked as TASK-347. The user decided it on 2026-09-25.

Superseded in part (2026-10-31, TASK-559.16): a group's color stands on a bright
tag on each of its cards. No frame is drawn round a group, and a card's face stays
neutral. The cards of a group still stand together.

Until now a group was meaning only. Grouping changed nothing that was drawn, and
a group had no color. A card took its body color from the nearest colored
container around it. On a board, that tells a reader where a card is hosted. The
container around the card already shows that. It does not tell the reader which
cards serve the same concern, and the author recorded that concern with groups.

## Decision

Every configured group has a color. A group in `config.yaml` has a `name` and a
required `color` from the curated palette of ADR 0024. A configuration with a
group that has no color is invalid.

A card is placed with one group. Its placing group is the first group that the
card belongs to and that the configuration defines. The order in `config.yaml`
decides which group is first. The placing group does not depend on whether
another card in the same container shares it. A card in no configured group has
no placing group. A group id that the configuration does not define never places
a card.

The cards that one group places in one container are gathered into a region.
Every container that holds a card that the group places draws one region of that
group. The board level draws one too, because it counts as one container. A
group whose members sit in three containers draws three regions. A region round
a single card is drawn like any other.

A container passes no color to its contents.

## Consequences

Adding,
removing or reordering a group in `config.yaml` can move cards and change their
color on every board of the vault, without changing any board. ADR 0024 already
accepts this for all visual policy.

A card belongs to several groups but is in at most one region. A group spread
over several containers draws a region in each. The
order of `groups` in `config.yaml` decides which group places a card, so the
vault owner orders groups by which grouping matters most.

## Considered and rejected

One alternative is to place a card only with a group that a sibling shares. It
was the first rule. It drew no region round a lone
member and left the member neutral. That hid the member from a reader who
followed the group.

Another alternative is an optional group color. A group without a color gathers
its cards into a region that the reader cannot tell from the next one. The cards
in it have no body color at all. The configuration is where a missing color can
be repaired once for every board.

A third alternative is to keep the container color scope beside the group color.
Two sources of body color need a rule for which wins, and the reader must know
that rule to read a card. The container still shows hosting by containment.
