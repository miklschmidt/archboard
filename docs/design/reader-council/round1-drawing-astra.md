# A readable drawing is a bounded explanation

Astra, drawing seat. Round 1, 2026-10-30.

## Position

Both the reading and the layout cause the dead space. Repair both before accepting the reader.

The root does not draw 540 modules. It draws 19 cards and 47 connections. Those cards occupy 4.35% of a 13.95-million-unit picture. The actual browser reduces their 14-unit names to 3.6 pixels. This is a failed starting picture, despite the reduction from Track.

Blocks usually improves these readings relative to Track. That comparison does not establish readability. Some small readings also regress. Command startup has six cards and ten lines, yet Blocks increases area by 17.4% and mean route length by 53.6%.

A good picture of a large recursive model contains one understandable architectural boundary, its immediate parts, and the connections needed to answer one question. The model stays complete. The picture stays small enough to read.

## Evidence and method

This is an independent drawing assessment. I changed no repository files, model inputs, or Backlog tasks. I did not investigate solve time.

The source checkout was `integrate/pr19`, at `e25b6cc34fd2222356eeed2f0af60e80c89f574d`. The captured model contains 540 modules and 1,117 relationships. Its revision digest is `ec8bf874bf8c8e4fca5e675a011c1dc9fe71e0c8a682d5d90470e3df54ce6ba9`.

I captured the model and root render from the running server at `http://127.0.0.1:17842`. I then called the public `projectModel` and `renderArchitecture` interfaces from scratch scripts. Each Blocks/Track pair receives the same projection, complete model, and presentation policy. The root matches the server render at 4,983×2,799 units.

I rendered nine real readings through both engines. These include roots, direct scopes, and scopes four or five levels into the model. I also rendered six controlled content experiments. Every screenshot listed below was inspected. The standalone HTML pages include the repository's exact theme stylesheet. The live browser capture uses its existing dark theme.

The evidence directory is `/tmp/integrate/reader-council/evidence/drawing-astra/`. It contains the captured model, projections, SVGs, rendering receipts, measurement scripts, and `measurements.json`. `render.ts`, `render-small.ts`, `experiments.ts`, `make-pages.py`, and `measure.py` record the method.

Measurements use these definitions:

1. Picture area is the returned width multiplied by height, in diagram units squared.
2. Card area is the union of painted node rectangles. It excludes container frames and headers. A frame is not a filled card.
3. Occupied word boxes include cards, header plates, relationship labels, and group captions. Their complement includes necessary routing space and waste.
4. An empty pocket contains no card or word box. Lines do not fill it, following `docs/design/grading-council/criteria.md:21`.
5. Mean route length comes from each visible SVG relationship path through `getTotalLength()`. It includes rounded bends and crossing decoration, once per relationship.
6. Nearest gap is the shortest distance between a card rectangle and another card rectangle. It excludes the parent frame.
7. Full-screen fit uses `min(1920 / width, 1080 / height)`. The live pane calculation uses 1,271×992 pixels after chrome and margins.

The path measure is consistent across these pairs. It is not identical to the older corpus measure of undecorated route segments. The sample is deliberate, not a random estimate of all readings.

## What the projection actually puts in a picture

A projection selects the model content that one picture draws.

| Reading                | Immediate children | Outside context | Parent header | Drawn lines | Underlying relationships represented |
| ---------------------- | -----------------: | --------------: | ------------: | ----------: | -----------------------------------: |
| Root                   |                 19 |               0 |             0 |          47 |                                  214 |
| Browser                |                  8 |               2 |             1 |          44 |                                  102 |
| Workspace packages     |                  8 |              14 |             1 |         103 |                                  338 |
| renderer               |                 12 |              10 |             1 |          42 |                                   85 |
| Layout and measuring   |                  7 |               7 |             1 |          22 |                                   29 |
| Camera and pointer     |                 13 |               4 |             1 |          33 |                                   37 |
| Canonical architecture |                  8 |               7 |             1 |          48 |                                  124 |
| Key and export         |                  3 |               3 |             1 |           7 |                                    8 |
| Command startup        |                  3 |               3 |             1 |          10 |                                   18 |

