# Drawing lens, Opus seat: dead space and readability

Round 1 paper for the reader redesign council.
The code is branch `integrate/pr19` at `792359187`.
Every number comes from renders of this repository's model, with 540 modules and 1,117 relationships.
I did not change the repository.

## 1. The answer

The cause is both, in a clear order. A reading sends far too much content into one picture, and the layout then spends that content badly. Content is the first cause, and layout is the second.

The table shows all 131 readings of this model. A fit scale is the scale that shows a whole picture in the pane.

| Change                               | Total area | Readings at fit 0.6 or more | Crossings |
| ------------------------------------ | ---------: | --------------------------: | --------: |
| Today                                |    415.0 M |                          83 |     6,624 |
| Better layout only (prototype)       |    248.5 M |                          96 |     6,624 |
| Content rules only, layout unchanged |    153.9 M |                         128 |       442 |
| Both                                 |    113.9 M |                         130 |       442 |

The content rules alone beat the layout change, and they need no change to the layout crates.

The root reading today is 4,983 by 2,799 units. Card names draw at 3.6 px on screen, and blank ground fills 76.5 percent of the picture. With the content rules, the same 19 modules draw at 2,118 by 1,566 units with 3 crossings instead of 184.

My positions:

1. One picture shows one open module and its immediate parts, never two levels.
2. One picture holds at most 18 lines. Parts are not capped, because agents author them.
3. The default scope stays the model's root, drawn with the rules below.
4. Depth is always one. Opening a part replaces the picture.
5. One line stands for one connected pair. A line between a part and a context card ends on the open frame.
6. Words appear only on a line that stands for one relationship. A count of relationships never appears.
7. The far view must return. `ModelDiagram.tsx:301` hard-codes it off.
8. Blocks stays the default engine. It needs an order-preserving compaction and a candidate choice by pane fit.

## 2. Method

I read the JSON that `GET /api/architecture/model` returns and passed it to the same `projectModel` that the reader uses. I then called `renderArchitecture` with `layout` set to `blocks` or `track`. The render route has no layout parameter, so a scratch script was needed.

The set holds the root and all 130 modules with children, so 131 readings. Each counterfactual below changes only the content given to the renderer. All 25 variant sets gave about 2,360 renders. One render refused, and section 9 names it.

The pane measures 1,271 by 992 units at 1920 by 1080. The running product confirms it: the root's stage has `scale(0.255067)` and my computed fit is 0.255.

Scripts and raw data are in `/tmp/integrate/reader-council/drawing-opus/`. `run.ts` renders, `analyze.py` measures, `compact_proto.py` is the compaction prototype, and `metrics-all.json` holds the results.

Two terms recur:

- A part is a child of the open module.
- A context card is a card outside the open module, drawn because a line reaches it.

I use two readability levels. The 12 px target is my choice, not a product rule.

| Level         | Fit scale | What it means                                                                                                   |
| ------------- | --------: | --------------------------------------------------------------------------------------------------------------- |
| Near-readable |     0.857 | A 14-unit name (`design.rs:30`) reaches 12 px. Notes reach 9.4 px.                                              |
| Far-readable  |       0.6 | A 20-unit far name reaches 12 px. Long names shrink to 15 units (`far_card.rs:29-30`), so 0.6 is the best case. |

At 0.857 the pane shows 1,483 by 1,157 units. That is the unit of one screen below.

## 3. What the pictures measure today

All values are Blocks at the current content. Blank means no card, label or frame, and no line within 16 units. Line-only space is empty except for lines, which the council's criterion K counts as empty.

