---
id: TASK-436.04
title: >-
  The 36 relationships that end on a private file of a module move to entry
  points
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 01:37'
labels:
  - dogfood
dependencies: []
parent_task_id: TASK-436
ordinal: 698000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-368.05 moved relationships from outside a module that end on a part bound to a private file of that module, but only on boards with no containers. 36 remain: Board rasterizer 12, Agent workbench 8, Voice coordinator 7, Board viewer 6 and Codex session 3.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each of the 36 relationships ends on an entry point of its module, or the notes say why the code really uses the private file
- [x] #2 `./bin/dogfood check` reports no diagnostics
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Proposals: Board rasterizer@TASK-436.04, Agent workbench@TASK-436.04, Voice coordinator@TASK-436.04, Board viewer@TASK-436.04 and Codex session@TASK-436.04. Read all 36 crossings against the public roots and the actual callback registrations.
2. Draw real module ownership: headless Chromium, semantic rasterizer and walkthrough recorder entry points on Board rasterizer; viewer container bound to the full semantic-board-canvas module; Thread unload drawn whole through its module root. Preserve all continuing relationship ids.
3. Move the Record command to the public recording entry point and internal recording calls to their actual owner. Annotate each other crossing with its root re-export, public instance method, handled route or injected/subscribed callback. Explain actual private server composition in notes rather than invent a public wrapper.
4. Run semantic diagnostics and named-proposal code checks against the current vault. Keep proposals pending parent integration and gate; adopt only once their source evidence is current.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read all 36 private-owner crossings. Current distribution is Board rasterizer 12, Agent workbench 8, Voice coordinator 8, Board viewer 5 and Codex session 3; the task recorded 7 coordinator/6 viewer before later changes. The total stays 36. A lib implementation does not make a call private when a public root re-exports that definition or a public object supplies its method. Each mechanism is recorded on its continuing relationship as well as here.

Ownership corrections: Headless browser now binds its module directory; Semantic rasterizer contains its public Rasterizer and implementation parts; Walkthrough recorder contains its recording entry, tools and public read/render parts, with the Record command routed to Recording entry. The public PNG dimension caller from Skill evaluation is drawn. Thread unload is drawn whole at its module root on two boards. Semantic viewer now binds its module directory, so its root-exported setup parts are entry points; real additional calls revealed by that binding are drawn. All continuing subject and relationship ids are kept.

