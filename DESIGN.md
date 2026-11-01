---
name: archboard
description: The shell of archboard as it stands in code, around a picture the renderer draws.
colors:
  ground-chalk: "oklch(0.99 0.0025 90)"
  ink-graphite: "oklch(0.17 0.006 75)"
  muted-ink: "oklch(0.48 0.008 75)"
  chrome-chalk: "oklch(0.973 0.004 88)"
  tray-chalk: "oklch(0.986 0.003 88)"
  reading-tone: "oklch(0.935 0.006 85)"
  well-floor: "oklch(0.95 0.005 255)"
  tab-piece: "oklch(1 0 0)"
  slab-face: "oklch(0.915 0.005 85)"
  card-white: "oklch(1 0 0)"
  rule: "oklch(0.905 0.005 85)"
  field-rule: "oklch(0.88 0.006 85)"
  wayfinding-gold: "oklch(0.831 0.134 84.5)"
  gold-top: "oklch(0.87 0.135 88)"
  gold-bottom: "oklch(0.805 0.142 81)"
  gold-rim: "oklch(0.7 0.125 76)"
  gold-ink: "oklch(0.2 0.02 70)"
  gold-mark: "oklch(0.72 0.15 77)"
  gold-tint: "oklch(0.968 0.03 88)"
  live-lime: "oklch(0.849 0.207 128.8)"
  changed-orange: "oklch(0.631 0.167 48)"
typography:
  display:
    fontFamily: "Archboard Display, Big Shoulders Display, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    lineHeight: "24px"
    letterSpacing: "0.07em"
  title:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
  nav:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: "20px"
  control:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "18px"
  body:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: "16px"
  presentation:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: "34px"
    letterSpacing: "-0.01em"
  reading:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  figure:
    fontFamily: "Archboard Display, Big Shoulders Display, sans-serif"
    fontSize: "44px"
    fontWeight: 650
    lineHeight: "44px"
    letterSpacing: "0.02em"
  subtitle:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 500
    lineHeight: "28px"
  technical:
    fontFamily: "Archboard Maple Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "14px"
rounded:
  chip: "2px"
  control: "3px"
  panel: "4px"
spacing:
  row: "28px"
  band: "36px"
  chrome: "40px"
components:
  button-primary:
    backgroundColor: "{colors.gold-bottom}"
    textColor: "{colors.gold-ink}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 10px"
  button-outline:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 10px"
  field:
    backgroundColor: "transparent"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "4px 10px"
  nav-row-chosen:
    backgroundColor: "{colors.tab-piece}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.control}"
    height: "28px"
  column-well:
    backgroundColor: "{colors.well-floor}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.panel}"
  count-badge:
    backgroundColor: "{colors.slab-face}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.chip}"
    height: "16px"
  page-card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.panel}"
    padding: "20px"
---

# Design System: archboard

This file records the shell as it stands in code. Two files are normative:
`packages/renderer/assets/theme.css` holds the colours of both themes, which the shell
and every picture paint with, and `apps/web/src/ui/theme/app.css` holds the elevation of
both themes, type, space, shape, the shadow utilities and the gold finish. If this file and those files disagree, those files win and this
file is stale.

## Overview

**Creative North Star: "The Lit Drafting Table"**

The picture is a model in low relief that lies on a table. The shell is the furniture
around it: rails, a header under the lamp, a tray at the foot of each column
and a few pieces of gold hardware. An agent drew the picture, and the architect
reads it. Nothing in the shell competes with the picture for attention, and
nothing in the shell paints on it.

The shell is dense desktop chrome at 1920×1080. It uses 13px controls, 28px
rows and small corners. Its neutrals are warm graphite and chalk, tinted toward
the hue of the gold. Depth comes from planes, not from lines. The chrome stands
on the picture and casts a short, warm, still shadow onto it. Controls stand on
the chrome with a highlight on their top edge. Menus and dialogs float above
everything. One warm yellow-gold marks what is chosen. It also marks the one
primary action of a region, and that action is drawn as a physical piece of
gold.

**Key Characteristics:**

- The picture is the ground. The shell sits around it and over it.
- Planes stack under a light from above. Each plane has a tone step, a highlight on its top edge and a warm shadow with an offset.
- One gold has three uses: what is chosen, the one primary action, and the voice and the brand mark. On the picture, the palette's yellow is that gold, on purpose.
- Tall condensed capitals set a name as a title. Plain sans sets every other word. Mono sets technical tokens only.
- The shell is for the desktop only, near full screen at 1920×1080.

## Colors

The neutrals are warm graphite and chalk (hue 75 to 95, at a chroma low enough
to read as grey). One warm yellow-gold sits over them. The dark theme keeps
every role and changes the values. The file theme.css holds both themes.

### Primary

- **Wayfinding Gold** (oklch(0.831 0.134 84.5)): the gold as a flat fill. It fills the voice ring, a status dot, a checked box and, in the dark theme, the selection on the picture.
- **Gold Top and Gold Bottom** (oklch(0.87 0.135 88) to oklch(0.805 0.142 81)): the subtle gradient from top to bottom of a primary action. The dark theme sets the bottom a step darker, at oklch(0.8 0.142 81).
- **Gold Rim** (oklch(0.7 0.125 76), dark oklch(0.58 0.11 74)): the edge of a primary action, one pixel wide.
- **Gold Ink** (oklch(0.2 0.02 70)): text and icons on gold. It keeps APCA Lc 66 or more on every stop of the gradient.
- **Gold Mark** (oklch(0.72 0.15 77), dark oklch(0.86 0.125 86)): the gold as a mark: a 2px bar or underline, a ring, an icon or the edge of something chosen. It lights the way to the chosen row, the active tab and the underline of a link.
- **Gold Tint** (oklch(0.968 0.03 88), dark oklch(0.29 0.045 80)): a quiet wash behind something chosen on a page.

### Neutral

