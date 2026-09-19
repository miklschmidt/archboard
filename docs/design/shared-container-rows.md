# Cards alongside containers

TASK-278, 2026-09-19. The Phone ownership view of Common-WebLib exposes the
compound layout's outer-layer reservation: the Phone API host is above the
whole assembly, and its outgoing dependencies are below the whole assembly.
The desired improvement is for outside cards to use the vertical span beside
a container, preserving containment and the identities of actual endpoints.

## Reproduction and baseline

`wide-board-layout-fixtures/phone-ownership.content.json` is the scoped current
architecture from the reported board. It retains the original subject ids,
visible text, relationships and emphasis. Unrelated parts, bindings and source
descriptions are omitted because they do not affect this layout question.

Render through `renderArchitecture` with the default policy, dark theme and
embedded fonts. The existing measure script includes this fixture automatically:

```bash
SAVE=/tmp/layout-baseline.json ALL=1 PICTURES=1 \
  bun docs/design/wide-board-layout-fixtures/measure.ts /tmp/layout-baseline
```

The isolated investigation starts at commit `d1307893`, a snapshot of the
source checkout's existing work including TASK-276. No source-checkout files
were changed by this investigation. Its original 22-item fixture/vault corpus
completed successfully before experimentation; the phone fixture is additional.

The measured phone baseline is 953 by 1192 diagram units, fit 0.754, total
route length 1630, zero route crossings, zero routes through cards and zero
labels off their runs. Fit uses the repository's reference pane and is capped
at one. Engine-only experiments using an uncapped 1792-pixel pane gave
misleading fit numbers; those are not the acceptance evidence.

## What the current engine permits

The ordinary graph nests children under an actual frame node and requests
ELK layered layout with INCLUDE_CHILDREN and LONGEST_PATH_SOURCE. Cross-frame
relationships are split at explicit boundary ports. The renderer's rank map
chooses attachment faces; it does not independently place a child in a global
row shared with outside cards.

A minimized frame with an internal three-card chain and incoming/outgoing
outside chains retained the outer frame layer when varying boundary faces,
layering strategies, node placement, post-compaction, interactive hints and
partition constraints. This is evidence about the configurations tried, not
proof that every possible ELK graph representation must fail.

A different native representation does allow vertical overlap:

- The outer graph reads RIGHT with BRANDES_KOEPF placement.
- Each actual frame reads DOWN with SEPARATE_CHILDREN and NETWORK_SIMPLEX.
- Outside cards are grouped by connected component after excluding frames;
  transparent, zero-padding engine nodes hold those vertical chains.
- Explicit EAST/WEST boundary ports connect the columns. The wrappers are
  removed from the result without changing any solved coordinate.

This representation uses the existing engine, but geometry alone is not
sufficient. The full renderer's label reservations, rounded paths and shared
route separation must also produce a readable result.

## Measured candidate results

| Candidate                               |   Fit | Route length | Crossings |
| --------------------------------------- | ----: | -----------: | --------: |
| Current renderer                        | 0.754 |         1630 |         0 |
| Columns, separate SOUTH source ports    | 1.000 |         2173 |         1 |
| Columns, shared SOUTH source port       | 1.000 |         2285 |         0 |
| Columns, shared EAST source port        | 1.000 |         1844 |         1 |
| EAST source with reversed wrapper order | 0.943 |         1725 |         1 |
| Preliminary Dagre compound experiment   | 0.952 |          968 |         0 |

The column candidates were rejected. The outgoing DataLib chain can sit beside
the assembly, but the route leaves the assembly's foot and loops upward to it.
Sharing the source port avoids a crossing with SOUTH attachment at the price
of more route length. EAST attachment shortens the route but leaves a crossing
where shared runs separate. Moving reserved labels to inter-column sections,
changing target faces, source ordering, boundary sharing, alignment and spacing
did not meet the combined acceptance conditions. Forcing model order for this
one fixture is not an acceptable general rule.

