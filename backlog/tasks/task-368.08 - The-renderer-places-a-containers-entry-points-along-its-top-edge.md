---
id: TASK-368.08
title: The renderer places a container's entry points along its top edge
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 01:17'
updated_date: '2026-10-06 11:15'
labels:
  - interfaces
  - renderer
dependencies:
  - TASK-368.02
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: medium
type: feature
ordinal: 644000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board reads from the top down, and callers sit above what they call. When the reached children of a container sit on its top edge, a deep module looks deep: a narrow row of entry points over a larger hidden body. This is layout, which the renderer owns (ADR 0023), and no new visual channel (ADR 0025).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On the Track engine, a container's entry points take its first row, and its hidden parts sit below them
- [x] #2 The readability measures of the scorecard do not get worse on the fixture boards and the dogfood boards, or the user accepts the pictures in a review
- [x] #3 Every board still lays out under 1 second, and comparison and variant pictures keep working
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Base: the worktree branch had no commits of its own and stood 11 commits behind main, which holds ADR 0044 and inspectContainer; fast-forwarded it (no rebase).
2. Plumbing: DiagramRenderRequest gains the whole variant (before any view narrows it, without what a comparison restores); renderBoard passes variant.content. Absent, the variant's own reading of the view (held, else content) stands in. renderArchitecture derives each drawn container's entry points with inspectContainer over that content and hands the ids to the layout, inside the layout cache key.
3. compoundGraph marks each entry point node with a layout option; the inline tree (Track) reads it into BlockTree.entries. Blocks nesting never reads it, so Blocks pictures do not move.
4. Clusters gains the invisible edges that stand every hidden part of a container below every entry point of it (weight 0, minlen 1), skipping a pair that would close a loop through the lines, titles and edges already added. Entry points stay held below the title, so they take the first row; callers already rank above what they call.
5. Tests: a renderer module test on a container whose hidden part would otherwise share the first row; a view that hides the caller (renderBoard); a restored removed child is not an entry point.
6. Measure the scorecard (a fixed copy of measure.ts with orderedFixture, scratch only) before and after on the wide-board fixtures, the dogfood vault and examples/web-shop, every variant; time each first layout; render every variant through renderBoard with and without its comparison; rasterize before and after pictures.
7. Gate lanes one by one, readme:check, commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions the ADR did not settle (recorded per the standing rule: take the recommended option):
- Where the whole variant comes from: DiagramRenderRequest gains an optional variant (the whole variant before a view narrows it, without what a comparison puts back). renderBoard passes variant.content; every real picture (server route, browser, CLI, rasterizer) goes through renderBoard. Absent, the variant's own reading of the view (held, else content) stands in, so measure.ts and direct renderArchitecture callers keep working.
- Entry points are derived with inspectContainer over that content in renderArchitecture, marked on the graph as the layout option archboard.entry, and are part of the layout cache key. Blocks receives the marks and ignores them: the task scopes the rule to Track, and Blocks pictures do not move.
- First entry points: hidden parts are held below the entry points that no other part of the container leads to along the lines (source to target), inside or round through outside parts. An entry point another part calls stands below that caller (callers sit above what they call). A first try that held every hidden part below every entry point dragged containers down after an entry point reached round through the outside (Codex session: Answer reverse requests, reached via Handshake then Codex transport): Board viewer TASK-387 grew from 4554x3043 to 6972x4264, crossings 75 to 126, first layout about 10 s. Rejected.
- A hidden part that a first entry point already leads to gets no edge: Graphviz orders each rank by every edge, so a redundant invisible edge still moved cards (Web shop Synchronous checkout and Event-sourced orders, Codex session changed with no change of rank). Other hidden parts are held below each first entry point by invisible edges with weight 0 (rank only, no pull), leaving out any that would close a loop.
- Consequence: a container whose every entry point is reached from inside (a hidden composition root calls them) has no first entry point and nothing is held: Agent workbench (Generation composition calls Browser gateway; Tab session presence calls Browser gateway) and Browser client on TASK-381 (Frame clock). There a hidden caller stands on the first row above the entry point it calls. Browser client on the other variants has no caller at all, so all its children are hidden parts and no row is held (ADR 0044: zero entry points).
- A nested container that is an entry point stands at its title row; hidden parts are held below that title, not below its whole body. No vault has nesting yet (ADR 0044 Context).
- A group region inside a container is not a part; its members are parts of the container. A region packed as a block of its own (groups nesting) is not constrained across blocks.
- README assets: all 13 were already stale on 40d4471bf before this change, and this change draws every web-shop and dogfood picture byte-identically, so nothing was refreshed.