- **Ground Chalk** (oklch(0.99 0.0025 90), dark oklch(0.2 0.006 75)): the ground of the picture, and of the About page that lies over it.
- **Chrome Chalk** (oklch(0.973 0.004 88), dark oklch(0.165 0.005 75)): the navigator, the pane header and the sidebar.
- **Tray Chalk** (oklch(0.986 0.003 88), dark oklch(0.205 0.007 75)): a tray at the foot of a column, raised over the chrome. The agent dock and the foot of the selection tab use it.
- **Reading Tone** (oklch(0.935 0.006 85), dark oklch(0.255 0.008 78)): the chosen row of a list on a page or in the right panel, raised as a plate.
- **Well Floor** (`--tray-sink`, oklch(0.95 0.005 85), dark oklch(0.14 0.005 75)): the floor of the well that the left column's list lies in, and of a field sunk into the column. It is the floor of a nested container on the picture, so the column and the picture are one material.
- **Tab Piece** (`--tray-tab`, oklch(1 0 0), dark oklch(0.25 0.007 75)): the lighter piece raised on the edge of a well: the open tab of the left column, and its chosen row.
- **Slab Face** (`--slab-face`, oklch(0.915 0.005 85), dark oklch(0.31 0.007 75)): the top face of a number badge, on a front edge of `--slab-edge`.
- **Card White** (oklch(1 0 0), dark oklch(0.235 0.007 75)): cards, popovers, dialogs and raised controls.
- **Ink Graphite** (oklch(0.17 0.006 75), dark oklch(0.955 0.006 90)) and **Muted Ink** (oklch(0.48 0.008 75), dark oklch(0.72 0.01 80)): text.
- **Rule** (oklch(0.905 0.005 85), dark chalk at 9%): the edge of a control or a card, one pixel wide. It also divides regions on one plane.

### Status

- **Live Lime** (oklch(0.849 0.207 128.8)): live state only. It marks the connection, claims and agent activity.
- **Changed Orange** (oklch(0.631 0.167 48) on chalk, oklch(0.77 0.17 52) on graphite): "changed" in a comparison. It moved off the shared amber because the amber has the hue of the gold.

### Named Rules

**The One Gold Rule.** Gold marks what is chosen, the one primary action of a region, and the voice and the brand mark. Nothing else in the shell is gold. On the picture there is one shared use, on purpose: the color named yellow in a vault's palette is the gold (`--semantic-yellow` is the gold mark, oklch(0.72 0.15 77) on chalk and oklch(0.86 0.125 86) on graphite), so a group, a kind or a relationship colored yellow is drawn in the gold. A yellow group's tab is drawn as a primary action is: the flat gold (`--primary`) with Gold Ink on it. The selection on the picture stays the only gold ring.

**The Ink On Chalk Rule.** Text on chalk is never gold. A gold dark enough to reach APCA Lc 60 on chalk reads as brown. Text stays in the ink, and a gold mark beside or under it carries the accent. On graphite, accent text is the gold itself (oklch(0.86 0.125 86)).

**The Untouched Picture Rule.** The renderer draws the picture. The shell never paints gold, shadow or decoration on a card in it.

## Typography

**Display Font:** Big Shoulders Display (served as Archboard Display).

**Body Font:** Onest (served as Archboard Onest).

**Label/Mono Font:** Maple Mono NL (served as Archboard Maple Mono), the one mono face of the shell and of every picture.

**Character:** Tall condensed capitals name the thing that a region is about.
A plain, round sans carries every other word. A quiet mono sets identifiers,
paths, versions, counts and times.

### Hierarchy

- **Display** (650, 20px, 24px, 0.07em, capitals): a name set as a title. Examples are a picked part, a variant and a walkthrough. The utility is `title-name`. The board in a pane's breadcrumb is not one: it is Onest (650, 13px) in full ink, so the display face stays with the wordmark and the titles.
- **Title** (600, 14px, 20px): the titles of regions and dialogs.
- **Nav** (500, 14px, 20px): the name of a board in the navigator.
- **Control** (500, 13px, 18px): buttons, tabs and fields.
- **Body** (400, 12px, 16px): prose and row labels. A section heading uses it in semibold.
- **Presentation** (600, 28px, 34px): the heading of a presented step.
- **Reading** (400, 16px, 24px): the words of a presented step, in a column 64rem wide at most, and the summary under a board's name on its About page.
- **Figure** (650, 44px, 44px, display face): the number of a presented step, and a board's name, in capitals, at the head of its About page.
- **Subtitle** (500, 20px, 28px): the words the voice says. A section heading of the About page uses it in semibold.
- **Technical** (400, 11px, 14px, mono): identifiers, paths, versions, counts and times.

### Named Rules

**The Mono Is Data Rule.** Mono sets technical tokens only. It never sets a label or a heading.

## Layout

The shell puts columns around the picture. The left column (448px) lists where to
go, and the agent dock is at its foot. Its width comes from what it holds: five tabs with
three-digit counts need 445px on one row, and the table of `Measures` needs 184px for a
name, which fits 99 percent of the names of this repository's model, beside seven count
columns of 30px. The panes are in the centre, one or two side
by side. The conversation opens between the column and the panes: it slides
in and out, and a handle on its edge, a grip on a line that takes the gold while
it is dragged, resizes it between 320px and 720px, or drags it shut below that.
Every Diagram reading of the canonical reader has a right panel beside its picture
(360px, or 46 percent of a narrow pane), in every pane, and the picture fits the room
that it leaves. A selection never refits the picture. A retained board recording keeps a sidebar (280px). Every
column starts with a chrome row (40px), and the left column has Find and the repository switcher, each 32px high. A pane's header stands
on a whole-pixel grid: 16px lines and icons, 32px crumbs and text trimmed to its
cap height, so its parts sit on one line at any display scale. A row of a list
is at least 28px high. Panels have 16px of padding. The shell has no narrow or
phone layout.

## Elevation & Depth

