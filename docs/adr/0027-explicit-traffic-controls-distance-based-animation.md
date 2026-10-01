---
status: accepted
---

# Explicit traffic controls distance-based animation

Amended by TASK-339 (2026-09-24): a traffic mark is a comet, not a round dot. It
has a head stretched along its line and a tail that tapers and fades behind it.
The head has a ring of the page's own background around it, and the comet has a
soft glow.

A colored line is drawn at three quarters of its color (ADR 0025 as amended).
The head of a comet is the color at full strength with some of the page's text
color mixed in. The head is darker on a light page and brighter on a dark one.
Its tail fades from the color of the head back into the color of the line. The
neutral gray line keeps its color, and its comets lean further toward the text
color.

A round dot said nothing about direction. A comet shows which way its
relationship flows. It does so in a still picture too, where the marks are drawn
at rest. A comet also cannot be mistaken for the junction mark where two routes
join (TASK-337). A sequence's timed marks are comets of the same kind that turn
to follow their line.

The defaults are now 80 diagram units a second and one mark a second. This keeps
the spacing of 80 units that the slower defaults had. Each layer of a comet is
one dash pattern over the whole route, spaced and advanced as the rates below
say.

Amended by the rail-gun traffic change (2026-09-26): traffic is shots, not a
steady stream. The volume V is still the mean number of marks a second. The
firing moments of a line vary. Each gap is between 0.3 and 1.7 of the mean gap.
A small generator seeded by the relationship's id draws the gaps over a cycle of
eight shots. The cycle is scaled so that its mean gap is exactly 1/V. The cycle
repeats, and the same board draws the same bytes every time.

A shot flies 15 times the authored speed S. At the defaults, a shot crosses a
300-unit line in a quarter of a second. S still says which lines run hotter.

A shot is a streak. It has a bright head and a long thin tail. The head is
longer than it is wide, and it is ringed by the page's own background and glows
as before. The tail fades from the color of the head into the color of the line.

The tail is as long as the shot flies in 260 ms. It is at most 45% of its line
and 70% of the shortest distance between two shots. A streak therefore never
fills a short line, and two shots never merge. Shots in flight together are
dashes of one pattern over the route. No shot is dropped, however high the
volume.

A still picture is the SVG at time zero. It shows exactly one streak on each
traffic line. The streak rests where no label cuts it. The shots start a moment
later. A line too short for a whole streak shows none at rest.

Mean gaps are held between 20 ms and an hour, so extreme values stay finite and
small. The rates and spacings below describe the old steady stream. The volume,
the independence of route length and the off states still hold. The spacing S/V
and the traversal times do not hold.

Current moving dots use a fixed traversal duration, so long connections animate
faster than short connections. TASK-203 separates traffic from emphasis and
makes volume and speed independent, so agents can communicate traffic
deliberately. The requirements below were accepted through Q32 of the TASK-203
interview on 2026-09-13.

Traffic, traffic volume and traffic speed are defined in
[CONTEXT.md](../../CONTEXT.md#meaning). The rates and rendering decisions belong
here.

## Settled requirements

- Traffic is optional connection data. If the traffic field is absent, the
  renderer does not draw traffic animation. Presence enables it, and that
  includes an empty object that uses defaults. There is no separate enabled
  field.
- Omitted traffic volume defaults to 0.5 dots per second within traffic.
- Speed is expressed in diagram coordinate units per second, independently of
  zoom. Omitted traffic speed defaults to 40 diagram units per second within
  traffic.
- Supplied speed and volume must be positive and finite. Omission of traffic is
  the single off state. Zero volume, zero speed and a separate enabled flag are
  unnecessary states for this illustration-only contract.
- Route length must not change the configured speed. Emphasis does not supply
  traffic, volume or speed implicitly.
- Traffic starts distributed along the route. This illustrates ongoing flow
  without waiting for the route to fill from its source. (As amended: a still
  picture shows one streak at rest on the line. The shots start from there.)
- Removed comparison edges and reduced-motion readers show no moving dots. SVG
  exports retain animation where supported, without adding an export legend.
- These are animation properties, not measured real-world traffic. Do not expose
  their numeric values in the browser inspector. Do not add a parallel telemetry
  schema. A connection label can communicate meaningful real-world traffic
  information.
- A traffic change marks the connection as changed. The entire traffic object
  counts as one property for connection identity validation. Changing speed and
  volume together retains identity. Changing traffic and destination counts as
  two changes. Compare effective values by value, and include defaults. An empty
  traffic object and explicitly supplied defaults are equivalent. Omission and
  an empty object are different. This is an explicit comparison treatment of
  authored animation intent, not a claim that its numbers measure the
  architecture.

For a routed path of length L, speed S and volume V, a complete traversal takes
L/S seconds. Dots enter at intervals of 1/V seconds for positive S and V. The
agreed volume default means one dot every two seconds. Steady-state spacing is
S/V diagram units. Longer paths hold more dots rather than accelerating them.
The exact animation machinery remains an implementation choice.

At the defaults, a 300-unit connection takes 7.5 seconds to traverse, and dots
are spaced 80 units apart along the path. Pre-population makes ongoing flow
visible immediately. These defaults are the agreed starting point for visual QA.

This extends the separation of visual channels in
[ADR 0025](0025-containment-and-type-own-distinct-visual-channels.md). The final
implementation must demonstrate equal distance per second and equal dot-entry
rates on short and long paths with the same traffic values.
