# Read the repository, then plan its change

Astra, round 1. Lens: the user journey and the information architecture.

Replace the control-heavy reader with a repository navigator, a stable picture, and an inspector that opens for a selected subject. The architect starts with the current system, follows responsibilities into their source, and opens a separate review workspace when a change becomes relevant.

The owner settled the treatment of numbered layers during this study. Delete Layer 0 through Layer 7. Add no replacement groups. Show code paths on module cards. Navigation must relate directly to the repository. Authoring guidance and `archboard check` must flag containers that have neither code nor a separate job.

This paper proposes behavior and composition. It changes no repository files, model inputs, or Backlog records.

## Evidence and limits

I read the requested product, domain, shell, navigator, sidebar, grading, and Blocks documents, plus TASK-559. I inspected the current reader and the old canvas at `origin/main`, commit `396bfd9add2fcc9af304efdcdce7d7359fad047c`. The working checkout reported `7923591878de9020d3d37b383019aa013e123633` during inspection.

I opened the running reader, selected Browser, opened its contents, selected Sequence, chose a flow, opened the state menu, and started a walkthrough. I also opened a proposal. I inspected every screenshot cited below. The shared preview used a 1920×1080 CSS viewport and saved 1280×720 raster images. That scaling limits judgments about exact text sharpness. DOM measurements establish the sidebar and picture dimensions.

The browser tool supplied by this session took precedence over the brief's shell browser wrapper. I closed my inspection tab afterward. I did not start an old server or claim to observe old animation playback. Statements about old motion come from source at the specified commit.

Observed facts:

| Evidence | Observation |
| --- | --- |
| `/tmp/integrate/reader-council/evidence/astra-01-start.png` | Opening `/` in this session showed a migration refusal for another repository. Current and Compare remained above that refusal. This is an observed session start, not proof of every first-run default. |
| `/tmp/integrate/reader-council/evidence/astra-02-root.png` | The root title was `vKEsyHFk`. A small, widely spread diagram occupied the middle. The sidebar began with selection controls, adoption prose, and walkthroughs. |
| `/tmp/integrate/reader-council/evidence/astra-03-selected-browser.png` | Browser's description and document references filled the inspector. Open module and Open code were below the initial viewport. |
| `/tmp/integrate/reader-council/evidence/astra-04-browser-scope.png` | Opening Browser exposed its children inside a large frame. Wide spaces separated several cards. The left navigator still listed repositories, not Browser's position. |
| `/tmp/integrate/reader-council/evidence/astra-05-flow-required.png` | Choosing Sequence replaced the picture with an instruction to choose a flow. The existing sidebar inventory remained. |
| `/tmp/integrate/reader-council/evidence/astra-06-sequence.png` | Choosing “A part's code is opened” drew an exchange with Browser, Code opener, Architecture runtime API, and Code facts. |
| `/tmp/integrate/reader-council/evidence/astra-08-walkthrough.png` | The walkthrough removed the inspector and provided a large caption plate, progress, navigation, and optional narration. The header retained general reader controls. |
| `/tmp/integrate/reader-council/evidence/astra-09-proposal.png` | The proposal capture was still drawing. Its sidebar reported 2,955 changed subjects against the current architecture. This image does not establish the finished proposal's layout. |

A filesystem count found 540 modules, 453 direct code bindings, 19 roots, 19 walkthroughs, 17 flow collections, and 72 flows. Browser had eight immediate children and two nearby modules in its structural reading. Its picture measured 3291×1860 drawing units inside a 1319×1040 CSS-pixel surface. The inspector measured 280 CSS pixels wide.

The state menu DOM contained 97 `data-reading-id` entries, including Current. It also contained repeated proposal names with different identities. The menu was closed again in the saved capture. I do not use that image as evidence of its open appearance.

The current title is authored data, not an accidental ID fallback: `.archboard/vault/model.json:3` gives both ID and name as `vKEsyHFk`. The UI therefore needs better authoring as well as better hierarchy.

My inference: the reader exposes its model-selection machinery before it establishes a meaningful place. A newcomer must assemble a useful reading while the interface explains neither a clear starting point nor a clear next step.

## The screen to build

Keep the shell's materials, typography, themes, gold navigation cues, and desktop constraint. Replace its division of work.

At 1920×1080, use a 288-pixel navigator on the left. The remaining 1632 pixels belong to the reading. A 360-pixel inspector opens only when the person selects something. The picture then keeps 1272 pixels before separators. These are proposed dimensions, not measurements of an implementation.