Observed: the reader already limits visible containment depth. It does not recursively expand every descendant. `projectScope` selects immediate children and opens only the selected scope (`packages/board/src/shared/rules/model-projection.ts:65`).

However, relevance includes every relationship touching any descendant (`model-projection.ts:56` and `:64`). Those endpoints collapse to visible ancestors. Every resulting outside endpoint becomes context (`:68` and `:74`). There is no visible-card, connection, or text-size budget.

The projection groups by kind and comparison standing before grouping endpoint pairs (`model-projection.ts:342`). Therefore one pair of visible modules can retain several parallel connections. At root, 47 drawn lines cover only 29 directed endpoint pairs. Workspace packages receives 35 incident lines. Archboard server receives 14.

This is the content failure: one level of visible containment still imports the interaction complexity of an entire subtree. Clicking deeper does not reliably produce a smaller explanation.

The root also gives runtime components, evaluation tools, rendering dependencies, and archive infrastructure equal visual standing. This is visible in `root-blocks-fit.png`. The names include Browser, Eval script, Pretext, Graphviz, Claude CLI, and Configured archive remote. That is an inventory of roots, not a clear introduction to the product.

## Equal-content Blocks and Track measurements

In the following table, each paired value is Blocks / Track. M means one million square diagram units. Card occupancy is card area divided by picture area.

| Reading                | Picture area, M | Total card area, M |  Card occupancy | Mean line length | Blocks area change |
| ---------------------- | --------------: | -----------------: | --------------: | ---------------: | -----------------: |
| Root                   |   13.95 / 16.41 |      0.607 / 0.607 |   4.35% / 3.70% |    1,825 / 2,197 |             −15.0% |
| Browser                |     6.12 / 9.67 |      0.301 / 0.301 |   4.91% / 3.11% |    1,234 / 1,896 |             −36.7% |
| Workspace packages     |   41.84 / 67.18 |      0.588 / 0.594 |   1.40% / 0.88% |    3,423 / 5,861 |             −37.7% |
| renderer               |     7.96 / 7.86 |      0.655 / 0.655 |   8.23% / 8.33% |    1,231 / 1,071 |              +1.2% |
| Layout and measuring   |     3.86 / 4.60 |      0.459 / 0.459 |  11.89% / 9.98% |    1,217 / 1,408 |             −16.0% |
| Camera and pointer     |     4.90 / 5.71 |      0.538 / 0.538 |  10.98% / 9.43% |    1,371 / 1,145 |             −14.1% |
| Canonical architecture |     8.27 / 8.24 |      0.461 / 0.461 |   5.57% / 5.59% |    1,737 / 1,658 |              +0.3% |
| Key and export         |   0.974 / 1.258 |      0.208 / 0.208 | 21.40% / 16.56% |        470 / 616 |             −22.6% |
| Command startup        |   1.280 / 1.091 |      0.197 / 0.197 | 15.40% / 18.08% |        718 / 467 |             +17.4% |

Blocks has less area in six of nine pairs. It has shorter average routes in five. Camera and pointer saves area but increases mean line length by 19.8%. The renderer and Canonical architecture readings offer no meaningful area advantage.

The nearest-neighbor statistic also needs context. Root cards often have another card only 40 units away. Yet connections travel an average of 1,825 units, over five typical card widths. Small gaps within a row coexist with enormous gaps between useful collaborators.