The system is layered. Planes stack over the picture under a light from above.
Each plane shows its height in three ways. The first is a tone step. The second
is a fine highlight on its top edge. The third is a soft shadow with an offset,
tinted toward the warm neutrals: umber on chalk and a warm near-black on
graphite. The picture is the ground, and only still shadows fall on it. Nothing
over the picture is blurred or filtered, and nothing there loops but the voice
orb, which draws itself on a canvas of its own, because every repaint over the
picture makes it slower to drag. What moves over it moves as a layer of its own,
once: a tip or a menu as it opens, the floating sidebar when it is shown or put
away, the walkthrough box as it arrives and as it hands one step to the next,
the voice box as it comes and goes, and each word of a subtitle as it arrives.
The file app.css holds the values for both themes and gives each one a
`shadow-*` utility.

### Shadow Vocabulary

- **well** (`--elevation-well`, an inner shadow of 1px offset and 2px blur): a field sunk into a surface, such as an input or the composer.
- **sink** (`--elevation-sink`, built from `--slab-shadow` and `--tray-lip`): the well that a column's list lies in. One inner shadow falls from the whole of its top edge, and a lit lip runs along its foot, as on a container of the picture. The `column-well` utility holds the recipe.
- **slab** (`--elevation-slab`, built from `--slab-glint`, `--slab-edge` and `--slab-shadow`): a number that lies on a surface, as a small part of the picture does: a lit top edge, a front edge 2px thick and a short shadow.
- **edge-down, edge-side and edge-up** (`--elevation-edge-*`): the chrome casts these onto what is under it or beside it. Each is a 1px contact shadow and a soft shadow. The soft shadow has an 8px offset on chalk and 10px to 12px on graphite. A tray casts edge-up over the list that scrolls under it.
- **raised** (`--elevation-raised`, a white highlight on top and a 1px seat): a control, a key cap, the voice circle and the chosen row of a list.
- **pressed** (`--elevation-pressed`, an inner shadow): a raised control while somebody presses it.
- **card** (`--elevation-card`): a card on a page.
- **float** (`--elevation-float`, a highlight on top and three shadows): menus, tips, lists of matches, the floating sidebar, the walkthrough box and the voice box.
- **dialog** (`--elevation-dialog`, a highlight on top and three shadows): dialogs.
- **primary and primary-pressed** (`--elevation-primary*`): the gold finish at rest and pressed.

### The Picture's Own Depth

The picture has a depth vocabulary of its own, and the renderer draws it. Its
light falls from above. A card is a slab: a lit top face, a front edge along
its foot and a soft shadow below it. A container is a neutral well cut into
the page, its floor only just darker than the page. One inner shadow falls from
the whole of its top edge, and a lit lip runs along its bottom. Its name stands
on a tab, a lighter piece raised on that edge. The tab's left side is the well's
left side, its top corners have the well's radius, and it meets the edge on the
right in one crisp concave curve. The well's top edge runs on under the tab, so
a line parts the tab from the floor. The tab hugs its words with 12 units on
either side, and one outline runs round the tab and the well. The first row of
cards stands as far under the edge as from the sides and the bottom of the well.
In a live reader, a door that holds parts ends with a plus behind a thin rule, and
the tab of an expanded module ends with a minus in the same place. The piece keeps its
look, and only the control takes a plate under the pointer. An export and a presented
step draw neither control.
No group tints a container, and it wears no tag: its kind shows on its icon chip
alone.
A group shows on each of its cards as a tag at the top right, the same bright
piece as in the Legend, and the cards of a group stand together. No frame is
drawn round a group. A card's face and front edge stay neutral in every group.
A door is a bright button with the finish of a primary action, in the color of
its group, or of its kind when it has no group, in both themes. Its arrow
points up, sideways or down by where its module lies in the tree.
The code path stands at a card's foot in Maple Mono NL at 10.5 units, its
folders dimmed and its file bright, as far from the foot as the name stands from
the top. Below a scale of 0.857 a picture draws its far view: one fixed type scale
of 18 units for a name, on every picture, with the padding, the chip and the build
of a near card, as much of its responsibility as its box holds, a flat spot in a
group's color for its tag, and the doors and the tab still readable.
Each
shadow uses eight adjoining rectangles with shared gradients, with no filter, blur or mask. The colors
come from the `--slab-*` and `--tray-*` tokens in theme.css, in both themes. A comparison marks a part by its outline: a
1.8-unit border in the comparison's green or Changed Orange along the inside edge of its
top face, solid for added and dashed for changed, and a removed part's dashed
red border round its footprint. The face and the front edge keep their colors.
A line that meets the foot of a card runs into a port, a small slot cut
through the card's front edge, dark inside, with a lower lip lighter than the
edge round it but short of white. The line comes out of it at its own width,
over the lip, fades into its depth, and its pulses
travel into and out of it, over an arrowhead too. Ports are drawn near and far
alike. No shadow falls on a line: the shadows of cards, labels and activation
bars lie under the lines. Every card shadow lies under every card.
A sequence lifeline starts 13 units below its card to clear the shadow.
The sticky head carries its shadows and hides the columns behind their full reach.
The shell touches none of it, and the Untouched Picture Rule still holds.
[ADR 0044](docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md)
records the construction.

On chalk the picture is crisp and vivid, never pastel or dusty. Its own
neutrals are the shell's warm chalk, near hue 85, and never blue: a card
face a warm grey that stands apart from the ground and a well's floor
(oklch(0.915 0.005 85), lit at its top), a tray floor a step under the ground (oklch(0.974 0.003 88)) and a
warm shadow. Under a card's foot that shadow is lighter than the front edge,
so the edge ends where the card ends. The light falls straight down on every surface, so a shadow falls down and spills a little to the right and the left,
with a faint ring round the card. A label's face is the card's. A front edge
is the face in shade, never a lighter strip: the neutral face's own neutral at
lightness 0.815
(oklch(0.815 0.003 255)). A chip is a light
tone of its type's color, with the glyph in the color itself. The words are
**Diagram Ink** (`--diagram-text`, oklch(0.2 0.02 265)) and **Diagram Slate**
(`--diagram-text-muted`, oklch(0.45 0.028 262)). On graphite they are the
shell's bone and a light warm grey (oklch(0.81 0.01 80)). Every named color but
the gold of yellow keeps APCA Lc 53 or more as a line on chalk and on a tray's
floor, and every line keeps Lc 30 or more on graphite. Contrast comes from deep
ink and strong color, never from a washed-out color. On graphite the picture's
own neutrals are the shell's warm graphite (hue 75, chroma near 0.006), so a
container's well and a card read as the same material as the ground.

