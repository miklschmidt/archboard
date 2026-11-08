---
name: archboard
description: The shell of archboard as it stands in code, around a picture the renderer draws.
colors:
  ground-chalk: "oklch(0.99 0.0025 90)"
  ink-graphite: "oklch(0.17 0.006 75)"
  muted-ink: "oklch(0.48 0.008 75)"
  body-ink: "oklch(0.3 0.008 75)"
  chrome-chalk: "oklch(0.973 0.004 88)"
  tray-chalk: "oklch(0.986 0.003 88)"
  reading-tone: "oklch(0.935 0.006 85)"
  well-floor: "oklch(0.95 0.005 85)"
  tab-piece: "oklch(1 0 0)"
  control-face: "oklch(1 0 0)"
  control-face-hover: "oklch(0.978 0.004 88)"
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
    fontSize: "22px"
    fontWeight: 600
    lineHeight: "28px"
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
  section:
    fontFamily: "Archboard Onest, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
  technical:
    fontFamily: "Archboard Maple Mono, ui-monospace, monospace"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: "14px"
rounded:
  chip: "2px"
  control: "4px"
  panel: "6px"
  table: "10px"
  window: "12px"
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
    backgroundColor: "{colors.control-face}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "0 10px"
  button-outline-hover:
    backgroundColor: "{colors.control-face-hover}"
  field:
    backgroundColor: "{colors.well-floor}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.control}"
    height: "32px"
    padding: "4px 10px"
    field-group:
    backgroundColor: "{colors.well-floor}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.control}"
    height: "32px"
  tab-trough:
    backgroundColor: "{colors.well-floor}"
    rounded: "{rounded.panel}"
    padding: "3px"
  tab-chosen:
    backgroundColor: "{colors.control-face}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.control}"
    height: "28px"
    padding: "0 8px"
  nav-row-chosen:
    backgroundColor: "{colors.control-face}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.control}"
    height: "28px"
  column-well:
    backgroundColor: "{colors.well-floor}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.panel}"
  column-section-head:
    backgroundColor: "{colors.well-floor}"
    textColor: "{colors.muted-ink}"
    typography: "{typography.body}"
    height: "28px"
  history-current:
    backgroundColor: "{colors.control-face}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.panel}"
    padding: "12px"
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
  interface-card:
    backgroundColor: "{colors.control-face}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.panel}"
    padding: "16px"
  claim-card:
    backgroundColor: "{colors.chrome-chalk}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.panel}"
    padding: "10px 16px"
  chip-changed:
    backgroundColor: "{colors.changed-orange}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.chip}"
    height: "22px"
    padding: "0 8px"
  selector-tab-chosen:
    backgroundColor: "{colors.control-face}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  measures-table:
    backgroundColor: "{colors.well-floor}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.panel}"
    height: "36px"
    padding: "0 12px"
  warning-card:
    backgroundColor: "{colors.control-face}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.control}"
    padding: "14px"
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
the hue of the gold. Depth comes from planes, not from lines. The chrome is one
flat plane round the picture. It holds the picture on every side and casts no shadow onto
it, and the picture's corners are rounded against it. Controls stand on
the chrome with a highlight on their top edge. Menus and dialogs float above
everything. One warm yellow-gold marks what is chosen. It also marks the one
primary action of a region, and that action is drawn as a physical piece of
gold.

The shell speaks the language of the site's lit table. In its dark theme it
shares the values of the site. In its light theme it translates them to chalk.
A control is a physical key that lifts 1px under the pointer and sinks when it
is pressed. A choice in a trough rises out of it as a raised face with a gold
underline.

**Key Characteristics:**

- The picture is the ground. The shell holds it on every side as one plane, and the picture's corners are rounded against the shell.
- Planes stack under a light from above. Each plane has a tone step, a highlight on its top edge and a warm shadow with an offset.
- Keys are physical. A gold key and a quiet key lift on hover and sink on press, and a chosen tab rises out of its trough.
- One gold has three uses: what is chosen, the one primary action, and the voice and the brand mark. On the picture, the palette's yellow is that gold, on purpose.
- Tall condensed capitals set a name as a title. Plain sans sets every other word. Mono sets technical tokens only.
- The shell is for the desktop only, near full screen at 1920×1080.

## Colors

The neutrals are warm graphite and chalk (hue 75 to 95, at a chroma low enough
to read as grey). One warm yellow-gold sits over them. The dark theme keeps
every role and changes the values. The file theme.css holds both themes.

### Primary

- **Wayfinding Gold** (oklch(0.831 0.134 84.5)): the gold as a flat fill, the gold of a primary button. It fills the voice ring, a status dot, a checked box, the 2px foot of a chosen tab, row or key and, in the dark theme, the selection on the picture.
- **Gold Top and Gold Bottom** (oklch(0.87 0.135 88) to oklch(0.805 0.142 81)): the subtle gradient from top to bottom of a primary action. The dark theme sets the bottom a step darker, at oklch(0.8 0.142 81).
- **Gold Rim** (oklch(0.7 0.125 76), dark oklch(0.58 0.11 74)): the edge of a primary action, one pixel wide.
- **Gold Ink** (oklch(0.2 0.02 70)): text and icons on gold. It keeps APCA Lc 66 or more on every stop of the gradient.
- **Gold Mark** (oklch(0.72 0.15 77), dark oklch(0.86 0.125 86)): the gold as a mark: a ring, an icon or the edge of something chosen, and the underline of a link.
- **Gold Tint** (oklch(0.968 0.03 88), dark oklch(0.29 0.045 80)): a quiet wash behind something chosen on a page.

### Neutral

