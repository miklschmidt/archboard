# Keep the place, preserve the explanation

Astra, council round 2. Adversarial critique of all three Opus papers and revision of all three Astra papers.

Accept the repository navigator, a persistent drawing surface, and inspection that appears after selection. Reject the hard 18-line cap and universal boundary doors. Neither proposal preserves enough visible meaning for planning and presentation. Use one open module as the structural default, with explicit routes into complete connections, flows, and comparison.

The owner decisions stand. Delete the numbered Layer containers without replacement groups. Show authored code paths on cards. Navigation must relate to repository structure. Guidance and `archboard check` must expose containers without code or an independent job.

## Evidence and limits

I read `BRIEF.md` first and all six round 1 papers. I read the requested product, domain, design, grading, and TASK-559 material. I inspected the source and the Opus experiment scripts. I performed this paper's measurements myself.

The checkout started this review at `38adcf61dba7e93a8ab5e6e159d205b390602527` and reached `4b970e501d620390cf3de4ba22bbc68869e1d9a9` during the final read. The web reader, board projection, TypeScript renderer, and scene crate remain unchanged from the Opus papers' `792359187` baseline. The baseline for the earlier product remains `396bfd9add2f`.

Parallel work deleted the layers in `533520c24` and merged solver changes in `4b970e501`. I inspected those diffs before finishing. The solver now compares fewer guarded candidates on denser readings. Its area ordering and global compaction remain. I did not rerender the historical corpus with that solver. The screenshots and saved geometry describe their capture, not a performance claim about the final merge.

The measurement input is the saved coherent model in `drawing-opus/model.json`. It has 540 modules, 1,117 relationships, and revision `ec8bf874bf8c8e4fca5e675a011c1dc9fe71e0c8a682d5d90470e3df54ce6ba9`. I imported the current `projectModel` function instead of copying its logic. My layer-deletion experiment changes only an in-memory copy. It reparents 17 packages and removes eight containers. No relationship directly touches a removed layer, so this experiment deletes no relationships.

The reproducible audit is `/tmp/integrate/reader-council/round2/audit-astra.ts`. Its results are `/tmp/integrate/reader-council/round2/audit-astra.json`. Run it with `bun run` from this checkout. The root's cap-only measurements are separate from Opus's additional root-pruning rule. The scoped cap measurements reproduce the directed-pair rule, including boundary aggregation.

I inspected the running product at 1920×1080. The shared preview timed out twice, so I used the brief's headless browser wrapper. I inspected these new screenshots and closed both inspection browsers afterward:

| Screenshot | Observation |
| --- | --- |
| `/tmp/integrate/reader-council/evidence/round2-astra-root.png` | The first drawing is unreadable at fit. State prose and tours lead the inspector. The interface reports 222 code warnings. |
| `/tmp/integrate/reader-council/evidence/round2-astra-two-panes.png` | Opening a second pane selected an unrelated unmigrated repository. Each pane measures 799 pixels wide. |

I also opened and inspected Opus's `drawing-opus-browser-blocks-ctxframe.png`, `drawing-opus-root-blocks-rootrail.png`, and `drawing-opus-workbench-blocks-budget.png`. These files are under the same evidence directory. They are counterfactual pictures, not working implementations of the proposed interaction.

“Source-checked” below means that I opened the implementation. “Measured” means that I recomputed the stated quantity. “Unchecked” identifies a claim that this round did not establish. No timings from round 1 become new measurements here. I changed no repository files, Backlog records, or architecture inputs.

## 1. Doors on the boundary

Verdict: amend boundary summaries, reject doors as the universal replacement for connections.

Opus correctly identifies excessive outside context. In Browser, I count 23 projected boundary lines representing 64 authored relationships. They involve five immediate children and the Browser module itself. Four directed connections between Browser and two outside modules can summarize those exchanges. They cannot explain which child owns each exchange.

This distinction is already present in the source. `projectScope` selects descendant relationships and projects their endpoints through visible ancestors. It also returns complete interface facts separately. See `packages/board/src/shared/rules/model-projection.ts:56`, `:64`, `:87`, and `:400`.

The strongest counterexample is a reader planning to move code that calls the server. A Browser-to-server door establishes that Browser communicates outside. It does not identify the child that needs the change. Hovering the door supplies an answer only while the pointer remains there. It supplies nothing to a printed SVG or video frame.

The inspected Browser counterfactual confirms the tradeoff. It removes much external routing, but it terminates external lines on the parent. It does not draw compact doors along the frame edge. It also retains a large interior vacancy. The experiment establishes savings from endpoint aggregation, not the quality of the proposed door design.

Callers-above and called-modules-below also fails as a complete rule. Browser and Archboard server communicate in both directions. Browser and Workspace packages do too. A module cannot occupy both sides without duplicate representations or an explicit bidirectional convention. The saved root contains 29 directed pairs but 24 unordered pairs. Direction is real content here.

