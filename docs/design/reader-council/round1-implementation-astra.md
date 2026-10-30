# PR #19 implementation scrutiny

Seat: Astra. Lens: the canonical reader and its server implementation.

PR #19 needs a new reader composition over the existing model and renderer. Its largest defects sit between reading intent, accepted content, and the picture on screen. The implementation also turns ordinary browsing into repeated whole-model work.

The canonical model is worth keeping. The new `ModelDiagram` lifecycle, eager data delivery, and sidebar composition are not a sound foundation for the redesign.

## Scope and evidence

I reviewed `git diff 396bfd9add2f...integrate/pr19`, following reader changes into their server and shared runtime owners. I excluded the test-speed work. The branch started this review at `792359187`. It advanced to `e25b6cc34` through a Backlog-only commit during the review. That commit changed none of the source cited below.

Unqualified source citations refer to that branch. Citations marked `main@396bfd9add2f` refer to the original implementation. The relevant old motion hooks remain in the branch, so their current paths still identify reusable code.

I read the shared brief, product requirements, domain language, shell and navigation studies, rendering criteria, Blocks design, and TASK-559. I inspected the running reader at `http://127.0.0.1:17842` with a 1920×1080 CSS viewport. I used the available T3 browser tools. I changed no repository files, architecture, or Backlog records. I closed my browser tab when observation ended.

These artifacts record the direct observations:

- `/tmp/integrate/reader-council/evidence/astra-root-1920.png` shows the initial root reading. I inspected this picture. The browser saved a scaled 1280×720 image of the 1920×1080 viewport.
- `/tmp/integrate/reader-council/evidence/astra-measurements.json` records response sizes, initial controls, and a module-opening observation.
- `/tmp/integrate/reader-council/evidence/astra-state-and-cache.json` records component removal during a state change, requests, and persistent cache key sizes.
- `/tmp/integrate/reader-council/evidence/astra-socket-snapshot.json` records a fresh feed snapshot from a temporary subscription that I closed.
- `/tmp/integrate/reader-council/evidence/astra-reader-server.diff` preserves the reader and server diff used during inspection.

The measured times describe this session, not an isolated renderer benchmark. Other council work shares the machine. I did not repeat the brief’s 4.9-second and 40-second solve investigations. I also did not independently reproduce its 58-percent CPU observation.

## Ranked findings

### 1. Idle browsing creates repeated synchronous whole-model work, including work that survives the browser

Severity: P1. This costs every open tab responsiveness and consumes server CPU while nobody navigates. Fix this before the redesign.

`useModelCatalog` subscribes to every readable repository and also issues a complete model query for each one. It needs only the manifest for its repository rows. See `apps/web/src/ui/hooks/architecture-model/use-model-catalog.ts:89`, `:93`, `:101`, and `:69`.

Each socket subscription creates its own `watchArchitectureModel`. There is no shared server watcher per vault. See `apps/server/src/server/sockets/architecture/architecture-feed.ts:36` and `:55`.

Each watcher reads the model every second and compares complete objects through two `JSON.stringify` calls. See `packages/board/src/runtime/operations/read/model-watch.ts:92` and `:109`. The interval is 1,000 ms at `packages/timing/src/shared/constants/board-locks.ts:14` and `:108`.

A complete read captures every input twice, parses documents, validates the graph, sorts subjects, and derives relationships. See `packages/board/src/runtime/operations/read/model-read.ts:172`, `:224`, and `:308`. Both captures use synchronous directory reads, file reads, and hashing. See `packages/board/src/runtime/store/model-files.ts:45`, `:64`, and `:99`. This work blocks the server event loop.

There is another watcher for agent activity. Registry startup follows every repository, and every architecture HTTP request also calls `agentActivity.follow`. See `apps/server/src/server/routes/repositories/repository-routes.ts:288` and `apps/server/src/server/wiring/application/application.ts:105`. `createAgentActivity` starts another full watcher and stops it only during server disposal. It never removes a vault when a tab closes or the registry changes. See `apps/server/src/server/state/agent-activity/agent-activity.ts:148` and `:163`.