A neutral line, its arrowhead and a lifeline are drawn in **Line Ink**
(`--diagram-edge`, oklch(60% 0.015 286), dark oklch(0.6 0.012 80)). It keeps
APCA Lc 58 or more against the ground and a container's floor on chalk and Lc 34
on graphite, and it stays far under the contrast of text. A colored line is
drawn in its full color on chalk and at four fifths of its color on graphite. Every arrowhead is 11 units
long, whatever the emphasis of its line. A muted line is as wide as a default
one and paler: its ink keeps 70 % of its default ink over chalk and 60 % over
graphite, never by opacity. A traffic pulse is the color of its
line with white mixed in (`--diagram-glow`), so it reads as light that travels
along the line on both grounds.

### Named Rules

**The Still Shadow Rule.** A shadow over the picture is a static box-shadow, and a panel's shadow never changes while the panel moves. Nothing over the picture viewport uses backdrop-filter, filter or blur, and nothing there loops except the voice orb in the voice box, which is drawn on a canvas of its own and only while voice is on, and the warm wash the box takes from the orb's light, which is a layer of the box and never of the picture. A tip, a menu, the floating sidebar, the walkthrough box or the voice box may ease its own layer's transform and opacity, once, and each word of a subtitle may ease its own opacity, once. A select or a menu takes 160ms to arrive and 110ms to leave. The floating sidebar takes at most 160ms, the walkthrough box 220ms to arrive and 520ms to hand one step to the next, with the wake on its rail settling by about 700ms, and the voice box 360ms to arrive and 240ms to leave. A box that is wanted again while it leaves turns round from where it is. The orb itself crosses the page when subtitles are turned on or off, in a layer of its own, over 680ms.

**The Picture Answers Rule.** The light belongs to the picture, not to the shell. When a part or several parts are picked out, or the pointer rests on one, the viewer marks what stays as drawn, and the picture's own subjects recede far under an opacity filter, so that what stays is plainly on top. Several picks keep only themselves and the lines between them. The shell lays no layer, blur or halo over the picture to do it.

**The Card Is a Window Rule.** A card that opens a board is a window onto it. The board opens when the camera flies into the card, and going back flies out of it. The board's picture sits inside the card, in the picture's own units, so one camera carries both and the board that opens stands where the board in the card stood. The shell adds no layer for the flight.

**The Planes Not Lines Rule.** Regions read as layered planes. A one-pixel rule stays only where it draws the edge of a control or a card, or where it divides regions on one plane.

## Shapes

Corners are small and firm. Chips have 2px corners, and so does the key
combination in a tooltip. Controls, rows and the key cap that hints a shortcut
beside a field have 3px corners. Cards, menus and dialogs have 4px corners. The
voice and the medallion of a part are circles.

Some forms are capsules, round at both ends. These are the voice box and the
voice pill at the foot of the walkthrough box. The segments of the rail and the
gold piece that travels along it are capsules too. Edges are one-pixel rules in
the Rule tone.

## Components

### Buttons

- **Shape:** firm corners (3px to about 4.8px).
- **Primary:** a physical piece of gold, drawn by the `primary-finish` utility. It has the gradient from Gold Top to Gold Bottom and a Gold Rim edge. It has a highlight on its top edge, a shadow that seats it and Gold Ink text. It is the one primary action of a region: Open <board> at the foot of the selection tab, Send, and the button of a dialog that saves or agrees.
- **Hover and pressed:** hover makes the gradient brighter. Pressed turns the gradient over, moves the shadow inside and sinks the control by 1px.
- **Outline and secondary:** Card White, a Rule edge and `shadow-raised`. When pressed, they use `shadow-pressed`.
- **Ghost:** no fill until hover.

### Cards / Containers

- **Corner Style:** 4px.
- **Background:** Card White.
- **Shadow Strategy:** `shadow-card`. A card holds controls and is not one itself, so it does not rise on hover.
- **Border:** a one-pixel Rule.
- **Internal Padding:** 20px at each side, and 16px to 20px above and below.

### Inputs / Fields

- **Style:** a Field Rule edge and `shadow-well`, with no fill of its own, so it takes the tone of the surface it sits in. The dark theme fills it with the Field Rule at 30%.
- **Size:** 32px high, with 10px of room at each side, as a button is.
- **Focus:** the edge changes to the ring colour.
- **In the left column:** Find and the field of the repository list stand on the Well Floor, so they read as cut into the chrome.

### Selects and menus

Every dropdown of the shell is one popover from the ui-kit. A select's trigger is a raised key: Card White, a Field Rule edge, `shadow-raised` and 3px corners. It sinks into `shadow-pressed` while its popover is open, and its chevron turns over. The popover stands under its trigger, never over it, in Card White with a Rule edge, 4px corners and `shadow-float`. It fades in and grows from 97 percent, once, from the side of the control that opened it, and it leaves faster than it came. A menu moves the same way. With reduced motion both are there and gone at once. The durations are `popoverIn` and `popoverOut` of `COLUMN_MS`.

A row of a popover is at least 28px high. A tone of the ink marks the row under the pointer or the keys, and a check in Gold Mark marks the chosen one. A group has a heading in Body at weight 500, in sentence case. A choice can carry one line in Body in muted ink under its name, which says what it is for. `Select.Item` takes it as `description`.

### Number badges

A count of the left column stands on a low slab: `Badge` with the `count` variant and the `technical` size. It is 16px high on a front edge 2px thick, with 2px corners and the number in mono, because a small part of the picture is built the same way. The counts of the tabs, the steps of a walkthrough, the checkouts of a repository and the sorted count of a `Measures` row all use it. A number that reads as part of a table, such as the other counts of a `Measures` row, stays bare in its column.

