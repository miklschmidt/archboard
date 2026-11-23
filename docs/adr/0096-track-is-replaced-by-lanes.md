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

Lanes still starts from the lanes' placement, but it no longer has to draw what Blocks' fallback
draws. Blocks' planned drawings and its fallback do not change. Lanes differs in these ways:

- A cycle turns as few lines as a greedy order finds, so a bundle of many lines keeps its
  direction and the one line against it turns. Blocks' fallback turns whichever line a
  depth-first walk meets last.
- The page holds every point of every line.
- The ends on each card face gather into one group a lane apart, round where their lines come
  from, so the lines bound for one card run together in parallel lanes and land as one bus.
- Lanes draws every container and group region inline, as a Graphviz cluster of the picture:
  every card is ranked in one layout and every line routed in one scene, through each frame,
  not twice with a join at a port. The owner decided this on 2026-11-23, knowing that Track drew
  containers inline too; Track's entry rows, peer rows and sliding ports stay deleted. A card
  outside a container ranks by its own lines, and a card that only calls the container's first
  row stands above it (both advisors chose callers above and callees free).
- The pass that pulls a line lapping the drawing back inside prices a crossing at 8 lanes, not
  25: a line crossing a bus square reads at a glance, and a lap round the page does not.

Tests hold the bus look, not equality with the fallback: no line words, the lines between two
cards in one bundle a lane apart, the lines bound for one card landing together, a caller above
the container it calls, a card a container calls beside the member that calls it, no lap round
the README reading, and every line on its page.