Thus, for a followed vault, the server normally performs one activity poll plus one poll per subscribed tab each second. Every canonical poll reads the authored files twice. Opening another checkout can leave its activity watcher alive until server shutdown.

The remaining diagnostics poll now performs a full model read too. See `apps/web/src/ui/clients/semantic-board-canvas/reads/queries.ts:149` and `apps/server/src/server/routes/architecture/configuration-routes.ts:12`.

Use one server observation owner per vault. Let file changes and completed operations invalidate a cached coherent revision. Keep claims and repository summaries cheap. Retain the existing installation barriers. Do not replace coherence with unchecked cached content.

### 2. The pane reports a requested reading as drawn before the picture exists

Severity: P1. This breaks trust between the architect, the agent, and the diagram. Fix this before the redesign.

The ordinary reader calls `useModelExplanation` with the new model, URL fields, and selection before the drawing resolves. It supplies no readiness argument. See `apps/web/src/ui/components/architecture-model/ModelReading.tsx:99`.

`useModelReadingReport` defaults `ready` to `true`. It publishes architecture even during local layout, a missing flow, or a failed drawing. See `apps/web/src/ui/hooks/architecture-model/use-model-explanation.ts:127` and `:136`. The action remains available because `unavailable` checks the host, pending action, and capture, but not drawing readiness. See the same file at `:101`.

This is also wrong when an old picture remains visible. `ModelDiagram` retains previous drawing data, but passes the latest model and projection to `ModelScene`. See `apps/web/src/ui/components/architecture-model/ModelDiagram.tsx:70` and `:90`. Hit testing uses the old atlas while selection translation, lighting, and inspection use the new projection. See the same file at `:177`, `:199`, and `:214`.

Inference from these code paths: an explanation can describe the new reading while the person still sees the old picture or a drawing message. Aggregate selection can also translate through relationships that do not belong to the displayed picture. I did not invoke an agent to demonstrate this mismatch.

The old reader explicitly paired inspection with the drawn variant. See `main@396bfd9add2f:apps/web/src/ui/components/semantic-board-canvas/SemanticDiagram.tsx:336` and the surviving `drawnReading` at `:244` on this branch.

Introduce one accepted scene record containing its reading identity, revision, projection, drawing, and readiness. Keep requested intent separate until that scene arrives. Build pane reports, hit testing, inspection, and explanation captures from the accepted record.

### 3. Reading changes destroy stable React owners

Severity: P1. The user loses spatial orientation, controls, and scroll position during normal exploration. Replace this lifecycle as part of the redesign.

The outer pane remains stable across ordinary state changes, but its contents do not. `ModelResponse` keys `ModelWalkthroughFrame` on the optional response model ID. Pending data changes that key from the model ID to `undefined`, then back. See `apps/web/src/ui/components/architecture-model/ArchitectureModelStage.tsx:393` and `:455`.

Removing this key alone is insufficient. `ModelWalkthroughFrame` changes from a fragment to `ModelWalkthroughReader` when content arrives. That moves the header into another component subtree. See `apps/web/src/ui/components/architecture-model/ModelWalkthroughReader.tsx:37`. The pending branch also replaces the complete `ModelReading`, including its sidebar. See `ArchitectureModelStage.tsx:409` and `:428`.

Scope navigation has a separate reset. `ScopedModelReading` is keyed by scope. Behavioral readings use a grammar-and-flow key and another component branch. See `apps/web/src/ui/components/architecture-model/ModelReadingCanvas.tsx:41`, `:52`, and `:77`. Its child owns `useBoardCamera`, so each reset discards the camera and the prior picture. See `apps/web/src/ui/components/architecture-model/ModelDiagram.tsx:74`.