### Navigation

- **Style:** the list lies in a well cut into the chrome, as a container is cut into the picture: the Well Floor, one thin line round it, an inner shadow from the whole of its top edge and a lit lip along its foot. The `column-well` utility holds the recipe. Nothing in the column is divided by a rule. A row is 28px at least, and a board or folder row 36px. Rails and elbows draw its levels. The chosen row is a plate in the Tab Piece tone with `shadow-raised`, and the row of what is open has a front edge in Gold Mark along its foot. It has no bar on its left edge. A repository's row carries the repository mark, or GitHub's mark for a repository on GitHub, which then shows only its owner and name. Every other label that names a repository does the same, and the whole identity shows on hover. A sentence, such as a notice, keeps the whole identity. A link is ink with an underline of Gold Mark.

The left column's tabs stand on the top edge of the well, as a container's name stands on the picture. They are 32px high, in Control and muted ink. The open tab is the Tab Piece raised on that edge, in full ink, with an underline of Gold Mark under its words. Its corners are 5px, and it meets the edge in a concave curve of 8px. The well's top edge runs on under it, so a line parts the tab from the floor. A tab at the well's left end keeps the well's left side, so it has no curve there. On a proposal, `Changes` and the walk share a second row. A pane's own tabs keep their underline of Gold Mark.

`Measures` is a table of every module, the most of one measure first, on the floor of the well. A row is one line of 28px: the name, then seven count columns of 30px, in the order of the sort control. So each count stands in one place on every row, and a row never wraps. The numbers are mono in Technical, right aligned.

A shelf stands over the table while it scrolls, on Tray Chalk with `shadow-edge-down`. It holds the `Sort by` select, one line that says what the chosen measure counts and what it shows, and the head of each column. A head is turned on its side, as the dimension of a drawing is, because seven names do not fit seven narrow columns. The head of the sorted column is in full ink and semibold, with a piece of Gold Mark under it. Its numbers stand on number badges, so the sorted measure and its numbers read as one column.

A bar under the name draws the sorted count of a row, on the scale of the most in the list. It is a slab in the colour of the module's kind, so that the list reads in colour and says what each row is. So the shape of the whole list shows at a glance: one module that stands far out, or a long even run. It draws one count and adds nothing up.

A count of none is in a quieter ink, so what is there stands out. An empty cell is a module with no such measure: a module with no parts has no interface, and a count of none would say something else. Before the history arrives, its two cells stay empty. A module the read skipped takes one dash in each history cell, whose tooltip says why, and a row says all of it to assistive technology. A foot stands under the table on Tray Chalk with `shadow-edge-up`. It says once what the counts cover and why modules were not read, with `Refresh` at its end, or why there are no counts. No count takes a color, nothing combines the counts, and no row carries a rank.

### Right panel

The right panel is a permanent column beside the picture on every Diagram reading, on
Chrome Chalk with a rule down its inner edge and `shadow-edge-side`. With nothing
selected, it says the open module's name and description, or at the roots the model's
name and the summary of its state. A flow reading says the flow. With a selection, it
explains the selected thing, and a click on a card lights the card and fills the panel at
once. A new subject opens at the top of the panel and arrives with a 120ms fade. A row
answers the pointer with a change of tone and nothing else, and a row of a subject on the
picture also lights it. Its actions stand over the legend, so a selection never moves a tag.
Long lists and evidence live on About, which lies over the panel, so the panel keeps its
room and the picture keeps its camera. A pane presented fullscreen has no panel.

With a module expanded into the picture, the panel stays with the module that the reading
opened. An `Expanded` section under `Interface` lists each expanded module, with its count.
A row selects that frame, and a minus at the end of the row collapses it. A line under the
rows says how many modules of the address cannot open here. With a door or an expanded
module selected, an outlined action at the foot expands or collapses it.

Under what it says, the panel lists the flows and the walkthroughs that touch the
selection, or else the open module. At the roots with nothing selected it lists neither.
Each list has a count, four rows and a line that says how many more. A flow's row ends
with its collection and a walkthrough's with its steps, and the flow on screen takes the
tone of a chosen row.

For a module with parts, open or selected, an `Interface` section under its head holds
one quiet line: entries, hidden, callers, `to module` when callers reach the module itself,
and pass-through. Each count selects what it counts on the module's picture, and a count
of none is disabled. `Open in About`, a 24px outlined control in the heading, opens the
Interface section of About. Each count of a module open in the picture selects on this
picture. No count takes a warning color, nothing combines the counts,
and the picture gains no permanent mark. With one module selected, the head of
`Sends to` and the head of `Receives from` each hold a 24px outlined toggle, `Trace onward`
and `Trace back`, with the number of cards it reaches in the mono face. A pressed toggle
takes the primary mark, and the picture grades what it reached, each further hop fainter.

The legend is a tray at the foot of the panel (Tray Chalk and `shadow-edge-up`), and it needs
no click. A long subject and its lists scroll above it, and the whole legend stays on screen.
Only the engine row stands under it, so a selection never moves it. A heading row holds `Legend` and, at the start of the
second column, the key `Filter`. Under it stand the kinds in two columns, a thin rule, the line
types in two columns, a thin rule, and the groups. A row is 24px high, and every mark stands in
a box 22px wide, so the names start on one line. A section with nothing to show is absent.

The rows come from the whole reading, not from what the picture draws now, and each list keeps
the order of the policy. So hiding a kind moves no row, and the legend keeps its height. A line
type that a reader hid stays, dimmed. So does a part kind, a mixed line or a line's mark that
left the picture with it. A chip that the picture does not draw takes the icon that the policy
names. `Filter` is an outline key with a funnel and the count of hidden kinds in mono, and it
grows into the free room of its column. While the switches show it is pressed in, with a gold
mark under its words, as the dock's conversation key is. `Show all` stands at the end of the
row while a kind is hidden. A line type keeps the room of its switch at all times, and a mixed
line has no switch, because it is no kind of relationship.

Under the legend on a structural reading, one row holds `Layout engine` and a switch between
Blocks and Tracks.

