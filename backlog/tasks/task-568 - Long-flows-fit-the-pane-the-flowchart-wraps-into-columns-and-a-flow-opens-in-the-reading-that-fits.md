---
id: TASK-568
title: >-
  Long flows fit the pane: the flowchart wraps into columns, and a flow opens in
  the reading that fits
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-03T13:53:00Z'
updated_date: '2026-11-03T14:34:00Z'
labels:
  - renderer
  - flows
  - frontend
dependencies: []
documentation:
  - >-
    docs/adr/0053-a-flow-holds-its-logic-and-reads-as-a-sequence-or-a-flowchart.md
priority: high
ordinal: 1016000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A long flow draws as one tall column of boxes in the flowchart reading. A 35-step dogfood flow draws 0.31 as wide as it is tall, while its sequence reading draws 0.94. Every step line has rank weight 1 in Graphviz, so the spare height of a short branch lands on whatever line keeps the total length smallest, often one long empty line in front of a nested decision. All branches share global ranks, so a short branch takes on the row heights and the jogs of the long one. The owner reads these flows on a 1920x1080 desktop and finds them annoying to read. The owner asked for both readings to draw long flows well, and for a flow to open in whichever reading fits the pane best. The reading toggle already exists in the reader and stays as it is.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A flowchart is laid out from the structure of its flow, without a Graphviz solve: a chain of steps stacks on one axis, the answers of a decision stand side by side, and each answer keeps its own spacing, so a short answer ends at the top and its line runs on to the join
- [ ] #2 A chain of steps that does not fit the reference pane at full size wraps into columns side by side, broken only between two steps of the same chain, and a flowchart that fits the reference pane whole at full size does not wrap
- [ ] #3 The behavior the flowchart tests guard still holds: answers leave a diamond from its left, right and bottom points, every line ends on the outline of the shape it meets, no line crosses another, and the words of a shape stand centered inside it
- [ ] #4 Opening a flow in the reader, from the flow list, a change walk, a reveal or the flow keys, opens the reading that fits the pane at the larger scale, sequence on a tie, and the address names the reading it opened
- [ ] #5 The reading toggle still switches the open flow between sequence and flowchart
- [ ] #6 An ADR records the layout and the default reading, and the documents that name the track engine for flowcharts name the new layout
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lay a flowchart out from the block structure of its flow in crates/archboard-flows (graph.rs builds blocks, layout.rs places them, frames.rs frames them), and delete the Graphviz-era answer_order.rs, outlines.rs and ports.rs.
2. Choose the column height by archboard_layout::fit_in against the reference pane, with fewer breaks on a near tie, and balance each broken run so its columns are even.
3. Remove the decision-point path (MeasuredNode.pointed, FROM_POINTS) that only the old flowchart used from archboard-layout and the scene, once nothing sets it.
4. Reader: opening a flow (list, change walk, reveal, flow keys) draws both readings and opens the one that fits the pane at the larger scale, sequence on a tie; the address names the opened grammar, and the toggle is unchanged.
5. Record ADR 0073, point ADR 0053 and the docs that name the track engine for flowcharts at it, and author a proposal for the Flowchart module (vKEsyHFk/gbyqW4H3#0idmUHd2), the Draw a view flow (vKEsyHFk/gbyqW4H3#ts6X9FtG) and the reader module that opens flows.
6. Prove with the renderer flow tests, the Rust tests, before and after rasters of the longest dogfood flows, and a browser check of the opened reading.
7. Review with the code-review skill, fix findings, and open the PR.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Architecture proposal: state vdbwhuzZ ("A flowchart lays out from its flow and a flow opens in the reading that fits"), predecessor oyXXnyCV, model vKEsyHFk, vault .archboard/vault. It changes Flowchart vKEsyHFk/gbyqW4H3#0idmUHd2 (responsibility, description), removes relationship 8WJV0Mer to Drawing settlement, relabels LJUm7E1m to Edge geometry and anchors it at flowchart/mod.rs curve_through, turns Draw a view step XFJazS8y into a self step anchored at frames.rs fitted, removes return step NR1ARSyH, and adds the fitting reading to the Model reading description. No module was added for use-flow-readings.ts: the reader hooks have no module of their own, and the Model reading description states the behavior. check: no finding names a changed subject. The remaining warnings (three missing canvas files) hold on main too. The Rust language server is not configured, so Rust anchors were judged by name.
<!-- SECTION:NOTES:END -->
