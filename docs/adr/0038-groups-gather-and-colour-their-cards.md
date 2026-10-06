---
status: accepted
---

# Groups gather and color their cards

Supersedes the color-scope rule of
[ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md) and the
group clause of
[ADR 0024](0024-vault-configuration-owns-vocabulary-and-presentation.md).
Tracked as TASK-347. The user decided it on 2026-09-25.

[ADR 0044](0044-cards-containers-and-groups-are-drawn-as-slabs.md) supersedes
how this decision draws its colors. A region is now a thin faded frame in its
group's color, with thick corner brackets and a caption tab in the full color,
and no fill. A card carries its group's
color on its front edge and its face, not on a border. A container is a tray
that carries its kind's color on its floor and its nameplate. Which group
places a card, and which cards a region gathers, stand. The amendment of
2026-10-06 at the end says what is true now.

Until now a group was meaning only. Grouping changed nothing that was drawn, and
a group had no color. A card took its body color from the nearest colored
container around it. On a board, that tells a reader where a card is hosted. The
container around the card already shows that. It does not tell the reader which
cards serve the same concern, and the author recorded that concern with groups.

## Decision

Every configured group has a color. A group in `config.yaml` has a `name` and a
required `color` from the curated palette of ADR 0024. A configuration with a
group that has no color is invalid. The vault check names the group and the
repair. The repair is to add `color:` with one of the colors of the palette.

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

The layout draws each such region as an outline in the color of the group. The
outline is twice as wide as the border of a card and has no fill. The caption of
the region is the name of the group. The user chose the outline over a tinted
band on 2026-09-26. Lines can cross a region, and a column fold never splits
one.

A card's body color comes from its placing group. Its border and tint are the
color of the group, and a card with no placing group is neutral. The icon chip
keeps the color of the card's kind, as before.

A container's frame takes the color of its own kind. Its border and faint tint
are the color of its kind, and a kind without a color draws it neutral. The
container passes no color to its contents. A group that places it gathers it
into a region without recoloring it.

The request behind this decision was that a card inside a container takes its
color from its group instead of from the container. The request was never that a
container loses its own color. An amendment of 2026-09-25 colored a container by
its placing group like a card, and so drew most frames neutral. That went
further than the request, and it was reverted on 2026-09-26.

## Consequences

Color on a card now says which concern it serves, and the color of a frame says
what kind of host it is. A vault with no groups draws every card neutral, with
colored icon chips, and every container in the color of its kind. Adding,
removing or reordering a group in `config.yaml` can move cards and change their
color on every board of the vault, without changing any board. ADR 0024 already
accepts this for all visual policy.

A card belongs to several groups but is in at most one region. A group spread
over several containers draws a region in each. So a reader finds every member
of the group by its outline and color, wherever containment put the member. The
order of `groups` in `config.yaml` decides which group places a card, so the
vault owner orders groups by which grouping matters most.

## Amendment of 2026-09-27: every member is placed

The decision first placed a card only with a group that another card in the same
container shared. A region of one card gathers nothing. Then a group with one
member in a container drew no region there and left that card neutral. So the
members of the group across containers read as unrelated. The user asked on
2026-09-27: "Elements that are part of the same group but in different
containers (or no container) all need their groups rendered. So if there are 3
containers that all have elements that are part of the same group, that group
should render 3 boundaries."

The placing rule above is the amended one. A card goes with its first configured
group, and a single member gets its region and the color of its group.

The first rule fell through. A card in several groups went with the first group
that a sibling shared, although an earlier group was configured. The amended
rule has no fall-through. So such a card now goes with its first configured
group, although only a later group is shared. It draws a region of its own
there.

A region round one card or container gathers nothing to pack. So the layout lays
it out as that node with a larger box. The outline and caption of the region sit
inside that box. The layout carries each line on from the wall of the region to
the card's own face.

A caption wider than the node widens the region, not the node. The node stands
in the middle of the region. Under Track, a layout engine, a container can grow
toward the width of the caption instead. This applies to a container with lines
that end on its own wall (see section 44). The board is laid out once, with such
regions.

On both vaults, as measured, a region round one node adds its room. It does not
turn which ports move to side walls or which joins part. Two heuristics keep
those choices from turning where they were measured. Nothing guarantees this for
another board
([layout rules, section 44](../design/layout-rules.md#44-a-region-round-one-node-2026-09-27)).

A group's region is not drawn inside a region of the same group. A container
placed with a group stands in the region of that group. So do the members of the
group inside the container. No second region of that group is drawn round them,
and they keep the color of the group. An ingress board drew the region of one
group round a pool of hosts and again round the four hosts inside it. That
outline told the reader nothing that the outer one had not told.

## Considered and rejected

One alternative is to place a card only with a group that a sibling shares. It
was the first rule (see the amendment above). It drew no region round a lone
member and left the member neutral. That hid the member from a reader who
followed the group.

Another alternative is an optional group color. A group without a color gathers
its cards into a region that the reader cannot tell from the next one. The cards
in it have no body color at all. The configuration is where a missing color can
be repaired once for every board.

A third alternative is to keep the container color scope beside the group color.
Two sources of body color need a rule for which wins, and the reader must know
that rule to read a card. The container still shows hosting by containment.

## Amendment of 2026-10-06: a region has a foot and a tab, and a card carries its group on its front edge

ADR 0044 draws a card as a slab and a container as a tray. The owner chose it
on 2026-10-06. With it, the owner first chose a filled region. Later that day
the owner asked for no background color behind a group, and for the tint on
its cards to stay (TASK-415). Three passages of this record no longer hold.

"The layout draws each such region as an outline in the color of the group. The
outline is twice as wide as the border of a card and has no fill." A region
still has no fill, so it looks the same on the page and on the floor of a tray.
A 3-unit frame in a faded tone of the group's color runs round it, and 6-unit
corner brackets in the full color mark its four corners (TASK-419). The
caption is printed on a tab of the full color in a top corner of the region. It is the corner where the words start, unless a route
runs down through it and none through the other top corner. Lines still cross
a region.

"A card's body color comes from its placing group. Its border and tint are the
color of the group, and a card with no placing group is neutral." The first
sentence holds. The front edge of a card now carries a tone of the group's
color, and its face is a quiet tone of the group's color. A card with no
placing group has a grey front edge and a neutral face.

"A container's frame takes the color of its own kind. Its border and faint tint
are the color of its kind, and a kind without a color draws it neutral." The
first sentence holds. A container is now a tray cut into the page. Its floor
carries a calm tint of its kind, and its walls are neutral. Its nameplate
carries a tone a step stronger on its face and on its front edge. A kind without
a color draws a neutral tray.

Where this record speaks of the outline of a region, read the frame, the corner
brackets and the caption tab. A reader finds every member of a group by the
color of the region's corners and tab, and by the face and the front edge of
each card. The palette's yellow is the gold of the product (DESIGN.md, the One
Gold Rule).
