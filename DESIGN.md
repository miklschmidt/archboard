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

This file records the shell as it stands in code. Two files are normative:
`src/ui/theme/palette.css` holds the colours and the elevation of both themes,
and `src/ui/theme/app.css` holds type, space, shape, the shadow utilities and
the gold finish. If this file and those files disagree, those files win and this
file is stale.

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
- **Tray Chalk** (oklch(0.986 0.003 88), dark oklch(0.205 0.007 75)): a tray at the foot of a column, raised over the chrome. The agent dock and the foot of the selection tab use it.
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
- **Presentation** (600, 28px, 34px): the heading of a presented step.
- **Reading** (400, 16px, 24px): the words of a presented step, in a column 64rem wide at most.
- **Figure** (650, 44px, 44px, display face): the number of a presented step.
- **Subtitle** (500, 20px, 28px): the words the voice says.
- **Technical** (400, 11px, 14px, mono): identifiers, paths, versions, counts and times.

### Named Rules

**The Mono Is Data Rule.** Mono sets technical tokens only. It never sets a label or a heading.

## Layout

The shell puts columns around the picture. The navigator (320px) is on the left,
and the agent dock is at its foot. The panes are in the centre, one or two side
by side. The conversation opens between the navigator and the panes: it slides
in and out, and a handle on its edge, a grip on a line that takes the gold while
it is dragged, resizes it between 320px and 720px, or drags it shut below that.
Each pane has a sidebar (280px) on the right, shown and hidden by one control at
the end of the pane's header. Beside a lone pane the sidebar is docked and takes
its width from the picture. With two panes it is away until somebody asks for
it, and its panel then floats over the edge of the picture until it is pinned. A
sidebar that is away is nowhere: it leaves no strip, no icons and no empty
column behind. Every column starts with a chrome row (40px) and then a band
(36px) for the find fields and the tabs of the sidebar. A pane's header stands
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
The file palette.css holds the values for both themes. The file app.css gives
each one a `shadow-*` utility.

### Shadow Vocabulary

- **well** (`--elevation-well`, an inner shadow of 1px offset and 2px blur): a field sunk into a surface, such as an input or the composer.
- **edge-down, edge-side and edge-up** (`--elevation-edge-*`): the chrome casts these onto what is under it or beside it. Each is a 1px contact shadow and a soft shadow. The soft shadow has an 8px offset on chalk and 10px to 12px on graphite. A tray casts edge-up over the list that scrolls under it.
- **raised** (`--elevation-raised`, a white highlight on top and a 1px seat): a control, a key cap, the voice circle and the chosen row of a list.
- **pressed** (`--elevation-pressed`, an inner shadow): a raised control while somebody presses it.
- **card** (`--elevation-card`): a card on a page.
- **float** (`--elevation-float`, a highlight on top and three shadows): menus, tips, lists of matches, the floating sidebar, the walkthrough box and the voice box.
- **dialog** (`--elevation-dialog`, a highlight on top and three shadows): dialogs.
- **primary and primary-pressed** (`--elevation-primary*`): the gold finish at rest and pressed.

### Named Rules

**The Still Shadow Rule.** A shadow over the picture is a static box-shadow, and a panel's shadow never changes while the panel moves. Nothing over the picture viewport uses backdrop-filter, filter or blur, and nothing there loops except the voice orb in the voice box, which is drawn on a canvas of its own and only while voice is on, and the warm wash the box takes from the orb's light, which is a layer of the box and never of the picture. A tip, a menu, the floating sidebar, the walkthrough box or the voice box may ease its own layer's transform and opacity, once, and each word of a subtitle may ease its own opacity, once. The floating sidebar takes at most 160ms, the walkthrough box 220ms to arrive and 520ms to hand one step to the next, with the wake on its rail settling by about 700ms, and the voice box 360ms to arrive and 240ms to leave. A box that is wanted again while it leaves turns round from where it is. The orb itself crosses the page when subtitles are turned on or off, in a layer of its own, over 680ms.

