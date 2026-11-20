---
status: accepted
---

# The renderer core splits into numbers, geometry, the contract and Painting

The owner's advisors decided this on 2026-11-19 (TASK-653.21, candidate 7 of the archboard-deepen
run). It applies [ADR 0058](0058-an-interface-is-the-few-operations-its-callers-need.md) to the
crate `archboard-scene` and keeps what
[ADR 0059](0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md) decides about
the scene. It amends the last decision of
[ADR 0088](0088-a-layout-learns-a-parts-size-from-the-measurer.md), the answers the painter keeps
for the architecture layouts.

## Context

`archboard-scene` held five jobs behind 138 names: the arithmetic and spelling of ECMAScript, route
geometry, the drawing contract and its scene, and the measurer and painter with their private size
sheet. Its callers used disjoint parts. `archboard-graphviz` spelt one number, the painter
WebAssembly read only the scene, and the painters read the scene, the legend and a few marks.
Candidates 2 and 5 of the run had narrowed the scene and Painting, and left 79 names.

## Decision

- **Four crates, in the order they depend on each other.** `archboard-ecma` holds the ECMAScript
  numbers (12 names: `round`, `number`, `to_fixed`, `fixed`, `within`, `hypot`, `min`, `max`,
  `sign`, `pow`, `trim`, `is_space`). `archboard-geometry` holds points, boxes and routes (17).
  `archboard-scene` keeps the contract (12): the drawing, the request and the scene, the reading of
  a picture's key (`legend`) and the speller of an enum's word (`names`). `archboard-painting`
  holds the measurer, the painter and their private size sheet (20). No crate re-exports a name of
  another.
- **Painting's 20 names** are the ten Flow part measures and `paint`, `viewer_marks`,
  `junction_boxes`, `own_icons`, `measure_node` (one operation over `Part::{Card, Container,
  FlowFrame}`), `measure_label` (both plates, `LabelPlates { wide, narrow }`), `diagram_margin`,
  `straight_card_top_contains`, `tab_width` and `header_padding`. The measurer stays with the
  painter, because they share the size sheet (ADR 0088). The crate's one keyed getter stays unspent:
  publishing the sheet through it would undo the private sheet.
- **The far view's widths stay in Painting, behind `viewer_marks`.** The widened widths are built
  from the painter's own line widths, so moving them to the contract would publish sheet sizes.
  `ViewerMarks` carries `far_lines` and `far_scale`. Each painter interpolates the width itself,
  and the canvas painter's stage reads the marks once.
- **`Text::set` is a private builder of Painting.** Shaping a run of words needs the face as well
  as the width, so the contract would need two more names to keep it. The builders of ADR 0084
  become private extension traits in Painting, and tests outside Painting build a `Text` as plain
  data.
- **Icons are decided in `paint`.** `NodeAppearance.icon` is optional, and the painter draws the
  fallback icon where a kind names none or the host lacks it. A part's kind is a `TypeKind`, whose
  `Flow` variant replaces the comparison with the word "flow". The scene still names the icon each
  part is drawn with.
- **Names leave for their one user.** The SVG spellers move into `archboard-svg`, and the
  layout-only geometry into `archboard-layout`. `js_min` and `js_max` fold into `min` and `max`,
  bit for bit, under the speed benchmark.

## Rejected

- **Two jobs in one crate.** Every pair except numbers and the contract is over 20 names, and that
  pair shares no reason to change.
- **A measuring crate below a painting crate, the shared sizes behind one keyed getter.** The
  getter's consumer would be the other half of the same job. ADR 0058 reads that as moved width.
- **The face mapping and `width` public in the contract,** so that `Text::set` could stay. That is
  two names for one builder whose only production caller is Painting.
- **The icon decisions as two names in the contract.** `paint` already holds the fallback.

## Consequences

`archboard-graphviz` depends on `archboard-ecma` alone, and the painter WebAssembly reads only the
contract and geometry itself. The SVG and canvas painters depend on Painting for the viewer marks
alone. For
`archboard-layout` and `archboard-flows` the split only moves names: they still use numbers,
geometry, the contract and Painting. Their gain is that the crates' total falls from 138 names to 61.