| Reading                | Mean nearest gap, Blocks / Track | Mean gap between connected rectangles, Blocks | Area outside word boxes, Blocks / Track |
| ---------------------- | -------------------------------: | --------------------------------------------: | --------------------------------------: |
| Root                   |                        111 / 117 |                                         1,298 |                           94.3% / 95.1% |
| Browser                |                        274 / 367 |                                           702 |                           91.7% / 94.7% |
| Workspace packages     |                        280 / 466 |                                         2,334 |                           97.6% / 98.5% |
| renderer               |                        147 / 139 |                                           813 |                           89.3% / 89.2% |
| Layout and measuring   |                          80 / 93 |                                           870 |                           84.6% / 87.1% |
| Camera and pointer     |                         65 / 178 |                                           864 |                           85.3% / 87.4% |
| Canonical architecture |                        134 / 238 |                                         1,206 |                           92.3% / 92.3% |
| Key and export         |                         42 / 137 |                                           315 |                           71.8% / 78.2% |
| Command startup        |                         70 / 108 |                                           557 |                           78.8% / 75.1% |

These percentages do not mean that every unfilled unit is removable. Connections need clearance. The measured pockets below distinguish specific waste from that necessary space.

## Readability at 1920×1080

The SVG uses 14-unit card names, 11-unit responsibility text, and 10-unit relationship labels. The full-screen captures give the drawing every pixel. The application gives it considerably less.

| Reading                | Blocks dimensions | Track dimensions | Full-screen name size, Blocks / Track | Actual-pane name size, Blocks | Enlargement from pane fit to scale 1.2 |
| ---------------------- | ----------------- | ---------------- | ------------------------------------: | ----------------------------: | -------------------------------------: |
| Root                   | 4,983×2,799       | 5,126×3,201      |                          5.4 / 4.7 px |                        3.6 px |                                  4.70× |
| Browser                | 3,291×1,860       | 3,639×2,656      |                          8.1 / 5.7 px |                        5.4 px |                                  3.11× |
| Workspace packages     | 7,577×5,522       | 8,718×7,706      |                          2.7 / 2.0 px |                        2.3 px |                                  7.15× |
| renderer               | 3,107×2,562       | 2,882×2,729      |                          5.9 / 5.5 px |                        5.4 px |                                  3.10× |
| Layout and measuring   | 3,106×1,244       | 2,441×1,885      |                          8.7 / 8.0 px |                        5.7 px |                                  2.93× |
| Camera and pointer     | 2,659×1,843       | 3,446×1,656      |                          8.2 / 7.8 px |                        6.7 px |                                  2.51× |
| Canonical architecture | 2,874×2,878       | 2,786×2,959      |                          5.3 / 5.1 px |                        4.8 px |                                  3.48× |
| Key and export         | 1,162×838         | 1,206×1,043      |                        18.0 / 14.5 px |                       15.3 px |                                  1.10× |
| Command startup        | 1,168×1,096       | 1,114×979        |                        13.8 / 15.4 px |                       12.7 px |                                  1.33× |

Scale 1.0 makes current card names 14 pixels. Scale 1.09 makes responsibility text 12 pixels. Scale 1.2 makes relationship labels 12 pixels, names 16.8 pixels, and responsibility text 13.2 pixels. These are proposed product thresholds, not a claimed universal limit of human vision.

The live root capture measures the picture at 1,271×713.93 pixels, with scale 0.255067. Its responsibility text is 2.8 pixels and labels are 2.6 pixels. The measurement comes from the SVG rectangle and its surface transform. See `/tmp/integrate/reader-council/evidence/drawing-astra-root-browser.png`.

At scale 1.2, the root occupies about 5,980×3,359 pixels. A 1920×1080 window sees only part of it. Both `root-blocks-readable-crop.png` and `root-track-readable-crop.png` use that same scale. Workspace packages becomes readable, but most endpoints leave the image. The crop fills with parallel lines. Enlargement restores letters and loses the explanation.

Key and export is the useful counterexample. Its six cards, seven lines, and short internal chain form an explanation that fits. Its container has only a 44-unit-high empty band beyond the header allowance. Command startup shows why a card-count limit alone is insufficient.

Layout and measuring exposes another limitation of area-only comparisons. Blocks saves 16% area but spreads content horizontally. Its pane-fit names are 5.7 pixels, against Track's 7.3 pixels. Less area does not guarantee larger text in the actual pane.

## Controlled experiments separate content from layout

