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
2. **Depth is flat shapes.** A block casts its shadow down and to the right.
   Eight adjoining rectangles carry shared linear and radial gradients (TASK-438).
   The gradients agree at their seams and fade continuously to zero at the outside edge.
   No shadow reaches more than 12 units past its box.
   The picture uses no SVG filter, blur or mask for depth.
   Shared gradients also light the top face.

   Card and relationship label shadows lie under every line and every card.
   Their groups name what casts them through `data-members` (TASK-425).
   No shadow falls on a face or front edge.
   A viewer veils each shadow with its subject and hides it during a flight.

   A sequence keeps participant shadows inside its sticky head so that they move with the cards.
   Its lifelines start 13 units below the cards, past the twelve-unit shadow reach (TASK-439).
   Their dash offset preserves the original phase.
   The shade of a moved head covers its shadows and the columns behind them.
   Activation and label shadows lie below every lifeline and message.
   Each flow gains seven units of height.

   On the light ground the shadow uses 65 percent of `--slab-shadow`.
   The dark ground uses the token itself.
   Both shadows fade smoothly and stay distinct from the front edge (TASK-435).

3. **A container is a tray, lit from above as the blocks are.** Its top wall
   faces the reader and turns away from the light. It shows as a 6-unit band in
   shade, and it throws a short, soft shadow straight down, 3 units deep, on
   what lies under it. The two side walls are as thick as the top wall, a
   6-unit band each, quieter than it (TASK-431). The bottom wall faces the light and shows a
   2-unit lit lip, with a 1-unit crease below it. Where two walls meet, each
   turns round the rounded corner of the box, so the walls read as one carved
   shape. The tray is a neutral well: its floor is only just darker than what
   holds it, about 1.5% in OKLCH lightness on either ground, and its walls
   are neutral shades of the floor. A container nested in another is cut a
   step deeper into that one's floor, for two levels at most. A tray casts no
   shadow (TASK-414, TASK-423).
4. **The heading of a container lies on a header slab.** The header slab is a
   card's slab (rule 1), with a 4-unit front edge and a card's shadow,
   standing on the floor with its face level with what the tray is cut into.
   It stands inside the walls, a 2-unit gap of floor from the top wall and
   from each side wall (`WELL_GAP`), friction fit in the well: 8 units from
   the outer edge of the box on the top, the left and the right alike
   (`HEADER_SLAB_INSET`). The owner found a wider margin too large, and the
   margin on the top larger than at the sides (TASK-431). The first
   row of cards stands 20 units under its foot when no line turns there, as
   far as the cards stand from the sides and the bottom of the box
   (`CONTAINER_INSET`). Its words stand on it as a card's do, 16 units in. The
   lines that the container sends out leave from the foot of its front edge
   (TASK-423).
5. **A container's header takes its group's color, as a card does.** The
   header slab looks as a card does: in the color of the group that places the
   container, or neutral when no group places it. The well carries no color.
   The container's kind shows on its icon chip alone, as every part's does
   (TASK-423).
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
   the named color itself, its hue and chroma whole, at an OKLCH lightness of
   its own between 0.635 and 0.685 (`LIGHT_CORNER` in `lib/svg/regions.ts`),
   and the faded frame is a light tone of it at lightness 0.78 that keeps its
   hue and a lively chroma (TASK-419, after TASK-422 made the named colors
   vivid). The words on the tab there are a very light tint of the group's
   color, at lightness 0.98, near and far. The owner found dark words hard to
   read on the deep tab (TASK-427), and then found the deep tabs terrible
   (TASK-432): each color's tab is the lightest at which its bright words
   still reach APCA Lc 60. On the dark ground the tab is a light tone of the
   color at lightness 0.765 and its words a deep shade of it. The words keep
   Lc 60 or more on every tab in both themes, and the corners keep Lc 57 or
   more against the page and 53 against the floors of trays on the light
   ground (the gold 47 and 43), and 58 on the dark ground. The faded frame is quieter by design: about
   Lc 37 on the light ground and Lc 18 on the dark ground. A yellow group is
   the gold of the product's primary button (DESIGN.md, the One Gold Rule):
   its tab is the flat gold (`--primary`) with the gold's dark ink on it
   (`--primary-foreground`, Lc 72), the one tab whose words are dark, and its
   corners and frame are the gold as a mark (`--primary-mark`, which the named
   yellow equals). The owner chose this look among four drawn side by side
   (TASK-416, TASK-419).