| Reading                | Parts + context | Lines (pairs) |   Picture | Cards | Line-only | Empty frame | Blank | Mean line | Crossings |   Fit |   Name | Screens |
| ---------------------- | --------------: | ------------: | --------: | ----: | --------: | ----------: | ----: | --------: | --------: | ----: | -----: | ------: |
| Root                   |          19 + 0 |       47 (29) | 4983×2799 |  4.4% |     16.9% |          0% | 76.5% |     1,812 |       184 | 0.255 | 3.6 px |     8.1 |
| Workspace packages     |          8 + 14 |      103 (65) | 7577×5522 |  1.4% |     24.0% |       26.4% | 45.9% |     3,420 |       780 | 0.168 | 2.3 px |    24.4 |
| Commands               |          24 + 5 |       39 (39) | 7615×1664 |  7.6% |     16.7% |       28.6% | 40.4% |     3,148 |        81 | 0.167 | 2.3 px |     7.4 |
| workbench              |          17 + 7 |       69 (59) | 4638×3308 |  4.7% |     25.8% |       47.7% | 16.5% |     2,335 |       444 | 0.274 | 3.8 px |     8.9 |
| Canonical architecture |           8 + 7 |       48 (46) | 2874×2878 |  5.6% |     25.3% |       48.5% | 15.1% |     1,723 |       202 | 0.345 | 4.8 px |     4.8 |
| renderer               |         12 + 10 |       42 (39) | 3107×2562 |  8.2% |     17.1% |       46.0% | 22.1% |     1,222 |        83 | 0.387 | 5.4 px |     4.6 |
| Browser                |           8 + 2 |       44 (32) | 3291×1860 |  4.9% |     22.1% |       54.7% |  9.8% |     1,220 |       155 | 0.386 | 5.4 px |     3.6 |
| Agent CLI              |          12 + 7 |       29 (26) | 2854×1913 | 11.9% |     20.5% |       41.9% | 17.8% |     1,450 |        66 | 0.445 | 6.2 px |     3.2 |
| Archboard server       |           4 + 5 |       36 (21) | 2635×1776 |  6.7% |     33.2% |       29.1% | 22.7% |     1,657 |       222 | 0.482 | 6.8 px |     2.7 |
| Median of 131          |           3 + 5 |       13 (12) | 1554×1168 | 14.8% |     16.7% |       20.7% | 39.1% |       944 |        12 | 0.703 | 9.8 px |     1.1 |

Facts over the 131 readings:

- Cards fill 14.8 percent of the median picture. They fill 4.4 percent at the root.
- The median gap from a card to its nearest card is 54 units. That gap is not the main loss.
- The mean line is 1,485 units, as long as one whole readable screen is wide.
- Lines are long because their ends are far apart, not because they wander. The median ratio of route length to direct distance is 1.02.
- Only 47 readings show names at 12 px at fit. In 43 readings names are under 8 px, and in 22 they are under 6 px.
- A view at readable scale, centered on a card, holds a median of 4.1 cards.

The root's largest rectangle with no ink is 1,805 by 1,553 units. That is 5.3 cards wide, 17.6 cards tall, and 20.1 percent of the picture.

## 4. Content or layout

Each row sends different content to the same Blocks layout.

| Content                                             | Total area | Share of today | Median fit | Near-readable | Far-readable | Crossings |
| --------------------------------------------------- | ---------: | -------------: | ---------: | ------------: | -----------: | --------: |
| Open module only, one line per pair                 |     90.4 M |            22% |       1.00 |           108 |          126 |       110 |
| Cards with no lines at all                          |    124.6 M |            30% |       1.00 |            86 |          131 |         0 |
| All content rules of section 7                      |    153.9 M |            37% |       0.95 |            70 |          128 |       442 |
| Context lines end on the frame, context shows names |    164.9 M |            40% |       0.95 |            70 |          121 |       658 |
| Context lines end on the frame                      |    184.4 M |            44% |       0.88 |            76 |          117 |       679 |
| One line per pair, no words                         |    200.9 M |            48% |       0.86 |            69 |          112 |     3,085 |
| All lines, no words                                 |    218.1 M |            53% |       0.85 |            62 |          112 |     5,229 |
| One line per pair, words on single lines            |    314.1 M |            76% |       0.75 |            49 |           90 |     3,851 |
| Today, with count labels removed                    |    343.4 M |            83% |       0.75 |            45 |           87 |     6,244 |
| Today                                               |    415.0 M |           100% |       0.70 |            47 |           83 |     6,624 |

Three facts decide the question.

