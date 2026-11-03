---
status: accepted
---

# A flowchart lays out from its flow, and a flow opens in the reading that fits

Decided for TASK-568 on 2026-11-03. TASK-572 added the jumps on 2026-11-04.
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

The first columns left long lines that the owner also found hard to read.
The line between two columns rose through the gap and could pass for the line of a loop.
The short answer of a lopsided decision ran a long empty line down to its join.
A long loop ran its line back and its line labelled done round its whole body.
The joins of nested decisions stacked into one knot.
The connectors of ISO 5807 and the rule of DRAKON against a line that runs back up suggested jumps.
[The research note](../design/flowchart-layout-research.md) records the sources.

## Decision

A flowchart is laid out from the structure of its flow, with no solve.
A flow is a run of blocks, and each block is a box, a decision or a loop.

- A run of blocks stacks on one axis.
  Steps that follow each other stack 4 apart with no line between them, as wide as the widest of them.
- A decision stands its answers side by side below its diamond.
  The first answer leaves the left point, the last answer leaves the right point, and any other answer leaves the foot.
  Of two answers, the taller one leaves the foot and runs straight on down.
  Each answer keeps its own spacing.
  The loose ends of every answer drop below the longest answer and join on the axis of the diamond, three bends below it.
- A loop stands the steps that it repeats below its hexagon.
  The line back up runs on their left into the left point of the hexagon.
  The line labelled done leaves the right point and runs down on their right.

A line that would run far round other blocks jumps instead.
It stops at a jump out and goes on at the jump in of the same jump.
A jump out is a tag that points the way its line went, and a jump in is a disc.
All markers of one jump carry one letter, in Onest Bold, and one ink.
The core letters the jumps from A and gives them their inks in turn, in the order the picture holds them.
The inks are black on the light theme and white on the dark one, then rose, lime, orange and indigo.
Lime and orange take their bright values on the light theme.

- A guard is a decision of two answers whose one answer holds at least four more blocks than the other.
  Its long answer carries the run on below the diamond.
  Its short answer stands beside the blocks that follow, clear of them, and ends at a jump out.
  The jump in is a landing beside the run's line where the long answer ends, and its line joins that line.
  Guards whose long answers end together share one landing.
- A loop that repeats four or more blocks jumps back from the end of its body to a jump in beside the left point of its hexagon.
  A landing at the end of its body would only lead into that jump, so the guards that land there jump back to the hexagon too.
  Its line labelled done ends at a jump out beside the right point, and the run goes on below the loop at its jump in.

A run that is taller than its column height breaks into columns side by side.
A break falls between two blocks of one run, and never leaves a terminal alone in a column.
A break never falls in front of a decision, which stays at the foot of the steps that lead to it, or in front of a landing.
The columns of a run are as even as their count allows.
The foot of one column ends at a jump out, and the next column starts at its jump in.

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
- A reader follows a jump by its letter and ink, not by a line.
  A long flowchart has no line that runs round a body or between columns, and no line between two steps that follow each other.
- The renderer core carries the static Onest Bold file, about 120 KB, for the letters of the jumps alone.
- The pane size takes part in the choice, so two panes can open one flow in different readings.
  The address records the reading that each pane opened.
- The CLI, embeds and walkthroughs name their grammar, as before.