My position: an orientation reading can summarize outside connections at the boundary. Selecting that summary must produce a persistent connection reading with exact internal endpoints. A selected child must expose its own complete boundary connections. The inspector must distinguish the drawn boundary from the authored endpoints.

Use a named summary convention in the still picture. Do not require hover to discover that the endpoints are aggregated. Preserve exact endpoints in detailed readings and exports. `docs/design/grading-council/criteria.md:7` explicitly excludes hover as a repair for a still picture. Its endpoint and trunk defects remain relevant at `:89` and `:94`.

Unchecked: an actual door's minimum width, crowding along a short frame, keyboard behavior, and transition into another module. No inspected prototype implements these together. The owner must see that prototype before this becomes the default representation.

## 2. One open module at a time

Verdict: accept as the default for structure, reject as a universal rule for every reading.

The current projection already opens one scope and its immediate children. The small number of open levels does not prevent a dense drawing. Browser still receives 44 lines. After layer deletion, Workspace packages receives 17 children, 14 context modules, and 135 lines under today's aggregation. See `model-projection.ts:65` and the audit's `afterLayerDeletion` results.

One open module therefore simplifies orientation, but does not solve the content problem alone. Focus across branches, proposal moves, and complete flows need different extents. `projectFocused` retains necessary ancestor paths at `packages/board/src/shared/rules/model-projection.ts:249`. `projectFlow` preserves all participants at `packages/board/src/shared/rules/model-flow-projection.ts:10`.

Keep one open structural scope per pane. Keep the parent path outside the inspector. Permit a deliberate focused reading across branches. Keep flows complete. A leaf needs its responsibility, source, and neighbors, without an empty surrounding frame.

I accept Opus's implementation finding that leaves already produce useful readings. My earlier warning about an empty leaf interior described a redesign risk, not an observed current defect. I withdraw it as criticism of the current projection.

## 3. The hard limit of 18 lines

Verdict: reject the automatic cap. Retain 18 as an investigation threshold, not a content rule.

The evidence does not establish a threshold at which readability changes categorically. Opus's saved budget corpus has three failures below or at the limit. Commands has 10 lines and fit 0.473. Camera and pointer has 18 and fit 0.541. Workbench has 18 and fit 0.569.

Conversely, six baseline readings exceed 18 lines and reach fit 0.6. HTTP serving has 19 lines and fit 0.754. Canonical archive objects has 24 and fit 0.601. These values come from the saved metrics, independently counted in the audit.

Relationship count is also a poor importance ranking. One access constraint or activation rule can matter more than dozens of ordinary calls. The cap drops a Browser relationship labeled “say which checkout the person activated.” That relationship directly concerns the product's conversation-ownership rule.

The workbench counterexample is stronger. The saved 18-line drawing leaves eight previously connected children with no visible connection. They include Shown conversation, Vault requirement, Canonical context capture, and Canonical explanation actions. I reproduced this from the original projection and inspected the picture. Those names describe exactly the contracts a person needs when planning agent behavior.

The settled layer deletion makes the policy worse:

| Workspace packages in the scratch model | Count |
| --- | ---: |
| Direct children | 17 |
| Directed pairs after boundary aggregation | 68 |
| Pairs that the cap removes | 50 |
| Authored relationships behind those removed pairs | 63 |
| Previously connected packages left isolated | 6 |

The isolated packages are timing, diagnostics, server-requests, server-lifecycle, code-opener, and skills. This is a measured consequence of the proposed rule, not a prediction about an unknown model.

The proposed `+3` mark does not resolve the problem. The reader still cannot identify the three destinations or their direction. The mark also needs a defined counting unit. Does it count drawn pairs, authored relationships, hidden kinds, or connections summarized at a door? Neither paper settles this.

The experiment does not draw those marks or the newly required code paths. It also omits the proposed second arrowhead in reciprocal root connections. See `/tmp/integrate/reader-council/drawing-opus/run.ts:170` and `:197`. Its area savings are useful diagnostic evidence, but they do not establish a shippable composition.

Choose a readable structural index when a complete connection map cannot fit. Label that reading as an index. Provide a persistent route into a selected module's complete connections and explicit complete maps. Do not make modules look independent through silent ranking. Do not create new containers merely to satisfy a drawing budget.

## 4. One line per connected pair

Verdict: accept aggregation per directed pair, amend its meaning and selection rules. Reject majority-kind styling and reciprocal merging as the first implementation.

I was too conservative in round 1. The root's 47 lines reduce to 29 directed pairs without losing endpoint connectivity. Splitting every pair by kind creates parallel routes before the reader asks for that detail. The existing `joins` list provides exact membership, so more drawn lines are not necessary for basic inspection.

Eight root pairs contain several kinds. Archboard server to Workspace packages represents 70 relationships across event, dependency, data, and call. Browser to Workspace packages contains five kinds. Calling either line by its majority kind gives the reader false specificity.