A group is a tag with its name inside, and the tags wrap. A tag is one bright piece in
both themes, cut from the dark value of its palette color (`--bright-<name>`): a gradient
from L+.02 C+.02 to L-.06 C+.03, a 1px edge at L-.26 C-.02, ink at oklch(0.2 0.03 H), an
inset top highlight, weight 600 and 5px corners. The `group-tag` utility holds the one
recipe. Its stops stay in OKLCH, because a mix toward a dark color in sRGB turns orange
brown. A tag is a button. It selects what the picture draws of its group, doors included,
through the ordinary selection, and a second press clears it. While the selection is exactly
those parts the tag is on: its gradient turns over, its shadow moves inside and a 2px piece of
Gold Mark stands under it. Under the pointer the tag lights a step. A group whose parts a
filter took off the picture keeps its tag, dimmed and held.

### Change list

A proposal read against its base adds `Changes` to the left column. Its interface changes
stand first, over a thin rule, because an interface change costs every caller. Each module
reads once, as one row: its name, one line for each thing that moved, such as `Callers gained`
with the parts it names, then the counts that differ as before and after, with the numbers in
the mono face. A line names four parts and `+N`, and shows them all on hover. A click selects
the module on the picture that holds it and lights the row, and from About it brings the
picture back. A module that the state lacks says `Not in this state`, and its row selects it
on the drawing of the comparison. These rows wear no standing mark, score or warning color.
With no interface change, one quiet line in place of the rows says so. The change list follows
under the rule, with a section for each owner. `N` and `P` walk only that list.

### Pane sidebar

A retained board recording keeps this sidebar. The sidebar is one panel, 280px wide and held at the pane's edge, on Chrome Chalk
with a rule down its inner edge. It has two tabs and one control, in the pane's
header, that shows and hides it. The control is filled while the sidebar is shown,
its tooltip says what it will do, and it is there in every state of the pane.
Showing the sidebar puts it back where the person had it. A floating panel has a
pin at the end of its tab row, which docks it, and Escape inside it puts it away
and gives the keyboard back to the control. Find sits in the left column, and
Ctrl K takes focus in its field.

The sidebar eases in and out, as the conversation does. A docked column takes its
width over 220ms while the panel, held at its own width, is uncovered under the
edge of the picture, so nothing in it reflows. The picture is fitted again once, at
the end. A floating panel eases in from 2rem to the right of its place and from
nothing over 160ms, and leaves in 110ms. A panel that is pinned is swapped in
place and does not move. A new subject opens at the top of the selection tab and
arrives with a 120ms fade. A row answers the pointer with a change of tone and
nothing else. With reduced motion the sidebar appears and goes at once.

A presented walkthrough steps the sidebar aside, as it does the rest of the pane's
chrome. While it lasts the control is held and says so, and nothing shows or hides
the sidebar. A pick made on the About page lays
no panel over the page, where it would cover the page's controls. Its panel comes
with the diagram.

A walkthrough's row begins with a play mark, never a bare triangle, because a
triangle is the mark of a row that folds open. Narrate is in every walkthrough's
row in every pane, whichever pane is active and whatever voice is doing, so the
row never changes size. While a narration cannot start the control is dimmed and
its tooltip says why.

### About page

The pane's header has two tabs, Diagram and About, and the mark of the open tab is
Gold Mark. The About page lies over the picture on Ground Chalk and scrolls. A band at
its top names what it describes, the open scope or the selected subject, and leads to
the other one. Its column is 1320px wide at most and centred. The column
keeps 40px of room inside each side, or 24px on a page narrower than 1040px.

The head of the page names the board in the Figure role, in capitals. Under the
name, one Control line gives the board's level with its mark. Then it gives the
variant on screen with its lifecycle mark, its name and where it stands in muted
ink. The variant's summary follows in the Reading role, 68 characters wide at most.
40px separate the head from the first section.

The outline is a column 176px wide, 48px to the left of the sections, and it stays
32px below the top of the page while the page scrolls. Each entry is a 32px row
with the section's 16px mark, its name in Control and its count in Technical. The
section being read has full ink and a 2px piece of Gold Mark on its left edge. On a
page narrower than 1040px, the outline is a bar on Ground Chalk at the top of the
page with a Rule under it. There the gold piece lies under the entry, and a bar too
narrow for its entries scrolls sideways. A jump to a section scrolls the page
smoothly, or at once with reduced motion.

A section heading is Subtitle in semibold, and 56px separate one section from the
next. A walkthrough is a Page Card, 24px from the next one. Its head has the name
in the Display role and the number of steps in Body in muted ink. Under them is the
summary in Control at weight 400 in muted ink. At the end of the head are the
outline button Present and the icon button Narrate. Each step is a row under a
Rule, with 16px of padding above and below and 20px at each side. The step's
number is Display in muted ink, right aligned in a column 48px wide. A Rule on its
right sets it as the sheet number of a drawing is set. Its heading is Title, and
its words are Control at weight 400 and 85% ink, 72 characters wide at most. Beside
them, the labels View and Focus are Body in muted ink. A subject is a chip 24px
high on Ground Chalk with a Rule edge and its kind's icon in its kind's colour. A
picked chip takes Gold Tint and a Gold Mark edge.

The parts and the relationships are lists on the page's own plane, not cards.
A Rule divides one row from the next, and the names of the columns stand over the
rows in Body semibold in muted ink. A part's chip is 24px, in its kind's colour at
14% with an edge at 45%. Each step of containment moves a part 20px in, and a rail
in the Rule tone runs down under the middle of its container's chip. A row answers
the pointer with a change of tone and nothing else. A picked row takes Reading Tone
and a 2px piece of Gold Mark on its left edge. A relationship with a picked part at
either end takes Gold Tint. The control at the end of a row is an icon button in
muted ink.

The variants are the navigator's timeline at the page's room: the lanes are 28px
apart. A variant's name is Display, where it stands is Body and its reason is
Control at weight 400 in muted ink. The row of the variant on screen is a plate in
Reading Tone with `shadow-raised` and a 2px piece of Gold Mark on its left edge. The
words On screen stand at the end of that row in accent text.

