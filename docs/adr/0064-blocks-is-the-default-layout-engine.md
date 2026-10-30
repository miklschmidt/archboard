---
status: accepted
---

# Blocks is the default layout engine

The owner decided this change on 2026-10-30 for TASK-554.
Blocks draws every architecture that names no layout engine.
Track stays available through `--layout track` and the canvas setting.
Explicit Track requests keep their previous drawings byte for byte.
This amends the default in [ADR 0040](0040-track-and-blocks-replace-the-graphviz-engine.md).

Blocks keeps legacy placement and plans its routes as described in [ADR 0063](0063-blocks-plans-placement-ports-labels-and-trunks-before-routing.md).
A blind council of three graders compared forty Blocks pictures with the renderer on main.
It judged thirty-three better, seven equal, and none worse, with no defect in a Blocks picture.
Blocks has zero hard geometry findings across the complete corpus, while Track retains 7,803 collinear-port findings.
The first Blocks renders of the three timing boards take 190 to 390 milliseconds.

`DEFAULT_LAYOUT_ENGINE` in `packages/board/src/shared/protocol/render-reply.ts` is the only default.
The host resolves it before calling the Rust core, which requires an explicit engine.
The canvas, walkthroughs, and renders share it.
An embed recipe that names no engine follows this default, under [ADR 0057](0057-a-board-render-carries-its-recipe-and-the-check-keeps-embeds-current.md).
An explicit engine in a recipe stays explicit.