Explicit subject navigation resets the whole pane context through another key. External navigation increments `arrival`, which keys `ArchitectureModelStage`. See `ArchitectureModelStage.tsx:98`, `apps/web/src/ui/hooks/architecture-model/use-model-arrival.ts:36`, and `apps/web/src/ui/components/application/ApplicationPane.tsx:224`.

I measured the distinction directly. Opening Browser preserved the header, reading wrapper, and sidebar nodes, but replaced the diagram node. The drawing message lasted about 111 ms in that observation. Selecting draft `93RlBGLx` replaced all four nodes. The sidebar was absent for 349 ms. The diagram was absent for 3,203 ms. These are DOM observations recorded in the evidence files, not inferred from appearance alone.

Keep the pane frame, header, controls, sidebar, and scene host mounted. Apply a new reading to them. Keep intentional selection resets separate from component lifetime. Preserve camera state for Back and Forward within the same model.

### 4. The canonical diagram bypasses the existing picture choreography

Severity: P1. The user cannot follow what moved, appeared, or disappeared. Restore the motion contract as part of the redesign.

The new reader calls `stagePicture` directly whenever the SVG changes. See `apps/web/src/ui/components/architecture-model/ModelDiagram.tsx:234`. `stagePicture` replaces the SVG children immediately. It does not animate between pictures. See `apps/web/src/ui/clients/semantic-board-canvas/picture/picture-transition.ts:144`.

The old reader called `usePictureTransition`, supplied `camera.followPicture`, and supplied departure and presentation state. See `main@396bfd9add2f:apps/web/src/ui/components/semantic-board-canvas/SemanticDiagram.tsx:325`. That owner still implements entrance, shared-subject motion, departure ghosts, and camera compensation. See `apps/web/src/ui/hooks/semantic-board-canvas/use-picture-transition.ts:265`.

The new ordinary reader also disables `useAutoFit` by passing `null` for its drawing. It substitutes an immediate whole-picture fit while the camera remains unhandled. See `apps/web/src/ui/components/architecture-model/ModelDiagram.tsx:172` and `:259`. Once the person pans, changing focus or filters can leave new content outside the existing camera. Before a pan, it jumps to fit instead of gliding.

The detailed motion inventory below distinguishes removed motion from surviving motion. A general CSS transition change cannot fix these disconnected owners.

Extract a scene presentation interface from the old canvas. Adapt canonical subject identities to it. Replace the parallel staging loop in `ModelDiagram` rather than adding another animation system.

### 5. The first page eagerly requests an archive and whole models for a repository list

Severity: P1. This delays opening and makes ordinary menu use expensive. Fix the data boundary before the redesign.

The current reader always mounts the selected model query, a current catalogue query, and the checkpoint query. See `apps/web/src/ui/components/architecture-model/ArchitectureModelStage.tsx:125`. The repository navigator also requests each complete model, as described in finding 1.

I measured a 2,809,336-byte current model response and a 6,090,445-byte checkpoint response containing 96 checkpoints. A fresh socket snapshot measured 2,797,883 bytes. The initial page issued the model HTTP request and subscribed to the socket. The socket path canceled the HTTP request in this run. A different arrival order can complete both.

The snapshot plus checkpoint list alone represents about 8.89 MB of JSON content before other repositories and application assets. This is content size, not a claimed compressed wire total. The browser also loaded the 10,881,721-byte renderer WASM asset from cache. That asset is an existing renderer cost, not a new PR #19 regression.

The model includes 670,809 bytes of migration metadata and 273,374 bytes of walkthroughs. Relationships also appear inside module outgoing lists and in a separate 398,706-byte relationship array. These sizes come from the measured response.

Checkpoint listing reads all retained records and resolves publication information for every checkpoint. Its metadata retains complete revisions and source evidence. See `packages/board/src/runtime/operations/history/read.ts:449` and `packages/board/src/runtime/operations/history/result.ts:135`.

