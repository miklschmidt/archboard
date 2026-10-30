# Round 2 critique: Opus seat

Seat: Opus. Task: adversarial critique of the Astra papers and an honest revision of my own.

## The result

The redesign holds, and its core gets stronger. One open module, with less content in each picture, is still the fastest repair. It beat the layout prototype in round 1, and nothing in this round reverses that. It also cut the root's draw from 3.8 s to 0.6 s on the core that I measured.

Two of my round 1 ideas failed and I withdraw them: the 18-line limit and the Read menu. Two more failed in part: lines that always end on the frame, and the module tree as the table of contents of a proposal.

Astra is right on these points:

- Flows and walkthroughs are permanent destinations in the left column.
- A proposal needs a change list.
- A mixed line must look mixed.
- If a picture does not fit, it still lands at a readable scale.
- The reader needs one accepted scene record.
- An answer from the agent belongs in the conversation.

Astra is wrong on these points:

- A contextual outline replaces the tree.
- One line per relationship family.
- A budget of one to three neighbors.
- No path on a container.
- Label ranks as the first layout repair.
- A layout selector.
- Saved readings.

Three findings are new in this round:

- `Workspace packages` is now the worst reading in the product, because the layer deletion moved 17 packages into it. Transitive reduction repairs its meaning, and the picture then reads as a dependency chain with no groups.
- Both seats wanted a proposal compared with its own predecessor, and that read fails on all eight drafts. The working route is the predecessor checkpoint. It shows 2 to 61 changes instead of about 3,000.
- If one part reaches a door, the door's line can end on that exact part. That is true of 59 percent of door lines, and it keeps their meaning in a still picture.

The fastest test of the core idea is Slice 1 in section 7. It changes the projection and two reader settings, and the owner can judge it by eye on four pictures.

## The ground moved during this round

Two commits landed while I worked. Both change what round 1 measured.

| Commit      | Time  | Effect                                                                                                                            |
| ----------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| `533520c24` | 17:14 | Deletes Layer 0 to Layer 7 in the live model. Every model number in round 1 describes a model that no longer exists.              |
| `4b970e501` | 17:26 | Merges `perf/blocks-layout-solver` and changes `crates/`. The checkout's built core is now stale, so my render scripts refuse it. |

I did not rebuild in this checkout, because the brief forbids changes there. The first batch of renders used the core from before the merge. Later renders used `/tmp/integrate/wt19`, which is also from before the merge. So every geometry number has one consistent base, and every solve time is a pre-merge time.

The live model has 532 modules, 122 parents, 19 roots and 410 leaves. The deepest path is 6, and the mean leaf depth is 3.14. Its bindings cover 453 modules. The other 79 are 14 externals, 55 containers and 10 leaves. Its name is still `vKEsyHFk`.

I rendered all 123 readings under 16 content variants, about 1,970 renders, plus single readings for the root and for Shop. Scripts and data are in `/tmp/integrate/reader-council/scratch-critique-opus/`. My screenshots are `evidence/critique-opus-*.png`. I did not read `critique-astra.md`, which appeared in this directory while I worked.

Evidence labels in this paper:

- Measured: I computed it from the model, a render or a live response.
- Read: I read it in code.
- Seen: I looked at the picture.
- Unchecked: I did not test it.

### What the numbers say now

Pane A is the round 1 pane, 1271 by 992. Pane B is the proposed lone pane with no docked sidebar and a caption row, 1551 by 960. If a reading's fit scale reaches 0.6, it passes.

| Content rules                               | Total area | Median fit, pane A | Pass, pane A | Pass, pane B | Crossings | Over 18 lines |
| ------------------------------------------- | ---------: | -----------------: | -----------: | -----------: | --------: | ------------: |
| Today                                       |    392.9 M |               0.70 |           79 |           83 |     5,966 |            42 |
| Lines end on the frame, context shows names |    161.5 M |               0.97 |          112 |          113 |       618 |            12 |
| Same, with the 18-line limit                |    147.5 M |               0.97 |          119 |          119 |       363 |             0 |
| Door line ends on its one part              |    188.9 M |               0.86 |          112 |          110 |       800 |            12 |
| Same, with reduction above 18 lines         |    175.9 M |               0.86 |          113 |          113 |       560 |             5 |
| Same, with a code path on each part         |    186.3 M |               0.85 |          109 |          108 |       565 |             5 |
| Astra's rules as written                    |    249.6 M |               0.95 |          103 | not computed |     3,113 |            23 |

I call the fifth row the revised rules. The sixth row uses the path as extra note text, so it is a stand-in for a real path row. The Astra row is my reading of the Astra drawing paper: lines by kind, a kind and count caption, and the three neighbors with the most relationships.

Solve time, pre-merge core, in Bun, on a shared machine:

| Content       | All readings | Median | 90th percentile |     Root | Under 140 ms |
| ------------- | -----------: | -----: | --------------: | -------: | -----------: |
| Today         |         53 s | 209 ms |        1,202 ms | 3,764 ms |    47 of 123 |
| Revised rules |         13 s |  65 ms |          208 ms |   607 ms |    92 of 123 |
| Astra's rules |         27 s |  96 ms |          499 ms | 3,253 ms | not computed |

The dive needs its next picture within 140 ms (`exploring.ts:152`, from round 1). Today 38 percent of readings meet that. Under the revised rules 75 percent do. The solver merge changes these numbers, so someone must measure them again on the new core.

## 1. Verdicts on the Astra papers

### Journey paper