The old shared rule does choose the majority kind at `packages/board/src/shared/rules/scope.ts:197`. That explains Opus's proposal but does not make it suitable for the new Key. A new aggregate needs an explicit mixed appearance and exact member inspection. It must preserve direction and distinguish added, removed, and unchanged membership.

Filtering must act on members before aggregation. Today's `filteredContent` filters the final line's kind at `packages/board/src/shared/rules/model-projection.ts:230`. If that code receives mixed aggregates, hiding one majority kind can hide relationships of other kinds too. This interaction is absent from both designs.

Keep two directed aggregates for reciprocal connections initially. A double-headed line is possible later, but it needs separate directional membership, labels, and comparison standing. A request in one direction and an event in the other are not interchangeable. The prototype drops the reverse root edge rather than painting both arrowheads.

Reject a bare line for every multi-relationship aggregate. One concise meaning or an explicit mixed-connection marker must survive in the still image. Do not invent semantic captions from frequency. Exact authored words remain available in inspection and detailed output. An arbitrary count alone remains inadequate, as ADR 0052 already records.

## 5. The left module tree and code paths

Verdict: accept the tree, amend ordering and depth behavior, reject inferred bindings as source authority.

Opus wins the central navigation dispute. A tree with a visible active path gives better side-to-side context than my constantly replaced child outline. Keep one repository switcher and one search entry. Open only the active ancestry by default. Preserve user-opened branches. Do not expand all 540 modules.

The existing tree study provides usable geometry and keyboard behavior. Its rows use 16-pixel indentation and one keyboard entry point. See `docs/design/navigator-structure.md`, “One grid” and “What the redesign left alone.” Deep paths still need readable names. Use a locally rooted branch when ancestry consumes the column, with the full path retained in the header.

The tree follows the active pane's repository and architectural state. Another pane keeps its own path in its header. Pane letters can mark matching subjects when both panes read the same model. Do not make one global tree pretend to represent two different historical hierarchies. Current pane identity is already explicit at `apps/web/src/ui/components/shell/Navigator.tsx:49`.

I accept path-based ordering among siblings with authored bindings. Use authored order and stable identity to resolve equal or unavailable paths. Never reparent by filesystem path. Changing sort order needs an explicit amendment to `CONTEXT.md:39`, which currently gives sibling order to authors.

Reject `moduleCodeRoot` as an automatic source action. A common descendant directory does not establish that the parent owns that directory. Workhorses spans runtime rules, services, and server services. Its common directory is much broader than its stated responsibility. A trailing slash cannot distinguish inferred evidence from a real directory binding, because real bindings also name directories.

Show the authored path when one exists. Let an agent add a real missing binding after inspecting source. For a valid unbound responsibility, show its parts' locations as supporting evidence. Do not silently make `Open code` target a derived folder. The current source action deliberately requires an authored binding at `apps/web/src/ui/hooks/architecture-model/use-model-navigation.ts:22`.

Code paths require renderer work. Removing the binding omission at `model-projection.ts:381` is insufficient. `crates/archboard-scene/src/measure/cards.rs:41` currently measures only name, responsibility, and drill status. Both near and far painting need a measured path line. The path must remain readable and selectable without becoming architectural identity.

I retract the sentence in my drawing paper that put source bindings only in inspection. It directly conflicts with the settled owner decision.

## 6. An inspector that is absent until selection

Verdict: accept, with a precise limit on what selection opens.

The live root screenshot shows why a permanent inspector fails. It spends the first screen on controls, adoption prose, and tours. A selected module needs its purpose, source, useful connections, and actions before that material.

Use an overlay for ordinary inspection. Preserve the camera scale when it opens. Move only enough to reveal an obscured selected subject. The existing `useClearOfPanel` supplies that mechanism, but it assumes one selected identity and a fixed width. See `apps/web/src/ui/hooks/semantic-board-canvas/use-clear-of-panel.ts:25` and `:40`. It needs adaptation for a 360-pixel panel and selected lines or multiple modules.

Do not fit the entire graph on each selection. Do not force selection merely to reach scope information. The open module's short responsibility and code path stay outside the panel. Longer scope information remains available through an explicit details action.

A selected relationship opens relationship details. A multi-selection opens shared actions. Closing inspection preserves the selected identities and returns keyboard focus. Escape behavior must distinguish an open menu, the inspector, and the active flow or tour.

At 799 pixels per split pane, a 360-pixel overlay leaves 439 pixels. A 480-pixel History panel leaves 319. Together they exceed the pane width. Permit one overlay at a time. History selection closes the picker before inspection opens. Preserve the selection while the picker temporarily takes its place.

I choose the overlay over my earlier wording that allocated permanent inspector width. That wording left camera behavior ambiguous.

## 7. Read, History, Key, and About

### Read

