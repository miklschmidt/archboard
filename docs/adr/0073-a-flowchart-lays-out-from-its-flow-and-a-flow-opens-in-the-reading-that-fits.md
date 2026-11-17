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
The owner reads long flows on a 1920x1080 desktop and found the tall flowcharts hard to read.

The first columns left long lines that the owner also found hard to read.
The connectors of ISO 5807 and the rule of DRAKON against a line that runs back up suggested jumps.
[The research note](../design/flowchart-layout-research.md) records the sources.

## Decision

A flowchart is laid out from the structure of its flow, with no solve.
A flow is a run of blocks, and each block is a box, a decision or a loop.

A line that would run far round other blocks jumps instead.
It stops at a jump out and goes on at the jump in of the same jump.

A run that is taller than its column height breaks into columns side by side.
The foot of one column ends at a jump out, and the next column starts at its jump in.

The core chooses one column height for the picture against the reference pane (`fit_in`).
A flowchart that the reference pane shows whole at full size never breaks.

When the reader opens a flow, it draws both readings first.
It opens the reading that the pane shows at the larger scale, up to the drawn size.
The address names the reading that opened, so reload and history restore it.

## Consequences

- Graphviz and the track engine no longer draw flowcharts.
- The core draws a flowchart in one pass.
  Its lines cross nowhere by construction, so no line hops another.
- The renderer core carries the static Onest Bold file, about 120 KB, for the letters of the jumps alone.
- The pane size takes part in the choice, so two panes can open one flow in different readings.
  The address records the reading that each pane opened.
- The CLI, embeds and walkthroughs name their grammar, as before.