**The Picture Answers Rule.** The light belongs to the picture, not to the shell. When a part is picked out or the pointer rests on one, the viewer marks what stays as drawn, and the picture's own subjects recede under an opacity filter. The shell lays no layer, blur or halo over the picture to do it.

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
- **Shadow Strategy:** `shadow-card`. A card on a page rises to `shadow-float` on hover.
- **Border:** a one-pixel Rule.
- **Internal Padding:** 12px to 16px.

### Inputs / Fields

- **Style:** a Rule edge, `shadow-well` and Ground Chalk. The dark theme uses Chrome Chalk.
- **Focus:** the edge changes to the ring colour.

### Navigation

- **Style:** a tree on Chrome Chalk with rows of 28px. Rails and elbows draw its levels, and the line from the root to the chosen row is lit in Gold Mark. The chosen row is a plate in Reading Tone with `shadow-raised`. Tabs have an underline of Gold Mark. A link is ink with an underline of Gold Mark.

### Pane sidebar

The sidebar is one panel, 280px wide and held at the pane's edge, on Chrome Chalk
with a rule down its inner edge. It has two tabs and one control, in the pane's
header, that shows and hides it. The control is filled while the sidebar is shown,
its tooltip says what it will do, and it is there in every state of the pane.
Showing the sidebar puts it back where the person had it. A floating panel has a
pin at the end of its tab row, which docks it, and Escape inside it puts it away
and gives the keyboard back to the control. The search for a part sits above the
tabs, and its shortcut shows an away sidebar and takes focus in the field.

The sidebar eases in and out, as the conversation does. A docked column takes its
width over 220ms while the panel, held at its own width, is uncovered under the
edge of the picture, so nothing in it reflows. The picture is fitted again once, at
the end. A floating panel eases in from 2rem to the right of its place and from
nothing over 160ms, and leaves in 110ms. A panel that is pinned is swapped in
place and does not move. A new subject opens at the top of the selection tab and
arrives with a 120ms fade. A row answers the pointer with a change of tone and
nothing else. With reduced motion the sidebar appears and goes at once.

A presented walkthrough steps the sidebar aside, as it does the rest of the pane's
chrome. While it lasts the control is held and says so, and nothing, the search
shortcut included, shows or hides the sidebar.

A walkthrough's row begins with a play mark, never a bare triangle, because a
triangle is the mark of a row that folds open. Narrate is in every walkthrough's
row in every pane, whichever pane is active and whatever voice is doing, so the
row never changes size. While a narration cannot start the control is dimmed and
its tooltip says why.

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
Muted Ink at 70%, which is 3:1 against the plate, because they are controls. One piece of
Gold Mark marks the step shown. It is 6px high and as wide as a segment, with a paler wake of
the same gold behind it.

Under the rail, the words stand in a column in the middle of the plate. The column is 64rem
wide at most, and its text is left aligned. It holds the heading of the step (28px) and the
words of the step (16px). Under them is the name of the walkthrough, in muted ink. The
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
the right end, as in the box over the picture. A recording and the replay of a kept talk draw
plain subtitles in the pill, with no orb and no keys.

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
It is over a page of the board as well as the diagram, it is clear of a sidebar that
floats over the picture, and in a pane too narrow for it the words give way and the orb
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
while the voice is live. A recording and the replay of a kept talk draw plain subtitles, with
no orb and no keys. With reduced motion the orb is in its home, and the box is there or gone, at once.
Keyboard focus follows the subtitles control to the surface that takes it over.

## Do's and Don'ts

### Do:

- **Do** draw the one primary action of a region with `primary-finish`, and only that one.
- **Do** separate regions with tone steps and elevation tokens before you add a rule.
- **Do** keep shadows warm and offset. Take them from the elevation tokens in palette.css.
- **Do** keep the ink on gold at Gold Ink (at least 8.5:1).

### Don't:

- **Do not** put backdrop-filter, filter, blur or a looping animation over the picture viewport.
- **Do not** take a control out of a row when it cannot be used. Dim it and say why in its tooltip, so the row does not move.
- **Do not** paint gold or decoration onto a card in the picture.
- **Do not** use a grey-black blur or a halo without an offset as a shadow.
- **Do not** add a phone or narrow layout.
- **Do not** set a label or a heading in mono.
