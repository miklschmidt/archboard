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
at the door buttons in the real pane and accepted them.

This record supersedes [ADR 0062](0062-parent-headers-use-normal-card-sizing.md).

## A frame has one edge tab

A frame names its module with one edge tab: one line with the icon, the name and
the code path, on the top edge of the well. The tab's left side is the side of
the frame, and one outline runs round the tab and the well.

## A line ends on the part that owns it

A line ends on the part that owns it, whatever else reaches that door. The owner
saw lines from outside cards land on a frame and judged that a mistake. The code
reaches a part such as Entry point, not the frame. A line on the frame reads as the
container acting, and it hides which part acts and what that part does. On
`Commands`, 43 relationships drew 10 lines, four frame lines held 37 of them,
and 16 of 24 parts showed no line. A threshold that kept many-part lines on the
frame did not meet the owner's request.

## Rule 6 is deleted, so every relationship has a line

Rule 6 held for a reading of more than 18 lines. If a longer path joined the
ends of a line there, rule 6 took that line off the picture. The caption then said that the line
followed from that path. That claim was false: a path through a third part does
not state what the dropped line states.
So the budget, its count, the caption's statement, `Show every line` and
`--every-line` are gone. The owner left this choice to the integrator, who kept
the deletion.

Every relationship now has a line, unless a filter hides its kind or it joins an
open module to a part that it holds. With every line drawn, 113 of 115 readings
landed whole, as they did with the budget, and the total area grew by 5.8 percent.

## Consequences

- More lines cost more room. The door work took crossings from 465 to 1,848
  and bends from 1,298 to 3,545.

## Amendment of 2026-10-31: no relationship of current architecture reaches a frame

TASK-559.33 closes the exception in "A line ends on the part that owns it".
`archboard check` now fails on a relationship that names a module with parts, so
current architecture holds no such end
([ADR 0044](0044-a-containers-interface-is-what-relationships-from-outside-reach.md)).
A relationship between a module and a part that it holds stays allowed, and a
reading that opens the module draws no line for it.

A retained reading or a draft can still hold a frame end, and the reader draws it
as it stands, because those readings are exact.
