---
status: accepted
---

# Track is replaced by Lanes

The owner decided this on 2026-11-22 for TASK-672.
It supersedes the parts of [ADR 0040](0040-track-and-blocks-replace-the-graphviz-engine.md) and
[ADR 0064](0064-blocks-is-the-default-layout-engine.md) that keep Track.

## Context

ADR 0064 made Blocks the default and kept Track behind `--layout track` and the settings dialog.
Nothing chose Track by default after that, but its code ran through the block tree, the line
router, the settle pass and the render request. Tests ran both engines, and the corpus kept
Track's readings. Track also kept 7,803 collinear-port findings that Blocks does not have
(ADR 0064). Agents kept spending time on it. The owner said:

> I really want to delete the track renderer, i'm tired of agents spending time on it, it sucks so
> much and should never be used.

Blocks plans its routes before it draws them (ADR 0063). Where no plan gives every line a clear
channel, Blocks falls back to its older placement: Graphviz ranks each block's cards, and the lane
router draws every line on a lane of its own between the ranks. Long parallel runs pass between
the rows of cards, and lines land on each card in bundles. Track drew its lines the same way, but
it drew containers inline, as clusters of one block, where the fallback keeps every container a
block of its own. When the owner saw a fallback picture, the owner said:

> i would actually like this as an engine rendering option. Instead of tracks.

## Decision

Lanes replaces Track. Blocks stays the default.

- **Lanes** is the fallback placement of Blocks, always on. It packs containers and groups as
  blocks, as Blocks does. It never asks the planner, and it never splits a solve across the
  layout workers (ADR 0078). Its drawing settles its crossings afterwards, as a Blocks fallback
  drawing does.
- **Blocks** does not change. It still falls back to the same placement where its planner refuses
  a reading.
- The render request names its engine, `blocks` or `lanes`. The host resolves the one default
  before it calls the core (ADR 0064). A Lanes solve's graph names `lanes` in its root options. A
  Blocks graph names nothing, so its solves and answers are what they were.
- The layout memo keys on the engine, so one engine's drawing never answers for the other.
- `--layout` takes `blocks` or `lanes` on `model render` and `model rasterize`. The settings dialog
  offers Blocks and Lanes, and the browser remembers the choice.
- A recipe records the engine, so an embed drawn with Lanes is drawn again with Lanes.

Track's own code is deleted: its inline nesting and clusters, the peer row beside a caller,
entry-point rows inside a container, ports that slide along a block's edge, and laying out a
comparison and then hiding its subjects at paint time. The render request no longer carries the
whole variant, which only the entry-point rows read. The line router moves from `src/track` to
`src/lanes`, and its working state is `Router`. Git keeps Track's code at `e28f5e3881`.

Saved input that says `track` reads as Lanes: the browser's stored choice, a version 1 recipe and
a recorded talk. No address names an engine.

## Consequences

Two engines remain, and they share every part but the planner. A change to the lanes' placement
or the lane router changes Lanes, and Blocks wherever it falls back. Measure such a change on both
engines.

Lanes is not Track. A picture that Track drew draws differently with Lanes: every container is a
block, and no entry-point row or peer row is kept.

Removing Track's code changed no Blocks drawing: 542 corpus drawings, a full native picture, and
the layout fixtures, a fallback drawing among them, are byte-identical before and after.

## Amendment: Lanes is an engine of its own (2026-11-23)

The owner decided that Lanes has a bus look of its own, and that its pictures may differ from
Blocks' fallback:

> lanes is supposed to have a bus look.

Lanes starts from the lanes' placement and applies its own placement and routing rules.
Blocks keeps its planned and fallback drawings.

- The cards beside a container are ranked with the container, so a caller stands above it and
  what the container calls stands below. Blocks' fallback gathers them into a block of their own,
  which wraps them into a grid above the container.