Verdict: amend and adopt one entry point, withdraw my three permanent navigator destinations.

Flows and walkthroughs do not need to compete with Structure for the left column. One stable Read control can open a searchable chooser with explicit sections for Flows, Walkthroughs, and Saved readings. It must offer relevant entries first and an explicit route to all entries.

At the root, these categories contain 72 flows, 19 walkthroughs, and 245 imported bookmarks. A menu with 336 rows merely moves the existing overload. Use a bounded chooser, with search and category selection. Do not add another permanent inventory to the inspector.

Choose the flow before Sequence or Flowchart. `relevantFlows` supports descendant relevance at `apps/web/src/ui/rules/architecture-model/flow-reading.ts:11`. A scope without relevant flows still needs access to other flows and a clear empty result. Therefore, reject removing the Read control whenever local relevance becomes empty.

Preserve an explicit return to structure. Navigating to another module clears stale flow intent. `use-model-location.ts:202` currently clears grammar but retains `flow` and `subject`. A hidden old flow must not return when the user next changes representation.

Reject the promise that structure cards already lift into sequence heads through existing hooks. Shared identity does not establish equivalent geometry or an available transformation. That choreography is unchecked. Use a clear representation change first.

### History

Verdict: accept lazy discovery and the proposal's exact predecessor as its initial base. Amend the panel's scope and comparison rules.

The default currently prefers Current over a retained predecessor. This is explicit at `packages/board/src/runtime/operations/proposals/read.ts:373`. It explains why a migrated proposal can open with thousands of differences. It does not prove that the proposal contains identity corruption. That diagnosis remains unchecked.

Open a proposal against its retained baseline, and name both sides. Show divergence from Current separately. Keep Before, Changes, and After reachable. The browser currently offers no comparison-off choice, although the runtime accepts `compare: false`. See `ModelComparisonSelector.tsx:50` and `proposals/read.ts:399`.

A History panel can choose a state. It cannot also contain the whole review experience. Once chosen, the drawing, changed-subject navigation, and exact before/after inspector do that work. This replaces my separate full review workspace with fewer page transitions.

Do not hide comparison when the selected state is Current. Comparing Current with last week's checkpoint is a normal return journey. Do not group states by task-name equality. Their stable identities and predecessors establish history. A draft is future work, so the chooser must distinguish Proposals from History even if both share one panel.

The query must load small history rows when requested. The existing checkpoint query refetches on mount and focus despite infinite freshness. See `apps/web/src/ui/clients/architecture-model/queries.ts:183`. Moving the menu alone does not repair that cost.

### Key

Verdict: accept one legend and visibility entry point, amend the row behavior.

A Key must distinguish explanation from action. A sample mark explains its meaning. A labeled visibility control changes the reading. Do not make an ordinary legend-row click silently hide architecture.

Show hidden kinds as well as visible kinds while restrictions are active. A Key listing only what the picture draws loses the control needed to restore a hidden kind. Keep a visible restriction summary and Reset outside the closed Key. Count hidden relationships separately from hidden group regions.

Existing `hideGroups` removes group appearance, not modules. See `model-projection.ts:233`. Preserve that distinction. The layer decision creates no replacement groups. Existing group regions can remain optional, without coloring single cards as a substitute taxonomy.

The Key must describe mixed aggregates and boundary summaries honestly. That contract must land with the drawing change, not after it.

### About and Ask

Verdict: accept wide supporting detail, reject a second conversation surface.

About can hold long source evidence and interface lists. It must identify whether it describes the open scope or the selected subject. Moving a selected module's documents to the open parent's About page loses context. Open details for the selected identity and retain a return action.

Ask belongs in the existing conversation. It captures the accepted reading and subject identities. The answer stays with that capture while the reader navigates. Opus's proposal to put the answer in the inspector creates another conversation destination without a demonstrated need.

## 8. Other major journey and drawing claims