Measures (scratch copy of docs/design/wide-board-layout-fixtures/measure.ts with orderedFixture, because measure.ts itself fails on the legacy fixtures that carry no order: ZodError on nodes[0].order; plus every variant of examples/web-shop):
- Before (4cae19963) and after: all 69 drawings (6 wide-board fixtures, every variant of the 15 dogfood boards, every variant of the 3 web-shop boards) measure identically on every scorecard measure and page size, and their 114 rasterized pictures (69 plain + 45 comparison) are byte-identical. The rule holds on every drawing that has a first entry point: no hidden part shares the first row with it.
- So criterion 2 passes on the measures: none gets worse.
- A board the rule moves (a hidden Scheduler that only calls Core, beside an API entry point) draws API alone on the container's first row and the Scheduler below it, one row taller.
Layout time (timing.ts, first render, 3 runs each): Board viewer 917/924/930 ms without the change, 915/917/918 ms with it; every other board under 310 ms. A first, per-pair reach walk cost about 170 ms on Board viewer; reach sets are now computed once per part.
Comparison pictures: renderBoard of every variant with and without its comparison (126 pictures) succeeds. The slowest whole renderBoard (embedded fonts, paint included) is a Board viewer comparison at 1.2-1.8 s both with and without the change; it is not the layout and was already over 1 s before (TASK-377 owns the render budget).

Gate side effect: src/runtime/semantic-renderer/tests/standing.test.ts 'keeps this simple fixture's cards stable while comparison channels change' failed. Its fixture's Legacy Bridge is a hidden part of Board Runtime that only writes to Vault; the rule now stands it below the entry points board-io and Edit Queue, and its line into Vault no longer shares a trunk with board-io's, so the comparison had nothing to split (channels still work). The test now adds gw -> legacy so Legacy Bridge is an entry point and the two lines share a trunk while they stand alike; a mutation that drops the relationship standing from the graph still fails it.

Independent review of 9af57a33e on 2026-10-06. Main stood at 69f08b811, and the vault and the web shop were copied there. Verdict before the fixes: NOT CLEAN.

Findings and fixes:
- Must fix, 8438e2489. The layout read which entry points are first off the lines that a view draws. A view can hide the inside caller of an entry point, such as a composition root. Such a view then held a row that the whole variant does not hold. On main, three views moved and read worse, so criterion 2 failed:
  - Archboard server, "One write lands": bends per route 1.1 to 2.2, shared corridor 0 to 195, shared ink 0 to 0.10.
  - The same view: label reach 252 to 364, route length 4284 to 4817, megapixels 2.68 to 3.10.
  - Archboard server, "Live server state": fit 0.59 to 0.55, route length 6608 to 6732.
  - Agent workbench, "Owning the child": route length 702 to 1484, bends 0.5 to 1.0.
- The fix derives which entry points are first with the interface, off the relationships of the whole variant (`entryPointsOf` in compound-graph.ts, ADR 0044). The `archboard.entry` option carries true or false. entry-row.ts no longer walks the drawn lines. A part inside a nested container now counts for the child that holds it. The line walk missed that part.
- New test: "a view holds a container's first row only where the whole variant does". It fails on 9af57a33e.
- Must fix, 230a46bc9. measure.ts stopped with a ZodError on the legacy fixtures. It now wraps them in `orderedFixture`, as timing.ts does.
- standing.test.ts: the added `gw -> legacy` is a fair repair. It puts back what the fixture needs: two lines of one kind into Vault, from cards that stand alike. Every assertion stays as it was. A test run without `archboard.relationship.standing` in the graph still fails, as it must.