The navigator contains the repository switcher, one search field, and three destinations: Structure, Flows, and Walkthroughs. Structure is selected initially. Its content is a contextual outline: the open module, its parent action, and its immediate children. It never expands all 540 modules into a permanent tree.

The picture has a stable header with the containment path, the selected architectural state, and an overflow menu. A second compact row gives the open module's responsibility and any active reading restrictions. No restriction produces no empty row. The current state label remains visible even when its menu is closed.

The right inspector answers one question: what does this selected subject mean? The conversation remains in the existing dock and opens on request. Proposal review and history use the main workspace, where their comparisons and records have enough width.

This changes the old sidebar contract deliberately. Its study examined boards with short local lists and at most six variants per board. The new reader has model-wide inventories. Keeping every section expanded no longer fits that content. See `docs/design/pane-sidebar-hierarchy.md:25` and `docs/design/pane-sidebar-hierarchy.md:235`.

## 1. Arrive and choose a repository

On a fresh visit without an explicit destination, the main area says “Open a repository.” It shows registered repositories with their chosen checkout and architecture availability. The primary action is choosing a repository. The repository name itself is the action. A repeated Open button adds no value.

An explicit URL opens exactly its requested reading. A valid saved session restores its prior reading. Without either, the application does not choose an unrelated repository merely because it is first in a registry. Returning readers can choose “Continue” with the repository and module named together.

“Open repository…” accepts a local checkout through the existing repository workflow. An unregistered checkout shows its discovered model before the person opens it. An unavailable checkout keeps its name and offers the actual recovery action. The interface does not replace it silently with another checkout.

A repository without architecture gets a focused setup screen. Its primary action opens a request to the local agent to describe the repository. It does not initialize or author architecture through browser state. An unmigrated repository gets a migration screen with preview and recovery guidance. Neither screen shows comparison, filters, diagram grammar, or empty selection controls.

Removed: an arbitrary error as the application landing page, duplicate repository Open buttons, and state controls on screens that have no readable state.

## 2. See the first picture

Opening this repository shows “Archboard” and Current, with root responsibilities and their code locations. That human name requires an authored correction. The interface must not guess names by rewriting opaque identities.

The first picture is one structural reading of the root modules. It is not all 540 descendants. Each card shows its name, a short responsibility, its code path, and an affordance when it contains parts. Browser therefore reads as Browser with `apps/web`, and Workspace packages reads with `packages`.

If the model has no implemented state, the header says “Not implemented” and opens its planning proposals. It never presents a draft as Current.

The root contains 19 modules today. Do not silently discard ten of them to manufacture an attractive first screen. Aggregate relationships by their actual projected endpoints, direction, and kind. Label an aggregate with its kind and count. Selecting it exposes the constituent relationships with their individual meanings.

Keep external dependencies distinct from local source. A dependency without a local binding shows its actual external identity. It does not acquire an invented repository path. Do not add colored groups to compensate for unclear ownership.

The initial picture must keep module names and code paths readable. Target at least 14 CSS pixels for both at the initial fit. This is a proposed acceptance target. Fix placement and excessive route spans before reducing text size. If the full scope cannot fit legibly, preserve readable scale and expose the remaining extent through ordinary pan and Fit controls.

The left outline lists all roots in stable order. It uses responsibility names and secondary code paths. It supplies a readable route into the model even when a picture remains large. The inspector is closed. Walkthroughs remain one clear destination, not nineteen rows competing with the picture.

The primary action is opening a module that interests the architect. No selected module means no Focus button, no Clear selection button, and no “0 selected” counter.

Removed: adoption rationale as introductory system copy, the opaque title as the sole location cue, whole-model tours in the inspector, and automatic microtext at fit.

## 3. Go down, up, and sideways

Single-clicking a picture card selects it. “Open parts” enters it. Double-clicking the card performs the same action when it has children. The left outline opens modules directly, because its purpose is navigation. These actions must be keyboard reachable.

The concrete route is Overview → Browser → Architecture drawing → Canonical model reader. Each step shows the current module's immediate children and its relevant outside connections. The current module becomes the boundary and title of that reading. Its path stays visible above the picture.

Browser's outline shows Page start, Application composition, Shell, Architecture drawing, Panes and workspace, Agent and voice, Walkthrough recordings, and Vault diagnostic queries. Each bound row includes its source path. Architecture drawing then shows its four authored children. These examples come from the current module inputs.

