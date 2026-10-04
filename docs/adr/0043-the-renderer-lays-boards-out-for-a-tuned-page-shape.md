---
status: accepted
---

# The renderer lays boards out for a tuned page shape, not for the shell's pane

This decision supersedes the clauses of
[ADR 0028](0028-the-renderer-reads-a-board-in-a-direction-and-is-measured-by-fit.md)
that derive the reference pane from the desktop shell, and the same clause as
[ADR 0039](0039-a-drawing-is-measured-by-how-easily-it-reads.md) keeps it. The
user decided it on 2026-10-05, under TASK-395.

## Context

ADR 0028 derived the reference pane from the desktop shell at 1920 by 1080:
the viewport less the navigator, the rows above and below the panes, the
inspector and the fit margin. ADR 0039 kept that pane as the yardstick for
fit. One module, `src/shared/shell-geometry`, derived it.

The shell was then redesigned. The 56 px header, the 36 px pane bar and the
41 px agent bar went away, and each column got one 40 px chrome row at its top.
The module still described the old shell, so the pane stayed 1272 by 899.

When the module was made to match the shell, the pane became 1271 by 992. Then
18 of the 130 drawings of the tracked vault, the web-shop example and the
wide-board fixtures changed, and nine renderer tests failed, seven of them on
how a drawing reads. Several drawings read worse. In one, a server moved above the client that calls it, and three
lines ran up and back over the top. In another, a line entered its card from
below, with the arrow up.

The cause is in the renderer. Some choices are made before a drawing exists:
how many columns loose cards take, where a wide rank wraps, and which fold or
packing fits best. Those choices weigh the shape of the page. So a change to the
height of one CSS row laid boards out again.

## Decision

The renderer lays a board out for one tuned page shape: `LAYOUT_ASPECT`, width
over height, a plain 1.4. It is a value the layouts are tuned for, and it is not
a measurement of the shell. It is close to the 1272 by 899 pane (about 1.415)
that the layouts were tuned against. It is a round number so that nobody reads
it as a measurement of a shell that no longer exists.

The reference pane takes its width from the shell: a lone pane's picture beside
its docked sidebar, less the fit margin on either side, which is 1271 px. Its
height is that width divided by the aspect, about 908 px. Fit still means the
scale at which a drawing shows in the width the shell gives it, and the camera's
fit and the layout suite's fit still use one arithmetic.

The shell's facts stay measured and exact in the same module: the stage of 1599
by 1040, the 40 px chrome row, the 320 px navigator and the 280 px sidebar. The
shell-layout browser owner holds the mounted shell to them. A change to a row of
the shell changes those facts and lays out no board.

The grid of loose cards and the wrap of a wide rank read the aspect. Fit reads
the reference pane. A change to `LAYOUT_ASPECT` is a layout change: it lays
boards out again, and ADR 0039 says how it is judged.

## Consequences

- At 1.4, against the 1272 by 899 pane, 2 of the 130 drawings change, and every
  renderer test passes unchanged. Both drawings are views of Browser
  application under Blocks. Working with an agent stands its Agent region above
  its Voice region and reads worse: 16 crossings instead of 14, more bends and
  17% more line, with labels nearer their lines. The whole board crosses 116
  times instead of 95, with fewer bends, 9% less line and a better fit.
- The fits recorded in `docs/design/layout-rules.md` before 2026-10-05 are
  against the 1272 by 899 pane.
- A reader's real pane is taller than the reference pane: 1271 by 992 beside a
  docked sidebar. The camera fits a drawing into the real pane, so a drawing
  never shows smaller on screen than its recorded fit.
