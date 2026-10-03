---
status: accepted
---

# Explicit traffic controls distance-based animation

Amended by the pulse relay change (2026-10-04): traffic is a steady train of
pulses. This amendment replaces the rail-gun amendment (2026-09-26) and the
comet and moat amendment (TASK-339, 2026-09-24) wherever they conflict with it.
The paragraphs under "Earlier amendments" are history. What this amendment does
not change still holds: traffic is optional, the defaults are 80 units a second
and a volume of 1, supplied values are positive and finite, omission is the one
off state, a traffic change is one property for identity, and reduced motion
hides every pulse.

A pulse is a laser bolt. It has a bright head about 16 units long, in the
relationship's colour with some of the page's text colour mixed in. A hot core
sits in the head, nearer the text colour. The front is cut flat. Behind the head
is a tail of up to 40 units that fades into the colour of the line. A pulse is
thin: as thick as its line plus 0.6 units. It has no ring of the page's
background, no glow and no round blob. It follows a bend as its line does.

A line with traffic carries a steady train of pulses. They are evenly spaced by
the speed divided by the volume, and each flies at exactly the authored speed.
Speed is clamped to 8 to 600 diagram units a second. There is no jitter, no
seeded launch cycle, no multiple of the speed, no shots and no resting streak.
The tail is cut short on a close train, so two pulses never merge.

The spacing is held to two limits. It is never below 36 units. It is never above
the shortest drawn stretch of any line in its chain (a line's drawn stretch is
the line without the base of its arrowhead). A chain is the lines joined by the
hand-offs below. So every line shows at least one pulse, except a line shorter
than 36 units, where the floor wins.

A still picture (the SVG at time zero, and a PNG) shows the whole train at its
phase. It no longer shows exactly one streak at rest on each line. Nothing in
layout looks for a resting place.

A card hands pulses on. When a card has lines going out that have the same
effective speed and the same effective volume as a line coming in, the pulse
that sinks into the card runs round the card's edge, the shorter way, at the same
speed, and leaves on every such outgoing line. The pulse never crosses what the
card says. A fan-out splits one pulse into several. Where the speed or the volume
differs, nothing is handed on, and the line keeps its own rhythm. A hand-off
across a frame, which has no edge to run round, or across a gap under 8 units, is
not drawn. A chain's first lines start where nothing feeds them, at a place drawn
from the source card's id, so one board draws the same bytes every time. A line
fed by two lines follows the one reached first when the chain is walked in
board order.

Sequence diagrams use the same pulse. Each message sends one pulse in turn, and
a repeated step sends up to three. All the pulses share one clock for the whole
page, and a message waits until the one before it has arrived. Every pulse flies
at the default traffic speed, 80 units a second, so a long message takes longer
than a short one. When the whole cycle would pass 16 seconds, every pulse flies
faster by the same factor.

Reduced motion hides every pulse. A relationship that is removed or removed
standing carries no traffic. Traffic is still illustration, not measurement.

The paragraphs after the settled requirements hold again. A pulse takes L/S
seconds to cross a line of length L, the spacing is S/V (within the limits
above), and a longer line holds more pulses rather than faster ones.

## Earlier amendments (history)

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

## Original decision

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
- Omitted traffic volume defaults to 0.5 dots per second within traffic. (As
  amended by TASK-339: 1. It is the rate at which pulses leave a line.)
- Speed is expressed in diagram coordinate units per second, independently of
  zoom. Omitted traffic speed defaults to 40 diagram units per second within
  traffic. (As amended by TASK-339: 80. It is how fast a pulse flies, clamped to
  8 to 600.)
- Supplied speed and volume must be positive and finite. Omission of traffic is
  the single off state. Zero volume, zero speed and a separate enabled flag are
  unnecessary states for this illustration-only contract.
- Route length must not change the configured speed. Emphasis does not supply
  traffic, volume or speed implicitly.
- Traffic starts distributed along the route. This illustrates ongoing flow
  without waiting for the route to fill from its source. (As amended on 2026-09-26, now
  history: a still picture shows one streak at rest on the line. As amended on
  2026-10-04: it shows the whole train at its phase.)
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
