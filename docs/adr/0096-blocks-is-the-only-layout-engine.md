---
status: accepted
---

# Blocks is the only layout engine

The owner decided this on 2026-11-22 for TASK-672.
It supersedes the rest of [ADR 0040](0040-track-and-blocks-replace-the-graphviz-engine.md)
and [ADR 0064](0064-blocks-is-the-default-layout-engine.md) where they keep Track.

## Context

ADR 0064 made Blocks the default and kept Track behind `--layout track`, the reader's engine switch and
the settings dialog. Nothing chose Track by default after that, but the code still held two engines.
Track's inline nesting ran through the block tree, the line router, the settle pass and the render
request. Tests ran both engines, and the corpus kept Track's readings. Track also kept 7,803
collinear-port findings that Blocks does not have (ADR 0064).

Agents kept spending time on Track: keeping its readings and corpus tests green, and reasoning about
branches that no default picture reaches. The owner said:

> I really want to delete the track renderer, i'm tired of agents spending time on it, it sucks so
> much and should never be used.

And of the setting:

> There's a rendering engine setting in the settings dialog, that one should go too.

## Decision

Blocks is the only layout engine. Nothing chooses an engine, so nothing names one.

- The core has no engine. The render request carries no `layout`, and a solve's graph carries no
  nesting option. A solve always lays out Blocks.
- Code that only Track reached is deleted with it: inline nesting and its clusters, the peer row
  beside a caller, entry-point rows inside a container, ports that slide along a block's edge, and
  laying out a comparison and then hiding its subjects at paint time. The render request no longer
  carries the whole variant, which only the entry-point rows read.
- The line router that Blocks draws a block's lines with stays. It moves from `src/track` to
  `src/lanes`, so its name no longer reads as the engine.
- The CLI has no `--layout`. A caller that still passes it is refused: "Archboard draws every
  picture with Blocks; --layout is gone."
- The reader's engine switch and the settings dialog's engine row are gone. The browser's stored
  engine preference is no longer read. It is not migrated.
- Tests that ran both engines run Blocks only, with their Blocks checks unchanged. Track-only tests
  are deleted. The native render test draws a Blocks picture.

Saved input still reads. Each case was chosen by what saved data can hold:

- A version 1 render recipe in an old embed may name `track`, `blocks` or nothing. It still parses,
  the value is ignored, and the picture is drawn with Blocks. Version 2 recipes never named one.
- A recorded talk (`talk.json`) may carry `layout`. It still parses, and the value is ignored.
- No address, vault file or server setting names an engine.

Git keeps Track's code at `e28f5e3881`.

## Consequences

There is one engine to maintain and judge. A renderer change is measured on Blocks alone.

An old embed drawn with Track is drawn with Blocks when it is drawn again.

Track's own placements are gone. Blocks never drew entry-point rows or the peer row, so no default
picture changes.
