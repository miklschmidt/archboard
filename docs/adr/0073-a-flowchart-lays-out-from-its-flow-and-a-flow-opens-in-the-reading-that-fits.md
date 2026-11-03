---
status: accepted
---

# A flowchart lays out from its flow, and a flow opens in the reading that fits

Decided for TASK-568 on 2026-11-03.
This record replaces the track engine layout of [ADR 0053](0053-a-flow-holds-its-logic-and-reads-as-a-sequence-or-a-flowchart.md).
The two readings of a flow and their shapes stay as ADR 0053 decided.

## Context

ADR 0053 gave the flowchart to the track engine, and its Graphviz ranks drew a long flow as one tall column.
A 35-step flow of this repository drew 0.31 as wide as it was tall, and its sequence drew 0.94.
Every line had a rank weight of 1.
So Graphviz put the spare height of a short answer on the line that kept the total length smallest.
That was often one long empty line in front of a nested decision.
All answers shared one set of ranks, so a short answer took the row heights and the jogs of a long one.
Each flowchart took two or three Graphviz solves to order the answers of its decisions.
The reader opened every flow as a sequence.
If the flow before it was open as a flowchart, the reader kept the flowchart.
The owner reads long flows on a 1920x1080 desktop and found the tall flowcharts hard to read.

## Decision

A flowchart is laid out from the structure of its flow, with no solve.
A flow is a run of blocks, and each block is a box, a decision or a loop.

- A run of blocks stacks on one axis.
- A decision stands its answers side by side below its diamond.
  The first answer leaves the left point, the last answer leaves the right point, and any other answer leaves the foot.
  Each answer keeps its own spacing.
  The loose ends of every answer drop below the longest answer and join on the axis of the diamond.
- A loop stands the steps that it repeats below its hexagon.
  The line back up runs on their left into the left point of the hexagon.
  The line labelled done leaves the right point and runs down on their right.

A run that is taller than its column height breaks into columns side by side.
A break falls between two blocks of one run, and never leaves a terminal alone in a column.
The columns of a run are as even as their count allows.
The line from the foot of one column rises in the gap beside it and enters the next column from above.

The core chooses one column height for the picture against the reference pane (`fit_in`).
It lays the picture out again at shorter column heights.
If the reference pane shows the picture at least 1% larger at a shorter height, the core keeps that height.
A flowchart that the reference pane shows whole at full size never breaks.

When the reader opens a flow, it draws both readings first.
It opens the reading that the pane shows at the larger scale, up to the drawn size.
The sequence wins a tie.
This rule holds for the flow list, a change walk, a reveal and the flow keys.
A flow opened in the other pane is weighed against the reference pane, because that pane has no size yet.
The address names the reading that opened, so reload and history restore it.
The reading toggle switches the open flow as before.

## Consequences

- Graphviz and the track engine no longer draw flowcharts.
  The decision points that only the flowchart asked of the layout engine, `MeasuredNode.pointed` and the `archboard.from-points` edge options, are gone.
- The core draws a flowchart in one pass.
  Its lines cross nowhere by construction, so no line hops another.
- A reader can confuse the upward line between two columns with the line of a loop.
  The line between columns enters the top of the next column, and a loop's line enters the side point of a hexagon.
- The pane size takes part in the choice, so two panes can open one flow in different readings.
  The address records the reading that each pane opened.
- The CLI, embeds and walkthroughs name their grammar, as before.