Decision 2 is kept. The decision: when another part leads to every entry point, the container holds no first row. In such a container, criterion 1 and "callers sit above what they call" conflict. The board itself says that a hidden part, a composition root, calls the entry points.

I measured one alternative. When no first entry point exists, it holds the other hidden parts below the entry points that no other entry point leads to. It reads worse:
- Archboard server (current): crossings 68 to 91, bends 2.6 to 2.8, label strand 0.67 to 0.80, corridor routes 6 to 8.
- Agent workbench, Current architecture: 6 measures worse, with fit 0.40 to 0.38, megapixels 5.27 to 5.58 and label reach 429 to 447.
- Browser application, TASK-391: crossings 22 to 24, route length 6% longer.

ADR 0039 puts crossings first, so I rejected it. On main, these containers are Archboard server, Agent workbench, Board viewer, Voice coordinator and Browser application on TASK-391. In each of them, every hidden part on the first row leads to an entry point.

Measures on main. Before is 155bdef83, the commit is 9af57a33e, and the fix is 8438e2489.
- measure.ts with ALL=1: default policy, 6 fixtures and every variant of the 15 boards, 73 drawings. Nothing changed for the commit or for the fix.
- With the vault policy: 81 drawings, from the fixtures and every variant of the vault and of the web shop. Also 494 renderBoard pictures: every variant, every view, comparison on and off. The commit changed the 8 view pictures above and no whole drawing. With the fix, all 494 pictures and 81 scorecards are byte-identical to before. Criterion 2 passes.
- Criterion 1 on main: no container that has a first entry point has a hidden part on its first row. Board persistence, which draws the store as a container, holds Vault diagnostics, Rename and Discard on that row.
- Layout time, from timing.ts: the first render, 3 rounds each. Other agents kept the load average at 5 to 7.
  - Board viewer: 964, 952 and 919 ms before. 917, 1019 and 938 ms with the commit. 936, 921 and 979 ms with the fix.
  - Skill evaluation 496 to 539 ms. Command interface 317 to 356 ms. Archboard server 280 to 305 ms. Agent workbench 284 to 305 ms. Board persistence 235 to 261 ms. Codex workhorse 58 to 70 ms.
  - Every other board and fixture: under 200 ms.
  - `entryPointsOf` costs 0.13 ms on Board viewer. Board viewer stood at the 1 s line before this task. The rule adds nothing that can be measured. TASK-377 owns the render budget.

Board: Renderer layout adopted TASK-368.08 in b7132cb82. Entry row (entry-row.ts) is called by Card blocks (card-layout.ts:261, `entryRowEdges`). View dispatcher calls Compound graph (index.ts:381, `entryPointsOf`). Semantic renderer draws the layout only as Layout engines, so it needs no change. `./bin/dogfood check` reports no diagnostics.

README: readme:check lists 12 stale assets. All 12 were stale at 155bdef83, which had 13. Every picture draws byte-identically, so I refreshed nothing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
On the Track engine, a container's first entry points take its first row and its hidden parts sit below them, held by weight-0 invisible edges. Which entry points are first is read from the whole variant's relationships, not from the lines a view draws (ADR 0044). Where every entry point is called from inside the container, no first row is held, because callers sit above what they call. Verified by entry-row.test.ts (including a view that hides an inside caller) and by the reviewer on main: 494 renderBoard pictures and 81 scorecards byte-identical to before, first layout under 1 s on every board except Board viewer, which was already at about 950 ms and gained nothing measurable. Renderer layout draws the Entry row part (adopted at version 29).
<!-- SECTION:FINAL_SUMMARY:END -->