- **Ground Chalk** (oklch(0.99 0.0025 90), dark oklch(0.2 0.006 75)): the ground of the picture, and of the About page that lies over it.
- **Chrome Chalk** (oklch(0.973 0.004 88), dark oklch(0.165 0.005 75)): the navigator, the pane header and the sidebar.
- **Tray Chalk** (oklch(0.986 0.003 88), dark oklch(0.205 0.007 75)): a tray at the foot of a column, raised over the chrome. The agent dock and the foot of the selection tab use it.
- **Reading Tone** (oklch(0.935 0.006 85), dark oklch(0.255 0.008 78)): the chosen row of a list on the About page.
- **Well Floor** (`--tray-sink`, oklch(0.95 0.005 85), dark oklch(0.14 0.005 75)): the floor of the well that the left column's list lies in, and of the trough that holds tabs or a switch. It is also the floor of a field or a count cell sunk into a surface. It is the floor of a nested container on the picture, so the column and the picture are one material.
- **Tab Piece** (`--tray-tab`, oklch(1 0 0), dark oklch(0.25 0.007 75)): the lighter piece that the picture raises on the edge of a container. The shell does not use it. A chosen tab or row takes Control Face.
- **Slab Face** (`--slab-face`, oklch(0.915 0.005 85), dark oklch(0.31 0.007 75)): the top face of a number badge, on a front edge of `--slab-edge`.
- **Control Face** (`--face`, oklch(1 0 0), dark oklch(0.255 0.008 78)): the face of a quiet key, of a chosen tab or row, and of a card on a panel or a page. **Face Hover** (`--face-hover`, oklch(0.978 0.004 88), dark oklch(0.31 0.007 75)) is the same face of a quiet key under the pointer.
- **Body Ink** (`--body-foreground`, oklch(0.3 0.008 75), dark oklch(0.86 0.008 85)): the ink of prose in a panel, a step under Ink Graphite. The words of an explanation, the reason of a state and the callers of an interface card use it.
- **Card White** (oklch(1 0 0), dark oklch(0.235 0.007 75)): cards, popovers, dialogs and the plate of the voice circle.
- **Ink Graphite** (oklch(0.17 0.006 75), dark oklch(0.955 0.006 90)) and **Muted Ink** (oklch(0.48 0.008 75), dark oklch(0.78 0.008 85)): text.
- **Rule** (oklch(0.905 0.005 85), dark chalk at 9%): the edge of a control or a card, one pixel wide. It also divides regions on one plane. A quiet key and a plate draw it as an inset ring.

### Status

- **Live Lime** (oklch(0.849 0.207 128.8)): live state only. It marks the connection, claims and agent activity.
- **Changed Orange** (oklch(0.631 0.167 48) on chalk, oklch(0.77 0.17 52) on graphite): "changed" in a comparison. It moved off the shared amber because the amber has the hue of the gold.

### Named Rules

**The One Gold Rule.** Gold marks what is chosen, the one primary action of a region, and the voice and the brand mark. Nothing else in the shell is gold. On the picture there is one shared use, on purpose: the color named yellow in a vault's palette is the gold (`--semantic-yellow` is the gold mark, oklch(0.72 0.15 77) on chalk and oklch(0.86 0.125 86) on graphite), so a group, a kind or a relationship colored yellow is drawn in the gold. A yellow group's tab is drawn as a primary action is: the flat gold (`--primary`) with Gold Ink on it. The selection on the picture stays the only gold ring.

**The Ink On Chalk Rule.** Text on chalk is never gold. A gold dark enough to reach APCA Lc 60 on chalk reads as brown. Text stays in the ink, and a gold mark beside or under it carries the accent. On graphite, accent text is the gold itself (oklch(0.86 0.125 86)).

**The Untouched Picture Rule.** The renderer draws the picture. The shell never paints gold, shadow or decoration on a card in it.

**The One Ring Rule.** The gold ring goes round a card, a door, a frame or a relationship's label that is chosen. A line keeps its own ink, and the light says which lines stand.

**The Clear Tip Rule.** A reader rests on a part to read it and to see what it touches. So a tip stands against its part, on the nearest spot that leaves the part and what lights round it in view. On a dense picture it hides dim parts first, and it takes no pointer.

## Typography

**Display Font:** Big Shoulders Display (served as Archboard Display).

**Body Font:** Onest (served as Archboard Onest).

**Label/Mono Font:** Maple Mono NL (served as Archboard Maple Mono), the one mono face of the shell and of every picture.

**Character:** Tall condensed capitals name the thing that a region is about.
A plain, round sans carries every other word. A quiet mono sets identifiers,
paths, versions, counts and times.

### Hierarchy

- **Display** (650, 20px, 24px, 0.07em, capitals): a name set as a title. Examples are a picked part, a variant and a walkthrough. The utility is `title-name`. The model in a pane's breadcrumb is not one: it is Onest (500, 13px) in full ink, as the site sets its nav links, so the display face stays with the wordmark and the titles.
- **Title** (600, 14px, 20px): the titles of regions and dialogs.
- **Nav** (500, 14px, 20px): the name of a model in the navigator.
- **Control** (500, 13px, 18px): buttons, tabs and fields. The words of a button are semibold.
- **Body** (400, 12px, 16px): prose and row labels. A section heading uses it in semibold.
- **Presentation** (600, 22px, 28px): the heading of a presented step.
- **Reading** (400, 16px, 24px): the words of a presented step, in a column 64rem wide at most, the words the voice says, as the site sets a walkthrough's narration, and the summary under a model's name on its About page.
- **Figure** (650, 44px, 44px, display face): the number of a presented step, and a model's name, in capitals, at the head of its About page.
- **Section** (600, 20px, 28px): the heading of a section of the About page.
- **Technical** (400, 11px, 14px, mono): identifiers, paths, versions, counts and times.

### Named Rules

**The Mono Is Data Rule.** Mono sets technical tokens only. It never sets a label or a heading.

## Layout

The shell puts columns around the picture. The left column (280px) lists where to
go, and the agent dock is at its foot. It is a sidebar of the usual width, because History
and Measures open in dialogs of their own and a list needs no more room. The panes are in the centre, one or two side
by side. The conversation opens between the column and the panes: it slides
in and out, and a handle on its edge, a grip on a line that takes the gold while
it is dragged, resizes it between 320px and 720px, or drags it shut below that.
Every Diagram reading of the canonical reader has a right panel beside its picture
(360px, or 46 percent of a narrow pane), in every pane, and the picture fits the room
that it leaves. A selection never refits the picture. A retained legacy board recording keeps a sidebar (280px). Every
column starts with a chrome row (40px), and the left column has Find, the repository switcher and the keys of History and Measures, each 32px high. A pane's header stands
on a whole-pixel grid: 16px lines and icons, 32px crumbs and text trimmed to its
cap height, so its parts sit on one line at any display scale. A row of a list
is at least 28px high. Panels have 16px of padding. The shell has no narrow or
phone layout.

## Elevation & Depth

The system is layered. Planes stack over the picture under a light from above.
Each plane shows its height in three ways. The first is a tone step. The second
is a fine highlight on its top edge. The third is a soft shadow with an offset, tinted toward the warm neutrals: umber on chalk and a warm near-black on graphite. A raised plane keeps a contact line of 1px or 2px under its edge, as the planes of the site do. A trough takes the opposite: an inner shadow under its top edge and a lit line along its foot. The picture is the ground, and only still shadows fall on it. Nothing
over the picture is blurred or filtered, and nothing there loops but the voice
orb, which draws itself on a canvas of its own, because every repaint over the
picture makes it slower to drag. What moves over it moves as a layer of its own,
once: a tip or a menu as it opens, the floating sidebar when it is shown or put
away, the voice box as it comes and goes, and each word of a subtitle as it
arrives. The walkthrough column stands beside the picture, not over it.
The file app.css holds the values for both themes and gives each one a
`shadow-*` utility.