Opening either reading selector repeats both the catalogue and checkpoint requests, even when neither changed. See `apps/web/src/ui/components/architecture-model/ModelReadingSelector.tsx:37` and `ModelComparisonSelector.tsx:33`. The model also refetches on every mount, browser focus, and reconnect. Checkpoints use infinite freshness but explicitly refetch on those same events. See `apps/web/src/ui/clients/architecture-model/queries.ts:170` and `:197`.

Return a small repository summary and a small, paged checkpoint catalogue. Fetch checkpoint evidence when requested. Keep one complete selected model in the tab if local projection needs it. Do not duplicate that cost for each catalogue or metadata query.

### 6. Selecting one module downloads another whole model and resolves unrelated references

Severity: P1. The normal inspect-and-follow journey repeatedly incurs model-wide network, parsing, and server work. Fix this before the redesign.

For a bound module, `useModelNavigation` calls the complete model endpoint with `module`, `code`, and `references`. Each module has a different query key. See `apps/web/src/ui/hooks/architecture-model/use-model-navigation.ts:13`.

Selecting Browser transferred another 2,798,112 bytes and took 405 ms in the browser resource record. The diagram needed no new architecture. The response existed to supply source availability and reference details.

The server also resolves every reference in the model, not only the selected module’s references. See `packages/board/src/runtime/operations/read/model-navigation.ts:188` and `packages/board/src/runtime/operations/read/model-references.ts:231`. It later returns the full model with those resolutions. The client filters the resulting references back to the selected module at `use-model-navigation.ts:56`.

Give module navigation a narrow response keyed by model revision and subject. Resolve only that module’s references. Keep existing revision and identity guards, which correctly prevent stale source actions.

### 7. Drawing keys contain the complete render request and accumulate without a canonical cleanup policy

Severity: P1 for repeated exploration and the next implementation. Fix this before building more reading controls.

`prepareContentHere` uses `JSON.stringify(request)` as its key. The request includes projected content and the complete variant used for interface classification. See `packages/renderer/src/ui/state/browser-renderer.ts:130` and `apps/web/src/ui/clients/architecture-model/drawing.ts:25`.

The client serializes that key again and places it inside a React Query key and an IndexedDB key. See `apps/web/src/ui/clients/architecture-model/drawing.ts:34`. I measured five canonical cache keys containing 4,979,750 characters in total. The largest key contained 1,180,836 characters. These are keys alone, before SVG and atlas values.

This is avoidable serialization and storage on the interaction path. An unrelated complete-model change can invalidate every scoped drawing because the complete variant participates in each key.

`cachedModelDrawing` only reads and writes. It has no canonical eviction or revision cleanup. See `apps/web/src/ui/clients/semantic-board-canvas/reads/picture-cache.ts:75`. The old cleanup understands nine-field board keys and treats other shapes as obsolete. It cannot serve as a safe canonical cleanup policy without adaptation. See the same file at `:207` and `:221`.

Use a bounded digest of the exact renderer inputs and renderer build. Keep complete input classification where rendering needs it, not in the cache identifier. Add one shared retention policy for canonical and retained pictures.

### 8. The new reader removes the aids that made large diagrams readable and navigable

Severity: P1. Architects now need manual zooming and searching to recover information that the old canvas exposed. Restore these capabilities as part of the redesign.

The root screenshot contains a large drawing with names that are difficult to read at fit. PR #19 compounds that layout problem by hardcoding `far: false`. The old canvas enlarged names at distant zoom levels. See `apps/web/src/ui/components/architecture-model/ModelDiagram.tsx:301` and `main@396bfd9add2f:apps/web/src/ui/components/semantic-board-canvas/SemanticDiagram.tsx:362`.

The canonical canvas also omits subject tips and sticky container headings. The old owners are still present at `apps/web/src/ui/hooks/semantic-board-canvas/use-subject-tip.ts:1` and `use-sticky-heads.ts:1`. Their original installation appears at `main@396bfd9add2f:apps/web/src/ui/components/semantic-board-canvas/SemanticDiagram.tsx:361` and `:368`.