Context fills the pictures. In the 130 scoped readings, 1,704 of 2,190 lines (78 percent) reach a context card. Only 486 lines join parts of the open module. A picture of what is inside a module is mostly a picture of what is outside it. In 85 of 131 readings, context cards outnumber parts.

If a picture is overfull, words cost much area. On today's content, removing all words removes 47 percent of the area. On a picture within the rules, words add only 10 percent (184.4 M against 167.8 M without words). Labels are not the root problem. Density is.

The layout has a separate loss. On pictures within the rules, the prototype removes a further 26 percent with 0 overlaps and 0 lines through cards. This loss is real, but it is smaller than the content loss.

I looked at the prototype's root as well. It is 41 percent smaller and no easier to read, because the same 47 lines sit closer together. See `drawing-opus-root-compacted-mock.png`. Compaction alone cannot give the owner a readable picture.

## 5. The claims against these measurements

The owner named #24. That pull request is the Rust core, and it makes no area claim. The area claim belongs to #25 at `396bfd9ad`.

| Claim                                           | Source                             | Finding                                                                                                     |
| ----------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Plain page area falls 12.6% against main        | `blocks-planned-layout.md:222-224` | The direction stands. Blocks is 23% smaller than Track here, and smaller on 91 of 131 readings.             |
| Mean page area 2.94 M, 16.5 routes per drawing  | `blocks-planned-layout.md:179-182` | The canonical model is no worse: 3.17 M and 17.1 lines. The claim was true, and the picture was still poor. |
| 1.22 bends per route                            | `blocks-planned-layout.md:183`     | 1.83 here, against 3.01 for Track. Blocks keeps the lead.                                                   |
| Contraction removes empty bands                 | `blocks-planned-layout.md:42-49`   | It runs, but 97.9% of all width lies under a card in some row. See D2.                                      |
| Council 563: 33 better, 0 worse, K margin +1.56 | `blocks-planned-layout.md:254`     | True, and only relative. Absolute K averaged 5.56, and 16 of 40 pictures scored K of 4 or less.             |

The doc recorded the warning itself. At one build stage it reports frame occupancy falling from 8.36 percent to 7.71 percent. It also says that those results "miss every corpus compactness target" (`blocks-planned-layout.md:1089-1092`). The later gate asked for improvement against main. No gate set an absolute floor.

I extracted the absolute scores from `/tmp/grading-563/verdicts/`, with `key.json` naming the after picture.

| Criterion          | After mean | Before mean | After below 7 | After at 4 or less |
| ------------------ | ---------: | ----------: | ------------: | -----------------: |
| K, compact frames  |       5.56 |        4.00 |      26 of 40 |           16 of 40 |
| R, direct lines    |       6.04 |        5.42 |      24 of 40 |           15 of 40 |
| W, readable at fit |       7.77 |        6.70 |      12 of 40 |            7 of 40 |

Criterion W also tests the wrong rectangle. It fits a picture into 1920 by 1080 (`criteria.md:76`), but the pane is 1,271 by 992 (`constants.rs:22-34`).

An earlier owner decision also fell. ADR 0052 says that a count label "was tried first and told a reader too little". The same ADR says that "No layout engine makes 71 lines in one drawing readable". `model-projection.ts:357` brought the count label back, and it now stands on 736 of 2,237 lines.

ADR 0052 and the comment at `scope.ts:122` also say that all relationships between two parts are one line. `model-projection.ts:347-353` splits them by kind first. This makes 47 lines at the root from 29 pairs.

## 6. Dead areas and their named causes

Observed means that a counterfactual removed the cause and I measured the result. Read means that I found the cause in the code and did not test it alone.

