# Archboard visual cheatsheet

This file keeps visual defaults only. Use `archboard help <command>` for
released syntax and options. Follow `src/cli/commands/run.ts` to a command's
Zod `ResultSchema` and inferred type for result behavior. Use
[`cli-workflows.md`](cli-workflows.md) for tested producer-to-consumer chains.

## Coordinates and spacing

The origin is `(0, 0)`. X increases to the right and Y increases downward.

- Keep primary shapes at least 120 by 60 px.
- Allow roughly 12 px of width per label character.
- Use body text at 16 px or larger and titles at 20 px or larger.
- Leave 40 to 80 px between shapes. Labelled connectors often need more room.
- Give a background zone at least 50 px of padding around its contents.
- Align deliberate rows and columns to a 20 px grid.

## Colour and form

Useful stroke and fill pairs:

| Meaning             | Stroke    | Fill      |
| ------------------- | --------- | --------- |
| Warning or failure  | `#e03131` | `#ffc9c9` |
| Healthy or complete | `#2f9e44` | `#b2f2bb` |
| Gateway or entry    | `#1971c2` | `#a5d8ff` |
| Service             | `#9c36b5` | `#eebefa` |
| Queue or async work | `#e8590c` | `#ffd8a8` |
| Datastore           | `#0c8599` | `#99e9f2` |
| External or neutral | `#868e96` | `#e9ecef` |

Use solid fills for primary shapes. A transparent shape is hard to tap except
on its stroke, so reserve transparency for background zones. Draw zones before
their contents. Use a separate text element near a zone edge instead of a bound
label centered over the zone.

## Architecture drawing

Use left-to-right flow, top-to-bottom layers, and containment for ownership.
Keep relationship labels short and omit them when direction already says
enough. Prefer a library stencil for recognizable infrastructure and a labelled
rectangle for a service.

Preserve human groups and stencil attribution. Route supported straight
polylines around unrelated nodes and visual obstacles, then let whole-board
inspection decide whether the route is clean.
