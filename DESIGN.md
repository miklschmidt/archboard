---
name: archboard
description: The redesigned shell (branch prototype/shell-worlds), around a picture the renderer draws.
colors:
  ground-chalk: "oklch(0.99 0.0025 90)"
  ink-graphite: "oklch(0.17 0.006 75)"
  muted-ink: "oklch(0.48 0.008 75)"
  chrome-chalk: "oklch(0.973 0.004 88)"
  tray-chalk: "oklch(0.986 0.003 88)"
  reading-tone: "oklch(0.935 0.006 85)"
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
  changed-orange: "oklch(0.69 0.19 48)"
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
  technical:
    fontFamily: "Archboard DM Mono, ui-monospace, monospace"
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
    backgroundColor: "{colors.ground-chalk}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.control}"
    height: "36px"
  nav-row-chosen:
    backgroundColor: "{colors.reading-tone}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.control}"
    height: "{spacing.row}"
  page-card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink-graphite}"
    rounded: "{rounded.panel}"
    padding: "12px"
---

# Design System: archboard

This file records the shell of the prototype branch `prototype/shell-worlds` as
it stands in code. Two files are normative: `src/ui/theme/palette.css` holds
the colours and the elevation of both themes, and `src/ui/theme/app.css` holds
type, space, shape, the shadow utilities and the gold finish. If this file and
those files disagree, those files win and this file is stale.

## Overview

**Creative North Star: "The Lit Drafting Table"**

The picture is a drawing that lies flat on a table. The shell is the furniture
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
- One gold has three uses: what is chosen, the one primary action, and the voice and the brand mark.
- Tall condensed capitals set a name as a title. Plain sans sets every other word. Mono sets technical tokens only.
- The shell is for the desktop only, near full screen at 1920×1080.

## Colors

The neutrals are warm graphite and chalk (hue 75 to 95, at a chroma low enough
to read as grey). One warm yellow-gold sits over them. The dark theme keeps
every role and changes the values. The file palette.css holds both themes.

### Primary

- **Wayfinding Gold** (oklch(0.831 0.134 84.5)): the gold as a flat fill. It fills the voice ring, a status dot, a checked box and, in the dark theme, the selection on the picture.
- **Gold Top and Gold Bottom** (oklch(0.87 0.135 88) to oklch(0.805 0.142 81)): the subtle gradient from top to bottom of a primary action. Both themes use the same values.
- **Gold Rim** (oklch(0.7 0.125 76), dark oklch(0.58 0.11 74)): the edge of a primary action, one pixel wide.
- **Gold Ink** (oklch(0.2 0.02 70)): text and icons on gold. It has a contrast of at least 8.5:1 on every stop of the gradient.
- **Gold Mark** (oklch(0.72 0.15 77), dark oklch(0.86 0.125 86)): the gold as a mark: a 2px bar or underline, a ring, an icon or the edge of something chosen. It lights the way to the chosen row, the active tab and the underline of a link.
- **Gold Tint** (oklch(0.968 0.03 88), dark oklch(0.29 0.045 80)): a quiet wash behind something chosen on a page.

### Neutral

- **Ground Chalk** (oklch(0.99 0.0025 90), dark oklch(0.2 0.006 75)): the ground of the picture, and of the pages that replace it.
- **Chrome Chalk** (oklch(0.973 0.004 88), dark oklch(0.165 0.005 75)): the navigator, the pane header and the sidebar.
- **Tray Chalk** (oklch(0.986 0.003 88), dark oklch(0.205 0.007 75)): a tray at the foot of a column, raised over the chrome. The agent dock and Go deeper use it.
- **Reading Tone** (oklch(0.935 0.006 85), dark oklch(0.255 0.008 78)): the chosen row of a list, raised as a plate.
- **Card White** (oklch(1 0 0), dark oklch(0.235 0.007 75)): cards, popovers, dialogs and raised controls.
- **Ink Graphite** (oklch(0.17 0.006 75), dark oklch(0.955 0.006 90)) and **Muted Ink** (oklch(0.48 0.008 75), dark oklch(0.72 0.01 80)): text.
- **Rule** (oklch(0.905 0.005 85), dark chalk at 9%): the edge of a control or a card, one pixel wide. It also divides regions on one plane.

### Status

- **Live Lime** (oklch(0.849 0.207 128.8)): live state only. It marks the connection, claims and agent activity.
- **Changed Orange** (oklch(0.69 0.19 48)): "changed" in a comparison. It moved off the shared amber because the amber has the hue of the gold.