| Claim                                                                                        | Verdict                | Evidence                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A contextual outline replaces a tree. It shows the open module, its parent and its children. | Reject                 | Measured: median 4 rows, in a column with room for about 31. See section 2.                                                                                                        |
| The left column has three destinations: Structure, Flows, Walkthroughs.                      | Accept                 | Measured and read. See section 2, Read menu.                                                                                                                                       |
| A 288 px navigator.                                                                          | Reject                 | Measured: the column is 319 px today, and the tree needs that width. The gain is 2 percent of the pane.                                                                            |
| The application does not open an unrelated repository. A saved session continues.            | Accept                 | Seen: the second pane also opens the migration-required repository (`critique-opus-05-two-panes.png`).                                                                             |
| `Open repository…` accepts a local checkout.                                                 | Unchecked              | I found no browser route for it in this round.                                                                                                                                     |
| A repository without architecture gets a setup screen.                                       | Accept                 | Unchecked in the product, because no such repository is registered.                                                                                                                |
| A model with no current state says "Not implemented".                                        | Accept                 | Read: `ModelReadingSelector.tsx:59` already says "No implemented state".                                                                                                           |
| Do not discard the 10 roots to make a picture attractive.                                    | Accept                 | This defeats my own root rule. See section 4.                                                                                                                                      |
| Aggregate by endpoints, direction and kind, with a kind and a count as the label.            | Reject                 | Measured: this keeps 47 root lines. A kind word on uniform lines costs 24 percent more area and 10 passing readings.                                                               |
| Names and paths reach 14 px at fit.                                                          | Reject as a gate       | Measured: fit 1.0 holds on 60 of 123 readings in pane B, under the revised rules. The full Astra target of scale 1.2, in the docked pane of that paper, holds on 23.               |
| If a picture does not fit, keep a readable scale and pan.                                    | Accept                 | My round 1 position was wrong. See section 4.                                                                                                                                      |
| Up and Back are different actions.                                                           | Accept                 | Both seats agree.                                                                                                                                                                  |
| A sibling menu on the crumb.                                                                 | Reject                 | The tree already shows siblings. A second route adds a control and no capability.                                                                                                  |
| A leaf is a destination with no empty interior.                                              | Amend                  | A leaf has no scope. Its panel is its page. A tree row opens its parent and selects it, as Find does today.                                                                        |
| The code path on a card is a link that opens source.                                         | Reject                 | Measured: the SVG has only `header` and `label` parts, so a card has no path target. At fit the row is under 9 px high in 43 of 123 readings. `Open code` stays in the panel foot. |
| 87 unbound modules get no synthesized path.                                                  | Amend                  | The count is now 79. See section 2, code paths.                                                                                                                                    |
| A responsibility can span role folders, so a path is not ownership.                          | Accept                 | Measured: `Architecture drawing` derives `apps/web/src/ui`, and 13 of 55 derived folders equal the parent's folder.                                                                |
| `check` warns on an unbound container with no authored connections.                          | Reject                 | Measured: it flags 32 of 55, including `Painting`, `Workhorses`, `Voice` and `Canonical architecture`.                                                                             |
| Ask opens the conversation with a visible capture.                                           | Accept                 | Seen: the dock already offers these prompts (`critique-opus-11-dock.png`).                                                                                                         |
| A flow opens with Sequence, and Flowchart is a second representation.                        | Accept                 | Both seats agree.                                                                                                                                                                  |
| Plan a change: the journey from Ask to Review proposal.                                      | Accept                 | My round 1 paper had no such section.                                                                                                                                              |
| A review workspace with a change list.                                                       | Accept                 | Measured. See section 2, tree.                                                                                                                                                     |
| Before, Changes and After.                                                                   | Accept, after the core | Read: the picture already draws the union. Unchecked as an interaction.                                                                                                            |
| The default base is the retained predecessor.                                                | Accept with a repair   | Measured: `against=<predecessor>` fails on all 8 drafts, because those states are outside the catalogue. `against=<predecessorCheckpoint>` works. See section 2, History.          |
| Linked navigation for side-by-side proposals.                                                | Unchecked              | Measured only that half panes pass 47 to 56 of 123 readings. Drafts are small, so the limit is less severe there.                                                                  |
| History is a wide list in the main workspace.                                                | Amend                  | It becomes a left destination, so the picture stays beside the list. See section 2.                                                                                                |
| Retained tours sit in a historical section.                                                  | Accept                 | Measured: `target.checkpoint` separates 18 tours from the 1 current tour. No name matching is needed.                                                                              |
| Explore this step, then Resume.                                                              | Accept                 | A presenter takes a question and returns to the same beat. This replaces my Stay here.                                                                                             |
| Saved readings, with a Save action.                                                          | Reject                 | No observed need (gate 2). The address already holds a reading.                                                                                                                    |
| Structure to sequence needs no false continuity.                                             | Accept for now         | Unchecked by eye. Build the plain change first. If it reads poorly, add the lift.                                                                                                  |
| A slow request keeps the old picture and labels it.                                          | Accept                 | Same as my held picture, and more honest.                                                                                                                                          |

### Drawing paper

