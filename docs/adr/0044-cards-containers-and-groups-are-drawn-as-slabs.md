---
status: accepted
---

# Cards and groups are drawn as slabs, and containers as trays

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
inside a card. The heading of a container looked weak. The owner also asked for
three reading fixes. A default arrowhead is as large as an emphasized one. No
label is ever hidden. The camera stops when the hand lets go of a drag.

Later the same day the owner asked for two more changes. The front edges were
too heavy in the light theme (TASK-410). A container was to be an inset like the
Pockets container, with walls as thick as the front edge of a slab (TASK-412).
This record decides the version with all of these changes.

## Decision

The picture is lit from above. A card, a chip and a label stand on the page as
blocks (`src/transformers/semantic-renderer/lib/svg/slab.ts`). A container is
cut into the page as a tray (`lib/svg/tray.ts`). A group's region is drawn on
what holds it, with no face of its own (`lib/svg/regions.ts`). The sizes are
in `lib/design.ts`.

1. **A card is a slab.** It has a top face, a fine highlight along the top edge
   of the face, and light that falls off down the face. Its front edge is 4
   units thick and lies inside its layout box, along its foot. So a line that
   ends on the foot of a card meets the edge that a reader sees.
2. **Depth is flat shapes.** A block casts its shadow down and to the right. The
   shadow is a stack of translucent copies of the block's silhouette, each a
   little larger and fainter. No shadow reaches more than 12 units past its box.
   The picture uses no SVG filter, blur or mask for depth. It uses shared
   gradients for the light on a face.
3. **A container is a tray, lit from above as the blocks are.** Its top wall
   faces the reader and turns away from the light. It shows as a 7-unit band in
   shade, and it throws a short, soft shadow straight down, 3 units deep, on
   what lies under it. The two side walls are alike: each shows as a 3-unit
   band, quieter than the top wall. The bottom wall faces the light and shows a
   2-unit lit lip, with a 1-unit crease below it. Where two walls meet, each
   turns round the rounded corner of the box, so the walls read as one carved
   shape. The walls are neutral shades of the floor. The floor lies a step
   below what holds it. A container nested in another is cut a step deeper
   into that one's floor, for two levels at most. A tray casts no shadow
   (TASK-414).
4. **The heading of a container lies on a nameplate.** The nameplate is a
   raised plate on the floor, against the top wall. It has a 3-unit front edge
   of its own, and no shadow below that edge. The lines that the container
   sends out leave from the foot of that front edge.
5. **A container carries its kind.** The floor carries a calm tint of the
   kind's color. The walls carry none of it. The nameplate carries a tone a
   step stronger, and its front edge more again. A container of a kind with no
   color is neutral.
6. **The region of a group has no face, and a frame with strong corners.**
   The page or the floor of a tray shows through it, so it looks the same
   wherever it lies (TASK-415). A 3-unit frame in a faded tone of the group's
   color runs round it, about a third as strong as the full color. Four 6-unit
   L-shaped brackets in the full color lie over the frame at the corners, each
   arm 28 units long, following the rounded corners. The caption is printed on
   a tab of the full color in the top corner where the words start, grown out
   of the bracket of that corner, so the tab and the frame read as one shape.
   When a route runs down through that corner and no route runs through the
   other top corner, the tab moves to the other corner. Lines cross the region
   and the tab. It casts no shadow. On the light ground the full color is
   the named color itself, its hue and chroma whole, with its OKLCH lightness
   held between 0.615 and 0.645, and the faded frame is a light tone of it at
   lightness 0.78 that keeps its hue and a lively chroma (TASK-419, after
   TASK-422 made the named colors vivid). On the dark ground both are tones of
   the color. The full color keeps at least 3:1 against the page and the
   floors of trays, and the words on the tab, a deep shade of the group's
   color, keep at least 4.6:1 on the light ground and 8:1 on the dark ground.
   The faded frame is quieter by design: about 2:1 on the light ground and
   2.6:1 on the dark ground. The owner chose this look among four drawn side
   by side (TASK-416, TASK-419).