### Named Rules

**The One Gold Rule.** Gold marks what is chosen, the one primary action of a region, and the voice and the brand mark. Nothing else is gold.

**The Ink On Chalk Rule.** Text on chalk is never gold. A gold dark enough to clear 4.5:1 on chalk reads as brown. Text stays in the ink, and a gold mark beside or under it carries the accent. On graphite, accent text is the gold itself (oklch(0.86 0.125 86)).

**The Untouched Picture Rule.** The renderer draws the picture. The shell never paints gold, shadow or decoration on a card in it.

## Typography

**Display Font:** Big Shoulders Display (served as Archboard Display).

**Body Font:** Onest (served as Archboard Onest).

**Label/Mono Font:** DM Mono (served as Archboard DM Mono).

**Character:** Tall condensed capitals name the thing that a region is about.
A plain, round sans carries every other word. A quiet mono sets identifiers,
paths, versions, counts and times.

### Hierarchy

- **Display** (650, 20px, 24px, 0.07em, capitals): a name set as a title. Examples are a picked part, a variant and a walkthrough. The utility is `title-name`. The board in a pane's breadcrumb is not one: it is Onest (650, 13px) in full ink, so the display face stays with the wordmark and the titles.
- **Title** (600, 14px, 20px): the titles of regions and dialogs.
- **Nav** (500, 14px, 20px): the name of a board in the navigator.
- **Control** (500, 13px, 18px): buttons, tabs and fields.
- **Body** (400, 12px, 16px): prose and row labels. A section heading uses it in semibold.
- **Technical** (400, 11px, 14px, mono): identifiers, paths, versions, counts and times.

### Named Rules

**The Mono Is Data Rule.** Mono sets technical tokens only. It never sets a label or a heading.

## Layout

The shell puts columns around the picture. The navigator (320px) is on the
left, and the agent dock is at its foot. The panes are in the centre, one or
two side by side. The conversation opens between the navigator and the panes:
it slides in and out, and a handle on its edge, a grip on a line that takes the
gold while it is dragged, resizes it between 320px and 720px, or drags it shut
below that. Each pane has a sidebar (280px) on the right. The sidebar is
docked, or it floats over the edge of the picture. Every column starts with a
chrome row (40px) and then a band (36px) for the find fields and the tabs of
the sidebar. A pane's header stands on a whole-pixel grid: 16px lines and
icons, 32px crumbs and text trimmed to its cap height, so its parts sit on one
line at any display scale. A row of a list is at least 28px high. Panels have
16px of padding. The shell has no narrow or phone layout.

## Elevation & Depth

The system is layered. Planes stack over the picture under a light from above.
Each plane shows its height in three ways. The first is a tone step. The second
is a fine highlight on its top edge. The third is a soft shadow with an offset,
tinted toward the warm neutrals: umber on chalk and a warm near-black on
graphite. The picture is the ground, and only still shadows fall on it. Nothing
over the picture is blurred, filtered or animated, because every repaint over
the picture makes it slower to drag. The file palette.css holds the values for
both themes. The file app.css gives each one a `shadow-*` utility.

### Shadow Vocabulary

- **well** (`--elevation-well`, an inner shadow of 1px offset and 2px blur): a field sunk into a surface, such as an input or the composer.
- **edge-down, edge-side and edge-up** (`--elevation-edge-*`, a 1px contact shadow and a soft shadow with an 8px offset): the chrome casts these onto what is under it or beside it. A tray casts edge-up over the list that scrolls under it.
- **raised** (`--elevation-raised`, a white highlight on top and a 1px seat): a control, a key cap, the voice circle and the chosen row of a list.
- **pressed** (`--elevation-pressed`, an inner shadow): a raised control while somebody presses it.
- **card** (`--elevation-card`): a card on a page.
- **float** (`--elevation-float`, three layers): menus, tips, lists of matches and the floating sidebar.
- **dialog** (`--elevation-dialog`, three layers): dialogs.
- **primary and primary-pressed** (`--elevation-primary*`): the gold finish at rest and pressed.

### Named Rules

**The Still Shadow Rule.** A shadow over the picture is a static box-shadow. Nothing over the picture viewport uses backdrop-filter, filter, blur or animation.

**The Picture Answers Rule.** The light belongs to the picture, not to the shell. When a part is picked out or the pointer rests on one, the viewer marks what stays as drawn, and the picture's own subjects recede under an opacity filter. The shell lays no layer, blur or halo over the picture to do it.

