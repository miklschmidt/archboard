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

Saved input that says `track` reads as Lanes: the browser's stored choice, a version 1 recipe,
a recorded talk, and an address.

## Consequences

Two engines remain, and they share every part but the planner. A change to the lanes' placement
or the lane router changes Lanes, and Blocks wherever it falls back. Measure such a change on both
engines.

Lanes is not Track. A picture that Track drew draws differently with Lanes: every container is a
block, and no entry-point row or peer row is kept.

Removing Track's code changed no Blocks drawing: 542 corpus drawings, a full native picture, and
the layout fixtures, a fallback drawing among them, are byte-identical before and after.