7. **A card carries its group on its front edge and its face.** The front edge
   of a card is the face turned from the light: the group's hue in shade,
   darker than the face, so it reads as the foot of the block and not as a
   bright strip. On the light ground it is at OKLCH lightness 0.78 and chroma
   0.084, 1.6:1 or more under its face. On the dark ground it is at lightness
   0.212 and chroma 0.042, 1.33:1 under its face, the step of a neutral card
   (TASK-422). The face on the light ground is a clean tint with its hue in
   plain sight, an orange face a peach, at lightness 0.93. Its chroma is nine
   tenths of what sRGB holds there in its hue, at most 0.055: 0.031 for blue
   and indigo, 0.055 for lime to teal, 0.042 for the gold of yellow. So no
   color is clipped into another hue. On the dark ground the face is a quiet
   tone of the group's hue. The secondary words on a grouped face keep 5.4:1
   or more on the light ground and 5.2:1 or more on the dark ground.
   On the light ground a tinted face takes a softer light, so its color does
   not pool at its foot. A card in no group has a neutral front edge and face.
8. **Small parts are low slabs.** An icon chip, the label of a relationship and
   the label of a sequence message are low tiles with a contact shadow. An
   activation bar is a slim slab. It takes the front edge of its participant's
   card. The bar of a participant in no group is shaded toward the secondary
   ink, about as pale as the bar of a grouped participant.
9. **A sequence frame is a tray with a nameplate,** built like a container and
   always neutral. The name of the flow is printed on the nameplate as a
   container's name is: as written, not in capitals, in the medium face, 14
   units high. Its summary is 11 units high, in the secondary ink.
10. **A change mark is the outline of the face.** The pin stays on the corner
    of the part (TASK-421).
    - On a card, a participant or a relationship's label, the standing takes
      over the outline of the top face, as on main before the blocks: a
      1.8-unit border in the standing's ink, solid green for added and dashed
      orange for changed (7 units on, 3.5 off). The border runs along the edge
      of the face, inside it, its outer edge on the face's edge and its corners
      the face's. The face keeps its group's tint and the front edge its
      group's color.
    - On a container, the border runs along the edge of the tray's box, round
      its walls, which are the container's own outline. The floor, the
      nameplate and the walls keep their colors.
    - A selected marked part shows its border and the selection ring outside
      the part, never two rings.
    - A sequence frame shows its standing by the pin alone, unless the flow was
      removed.
11. **A removed part has lost its depth.** A card, a container, a participant or
    a relationship's label is a flat, see-through face inside the dashed red
    border of a removal round its footprint, with no edge, no wall and no
    shadow. Its words are faded to the
    secondary ink. A removed message's words are in the secondary ink on a flat,
    opaque plate. A removed line is drawn whole at 70 % opacity. Its ink is
    weakened less than a live line's, so it keeps a contrast of 3:1 on every
    ground it crosses.
12. **Every arrowhead has one length.** Every head takes its length from
    `HEAD_LENGTH` in `lib/svg/styles.ts`. A head is 11 units long whatever the
    emphasis of its line (TASK-404). Boards and sequences both read it.
13. **A line reads on every ground.** A card has no border now, so a neutral
    line no longer matches one. A neutral line, its arrowhead and a lifeline
    are drawn in `--diagram-edge`. On the light ground it has a contrast of
    3.9:1 against the page and 3.7:1 against the floor of a container
    (`--tray-floor`). On the dark ground it has 4.6:1 and 4.8:1. Text has
    16:1 or more. A colored line is drawn in its full color on the light ground,
    and at three quarters of its color over the page on the dark ground
    (`LINE_STRENGTH` in `lib/design.ts`). On the light ground every named color
    but yellow, the gold, is deep enough to keep 3.5:1 against the page and
    3.2:1 against the floor of a tray, a nested one included (TASK-422). Yellow
    keeps about 2.5:1. A muted line is as wide as a default line. Its ink is
    its default ink with the page
    mixed in, so that it keeps 70 % of it on the light ground and 60 % on the
    dark ground (`MUTED_STRENGTH` in `lib/svg/styles.ts`). A muted neutral line
    has about 2.4:1 against the page on both grounds. It is never made
    translucent, and its head and its pulses take the same ink (TASK-409).
