# Architecture work on the canvas

Supplement to `SKILL.md` for using the canvas to build, explore, and refactor
**codebase architecture** with a human — typically on a large touchscreen.

The generic skill covers drawing. This covers the collaborative loop.

## What makes this different from drawing a diagram

A diagram is output. An architecture canvas is a shared workspace: the human
rearranges it, and **the rearrangement is the message**. Pulling two boxes apart
means "these should not be coupled." Dragging one inside another means "this
belongs there." Read the layout, don't just write it.

So the loop is always: **draw → look → read back → interpret → propose.**

Never assume the canvas still looks the way you left it. Start any turn that
touches an existing canvas with `describe`.

## Labels carry the code binding

`customData` and `link` both survive the full round-trip in v2 — including the
frontend sync after a human drags an element. Use them as the semantic channel:

```json
{"type":"rectangle","label":{"text":"AuthService"},
 "link":"file:///abs/path/src/auth/service.ts",
 "customData":{"kind":"service","path":"src/auth/service.ts","variant":"current"}}
```

`link` renders as a tappable affordance on the shape — tap the box on the board,
open the file.

**Caveat:** `describe` does not yet surface either field, so use `query` to read
them until that gap is closed. Elements the human created or moved come back
tagged `"source": "frontend_sync"` and will have no `customData` — that's your
cue to ask what the new box maps to, or to propose a binding.

## Drawing an architecture pass

Author with `add` / `batch_create`, not `mermaid` — mermaid output stays in the
browser until someone presses "Sync to Backend" (see `CLAUDE.md`).

Guidance that holds up on a big screen:

- **One concern per canvas.** Don't put the data model and the request path on
  the same board. Use snapshots to switch between views.
- **Layout carries meaning.** Left-to-right for flow, top-to-bottom for layers,
  containment for ownership. Be consistent — the human will read the geometry
  before the labels.
- **Boxes big, labels short.** A 75" panel viewed from two metres is not a
  laptop screen. Two words plus a path.
- **Draw the edges that matter.** Every call is not an arrow. Show the couplings
  that constrain the refactor.
- **Screenshot and check your own work.** Overlaps and truncated labels are
  invisible in JSON and obvious in a PNG.

## Reading back a human's edits

```bash
./bin/canvas describe
```

Look for:

- **Moved nodes** — proximity and grouping changes are design intent
- **New hand-drawn boxes** — usually a proposed component that doesn't exist yet
  (no path line in the label)
- **New arrows** — a dependency the human wants, or wants removed
- **Deletions** — something they think should not exist

Then say what you infer before acting on it. "You pulled TokenStore out of the
auth cluster — should it become its own module, or just stop importing from
`service.ts`?" is better than silently generating a refactor plan.

## Refactor discussions

Snapshot before and after so the two states can be compared:

```bash
./bin/canvas snapshot save before-split
# ... rearrange, together ...
./bin/canvas snapshot save after-split
```

When the shape is agreed, export to `diagrams/` and commit it with the code
change so the architecture decision is reviewable in the diff.

## Anti-patterns

- Redrawing the whole canvas when the human moved one box. Update in place;
  wholesale redraws destroy their spatial memory of the board.
- Treating an empty `describe` as "nothing happened" — check `status` for
  browser clients first, and remember mermaid output isn't synced.
- Auto-tidying a layout the human arranged. Ask before running align/distribute
  on anything you didn't place yourself.