| Claim                                                                                      | Verdict                 | Evidence                                                                                                                                        |
| ------------------------------------------------------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Both content and layout cause the dead space.                                              | Accept                  | Measured. Content still comes first.                                                                                                            |
| Blocks wins most large pairs and loses some small ones, such as Command startup at +17.4%. | Accept                  | Unchecked for Track on the new model. The figure agrees with round 1 data.                                                                      |
| Removing labels removes 62.9% of the root.                                                 | True and misleading     | Measured: on content within the door rules, labels cost 10 percent overall, 37 percent at the root and 3 percent at `Commands`.                 |
| Replace global label ranks first.                                                          | Reject as first         | The headroom is mostly a symptom of overfull pictures. Revisit the root after Slice 1.                                                          |
| The first picture is one authored orientation reading.                                     | Reject as a new concept | Measured and seen. See section 2, orientation.                                                                                                  |
| Six to ten cards and eight to fifteen lines.                                               | Reject                  | A target with no consequence changes nothing, and agents author the parts.                                                                      |
| One to three interface neighbors.                                                          | Reject                  | The rule names no way to choose them, and the same paper forbids a silent pick. Measured with the strongest three: 3,113 crossings against 560. |
| One connection for each meaningful family.                                                 | Reject                  | Measured: this is the main cause of 47 lines at the root.                                                                                       |
| Do not merge unlike relationships into a majority kind.                                    | Accept                  | Measured: 8 of 29 root lines mix kinds, and 37 of 214 relationships differ from the line's kind.                                                |
| "28 relationships" must not be the meaning of a line.                                      | Accept                  | Both seats agree.                                                                                                                               |
| Offer a complete connection reading on request.                                            | Accept                  | If lines are hidden, one control shows them.                                                                                                    |
| Rank candidates by fitted text in the real pane.                                           | Accept                  | This is my change 2. Unchecked.                                                                                                                 |
| Repack locally around holes.                                                               | Accept, later           | The content rules come first. Unchecked on the new model.                                                                                       |
| An absolute floor in the real shell.                                                       | Accept                  | Both seats agree. The gate needs the real pane, and that pane changes with the design.                                                          |
| Keep small cases in the corpus.                                                            | Accept                  | Measured: Shop gets slightly smaller under the rules, at 1352 by 850 against 1400 by 903.                                                       |

### Implementation paper

I read each cited path. I did not reproduce the server timings.

| Finding                                                                         | Verdict              | Evidence                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Whole-model watchers, one per socket, plus activity watchers that never stop | Accept               | Read: `agent-activity.ts` adds a watcher in `follow` and stops it only in `dispose`.                                                                                                                                                        |
| 2. The pane reports a reading as drawn before the picture exists                | Accept, and raise it | Read: `ModelReading.tsx:100` passes no readiness, and `use-model-explanation.ts:136` defaults it to true.                                                                                                                                   |
| 3. Reading changes destroy stable owners                                        | Accept               | Broader than my F2, because it names the branch in `ModelWalkthroughFrame`.                                                                                                                                                                 |
| 4. The diagram bypasses the choreography                                        | Accept               | Same as my F1.                                                                                                                                                                                                                              |
| 5. Eager archive and whole-model reads                                          | Accept               | Same as my F5.                                                                                                                                                                                                                              |
| 6. A selection downloads a whole model                                          | Accept               | Same as my F5.                                                                                                                                                                                                                              |
| 7. Drawing keys hold the complete request                                       | Accept               | Same as my F6.                                                                                                                                                                                                                              |
| 8. Reading aids were removed                                                    | Accept               | Same as my section 3.                                                                                                                                                                                                                       |
| 9. The sidebar is a catalogue                                                   | Accept               | Both seats agree.                                                                                                                                                                                                                           |
| 10. Dead-end connection rows and no legend                                      | Accept               | Read: `ModuleDetails.tsx` renders the endpoint as a paragraph. `SemanticLegend` has no live caller.                                                                                                                                         |
| 10. Connect the layout choice                                                   | Reject               | The failing draft draws against its own base (`critique-opus-02-draft-own-base.png`). A selector moves a renderer fault onto the reader.                                                                                                    |
| 11. The socket and HTTP overwrite one cache entry with different coverage       | Accept on code       | Read: `model-watch.ts:83` and `events.ts:118`. I did not see a visible effect. The 97 menu entries in that paper count `data-reading-id` only, and state rows use `data-state-id` (`ModelReadingSelector.tsx:118`). So 97 and my 114 agree. |
| 12. Refresh does not reach a failed drawing                                     | Accept               | Read: `drawing.ts:36` keys drawings outside the family that Refresh invalidates, with `retry: false`.                                                                                                                                       |
| 13. Two reader stacks                                                           | Accept               | Keep replay for retained talks.                                                                                                                                                                                                             |
| The render endpoint does not cover the full reading                             | Accept               | Read: `ArchitectureRenderRequestSchema` has no `against`.                                                                                                                                                                                   |

Astra finding 2 is the one that I missed. Without it, a transition can animate toward a picture whose hit testing and inspector belong to another reading. It belongs in the same slice as the surface repair.

## 2. The strongest ideas, attacked

### Doors on the frame's edge

Attack and result, all on the live model:

- Doors are not small. A reading has a median of 5 doors, and `board` has 15. Doors outnumber parts in 76 of 122 readings.
- "Callers above, called below" fails. Of 655 doors, 129 are two-way, and 69 of 122 readings hold at least one.
- The edge does not exist. The renderer places context as ordinary cards. In `critique-opus-wp-best.png` they form a grid above the frame.
- A door is often a coarse fact. In `Browser`, the door `Workspace packages` stands for 49 relationships, 24 endpoints and 9 packages. Across all readings, 358 of 655 doors stand for one endpoint, and the largest stands for 34.
- A line that ends on the frame loses meaning in a still picture. `criteria.md:7` forbids a repair by hover, and an exported SVG has no hover. In `critique-opus-startup-frame.png`, the reader cannot tell which part reaches which door.

Verdict: amend. A door is a context card that shows its name only. If exactly one part reaches it, its line ends on that part. Otherwise its line ends on the frame. So a line on the frame means "several parts". The first case holds for 466 of 784 door lines, and the rule needs no global mode. The cost is 17 percent of area and 182 crossings. No reading stops passing in pane A, and three stop passing in pane B. `critique-opus-startup-uniq.png` shows the gain: `Command contract` reaches `Command catalogue`, with its authored words.