| Opus claim | Verdict and evidence |
| --- | --- |
| Start from an explicit address, last reading, or a meaningful repository choice | Accept. Reject selecting an unrelated repository. The new two-pane screenshot reproduces that failure outside initial startup. |
| Start rows need module count, proposal count, latest checkpoint, and recent-change sorting | Amend. Name, purpose, availability, and Continue establish the first action. Counts and archive timestamps do not justify eager history reads. |
| Add an optional authored model summary | Accept. `CONTEXT.md:16` gives the manifest identity, name, and current designation but no system statement. Do not derive purpose from an adoption note. |
| The root remains the default | Accept as a stable structural index. Reject mandatory completeness at unreadable fit. An authored introduction remains optional, not a required new starting configuration. |
| Low-degree root leaves lose their connections | Reject. Eight such leaves currently have a connection. They include ffmpeg, Graphviz, the archive remote, and two bound local subjects. The audit names each one. |
| Root externals become compact context | Amend. External appearance can distinguish ownership. Keep their existence and relationship meaning accessible. Do not classify ownership from the presence of a binding alone. |
| Focus must reduce the drawing | Accept the goal. Preserve selected relationships' endpoints and necessary ancestry. `projectFocused` already provides these obligations at `model-projection.ts:260`. |
| Restore drill marks, tips, far view, tracing, and row-to-line emphasis | Accept the capabilities. `ModelDiagram.tsx:182`, `:238`, and `:301` expose the missing connections. Restoration does not prove the proposed choreography. |
| Fit needs a ceiling near 1 | Accept for initial whole-picture fit. Keep deliberate enlargement possible. `camera.ts:220` currently permits `MAX_SCALE` for whole fit. |
| Layers leave through one coherent proposal | Accept. Keep package identities. Update affected flows and walkthroughs. Retained originals remain exact. This paper performs no adoption. |
| Structural diagnostics prove that a container has no job | Reject that certainty. Counts and folder spread are signals. Workhorses has a stated job and no direct relationships. A folder binding alone also does not prove a job. |
| Refuse writes that create an unbound multi-folder container without direct relationships | Reject. The owner requested guidance and detection, not a new semantic prohibition. Use actionable warnings and source inspection before stronger refusal. |
| Context is the largest content cost | Accept the source mechanism and direction of the experiments. My recount finds context exceeding children in 85 of 130 scopes, not the journey paper's 50. |
| Content changes beat layout-only compaction | Amend. The saved numbers support this for those counterfactuals. Some savings come from omitted meaning, so the comparison is not equal-content product evidence. |
| Keep Blocks and improve local compaction | Accept as the first layout direction. Whole-axis protection is explicit in `compact.rs:161`. Keep all geometry guards. |
| The compaction prototype proves a safe 26-percent further saving | Amend to a promising estimate. Its parser approximates headers and omits group captions. Full production guard results remain unchecked. See `compact_proto.py:28` and `:69`. |
| Rank candidates by fit rather than area | Amend. Add fitted text and aspect to guarded candidate ranking. Keep crossing, detour, and fan-spread constraints in `planned/reading.rs:65` and `:79`. |
| Keep label room instead of removing every label reservation | Accept. I withdraw my earlier demand to replace label ranks first. Label-free experiments establish sensitivity, not a safe universal replacement. |
| Suppress frames with one group member and transfer their color to the card | Reject the automatic color transfer. It can imply a new classification. With group regions optional, this is not a first-slice requirement. |
| Every drawing at fit 0.6 is far-readable | Reject as a general gate. Far names range from 15 to 20 units. At 0.6, the smallest are 9 pixels. Paths and essential labels need their own measurements. |
| Relative layout wins need an absolute quality floor | Accept. Use the actual shell and exports. The current grading rectangle is the full screen at `criteria.md:76`. |

The saved budget corpus reaches fit 0.6 in 128 of 131 readings. It reaches 12/14 in only 70. A conservative 12/15 threshold passes 90. These counts do not measure actual new path text. They show why a best-case enlarged name cannot certify the whole picture.

## 9. Implementation claims, tested against their owners

The implementation paper supplies the strongest source diagnosis. Its opening claim that each category has one small cause is too narrow. Persistent components, coherent scene acceptance, observation cost, and resource contracts interact.

In this table, web paths start at `apps/web/src/ui/`. Board paths start at `packages/board/src/`. Renderer paths start at `packages/renderer/src/`.