The 36 evidence records:
- Board rasterizer: Raster session -> Chromium launch: The caller imports the headless-chromium root. The target implements the exported launchHeadlessChromium, DevTools instance methods or discoveredChromiumPath; it is a public entry point, even though its owner file is under lib/. Anchor src/runtime/semantic-rasterizer/lib/session.ts:launchHeadlessChromium
- Board rasterizer: Raster session -> DevTools connection: The caller imports the headless-chromium root. The target implements the exported launchHeadlessChromium, DevTools instance methods or discoveredChromiumPath; it is a public entry point, even though its owner file is under lib/. Anchor src/runtime/semantic-rasterizer/lib/session.ts:DevTools.evaluate
- Board rasterizer: Rasterizer -> Chromium executable: The caller imports the headless-chromium root. The target implements the exported launchHeadlessChromium, DevTools instance methods or discoveredChromiumPath; it is a public entry point, even though its owner file is under lib/. Anchor src/runtime/semantic-rasterizer/index.ts:discoveredChromiumPath
- Board rasterizer: Walkthrough recorder -> Chromium executable: The caller imports the headless-chromium root. The target implements the exported launchHeadlessChromium, DevTools instance methods or discoveredChromiumPath; it is a public entry point, even though its owner file is under lib/. Anchor src/runtime/walkthrough-recorder/lib/tools.ts:discoveredChromiumPath
- Board rasterizer: Walkthrough recorder -> Chromium launch: The caller imports the headless-chromium root. The target implements the exported launchHeadlessChromium, DevTools instance methods or discoveredChromiumPath; it is a public entry point, even though its owner file is under lib/. Anchor src/runtime/walkthrough-recorder/lib/tools.ts:launchHeadlessChromium
- Board rasterizer: Walkthrough recorder -> DevTools connection: The caller imports the headless-chromium root. The target implements the exported launchHeadlessChromium, DevTools instance methods or discoveredChromiumPath; it is a public entry point, even though its owner file is under lib/. Anchor src/runtime/walkthrough-recorder/index.ts:DevTools.readBlobTo
- Board rasterizer: Replay command -> Talk files: The caller imports the walkthrough-recorder root, which re-exports readTalk, requireFreshPlace and renderTalk from these implementing children. Anchor src/cli/commands/semantic-replay.ts:readTalk
- Board rasterizer: Replay command -> Frame renderer: The caller imports the walkthrough-recorder root, which re-exports readTalk, requireFreshPlace and renderTalk from these implementing children. Anchor src/cli/commands/semantic-replay.ts:renderTalk
- Board rasterizer: Frame renderer -> Chromium launch: The caller imports the headless-chromium root. The target implements the exported launchHeadlessChromium, DevTools instance methods or discoveredChromiumPath; it is a public entry point, even though its owner file is under lib/. Anchor src/runtime/walkthrough-recorder/lib/render.ts:HeadlessChromium.openWindow
- Board rasterizer: Frame renderer -> DevTools connection: The caller imports the headless-chromium root. The target implements the exported launchHeadlessChromium, DevTools instance methods or discoveredChromiumPath; it is a public entry point, even though its owner file is under lib/. Anchor src/runtime/walkthrough-recorder/lib/render.ts:DevTools.call
- Board rasterizer: Record command -> Talk files: The caller imports the walkthrough-recorder root, which re-exports readTalk, requireFreshPlace and renderTalk from these implementing children. Anchor src/cli/commands/semantic-record.ts:requireFreshPlace
- Board rasterizer: Rasterize command -> Bounds and limits: The CLI reads RASTER_MIN_SCALE from the semantic-rasterizer root; the exported constant is implemented by Bounds and limits. Anchor src/cli/commands/semantic-rasterize.ts:RASTER_MIN_SCALE
- Agent workbench: Codex transport -> Tab sessions: The server composes the tab-session owner and passes routing or lookup callbacks through the public runtime or Browser gateway interfaces. Private server code registers and invokes those callbacks; the runtime modules never import codex-workbench-sessions.ts. Anchor src/server/archboard/lib/codex-workbench-sessions.ts:onNotification
- Agent workbench: Browser gateway -> Tab sessions: The server composes the tab-session owner and passes routing or lookup callbacks through the public runtime or Browser gateway interfaces. Private server code registers and invokes those callbacks; the runtime modules never import codex-workbench-sessions.ts. Anchor src/server/archboard/lib/codex-workbench-browser-gateway.ts:require
- Agent workbench: Thread tool calls -> Tab sessions: The server composes the tab-session owner and passes routing or lookup callbacks through the public runtime or Browser gateway interfaces. Private server code registers and invokes those callbacks; the runtime modules never import codex-workbench-sessions.ts. Anchor src/runtime/codex-dynamic-tools/lib/authority-classification.ts:resolveExactLogicalCaller
- Agent workbench: Browser pane -> Tab session presence: The browser reaches the handled WebSocket route. websocket-connection.ts calls noteTabSession inside the Archboard server; no browser imports the private tab-sessions file. Anchor src/server/archboard/lib/tab-sessions.ts:noteTabSession
- Agent workbench: Tab sessions -> Thread unload: The caller receives the unload method of the public createCodexThreadUnload factory imported from the module root; the module is drawn whole. Anchor src/server/archboard/lib/codex-workbench-sessions.ts:unload
- Agent workbench: Voice coordinator -> Thread unload: The caller receives the unload method of the public createCodexThreadUnload factory imported from the module root; the module is drawn whole. Anchor src/runtime/codex-coordinator/lib/coordinator.ts:unload
- Agent workbench: Approvals -> Tab sessions: The server composes the tab-session owner and passes routing or lookup callbacks through the public runtime or Browser gateway interfaces. Private server code registers and invokes those callbacks; the runtime modules never import codex-workbench-sessions.ts. Anchor src/server/archboard/lib/codex-workbench-bindings.ts:forThread
- Agent workbench: Browser gateway -> Conversation start: The server passes a BrowserThreadLinkActions port to Browser gateway. command-dispatch invokes its create method; the implementation remains inside the Archboard server private thread-link composition. Anchor src/server/codex-workbench/lib/command-dispatch.ts:create
- Voice coordinator: Workhorse operations -> Callback queue: The callback queue subscribes to the operations and semantic ports passed to the public createCodexCoordinatorCallbacks factory. The incoming event reaches its subscribed callback, not a private import by the publisher. Anchor src/runtime/codex-coordinator-callbacks/lib/callbacks.ts:subscribe
- Voice coordinator: Tab sessions -> Callback queue: The callback queue subscribes to the operations and semantic ports passed to the public createCodexCoordinatorCallbacks factory. The incoming event reaches its subscribed callback, not a private import by the publisher. Anchor src/server/archboard/lib/codex-workbench-sessions.ts:routeCallback
- Voice coordinator: Callback delivery -> Outcome report: The server composition imports createOutcomeReportPort from its own lib/ implementation and passes the returned report port to callback delivery. The callback module invokes that injected port; it never imports the private server file. Anchor src/server/archboard/lib/codex-workbench-session-bindings.ts:createOutcomeReportPort
- Voice coordinator: Semantic context -> Callback queue: The callback queue subscribes to the operations and semantic ports passed to the public createCodexCoordinatorCallbacks factory. The incoming event reaches its subscribed callback, not a private import by the publisher. Anchor src/runtime/codex-coordinator-callbacks/lib/callbacks.ts:subscribeSettledChange
- Voice coordinator: Codex transport -> Tab sessions: The server composes the tab-session owner and passes routing or lookup callbacks through the public runtime or Browser gateway interfaces. Private server code registers and invokes those callbacks; the runtime modules never import codex-workbench-sessions.ts. Anchor src/server/archboard/lib/codex-workbench-routing.ts:routeCoordinatorTool
- Voice coordinator: Coordinator thread -> Thread unload: The caller receives the unload method of the public createCodexThreadUnload factory imported from the module root; the module is drawn whole. Anchor src/runtime/codex-coordinator/lib/coordinator.ts:unload
- Voice coordinator: Tab sessions -> Thread unload: The caller receives the unload method of the public createCodexThreadUnload factory imported from the module root; the module is drawn whole. Anchor src/server/archboard/lib/codex-workbench-sessions.ts:unload
- Voice coordinator: Tab sessions -> Tell coordinator: The server imports answerUnownedTellCoordinator from the callbacks root, which re-exports the implementation in tell-coordinator.ts. Anchor src/server/archboard/lib/codex-workbench-sessions.ts:answerUnownedTellCoordinator
- Board viewer: Fetch semantic reads -> Archboard server: The browser sends HTTP semantic reads to the handled server routes. This is a network entry point, not an import of semantic-board-routes.ts. Anchor src/ui/semantic-board-canvas/api/semantic-boards.ts:fetch
- Board viewer: Walkthrough replay -> Board reads: The page or replay imports the semantic-board-canvas root. It re-exports readBoardsFrom from the implementing child, so the relationship ends on that public entry point. Anchor src/ui/walkthrough-replay/lib/replay-page.ts:readBoardsFrom
- Board viewer: Page start -> Picture source: The page or replay imports the semantic-board-canvas root. It re-exports takePicturesFrom from the implementing child, so the relationship ends on that public entry point. Anchor frontend/main.tsx:takePicturesFrom
- Board viewer: Page start -> Local pictures: The page or replay imports the semantic-board-canvas root. It re-exports createLocalPictureSource from the implementing child, so the relationship ends on that public entry point. Anchor frontend/main.tsx:createLocalPictureSource
- Board viewer: Page start -> Picture cache: The page or replay imports the semantic-board-canvas root. It re-exports browserPictureStorage from the implementing child, so the relationship ends on that public entry point. Anchor frontend/main.tsx:browserPictureStorage
- Codex session: Generation hooks -> Handshake and request path: The caller invokes initialize on the public CodexSession object returned by createCodexSession. The target owns that public instance method; no caller imports its private implementation file. Anchor src/server/archboard/lib/codex-workbench-hooks.ts:initialize
- Codex session: Workhorse start -> Gate protocol operations: The caller invokes threadStart on the public CodexSession object returned by createCodexSession. The target owns that public instance method; no caller imports its private implementation file. Anchor src/runtime/codex-workhorse-start/lib/start.ts:threadStart
- Codex session: Codex transport -> Answer reverse requests: createCodexSession registers reverseRequests.onServerRequest with the transport. The transport invokes this subscribed callback; it does not import the private reverse-requests file. Anchor src/runtime/codex-session/lib/session.ts:onServerRequest