Up means the actual containment parent. Back means the place previously visited. They are distinct actions. Up from Architecture drawing returns to Browser and highlights Architecture drawing in the restored picture. Back can instead return to a flow or another repository that led here.

For sideways navigation, the current breadcrumb opens its siblings under the same parent. The parent breadcrumb opens that parent. Choosing Shell from Architecture drawing's sibling menu keeps Browser visible in the path. The camera does not fly through an invented connecting corridor.

At arbitrary depth, keep the root, immediate parent, and current name visible. Middle ancestors collapse into one expandable path segment. Every ancestor remains reachable. This limits visual indentation without imposing architectural levels.

A leaf remains a meaningful destination. It shows its own responsibility, source path, and direct connections. Its primary action becomes Open code or Ask. It does not show an empty container and “This scope has no child modules.”

Search covers names, former names, and bound paths. Searching `apps/web` reveals the actual matching modules with their containing paths. It never merges modules because their bindings match. Opening a result reveals its real context and marks the matched subject.

Removed: navigation below tours, generic depth numbers, and empty leaf interiors. A sibling must be reachable without returning to the root.

The current breadcrumb already distinguishes containment from navigation history, but sits inside sidebar controls. Move that contract into the picture header. See `apps/web/src/ui/components/architecture-model/ModelBreadcrumbs.tsx:6` and `apps/web/src/ui/components/architecture-model/ModelReading.tsx:162`.

## 4. Relate architecture to code

The owner decision removes the eight layer containers from the authored model. Their 17 package children move directly under Workspace packages. Their existing identities, bindings, relationships, and relevant history remain intact. The agent updates current flows and walkthroughs that reference the deleted containers. Exact historical readings retain their originals. The source import rule stays enforced in code. It adds no replacement groups or colored bands to the default drawing.

Today, Layer 4 contains only `board`. Its description defines a layer as the longest import chain. Layer 6 contains server-lifecycle, code-opener, walkthrough, and codex-realtime-voice. That rank does not explain a reader's next destination. Evidence: `.archboard/vault/modules/vKEsyHFk/vKEsyHFk/GE8BkWsJ.module.json:3` and `.archboard/vault/modules/vKEsyHFk/vKEsyHFk/TQNCxSiT.module.json:3`.

After the change, the route reads Workspace packages (`packages`) → board (`packages/board`) → a responsibility inside board. There is no Layer 4 stop. The outline order follows the authored repository organization and remains deterministic. Dependency depth never becomes navigation depth.

Every directly bound card carries its relative source path as a second, readable line. The path is a code link with an accessible name. Activating it opens source, not the module's children. A card with a source selector also identifies the relevant symbol when a path alone is ambiguous.

The main module name explains the job. The code path locates its implementation. A meaningful responsibility can span role folders, and two responsibilities can share a file. Therefore, “read like the repository” means traceable source and familiar ownership, not one architecture node for every filesystem directory.

The inspector places the code action directly below the responsibility. It states the repository and resolved source revision when they matter. Current local source and exact historical source remain distinguishable. A missing historical revision never falls back silently to today's file.

For the 87 modules without direct bindings, do not synthesize paths. An external subject can identify its actual remote source. A meaningful unbound container can list the bound parts inside it, explicitly as those parts' code. That list does not pretend that the container owns their binding.

Authoring guidance must require a separate responsibility for every container. A package folder is useful when it owns a boundary or behavior. A wrapper that only repeats a rank or forwards the reader to one child must go. A description that says only “imports lower layers” does not establish a job.

`archboard check` needs a concrete warning for suspect containers. Start with internal containers that lack a binding and carry no authored boundary connections or independent interface evidence. Report the container, its children, their paths, and the missing evidence. A nonempty description alone must not silence the warning.

This warning is a conservative structural signal. It cannot prove from prose that a container has no job. The agent must resolve it through source evidence, a meaningful binding, or removal of the redundant container. Invalid declared code bindings remain failures through the existing code inspection. The eight numbered layers are already an owner decision, so they need no further debate.

Preserve the package dependency rule in `tests/system/repository-policy/package-graph.test.ts`, which `docs/agents/boundaries.md:8` identifies as its authority. Make it reachable through the relevant source or supporting document. Do not replace the removed containers with another permanent visual taxonomy.