| Claim | Verdict | Source evidence and amendment |
| --- | --- | --- |
| F1: the live reader bypasses transitions | Accept, source-checked | `components/architecture-model/ModelDiagram.tsx:238` calls `stagePicture`. The latter replaces children at `clients/semantic-board-canvas/picture/picture-transition.ts:144`. |
| F2: scope keys destroy the camera | Accept, source-checked | `ModelReadingCanvas.tsx:52` and `:77` key the diagram. `ModelDiagram.tsx:74` owns its camera below them. Both grammar branches also need one stable owner. |
| F3: proposals need working failure recovery | Accept the recovery defect, amend fallback | `ModelDiagram.tsx:84` supplies an error without Retry. The comparison-off capability is absent from the selector. Offer an explicit After action. Never silently replace a requested comparison with an unmarked plain state. |
| F4: state changes destroy the pane | Accept, source-checked | `ArchitectureModelStage.tsx:395` changes the frame key. `ModelWalkthroughReader.tsx:40` also changes the component branch. Removing only the key is insufficient. |
| F5: reads return too much | Accept, source-checked | `hooks/architecture-model/use-model-catalog.ts:101` reads whole models for manifests. `use-model-navigation.ts:17` does so for one subject. `runtime/operations/read/model-references.ts:231` gathers references across all modules. |
| F6: drawing keys serialize the complete request | Accept, amend the repair | Renderer `ui/state/browser-renderer.ts:132` serializes the request. Web `clients/architecture-model/drawing.ts:28` includes complete content. Hashing shrinks keys but does not narrow invalidation. Preserve complete interface dependencies when reducing inputs. |
| F7: ordinary refreshing produces a stale warning | Accept, source-checked | `ArchitectureModelStage.tsx:325` includes `feed.refreshing`. `clients/architecture-model/events.ts:145` sets it for healthy events. Distinguish updating from failed freshness. Keep real failure visible without shifting the picture. |
| F8: walkthrough drawing can blank between beats | Accept, source-checked | `ModelDiagram.tsx:72` omits previous drawing data during presentation, and `:78` replaces the scene. Preserve the captured beat while the next one prepares. |
| F9: the sidebar owns navigation controls | Accept | Source composition and the inspected root agree. Move path and reading controls into stable navigation before making inspection transient. |
| F10: prefetch all children to recover Dive | Amend | The current drawing call has no signal at `clients/architecture-model/drawing.ts:41`. Start bounded hover or next-beat work after cancellation and foreground priority work. Do not speculatively render all 24 Commands children. |
| F11: restore ADR 0042 behavior | Accept the behavioral obligation | Preserve orientation, continuity, and reduced motion. Exact 720/760-millisecond flights are not compulsory waits. The old continuity test uses board and view at `picture-transition.ts:124`. |
| F12: delete the replay-only reader stack | Reject wholesale deletion | `components/walkthrough-replay/ReplayStage.tsx:149` still uses it for exact retained talks. Share presentation primitives first. A low local talk count cannot invalidate supported historical files. |
| F13: separate URL intent from local selection | Accept | `use-model-location.ts:202` retains stale subject and flow fields. `ModelPane` needs a deliberate selection reset without destruction. Camera memory needs state, grammar, and reading context, not scope alone. |
| F14: replace four loading texts with one state | Accept, amend silence | Preserve one loading region. An initial cold load has no old picture, so provide delayed progress and recovery. During navigation, name the requested destination separately from the still-visible reading. |
| F15: avoid a full model read each second | Accept the defect, amend the mechanism | Board `runtime/operations/read/model-watch.ts:92` performs the work. Server `agent-activity.ts:148` also follows vaults. “Only watch the open vault” loses other-pane and activity needs. Share observation per vault and preserve durable-write and recovery barriers. |
| F16: cap whole fit | Accept | `rules/semantic-board-canvas/camera/camera.ts:221` permits excessive enlargement. Limit initial fit independently from manual zoom and presentation focus. |

Two changes are prerequisites for safe motion. First, retain one mounted surface. Second, retain one accepted scene: the drawing, its model revision, projection, reading, and selected identities. A requested destination is separate until its matching scene arrives.

Without the second rule, keeping old data makes the reader less trustworthy. `ModelDiagram.tsx:90` passes an older drawing with current props. Its lighting combines the new content with the old atlas at `:177`. An atlas records subject positions. Meanwhile, `use-model-explanation.ts:136` reports readiness by default, before the drawing finishes.

Opus's instruction to update every location cue at the click therefore needs amendment. Show the requested path as pending, but keep the visible picture's actual identity apparent. Inspection, Ask, export, and agent context must use the accepted scene. A late result cannot replace a newer destination.

I reject “same model plus one shared subject” as the complete motion rule. Two unrelated readings can share Workspace packages. `sharedShift` averages all shared node centers at `picture-transition.ts:90`. A parent frame and that parent's old card have different extents. Their shared identity alone does not establish a useful camera anchor. Prefer the entered or selected subject, then use a tested shared-subject transition. Change representation plainly when geometry has no meaningful correspondence.

Unchecked this round: the 242-millisecond cached navigation task, the isolated watcher CPU percentage, proposal solve durations, and browser storage totals. I did not repeat the SVG-parsing or traffic benchmarks. Their causal exclusions remain limited to Opus's samples. I also did not reproduce the router failure without comparison. Passing a query abort signal does not alone prove that active worker computation stops.

Also unchecked: the exact old sidebar scroll heights, council 563 score totals, prototype overlap totals, and the claimed 54-of-55 inferred-directory coverage. I do not use those quantities as acceptance evidence. The inspected code supports the named mechanisms, but it does not independently establish those measurements.

## 10. Where I changed my own position

These revisions supersede the conflicting round 1 recommendations.