| ID  | Dead area                                     | Size                                                                 | Named cause                                                                                                                                                                                                   | Evidence                                                                                  |
| --- | --------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| D1  | Hollow frames, such as Browser                | 54.7% of Browser, median 20.7%                                       | Every part keeps its own line to each context card (`model-projection.ts:61-66`). These lines fill the frame.                                                                                                 | Observed. Browser goes from 3291×1860 to 1463×1279.                                       |
| D2  | Tall bands that only lines cross              | 26.7% of all height is held open by a label alone, 45.7% at the root | `compact.rs:161-184` cuts whole-picture bands. One label or bend anywhere keeps its row open across the full width, with 32 units of clearance on each side (`shape.rs:9`).                                   | Observed. The prototype cuts height 31% and width 7%.                                     |
| D3  | Width that cannot shrink                      | 97.9% of all width lies under a card ±32 in some row                 | The same global cut. Cards in different ranks are staggered, so no empty column exists.                                                                                                                       | Observed. Width falls only 7%.                                                            |
| D4  | The root's lower-right void                   | 20.1% of the picture                                                 | Leaf cards sit on the hub's next rank (a rank is a row of the layered layout), and nothing uses the space under them. If a line at a block's level has a label, `legacy.rs:159-170` does not pack that block. | Read. The packing condition was not instrumented. 2,141 of 2,237 lines have words.        |
| D5  | Very wide bands, such as Commands at 4.6 to 1 | 20 readings wider than 2.2 to 1                                      | Context lines reach all 24 parts, so all stand on one rank. Candidates then sort by raw area (`legacy.rs:316`, `:387`, `:393`), so a thin band beats a shape that fits the pane.                              | The first part is observed: Commands goes from fit 0.17 to 0.47. The second part is read. |
| D6  | Doubled lines                                 | 2,237 lines for 1,948 pairs                                          | The split by kind (`model-projection.ts:347-353`).                                                                                                                                                            | Observed. Crossings fall 41%, area 8%.                                                    |
| D7  | Bands held by count labels                    | 736 lines                                                            | `model-projection.ts:357`.                                                                                                                                                                                    | Observed. Area falls 17%.                                                                 |
| D8  | Frames around one card                        | 65 of 112 group regions                                              | `inline.rs:72` draws a region for any group. Commands shows five of them.                                                                                                                                     | Read. Seen in `drawing-opus-commands-blocks-ctxnames.png`.                                |
| D9  | Wide cards                                    | 116 of 131 readings have a median card width of 340                  | `measure/cards.rs` grows a card to `CARD_MOST`.                                                                                                                                                               | Observed. Removing notes removes 17%, over the 130 readings that drew.                    |

The label rank has a real cost on overfull pictures. `card_graph.rs:207-223` makes each label a Graphviz node on its own rank. I do not recommend removing it, for the reason in section 8.

## 7. What a good picture contains

### The purpose of one picture

A good picture answers one question: what are the parts of this module, and how do they connect? The architect did not draw this system, so a picture must teach without a pan or a zoom. Opening a card is the way to see more. The camera is for a close look, not for reading the picture.

### How much one picture holds

The line count predicts readability better than any other measure I took.

|      Lines | Readings today | Fit 0.6 today | Fit 0.857 today | Readings with context rule | Fit 0.6 with context rule |
| ---------: | -------------: | ------------: | --------------: | -------------------------: | ------------------------: |
|     0 to 6 |             35 |          100% |             91% |                         47 |                      100% |
|    7 to 12 |             24 |           92% |             46% |                         46 |                       98% |
|   13 to 18 |             26 |           77% |             15% |                         25 |                       84% |
|   19 to 24 |             17 |           35% |              0% |                          6 |                       50% |
|   25 to 32 |             12 |            0% |              0% |                          5 |                       20% |
| 33 or more |             17 |            0% |              0% |                          2 |                        0% |

The limit is 18 lines. Above it, a picture stops reaching far-readable.

The picture keeps the 18 strongest lines by relationships joined, with ties in authored order. This rule touches at most 15 of 131 readings.

A hidden line must not read as a missing connection. In `drawing-opus-workbench-blocks-budget.png`, several parts look unconnected because the cap hid their lines. So a card with hidden lines carries a count mark, such as `+3`. This is the one new mark that I ask for.

Parts have no cap, because agents author them and the renderer must not hide meaning. Five readings hold more than 12 parts: root 19, Commands 24, workbench 17, Retained reads 14 and Camera and pointer 13. For the last four, a model diagnostic names the module so that an agent can group it. The picture still draws every part.

### Default scope

The default stays the model's root. It needs no authored choice and works for every model. The change is what the root draws.

