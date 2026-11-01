---
status: accepted
---

# Doors are buttons, a frame has one edge tab, and every relationship has a line

The reader redesign of TASK-559 decided these things after
[ADR 0064](0064-blocks-is-the-default-layout-engine.md), and no earlier record
holds them. [The reader redesign](../design/reader-redesign.md) states the
rules that follow from them. This record gives the reasons.

The owner decided the edge tab, the door buttons and the line ends. The
integrator decided rule 6 under the owner's trust of 2026-10-31. The owner looked
at the door buttons in the real pane and accepted them. The owner's look at the
redrawn tab and at landing whole is still open.

This record supersedes [ADR 0062](0062-parent-headers-use-normal-card-sizing.md)
and replaces the header slab of
[ADR 0044](0044-cards-containers-and-groups-are-drawn-as-slabs.md).

## A door is a button

A door is a module outside the open one that a line reaches. It is a bright
button with the finish of a primary action. A door in a group takes the color of
its group, and any other door takes the color of its kind. The owner chose this
look from a mockup. A door keeps its color on both themes, and no palette color
turns pale or brown. The reason is that `--bright-<name>` is the dark value of
the palette color on either ground.

A door keeps its measured size wherever it stands. The owner saw doors grow to
the height of the cards beside them and ruled that a door never grows.

The arrow on a door points up, sideways or down by the depth of its module
against the open module. Across this repository, 296 doors lead up, 326 lead
sideways and none lead down, because a door is a child of the common ancestor.

One click opens a door, because a button implies that one click opens. The
endpoints behind its lines moved to its tip, which shows up to eight of them, and
About keeps the whole list. A click with Ctrl selects a door. A comparison can
draw a door of a module that its state removed. That door has nowhere to open, so
a click selects it.

## A frame has one edge tab

A frame names its module with one edge tab: one line with the icon, the name and
the code path, on the top edge of the well. The tab's left side is the side of
the frame, and one outline runs round the tab and the well.

The owner chose this from the header mockups. A card that stands in a frame
takes a cell, which forces dead space, and the caption repeats its description.
The owner rejected the first drawn tab on sight: no visible frame outline, a
stepped left side, a tab wider than its text and a soft shoulder. The tab is
now one closed path.

## A line ends on the part that owns it

A line ends on the part that owns it, whatever else reaches that door. The owner
saw lines from outside cards land on a frame and judged that a mistake. The code
reaches a part such as Entry point, not the frame. A line on the frame reads as the
container acting, and it hides which part acts and what that part does. On
`Commands`, 43 relationships drew 10 lines, four frame lines held 37 of them,
and 16 of 24 parts showed no line. A threshold that kept many-part lines on the
frame did not meet the owner's request.

Only a relationship that names the open module itself stays on the frame
([ADR 0044](0044-a-containers-interface-is-what-relationships-from-outside-reach.md)).

From three lines of one kind to one door, each way, the lines share a trunk, so
that this cost stays readable. Each line wears its words on its own branch,
beside the part that owns it. The owner noticed that the first trunks had lost
298 of 1,722 labels (TASK-559.25). Six lines still find no room for their words,
and the panel of the selected line shows them.

## Rule 6 is deleted, so every relationship has a line

If a reading held more than 18 lines and a longer path joined the ends of a line,
rule 6 took that line off the picture. The caption then said that the line
followed from that path. That claim was false: a path through a third part does
not state what the dropped line states.
So the budget, its count, the caption's statement, `Show every line` and
`--every-line` are gone. The owner left this choice to the integrator, who kept
the deletion.

Every relationship now has a line, unless a filter hides its kind or it joins an
open module to a part that it holds. With every line drawn, 113 of 115 readings
landed whole, as they did with the budget, and the total area grew by 5.8 percent.

## A module's picture lands whole at any scale

A module's picture lands whole at the scale that fits the room, with a ceiling
of 1. Every one of the 115 readings fits, and the lowest landing is 0.352. Before
this, 10 readings stopped at a floor of 0.6 and were cut, so a reader had to pan.
The far view carries a picture below 0.857, with one far type scale for each
picture. A selection still never refits the picture.

## A sequence or a flowchart keeps its 0.6 landing

If a sequence or a flowchart fits whole at 0.6 or more, it lands whole. Any other
flow lands at 0.6 on the head of its frame. The reason is that a tall flowchart
lands at about 0.19 when whole, and nobody can read it there.

## Consequences

- The words on a door stand at about 7 px at the lowest landing of 0.352. The
  layout reserves a door before the far type scale is known, and TASK-559.17
  keeps this open.
- More lines cost more room. The door work took crossings from 465 to 1,848
  and bends from 1,298 to 3,545. Words on the branches then took the readings
  that pass the fit gate from 113 to 106 of 115.

## Amendment of 2026-10-31: no relationship of current architecture reaches a frame

TASK-559.33 closes the exception in "A line ends on the part that owns it".
`archboard check` now fails on a relationship that names a module with parts, so
current architecture holds no such end
([ADR 0044](0044-a-containers-interface-is-what-relationships-from-outside-reach.md)).
A relationship between a module and a part that it holds stays allowed, and a
reading that opens the module draws no line for it.

A retained reading or a draft can still hold a frame end, and the reader draws it
as it stands, because those readings are exact. A line to a part inside a closed
module ends on that module's card, which stands for the part.

The repair took the lines drawn from 1,794 to 1,807 and the total area from
187.8 M to 173.7 M. The readings that pass the fit gate went from 107 of 115 to
104 of 112, and the same 8 readings miss.