7. **A card carries its group on its front edge and its face.** The front edge
   of a card is the face turned from the light: the group's hue in shade,
   darker than the face, so it reads as the foot of the block and not as a
   bright strip. On the light ground it is at OKLCH lightness 0.78 and chroma
   0.096, 0.11 or more under its face. On the dark ground it is at lightness
   0.212 and chroma 0.054, 0.098 under its face, the step of a neutral card
   (TASK-422). The face is a clearly colored card in a clean tone of its
   group's hue, an orange face a peach. On the light ground each color has a
   tone of its own (`LIGHT_FACE` in `lib/svg/appearance.ts`), because sRGB
   holds far less chroma near white in some hues than in others. Lime to teal
   and the gold of yellow are at lightness 0.92, the other colors at 0.89.
   Each takes nine tenths of the chroma its hue holds there, at most 0.07:
   from 0.049 for blue to 0.07 for lime to teal, cyan and fuchsia, and 0.055
   for yellow. So no color is clipped into another hue or goes neon. On the
   dark ground the face is a tone of the group's hue at lightness 0.31 and
   chroma 0.048. A card's name keeps APCA Lc 82 or more on a grouped face,
   and its description, in the secondary ink, Lc 62 or more on the light
   ground and Lc 63 on the dark ground (TASK-432).
   On the light ground a tinted face takes a softer light, so its color does
   not pool at its foot. A card in no group has a neutral front edge and face.
8. **Small parts are low slabs.** An icon chip, the label of a relationship and
   the label of a sequence message are low tiles with a contact shadow. An
   activation bar is a slim slab. It takes the front edge of its participant's
   card. The bar of a participant in no group is shaded toward the secondary
   ink, about as pale as the bar of a grouped participant. A bar's shadow lies
   under its lifeline and under every message, so neither is shadowed by a bar
   (TASK-430).
9. **A sequence frame is a tray with a header slab,** built like a container
   and always neutral. The slab stands the same 8 units in from the frame's
   outer edge, and the participants stand 18 units (`NEST_INSET`) under its foot,
   as far as in from the frame's sides. The name of the flow is printed on the
   slab as a
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
    - On a container, the border runs along the face of its header slab, as on
      a card, and the pin stands on the corner of the tray's box. The well is
      not marked (TASK-423).
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
    weakened less than a live line's, so it keeps APCA Lc 30 or more, the
    floor for a mark, on every ground it crosses.
12. **Every arrowhead has one length.** Every head takes its length from
    `HEAD_LENGTH` in `lib/svg/styles.ts`. A head is 11 units long whatever the
    emphasis of its line (TASK-404). Boards and sequences both read it.
13. **A line reads on every ground.** A card has no border now, so a neutral
    line no longer matches one. A neutral line, its arrowhead and a lifeline
    are drawn in `--diagram-edge`. On the light ground it keeps APCA Lc 65
    against the page and Lc 61 against the floor of a container
    (`--tray-floor`). On the dark ground it keeps Lc 34, a warm grey since
    TASK-432. Text keeps Lc 97 or more on the page. A colored line is
    drawn in its full color on the light ground, and at four fifths of its
    color over the page on the dark ground (`LINE_STRENGTH` in
    `lib/design.ts`). On the light ground every named color but yellow, the
    gold, keeps Lc 53 or more against the page and the floor of a tray, a
    nested one included (TASK-422); yellow keeps Lc 40. On the dark ground
    every colored line keeps Lc 31 or more. A muted line is as wide as a
    default line. Its ink is
    its default ink with the page
    mixed in, so that it keeps 70 % of it on the light ground and 60 % on the
    dark ground (`MUTED_STRENGTH` in `lib/svg/styles.ts`). A muted neutral line
    has about Lc 46 against the page on the light ground and Lc 16 on the
    dark ground. It is never made
    translucent, and its head and its pulses take the same ink (TASK-409).
14. **The colors are tokens.** The faces, edges, walls, floors, highlights and
    shadows come from the `--slab-*` and `--tray-*` tokens in
    `src/shared/theme/theme.css`, in both themes. A group region's frame, its
    corners, its tab, its caption and a grouped card's face are tones of the
    group's own color token (`--semantic-*`). Each is a relative OKLCH color
    (`toned` in `lib/svg/colour.ts`): the token's hue, a lightness of its own
    and a share of the token's chroma. On the light ground the corners and the
    tab are the token itself at a lightness set for each color (`heldTone`),
    so a vivid color stays vivid. Mixing the color into a grey or a
    near-white surface in sRGB turned its hue and lost most of its chroma,
    which made the group colors pale on the light ground and muddy on the dark
    ground (TASK-413).
15. **The light ground is crisp and vivid, not pastel.** The owner found the
    light picture dusty and pastel (TASK-422). Its own neutrals are now cool
    and clean, near hue 255: a tray floor a step under the chalk ground and a
    navy shadow. A card face is a soft off-white (`--slab-face`, lightness
    0.96), never pure white: the light on it rises to 0.97 at its top and its
    fine top edge to 0.98 (TASK-426). A relationship's label takes the same
    face. A neutral front edge is the face's own neutral in shade
    (`--slab-edge`, lightness 0.815). The owner found a pale blue-grey edge
    read as a highlight, and a card that started at white too bright. On the
    light ground an
    icon chip takes a tone of its color in OKLCH (`inkedOver` in
    `lib/svg/colour.ts`), and a chip's glyph is its type's color itself, at
    APCA Lc 53 or more on the chip for every color but yellow, which has
    Lc 40. The words are in `--diagram-text` and `--diagram-text-muted`, a
    deep navy and a slate. The dark ground keeps its values, except a grouped
    card's front edge (rule 7) and what rule 17 changed.