A childless card with at most one neighbour in the picture shows its name only and loses its line. At the root this applies to 9 of 19 cards. All 19 stay on screen.

| Root picture             |      Size | Cards | Lines | Crossings |   Fit | Far name |
| ------------------------ | --------: | ----: | ----: | --------: | ----: | -------: |
| Today                    | 4983×2799 |    19 |    47 |       184 | 0.255 |   5.1 px |
| Names only, lines kept   | 2835×1696 |    19 |    24 |        12 | 0.448 |   9.0 px |
| Names only, lines hidden | 2118×1566 |    19 |    16 |         3 | 0.600 |  12.0 px |

I chose the third. See `drawing-opus-root-blocks-rootrail.png`. Its name-only cards form a loose column, and section 8 tidies them.

### Depth

Depth is always one. Root plus one level is 52 modules, which is far over the limit. Opening a part replaces the picture and keeps the module's context as its frame and context cards. The focused reading in `projectFocused` remains the way to compare parts from different branches.

### Aggregating relationships

The rules apply in this order:

1. A line joins two drawn cards, whatever the number of relationships or kinds. It takes the majority kind that `oneLine` already picks.
2. A comparison keeps standing apart, so added and removed lines stay visible.
3. A line between a part and a context card ends on the open frame, so each context card has one line.
4. Reciprocal lines become one line with two arrowheads. I tested this at the root only, and those pictures do not yet draw the second arrowhead.

Rule 3 hides which part talks to which context card. A hover restores this without a new layout. Hovering a context card lights the parts that it reaches, and hovering a part lights its context cards. The lighting state already exists in `ModelDiagram.tsx:302`.

### Labels

A line for one relationship shows its authored words. A line for several relationships shows no words. Its tip and inspector name each relationship, as ADR 0052 already requires.

This changes ADR 0052, which stacks every distinct label on a joined line. At the root one line joins 61 relationships, so a stack cannot work. The owner must accept this amendment.

Every label inside the limit stays on the picture. I tested the rule that labels reserve no room, and I reject it. Only 23 percent of labels fit in such a picture, against 42 percent on the fuller pictures.

### Cards

Parts keep their notes. Context cards show their names only, which saves 11 percent of the area.

## 8. What must change in the layout

The content rules come first, because they change the projection only. These layout changes follow, in this order.

| Order | Change                                                                                                                                                                                     | Cause                                                                                        | Expected result                                                     | Evidence                       |
| ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------ |
|     1 | Replace the global band cut in `compact.rs` with an order-preserving constraint compaction. Two objects that can see each other along an axis keep their order. Everything else can slide. | D2, D3                                                                                       | A further 26% of area. 130 of 131 readings far-readable.            | Prototype, section 9           |
|     2 | Rank candidates by their fit in the reference pane, not by area, in `legacy.rs:316`, `:387`, `:393` and `reading.rs:94-99`.                                                                | D5                                                                                           | Less letterboxing. The median picture fills 74% of the pane today.  | Read, not tested               |
|     3 | Lay out parts with no line between them as a grid shaped to the pane, and tidy name-only cards into one row.                                                                               | D4, D5                                                                                       | Commands remains the worst at fit 0.47, with 24 parts and 10 lines. | Read, not tested               |
|     4 | Draw no region for a group with one visible member. Give the card the group's color.                                                                                                       | D8                                                                                           | Commands loses five frames.                                         | Read, not tested               |
|     5 | Lower crossings in Blocks.                                                                                                                                                                 | Blocks crosses twice as often as Track today, and 4.7 times as often after the context rule. | The median falls from 2 toward Track's 0.                           | Measured gap, cause not traced |

The first change is the third stage of topology-shape-metrics layout, a standard method for orthogonal drawings. The planner keeps its routes, and only their lengths change.

These things must stay:

- Blocks stays the default. Against Track on today's content it is 23 percent smaller, with 1.83 bends against 3.01 and a mean line of 1,485 against 1,735. After the context rule it stays ahead, at 184.4 M against 237.5 M, with 76 near-readable readings against 54. Track wins only on crossings.
- The label rank stays. On pictures inside the limit, labels add only 10 percent, and no-reservation fails.
- The planner's geometry guards stay.
- No new layout configuration appears. The caller still names no engine.