I withdraw edge placement and callers above. Rank order already puts callers high. If edge doors still matter after Slice 1, they are a renderer task in Slice 8. The panel on a door lists its real endpoints, grouped by child.

### One open module at a time

Attack: 25 of 122 readings have one part, and 22 have two. So 39 percent of the places a person can open hold one or two cards. `skills` and `Architecture runtime API` each show one part and 10 doors. A dead stop costs a click and teaches nothing.

Result: the rule survives. Depth is still the only thing that keeps pictures small, and no other attack weakened it. It also reduced solve time, as the table shows.

Verdict: keep, with one addition. Fold a chain of one-part modules, as GitHub folds a chain of single-child folders. Opening `skills` opens its part, and the crumbs show both. The tree shows the chain as one row. Only 7 of the 25 are pass-through containers for `check`, because the other 18 have a binding or a job. So authoring cannot remove this, and the reader must. Unchecked by eye.

### A hard limit of 18 lines

Attack: render `Workspace packages`, the reading that the owner's decision made larger. It holds 17 parts, 14 doors and 68 lines after the door rule.

Result: the limit fails, and it fails in the worst way. `critique-opus-wp-cap18.png` shows `timing`, `diagnostics`, `server-requests`, `code-opener`, `skills` and `server-lifecycle` with no line to any neighbor. A foundation has many weak lines, so "keep the strongest" removes exactly the lines that make it a foundation. The cap also hides 50 of 68 lines and still reaches only fit 0.54.

Verdict: withdraw. A limit that hides a true line by strength misleads, and the `+3` mark does not repair it. The picture still shows a false shape.

Replacement: transitive reduction above 18 lines. If other drawn lines still join the ends of a line between two parts, that line leaves the picture. At `Workspace packages`, 50 lines between parts become 18, and the whole picture falls from 68 lines to 36. `critique-opus-wp-best.png` reads as a chain from `walkthrough` through `renderer`, `board`, `code-binding`, `workspace` and `process` to `timing`. That is the layer order, with no groups and no authored rank. At `Browser` the picture falls to 16 lines and 4 crossings, and it reads well at fit (`critique-opus-browser-best.png`).

Reduction has real limits, and I state them plainly:

- It hides a direct `call`, and a call is not implied by a path. If reduction touches pure dependency lines only, the picture keeps 53 lines, which is too many. So the picture must say what it hides.
- Four packages sit on a cycle, so the result depends on order. Remove weakest first, for a deterministic result.
- It changes the rule above a threshold, which is a mode. Gate 5 counts this as a cost. The caption states it: `32 direct lines follow from longer paths`, with a control that shows them. The panel always lists every connection.
- It does not make `Workspace packages` fit. The picture is 1865 by 2950, at fit 0.34. See "landing floor" in section 3.

Five readings stay above 18 lines, and I let them. Agents author parts, and the renderer must not hide meaning.

### One line per connected pair

Attack: test what a merged line hides. Mixed lines are 187 of 1,870 directed pairs, 10 percent. At the root they are 8 of 29. `Browser` to `Archboard server` holds 9 `http` and 4 `event` relationships, and the majority rule draws plain `http`.

Result: the line count survives, and the majority kind does not. A mixed line drawn in one kind is a false mark, which breaks "only real state" in `PRODUCT.md`.

Verdict: amend. One line per directed pair. A line with one kind wears that kind. A line with mixed kinds wears a neutral style, and its tip and panel list the kinds. Words stay on single-relationship lines, which are 1,227 of 1,870 pairs. I tested a kind word on uniform lines, and it costs too much: 24 percent more area and 10 fewer passing readings.

I also withdraw "two arrowheads on one line". My journey paper said one line per direction, and my drawing paper said one line per pair. Reciprocal pairs are only 5 of 24 at the root, and the second arrowhead does not exist yet. Keep two lines.

### The left module tree

Attack: count rows. With the path to the open scope expanded, the tree needs a median of 34 rows, 46 at the 90th percentile and 53 at most. By my estimate, the column holds about 31 rows at 28 px. So 68 of 123 readings scroll. Sorting by path also leaves ties, because 52 of 513 cards share a path with a sibling. Shop has zero bindings, so path sorting gives it nothing.

Result: scrolling is the normal cost of a tree, and not a failure. The real risk is that the lit row leaves the view.

Compare the contextual outline. It needs a median of 4 rows and at most 25. In the median case it leaves the column about 90 percent empty, which is the void I measured in round 1. It shows no position in the whole and no sibling of an ancestor. A person who opens `Painting` cannot see that `renderer` has 11 other parts. It also does not read like a repository, which the owner requires.

Verdict: keep the tree, and amend it.

- Ancestors stick to the top while the column scrolls, as in a code editor's sticky scroll. The lit row always stays in view.
- Sort by code path. Unbound modules come last, and ties use authored order. So Shop keeps its authored order.
- The tree follows the focused pane. Seen: `critique-opus-05-two-panes.png` shows A and B badges on repository rows, and a single tree needs that information in its switcher row.
- The switcher must handle 312 checkouts, which is the count on this repository. Measured from `/api/repositories`.

### The right panel, absent until something is selected

Attack: follow a double-click on a card near the right edge. `use-diagram-gestures.ts:275` reads the browser's `dblclick` target. `use-clear-of-panel.ts:53` glides the camera over 160 ms, in an effect that runs on selection. So the first click starts a panel and a camera move, and the second click lands on a moved card or on the panel itself. Read, not run.

Result: this is a real defect in my design, and it strikes the primary gesture. I also stated 520 ms in round 1, and the code says 160 ms.