These are diagnostic drawings, not proposed replacements. They alter only scratch copies of projected content.

| Experiment                                          | Nodes including parent | Lines | Area before → after | Area reduction |
| --------------------------------------------------- | ---------------------: | ----: | ------------------: | -------------: |
| Root, remove edge labels                            |                     19 |    47 |      13.95M → 5.17M |          62.9% |
| Browser, remove edge labels                         |                     11 |    44 |       6.12M → 2.17M |          64.5% |
| Root, one neutral counted line per directed pair    |                     19 |    29 |      13.95M → 4.24M |          69.6% |
| Browser, one neutral counted line per directed pair |                     11 |    32 |       6.12M → 3.27M |          46.6% |
| Browser, immediate contents only                    |                      9 |    21 |       6.12M → 2.32M |          62.1% |
| Workspace packages, immediate contents only         |                      9 |    47 |      41.84M → 5.53M |          86.8% |

Removing labels preserves module identities, relationships, kinds, directions, responsibilities, and groups. Card dimensions can change because port requirements change. The root card area changes by less than 1%. The page area changes by nearly 63%.

Root label boxes occupy only about 0.19M square units. Their removal saves 8.78M. Browser label boxes occupy about 0.18M, but their removal saves 3.95M. This establishes strong amplification between labels and layout constraints.

It does not prove that a particular provisional-label candidate won. I did not instrument candidate selection. The code mechanisms below explain how that amplification can arise.

The counted-pair experiment changes both aggregation and line treatment. Its counts describe merged displayed lines, not underlying canonical relationship counts. It proves available geometric headroom, not a safe semantic design. Production must retain exact underlying identities and distinguish incompatible meaning.

The contents-only experiments remove every external endpoint and its lines. Their labels remain. They prove that automatic context expansion is expensive. They also show its limits: eight Workspace children still produce 47 lines and only 2.8% card occupancy. Context control alone cannot repair that picture.

## Named dead areas and their causes

Coordinates below use diagram units. A typical card is 340×88 units in the large readings. The measurements exclude card and label rectangles.

### D1. Root: the lower-right vacancy and the long fan from Workspace packages

Observed: a 2,037×1,481 pocket begins near `(2926, 1298)`. Its area is 3.02M, about 101 typical cards. It occupies the lower-right part of `root-blocks-fit.png`. The upper half also holds long departures toward a horizontal row of outside tools. Workspace packages sits far from Archboard server, with routes up to 3,644 units.

Named cause: a wide dependency rank and label-driven spacing establish global width and height. The final router inherits those positions. Moving label plates onto routes does not repack the cards around the resulting holes.

Source evidence: `blocks/card_graph.rs:171` inserts a label node between endpoints. `blocks/legacy.rs:83` wraps a widest rank or folds ranks. `blocks/planned/fixed.rs:1` routes a fixed placement. The label-removal experiment demonstrates the resulting sensitivity.

Required change: treat labels as local corridor occupants during placement. Repack connected groups around local holes. Keep the main runtime exchange together. Do not align every support dependency into one global rank.

### D2. Browser: a large empty frame with only eight children

Observed: the Browser frame is 3,251×1,609 units. Child cards occupy 4.60% of it. Its right interior contains a 648×985 pocket. That pocket is over eleven typical card heights. See `browser-blocks-fit.png`.

Named cause: the outside interface becomes a major part of the inside composition. Workspace packages contributes fifteen incident lines in this reading. Panes and workspace contributes fourteen. Full descendant context crosses the frame and separates its children.

Source evidence: `model-projection.ts:56` selects descendant relationships. `blocks/card_graph.rs:62` reserves top and bottom port ranks. `blocks/tree.rs:184` sizes port walls from the port count. These are supported mechanisms, not proof that each reservation determines the final pixel.

Required change: make the default interior reading primarily about its children. Show a small, explicit set of interface neighbors only when the reading asks for them. Attach those neighbors beside the children that use them. Place the boundary around that composition, instead of letting remote context dictate its size.