16. **A line that meets the foot of a card runs into a port** (TASK-424). The
    port is a slot cut through the card's front edge where the line meets the
    foot: 2.7 units tall, under a 0.6-unit lid and over a 0.7-unit sill, as
    long as the line and 2.1 units either side. The card's body is clipped
    round it, and round a notch through the sill below it as wide as the
    line, so the hole shows what lies under the card. The line's own group
    draws the inside of the port there: a well that darkens from its rim into
    its depth (`--port-wall` to `--port-deep`), a lit crescent of floor by the
    sill (`--port-lip`, lighter than the front edge round it, so it reads at
    2x), and the end of the line, at the line's own width,
    running up over the floor and the sill into it and fading into the depth.
    Nothing of the card lies over the line below the lid (TASK-425). So the
    end of the line takes the line's veil and light. Its pulses ride on up
    into the hole to the lid, over the well, so a pulse is seen to come out of
    the hole and to go into it. A pulse that arrives in an arrowhead at a
    port rides on over the head into the hole, since the head's tip stands on
    the sill; the pulses are drawn over the lines, so it passes over the head
    (TASK-430). Each line has its own slot; two lines that meet the
    foot at one place share it, and the first of them draws its well. A
    slot narrows as it nears a rounded corner, keeps at least 1.5 units of
    edge between it and the next, and is left out where that leaves too
    little room round the line. A removed line, drawn for context, runs into
    no port. Ports are drawn near and far alike: from far away a card keeps
    its front edge and its holes, and they belong to neither view's layer, so
    the swap between the views neither moves nor fades them. The cut is a clip
    in the card's own box (`objectBoundingBox`), so a card a viewer carries
    from one picture to the next carries its holes with it. A selected line a
    viewer draws over the others goes under the cards, so its ring and its
    pulses never lie on a card's face and show only in its ports (TASK-430).
    They are on a card's foot only:
    a sequence's lifelines start a gap under their cards and meet no edge. A
    port is a clip, the one clip the picture uses for depth, not a filter,
    blur or mask. It adds six elements for each port (five shapes and a
    group) and four for each card with a port, 2.2% to 2.4% more SVG on the
    Codex session and the Web shop boards. The layout, the routes and the
    atlas do not change. The lip is at OKLCH lightness 0.93 on the light
    ground and 0.61 on the dark ground. The owner found a white lip, and 0.66
    on the dark ground, a little too bright, so each now gives about four
    fifths of that light (TASK-435).

17. **The picture's contrast is judged with APCA** (TASK-432). The owner
    decided on 2026-10-07 that APCA, the Accessible Perceptual Contrast
    Algorithm, judges the contrast of the picture's words and marks, in place
    of the WCAG 2 contrast ratio (PRODUCT.md, Accessibility & Inclusion). The
    WCAG 2 ratio had held the light group tabs so dark that the owner found
    them terrible. The levels are APCA's Bronze levels, in Lc, at the size of
    the picture at 100 %: Lc 75 for a card's name and a label's words, Lc 60
    for a card's description and a group's caption, Lc 45 for a pin's mark,
    and Lc 30 as the floor for a line, a corner, an outline or a glyph, which
    aim at Lc 45 (`APCA` in the tests' `drawn-colours.ts`). APCA measures the
    words or the mark against what lies under it, in that order, since its
    result depends on the polarity. To keep these levels, the dark ground
    changed in three places: the secondary ink is lighter (`--diagram-text-muted`,
    lightness 0.81), a colored line is drawn at four fifths of its color in
    place of three quarters, and the red of a removal is lighter (lightness
    0.76). The dark ground's own neutrals became the warm graphite of the
    shell, hue 75 at the shell's chroma, with every lightness kept: a well
    and a card read as a cool, bluish grey beside the warm ground. The ratios
    written as X:1 in this record before 2026-10-07 were WCAG 2 contrast
    ratios.

## What stays

- **The five channels of ADR 0025 and ADR 0038.** The icon chip says the kind.
  The card says its group, and so does a container's header slab
  (TASK-423). The comparison standing
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

## Amendment of 2026-10-15: a container's header is made of the ground

The owner found on 2026-10-15 that a container's header looked too much like a
card, and asked for it to have the color of the background (TASK-474). Two
passages of this record no longer hold.

Rule 4 said that "the header slab is a card's slab (rule 1), with a 4-unit
front edge and a card's shadow". The slab keeps its 4-unit front edge, its
shadow, its place and its words. Its face is now the color of what the tray is
cut into: the page, or the floor of the tray around a nested one. Its front
edge is that color in shade, as far toward `--slab-deep` as the tray's top
wall is from its floor, and no light falls off down its face. So the header
reads as the head of the well, level with the page, and not as one more card.

Rule 5, "A container's header takes its group's color, as a card does", is
withdrawn, and so is "and so does a container's header slab" under What stays.
No group tints the header. The region of the group that places the container
already stands round it and says the group. A part that a view draws as a card,
with none of its children inside it, is a card and keeps its group's color.
Grouping tests own the rule: a container's header face is the page's color, a
nested one's is the floor around it, and no group's hue reaches it.