Selection from the sidebar does not reveal the selected object in the camera. Search opens its parent and selects it, but supplies no camera target. See `apps/web/src/ui/components/architecture-model/ModelReading.tsx:90`. The old reveal behavior kept connected subjects in view and glided to offscreen picks. See `apps/web/src/ui/hooks/semantic-board-canvas/use-reveal.ts:80` and `:95`.

The canonical canvas also omits `useClearOfPanel`. In a split pane, its floating inspector can cover the selected subject without moving the picture clear. See the surviving implementation at `apps/web/src/ui/hooks/semantic-board-canvas/use-clear-of-panel.ts:40` and its old stage connection at `SemanticBoardStage.tsx:355`.

Do not attribute every readability failure to Blocks. The reader discarded several protections against large geometry. Restore them while the renderer team repairs route spacing through its own evidence.

### 9. The sidebar reproduces model-wide catalogues where the user needs local navigation

Severity: P1. The architect cannot discover the next useful step without scrolling through unrelated material. Remove this composition through the redesign.

The initial reader subtree contained 105 buttons, including 19 walkthrough choices. This count includes content below the fold. The root screenshot shows a long state account and walkthrough list before module navigation becomes available.

The cause is explicit ordering and scope. `ModelReadingSidebar` places state evidence and every model walkthrough before scope details and module navigation. It then appends model-wide groups and an ownership limitation. See `apps/web/src/ui/components/architecture-model/ModelReadingSidebar.tsx:59`. `ModelWalkthroughChoices` renders its entire input. See `ModelWalkthroughChoices.tsx:21`. `ModelGroups` derives groups from the complete model. See `ModelGroups.tsx:14`.

Meanwhile, the 320-pixel left navigator represents repositories only. It cannot show the active module path or help navigate the model hierarchy. See `apps/web/src/ui/components/shell/Navigator.tsx:49`, `:126`, and `:167`. The right sidebar holds the breadcrumbs and diagram controls as well as inspection. See `apps/web/src/ui/components/architecture-model/ModelReading.tsx:162` and `:225`.

The old sidebar ordering assumed one board with a few walkthroughs. Applying it to a repository-wide model changes the workload completely. The original study counted one or two walkthroughs per board. See `docs/design/pane-sidebar-hierarchy.md:25`.

Make local scope and the next exploration action primary. Move model-wide history, migration records, and narrative catalogues into deliberate destinations. Filter narrative suggestions by the current journey. Do not preserve the present right-column composition merely because its components are reusable.

### 10. Relationship inspection becomes a dead end, and the picture loses its legend and layout choice

Severity: P2. These omissions add repeated search steps and remove practical recovery from an unreadable drawing. Fix them as part of the redesign.

Module connection rows render the other endpoint as a paragraph. They expose neither selection nor navigation callbacks. See `apps/web/src/ui/components/architecture-model/ModuleDetails.tsx:149` and `:199`. Several interface connections also render plain paragraphs. See `ModelInterface.tsx:34` and `:46`. A reader can discover a related module’s name but must search elsewhere to follow it.

The old picture legend and layout selector also disappear from the canonical sidebar. Their previous composition remains at `apps/web/src/ui/components/semantic-board-canvas/SemanticBoardPanel.tsx:199` and `:221`. The new sidebar’s complete composition at `ModelReadingSidebar.tsx:51` contains neither.

The canonical drawing request never reads the browser layout preference or supplies a layout choice. See `apps/web/src/ui/clients/architecture-model/drawing.ts:25`. Thus the existing Track preference cannot rescue a difficult canonical Blocks reading. This is a removed capability, not merely a missing label.

Make endpoints actionable through the same subject navigation owner. Restore a legend derived from the accepted scene. Connect layout selection to the drawing request and its cache key.