### Agent dock

The agent dock is a tray at the foot of the navigator. It uses Tray Chalk and
`shadow-edge-up`. While voice is off it is calm. Two raised keys of one height
(32px, 3px corners) stand in a row at its foot: Talk, as wide as the room, and
a key to the conversation, an icon alone. The conversation's key is pressed in,
with a gold mark under it, while the conversation is open, and has a gold dot
while words wait unread. When the agent is on something, its state, what it is
on and its plan stand above the keys. When it is ready and on nothing, the dock
says nothing, because the keys do. While voice is on, the voice circle takes the
head of the dock, with the gold ring and the lines of light, beside the state,
what the agent is on and the voice's own line, and the conversation's key becomes
a quiet icon in the voice line, beside mute and subtitles. That is where voice is
while the person does not want subtitles. While they do, the voice is in the voice
box over the picture (below), and the dock is calm again: the Talk key reads End
voice, with a handset and the gold edge of the circle, and ends voice, and the
voice line, mute and the subtitles control are in the box. In a fullscreen
presentation the dock is off screen, so the box carries the voice there whatever
the person wants.

The two layouts hold the same parts, so nothing is swapped. The Talk key and the
voice circle are one button, and keyboard focus stays on it. When voice starts,
the key's plate narrows to a 64px circle and rises to the head of the dock while
the dock grows and every part glides to its place. The key's edge turns gold as it
narrows, so gold runs unbroken from the key to the ring. The plate passes under the
other parts and holds the orb inside it. It takes half a second, and it runs the
other way when voice ends. A part that was not there fades in once the plate has
passed. The orb is not drawn in the plate: it sits in a socket in it, and flies in
and out. As the circle the plate is the orb's seat, and a seat is drawn only while the
orb is in it. When the orb goes to the voice box the circle does not wait empty: the
seat is gone as the orb lifts, and the key grows out of where it was once the plate
has all but arrived. When the orb comes back from the box nothing waits for it at the
head of the dock, and the circle is there the moment it lands. The reduced-motion
preference cuts between the layouts.

The circle's face is a ring of gold, with a sheen that turns round it, set round
a lens of eleven ruled lines, like the lines of a drafting sheet. While voice is
on its way a spark laps the ring, and the ring draws itself round as it connects.
While the voice listens the lines lie flat and breathe. While the model speaks
every line is a record of the model's output level over the last second. The middle
of a line is now and its edges are the past, so a syllable swells in the middle and
spreads out to both sides as it ages. Each line behind reads a step further back, so
a loud moment rolls back through the sheet, and the lines in front hide the ones
behind. The sheen turns faster the louder it gets, though never as fast as the
spark that says the voice is connecting. A hard onset, and the moment voice
connects, send a ring of light round the circle. Muted, the lines go flat and dim.
The face follows the model's measured output level and nothing else. It never
listens to the microphone.

The tray is lit by what the agent is doing: a warm wash blooms from the voice
circle while voice is on and brightens and fades with the voice, and a quieter
one in the status colour spreads while the agent works. At rest it is plain. Its
lines are all 13px and are told apart by weight and ink: its state at 500 in muted
ink, what it is on at 400. The voice's word is in the accent text while the circle is
lit, which is gold on graphite and ink on chalk (the Ink On Chalk Rule), and in muted
ink while it is muted or ending. The clock is 12px mono.

The composer is in the conversation pane, on a tray at its foot (Tray Chalk and
`shadow-edge-up`), with its gold Send. It grows upward as a message grows, and
takes the room from the conversation.

### Walkthrough box

A presented walkthrough lays one plate over the foot of its pane's picture. The plate is as
wide as the pane less 20px at each side, the margin it keeps at its foot. The camera keeps
the picture clear of all of it, the voice at its foot included, up to half the height of the
pane. The plate is a card in Card White with a Rule edge, 4px corners and the float shadow.
It has 20px of padding and 16px between its rows.

The rail runs along the top of the plate, across its full width. It has one segment for each
step. Each segment is a button, and a tooltip names its step. The segments are 4px high, in
Muted Ink at 70%, which is APCA Lc 60 against the plate on chalk and Lc 31 on graphite, over the floor of Lc 30 for a mark, because they are controls. One piece of
Gold Mark marks the step shown. It is 6px high and as wide as a segment, with a paler wake of
the same gold behind it.

Under the rail, the words stand in a column in the middle of the plate. The column is 64rem
wide at most, and its text is left aligned. It holds the heading of the step (28px) and the
words of the step (16px). Under them is the name of the walkthrough, in muted ink. When
the picture does not draw some subjects of the step, the same line says so after the name.
The line is cut short and never wraps, so the plate keeps its height. The
step's number stands to the left of the column. It is set in the display face at 44px, over a
mono "of N". A rule stands on its right, as it does on the sheet number of a drawing.

The box's three keys stand to the right of the column. They are 32px high: previous, next,
and leave, which says Esc. A key with nowhere to go is dimmed, as previous is on the first
step. It stays a key, so that focus is not left on nothing. A recording draws no keys,
because nobody can press anything in the video.

Under the words, as wide as they are, is the voice pill. It is 78px high and round at both
ends, a field sunk into the plate (the well shadow, on Chrome Chalk). It is there for as long
as the shell has a voice to offer. So the box keeps one height whether the voice is off,
starting, speaking or over, and the picture does not move with it.

While voice is off, the pill holds the key that narrates the walkthrough. The key is a circle
where the orb will be lit, with a microphone in it. Then come "Narrate" and a line of muted
ink that says what it does. While a narration cannot start, the key is dimmed and never taken
out, and the line says why. Pressing the key hands keyboard focus to the pill, because the key
gives way.