### D3. Workspace packages: context outside, layer corridors inside

Observed: fourteen outside cards surround eight child layers. A 3,513×2,944 pocket begins near `(4044, 2558)`. Inside the parent, a separate 1,604×1,336 pocket remains. Child cards occupy less than 1% of the parent frame. The longest line measures 10,245 units.

Named causes: context expansion creates much of the outside area. Inside, aggregation by kind still leaves 47 lines between eight numbered layers. Those layers summarize broad implementation sets. They hide the specific responsibilities that explain each connection.

Source evidence: `model-projection.ts:64`, `:342`, and `:428`. The full and contents-only screenshots expose both problems. Above 64 relationships, `blocks/planned/mod.rs:64` accepts the first successful placement. `blocks/legacy.rs:410` omits wider alternatives unless complete repair is required.

Required change: show package structure as structure first. A selected layer opens its actual modules. A connection reading shows one selected dependency question with exact membership. Do not make the complete cross-layer relationship inventory the default picture. Dense readings also need the same visual acceptance floor as smaller ones.

I do not claim that extra repair padding caused this specific result. The source permits extra room, but this experiment did not record which repair attempt ran.

### D4. renderer and Canonical architecture: local holes survive global contraction

Observed: renderer contains a 1,694×488 interior pocket. Canonical architecture contains a 677×1,790 interior pocket. Their full-page largest pockets are 1.33M and 1.54M. Both are visible in the named fit screenshots.

Named cause: contraction removes empty strips across an entire axis, not holes within one region. A bend or label elsewhere protects the same coordinate band. The layout can retain a large empty corner even after contraction succeeds.

Source evidence: `blocks/planned/compact.rs:10` stores occupied axis intervals. `:158` protects endpoint boxes, labels, route points, and boundaries. The transform preserves coordinate order. It cannot move one local cluster into another cluster's unused corner.

Required change: add local placement improvement around connected clusters. Score the largest empty pocket inside each frame. Preserve correct routes and membership, but permit a new arrangement when the existing topology traps large holes.

### D5. Layout and measuring and Camera and pointer: sparse context bands

Observed: Layout and measuring has a 2,290×259 empty band between the upper context row and its internal work. Camera and pointer has a 1,244×360 interior gap below its header and upper context. The latter saves page area but lengthens routes.

Named cause: callers, context, headers, and internal rows establish separate bands. Final area and route scoring do not directly minimize the distance between each important collaborator or maximize text size in the actual pane.

Source evidence: `blocks/card_graph.rs:60`, `blocks/wraps.rs:19`, and `blocks/planned/reading.rs:64`. Final candidate ranking favors clear approaches, then route cost. Area is a relative admissibility condition at `reading.rs:94`. The reference aspect ratio is fixed at 1.4 (`crates/archboard-layout/src/constants.rs:19`).

Required change: score actual fitted text size together with local collaborator distance. Let context sit beside the relevant internal cluster. Use the available pane rectangle. Do not prefer a wider picture merely because its total area falls.

### D6. Command startup: unnecessary separation in a small reading

Observed: the three children descend diagonally across a 1,016×747 frame. A 616×240 interior pocket remains. Track groups the three-step spine more closely and has shorter routes. See both startup screenshots.

Named cause: the chosen Blocks arrangement separates a short internal chain to accommodate external calls and their labels. The final valid arrangement is not the best reading of that chain.

Required change: retain the short connected spine as a local unit. Place its external neighbors around it. Include this small case in acceptance so that a large-corpus average cannot hide a clear local regression.

The Key and export frame demonstrates restraint that already works. Its internal gap is less than half a typical card height. Keep that quality. Do not remove useful breathing room merely to raise occupancy.

## What the earlier claims establish

The accepted design is a hybrid. Legacy Blocks owns placement. Planned routing owns final routes and labels (`docs/design/blocks-planned-layout.md:8`). It is not the original replacement-placement proposal preserved later in that file.