**The Card Is a Window Rule.** A card that opens a board is a window onto it. The board opens when the camera flies into the card, and going back flies out of it. The board's picture sits inside the card, in the picture's own units, so one camera carries both and the board that opens stands where the board in the card stood. The shell adds no layer for the flight.

**The Planes Not Lines Rule.** Regions read as layered planes. A one-pixel rule stays only where it draws the edge of a control or a card, or where it divides regions on one plane.

## Shapes

Corners are small and firm. Chips and key caps have 2px corners. Controls and
rows have 3px corners. Cards, menus and dialogs have 4px corners. The voice and
the medallion of a part are circles. Edges are one-pixel rules in the Rule
tone.

## Components

### Buttons

- **Shape:** firm corners (3px to about 4.8px).
- **Primary:** a physical piece of gold, drawn by the `primary-finish` utility. It has the gradient from Gold Top to Gold Bottom and a Gold Rim edge. It has a highlight on its top edge, a shadow that seats it and Gold Ink text. It is the one primary action of a region: Open <board> under Go deeper, Send, and the button of a dialog that saves or agrees.
- **Hover and pressed:** hover makes the gradient brighter. Pressed turns the gradient over, moves the shadow inside and sinks the control by 1px.
- **Outline and secondary:** Card White, a Rule edge and `shadow-raised`. When pressed, they use `shadow-pressed`.
- **Ghost:** no fill until hover.

### Cards / Containers

- **Corner Style:** 4px.
- **Background:** Card White.
- **Shadow Strategy:** `shadow-card`. A card on a page rises to `shadow-float` on hover.
- **Border:** a one-pixel Rule.
- **Internal Padding:** 12px to 16px.

### Inputs / Fields

- **Style:** a Rule edge, `shadow-well` and Ground Chalk. The dark theme uses Chrome Chalk.
- **Focus:** the edge changes to the ring colour.

### Navigation

- **Style:** a tree on Chrome Chalk with rows of 28px. Rails and elbows draw its levels, and the line from the root to the chosen row is lit in Gold Mark. The chosen row is a plate in Reading Tone with `shadow-raised`. Tabs have an underline of Gold Mark. A link is ink with an underline of Gold Mark.

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
a quiet icon in the voice line, beside mute and subtitles.

The two layouts hold the same parts, so nothing is swapped. The Talk key and the
voice circle are one button, and keyboard focus stays on it. When voice starts,
the key's plate narrows to a 64px circle and rises to the head of the dock while
the dock grows and every part glides to its place. It takes half a second, and it
runs the other way when voice ends. A part that was not there fades in. The
reduced-motion preference cuts between the layouts.

The circle's face is a ring of gold, with a sheen that turns round it, set round
a lens of eleven ruled lines, like the lines of a drafting sheet. While voice is
on its way a spark laps the ring, and the ring draws itself round as it connects.
While the voice listens the lines lie flat and breathe. While the model speaks
they heave: each line shows what the line in front of it showed a moment ago, so a
loud moment rolls back through the sheet, and the lines in front hide the ones
behind. The sheen turns faster the louder it gets, and a hard onset sends a ring
of light out over the tray. Muted, the lines go flat and dim. The face follows the
model's measured output level and nothing else. It never listens to the
microphone.

The tray is lit by what the agent is doing: a warm wash blooms from the voice
circle while voice is on and brightens and fades with the voice, and a quieter
one in the status colour spreads while the agent works. At rest it is plain. Its
lines are all 13px and are told apart by weight and ink: its state at 500 in muted
ink, what it is on at 400. The clock is 12px mono.

The composer is in the conversation pane, on a tray at its foot (Tray Chalk and
`shadow-edge-up`), with its gold Send. It grows upward as a message grows, and
takes the room from the conversation.

## Do's and Don'ts

### Do:

- **Do** draw the one primary action of a region with `primary-finish`, and only that one.
- **Do** separate regions with tone steps and elevation tokens before you add a rule.
- **Do** keep shadows warm and offset. Take them from the elevation tokens in palette.css.
- **Do** keep the ink on gold at Gold Ink (at least 8.5:1).

### Don't:

- **Do not** put backdrop-filter, filter, blur or animation over the picture viewport.
- **Do not** paint gold or decoration onto a card in the picture.
- **Do not** use a grey-black blur or a halo without an offset as a shadow.
- **Do not** add a phone or narrow layout.
- **Do not** set a label or a heading in mono.