Removed: all eight layer stops, replacement groups, code paths hidden beneath document inventories, and bindings invented merely to satisfy a warning.

## 5. Ask what a part does

Selecting Browser opens a 360-pixel inspector. Its first screen contains Browser, its responsibility, `apps/web`, Open parts, and Open code. Ask is beside those actions. The full description follows. An architect can now understand, enter, or inspect source without scrolling through supporting documents.

Connections follow as named counterparts under Sends to and Receives from. Each row states what crosses the boundary. Selecting a row highlights both endpoints and the line. An aggregate lists its individual relationships here. Opening the counterpart changes context only after an explicit navigation action.

Documents, exact identities, source files for model definitions, former names, and local Git history sit behind supporting-detail disclosures. They do not precede the actions. The warning that affects trust remains visible beside the responsibility. The detailed evidence opens on request.

Ask opens the conversation with a visible capture of the selected module and current reading. The response stays attached to that capture if the architect navigates elsewhere. A response about Browser never silently becomes a response about Shell. “Show this reading” returns to the captured context.

A multi-selection shows its names and shared actions. The primary diagram action is “Focus on selection.” It changes the reading explicitly. Ordinary selection only emphasizes the chosen subjects. The interface never hides unrelated architecture merely because someone clicks a card.

Removed: the Architecture/Selection tab pair, selection counters with no selection, huge document blocks above source actions, and a second explanation surface inside the inspector.

The ordering defect is explicit in `apps/web/src/ui/components/architecture-model/ModuleDetails.tsx:27`: supporting evidence precedes the children that supply navigation actions. The old pinned action tray already solved the action-placement problem. See `docs/design/operator-canvas-shell.md:184`.

## 6. Follow a flow

The architect selects Flows in the left navigator. The picture remains visible while the navigator lists relevant flows with names, short purposes, and participant counts. The list starts with flows involving the open module or selection. “All flows” expands the search scope explicitly.

Choosing “A part's code is opened” opens that complete exchange. Sequence is the initial representation. The header names the flow and provides Sequence and Flowchart as two representations of it. It also provides “Back to Browser,” which restores the exact structural reading that launched the flow.

Sequence explains who communicates and in what order. Flowchart explains decisions, branches, and loops in that same authored flow. Switching representation preserves the flow, state, selected step, and participant identities. It does not ask for another flow.

Flow participants can sit anywhere in the model. Each participant shows its code path. “Locate in structure” opens its containing module with that participant selected. The structure retains a return action to the flow. Opening another pane remains an explicit comparison action, not an automatic consequence of locating a participant.

Structural filters cannot remove flow messages or participants. The flow view states its complete extent. A missing authored flow keeps the structural picture and offers an explicit request to the agent to describe the exchange. The product never invents execution order from dependencies.

Removed: Architecture/Sequence/Flowchart as an unconditional global selector, the blank intermediate canvas, and structural controls that appear applicable to behavioral steps.

The current control chooses grammar before flow in `apps/web/src/ui/components/architecture-model/ModelModeControls.tsx:32`. `apps/web/src/ui/components/architecture-model/ModelReadingCanvas.tsx:65` then replaces the picture when no flow is selected. The proposed order removes that reachable dead end without changing the domain contract in `CONTEXT.md:46`.

## 7. Plan a change

From a selected module, the architect chooses Ask and states the change. The conversation captures the current architecture and affected subjects. The agent investigates source and creates a proposal through the CLI. The browser does not become an architecture editor.

While the agent works, the existing activity surface names its purpose and affected module. A claim remains visible beside affected subjects and in activity. Take back control stays reachable there. The reader can continue exploring without a permanent ownership report occupying the inspector.

When the proposal becomes available, the conversation offers “Review proposal.” Choosing it opens a review workspace at the affected scope. The header states the proposal's name, its draft status, and its exact comparison base. A short explanation states the intended behavior change before any counts.

Current stays explicit. A source merge does not mark the proposal implemented. An adoption request goes through the agent's existing operation and records the decision. The browser only displays the resulting state.

Removed: always-visible planning controls during first exploration, a model-ownership disclaimer for an unavailable transfer feature, and any implied adoption through ordinary navigation.

## 8. Compare proposals

The review workspace initially shows the proposal against its retained predecessor. A labeled comparison strip names both sides. It offers Before, Changes, and After. Changes is the initial selection. The selected module remains the anchor when the picture changes.