- A cycle turns as few lines as a greedy order finds, so a bundle of many lines keeps its
  direction and the one line against it turns. Blocks' fallback turns whichever line a
  depth-first walk meets last.
- The page holds every point of every line.
- The parent ranks a container as a Graphviz record with one field per port in port order.
  Each line aims at its port's field so that Graphviz can order the doors around the container.
- The pass that pulls a line lapping the drawing back inside prices a crossing at 8 lanes, not
  25: a line crossing a bus square reads at a glance, and a lap round the page does not.
- Lanes folds no ranks into columns side by side: a line between folded columns could only
  leave the bottom of one and enter the top of the other, round the page.
- When a block has ports on its bottom, each wrapped row drops by one rank. This keeps a card
  that connects to a bottom port from standing between rows.
- The ends on each card face form one bus around the center, one lane apart. Their order follows
  the lines that reach them. A narrow face can pack the ends closer. When a port and its lane
  stand up to two lanes apart, the card or container door can slide to line up with the lane.
  The card needs room on its row to move, and its ports keep their positions on the face.
- A line end may land on a card's left or right face, and a line may come through a container's
  side wall onto the card nearest that wall (the owner asked to try it on 2026-11-23, and both
  advisors chose it over top and bottom faces alone, on the paired pictures). An end goes to a
  side only where its line would otherwise leave the face just to turn and run on past the card,
  and only where the picture then bends less, crosses no more lines, and no line crosses the end
  within an arrowhead's length of the card; a wall entry also runs no longer and overlaps no
  line. A line in a bus between two cards lands with the bus. The ends on one side face stand
  centred a lane apart. Over the 111 Lanes readings this cut bends by 7%, area by 3% and line
  length by 4%, with one crossing fewer. Two places the owner named stay as they were: Agent CLI
  to Vault repository, because moving its end off Agent CLI's bottom face re-centres the ends
  there and bends another line, and the climb from Codex app-server, whose way up passes Vault
  repository and leaves no clear run onto Agent CLI's side. A wall entry to a card closer to the
  wall than an arrowhead's length draws the head across the wall: the advisors kept it, the tip
  still touches the card, and a wider side inset for container frames is a follow-up.
- A channel is only as tall as the runs that use it (owner, 2026-11-23: "why we're wasting space
  here"). Each run takes its own lanes, so a hand-off between two lines that read as one no longer
  pushes the rows below it down. Lines of two kinds never read as one and keep no hand-off; the
  advisors chose parting a pair sideways over leaving lanes empty. The room under a channel's last
  track keeps the arrow's approach only where a line ends on a card there.
- Lines between the same two cards the same way travel as one bus, a lane apart over where they
  land, where that crosses and bends no more. A line whose turn ties a knot of join dots and hops
  runs out of its trunk where that unties more knots than it ties and crosses no more lines: the
  advisors chose giving each join its own place over drawing one dot for several. A line that
  crosses a bus because its card stands on the far side of it keeps the route with the fewest
  crossings; placement is the fix there.

Tests hold the bus look, not equality with the fallback: no line words, the lines between two
cards in one bundle a lane apart, the lines bound for one card landing together, cards ranked
with the container they talk to and in the order of its ports, no lap round the README reading,
and every line on its page.

Inline containers were tried and withdrawn on 2026-11-23. The owner left the choice to the two
advisors, who chose to keep each container a block of its own. Lanes drew every container as a
Graphviz cluster of one picture-wide layout, with one routing. A cluster cannot hold the
waypoints of a line that is not its own, so the cards round a container stood beside it on its
ranks, and pages grew wide (Packages 13.2 to 18.8 megapixels, 26 laps round the outermost cards
against 7). Ranking the picture flat and making each frame a rectangle afterwards grew wider
still, or tangled when packed tight. Git keeps both at `b65bf07f29` and in the reverted commits.
Callers then stand in a row above a container, the container reads as one block, and what it
calls stands in a row below.
