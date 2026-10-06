---
status: accepted
---

# Cards, containers and groups are drawn as slabs

This decision supersedes parts of
[ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md) and
[ADR 0038](0038-groups-gather-and-colour-their-cards.md). Each of those records
names the sentences it replaces. The owner decided it on 2026-10-06, under
TASK-402. The reading fixes of the same request are TASK-403.
[ADR 0042](0042-the-picture-answers-the-hand-and-a-card-opens-by-flight.md)
records two of them in its amendment of 2026-10-06.

## Context

Until this change the picture was flat. A card was one filled rectangle with a
one-pixel border. A container was a band with a border and a rule under its
heading. A group's region was an outline with no fill (ADR 0038). A change mark
took over the border of the part it marked.

On 2026-10-06 the owner asked for cleaner cards, containers and groups with more
depth. Three proposals were built from the same flat starting point. They were
compared on the same boards in the light and the dark theme:

- **Vellum** made depth by stacking paper. A container was a sheet with a soft
  shadow, and a card was a slip laid on it. A group was a film of its color with
  an index tab. No part had a drawn edge: its edge was its shadow. A second pass
  gave a grouped card a stronger wash and a lit top edge in the group color
  (commit 7ce8bec40).
- **Slabs** made depth by thickness. Every part is a block with a lit top face,
  a front edge and a soft shadow.
- **Pockets** made depth by subtraction. A container was a pocket sunk into the
  ground, a card was a raised plate, and a group was a flush inlay. On the light
  ground, the walls, the plate edges and the bevels did not show until a second
  pass deepened them (commit 945948919).

Vellum and Pockets both kept the change mark as a ring on the edge of a part.
The branches `surface-depth/vellum` and `surface-depth/pockets` keep both
proposals as unmerged history.

The owner chose Slabs: "I reeeeeally like Slabs ... this is definitely direction
i want to go. Let's adopt it!" The owner then found three faults in it. The
sequence views still drew flat outlined boxes. A change mark drew a second box
inside a card. The heading of a container looked weak. This record decides the
fixed version. The owner also asked for three reading fixes. A default arrowhead
is as large as an emphasized one. No label is ever hidden. The camera stops when
the hand lets go of a drag.

## Decision

The picture builds every part as a block lit from the upper left. The
construction is `src/transformers/semantic-renderer/lib/svg/slab.ts`. Its sizes
are in `lib/design.ts`.

1. **A card is a slab.** It has a top face, a fine highlight along the top edge
   of the face, and light that falls off down the face. Its front edge is 4
   units thick and lies inside its layout box, along its foot. So a line that
   ends on the foot of a card meets the edge that a reader sees.
2. **A shadow is flat shapes.** A part casts its shadow down and to the right.
   The shadow is a stack of translucent copies of the part's silhouette, each a
   little larger and fainter. No shadow reaches more than 12 units past its box.
   The picture uses no SVG filter, blur or mask for depth. It uses one shared
   gradient for the light on a face and one shared pattern for a hatch.
3. **A container is a plinth.** A top-level plinth is 6 units thick. Each
   container nested in another is 1 unit thinner, down to the 4 units of a card.
   Its face also rises a step toward `--plinth-rise` for each level, for two
   levels at most. A step is 30 % of the way on the light ground and a third of
   the way on the dark ground. The plinth itself is neutral.
4. **The heading of a container lies on a nameplate.** The nameplate lies across
   the top of the plinth's face and has a front edge of its own. The face and
   the front edge of the nameplate carry the color of the container's kind. The
   lines that the container sends out leave from the foot of that front edge.
5. **The region of a group is a mat.** The mat is 3 units thick. Its face
   carries a light share of the group's color, and its front edge is in the
   group's color. It casts no shadow. Its caption is printed on a raised tab in
   the top corner where the words start. When a route runs down through that
   corner and no route runs through the other top corner, the tab moves to the
   other corner. Lines cross the mat and the tab.
6. **A card carries its group on its front edge.** The front edge of a card is
   the group's color, shaded deeper. Its face carries a light share of the same
   color. A card in no group has a grey front edge and a neutral face.
7. **Small parts are low slabs.** An icon chip, the label of a relationship and
   the label of a sequence message are low tiles with a contact shadow. An
   activation bar is a slim slab. It takes the front edge of its participant's
   card. The bar of a participant in no group is shaded toward the secondary
   ink, about as pale as the bar of a grouped participant.
8. **A sequence frame is a plinth with a nameplate,** built like a container.
   The name of the flow is printed on the nameplate as a container's name is:
   as written, not in capitals, in the medium face, 14 units high. Its summary
   is 11 units high, in the secondary ink.