Verdict: keep, and amend. A click lights the card and the tree row at once. The panel and any camera move wait about 220 ms, and a second click cancels them. No part of the reader docks in a lone pane. Under the revised rules, pane B raises the median fit from 0.86 to 0.99 and passes the same 113 readings. So the real gain is a larger picture that stops refitting.

Two more limits apply:

- A pane with the dock open is 1111 px wide, and the panel then covers a third of it. Passing readings fall to 107.
- At half width the panel covers almost half of the pane. Its width must shrink there. Unchecked.

### The Read menu

Attack: browse flows. Measured: a scope touches a median of 2 flows and at most 64, and the 90th percentile is 11. The root has 72. Of 122 scopes, 35 have none.

Result: the menu fails three ways.

- A menu closes on each choice, so walking 11 flows means 11 reopenings. A list stays.
- It hides three nouns behind one verb. A newcomer cannot learn that flows exist until they open it.
- It vanishes in scopes with nothing to read, which shifts the header.

Verdict: withdraw. Take Astra's destinations, and put my tree inside the first of them. The tabs read `Modules`, `Flows 12`, `Walkthroughs 3` and `History`. A count updates with the scope and teaches at a glance. A list with no entries offers `All flows (72)`, which is an honest state.

Bookmarks do not need a surface. The 245 imported views stay in Find.

### The History panel

Attack: use real data. There are 8 drafts, 7 shelved proposals, 1 current state, 1 baseline and 97 checkpoints. Then test the comparison that the panel exists to fix.

Result: the comparison holds, with a repair. Against Current, drafts report 2,905 to 3,077 changed subjects. Of those, 2,790 to 2,888 are marked removed, because a draft holds a fragment and Current holds the whole model. Against their predecessor checkpoint they report 2, 3, 3, 7, 8, 15, 49 and 61. The failing draft `93RlBGLx` draws in the running reader, with 49 changed subjects and no error (`critique-opus-02-draft-own-base.png`). That closes my round 1 question: the failure comes from the union of about 3,000 subjects, not from the router on an ordinary reading.

The repair is in the route. `against=<predecessor>` returns `STATE_NOT_FOUND` on all eight drafts, because those predecessors are legacy states outside the catalogue. If a proposal has `predecessorCheckpoint`, use it.

The panel itself fails on structure. It is a third surface type, between the left column and the page. A left destination gives the same list with the picture beside it. A click on a record then carries the picture to that state.

Verdict: withdraw the panel, and keep its content. History is the fourth left destination. Proposals come first, then states with their checkpoints folded. The state chip opens it. Publication and decision text live on the record, in the right panel.

The rule is now one sentence: the left column lists where to go, the middle shows it, and the right explains the selected thing. This also removes a concept, which gate 3 prefers.

### The tree as the table of contents of a proposal

Attack: count what changed.

| Draft      | Changes | Modules among them | Steps among them |
| ---------- | ------: | -----------------: | ---------------: |
| `93RlBGLx` |      49 |                  3 |               35 |
| `zFIdZB1Y` |      61 |                  5 |               46 |
| `yM7DOqT4` |      15 |                  4 |                6 |
| `D0qvstE4` |       7 |                  2 |                1 |

Result: my idea fails. A module tree can mark modules only. It shows 3 of 49 changes on the first draft, and the steps have no tree row at all.

Verdict: withdraw. Astra's change list replaces it, in the left column, grouped by owner. `N` and `P` stay. A change to a step opens that flow's sequence, so the walk crosses grammars. Neither paper said this, and the data forces it.

### The Key

Attack: ask whether a reading needs it. The median reading draws 2 relationship kinds, and the maximum is 7. `SemanticLegend` has no live caller.

Result: it survives, and it is small. One row is both the mark's meaning and the control that hides it. A mixed line needs a row too.

Verdict: keep. Group regions are off by default and switch on here. Measured: 111 modules carry groups. Seen: `critique-opus-09-webshop.png` shows that a group caption is the largest type on the picture. Astra's `Show` menu is the same idea, so this is not a real disagreement.

### Code paths on cards

Attack: my own round 1 warning said that a path line has an unknown cost. There are two costs to test: area and legibility. I also tested honesty.

Result on area: small. It adds 5.9 percent of area, and passing readings fall from 113 to 108 in pane B.

Result on legibility: a problem. A path in note type is 11 units, so it is 6.6 px at fit 0.6. So my 0.6 gate never protected the owner's decision. For a path at 9 px, a near card needs scale 0.82, which 80 of 123 readings reach. A far card with a path at the gist size of 13 units needs 0.69, which 94 reach.

Result on honesty: 29 of 453 bound paths do not exist in this checkout, all under `packages/renderer`, left behind by the Rust core in #24. A card that shows such a path states a falsehood. The derived paths also claim too much. `Architecture drawing` derives `apps/web/src/ui`, which holds the whole interface. Astra's objection holds.

Against Astra: the owner decided that a module shows its code path. Listing bound parts in the panel leaves 55 container cards with no path. The derivation works: 54 of 55 have a shared folder, and `code-opener` already opens a directory (`code-target-open.ts:69`).

Verdict: amend. A bound module shows its path. An unbound container shows its shared folder with a count, such as `apps/web/src/ui · 14 paths`, so it reads as a span and not as ownership. `Layout investigation` shows `2 folders`. A path that does not resolve wears the warning mark. In the far view the path replaces the gist. A long path keeps its tail. The path is relative to the open scope, and the empty case shows nothing. An external module shows no path.

### Orientation reading, Astra's strongest drawing idea

Attack: build it from what exists. The current tour's first beat focuses on `Agent CLI`, `Archboard server`, `Browser` and `Workspace packages`.