14. **The colors are tokens.** The faces, edges, walls, floors, highlights and
    shadows come from the `--slab-*` and `--tray-*` tokens in
    `src/shared/theme/theme.css`, in both themes. A group region's frame, its
    corners, its tab, its caption and a grouped card's face are tones of the
    group's own color token (`--semantic-*`). Each is a relative OKLCH color
    (`toned` in `lib/svg/colour.ts`): the token's hue, a lightness of its own
    and a share of the token's chroma. On the light ground the corners and the
    tab are the token itself with its lightness held in bounds (`heldTone`),
    so a vivid color stays vivid. Mixing the color into a grey or a
    near-white surface in sRGB turned its hue and lost most of its chroma,
    which made the group colors pale on the light ground and muddy on the dark
    ground (TASK-413).
15. **The light ground is crisp and vivid, not pastel.** The owner found the
    light picture dusty and pastel (TASK-422). Its own neutrals are now cool
    and clean, near hue 255: a card face a hair under white, a tray floor a
    step under the chalk ground and a navy shadow. A neutral front edge is the
    face's own neutral in shade (`--slab-edge`, lightness 0.83). The owner
    found a pale blue-grey edge read as a highlight. On the light ground an
    icon chip takes a tone of its color in OKLCH (`inkedOver` in
    `lib/svg/colour.ts`), and a chip's glyph is its type's color itself, at
    3.1:1 or more on the chip for every color but yellow, which has 2.2:1. The
    words are in `--diagram-text` and `--diagram-text-muted`, a deep navy and
    a slate. The dark ground keeps its values, except a grouped card's front
    edge (rule 7).

## What stays

- **The five channels of ADR 0025 and ADR 0038.** The icon chip says the kind.
  The card says its group. The container says its kind. The comparison standing
  says what a proposal changed. The selection ring says what is picked. Each
  channel keeps a place of its own on the part.
- **The selection ring.** It still sits 3 units outside a part. Round a removed
  part, it is drawn over the dashed footprint, so the part shows one ring.
- **No filter over the picture.** The renderer draws depth with flat shapes
  only, as rule 2 says. The shell still paints nothing on the picture.
- **The layout of an architecture board.** Each slab and each tray is drawn
  inside the box that the layout gave it, so no card, container or region
  moves. One rule of the Blocks engine changed. It refuses a slide that leaves
  the last run of a line too short for its bend and its straight approach. A
  run that the line had before is exempt.

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
  were measured before the tray, on five test boards, with the Track engine in
  the light theme. Nobody has measured how fast a large board drags with the
  slab look.
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
- **Pockets, recessed parts.** Its depth did not show on the light ground until a
  second pass, and its change mark stayed a ring on the edge. Its recessed
  container came back as the tray, with walls as thick as a slab's edge
  (TASK-412). Its plate cards and flush group inlays did not.
- **A container as a raised plinth.** The first build of Slabs drew a container
  as a block that stood on the page. The owner asked for an inset instead
  (TASK-412).
- **The top wall of a tray as the heading.** It made the heading the heaviest
  part of every container in both themes, and it lost the front edge that the
  container's lines leave from (TASK-412). The nameplate stays.
- **An SVG filter for the shadow.** The construction rules out a filter, a blur
  and a mask, because a picture of a hundred cards is dragged and zoomed
  (`slab.ts`). Stacked translucent shapes give a soft shadow without one.
- **A ring inside the face for a change mark.** The first build drew a ring five
  units inside the face (commit 26ce14b9c). The owner found that a change mark
  drew a second box inside a card (TASK-402). A wash of the face and a hatch
  replaced the ring. The owner then found that the marks had become weaker than
  on main (TASK-421): a wash took the place of the group's tint, and a pale
  wash was hard to see. The border of main came back, on the edge of the face
  rather than five units inside it.