Initial focused proposal checking resolved the endpoint findings; subsequent ownership refinements and their exact corrections are recorded below.

All five TASK-436.04 proposals are adopted. This task corrects the board description of existing code; it makes no source API change. Board viewer@TASK-436.10 was then restated after TASK-436.04 and adopted, preserving the corrected ownership and the implemented warning-navigation description. Continuing relationship identities are retained, including Record command's moved endpoint. The code's public re-exports, object methods and injected callback ports are the real entry points; no wrapper was invented solely to silence a diagram finding.

The new ownership exposed actual omitted dependencies during checking. Semantic rasterizer's PNG reader has a Skill evaluation grading-images caller, now drawn. The viewer now contains Render stage states and Picture traffic, which are physically owned by semantic-board-canvas. Existing variantTimeline, NoBoardHeader, frameClock and runTraffic calls are drawn. Semantic queries has two real outside callers, board-catalog/use-board-catalog and vault-diagnostics/use-vault-check; both are drawn through semanticBoardListQuery/vaultCheckQuery anchors. Catalogue queries also subscribes to the public onSemanticBoardChange API; that separate call is drawn. These fixes resolve CALLER_UNDRAWN and RELATIONSHIP_UNDRAWN findings without changing checker policy. The ffmpeg Nix command's existing unlabelled relationship gains its actual NIX_ARGV source anchor.

