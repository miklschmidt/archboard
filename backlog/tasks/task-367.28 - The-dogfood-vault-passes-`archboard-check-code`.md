---
id: TASK-367.28
title: The dogfood vault passes `archboard check --code`
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-06 20:48'
updated_date: '2026-10-06 22:08'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-367
priority: medium
ordinal: 691000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-367 #5 asks that the dogfood vault pass the code check. After TASK-367.27 corrected the boards, `./bin/dogfood check --code` still exits 1 with 31 warnings, so a task can never close on a clean check and a new warning drowns among the old ones. ADR 0046 says right work must be able to clear every warning, so each remaining warning is either a board that does not draw what the code does, or a check that calls something a dependency that is not one. About a third are uses of a constant, an error class in a catch or instanceof, or a type guard, which the check counts as call evidence. The rest are real calls that the Archboard server, Board viewer, Board rasterizer, Codex session, Voice coordinator, Agent workbench and Codex workhorse boards do not draw. The 367.27 group notes on TASK-367.27 explain each one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each of the 31 warnings is cleared by a board that draws what the code does, or by a check rule that ADR 0046 records, and the task notes say which for each
- [ ] #2 A use that is no call or construction (a constant read, an error class caught or tested, a type-only use) is not call evidence, if the check changes, and a call or construction still is
- [ ] #3 `./bin/dogfood check --code` exits 0 on the current variants, and every board still lays out under 1 second
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Re-run ./bin/dogfood check --code after a restart and classify each of the 31 warnings by its evidence line: (a) a use that runs no code (constant read, instanceof or catch test, a name passed on), (b) a real call or construction the board does not draw, (c) other.
2. Check rule for (a): every code adapter marks a run-time use that does not call, construct, render, decorate or derive from the name as a use as a value (Reference.asValue, code-facts/lib/runs.ts). It stays call evidence, so it still supports relationships and anchors; it never makes RELATIONSHIP_UNDRAWN or CALLER_UNDRAWN on its own. Measured first: turning such uses into import evidence instead made about 40 right anchors ANCHOR_MISMATCH (passed-on handlers, contracts, data constants), so the kind stays. Amend ADR 0046 with the rule and the measurement; own it with focused tests per adapter and one code-check test; re-run every adapter test owner.
3. (b): per board a proposal TASK-367.28 through ./bin/dogfood (archboard-dev): draw what the board's question needs at its grain, prefer a container-level relationship, anchor each, rebind where the evidence shows a wrong binding; check --code --variant TASK-367.28, compare, adopt, ./bin/dogfood check; measure each picture's layout under 1 s.
4. CALLER_UNDRAWN on Board viewer from frontend/main.tsx: decide whether the board draws the page-start caller, record why.
5. Restart, ./bin/dogfood check --code exits 0; notes say how each of the 31 was cleared; gate lanes one at a time; commit through the helper.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Build (2026-10-07, @claude).

The check rule (f99fdb791). Some uses at run time run no code of the name. Such a use is now a use as a value (Reference.asValue, code-facts/lib/runs.ts). A call, a construction, a rendered component, a decorator, a message and a base class run code. Examples are a constant read, a name passed on, an instanceof or catch test, `typeof` and an `@selector`. Each name of a chain that the code calls runs too, as `api` in `api.read()`. The reason: the check cannot tell a member that the module defines from a member of a library. Every code adapter marks the use the same way: TypeScript, Python, C#, C, C++, Objective-C and Swift. The use stays call evidence. So it still supports relationships and anchors. But RELATIONSHIP_UNDRAWN (relationships.ts) and CALLER_UNDRAWN (module-reading.ts) now rest only on a use that runs code.

Why the evidence kind stays call: the first trial made such a use import evidence. That turned 39 right anchors into ANCHOR_MISMATCH warnings. 25 were call relationships that cite a handler or a contract passed on. 11 were data relationships that cite a constant. 2 were event and 1 was rpc. The ADR 0046 amendment records this. On the dogfood vault, the rule cleared 6 of the 31 warnings and took parts out of 4 others. It moved no other finding.