9. **A change mark is on the face.** The pin stays on the corner of the part.
   - On a card, a participant or a relationship's label, an added part's face
     is washed in green, and a changed part's face is washed in orange. A
     changed card or participant is also hatched. A card keeps its group's
     front edge. A label has no group, so its standing also colors its front
     edge.
   - On a container, the nameplate keeps its kind's color. The standing washes
     the plinth's face below the nameplate, less strongly than a card's. A
     changed container's nameplate is hatched at half strength.
   - A sequence frame shows its standing by the pin alone, unless the flow was
     removed.
10. **A removed part has lost its thickness.** A card, a container, a
    participant or a relationship's label is a flat, see-through face inside a
    dashed red footprint, with no front edge and no shadow. Its words are faded
    to the secondary ink. A removed message's words are in the secondary ink on
    a flat, opaque plate. A removed line is drawn whole at 70 % opacity. Its ink
    is weakened less than a live line's, so it keeps a contrast of 3:1 on every
    ground it crosses.
11. **A default arrowhead is as long as an emphasized one.** Every head takes its
    length from one table, `HEAD_LENGTH` in `lib/svg/styles.ts`. A head is 11
    units long on an emphasized line, 11 on a default line and 6 on a muted
    line. Boards and sequences both read it.
12. **The colors are tokens.** The faces, edges, highlights and shadows come
    from the `--slab-*`, `--plinth-*` and `--mat-*` tokens in
    `src/shared/theme/theme.css`, in both themes.

## What stays

- **The five channels of ADR 0025 and ADR 0038.** The icon chip says the kind.
  The card says its group. The container says its kind. The comparison standing
  says what a proposal changed. The selection ring says what is picked. Each
  channel keeps a place of its own on the part.
- **The selection ring.** It still sits 3 units outside a part. Round a removed
  part, it is drawn over the dashed footprint, so the part shows one ring.
- **No filter over the picture.** The renderer draws depth with flat shapes
  only, as rule 2 says. The shell still paints nothing on the picture.
- **The layout of an architecture board.** Each slab is drawn inside the box
  that the layout gave it, so no card, container or region moves. One rule of
  the Blocks engine changed. It refuses a slide that leaves the last run of a
  line too short for its bend and its straight approach. A run that the line
  had before is exempt.

## Consequences

- **A vault changes nothing.** No board and no `config.yaml` changes. Every
  board of every vault draws in the new look on its next render. Exported SVG
  and PNG files change.
- **A sequence takes more room.** The title of a flow stands 8 units lower. Its
  participants stand 21 units lower, or 26 under a summary, to make room for
  the nameplate. An activation bar runs 9 units past its call instead of 8. A
  message label stands 7 units over its line instead of 5.
- **A picture draws more shapes.** The slab look drew 2.0 to 2.7 times the
  shapes of the flat look. Its SVG files were 1.5 to 1.8 times as large. These
  were measured on five test boards, with the Track engine in the light theme.
  Nobody has measured how fast a large board drags with the slab look.
- **The README pictures were made again in part.** The three diagrams, the
  banner and their thumbnails were made again with `bun run readme:assets`. The
  five filmed clips must be made again and attached to GitHub. The ask clip and
  the three narrated videos also need a Codex sign-in.
- **Tests that read paint read the slab.** A test reads the group of a card from
  its front edge and a standing from its face. No part has a colored border,
  except the dashed footprint of a removed part.
- **The legend draws what the picture draws.** A line sample takes its
  arrowhead length from the renderer's `headLength`, which reads `HEAD_LENGTH`.
  A kind's chip is a raised tile in the slab colors, and a subject's tip shows
  the same chip. The legend still has no key for a group, a container or the
  depth.

## Considered and not chosen

- **Vellum, stacked paper.** A part had no front edge, so the group color sat on
  the paper as a wash. Its change mark stayed a ring on the edge of the paper.
- **Pockets, recessed containers.** Its depth did not show on the light ground
  until a second pass. Its change mark also stayed a ring on the edge.
- **An SVG filter for the shadow.** The construction rules out a filter, a blur
  and a mask, because a picture of a hundred cards is dragged and zoomed
  (`slab.ts`). Stacked translucent shapes give a soft shadow without one.
- **A ring inside the face for a change mark.** The first build drew a ring five
  units inside the face (commit 48eca5b63). The owner found that a change mark
  drew a second box inside a card (TASK-402). The wash replaced the ring.