Result, in two parts. Through today's Focus, that reading is 5638 by 3202 with 46 lines, which is larger than the root (`critique-opus-orient.png`). Drawn strictly, with those four cards and their mutual lines, it is 631 by 557 and it reads at once (`critique-opus-orient2.png`). So the idea is strong, and Focus is the broken part.

Verdict: reject a new authored reading, and take its value another way. Every model then needs one more thing to author and keep current. Instead, repair Focus to draw exactly the focused subjects, with the rest as doors. The current tour's first beat then becomes this picture, and the caption's `Take the tour` is one click away.

The default stays the root. Let outside modules be name-only cards that keep their lines. The root is then 2779 by 1600, with 22 lines and 22 crossings, and it hides only implied lines (`critique-opus-rootdoors.png`). Its fit is 0.56 in pane B, just under the floor. My round 1 root reached 0.61 only by hiding 8 of 24 connected pairs. I take the honest picture. The landing floor handles the rest.

## 3. Where the two seats disagree

| Topic             | Opus, round 1                | Astra                  | Position                                                       | Reason                                                                             |
| ----------------- | ---------------------------- | ---------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Left column       | Full tree                    | Contextual outline     | Tree                                                           | It shows place and reads like the repository. The outline leaves the column empty. |
| Flows and tours   | Read menu                    | Destinations           | Destinations                                                   | A list stays open, and the nouns stay visible.                                     |
| History           | 480 px panel                 | Main workspace         | Left destination                                               | One rule for the column, with the picture beside the list.                         |
| Proposal contents | Tree marks                   | Change list            | Change list                                                    | Steps have no tree row.                                                            |
| First picture     | Root                         | Authored orientation   | Root, with a repaired Focus and a tour                         | No new authored concept, and the value survives.                                   |
| Line grouping     | One per pair                 | One per family         | One per directed pair, with a mixed style                      | Fewer lines, and an honest mark.                                                   |
| Outside context   | Doors, on the frame          | One to three neighbors | Doors, with the line on the one part that reaches them         | No pick is needed, and 59 percent stay exact.                                      |
| Line limit        | Hard 18                      | Soft 8 to 15           | Reduction above 18, stated                                     | A cap hides foundations. A target does nothing.                                    |
| Text floor        | 12 px at 0.6                 | 14 px at fit           | Name 12 px and path 9 px, landing floor 0.6                    | The Astra target holds on 60 of 123. Mine ignored the path.                        |
| Landing           | Always fit whole             | Keep readable scale    | Fit whole above 0.6, otherwise land at 0.6 on the frame's head | A person reads, then pans. Fit stays one key away.                                 |
| Container path    | Derived                      | None                   | Derived, shown as a span                                       | The owner's decision, with honest wording.                                         |
| Labels            | Keep the rank                | Replace it first       | Keep it now, and revisit the root                              | 10 percent inside the rules.                                                       |
| Layout engine     | Hidden                       | Selector               | Hidden                                                         | Repair geometry in the renderer.                                                   |
| `check` severity  | Warning, and a write refusal | Warning                | Warning                                                        | The owner named `check`. My refusal rule now flags 0 modules.                      |
| Ask answer        | In the panel                 | In the conversation    | Conversation                                                   | The panel changes with selection, and an answer must keep its capture.             |
| Leaving a tour    | Stay here                    | Explore and Resume     | Explore and Resume                                             | It serves a presenter's question.                                                  |
| Bookmarks         | Views in Read                | Saved readings         | Find only                                                      | No observed need for a surface or a Save action.                                   |
| Refresh           | Removed                      | Overflow menu          | Removed, with retry on the failure                             | The feed is live. A retry belongs at the failure.                                  |
| Enter a flow      | Cards lift to heads          | Plain change           | Plain first                                                    | Prove the core motion before building a new one.                                   |

### The design after this round

The shell keeps a 320 px left column, a pane, and a dock on request.

- Left column: `Find`, a repository switcher that shows the pane letter, the four destinations, and `Talk`.
- Header: crumbs with the code path, the state chip, and `Diagram | About`.
- Caption, one line: the scope's responsibility, then any statement of hidden lines.
- Picture: the open module with parts and doors. The Key sits at its lower left.
- Right panel: absent until a selection, 220 ms after a click.
- About: every long list.

## 4. Where my round 1 position was wrong

1. The 18-line limit. It makes foundations look unused, and it fails on the reading that matters most.
2. The Read menu. It hides what the product can do.
3. The History panel. It added a surface type for no gain.
4. The tree as a proposal's contents. Most changes are steps.
5. "One picture must teach without a pan or a zoom." That is a good aim and a bad rule. A 17-part module cannot obey it.
6. The root rule that hid lines of 9 cards. It also put `Architecture inputs`, the heart of the product, in a list with `libavoid`. That module has no relationship at all, which is a model fault that no check reports.
7. My two papers disagreed. The journey said doors for 11 externals, and the drawing said name-only for 9 childless cards. The journey said a dive, and the implementation said a carry. The journey said a line per direction, and the drawing said a line per pair.
8. "The whole model is the frame" at the root. No module owns that frame, so it needs a new kind of subject. Withdrawn.
9. The write refusal. It went beyond the owner's decision, and its rule now flags 0 modules. Pass-through flags 7.
10. Majority kind on a merged line. I accepted a false mark because `oneLine` already did it.
11. The 0.6 gate. It measured names and forgot the owner's path.
12. F3 as a possible router bug. The default comparison caused it.
13. Doors as small marks on an edge. No renderer draws that, and I priced none of it.
14. I treated `archboard` as the model. Shop's root already reads at fit 0.91 with no rules. The real failure is scale, and the rules must leave small models alone. They do: Shop's four readings all shrink slightly.
15. I said 520 ms for the camera glide after a pick. The code says 160 ms, and the interaction with a double-click was a defect that I missed.