1. Use the module tree and one Read chooser. My three navigator destinations and replacing child outline created too many navigation surfaces.
2. Keep the root as a stable structural index. My drawing paper required an authored orientation reading, while my journey paper opened the root. That contradiction added an unnecessary authoring dependency.
3. Aggregate by directed pair with explicit mixed meaning. My kind-per-line rule retained too much parallel geometry. My “kind and count” caption also repeated the weak count-label approach.
4. Put code paths on cards in both near and far views. My drawing paper's inspection-only binding recommendation was wrong.
5. Treat fixed text floors as prototype targets, not proof. My 14-pixel names and 12-pixel labels forced scale 1.2 with current fonts. I did not demonstrate a whole useful drawing at that scale.
6. Retain label reservations while testing guarded local compaction and better candidate selection. My demand to replace global label ranks first went beyond my evidence.
7. Use a floating inspector and a state chooser that hands off to the main drawing. My separate review workspace and full-width history destination added page modes before proving their need.
8. Prioritize the accepted-scene contract with mounted presentation. My implementation paper put all server cost repairs before the redesign. Small truthful navigation trials can proceed without waiting for every server optimization.
9. Narrow my search criticism. Search correctly opens the parent and selects the result. The remaining source defect is reveal within a manually moved existing scope. Former-name search is also not implemented by `search.ts:37`.
10. Keep Track out of the ordinary header. My implementation paper treated the lost selector as a main redesign requirement. Retry and an explicit same-content recovery choice address failure without another permanent lever.

I retain my positions on exact captured agent context, complete flows, explicit comparison bases, and preserved retained history. I also retain the objection to inferred bindings. Those are trust contracts, not preferences about layout.

The Opus seat must reconcile its own conflicts too. Its journey paper mandates Dive, while its implementation paper prefers carry for down/up moves. Its journey paper keeps directional root connections, while its drawing experiment removes reverse edges and low-degree connections. Its journey paper requires code paths, while its drawing budget does not measure them. This paper chooses conditional directional motion, directed aggregates, visible paths, and no automatic relationship cap.

## 11. What neither set of papers finished

Both seats mentioned errors, return paths, and presentation. Neither specified their interactions well enough to implement or judge. The following gaps use the architect's journey as the test.

| Moment | Missing contract | Required observable result |
| --- | --- | --- |
| First minute | No repository, no model, and a valid planning model are different states | Show the appropriate setup action. A planning model names its unimplemented state. None presents a generic migration error or false Current designation. |
| First minute | Initial loading has no previous picture | Keep a stable shell and delayed progress. After failure, offer the actual retry. Do not leave an unexplained empty ground. |
| First minute | The model can be readable but factually stale | Keep source-warning status discoverable. Explain the selected warning beside the affected subject. A readable diagram must not imply source accuracy. |
| Fifth minute | Path search, tree selection, and card selection have different jobs | Tree and search navigate. Card selection inspects. Code links open source. Keyboard users can perform each action without relying on double-click or hover. |
| Fifth minute | Two panes need separate state and one active navigation target | Opening beside uses the chosen destination. The tree follows the active pane. An agent's navigation never changes the shown conversation. |
| Fifth minute | A summary connection, a hidden kind, and a missing subject all omit different things | Show which restriction applies and how to remove it. An empty filtered result offers Reset. Missing architecture names the unavailable identities. |
| Fifth minute | Repeated input can overtake drawing and animation | Back, Escape, and a second navigation remain usable. The newest request wins. No stale label or capture identifies an old picture as new content. |
| After a week | A remembered live reading can change or disappear | Name its repository, chosen checkout, and state. Preserve its missing identity. Offer Current or a retained reading explicitly, without substitution by name. |
| After a week | A code path can move while architecture identity continues | Search and navigation preserve subject identity. Source actions state unavailable evidence. A path match never establishes a replacement identity. |
| Planning a change | Reparenting changes the location of the subject being reviewed | Show its old and new parents. The change list reaches removed subjects as well as additions. A single current-only tree is insufficient for this comparison. |
| Planning a change | Current can advance during review or while Ask runs | Keep the captured base and answer. State that newer architecture exists. Refresh or reconciliation is explicit. Adoption remains a separate agent operation. |
| Planning a change | Claims, revoked work, and installation recovery affect confidence | Keep claim status and take-back reachable. A `RECOVERY_REQUIRED` state names the original checkout and recovery route. Do not keep announcing normal live freshness. |
| Presenting | Doors and hover labels do not survive a still image | Export the exact accepted reading with readable directions, paths, and aggregate meaning. A viewer can explain the main exchange without operating the application. |
| Presenting | Narration failure differs from missing architecture | Let a readable tour continue without voice. A missing beat names the missing evidence and offers exit or recovery. Do not invent a replacement beat. |
| Presenting | A tour needs return, exploration, and sharing contracts | Exit restores the launch reading. Explore preserves the beat for return. Shared exact readings retain and publish their archive dependencies explicitly. |
| Legacy migration | Preview preparation is not migration approval | The action prepares a preview request. Review shows mappings, unresolved identities, and preserved originals. Installation requires the owner's authorization. |
| Legacy migration | Some old references remain unresolved after cutover | A resolved link opens its exact original coverage. An unresolved one remains unavailable with recovery information. Neither silently opens today's namesake. |