The final corpus reports a 25.03% plain-area reduction against its base. Against main, it reports 12.64%. Comparison area rises 1.33% against main (`blocks-planned-layout.md:222`). Those are different baselines and reading populations.

Council 563 reports 33 better pairs, seven equal pairs, and none worse. Its reported improvements include K +1.56 and W +1.07 (`blocks-planned-layout.md:245`). Those findings concern saved boards and views, not this new canonical projection's live root and recursive defaults. I did not rerun those historical inputs.

These results can be true while the current product fails. The present measurements also find relative improvement in most large pairs. They do not find readable first views.

The council already defines the relevant defect in composition. Empty regions crossed only by lines remain empty. Browser, Workspace packages, and Canonical architecture exceed its six-card-height K=1 anchor. This is an application of that anchor, not a complete new council score.

The acceptance gap is absolute readability. W carries only seven points and the decision compares relative weighted scores (`criteria.md:74` and `:108`). A picture can improve while remaining unreadable. The council also gives the drawing all 1920×1080 pixels. The real root gets only 1,271 pixels of usable width.

Keep the geometry guards and comparative evidence. Add an absolute first-view requirement in the actual shell. Neither zero geometry findings nor a relative win can substitute for it.

## Choose the picture before laying it out

### The default scope

Use one authored orientation reading as the first picture. It must identify the main product boundary and the main exchange. It must reference canonical identities without copying architecture.

For this repository, that reading needs the agent, the CLI, the server, the browser, and architecture inputs. It can include the Codex service where it explains agent execution. Evaluation tools and renderer dependencies belong in later readings. The agent must establish the exact connections from the model, not invent a runtime story from names.

If no orientation reading exists, show the root modules as a clearly labeled module index. Keep that index readable. Do not imply that absent lines mean absent relationships. Expose connections when the reader asks a connection question. An index of nineteen roots is more honest than a failed universal system picture.

The default must be stable. Do not silently pick high-degree modules or drop low-ranked relationships whenever the model changes.

### Depth and picture size

Keep one level of containment open by default. Opening a module replaces the reading with that module's immediate contents. Preserve the parent in the navigation trail. Do not expand every ancestor and sibling into the picture.

Target six to ten principal cards and roughly eight to fifteen drawn connections for an introductory reading. These are starting budgets, not model limits. The measured text-size floor decides whether a particular drawing fits. The six-card startup result proves why counts alone cannot decide.

Use at least 14-pixel card names and 12-pixel essential labels in the first frame at 1920×1080. With current intrinsic fonts, that means a scale of 1.2. The docked pane then holds roughly 1,059×827 diagram units. A different type system changes that budget, so measure the resulting drawing.

If the requested contents exceed the budget, preserve all direct children in the navigation interface. Offer a smaller named reading or a selected submodule. Show the scope and omitted-context count. Do not automatically zoom out until the text disappears.

A reader can explicitly request the complete connection map and pan through it. That map is a different reading purpose from the first explanation. It must not become the default merely because the model supports it.

### Outside context

The default interior reading contains the children and their internal relationships. Add only the interface neighbors necessary for the stated question. Start with one to three such neighbors when they fit.

Provide a direct action to inspect the complete boundary connections. That action can produce a dedicated connection reading. It must preserve source direction, destination, and underlying identities. It must say when a closed module represents hidden descendants.

Do not automatically draw every connection that touches a hidden descendant. Do not recursively expand an outside endpoint just because the selected scope is deep. This is the largest projection change that the measurements support.

### Relationship aggregation

Keep one connection per visible source, destination, and meaningful relationship family. Preserve direction. Keep incompatible comparison states distinguishable. Store the full underlying relationship list in the derived connection, as the current `joins` contract already does.

For a system orientation, distinguish the few families that answer that reading's question. Move implementation dependencies into their own reading. Do not draw every HTTP, event, call, data, render, and dependency distinction merely because the model contains it.

Do not silently merge unlike relationships into a majority kind. The neutral counted-pair experiment is not a production specification. An explicit aggregate must identify itself as mixed when its members differ. Selecting it must reveal those members.