## 5. What neither paper covered

The journey test finds these gaps. Each row names a state that the product can reach. A person can reach each today, unless the row says otherwise.

### The first minute

| Gap                               | Observed                                                                                                                                                                                                                | Position                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `222 warnings` at eye level       | Measured: 147 and 42 are anchors on steps and relationships, 29 are module paths, and 4 are others. The control cycles and selects a hidden module (`critique-opus-03-warnings.png`), and it says "Node", a board word. | Remove it from the first surface. Show a warning on the one subject it concerns. Put the model-wide count in About. |
| The panel's grammar               | Seen: "1 selected subjects are hidden in this reading".                                                                                                                                                                 | Show the message in correct English, or avoid the state.                                                            |
| The root's main store has no line | Measured: `Architecture inputs` has 0 relationships and no binding.                                                                                                                                                     | Repair the model in Slice 0. Add a `check` warning for an unconnected root.                                         |

### The fifth minute

| Gap                               | Observed                                                        | Position                                                                                |
| --------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| One-part dead stops               | Measured: 25 of 122.                                            | Fold chains, section 2.                                                                 |
| A door opens a large scope        | Measured: `Browser`'s door leads to 17 parts.                   | The panel lists real endpoints first, and a click there selects inside the destination. |
| The dock takes the picture        | Measured: 440 px. Tree, dock and panel leave 800 px of picture. | State this layout in the acceptance test. Unchecked as a design.                        |
| Group frames compete with modules | Seen in the root and in Shop.                                   | Off by default, in the Key.                                                             |

### Returning after a week

Neither paper asks the question a returning architect asks: what changed since I was here?

| Gap                              | Observed                                                                                                                                                       | Position                                                                                                                                                                    |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No "since you were here"         | Read: checkpoints have `doing` and a date. Nothing records a last visit.                                                                                       | Keep the last revision in browser storage. The caption says `5 changes since Oct 23`, and it opens History at that point. This is browser state and writes no architecture. |
| A saved link to a removed module | Measured with a deleted layer's identity: the banner and the body text blame the key and point at a path that is not there (`critique-opus-06-bad-scope.png`). | `retiredIds` holds 1,331 identities. Say that the module was removed, and offer its retained reading. If a live ancestor is known, open it.                                 |
| Bindings drift while away        | Measured: 29 bound paths are stale after #24.                                                                                                                  | The card marks them, and Ask offers to repair them.                                                                                                                         |
| The place was lost               | Read: camera memory is lost under the scope key.                                                                                                               | Pane memory by scope, and Continue on the Start page.                                                                                                                       |

### Planning a change

My paper did not cover this at all, and Astra's covers the happy path.

| Gap                                           | Observed                                                                                          | Position                                                                                                                                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A draft is not the whole architecture         | Measured: drafts hold 25 to 52 modules, against 532 in the current model.                         | The header says so. Do not imply that the rest of the model was removed. This is real data from imported fragments, and new proposals are different. Unchecked for a new proposal. |
| The default compare is wrong for a stale base | Measured above.                                                                                   | Default to the base. One line offers `Compare with current`, as both seats said.                                                                                                   |
| Live edits during review                      | Read: Astra's table covers a live edit. No paper covers a change list that changes during a walk. | Keep the walk position by subject identity. A removed subject says so.                                                                                                             |
| Adoption has no reader control                | Read: adoption goes through the agent.                                                            | The record says who can do it and offers Ask.                                                                                                                                      |

### Presenting to someone

| Gap                                  | Observed                                                                                                                                                      | Position                                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Present mode already exists          | Seen: `Present fullscreen` removes all chrome and keeps `Exit presentation`, `Pane A` and `Talk` (`critique-opus-04-present.png`). Neither paper mentions it. | Every move needs a keyboard route, because the tree and crumbs are gone. Backspace, `[`, `]`, Enter, `F` and `0` cover it. My search found only `0` today (`camera-keys.ts:41`). |
| A presenter has one screen of height | Seen: the picture gets more room, and it has no caption.                                                                                                      | Keep the caption as a small plate, or the audience has no scope name. Unchecked.                                                                                                 |
| No export or link control            | Read: the reader's header has neither. Export is CLI only.                                                                                                    | Add `Copy link`. Picture export waits for a real request.                                                                                                                        |
| The rules reach outside the reader   | Read: `model render` shares the projection, so README pictures, PR bodies and videos redraw.                                                                  | Regenerate them in the slice that ships the rules. A still picture must stand alone, which supports door lines on parts.                                                         |

### Empty, loading, failed and legacy states

| State                    | Today                                                                                                               | Position                                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| No repository registered | Unchecked.                                                                                                          | Start page with one line: run `archboard start` in a checkout, then ask an agent to describe it.                                                                                                 |
| New model, no modules    | Read: "No modules are visible in this reading" (`ModelDiagram.tsx:115`) and "No implemented state".                 | A planning screen that offers Ask. Do not use a word that sounds like a fault.                                                                                                                   |
| Filtered to nothing      | Read: the same text.                                                                                                | `Show whole scope`, as Astra said.                                                                                                                                                               |
| A scope with no flows    | Today's selector stays.                                                                                             | `All flows (72)` in the list.                                                                                                                                                                    |
| A model with no bindings | Measured on Shop: 0 of 18.                                                                                          | No path row, authored order, and no warning. `check` reports it once.                                                                                                                            |
| Loading                  | Measured in round 1: four texts in 399 ms.                                                                          | Keep the ground or the last picture. Show a message only after a delay, and name the destination.                                                                                                |
| Failed draw              | Read: a raw message and no action. Astra's finding 12.                                                              | Keep the last picture, name the failure, and offer Retry and Back.                                                                                                                               |
| Server gone              | Measured in round 1: a banner that moves the picture.                                                               | Lay it over the picture. Remove the false stale state.                                                                                                                                           |
| Missing source           | Astra covers this well.                                                                                             | Accept.                                                                                                                                                                                          |
| Legacy migration         | Seen: "Migration required" under `Current` and `Compare · Default`, with no action (`critique-opus-10-legacy.png`). | No reading controls. One action fills the composer with the preview request. The preview is a reading, so it opens like a proposal. Sort these repositories last, and never open one by default. |
| After migration          | Measured: 2,614 addresses and 245 views exist for this.                                                             | An old link resolves and names the new place. Both seats agree.                                                                                                                                  |