The two-pane failure is now observed, not hypothetical. The model-truth gap also has concrete evidence. The current screenshot reports 222 warnings. Architecture painter and Near and far content bind to TypeScript files that no longer exist in this checkout. Their paths and existence results are in the audit. The current core measures card words in `crates/archboard-scene/src/measure/cards.rs`, which I opened.

This does not invalidate the geometry measurements. It means that removing layers and renaming the model cannot alone establish a trustworthy demonstration. The first demonstration route needs correct source bindings and responsibilities. Neither seat made that an acceptance condition.

The existing captured walkthrough owner is a sound base. It retains ordinary reader state with `Activity` and offers an explicit restart after source changes. See `ModelWalkthroughReader.tsx:95` and `:140`. Preserve that behavior while making the beat's path and state visible.

## 12. Work in slices that the owner can judge

The sequence below leaves a usable product after each slice. Each slice removes its displaced path rather than introducing a permanent second reader. The parallel layer-deletion commit already completes that authored-data step. The remaining work must use and inspect it, without recreating the deletion.

### Slice 0: keep a truthful place during navigation

Keep the pane frame and scene surface mounted. Accept drawing and reading data together. Add real drawing Retry and explicit Back. Separate pending navigation from failed freshness. Clear stale subject and flow intent deliberately.

Owner trial: open Browser, navigate again before drawing finishes, then go Back. The path, picture, inspector, and Ask context must agree throughout. A forced drawing failure leaves a named recoverable state. This slice improves today's reader without deciding the new menu layout.

### Slice 1: prove the reading with real paths and complete meaning

Build one working route through root, Browser, a child, and Workspace packages after layer removal. Use real source paths, one open structural scope, directed aggregates, and explicit boundary summaries. Put only selection details in the right panel. Keep the root index readable.

This slice proves or kills the core idea fastest. It includes the five facts that simplified mockups omit: paths, long names, reciprocal links, exact aggregate members, and the 17-package scope. Compare a summary boundary with persistent exact child connections on the same input. Use the actual pane size and a still export.

Owner trial: identify Browser's source, name one child that calls outside, open its connection, and return. Then explain code-opener's package dependencies. If doors require hover to answer, reject universal doors immediately. If path text only fits after hiding real connections, reject that composition. Do not wait for History or a full tree rewrite to learn this.

### Slice 2: make navigation read like the repository

Add the module tree, repository switcher, unified search, header path, and source actions. Preserve active ancestry and Back camera state. Use the completed layer deletion and inspect its navigation consequences. Add the container warnings and matching authoring guidance. Correct source evidence for the demonstrated route.

Owner trial: find `packages/board`, enter it without a numbered layer, visit a sibling, and open code. Repeat with a deep module and two panes. The selected conversation changes only through human activation.

### Slice 3: complete inspection and behavior discovery

Add the bounded Read chooser, context-appropriate flow links, persistent connection inspection, and scope or subject details. Restore tips, row emphasis, and selection reveal. Connect Ask to the existing conversation with its captured scene.

Owner trial: choose a flow before its representation, inspect a participant, locate it in structure, and return. Repeat with no local flows, a hidden kind, and a missing subject. No route strands the reader in an unexplained blank pane.

### Slice 4: remove demonstrated layout waste

Keep Blocks and its geometry guards. Test local constraint compaction and pane-fit candidate ranking on the truthful Slice 1 content. Include Commands, Command startup, both themes, split panes, and comparison. Preserve necessary label room and code paths.

Owner trial: inspect identical content before and after. Names, paths, arrows, and essential labels must remain readable. Smaller area does not excuse a missing relationship or wrong endpoint. Reject local regressions even when the average improves.

### Slice 5: make change review and return visits trustworthy

Add the lazy state chooser, exact proposal baseline, explicit comparison-off action, changed-subject navigation, and before/after detail. Handle removed subjects and changed containment. Keep one overlay open at a time.

Owner trial: review one proposal, find a removed connection, compare Current with a checkpoint, and return to the previous place. An unavailable base stays unavailable. A large comparison can open After explicitly, without pretending that it still shows changes.

### Slice 6: finish presentation and historical recovery

Restore tested continuity, walkthrough return, Explore and Resume, readable export, and narration recovery. Preserve legacy replay through shared presentation primitives. Finish migration-preview and missing-archive journeys.

Owner trial: present a short tour, explore one beat, resume it, and leave. Read the exported image without hover. Then open a retained original and a missing reference. Each outcome must name the architecture actually available.

Data cost repairs accompany the slices that expose them. Lazy checkpoint rows belong with History. Narrow subject reads belong with inspection. Bounded picture storage and cancellation precede prefetch. Shared vault observation must support both panes and activity. These changes need measured response and idle-cost evidence as well as visual trials.

The final simplification pass asks whether the person needs each remaining control and page. Keep one tree, one Read chooser, one state chooser, one inspector, and one accepted scene owner. Keep detailed architecture complete. Let the selected question determine what the person sees, with every omission apparent.