Dagre's compound ranking, already available as a transitive development
package, places the API host beside the assembly and reduces the page to
1064 by 944. Its prototype uses artificial title nodes and a provisional
orthogonal conversion of its polylines. It is evidence that global ranking
can improve this graph, not a production implementation: container endpoints,
precise header insets, arbitrary route clearance and the wider corpus remain
unverified.

## Graphviz and libavoid experiments

The user approved testing `@viz-js/viz` and subsequently `libavoid-js`.
Versions 3.30.0 and 0.5.0-beta.5 are installed only in the isolated worktree.

Graphviz through `@viz-js/viz` demonstrates the needed placement.
Graphviz's [newrank](https://graphviz.org/docs/attrs/newrank/) explicitly enables
a single ranking across cluster boundaries, and its dot engine includes
orthogonal routing. [Viz.js](https://viz-js.com/api/) packages it as WebAssembly
for JavaScript, making a common browser/server engine possible.

Use the same measured card and title sizes and the existing SVG painter,
label checks and scorecard. First prove the Phone fixture and the minimized
cross-container cases; then assess frame endpoints, nested containment,
parallel relationships, cycles, both readings, label reservations and engine
startup/solve costs. Do not choose an engine or implement a bespoke global
ranker based solely on one attractive picture.

Graphviz alone produced a 857 by 920 picture with route length 607, but one
reserved label was off its run and a route crossed the full header band.
Representing labels as measured dummy nodes improved clearance, but Graphviz
attached their incoming and outgoing segments at different horizontal positions,
leaving a diagonal join hidden by a badge. The existing scorecard did not detect
that join. This agrees with Graphviz's documented
[orthogonal routing limitation](https://graphviz.org/docs/attrs/splines/): it does
not handle ports or dot edge labels. Those pictures are not valid candidates.

The next prototype retains Graphviz placement and uses libavoid for routing.
Actual cards, complete header bands and reserved label boxes become obstacles;
fixed connection pins preserve attachment faces and aligned entry/exit through
a label. Reusing a pin class for a shared shape/face matters: separate coincident
classes produced an invalid fallback route even with nonexclusive pins.

The first Phone result is 923 by 944, fit 0.952, route length 1333, zero
crossings, zero routes through cards and zero labels off their runs. The host
shares vertical space with the frame. Raw routes are additionally checked for
axis alignment, continuity and obstacle clearance; the scorecard alone is
insufficient evidence. This is still a prototype: frame endpoints, transposed
headers, nested containment and the wider corpus must pass before integration.

## Public API independent variant

The user requested `common-weblib@public-api-independent` from the architecture
design workspace as a larger case. The source family was version 13, variant
`GwWurFMu`: 21 nodes, 25 relationships, two containers. The committed
`wide-board-layout-fixtures/public-api-independent.content.json` preserves the
complete architecture and visible text, removing bindings, descriptions and
walkthroughs that do not affect this layout test. The source board was read only.

| Candidate                                         | Size        |   Fit | Route length | Crossings | Bends/route | Render time |
| ------------------------------------------------- | ----------- | ----: | -----------: | --------: | ----------: | ----------: |
| Existing renderer                                 | 2243 × 3194 | 0.282 |        22481 |        21 |        2.24 |      154 ms |
| Graphviz + libavoid, iterative label reservations | 2695 × 1645 | 0.472 |        16096 |         5 |        2.48 |     1910 ms |
| All labels reserved up front                      | 3042 × 1687 | 0.418 |        16948 |         0 |        3.52 |      160 ms |

Separating reserved placement space from mandatory routing waypoints preserves
that last candidate's 3042 by 1687 placement while reducing bends from 88 to
56 (3.52 to 2.24 per relationship), route length from 16948 to 16428, and keeping
zero crossings. It reserves every measured label in Graphviz, initially routes
without forcing the labels through those boxes, then uses the existing clear-run
label placer; only labels that still have no run request a fixed waypoint.
This took 37 solves, about 549 ms in the first run. The drawn result again passed
endpoint identity, containment, complete header avoidance and unrelated-frame
avoidance; all 37 raw solves were orthogonal and obstacle-clear.

These are individual prototype measurements, not latency benchmarks; engine
initialization before the measured render is excluded. The iterative version
made 185 solves; reserving all labels up front required five. Both pictures
passed the existing card/label checks and additional drawn endpoint,
containment, full-header and unrelated-container checks. Their raw selected
routes were axis aligned and joined opposite label pins continuously.

The user found the larger picture substantially better but identified the
extra bends introduced by forced label waypoints. The corpus supports that
concern: all 24 fixtures/vault variants rendered, but bends worsened on all
22 cases with a saved baseline; fit worsened on 17. All-label reservation is
therefore not accepted as a general replacement. Separating
placement reservations from routing waypoints addresses the reported bends on
the larger board. Reserving every label's placement space still makes the Phone
case too tall (852 by 1361, fit 0.661), so this is not an accepted universal
replacement. The earlier selective-reservation Phone candidate remains better.

## TALA

The user's suggestion was investigated against D2 0.9.0 and its JavaScript
package. [D2 0.9.0](https://d2lang.com/releases/0.9.0/) now bundles the open-source
TALA engine, including in JavaScript/WASM. A direct Bun experiment confirmed
measured shape dimensions and orthogonal parallel/container routes. Its compound
layout still placed the incoming chain above the container and the outgoing
chain below in the Phone-like case tested. The JavaScript interface compiles D2
source rather than exposing a layout-only graph API. It therefore did not solve
the shared-row requirement in this experiment; that is not a claim about every
possible TALA configuration.

The sections above record the isolated experiment. Production adoption follows below.

## Production adoption: shared ports and natural routes

The user requested adoption, then rejected constraints introduced while trying
to preserve the previous renderer's routing conventions. The final implementation
uses Graphviz global cluster placement and libavoid obstacle routing in both
Bun and browser workers. Relationships of the same kind share face ports; different kinds receive
distinct physical attachment positions. libavoid chooses the attachment and
routes between the separate ports. Relationships retain their own identities,
labels, traffic and Standing even when their lines share a port or trunk.

Deleted: explicit boundary splitting and flank policies, port ordering and
spreading, endpoint checkpoints, minimum jog/approach allocations, route fanning,
post-layout jog repair, folded-layout exceptions, and the multiple-flank scorecard
search. The prototype's 8px obstacle buffer, 12px nudging distance and segment penalty
20 remain. Transparent frame endpoints additionally need enough approach room
for the actual architecture arrowhead plus a rounded bend. Increasing the
global obstacle buffer broke tight parent-child relationships, so that
experiment was rejected. Incoming transparent frame faces instead have one
shared native arrival corridor: the pin stays on the visible perimeter,
normal to the frame, with 12px for the straight approach and 8px for its bend.
An external frame arrival chooses the nearest clear face center; the old
center-direction heuristic could point into a corridor blocked by an adjacent
card. Card face choice and general spacing stay with the native router. Measured headers, semantic
containment, compact 24px insets and independent-card wrapping remain. The
prototype's 72px sibling gap was reduced to 24px after the user identified the
excess space between IIS VM cards; label reservations can still enlarge a gap
when the actual text needs it.

A later live comparison exposed duplicate vertical label allowance: a 31px
reserved label paid two 78px gaps, producing 187px between cards. The user
preferred the compact comparison with slightly more breathing room. Ranks now
use 32px spacing and only unplaceable labels receive measured rows. The old
global tallest-label allowance and stacked-gap search were deleted.

Placement space for a label is separate from a routing waypoint. Labels first
use clear natural runs. When more placement space is needed, the next solve
still tries natural routes; only labels that still cannot fit ask for a straight
run through their reserved box. Reserved labels follow the physical direction
of the relationship: the prototype's unconditional top-to-bottom traversal
made an upward Flask testing-to-WSGI relationship loop below its source. A
two-card regression exercises the native router and prevents that reversal.
This removes the integration's automatic
label detours. The prototype's inherited port hints also proved significant:
applying its fallback direction heuristic to every card introduced a backwards
jog in Phone. Exposing all four shared face centers lets libavoid select the
short clear route without recreating the old rank/face planner.

The user also requested stable horizontal ordering between variants. Graphviz outgoing-edge ordering did not reliably preserve that order once
label reservations changed the compound graph. Equal-sized leaf peers sharing a kind and nonempty responsibility on
the same fresh row now receive those slots in stable identity order before
routing. Unrelated roles are not moved merely because their dimensions match. This keeps their horizontal order without freezing positions,
ranks or frame sizes. During live verification the user rejected left-to-right architecture
readings, so automatic direction selection and transposition were removed.
All architecture boards now read top-to-bottom.

Crossings no longer reserve room by compressing nearby corner radii. That
legacy rule squeezed a common-weblib corner to 2px; curves now round naturally
with label and endpoint protections intact.

Straight crossings retain bridge arcs. Rounded-corner contacts use narrow
cutouts while preserving the natural bend. Expanding the corner itself into a
semicircle produced hooks across the real cluster board and was removed after
visual comparison. Different relationship kinds are separated in the native
router before crossing ink is painted; crossing decoration cannot repair
coincident routes.

Long branching paths can wrap into adjacent downward columns. The renderer
keeps whole frames and overlapping rows together, retains side-entry sources
with their consumers, settles each candidate's labels and routes, and chooses
its column count from actual pane fit. Each added column must improve fit by
at least 5%, so a tiny gain cannot trigger a long continuation detour. This
threshold is editable alongside the spacing values in renderer config.
Width-limited boards do not gain from
shortening the page; candidate counts are bounded by measured column widths.
The accepted mTLS comparison splits after Portal API hostname. No board ID or
authored layout hint participates.

### Measured result

Captured against the actual source checkout before adoption, which already
included TASK-276. These baseline numbers therefore differ from the earlier
isolated experiment. Same 24 canonical fixtures and tracked vault variants,
measured text, reference pane, and light theme. Size values are diagram units;
fit is the scale at which the complete drawing fits the reference pane.

| Board / variant                           | Before size | After size | Fit before → after | Route length before → after | Bends/route before → after | Crossings before → after |
| ----------------------------------------- | ----------- | ---------- | ------------------ | --------------------------- | -------------------------- | ------------------------ |
| flask-map-1 fixture                       | 2311x1804   | 2180x1233  | 0.498 → 0.583      | 24024 → 14232               | 1.92 → 3.36                | 33 → 6                   |
| flask-map-2 fixture                       | 2916x1653   | 2201x1553  | 0.436 → 0.578      | 36241 → 18621               | 1.81 → 3.35                | 34 → 15                  |
| flask-map-3 fixture                       | 2230x1790   | 2189x1136  | 0.502 → 0.581      | 31249 → 19443               | 2.00 → 4.45                | 39 → 21                  |
| phone-ownership fixture                   | 921x1034    | 796x1051   | 0.869 → 0.855      | 1086 → 1336                 | 0.67 → 2.00                | 0 → 0                    |
| public-api-independent fixture            | 1919x3259   | 2538x1227  | 0.276 → 0.501      | 20550 → 9839                | 1.92 → 2.56                | 12 → 1                   |
| system-map fixture                        | 2859x2161   | 2756x1383  | 0.416 → 0.462      | 45320 → 22534               | 2.38 → 3.56                | 36 → 28                  |
| Agent workbench *Current architecture     | 1928x2208   | 2147x1620  | 0.407 → 0.555      | 17490 → 13945               | 2.00 → 2.90                | 10 → 10                  |
| Archboard *Current architecture           | 1794x797    | 1477x754   | 0.709 → 0.861      | 4553 → 3260                 | 1.33 → 3.44                | 0 → 2                    |
| Board persistence *Current architecture   | 2089x782    | 1658x852   | 0.609 → 0.767      | 6733 → 4971                 | 1.33 → 2.67                | 7 → 1                    |
| Board rasterizer *Initial                 | 1826x1202   | 1623x883   | 0.697 → 0.784      | 5258 → 2797                 | 1.27 → 2.36                | 1 → 0                    |
| Board viewer *Current architecture        | 1374x2175   | 1602x1529  | 0.413 → 0.588      | 10781 → 7960                | 1.89 → 3.67                | 7 → 9                    |
| Browser application *Current architecture | 1964x1118   | 1486x1133  | 0.648 → 0.793      | 7282 → 5958                 | 1.71 → 2.86                | 4 → 1                    |
| Canvas server *Current architecture       | 2406x1734   | 2237x1171  | 0.518 → 0.569      | 25511 → 14556               | 2.00 → 3.35                | 26 → 16                  |
| Canvas server Readable layout             | 2406x1734   | 2237x1171  | 0.518 → 0.569      | 25511 → 14556               | 2.00 → 3.35                | 26 → 16                  |
| Codex session *Current architecture       | 1459x1370   | 1671x1015  | 0.656 → 0.761      | 6683 → 5707                 | 1.67 → 3.08                | 3 → 3                    |
| Codex workhorse *Initial                  | 2191x798    | 2428x623   | 0.581 → 0.524      | 8424 → 5732                 | 1.23 → 3.31                | 3 → 3                    |
| Command dispatch *Current architecture    | 1521x836    | 1464x767   | 0.836 → 0.869      | 2953 → 2040                 | 1.00 → 1.12                | 0 → 1                    |
| Command interface *Current architecture   | 3002x1692   | 2597x1172  | 0.424 → 0.490      | 18116 → 10191               | 1.81 → 1.71                | 13 → 0                   |
| Renderer layout Initial                   | 972x500     | 876x454    | 1.000 → 1.000      | 1370 → 1065                 | 1.20 → 2.40                | 0 → 0                    |
| Renderer layout *Readable layout          | 2279x774    | 2201x840   | 0.558 → 0.578      | 6363 → 5883                 | 1.23 → 2.77                | 0 → 2                    |
| Semantic renderer *Current architecture   | 1606x1638   | 1858x1385  | 0.549 → 0.649      | 18527 → 9157                | 1.73 → 2.86                | 15 → 4                   |
| Semantic renderer Readable layout         | 1606x1638   | 1850x1385  | 0.549 → 0.649      | 18527 → 9322                | 1.73 → 2.77                | 15 → 5                   |
| Skill evaluation *Initial                 | 3188x1207   | 3352x1102  | 0.399 → 0.379      | 13323 → 10659               | 1.25 → 2.04                | 3 → 1                    |
| Voice coordinator *Initial                | 2593x830    | 2083x717   | 0.491 → 0.611      | 6376 → 3838                 | 1.54 → 3.38                | 2 → 1                    |

Public API improves fit by 82% and cuts route length by 52%; its bends rise
from 1.92 to 2.56 per relationship and crossings fall from 12 to one. The user
selected Phone's compact one-column reading over the marginally better fit of
a two-column version. Its fit is 1.6% lower and routes 23% longer than the
immediately preceding renderer, but fit remains 13% better and routes 18%
shorter than the original isolated experiment's baseline.

Across the corpus, total route length falls 40% and crossings fall from 289 to 146. All 24 drawings have zero routes through cards and zero off-route labels.
Beyond a 2% tolerance, 20 drawings improve fit and two lose fit; one has larger
area and 23 have more bends than ELK. Total page area falls 27%. These metrics
expose the remaining cost of fixed attachment positions; aligned native port
candidates are being compared separately before adoption. Measurements remain
available through `measure.ts`; previous baselines are retained.

The corpus tests retain semantic completeness, card clearance and labels on their
own runs. Focused label tests cover actual detours and proximity; the corpus
reports label reach without imposing a universal ratio. Dedicated tests cover shared face ports, measured
headers, nested containment, frame perimeter/divider endpoints, self-loops,
comparison identity, and deterministic concurrent renders. Tests requiring
private ports, a specific flank, a minimum sideways jog or exact endpoint-run
length were removed with the policies the user rejected. Near-corner crossing
coverage now uses fixed geometry, independent of whether Graphviz chooses to
create the old fixture's accidental crossing.

Reproduction (derived PNGs and JSON stay untracked):

```bash
ALL=1 PICTURES=1 SAVE=/tmp/graphviz-adoption.json \
  bun docs/design/wide-board-layout-fixtures/measure.ts /tmp/graphviz-pictures
```