## 6. Acceptance changes

I replace my round 1 gates with these. Each is absolute, and each uses the shell's real panes.

1. The revised rules pass at least 108 of 123 readings at fit 0.6 in pane B. Below that, a reading lands at 0.6 on the frame's head.
2. A name reaches 12 px and a path reaches 9 px at landing, on every reading of at most 18 lines.
3. No line vanishes without a statement. The caption states any hidden count, and the panel lists every connection.
4. Shop's readings stay at or below today's size.
5. A draft opens against its base and draws without an error.
6. The council grades at the real pane, and the corpus includes `Workspace packages`, the root, `Browser`, `board` and `Command startup`.

## 7. Order of work

Each slice leaves the product better, and the owner can judge it by eye. Two side tracks run at any time.

| Slice | Work                                                                                                                                                                          | What the owner looks at                                                    | Touches                     |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------- |
| 0     | Model data. Name, summary, `Architecture inputs`, 29 stale paths, 7 pass-through containers.                                                                                  | The header says Archboard, and the root shows the main store connected.    | Vault                       |
| 1     | Content rules in the projection. Doors, one line per pair, a mixed style, reduction with its statement, groups off, far view on, a whole-fit ceiling of 1.0, a landing floor. | Four pictures: root, `Browser`, `Workspace packages`, `Command startup`.   | Projection, far view, fit   |
| 2     | One surface. Remove the keys, move the camera up, add the accepted scene record, keep the last picture, connect the carry.                                                    | Click through ten modules. No text flash, no lost header, and a real move. | Reader lifecycle            |
| 3     | Honest failures. Base by checkpoint, retry on a failed draw, no false stale banner, correct text for a removed module.                                                        | Open a draft. Open an old link.                                            | Reader, one default         |
| 4     | Left column and header. Tree, four destinations, one Find, crumbs and path in the header.                                                                                     | Find `apps/web`, then move between siblings.                               | Shell column, header        |
| 5     | Panel and About. Pinned foot, actionable rows, the Key, the 220 ms hold. Then remove the sidebar's tabs.                                                                      | Click a card, then double-click one at the right edge.                     | Panel, About, Key           |
| 6     | Start and return. Start page, legacy action, Continue, `changes since`.                                                                                                       | Open a new tab.                                                            | Start page, browser storage |
| 7     | Review. Change list, `N` and `P`, the walk across grammars, Before and After.                                                                                                 | Walk a draft of 49 changes.                                                | Left column, panel          |
| 8     | Renderer. Compaction, candidates by fit, and edge doors. If Slice 1 makes edge doors needless, drop them.                                                                     | The same four pictures.                                                    | Crates                      |

Side track A is server cost: split reads, one watcher per vault, hashed drawing keys. A person feels this most in Slices 2 and 4, so start it before Slice 4. Side track B is the `check` warnings and the skill text.

Slice 1 proves or kills the core idea fastest, for three reasons:

- It changes `model-projection.ts`, the far view flag and the fit ceiling. It touches no layout crate and no reader chrome.
- Today's reader shows the result at once, so the owner judges real pictures.
- The Browser and Workspace pictures in this paper already approximate it, so the risk of a surprise is low.

Kill test: the owner opens `Browser` and `Workspace packages`. If doors, or the reduced chain, do not read better than today, stop before any interface work. The fallback is an inside-only reading, as Astra proposed, with a connection reading on request. If Slice 1 passes, the dead-space complaint is mostly answered, and the rest of the redesign is safe to build.

Slice 2 comes before the interface because a person cannot judge navigation on a canvas that destroys itself. Slice 3 is small, and it stops the two worst false statements. I moved the renderer last, because the rules remove most of what it has to repair. The solver merge also changes its starting point.

## 8. Limits

- All geometry comes from a core older than `4b970e501`. I expect the shape of the results to hold, because the merge targets speed. I did not test that.
- The prototype of reduction is a greedy script on projected content. It has not passed the planner's guards. Its picture of `Workspace packages` is tall, and I judged it at 1920 by 1080, not in the real pane.
- The path row is a stand-in, added to the note text. A real row with mono type differs slightly.
- I measured two models. Only one of them is large.
- The mixed line style does not exist yet. It needs one small renderer input, so Slice 1 is not entirely free of renderer work.
- The double-click defect comes from reading code. I did not reproduce it, because the design does not exist yet.
- The carry from a card to a frame is unproven. Read: the subject id is the same, and its kind changes from `node` to `region`, with two groups (`picture-pairing.ts:6`). Slice 2 finds out.
- If the carry fails review, the dive returns. A dive needs a child's picture inside its card, so it also needs a draw ahead.
- I did not test keyboard paths, the light theme or a screen reader on the tree.
- My Astra verdicts rest on the Astra round 1 papers. I did not read the Astra round 2 critique.