### 11. The socket and HTTP reader overwrite the same cache entry with different catalogue coverage

Severity: P2. History and state metadata can disappear until another HTTP read restores them. Fix this contract before the redesign consumes the cache more widely.

The HTTP default model read attaches retained state metadata. See `packages/board/src/runtime/operations/proposals/read.ts:465` and `:483`. The socket snapshot uses the synchronous current read, whose result omits `states`. See `packages/board/src/runtime/operations/read/model-watch.ts:83` and `model-read.ts:227`.

I observed that difference directly. The HTTP response contained `states`. The fresh socket snapshot contained eight proposals and no `states` field.

The feed cancels current reads and replaces the default query with this less complete snapshot. It explicitly excludes that query from subsequent invalidation. See `apps/web/src/ui/clients/architecture-model/events.ts:114` and `:118`. The UI then falls back from all states to active proposals. See `apps/web/src/ui/rules/architecture-model/state-catalogue.ts:10`.

Opening a selector refetches the catalogue, which repairs the omission after another expensive request. That workaround does not make two different resource meanings safe under one key.

Separate the lightweight state catalogue from architecture content, or make both transports supply the same resource contract. Keep the feed’s generation guards and stale-status handling.

### 12. A local drawing failure has no working retry through the visible Refresh action

Severity: P2. A transient renderer failure can leave the current reading unusable until the user navigates away or reloads. Fix this before the redesign.

`ModelDiagram` renders an error message with no retry action. Its query disables retries. See `apps/web/src/ui/components/architecture-model/ModelDiagram.tsx:84` and `apps/web/src/ui/clients/architecture-model/drawing.ts:43`.

The header Refresh invalidates only the `architecture-model` query family. Drawing queries use the separate `model-drawing` family. See `apps/web/src/ui/components/architecture-model/ArchitectureModelStage.tsx:146` and `apps/web/src/ui/clients/architecture-model/drawing.ts:36`. An unchanged successful model response therefore leaves the failed drawing query untouched.

This is a code-derived recovery defect. I did not force a renderer failure into the shared running environment.

Offer a retry at the failed drawing, targeting its exact drawing query. Keep a prior accepted picture available with an explicit failure state when one exists.

### 13. Two reader stacks duplicate ownership, while obsolete live-board plumbing remains in the application

Severity: P2. The next implementer must trace multiple obsolete paths before finding the live behavior. Remove obsolete live paths through the redesign and consolidate shared presentation.

`ModelDiagram` and `SemanticDiagram` separately compose staging, camera gestures, lighting, selection, and arrival detection. The old stage composes reveal, fitted camera, dive, and sidebar protection. The new stage independently replaces that composition with fewer behaviors. See `apps/web/src/ui/components/architecture-model/ModelDiagram.tsx:131`, `apps/web/src/ui/components/semantic-board-canvas/SemanticDiagram.tsx:267`, and `SemanticBoardStage.tsx:287`.

This duplication already causes the missing behavior in findings 3, 4, and 8. It is not a naming objection. Future motion or selection repairs need one presentation owner to reach both canonical and retained readers.

The application also still creates old board view and pick state. See `apps/web/src/ui/components/application/Application.tsx:274` and `apps/web/src/ui/hooks/application/use-pane-reading.ts:96`. It builds `onVariantChange` and `openBoard` callbacks and passes them to `usePaneViews`. See `Application.tsx:347` and `:385`. That hook retains them as dependencies, but `paneElement` passes none of them to `ApplicationPane`. See `apps/web/src/ui/hooks/application/use-pane-views.ts:78` and `:141`.

`useDrillRepositories` has no production caller in `apps/web/src`. Its definition remains at `apps/web/src/ui/hooks/application/use-drill-repositories.ts:30`. Remove these unused live-reader branches after separating the small legacy-address adapter that still serves migration.

