---
status: accepted
---

# Groups gather and colour their cards

Supersedes the colour-scope rule of
[ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md) and the
group clause of
[ADR 0024](0024-vault-configuration-owns-vocabulary-and-presentation.md).
Tracked as TASK-347; decided by the user on 2026-09-25.

Until now a group was meaning only. Grouping changed nothing drawn, a group had
no colour, and a card took its body colour from the nearest coloured container
around it. On a board, that tells a reader where a card is hosted, which the
container around it already shows. It does not tell the reader which cards
serve the same concern, which is what the author recorded with groups.

## Decision

**Every configured group has a colour.** A group in `config.yaml` has a `name`
and a required `color` from the curated palette of ADR 0024. A configuration
with a group that has no colour is invalid, and the vault check names the group
and the repair: add `color:` with one of the palette's colours.

**A card is placed with one group.** Its placing group is the first group, in
`config.yaml` order, that the card belongs to and that the configuration
defines, whether or not another card in the same container shares it. A card
in no configured group has no placing group, and a group id the configuration
does not define never places a card.

**The cards placed with one group in one container are gathered into a region.**
Every container that holds a card the group places draws one region of that
group, and so does the board level, which counts as one container: a group whose
members sit in three containers draws three regions, and a region round a single
card is drawn like any other. The layout draws each such region as an outline in
the group's colour, twice as wide as a card's border and with no fill, captioned
with the group's name (the user chose the outline over a tinted band on
2026-09-26). Lines may cross a region, and a column fold never splits one.

**A card's body colour comes from its placing group.** Its border and tint are
the group's colour, and a card with no placing group is neutral. The icon chip
keeps the colour of the card's kind, as before.

**A container's frame takes the colour of its own kind.** Its border and faint
tint are its kind's colour, and a kind without a colour draws it neutral. It
passes no colour to its contents, and a group that places it gathers it into a
region without recolouring it. The request behind this decision was that a
card inside a container takes its colour from its group instead of from the
container, never that a container loses its own colour; an amendment of
2026-09-25 that coloured a container by its placing group like a card, and so
drew most frames neutral, went further than that and was reverted on
2026-09-26.

## Consequences

Colour on a card now says which concern it serves, and a frame's colour says
what kind of host it is. A vault with no groups draws every card neutral, with
coloured icon chips, and every container in its kind's colour. Adding, removing or reordering a group in
`config.yaml` can move cards and change their colour on every board of the
vault, without changing any board, as ADR 0024 already accepts for all visual
policy.

A card is in at most one region, even when it belongs to several groups. A group
spread over several containers draws a region in each, so a reader finds every
member of it by its outline and colour wherever containment put the member. The
order of `groups` in `config.yaml` decides which group places it, so the vault
owner orders groups by which grouping matters most.

## Amendment of 2026-09-27: every member is placed

The decision first placed a card only with a group that another card in the
same container shared, because a region of one card gathers nothing. A group
with one member in a container then drew no region there and left that card
neutral, so the group's members across containers read as unrelated. The user
asked on 2026-09-27: "Elements that are part of the same group but in
different containers (or no container) all need their groups rendered. So if
there are 3 containers that all have elements that are part of the same group,
that group should render 3 boundaries." The placing rule above is the amended
one: a card goes with its first configured group, and a single member gets its
region and its group's colour. The first rule fell through: a card in several
groups went with the first one a sibling shared, even when an earlier one was
configured. The amended rule has no fall-through, so such a card now goes with
its first configured group even when only a later one is shared, and draws a
region of its own there. A region round one card or container gathers nothing
to pack, so the layout lays it out as that node with a larger box, the region's
outline and caption inside that box, and carries each line on from the
region's wall to the card
([layout rules, section 44](../design/layout-rules.md#44-a-region-round-one-node-2026-09-27)).

## Considered and rejected

**Placing a card only with a group a sibling shares.** It was the first rule
(see the amendment above): it drew no region round a lone member and left it
neutral, which hid the member from a reader following the group.

**An optional group colour.** A group without a colour would gather its cards
into a region the reader cannot tell from the next one, and the cards in it
would have no body colour at all. The configuration is where a missing colour
can be repaired once for every board.

**Keeping the container colour scope beside group colour.** Two sources of body
colour would need a rule for which wins, and the reader would have to know that
rule to read a card. The container still shows hosting by containment.