While the voice is live and the voice box has it, the pill holds the voice box, and the key
gives way. The orb takes the circle. Then come the words, which take the width that
the orb and the keys leave, or the voice's word. Mute above the subtitles control stands at
the right end, as in the box over the picture. A recording draws the same voice box in the
pill, with the orb, the words or the voice's word, mute and the subtitles control. Its orb
follows the voice that was recorded. Mute and the subtitles control are drawn as the shell
draws them, although nobody can press them in the video.

Every step stands in one cell of the column. So the box is as high as its highest step, and
stepping never changes the room the picture has. A step is handed to the next over 520ms, and
nothing else in the box moves. The step shown leaves first and fast. When the reader steps
on, it leaves to the left. When the reader goes back, it leaves to the right. The number rolls
up or down the same way, like the digit of a flip board.

The next step arrives as the old one goes, its heading and then its words. The gold of the
rail travels to the new step, with its wake behind it. The wake is the one part that ends
later. It sets out 26ms after the gold and takes 676ms, which is 1.3 times the pace, so it
settles about 180ms after the rest. A step chosen out of order is handed over the same way.
The steps that are not shown can be neither reached nor found.

The plate itself arrives once. It rises 10px as it fades in over 220ms, and it leaves at
once. With reduced motion, everything cuts. A recording and the replay of a kept talk cut as
well. A stepped clock draws their frames, and a transition that starts on a frame is drawn a
few milliseconds ahead of that clock. Their picture still glides, because the clock drives it.

### Voice box

While the person wants subtitles and a voice is live, the voice is not in the dock.
It is in a box over the picture of the pane it runs for, low in the frame where the
subtitles are, so the words are read beside the voice that says them. The box is a
capsule in Card White with the float shadow and a Rule edge, 78px high, over the picture
and under nothing, and both its ends are half circles. The left end hugs the orb: the
orb's plate, a 64px circle with the gold edge and the raised face of the dock's circle,
sits in it with the same margin all the way round. Then come the words, and at the right
end the two keys that belong with them: mute above, and the subtitles control below,
which puts the voice back in the dock. They are the dock's keys, outlined and raised, with
a line glyph of one weight. The mute key sinks while the voice is muted. The subtitles key
shows no state, because pressing it acts. They stand 6px in from the capsule's edge, as the
orb does, and 6px from each other, one stack as high as the orb. The stack is a half circle
on its right, round the same middle as the capsule's own end, so each key is a quarter of
it, and the curve follows the capsule's all the way round at the same distance. They are
straight on the side that looks into the box and where the two face each other, with the
corner of a key, 3px, at the two corners that look into the box. Mute is dimmed while the
voice is starting or ending. Where there are no words the box says what
the voice is doing in a word, at 13px, in the accent text while the voice is lit and in
muted ink while it is muted or ending. The words are 20px and two lines at most. A warm
wash blooms from the orb and breathes with the voice, as it does in the dock, on the
box's own layer. The box takes no pointer input from the picture except at its two keys.
It is over the About page as well as the diagram, and it is clear of a sidebar that
floats over the picture. In a pane too narrow for it, the words give way and the orb
and the keys stay. While it leaves it takes no input at all.

The words arrive one at a time, and each fades in over 640ms, slow to start and slow to
arrive, so the end of the line is a soft edge and not a blink. A cue that is full gives
way to the next with its lines fading under the new first word, and a subtitle that has
stopped growing lingers and then fades out over 560ms. Words that had begun to fade out
do not come back under the next ones. The voice's word waits for the words to be gone
before it fades in, and leaves as fast as they return. Only opacity moves.

The orb is one canvas, so it keeps its light and the last second of the voice it
has drawn wherever it is, and it is one shared element: the orb and its plate are one
object, and there is only ever one of it on the page. It rests in the dock's circle or in
the box's socket, and when the person turns subtitles off or on it lifts off from where it
was seen, crosses the page in a layer of its own, a little larger at the top of its flight,
and settles in the circle or the socket in 680ms. The box has no seat of its own and the
dock's is drawn only while the orb is in it, so nothing that looks like the orb waits where
it left or where it will land. A flight carries an orb that can be seen. When voice starts
the orb is dark, so it is lit where it is wanted: with subtitles on it fades in inside the
box as the box rises, and it does not come out of the Talk key. When voice ends it fades
where it is, with the box. The dock's key grows out of the seat the orb has left as the
orb flies out, and the circle forms as the orb arrives, and the box rises and fades in as
the orb is on its way. A flight meets its socket where the socket is, so a socket that is
still moving is met, and the opposite choice turns a flight round from where the orb is.
While a walkthrough is presented the voice box is not over the picture: it is drawn in the
pill at the foot of the walkthrough box (above), the orb flies there from the dock or from the
box over the picture as it does between them, and it flies back when the walkthrough is left.
A fullscreen presentation has no dock to take the voice back, so the box carries the voice
there whatever the person chose, over the picture or in the walkthrough box, and the
subtitles control decides only whether there are words: with none, the box says what the
voice is doing in a word. The presentation's bar holds one key, Talk, which reads End voice
while the voice is live. A recording has no dock either. It draws the voice box at the foot of
its walkthrough box, as a presented pane does, from the first frame that shows the walkthrough
box. The orb is in its socket from that frame and is never flown, and it moves with the level of
the recorded voice on each frame. With reduced motion the orb is in its home, and the box is
there or gone, at once.
Keyboard focus follows the subtitles control to the surface that takes it over.

## Do's and Don'ts

### Do:

- **Do** draw the one primary action of a region with `primary-finish`, and only that one.
- **Do** separate regions with tone steps and elevation tokens before you add a rule.
- **Do** keep shadows warm and offset. Take them from the elevation tokens in app.css.
- **Do** keep the ink on gold at Gold Ink (APCA Lc 66 or more).

### Don't:

- **Do not** put backdrop-filter, filter, blur or a looping animation over the picture viewport.
- **Do not** take a control out of a row when it cannot be used. Dim it and say why in its tooltip, so the row does not move.
- **Do not** paint gold or decoration onto a card in the picture.
- **Do not** use a grey-black blur or a halo without an offset as a shadow.
- **Do not** add a phone or narrow layout.
- **Do not** set a label or a heading in mono.