Do not expand every member label into a stack. Use a short semantic caption when the shared meaning is established. Add a compact count only when it helps. “28 relationships” supplies quantity without explaining the dependency. It must not be the primary meaning of the line.

### Labels and card text

Names identify responsibilities. A short responsibility sentence helps when the name is insufficient. Detailed prose and source bindings belong in inspection. The projection already removes long descriptions and bindings, but it retains responsibility text (`model-projection.ts:375`).

Keep essential labels readable without hover. Place one concise label near the relevant local exchange. Reveal complete authored wording in selection and in an explicit detailed export. Never change architecture text merely to satisfy geometry.

The planner currently prefers the midpoint of the longest private run (`blocks/planned/route_labels/mod.rs:249`). That protects ownership, but a long run can place a label far from the reader's starting card. Evaluate label-to-endpoint distance as well as label clearance.

Showing labels only near the pointer can help exploration. It cannot rescue a diagram that fails as a still picture or exported SVG.

## Required layout changes and acceptance

The change must leave architects with a readable explanation on first arrival. It must let them follow a connection without losing both the current boundary and its endpoints.

1. Replace provisional global label ranks with local label room during candidate placement. Preserve full label measurement and clearance. The label-removal experiments are the regression references.
2. Improve placement locally after routing reveals a large hole. Whole-axis contraction remains useful, but it cannot close local vacancies.
3. Keep strongly connected local chains together. Place outside neighbors around their actual consumers. Preserve containment without using one global top-to-bottom rank for every connection kind.
4. Rank pictures by fitted essential text size, empty pockets, and collaborator distance as well as crossings and bends. Use the actual pane rectangle.
5. Apply an absolute visual floor to dense scopes. A first successful guarded picture is not automatically an acceptable picture.
6. Preserve exact identities, visible aggregation, complete exports, and the existing geometry guards. Do not hide incorrect routes or erase relationships to achieve a smaller score.

Acceptance needs the nine real readings in this paper, not only historical board fixtures. Keep every Blocks/Track comparison on identical projected content. Keep controlled content experiments separate from layout comparisons.

Measure page area, total card area, occupied word boxes, largest empty pockets, and mean and longest routes. Measure text after the actual shell fits the picture. Inspect both the complete image and a fixed readable scale.

Require the proposed default readings to meet the text floor. Require their main exchange to remain visible at that scale. Apply the council's K pocket test to each open frame. Reject a local regression like Command startup even when the corpus mean improves.

The result must be a sequence of clear pictures through one complete recursive model.

## Pictures inspected

The application capture is `/tmp/integrate/reader-council/evidence/drawing-astra-root-browser.png`.

The following paths are all under `/tmp/integrate/reader-council/evidence/drawing-astra/`:

- `root-blocks-fit.png`
- `root-track-fit.png`
- `browser-blocks-fit.png`
- `browser-track-fit.png`
- `workspace-blocks-fit.png`
- `workspace-track-fit.png`
- `renderer-blocks-fit.png`
- `renderer-track-fit.png`
- `layout-blocks-fit.png`
- `layout-track-fit.png`
- `camera-blocks-fit.png`
- `camera-track-fit.png`
- `canonical-blocks-fit.png`
- `canonical-track-fit.png`
- `keyexport-blocks-fit.png`
- `keyexport-track-fit.png`
- `startup-blocks-fit.png`
- `startup-track-fit.png`
- `root-blocks-readable-crop.png`
- `root-track-readable-crop.png`
- `root-nolabels-blocks-fit.png`
- `root-paircounts-blocks-fit.png`
- `browser-nolabels-blocks-fit.png`
- `browser-paircounts-blocks-fit.png`
- `browser-inside-blocks-fit.png`
- `workspace-inside-blocks-fit.png`

The fit screenshots use 1920×1080. The readable crops use 1.2 pixels per diagram unit. The matching SVG and HTML share each picture's prefix.