A changed-subject list occupies the left region in this workspace. It groups entries by their actual containing module. Each entry states the changed responsibility or connection. Selecting it takes the picture to that subject and puts exact before/after evidence in the right inspector.

Competing proposals open through “Compare another proposal.” The interface identifies each by name, predecessor, affected modules, and short identity when names collide. Matching task names never imply shared identity. The current repeated proposal names make that distinction a real need.

Side-by-side comparison is explicit. Both panes use the same requested scope and representation. Navigation follows the same subject identities on both sides by default. Each pane fits its own geometry. Raw camera coordinates are not a meaningful synchronization contract between different layouts.

If a subject is absent on one side, that pane states its absence. It does not open a similarly named replacement. “Explore independently” releases linked navigation visibly. Selecting another comparison ends with the new pair named above both pictures.

The initial review opens the changed scope, with whole-model change counts available as secondary context. It does not begin with a repository-wide change cloud. A historical proposal with thousands of differences needs a truthful base explanation before its counts are useful.

Removed: “Compare · Default,” independently ambiguous state and base selectors, and a short dropdown that mixes every retained checkpoint with active proposals.

`apps/web/src/ui/components/architecture-model/ModelComparisonSelector.tsx:47` exposes the present default label. `apps/web/src/ui/components/architecture-model/ModelReadingSelector.tsx:60` places logical states and retained checkpoints into one selector. Both live.

## 9. Read history

The state menu offers Current, Proposals, and History. History opens a wide record list in the main workspace. It starts with decisions and retained architectural states. Selecting a record shows its reason, affected modules, source evidence, and available exact checkpoints.

The primary action is “Open this architecture.” A secondary comparison action opens the record against a chosen state. The resulting reading keeps its historical label and a clear “Return to current” action. The module path remains the same when that identity exists in both states.

Exact checkpoints remain reachable inside a state record. Their timestamps and full identities belong in the record details. An unchanged checkpoint does not deserve a first-level row beside a proposal that changes the system.

Unavailable architecture shows the requested destination and archive recovery. Unavailable source leaves readable architecture on screen and identifies the missing source evidence. Publication controls appear when the person asks to share that retained reading. They do not appear during ordinary system exploration.

Former addresses resolve through the existing exact mappings. They are searchable aliases and supporting history. A direct old link can identify its retained original destination. No permanent Former addresses menu remains in the reader header.

Removed: raw checkpoint inventories in the initial state picker, source hashes as introductory copy, and migration provenance as an everyday navigation category.

## 10. Follow and leave a walkthrough

Walkthroughs has its own navigator destination. It lists current narratives first, with the question each answers and its step count. Retained original tours remain available through a clearly labeled historical section. They do not occupy nineteen rows beside every module.

The primary action is Play. Narrate is optional. The player keeps the useful current caption plate, step rail, previous/next controls, and exit action. The global inspector steps aside. General filters, comparison menus, and unrelated reader controls also step aside.

Each beat displays its own module path and architectural state. The explanation describes the system or change, not the storage machinery unless that machinery is the subject. A presentation about Browser must not leave the header suggesting that an unrelated structural or historical reading is active.

“Explore this step” pauses the tour and opens its complete reading. A small Resume action retains the exact beat. Leaving the tour restores the reading, selection, sidebar state, and camera that existed before Play. The architect does not need to reconstruct their place.

Live changes never rewrite a tour already in progress. A missing beat states what is missing and offers recovery. Starting another capture is explicit. These rules extend the existing captured-player contract in `apps/web/src/ui/components/architecture-model/ModelWalkthroughReader.tsx:55`.

Removed: the model-wide tour list from the inspector, unrelated controls during playback, and tours that strand the reader at the final picture.

## Where each lever goes

A reading remains a selection of architecture to draw. Its complete meaning stays in the address and captured agent context. The redesign changes how the person reaches those selectors.

