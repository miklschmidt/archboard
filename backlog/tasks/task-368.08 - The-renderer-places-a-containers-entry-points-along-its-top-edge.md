---
id: TASK-368.08
title: The renderer places a container's entry points along its top edge
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 01:17'
updated_date: '2026-10-06 10:42'
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
- [ ] #1 On the Track engine, a container's entry points take its first row, and its hidden parts sit below them
- [ ] #2 The readability measures of the scorecard do not get worse on the fixture boards and the dogfood boards, or the user accepts the pictures in a review
- [ ] #3 Every board still lays out under 1 second, and comparison and variant pictures keep working
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
<!-- SECTION:NOTES:END -->