Do not delete `semantic-board-canvas/` wholesale. `ReplayStage` still mounts `SemanticBoardStage` for exact retained legacy recordings. See `apps/web/src/ui/components/walkthrough-replay/ReplayStage.tsx:149`. Its read provider explicitly refuses live legacy reads without a capture. See `apps/web/src/ui/clients/semantic-board-canvas/reads/board-reads.ts:48`.

Keep that retained-history boundary. Extract its useful picture presentation into the shared reader rather than maintaining two complete interactive canvases.

## Motion inventory against origin/main

The claim that every transition disappeared is too broad. The principal picture transitions disappeared because the canonical reader bypasses their owner. Some camera, sidebar, caption, and shell motion still exists.

- Initial picture entrance: lost. The old owner called `enterPicture`, which staged an entrance before the picture settled. See `apps/web/src/ui/hooks/semantic-board-canvas/use-picture-transition.ts:273`. The new owner calls only `stagePicture` at `ModelDiagram.tsx:238`.
- Shared-subject motion after edits and comparison changes: lost. The old path paired subjects, carried their geometry, faded removals, and drew additions. See `apps/web/src/ui/clients/semantic-board-canvas/picture/picture-transition.ts:361`. The new reader replaces the picture directly at `ModelDiagram.tsx:238`.
- Camera compensation during a changing picture: lost. The old canvas passed `camera.followPicture` into the transition owner. See `main@396bfd9add2f:apps/web/src/ui/components/semantic-board-canvas/SemanticDiagram.tsx:327`. The canonical staging path never supplies an equivalent callback.
- Departure and arrival across unrelated readings: lost. The old owner called `leavePicture`, `ghostPicture`, and `enterPicture`. See `apps/web/src/ui/components/semantic-board-canvas/SemanticDiagram.tsx:216` and `apps/web/src/ui/hooks/semantic-board-canvas/use-picture-transition.ts:273`. The canonical reader has no departure state and unmounts on scope changes.
- Drill into and back out of a module: lost. The old stage connected `useDive`, camera state, and its drawing. See `main@396bfd9add2f:apps/web/src/ui/components/semantic-board-canvas/SemanticBoardStage.tsx:293`. The canonical open action updates the URL, then the scope key replaces the diagram. See `ModelReading.tsx:70` and `ModelReadingCanvas.tsx:52`.
- Automatic fit after a changed reading: lost as a glide. Ordinary canonical reading passes no drawing into `useAutoFit` and calls immediate fit instead. See `ModelDiagram.tsx:172` and `:261`.
- Reveal of an offscreen selected subject and clearance from a floating inspector: lost. The old owners remain at `use-reveal.ts:95` and `use-clear-of-panel.ts:40`. The canonical canvas does not call them.
- Relationship sweep during attention and tracing: lost. The old canvas called `useSweep`. See `main@396bfd9add2f:apps/web/src/ui/components/semantic-board-canvas/SemanticDiagram.tsx:360`. The canonical canvas installs lighting and marks, but no sweep. See `ModelDiagram.tsx:189` and `:246`.
- Traffic stopping during manual camera movement and resuming gradually: lost. The old canvas called `useTrafficRest`. See `main@396bfd9add2f:apps/web/src/ui/components/semantic-board-canvas/SemanticDiagram.tsx:398`. The canonical canvas starts traffic through staging and only stops it during picture replacement or cleanup. See `ModelDiagram.tsx:238` and `:263`. Traffic itself survives.
- Zoom, keyboard pan, and manual fit: retained through `useBoardCamera` and `moveCameraByKey`. See `ModelDiagram.tsx:74` and `:223`. The redesign must preserve these controls and their reduced-motion behavior.
- Sidebar show and hide: retained through `SemanticSidebar` and `useSidebarSlide`. See `apps/web/src/ui/components/semantic-board-canvas/SemanticSidebar.tsx:302`. Reading replacement interrupts that motion by removing the sidebar. Walkthrough entry hides the ordinary reader through `Activity`, bypassing its normal step-aside journey. See `ModelWalkthroughReader.tsx:95`.
- Walkthrough caption transitions: retained because `ModelWalkthrough` uses `SemanticPresentation`. See `apps/web/src/ui/components/architecture-model/ModelWalkthrough.tsx:140`. Camera glides between already available beats remain connected through `ModelDiagram.tsx:172`. Picture morphing between those beats is lost. For an uncached beat, placeholder retention is disabled at `ModelDiagram.tsx:72`, so its scene disappears while drawing.