| Existing lever | Decision | When and where it appears |
| --- | --- | --- |
| Scope | Keep, as navigation | The module path, outline, and Open parts actions determine scope. No separate Scope control appears. |
| Focus | Keep, after selection | “Focus on selection” appears for structural subjects. An active focus names those subjects and provides “Show whole scope.” |
| Filters | Keep, behind the picture menu | Relationship kinds and group-region visibility appear under “Show.” Active restrictions get a visible summary and one reset action. No “Filters (0)” remains. |
| Grammar | Merge into the flow experience | Structure is the default. Sequence and Flowchart appear only after choosing an authored flow. |
| Flow | Promote to a named destination | Relevant flows appear in the navigator or a selected participant's flow links. The chosen flow stays named above its picture. |
| State | Keep, with simpler entry | Current, a named proposal, or a named historical record always appears in the header. Its menu opens Proposals or History. |
| Compare | Move into review | It appears for a proposal, a historical record, or an explicit compare action. Both sides have visible names and revisions. |
| Bookmarks | Keep, rename the entry to Saved readings | They appear in repository navigation on request. Imported readings retain their exact definitions. “Save this reading” captures presentation only and writes no architecture. |
| Former addresses | Remove from the main surface | Search accepts them. Exact old links resolve through retained mappings. Details remain in history and migration support. |

Saved readings are named routes, not miniature boards. Private saved readings can store a browser-local address. Shared authored entries remain agent-owned. Saving an exact shared reference requires retention through the agent. A bookmark that names unavailable history stays visibly unavailable.

Focus and filters remain distinct because they answer different questions. Focus selects subjects and necessary containment. Filters alter visible relationship kinds or group regions. Neither action changes source-owned architecture. No new groups are introduced for the deleted layers.

When entering another module, clear subject focus and retain visible filter restrictions. Back restores the prior focus, restrictions, and camera. Entering a flow suspends structural restrictions and restores them on return. An empty filtered picture offers “Show whole scope,” not a suggestion that the model contains no modules.

## What the old canvas did

The old implementation treated movement as part of reading. It did not merely fade a replaced SVG.

| Old behavior at `origin/main` | Source evidence | Decision for the canonical reader |
| --- | --- | --- |
| Shared cards moved from old geometry to new geometry. Removed subjects left before new subjects entered. Lines moved with their subjects. | `apps/web/src/ui/clients/semantic-board-canvas/picture/picture-transition.ts:1` | Restore identity-based continuity for state, comparison, and live model changes. |
| The camera compensated for the collective movement of shared cards. | `apps/web/src/ui/clients/semantic-board-canvas/picture/picture-transition.ts:76` | Keep the selected subject stable first. Use shared subjects when there is no selection. |
| First pictures and unrelated readings arrived as frames, cards, lines, then labels. | `apps/web/src/ui/clients/semantic-board-canvas/picture/picture-entrance.ts:1` | Preserve the hierarchy of arrival without delaying access to the picture. |
| A prepared child picture sat inside its parent card. The camera flew into it, and the reverse flight went back out. | `apps/web/src/ui/hooks/semantic-board-canvas/use-dive.ts:1` | Restore down/up continuity for module containment. Never require prefetch completion before navigation works. |
| Departure responded immediately, with different treatment for into, out, and across. Slow loading eventually left the pane empty. | `apps/web/src/ui/clients/semantic-board-canvas/picture/picture-departure.ts:1` | Preserve immediate response and directional meaning. Replace the empty slow-load outcome with the previous reading and a truthful progress label. |
| Relationship emphasis swept from source to target. | `apps/web/src/ui/clients/semantic-board-canvas/picture/picture-sweep.ts:1` | Restore directional tracing when a person inspects a connection. It must not carry meaning unavailable in the static picture. |
| The first fit followed pane size until manual pan or zoom. Presentation exit restored the prior camera. | `apps/web/src/ui/hooks/semantic-board-canvas/use-auto-fit.ts:1` | Keep camera ownership and restore the exact previous reading on exit. |

The old timing constants were 640 ms for picture changes, 760 ms for entrances, 280 ms for departures, and 720 ms for dives. They are evidence of deliberate choreography, not new performance requirements. Sources: `origin/main:packages/timing/src/shared/constants/diagram-motion.ts:23` and `origin/main:packages/timing/src/shared/constants/exploring.ts:133`.

The old implementation did not morph every arbitrary view switch. `continuousPictures` required the same board and view. Presentation supplied an exception across views of one board. Preserve that distinction. A structure-to-sequence switch needs a clear change of representation, not false geometric continuity.

Today, `apps/web/src/ui/components/architecture-model/ModelReadingCanvas.tsx:52` keys the structural diagram by scope. Line 77 keys behavioral readings by grammar and flow. `apps/web/src/ui/components/architecture-model/ModelDiagram.tsx:237` directly stages each new SVG. Camera gestures and some presentation behavior remain, but ordinary picture replacement bypasses the old transition owner. This source evidence is narrower and more accurate than claiming that every animation disappeared.