A separate fix is needed outside the crates. `ModelDiagram.tsx:301` passes `far: false`, and I found zero `.is-far` elements in the running root. On `origin/main`, `SemanticDiagram` used `seenFromFar`. The far view moves a name from 14 units to as much as 20, so names reach 12 px at scale 0.6, not 0.857. At its best, it shows about twice as much area at the same text size. See `drawing-opus-root-blocks-farview-1920.png`. It cannot rescue today's root, where it gives 5.1 px.

## 9. Limits of this evidence

- The prototype works on the emitted geometry. It uses the design's own separations, and it has not passed the planner's guards. It ignores region captions, so its room is slightly low.
- The prototype's results on today's pictures have 9 card or label overlaps in 131 readings. On pictures within the rules, it has 0 overlaps, 0 lines through cards, and the same 442 crossings. On the context-rule set, crossings moved from 679 to 677.
- My first route parser added false bends. I found this against the doc's numbers and fixed it. All numbers here are from the fixed parser, and one route was traced by hand.
- The space shares count a full-width header strip on open frames, so they slightly understate empty frame.
- I measured one model. Other vaults can differ.
- I did not run the integrity guards or the council on the new pictures.
- The label test is a simple placer. A better one fits more labels, but not enough to reverse the decision.
- One render refused: `No clear planned channel`, on Workspace packages with notes removed. That content is hypothetical, but it shows that the planner can refuse a dense picture.
- `Architecture inputs` has no line at the root. This is a gap in the model, not in the drawing.
- Speed is outside this paper.

## 10. Acceptance gates

Every gate is absolute and measured at the real pane of 1,271 by 992.

1. Each repository's default picture reaches fit 0.6, with the far view on.
2. Each reading of at most 18 lines reaches fit 0.6.
3. The largest ink-free rectangle in a picture is at most 20 percent. The median within the rules is 15.3 percent, and the 75th percentile is 18.9 percent.
4. The council scores every sample at the real pane. K and W must each reach 7 on every sample, and a margin against main is not enough.
5. The corpus includes the root of each repository and the 20 largest scopes. Authored views alone hid this failure.

## 11. Pictures I looked at

All paths are under `/tmp/integrate/reader-council/evidence/`.

Current product and renders:

- `02-archboard-root.png`
- `drawing-opus-root-product-1920.png`, captured and not opened, because it duplicates `02-archboard-root.png`
- `drawing-opus-root-blocks-1920.png`
- `drawing-opus-root-track-1920.png`
- `drawing-opus-root-blocks-farview-1920.png`
- `drawing-opus-workspace-blocks-1920.png`
- `drawing-opus-browser-blocks-1920.png`
- `drawing-opus-commands-blocks-1920.png`
- `drawing-opus-server-blocks-1920.png`

Counterfactuals:

- `drawing-opus-root-blocks-pairslabel.png`
- `drawing-opus-root-track-pairs.png`
- `drawing-opus-root-blocks-rootplan.png`
- `drawing-opus-root-blocks-rootplanhub.png`
- `drawing-opus-root-blocks-rootnames.png`
- `drawing-opus-root-blocks-rootrail.png`
- `drawing-opus-browser-blocks-noctxpairs.png`
- `drawing-opus-browser-blocks-ctxframe.png`
- `drawing-opus-workspace-blocks-ctxnames.png`
- `drawing-opus-workspace-blocks-budget.png`
- `drawing-opus-commands-blocks-ctxnames.png`
- `drawing-opus-workbench-blocks-budget.png`
- `drawing-opus-root-compacted-mock.png`, a plain mock of the prototype's geometry

Captured for the record and not opened:

- `drawing-opus-workspace-track-1920.png`
- `drawing-opus-browser-track-1920.png`
- `drawing-opus-agentcli-blocks-1920.png`
- `drawing-opus-layoutmeasuring-blocks-1920.png`
- `drawing-opus-renderer-blocks-1920.png`
- `drawing-opus-browser-compacted-mock.png`
- `drawing-opus-server-blocks-ctxframe.png`