Owners: one test per adapter in code-facts/tests/*-facts.test.ts. With runsName forced to true, 6 fail. With it forced to false, 6 fail. In code-check, relationships.test.ts and interfaces.test.ts own the filter. Without the filter, 4 fail. All 214 tests of code-facts, code-check and language-servers pass. CONTEXT.md gains "Use as a value". The authoring reference and the help of check say that undrawn rests on code that runs.

The 31 warnings. (a) is a use that runs no code. (b) is a real call that the board did not draw. (c) is other.
1. Agent workbench, Coordinator callbacks, from Workhorse start. (a) ARCHBOARD_COORDINATOR_MANIFEST_SHA256 read. Cleared by the rule.
2. Archboard server, Application lifetime, from Service routes. (b) serverPhase(). A step of the flow "Is this the Archboard server?".
3. Archboard server, Semantic board store, from Archboard server, Pane registry and Service routes. (b) readSemanticBoard in the agent's brief, listSemanticBoards in boardForNewPane and in /health. Steps of "A pane arrives on a board", "A page connects its socket" and "Is this the Archboard server?".
4. Archboard server, Semantic renderer, from HTTP application. (b) diagramIconPaths for the icon route. The relationship HTTP application to Semantic renderer.
5. Archboard server, Pane registry, from Codex workbench, Claim routes and Service routes. Service routes is (a), clients.size, cleared by the rule. The others are (b), boardForPane and aggregateOf. Steps of "A pane arrives on a board" and "A user takes a board back".
6. Archboard server, Disk change watcher, from HTTP application and Pane routes. (b) watchSemanticBoardFiles and noteBoardShown. Steps of "The server starts" and "A pane arrives on a board".
7. Archboard server, Codex workbench, from Rename route. (b) publishPaneContext. A step of "A board is renamed".
8. Archboard server, Board lease, from Archboard server. (b) boardLockState in the agent's brief. A step of "A pane arrives on a board".
9. Archboard server, Board announcements, from Discard route. (b) announceDoing. A step of "A board is discarded".
10. Archboard server, Change feed, from Discard route and Board write routes. (b) settledChangeFields. Steps of "A board is discarded" and "An agent's write lands".
11. Archboard server, Archboard server, from Server entry. (b) serverStartupFailureMessage. A step of "The server starts".
12. Board rasterizer, DevTools connection, from Chromium executable and Page readiness. (b) isJsonRecord calls. The relationships Chromium executable to DevTools connection, and Page readiness to Headless browser, which holds DevTools connection.
13. Board rasterizer, Headless browser, from Rasterizer, Raster session and Walkthrough recorder. Rasterizer and Walkthrough recorder are (a), instanceof tests, cleared by the rule. Raster session is (b), new HeadlessChromiumError. The relationship Raster session to Headless browser.
14. Board viewer, Semantic viewer, from Browser client and Walkthrough replay. (b) boardAddressOf and useOverlayPlace. The relationship Walkthrough replay to Semantic viewer. The use by Browser client is the first step of the flow "A pane opens a board". A relationship from Browser client to the container put two labels off their routes, and wide-boards.test.ts refuses that. Four orders, the dependency kind, a label and a re-pointed relationship all failed the same way.
15. Board viewer, Fetch semantic reads, from Render stage states and Local pictures. Render stage states is (a), an instanceof test, cleared by the rule. Local pictures is (b), new SemanticBoardError. The relationship Local pictures to Fetch semantic reads.
16. Board viewer, Drive walkthrough focus, from Render stage states. (a) NO_FOCUS read. Cleared by the rule.
17. Board viewer, Refresh changed boards, from Render stage states. (b) GoDeeper calls useSemanticBoardChanges. A relationship.
18. Board viewer, Camera glide, from Fly into a card. (a) CAMERA_MOTION_ATTRIBUTE read. Cleared by the rule.
19. Board viewer, Frame clock, from Control camera. (b) frameClock().cancelAfter. A relationship.
20. Board viewer, Trace what a part reaches, from Render stage states. (b) reachOf in DetailsPanel. A relationship.
21 to 23. Board viewer, CALLER_UNDRAWN on Picture source, Picture cache and Local pictures, from frontend/main.tsx. Decision: the board draws the caller. The check is right to ask. The module exports the three and code outside it uses them, so they are part of the viewer's interface. "Stop exposing" does not apply, because the page start must wire them. The page start is also what makes a pane's pictures local, since it starts the page's renderer. The board gains a part, Page start, bound to frontend/main.tsx. Its order is 500, so it lays out first. It has relationships to Semantic viewer, to Draw here (the import() of the renderer) and to Walkthrough replay.
24. Board viewer, CALLER_UNDRAWN on Semantic queries. (c) Its callers are not main.tsx but board-catalog and vault-diagnostics. Cleared by the relationship Render stage states to Semantic queries. That is a real call: SemanticInspector, LevelMark, PartHistory and other panels call the queries. It makes Semantic queries an entry point, so the part is no longer hidden. Parts for the catalog and the diagnostics were tried: each card cost about 300 ms of layout and pulled in three more relationships.
25. Codex session, Codex session, from Workhorse start. (a) CODEX_SESSION_THREAD_SOURCE alias. Cleared by the rule.
26. Codex session, Classify request failures, from Serialize request identities. (b) requestParams. A relationship.
27. Codex session, Codex transport, from Generation hooks. (a) instanceof CodexTransportRemoteError. Cleared by the rule.
28. Codex workhorse, Authored instructions, from Thread link, Thread tools, Workhorse operations and Workhorse queue. (b) A call of a member of ADDITIONAL_CONTEXT_POLICY, assertCanonicalInstructionBytes, and createTextUserInput twice. Four relationships. Thread link's is a dependency.
29. Voice coordinator, Tool contract, from Spoken approval and Workhorse operations. Workhorse operations is (a), ARCHBOARD_WORKHORSE_NAMESPACE.name, cleared by the rule. Spoken approval is (b), Schema.safeParse. The relationship Spoken approval to Tool contract.
30. Voice coordinator, Authored instructions, from Spoken approval, Workhorse operations and Outcome report. (b) createTurnStartParams and createTextUserInput. Three relationships.
31. Voice coordinator, Codex session, from Coordinator callbacks. (a) instanceof CodexSessionMutationError. Cleared by the rule.

Layout and legibility. Relationships for every undrawn call broke the 1 s budget on the two dense boards. With 13 relationships, Archboard server took 1.2 to 1.35 s instead of about 0.8 s. With the vault policy, its track layout took 4.1 s. The bound of wide-boards.test.ts is 3 s. Its blocks layout ran past the 20 s test budget. Six relationships took Board viewer from 0.54 s to 1.1 s. Measured: labels cause most of the cost. Six unlabeled relationships on Board viewer took 0.57 s. And a flow step adds no line to a board that has relationships (step-lines.ts draws steps only on a board with none).

So Archboard server keeps its 83 relationships and gains one, the icon route, unlabeled and described. Its other undrawn calls are steps of eight flows of real exchanges, in three data-flow views. "Writes land" holds a write, a discard and a rename. "Panes and claims" holds a page's socket, a pane's arrival and a take-back. "Start and health" holds the start and the health answer. The relationships Archboard server to Semantic board store and to Board lease were tried first. Together they put two routes closer than a lane (nearLanes of wide-boards.test.ts). The store relationship also added 3 s to the blocks layout. So both became steps. The picture with 36 crossings is unchanged except for one muted line. Board viewer gains nine relationships, unlabeled, described and muted, the Page start card and the flow "A pane opens a board". The small boards gain labeled relationships. This departs from the advice of the consumer skill that every step is also a relationship. On these two boards, the relationships break the layout budget.

Timing after adoption, with bun docs/design/wide-board-layout-fixtures/timing.ts (no policy), at a load of about 2.5: Archboard server took 753 to 815 ms (786 before). Board viewer took 847 to 868 ms (542 before). Board rasterizer took 203, Codex session 112, Codex workhorse 113 and Voice coordinator 82. The slowest board is Board viewer at 868 ms. Every board is under 1 s. With the vault policy, first layout after a warm-up board (what wide-boards.test.ts measures): Board viewer took 969 ms (810 before). Archboard server took about 2.1 s on track, as before, so it was over 1 s already. Its blocks layout took about 11 s (10.2 to 10.4 s before). The new data-flow views each render in about 220 ms with the CLI round trip. A copy of wide-boards.test.ts over the proposals passed all 14 cases.

Closing. ./bin/dogfood check --code --variant TASK-367.28 against the run without it: no new finding, and all 31 warnings cleared. semantic compare shows only the additions above. Archboard server: relationships 1 added, 83 unchanged, sequences 8 added, steps 46 added. Board viewer: parts 1 added, relationships 9 added, sequences 1 added. Semantic viewer gains the entry points Refresh changed boards, Semantic queries and Trace what a part reaches, and the caller Page start. On Board rasterizer, Headless browser gains the caller Page readiness. Footprint against d5f171a78, the parent of f99fdb791: current is each proposal's parent, and namedAndChanged is empty. changedNotNamed is only on Archboard server: Code check and Code facts changed in f99fdb791, which changes how evidence is classified inside them and rewires nothing that the board draws. Language servers and Code check changed in b16fd0d44 and bb5785d04, which are TASK-367.15. The parts in namedNotChanged are named only by relationships or steps. All six proposals are adopted (266f05595). ./bin/dogfood check reports no diagnostics. ./bin/dogfood check --code exits 0 with 0 warnings and 13 EXPOSED_UNUSED information findings, and the skips exposure-unknown (src/ui) and text-only. Behind is 0 on the six boards.

Gate, one lane at a time on 2026-10-07: bun run lint exit 0. bun run fmt:check exit 0. bun run type-check exit 0. bun run build:frontend exit 0. bun run test:modules 4287 pass, 0 fail. bun run test:system 195 pass, 0 fail. bun run test:repository 21 pass, 0 fail. bun run test:serial-browser exit 0, 24 pass and 0 fail over its 19 files. The wide-boards test in test:modules reads the adopted boards and passes. bun run readme:check lists all 13 assets as stale. None of them shows a board that this task changed: they show Archboard, Renderer layout and the web shop. They are stale because broad source directories such as src/shared, src/ui and src/cli changed after the last refresh on 2026-10-06. So no asset was made again.
<!-- SECTION:NOTES:END -->