### Shadow Vocabulary

- **well** (`--elevation-well`, an inner shadow with a lit line along the foot): a field sunk into a surface, a trough, a count cell and a pressed key. `--elevation-trough` is the same piece under its other name.
- **sink** (`--elevation-sink`, built from `--slab-shadow` and `--tray-lip`): the well that a column's list lies in. One inner shadow falls from the whole of its top edge, and a lit lip runs along its foot, as on a container of the picture. The `column-well` utility holds the recipe.
- **slab** (`--elevation-slab`, built from `--slab-glint`, `--slab-edge` and `--slab-shadow`): a number that lies on a surface, as a small part of the picture does: a lit top edge, a front edge 2px thick and a short shadow.
- **No edge shadow.** The chrome round the picture, the left column, a pane's header, the right panel and the conversation, is one flat plane. It casts no shadow and draws no line where it meets the picture: the tone step is the edge. The chrome holds the picture on every side: an 8px strip of chrome runs under it, and beside it while the right panel hides. The picture's four corners take the 12px window radius against the chrome, drawn by the `picture-corners` utility. A presented picture fills its pane with square corners. While the picture has keyboard focus, a 2px Ring line runs inside its edge and follows the rounded corners. A tray at the foot of a column is one tone step lighter, with no line and no shadow.
- **raised** (`--elevation-raised`, a white highlight on top, a 1px contact line and a short soft shadow): a quiet key, a key cap, the voice circle and the chosen row of a list.
- **pressed** (`--elevation-pressed`, the same value as well): a raised control while somebody presses it.
- **chosen** (`--elevation-chosen`, raised and a 2px line of Wayfinding Gold inside the foot): the chosen tab of a trough. It is also the chosen row of the tree that is the row of what is open.
- **card** (`--elevation-card`, a highlight on top, a 1px contact shadow and two long soft shadows): a card on a page.
- **float** (`--elevation-float`, the same value as card): menus, tips, lists of matches, the floating sidebar and the voice box.
- **dialog** (`--elevation-dialog`, a highlight on top, the site window's stronger hairline ring inside its edge, a 2px contact line and two very long soft shadows): dialogs. A dialog has no border: the ring is its edge. Its footer is divided from it by a Rule line and has no fill of its own.
- **primary, primary-hover and primary-pressed** (`--elevation-primary*`): the gold finish at rest, under the pointer and pressed. At rest it has a 1px contact line and a glow of 6px offset. Under the pointer the line grows to 2px and the glow to a 12px offset. Pressed, an inner shadow replaces both.

### Utilities of the Lit Table

The file app.css gives the pieces of the site's lit table as utilities. Reach for them before you write a new shadow.

- **quiet-key**: Control Face and Ink with `shadow-raised` and an inset ring of 1px in the Rule tone. Under the pointer it lifts 1px onto Face Hover. Pressed, open or pressed in, it sinks into `shadow-pressed`. It eases over 160ms. `Button` takes it as `outline`, and the trigger of a select takes it too.
- **trough**: a recessed well that holds the choices of a switch or a row of tabs. It is Well Floor with `shadow-trough`, 6px corners, 3px of padding and a 2px gap.
- **chosen-face**: the choice raised out of a trough, in Control Face and full ink with `shadow-chosen`.
- **plate**: a plane in the ground's tone with 6px corners and an inset ring of 1px in the Rule tone. The reply to an explanation lies on one.

### The Picture's Own Depth

The picture has a depth vocabulary of its own, and the renderer draws it. Its
light falls from above. A card is a slab: a lit top face, a front edge along
its foot and a soft shadow below it. A container is a neutral well cut into
the page, its floor only just darker than the page. A reader sees it from below
its foot, so it shows one wall: the top wall, which thins to nothing round both
top corners. A side wall stands edge on, and what shows of it is the soft shadow
its rim leaves on the floor. One inner shadow falls from the whole of its top
edge, stronger than those of the sides, and a lit lip runs along its bottom. Its name stands
on a tab, a lighter piece raised on that edge. The tab's left side is the well's
left side, its top corners have the well's radius, and it meets the edge on the
right in one crisp concave curve. The well's top edge runs on under the tab, so
a line parts the tab from the floor. That edge is the rim of the well: it turns
down at both top corners, and at the left the tab fills the corner
above it. The tab hugs its words with 12 units on
either side, and one outline runs round the tab and the well. The first row of
cards stands as far under the edge as from the sides and the bottom of the well.
In a live reader, a door ends with a plus behind a thin rule, and
the tab of an expanded module ends with a minus in the same place. The piece keeps its
look, and only the control takes a plate under the pointer. An export and a presented
step draw neither control.
No group tints a container, and it wears no tag: its kind shows on its icon chip
alone.
A group shows on each of its cards as a tag at the top right, the same bright
piece as in the Legend, and the cards of a group stand together. No frame is
drawn round a group. A card's face and front edge stay neutral in every group.
A door is a bright button for a module that holds parts, with the finish of a
primary action, in the color of its group, or of its kind when it has no group,
in both themes. A module with no parts stands as its card. A door with
neither color stands in a card's tone and takes no gold, so two doors that share
a color share something real. Its arrow points up, sideways or down by where its
module lies in the tree.
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

**The Still Shadow Rule.** A shadow over the picture is a static box-shadow, and a panel's shadow never changes while the panel moves. No shell layer over the picture viewport uses backdrop-filter, filter or blur, and nothing there loops except the voice orb in the voice box, which is drawn on a canvas of its own and only while voice is on, and the warm wash the box takes from the orb's light, which is a layer of the box and never of the picture. A tip, a menu, the floating sidebar, a presented walkthrough's column or the voice box may ease its own layer's transform and opacity, once, and each word of a subtitle may ease its own opacity, once. A select or a menu takes 160ms to arrive and 110ms to leave. The floating sidebar takes at most 160ms, the column 220ms to arrive and 520ms to hand one step to the next, with the wake on its rail settling by about 700ms, and the voice box 360ms to arrive and 240ms to leave. A box that is wanted again while it leaves turns round from where it is. The orb itself crosses the page when subtitles are turned on or off, when Narrate is pressed and when a voice ends in the box, in a layer of its own, over 680ms.

**The Cursor Says What a Press Does Rule.** Whatever answers a click shows a pointer, in the shell and on the picture. A frame's floor is canvas, so it shows the arrow. Holding Space over the canvas shows an open hand, a press closes it, and a press with Space picks nothing.

**The Picture Answers Rule.** The light belongs to the picture, not to the shell. When a part or several parts are picked out, or the pointer rests on one, the viewer marks what stays as drawn, and the picture's own subjects recede far under an opacity filter, so that what stays is plainly on top. Several picks keep only themselves and the lines between them. The shell lays no layer, blur or halo over the picture to do it.

**The Card Is a Window Rule.** A card that opens a picture is a window onto it. The picture opens when the camera flies into the card, and going back flies out of it. The picture's picture sits inside the card, in the picture's own units, so one camera carries both and the picture that opens stands where the picture in the card stood. The picture blooms out of its middle as the camera flies in, and gathers again on the way back. The shell adds no layer for the flight.

**The Focus Pull Rule.** A move on the canvas is a rack of focus, and the painter draws it as part of the picture. What the reader goes to stays sharp. What they leave falls out of focus and sinks into the ground. A door stays sharp while the picture round it softens a little, and a picture comes into focus from its middle. A picture at rest is never soft, and a shell layer never blurs it. With reduced motion, or on the CPU painter, there is no blur.

**The Depth Rule.** A move between pictures shows where the next picture stands in the module tree. The modules nest, so a deeper picture lies inside this one and a shallower picture lies round it. A move to a picture at the same depth carries the reader sideways along a strip of pictures, in the order of the module tree. A move to a deeper picture zooms into it, and a move to a shallower picture zooms out to it. The camera flies through a card when the picture shows one on the way, and otherwise the two pictures zoom as one. The move never depends on the route: a card, a door, a crumb, the list and Back all take the same way. A view of one picture stays on that picture and has no way through the tree. With reduced motion, every move is a cut.

**The Spark Rule.** A picture's lines are drawn, and they never flash on together. A spark leaves each card that nothing feeds and runs along its lines. Where a spark lands, it runs both ways round the edge of the card and goes out, and the card's own lines start, so the picture builds along the way its parts talk. A label arrives as the spark reaches it. The cards land first, so the picture can be read while the lines run. A move between two pictures does the same for each line that changes its shape: the old line leaves, the cards settle on a clean ground, and a spark draws the new line. A line never swings across the picture, and a line that keeps its shape rides with its cards. A spark takes the line's color toward the text, so it stands out on both grounds. A traffic pulse stays light, because it travels on a line that already stands. With reduced motion, every line is there at once.

**The Planes Not Lines Rule.** Regions read as layered planes. A one-pixel rule stays only where it draws the edge of a control or a card, or where it divides regions on one plane.

**The Lit Plane Rule.** A raised plane carries a lit top edge, a contact line and a soft shadow, or it carries none. A contact line is 1px or 2px. No larger hard offset shadow appears in the shell.

**The Chosen Rises Rule.** In a trough, the chosen choice rises out of it as a Control Face in full ink with `shadow-chosen`. That shadow is the raised one with a 2px underline of Wayfinding Gold inside the foot.

## Shapes

Corners are small and firm, in the ladder of the site, and the shell has no others: Tailwind's
own sizes are cleared, so a corner off the ladder draws nothing. Chips, inline code and the key
combination in a tooltip have 2px corners. Controls, rows, tabs, the item of a menu and the key
cap that hints a shortcut beside a field have 4px corners. Troughs, plates, alerts, a label tip,
a card set in a panel and code blocks have 6px corners. What floats alone has the 10px corners of
the site's cards: a menu, a select's popover, a popover, a tip that explains a part and a notice.
A dialog has the 12px corners of the site's mock window. The voice and the medallion of a part
are circles.

Some forms are capsules, round at both ends. These are the voice box and the
key that narrates, at the foot of a presented walkthrough's column. The segments of the rail and the
gold piece that travels along it are capsules too. Edges are one-pixel rules in the Rule tone. A quiet key and a plate draw theirs as an inset ring of 1px, not as a border.

## Components

### Buttons

- **Shape:** firm corners (4px, and about 3px on the small and icon sizes).
- **Primary:** a physical piece of gold, drawn by the `primary-finish` utility. It has the gradient from Gold Top to Gold Bottom and a Gold Rim edge. It has a highlight on its top edge, a shadow that seats it and Gold Ink text. It is the one primary action of a region: Open <model> at the foot of the selection tab, Send, and the button of a dialog that saves or agrees.
- **Hover and pressed:** hover lifts the gold finish 1px and lengthens its glow. Pressed sinks it 1px, turns the gradient over and moves the shadow inside. Both ease over 160ms.
- **Outline, the quiet key:** Control Face with Ink words, drawn by the `quiet-key` utility. It has `shadow-raised` and an inset ring of 1px in the Rule tone. Hover lifts it 1px onto Face Hover. Pressed or open, it sinks into `shadow-pressed`. Disabled, it loses its shadow.
- **Secondary:** the secondary tone with `shadow-raised`. When pressed, it uses `shadow-pressed`.
- **Ghost:** no fill until hover.

### Cards / Containers

- **Corner Style:** 6px.
- **Background:** Card White.
- **Shadow Strategy:** `shadow-card`. A card holds controls and is not one itself, so it does not rise on hover.
- **Border:** a one-pixel Rule.
- **Internal Padding:** 20px at each side, and 16px to 20px above and below.

### Inputs / Fields

- **Style:** a well, as the site cuts its troughs: the Well Floor with `shadow-well` and no ring, so it reads as cut into its surface. Its edge shows only on focus. An input group is the same well.
- **Size:** 32px high, with 10px of room at each side, as a button is.
- **Focus:** the edge changes to the ring colour.
- **In the left column:** Find and the field of the repository list stand on the Well Floor, so they read as cut into the chrome.

### Selects and menus

Every dropdown of the shell is one popover from the ui-kit. A select's trigger is a quiet key: Control Face, `shadow-raised`, an inset ring of 1px and 4px corners. It sinks into `shadow-pressed` while its popover is open, and its chevron turns over. The popover stands under its trigger, never over it, in Card White with a Rule edge, 10px corners, 6px of padding round its rows, as the site pads
a tray, and `shadow-float`. A row has 4px corners. It fades in and grows from 97 percent, once, from the side of the control that opened it, and it leaves faster than it came. A menu moves the same way. With reduced motion both are there and gone at once. The durations are `popoverIn` and `popoverOut` of `COLUMN_MS`.

A row of a popover is at least 28px high. A tone of the ink marks the row under the pointer or the keys, and a check in Gold Mark marks the chosen one. A group has a heading in Body at weight 500, in sentence case. A choice can carry one line in Body in muted ink under its name, which says what it is for. `Select.Item` takes it as `description`.

### Number badges

A count of the left column stands on a low slab: `Badge` with the `count` variant and the `technical` size. It is 16px high on a front edge 2px thick, with 2px corners and the number in mono, because a small part of the picture is built the same way. On a chosen tab, which is itself a raised face, the count sits in a well cut into the face instead: Tray Sink with `shadow-well`. The badge has no border, so its glint or its lip lies on its edge, and the number stands in the middle of the face below the glint or of the floor above the lip. The counts of the column's section heads, the steps of a walkthrough and the checkouts of a repository all use it. A number that reads as part of a table, such as a count of `Measures`, stays bare in its column.

### Chips

`Badge` has the chips of the site in its `label` size. A chip is 22px high, with 2px corners, 8px of room at each side and Body words.

- **Changed:** a solid chip in Changed Orange, semibold, with white words on chalk and near black on graphite. On the interface cards of About it names the state that the reading is on.
- **Changed tint:** Changed Orange at 14% under Ink, semibold, with an inset ring of 1px in Changed Orange at 50%. It says `Unjoined` in a partner row of the right panel.

The words of a chip keep APCA Lc 60: white on the chalk orange, near black on the graphite one, and Ink on the tint. The orange alone reads only Lc 51 to 56 on the tint.

### Navigation

- **Style:** the list lies in a well cut into the chrome, as a container is cut into the picture: the Well Floor, an inner shadow from the whole of its top edge and a lit lip along its foot. The `column-well` utility holds the recipe. Nothing in the column is divided by a rule. A row is 28px at least, and a model or folder row 36px. Rails and elbows draw its levels. The chosen row rises out of the well as a Control Face with `shadow-raised`, and a row under the pointer takes Control Face at 50%. The row of what is open has a 2px line of Wayfinding Gold inside its foot, and a row that is both takes `shadow-chosen`. It has no bar on its left edge. A repository's row carries the repository mark, or GitHub's mark for a repository on GitHub, which then shows only its owner and name. Every other label that names a repository does the same, and the whole identity shows on hover. A sentence, such as a notice, keeps the whole identity. A link is ink with an underline of Gold Mark.

The left column has no tabs. Two quiet keys stand over the well, side by side and as wide as the room: `History` and `Measures`, each with its icon in muted ink. Each opens its dialog, and stays pressed in while the dialog is open. A migration candidate keeps no record, so it has `Measures` alone. A reading that failed has `History` alone, and no list.

The well holds one list that scrolls, with a section for each thing the model lists: `Modules`, `Flows` and `Walkthroughs`, in that order. A proposal read against its base puts `Changes` first. A section with nothing to list is left out. The head of a section is one row of 28px on the Well Floor: a chevron, the name in Body semibold and muted ink, and the count of the whole model on a count badge at its end. It stays at the top of the well while the rows of its section scroll under it, and the next head pushes it away. A click on the head folds the section, and the chevron turns. What sticks inside a section, the open rows of the tree and the name of a group of flows or changes, sticks under the head (`--stuck-top`). The name of such a group is Body at weight 500 in muted ink on the Well Floor, with no rule round it. A pane's own tabs keep their underline of Wayfinding Gold.

### Content selector

A few large tabs choose what a region shows, as the site's evidence tabs do. They stand in one trough across the region, with 4px between them and 4px of room inside the trough. Each tab has the same width. It holds an icon of 18px and, beside the icon, a label in Title. Under the label, one line in Body and muted ink says what the tab shows. All of it starts at the top left, with 12px of room above and below and 16px at each side. A tab is in muted ink, and under the pointer it takes full ink and Control Face at 50%. The chosen tab rises as a Control Face in full ink with `shadow-chosen`, and its icon takes Gold Mark. The `selector` variant of `Tabs.List` draws all of it.

### Measures

`Measures` is a dialog with the 12px corners of a window. It checks the reading on screen against its code and its history. A content selector stands at its head with three tabs: `Where the map and the code disagree`, `What a module exposes` and `What changes together`. It opens on the first. Each tab reads only while it is open. The dialog keeps its tab and the sort of each table while it is closed.

The two tables follow the site's table. A table lies in a well (the Well Floor with `shadow-well` and 6px corners), and its rows scroll under its head. A row is 36px high, with a rule line at 55% between one row and the next. It holds the chip of the module's kind and the name, then one count in each column. The numbers are mono in Technical, right aligned. `What a module exposes` counts entries, hidden parts, pass-through, callers and the whole module. `What changes together` counts the modules that change with it, those of them that no relationship joins, and the commits.

The head stands over the rows on the Well Floor with a rule under it. A press on the name of a column sorts by it, the most first, and a second press turns the order round. The sorted head is in full ink with a piece of Gold Mark under it and an arrow that says which end comes first. Each cell of the sorted column carries a gold wash from its right edge and a gold edge. The wash is as long as the count against the most in the table, and the edge is as strong. The name of a column says what it counts on hover. Over the table, one line says what the sorted column counts, and `Show` chooses which modules stand in the table.

A row selects its module on its picture, from the pointer or from Enter. The dialog closes first, as Find does, so the keys go on from the picture. The arrows, Home and End walk the rows. The row of the selected module is lit: Control Face with a 2px line of Gold Mark inside its foot. A row under the pointer takes Control Face at 50%.

A count of none is in a quieter ink, so what is there stands out. An empty cell is a module with no such measure: a module with no parts has no interface, and a count of none says something else. A module that the history read skipped takes one dash in each history cell, whose tooltip says why. A row says all of it to assistive technology. A line under the table says what a dash and a blank mean. Under the history, it also says what the read covers and why modules were not read, with `Refresh` at its end. No count takes a warning color, nothing combines the counts, and no row carries a rank.

### Warning card

`Where the map and the code disagree` shows the findings of the last code check, the warnings first. When the view opens on a reading that no remembered pass read, it starts one pass and says `Checking this reading against its code…` on the Well Floor until the pass ends. A pass that fails says why, with a quiet `Try again` key.

The head of the view holds the count of warnings, when the check ran and a switch of two layouts, `Cards` and `List`. The browser remembers the layout, and it starts with `Cards`. In `Cards`, every finding is a card with its source beside it, one under the other, in a column that scrolls. A source is read when its card comes near the screen. A small quiet key at the top right of a card selects the subject of its finding on the picture, and the key keeps the focus. In `List`, a plate holds a row for each finding, and the card and the source of the chosen finding stand beside it. A row says the finding's name, what it is about and the first line of its words. The chosen row is raised out of the plate. The arrows, Home and End walk the rows, a row selects the subject of its finding on the picture, and the row keeps the focus.

The card is a Control Face with `shadow-raised`, 4px corners and an inset ring of 1px. The ring is Changed Orange at 45% for a warning and the Rule tone for information. The card holds these, from the top:

- a chip that names the finding: solid Changed for a warning, Changed tint for information
- the route in Title, from one module to the other with an arrow between them, or the one module that the finding is about
- the check's own words in Body Ink
- how strong each piece of evidence is: `Resolved by analysis` with a check in Added Green, or `Matched by name only` with a question mark in muted ink

With several pieces of evidence, each piece is a key that shows its file and line, and it chooses the source beside the card.

Beside the plate, the source of the evidence stands on the Well Floor with 6px corners and an inset ring of 1px. Its caption holds the path in mono and the kind of evidence. Under it stand the evidence line and up to three lines on each side of it, in mono with their numbers in muted ink. The code takes the colours of its language once its grammar loads: keywords violet, strings emerald, constants orange, functions blue, parameters rose, comments and punctuation muted. Each is the palette colour mixed a quarter of the way to the foreground, so it reads on the Well Floor of either theme. The evidence line takes Changed Orange at 16% with a 2px edge of Changed Orange at its start. A finding with no evidence says that it names no line. While the lines load, the well says `Reading the source…`. If the server has no lines or fails, the well says `Source unavailable.` and the card stays complete.

### Right panel

The right panel is a permanent column beside the picture on every Diagram reading, on
Chrome Chalk, on the chrome's plane, with no line or shadow on its inner edge. With nothing
selected, it says the open module's name and description, or at the roots the model's
name and the summary of its state. A flow reading says the flow. With a selection, it
explains the selected thing, and a click on a card lights the card and fills the panel at
once. A new subject opens at the top of the panel and arrives with a 120ms fade. A row of a list is a plate in the ground's tone on the panel. Under the pointer it takes Control Face and nothing else changes. The row on screen, or the row that is pressed, rises as a Control Face with `shadow-raised`. A row of a subject on the picture also lights it. Its actions stand over the legend, so a selection never moves a tag.
Long lists and evidence live on About, which lies over the panel, so the panel keeps its
room and the picture keeps its camera. A pane presented fullscreen has no panel.

The panel heads a module as the site's mock panel does: the chip of its kind, with the icon the picture draws it with, then its name in the display face, and its kind and code path under the name. A subject with no kind, such as a flow or a connection, has only its name. A section of the panel opens with its title in Body semibold and full ink. Its count stands beside the title in mono and muted ink. Eight pixels part the title from its rows, and 2px part one row from the next.

With a module expanded into the picture, the panel stays with the module that the reading
opened. An `Expanded` section under `Interface` lists each expanded module, with its count.
A row selects that frame, and a minus at the end of the row collapses it. A line under the
rows says how many modules of the address cannot open here. With a door or an expanded
module selected, a quiet key at the foot expands or collapses it.

Under what it says, the panel lists the flows and the walkthroughs that touch the
selection, or else the open module. At the roots with nothing selected it lists neither.
Each list has a count, four rows and a line that says how many more. A flow's row ends
with its collection and a walkthrough's with its steps, and the flow on screen takes the
tone of a chosen row.

A module with parts, open or selected, has an `Interface` section under its head. It holds the counts of entries, callers, `To module` and pass-through. `To module` counts the callers that reach the module itself. An `Implementation` section holds the hidden parts. A count is a cell sunk into the panel: the Well Floor with `shadow-well` and 4px corners. Its name stands at the start in muted ink, and its number in the mono face stands at the end. Two cells share a row.

Each count selects what it counts on the module's picture, and a count of none is disabled. `Open in About`, a 24px quiet key in the heading, opens the Interface section of About. Each count of a module open in the picture selects on this picture. No count takes a warning color, nothing combines the counts, and the picture gains no permanent mark.

With one module selected, the head of `Sends to` and the head of `Receives from` each hold a 24px outlined toggle, `Trace onward` and `Trace back`, with the number of cards it reaches in the mono face. A pressed toggle takes the primary mark, and the picture grades what it reached, each further hop fainter.

A module with code history has a `Changes with` section. It lists the modules whose code changes in the same commits as its own, the strongest first. A row names the partner. Under the name, one line holds a short mark that joins the pair. An `Unjoined` tint chip follows it when no relationship joins them. The commits that they share stand next in mono, and the degree stands at the end in full ink. The mark is a solid line in muted ink for a joined pair and a dashed line in Changed Orange for an unjoined one. A meter of 2px runs along the foot of the row, as long as the degree. It fades from clear to Gold Mark for a joined pair and to Changed Orange for an unjoined one.

The legend is a tray at the foot of the panel (Tray Chalk, with no line over it), and it needs
no click. A long subject and its lists scroll above it, and the whole legend stays on screen.
Nothing stands under it, so a selection never moves it. A heading row holds `Legend` and, at the start of the
second column, the key `Filter`. Under it stand the kinds in two columns, the line types in two
columns and the groups, with 12px between them and no rule. A row is 24px high, and every mark stands in
a box 22px wide, so the names start on one line. A section with nothing to show is absent.

The rows come from the whole reading, not from what the picture draws now, and each list keeps
the order of the policy. So hiding a kind moves no row, and the legend keeps its height. A line
type that a reader hid stays, dimmed. So does a part kind, a mixed line or a line's mark that
left the picture with it. A chip that the picture does not draw takes the icon that the policy
names. `Filter` is a quiet key with a funnel and the count of hidden kinds in mono, and it
grows into the free room of its column. While the switches show it is pressed in. `Show all` stands at the end of the
row while a kind is hidden. A line type keeps the room of its switch at all times, and a mixed
line has no switch, because it is no kind of relationship.

Under the legend on a structural reading, one row holds `Layout engine` and a switch between Blocks and Tracks. The switch is a trough, and the engine in use rises out of it as a raised face.

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

A proposal read against its base puts a `Changes` section at the top of the left column's list. Its interface changes
stand first, over a thin rule, because an interface change costs every caller. Each module
reads once, as one row: its name, one line for each thing that moved, such as `Callers gained`
with the parts it names, then the counts that differ as before and after, with the numbers in
the mono face. A line names four parts and `+N`, and shows them all on hover. A click selects
the module on the picture that holds it and lights the row, and from About it brings the
picture back. A module that the state lacks says `Not in this state`, and its row selects it
on the drawing of the comparison. These rows wear no standing mark, score or warning color.
With no interface change, one quiet line in place of the rows says so. The change list follows
under the rule, with a section for each owner. `N` and `P` walk only that list.

### Settings dialog

The gear in the header opens `Settings`, a dialog 720px wide at most. It stands 8% of the window from the top, so the tabs stay in place when a tab of another height opens. A content selector at its head holds two tabs. `Picture` holds the settings of this browser for every picture: the layout engine and whether a part under the pointer dims the rest. Each is a row with its name, one line of Body in muted ink that says what it does, and a switch at the end. `Code opener` holds the editor that opens a module's code on this machine. A tab taller than the window scrolls under the tabs, and the footer of the opener, with `Reset`, `Test`, `Close` and `Save`, stays at the foot of the dialog. A notice about the opener opens the dialog on `Code opener`.

### History dialog

`History` opens a dialog, 768px wide at most, from its key in the left column or from the state chip of a pane's header. It is drawn after the site's history. Its rows are read while it is open. A choice of a state, of a saved reading or of `Compare` closes the dialog and reads that choice in the pane.

The current state stands first, on a card: a Control Face with 6px corners, 12px of padding, `shadow-raised` and a ring of Gold Mark at 35%. Every other state stands under it as a node on one rail: the proposals, then the states that were current, then the shelved ones. The rail is a 2px line in the Rule tone, from the first node to the last.

A node is the node that the About page draws. The current state is solid Gold Mark with a halo of the same gold at 18%. A proposal is a ring in Changed Orange. A state that was current is a ring in muted ink, and a shelved state is a fainter ring. A hollow node takes the floor that it lies on.

The first line of a state holds the lifecycle word in Body semibold, the state's name in Title and the date at the end in mono. The word is Proposal, Current, Earlier or Shelved, and Unavailable when the record cannot name the state. It is accent text for the current state and muted ink for the others. Under the first line, Control at weight 400 in Body Ink says why the state came to stand there, or what a proposal does. A shelved state says it in muted ink. What tells a draft from the drafts that share its name follows in mono. The state that the pane reads says `On screen` in accent text after its name, and a state on the rail then rises as a Control Face with `shadow-raised`. A state under the pointer takes Control Face at 50%.

A state that saved readings has a quiet chip under its words: a chevron, how many and when the last one was saved, in mono on Tray Sink with `shadow-well`. The chip folds them. A saved reading is a row of its time in mono and what was being done in muted ink, and `Compare` stands at its end as an extra-small quiet key. The reading on screen says `On screen` there, and the base of the comparison says `Compared`.

### Claim card

A current reading shows each claim as a card across the top of its pane. The card is Chrome Chalk with 6px corners and a ring of 1px in Live Lime at 40%. It stands on the ground with 12px of room at the top and at each side.

The head of the card holds a live dot, `Claimed` in Control semibold and the time that the claim began in mono. The dot is 6px in Live Lime with a halo of the same colour at 25%. Next, three terms, State, Doing and Subjects, stand in muted ink with their words in full ink, cut short. At the end is `Take back control`, the one primary action of the card, in the gold finish. A refusal shows its words in the destructive colour before the key.

### Explanation reply

An explanation of the selection stands at the foot of its pane. The foot is Chrome Chalk with 12px of padding and 20rem of height at most. The reply lies on a plate inside it.

The head of the plate is 40px high. It holds the status of Codex in Body semibold, with the OpenAI mark in Gold Mark before it. The status is accent text, which is gold on graphite and Ink on chalk. After the status come what the answer is about, in muted ink and cut short, and the retry and cancel keys when they apply. A ghost key closes the reply. The words are Body in Body Ink, 48rem wide at most, and they scroll under the head.

### Pane sidebar

A retained legacy board recording keeps this sidebar. The sidebar is one panel, 280px wide and held at the pane's edge, on Chrome Chalk
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

The head of the page names the model in the Figure role, in capitals. Under the
name, one Control line gives the model's level with its mark. Then it gives the
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
summary in Control at weight 400 in muted ink. At the end of the head are the quiet key Present and the icon button Narrate. Each step is a row under a
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

The states are a timeline at the page's room: the lanes are 28px apart. Each state has a node of 12px on its lane, drawn as the history of the site draws it. The current state is solid Gold Mark with a soft halo. A proposal is a ring in Changed Orange. A state that was current is a ring in muted ink, and a shelved state is a fainter ring. A state's summary, or its name when it has none, is Title. Where it stands is Body, and its reason is Control at weight 400 in muted ink. The state on screen rises as a card: a Control Face with 6px corners, `shadow-raised` and a ring of Gold Mark at 35%. The words On screen stand at the end of its first line in accent text.

A module whose interface changed in a comparison opens the Interface section with two cards side by side, the base first. A card is a Control Face with 6px corners, 16px of padding and 12px between its parts. It has `shadow-raised` and an inset ring of 1px in the Rule tone. The card of the state that the reading is on wears a ring of Changed Orange at 45% in place of the Rule ring. Its head names the module in the Display role. A chip at the end says where the state stands: Proposal, Current, Earlier, Shelved, or This reading for a model with no states. The state read has the solid Changed chip, and the other has an outline chip. The state's name stands under the head in Body and muted ink.

Three Well Floor cells, Entries, Hidden and Callers, hold the counts in the mono face at 18px under their names in Body and muted ink. Under them, the entry points of the state are rows in the ground's tone with a filled 8px mark. A part that is hidden here but an entry point on the other side is a row outlined by a ring of 1px, with a hollow mark in muted ink. The ring is Changed Orange at 50% on the card of the state read, and the Rule tone on the other. A last line names the callers that only this state has. A state with no parts says so in one line.

### Agent dock

The agent dock is a tray at the foot of the navigator. It uses Tray Chalk, with no
line over it. While voice is off it is calm. Two quiet keys of one height (32px, 4px corners) stand in a row at its foot: Talk, as wide as the room, and
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

The composer is in the conversation pane, on a tray at its foot (Tray Chalk, with no
line over it), with its gold Send. It grows upward as a message grows, and
takes the room from the conversation.

### Walkthrough box

A presented walkthrough stands in a column beside its pane's picture, as the site's walkthrough
player sets it. The column stands where the right panel stands while nothing is presented, and
the sidebar steps aside for it. It is 400px wide, or 46% of the pane when that is less. It is
the panel's Chrome Chalk with a Rule edge on its left and the side shadow of the right panel. It
has 20px of padding and 20px between its parts. The picture is as wide as the column leaves it,
so the camera fits each step to all of the picture and keeps nothing clear.

The rail runs along the top of the column, across its full width. It has one segment for each
step. Each segment is a button, and a tooltip names its step. The segments are 4px high. The
segments before the step shown are Gold Mark, so the rail fills up to the step shown, as on the
site's player. The segments after it are Muted Ink at 70%, which is APCA Lc 56 against the
column on chalk and Lc 37 on graphite, over the floor of Lc 30 for a mark, because they are
controls. One piece of Gold Mark marks the step shown. It is 6px high and as wide as a segment,
with a paler wake of the same gold behind it.

Under the rail stands the step's number, set in the display face at 44px over a mono "of N",
with a rule on its right, as on the sheet number of a drawing. Beside it are the heading of the
step (22px, as the site's player sets it) and the words of the step (16px). Under them is the
name of the walkthrough, in muted ink. When the picture does not draw some subjects of the step,
the same line says so after the name, and the name then keeps half of the line. The line is cut
short and never wraps.

The key that narrates the walkthrough stands at the foot of the column, as wide as the column.
It is a pill, 76px high and round at both ends, a well sunk into the column (the well shadow, on
the Well Floor). It is there for as long as the shell has a voice to offer. At its start is a
circle in the gold finish of the primary action, with a microphone in it. The circle is a home
of the voice orb (Voice box, below). While voice is off the dark orb waits in it, and the gold
circle is drawn only while the orb is there. The circle lifts 1px when the key is hovered and
sinks 1px when it is pressed, as the gold button does. Then come "Narrate" and a line of muted
ink that says what it does. Pressing the key sends the orb out of the circle into the voice box
over the picture. While the orb is away, the key keeps the round room it had, and the room is
empty. While the orb is in the voice box, the key is the red hang-up key: a red disc with a
white handset grows into the empty seat as the orb leaves it, and the words say "Hang up" and
"End the voice." Pressing it ends the voice. As the voice ends, the disc shrinks away and the
words change back before the orb lands in the seat. While a narration cannot start otherwise, as
while the voice is in the dock, the key's words are dimmed and the line says why. The key is
never taken out. The voice itself is not in the column: the voice
box stays low over the picture.

Under the key on the right stand the column's three keys. They are quiet keys, 32px high:
previous, next, and leave, which says Esc. A key with nowhere to go is dimmed, as previous is on
the first step. It stays a key, so that focus is not left on nothing. A recording draws no keys,
because nobody can press anything in the video.

Every step stands in one cell. So the cell is as high as its highest step, and stepping never
moves the foot of the column. A step is handed to the next over 520ms, and nothing else in the
column moves. The step shown leaves first and fast. When the reader steps on, it leaves to the
left. When the reader goes back, it leaves to the right. The number rolls up or down the same
way, like the digit of a flip board.

The next step arrives as the old one goes, its heading and then its words. The gold of the
rail travels to the new step, with its wake behind it. The wake is the one part that ends
later. It sets out 26ms after the gold and takes 676ms, which is 1.3 times the pace, so it
settles about 180ms after the rest. A step chosen out of order is handed over the same way.
The steps that are not shown can be neither reached nor found.

The words of the column arrive once. They move 12px in from the side as they fade in over
220ms, and they leave at once. With reduced motion, everything cuts. A recording and the replay
of a kept talk cut as well. A stepped clock draws their frames, and a transition that starts on
a frame is drawn a few milliseconds ahead of that clock. Their picture still glides, because the
clock drives it.

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
straight on the side that looks into the box and where the two face each other, with the corner of a key, 4px, at the two corners that look into the box. Mute is dimmed while the
voice is starting or ending. Where there are no words the box says what
the voice is doing in a word, at 13px, in the accent text while the voice is lit and in
muted ink while it is muted or ending. The words are 16px on a 24px line, in Body Ink, as the
site sets the narration of its walkthrough player, and two lines at most. A warm
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
object, and there is only ever one of it on the page. It rests in the dock's circle, in
the box's socket, or in the gold circle of a presented walkthrough's Narrate key. When the
person turns subtitles off or on it lifts off from where it was seen, crosses the page in a
layer of its own, a little larger at the top of its flight, and settles in the circle or the
socket in 680ms. The box has no seat of its own. The dock's seat and the Narrate key's gold
circle are drawn only while the orb is in them, so nothing that looks like the orb waits where
it left or where it will land. A flight carries an orb that can be seen. When voice starts
the orb is dark, so it is lit where it is wanted: with subtitles on it fades in inside the
box as the box rises, and it does not come out of the Talk key. Narrate is the one exception.
While voice is off and a Narrate key is on the page, the dark orb waits in the key's gold
circle. Pressing Narrate lights the orb at the start of its flight: it fades in over the gold
circle as the circle goes, and it flies to the box, or to the dock while subtitles are off.
When voice ends the orb fades where it is, with the box. Once it is out of sight it waits in
a Narrate key, when one is on the page. A voice that ends in the box while a Narrate key is on
the page sends the orb home instead. It flies out of the box while the box is still up, lands
in the key's circle and fades there, so the gold circle and its microphone come back. The
dock's key grows out of the seat the orb has left as the orb flies out, and the circle forms as
the orb arrives, and the box rises and fades in as the orb is on its way. A flight meets its
socket where the socket is, so a socket that is still moving is met, and the opposite choice
turns a flight round from where the orb is.
While a walkthrough is presented the voice box stays where it is, low over the picture and in
the middle of it, because the steps stand in the column beside the picture. A fullscreen
presentation has no dock to take the voice back, so the box carries the voice there whatever
the person chose, and the subtitles control decides only whether there are words: with none,
the box says what the voice is doing in a word. The presentation's bar holds one key, Talk,
which reads End voice while the voice is live. A recording has no dock either. It draws the
voice box over its picture, as a presented pane does, from the first frame that shows the
walkthrough. The orb is in its socket from that frame and is never flown, and it moves with the
level of the recorded voice on each frame. With reduced motion the orb is in its home at once,
and the box is there or gone at once. When either end of a flight is not on screen, the orb is
put in its home at once in the same way.
Keyboard focus follows the subtitles control to the surface that takes it over.

## Do's and Don'ts

### Do:

- **Do** draw the one primary action of a region with `primary-finish`, and only that one.
- **Do** separate regions with tone steps and elevation tokens before you add a rule.
- **Do** keep shadows warm and offset. Take them from the elevation tokens in app.css.
- **Do** reach for `quiet-key`, `trough`, `chosen-face` and `plate` before you write a new shadow.
- **Do** keep the ink on gold at Gold Ink (APCA Lc 66 or more).

### Don't:

- **Do not** put a shell layer with backdrop-filter, filter, blur or a looping animation over the picture viewport. The painter's focus is the picture's own, and it ends with the move.
- **Do not** take a control out of a row when it cannot be used. Dim it and say why in its tooltip, so the row does not move.
- **Do not** paint gold or decoration onto a card in the picture.
- **Do not** use a grey-black blur or a halo without an offset as a shadow.
- **Do not** add a phone or narrow layout.
- **Do not** set a label or a heading in mono.