The repair is a shared mounted scene presenter with explicit arrival and departure intent. Reusing only `CameraSurface` cannot restore the behavior of the old stage.

## State ownership judgment

The intended split is sound. The URL owns portable reading intent. Query owns server responses. A pane owns temporary selection and the camera. The sidebar derives its placement and selected tab from that pane state. See `docs/agents/frontend.md:150`, `:166`, and `:224`.

The implementation breaks this split at acceptance and lifetime boundaries. Query completion remounts presentation owners. Pane reports describe intent before drawing. HTTP and socket responses disagree about catalogue coverage. Those defects are findings 2, 3, and 11.

Do not move the entire model into pane context or put ordinary pointer selection into the URL. A URL `subject` is a starting destination, not the continuing pointer selection. That distinction is deliberate at `docs/agents/frontend.md:150` and `ModelPane.tsx:14`.

Retain the current generation guards for canceled reads and late socket events. See `apps/web/src/ui/clients/architecture-model/events.ts:94` and `:114`. Retain exact comparison identity and revision checks. See `apps/web/src/ui/hooks/architecture-model/use-model-comparison.ts:56`. Build the new accepted-scene boundary around those protections.

The server render endpoint is not yet a complete substitute for the browser reading pipeline. Its schema cannot express the browser’s explicit comparison, bookmark, preview, or layout choice. See `packages/board/src/shared/schemas/model-operations.ts:22` and `apps/server/src/server/routes/architecture/flow-routes.ts:37`. If the redesign uses server-rendered previews, first align that contract with the complete reading intent. Do not silently render a different reading.

## What to keep and what to replace

Keep the canonical module forest, stable subject identities, authored flows, and shared projection. `projectModel` already supplies children, context, aggregate relationships, comparison content, and interface facts. See `packages/board/src/shared/rules/model-projection.ts:102`. Those facts support a clearer exploration journey without another architecture store.

Keep the renderer, glyph output, and interaction atlas. The renderer owns geometry. The root screenshot establishes a readability problem, but does not isolate a PR #19 layout regression from the changed projection. Fixing huge route spacing still belongs in the renderer. The Blocks design explicitly preserves that separation at `docs/design/blocks-planned-layout.md:9`.

Keep the camera mechanics, old picture transitions, subject hit testing, reusable sidebar frame, caption presentation, and source opener. Keep aggregate-to-authored selection translation at `apps/web/src/ui/hooks/architecture-model/use-model-selection.ts:59`. Keep captured walkthrough revisions and explicit restart behavior at `ModelWalkthroughReader.tsx:114`.

Replace the canonical reading lifecycle, model-wide polling, oversized resource responses, and oversized cache keys. Replace the sidebar’s catalogue-first structure. Remove unused live-board application plumbing. Adapt exact retained recordings to the same presentation primitives without changing their retained architecture.

The unknown checkout change from the brief remains unproven. I found an explicit chooser in `apps/server/src/server/routes/panes/pane-show-route.ts:136` and `:224`. It runs only for agent-marked show requests. That code establishes a possible path, not the caller of the reported 40-ms change. The logs inspected here did not establish that caller. Do not report a random registry race as a confirmed defect.

The immediate sequence is to fix observation cost, resource contracts, and scene acceptance. Then replace the reader composition over the preserved model and shared presentation machinery. Those changes remove the expensive and unstable foundation before the redesigned journey depends on it.