Final first native layout, vault policy, one measured render per engine: Board rasterizer Track 563.232 ms / Blocks 363.634 ms; Agent workbench 766.013 / 2995.269 ms; Voice coordinator 180.881 / 294.853 ms; Board viewer 1523.998 / 15090.113 ms; Codex session 115.090 / 74.688 ms. Every touched drawing on both engines has zero card intrusions and zero labels off their own runs. Two rasterizer route labels were moved into descriptions after the layout owner found them off their routes. The default Track bound and the Blocks wall-clock test budget remain unchanged. Viewer Blocks is costly, with the additional real callers explicitly drawn.

Final current ./bin/dogfood check and ./bin/dogfood check --code both exit 0, with zero diagnostics and zero warnings. EXPOSED_UNUSED has 16 information findings against 13 in the integrated baseline. The three additions are pre-existing exports revealed by broader module bindings: Walkthrough recorder (10 of 19 names), Semantic rasterizer (14 of 23), and the repeated Archboard server context on Live panes (112 of 114). TASK-436.04 adds no exports; the two local module readings report existing interface, not an API added by this task. Parent accepted that scope explanation; unrelated API removal was not invented. No active claims remain. Final status and acceptance criteria await the parent full gate.

Closing audit: this task changes boards only. No source commit carries Refs: TASK-436.04, so no source base or source footprint category applies. Five pre-adoption semantic comparisons match the actual parents: Rasterizer Po5nqvPy, Workbench pVuh6kOj, Coordinator HQ2dUcmc, Viewer hGmp80Kl, and Session nMbRpuPH. Added ownership and entry points intentionally describe unchanged source. The source evidence and final code pass support all thirty-six cases.

Final gate: bun run check exits 0 in 436 seconds with 4,597 passing tests, including the complete serial browser lane. Lint, formatting, root and frontend types, and builds pass. The refreshed server runs sixteen boards. The delivery code pass exits 0 with zero diagnostics and zero warnings. Complete gate log: /tmp/archboard-task436-final-check-2.log. Delivery evidence: /tmp/archboard-task436-delivery-code.json.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Audited all thirty-six private-owner crossings and adopted the five corrected boards. Relationships use actual public exports, object methods, handled routes or injected callbacks. Additional real callers are drawn. Semantic and code passes report no warnings, and the full gate passes.
<!-- SECTION:FINAL_SUMMARY:END -->