## The transitions the journey needs

| Transition | Stable reference | Required visible result |
| --- | --- | --- |
| Open repository | Repository name and selected checkout | The name appears immediately. Loading stays inside the picture region. Other repositories do not flash as substitutes. |
| Enter a module | Selected parent card | The child reading grows from that card when available. The path gains one segment. |
| Go up | Parent and returning child | The parent picture returns to its saved camera, with the returning child selected. |
| Go sideways | Common parent in the path | The destination changes without a false descent. A short handover preserves the common context. |
| Search jump | Matched subject identity | Its containment path appears, and the picture reveals the match. Back returns to the departure reading. |
| Apply focus or filters | Selected subjects and surviving cards | Survivors retain identity through movement. Active restrictions remain visible. Reset restores the prior unrestricted reading. |
| Open a flow | Launching structural reading | The flow receives its own title. A return action names the structural destination. |
| Switch Sequence/Flowchart | Flow and selected step | The representation changes while the same step stays selected or explicitly absent. |
| Switch comparison side | Selected subject and named pair | Shared subjects move coherently. Missing subjects remain explicit. The base never changes silently. |
| Receive a live edit | Current camera and subject identities | Changed content updates without rebuilding the header or dismissing an open menu. |
| Open or close the inspector | Selected card and current camera | The panel slides. A handled camera stays under reader control. The application does not refit the entire picture on every selection. |
| Enter or leave a tour | Saved reading and beat identity | Playback captures context once. Exit restores it. Explore and Resume preserve the beat. |

The pane shell must survive all these transitions. A picture request cannot unmount the header, path, inspector, or active popup. Reading addresses belong to navigation. Camera, selection, panel state, and return points belong to the tab's presentation history.

A slow request keeps the old picture labeled as the previous reading while the new destination loads. It must not mislabel old content as the new scope. A failed request gives Retry and Back without losing the departure context. A later response cannot replace a newer requested destination.

Reduced motion preserves every location and identity cue but removes flights and sweeps. Keyboard focus follows the action's meaningful destination. Repeated navigation can interrupt motion. No animation is a mandatory waiting period.

## Cuts and acceptance

Cut these from the default reader:

1. The permanent Architecture/Selection sidebar tabs and all reading controls inside them.
2. The model-wide module, connection, group, and walkthrough inventories in the inspector.
3. “0 selected,” disabled Focus, disabled Clear selection, and “Filters (0).”
4. The global grammar selector before a flow exists.
5. Compare · Default, Bookmarks, Former addresses, and routine Refresh in the top row.
6. Adoption rationale, document hashes, model ownership warnings, and publication details before a reader asks for them.
7. Layer 0 through Layer 7, with no replacement groups.
8. Any automatic fit that turns the first view into unreadable text.

Routine Refresh moves into the overflow menu. Recovery screens retain a visible Retry action. Existing groups remain available only where the authored reading needs them. The cuts remove default exposure, not exact history or source evidence.

The layout repair remains necessary. Removing the inspector gives the picture more room, but cannot repair the large empty bands visible in the root and Browser captures. Keep module meaning and card paths intact while the renderer fixes placement and routing.

The Blocks report measured improvements on a prior corpus. It does not prove that this canonical root reading is acceptable. Its comparison bases differ from this task's old-product baseline. See `docs/design/blocks-planned-layout.md:140` and `docs/design/blocks-planned-layout.md:222`.

Accept the redesign only when an architect unfamiliar with the model can complete these observable tasks:

1. Open Archboard, identify Current, and locate Browser through its `apps/web` path.
2. Enter Architecture drawing, visit a sibling, and return without reconstructing the route.
3. Open a package directly under Workspace packages without passing a numbered layer.
4. Read a module's purpose and open its source without scrolling past supporting records.
5. Choose a flow before a representation, then locate a participant in structure and return.
6. Compare two named proposals against an explicit base and explain one changed relationship.
7. Open exact history, distinguish missing source from missing architecture, and return to Current.
8. Leave a walkthrough and recover the earlier reading and camera.

Use the drawing council's compactness, directness, traceability, and pane-fit criteria on the actual canonical readings. Do not repair a failing picture by hiding required subjects. See `docs/design/grading-council/criteria.md:17` and `docs/design/grading-council/criteria.md:74`.

