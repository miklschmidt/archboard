# PR #19 implementation scrutiny: the reader and its server

Seat: Opus. Lens: how PR #19 was implemented. Diff: `git diff 396bfd9add2f...integrate/pr19`, without the test-speed commits. HEAD is `792359187`.

## Position

The motion code is intact, and the live reader does not call it. The transitions stopped for one structural reason. PR #19 built a second diagram host, `ModelDiagram`, and left the old host, `SemanticDiagram`, as the only caller of the transition engine. The old host now runs only for replays of legacy talks.

Jank has one cause of its own. The reader uses React `key` values to reset state, and each key destroys what the reader looks at. A remount means that React destroys a component and its DOM and builds new ones.

Server cost has one cause too. Every read returns everything, so a click, a focus change and a menu all pay for the whole model.

These three faults are small to repair. The redesign must not start until the first two are repaired, because a designer cannot judge navigation in a canvas that destroys itself. Section 9 gives the order.

Separately, reading a proposal is broken today. In my sample of four states, one fails and two give a page of 23223 by 15579 pixels. That is the largest user-visible defect after the transitions.

## 1. How I measured

- Tool: headless Chromium through `ab.sh`, at 1920 by 1080, against port 17842, with a script injected before page load.
- Sizes are decoded body sizes. 1 KB is 1024 bytes.
- The server was under council load. I counted about 56 open connections on its port. Treat durations as indicative.
- Observed means that I measured it or saw it in a screenshot. Inferred means that I derived it from reading code.
- I did not run `origin/main` in a browser. What main does comes from its code and from ADR 0042.
- I wrote no model content. For change events I dispatched a valid `architecture_changed` frame on the live feed socket. This ran the real client path, and it is a replay, not an agent write.
- TASK-559 says that another agent is working on solve time. My draw times can go out of date.

Evidence files are in `/tmp/integrate/reader-council/evidence/impl-opus-*.png`. Scripts are in `/tmp/integrate/reader-council/scratch-impl-opus/`.

## 2. Ranked findings

Rank orders findings by cost to the user or the next implementer.

Timing has three values. Before means that the fix needs no design decision and blocks fair design review. Part means that the fix needs a redesign decision. Removed means that the redesign deletes the thing.

| # | Finding | Cost | Timing |
| --- | --- | --- | --- |
| F1 | The live reader never calls the transition engine | All picture motion is gone | Before |
| F2 | Scope is a React key, and the camera lives under it | Every scope change destroys the canvas | Before |
| F3 | Proposal reading fails or gives an unreadable page | The review journey is broken | Before for recovery, Part for the default reading |
| F4 | State selection destroys the pane | Header, sidebar and open menus vanish | Before |
| F5 | Every read returns everything | 3,810 KB per click, 8,816 KB per focus | Before |
| F6 | The drawing key holds the complete model | Any edit redraws every scope, storage grows without limit | Before |
| F7 | A healthy change event shows a false stale warning | A false alarm and a layout shift on every agent write | Before |
| F8 | Walkthrough steps blank the surface and cut the camera | The presentation looks broken | Before |
| F9 | Reading controls exist only inside the sidebar | Closing the sidebar removes the way up | Removed |
| F10 | No picture is drawn ahead | Each first visit is a blank wait of about 2 s | Part |
| F11 | Four of the five ADR 0042 answers are lost or partly lost | The picture stops answering the hand | Part |
| F12 | Two reader stacks remain | 12,495 lines of replay-only code slow every change | Removed, with an owner decision |
| F13 | Keys and URL fields overlap as state owners | Stale `subject`, hidden resets | Before for keys, Part for the rest |
| F14 | Loading text changes four times on open | The opening stutters | Part |
| F15 | The watcher reads the full model every second | Server cost grows with vaults and tabs | Before |
| F16 | Whole fit scales small scopes up to 2.94 times | Leaf scopes look absurd | Part |

### F1. The live reader never calls the transition engine

Observed: `usePictureTransition` has one caller, `SemanticDiagram.tsx:282`. My import graph shows that `SemanticDiagram` is reachable only from replay. The hook file stays in the live bundle because `use-presentation-arrival.ts:21` imports one constant from it. `ModelDiagram.tsx:238` calls `stagePicture` directly, and that function replaces the picture with no motion.

Observed: a filter toggle moved the camera from scale 0.255 to 0.490 in one recorded step. The picture element was replaced.

Inferred: the type blocked the wiring. `usePictureTransition` takes `SemanticDrawing`, which needs board fields. `ModelDiagram` holds a `RenderedDiagram`, which lacks them. Only `continuousPictures` (`picture-transition.ts:124`) reads `board` and `view`. The motion code reads `svg` and `atlas`. The adapter is small.

Fix: replace `board` and `view` with one reading identity, then call the hook from `ModelScene`. Section 3 lists what each motion needs.

### F2. Scope is a React key, and the camera lives under it

Observed: `ModelReadingCanvas.tsx:52` sets `key={props.scope ?? "root"}`. A dive destroyed `model-diagram`, the surface and the picture. The header and sidebar survived.

Observed: at main the stage owned the camera across pictures, `SemanticBoardStage.tsx:287`. At HEAD the camera is created at `ModelDiagram.tsx:74`, below that key. Each scope gets a new camera and a new surface.

Inferred: the key also defeats `keepPreviousData` at `ModelDiagram.tsx:72`. The new observer has no previous data, so `ModelDiagram.tsx:78` returns "Drawing modules…". The placeholder that exists to prevent this flash cannot work across a scope change.

Fix: delete the key. Move `useBoardCamera` and the surface above the scope and grammar branches, as main did. The same applies to `ModelReadingCanvas.tsx:77`.

### F3. Proposal reading fails or gives an unreadable page

Observed, four states sampled with the default comparison:

| State | Lifecycle | Changed subjects | Outcome | Page (px) | SVG KB | Time |
| --- | --- | --- | --- | --- | --- | --- |
| `93RlBGLx` | draft | 2,955 | `Error: No clear planned channel for vKEsyHFk/9ncuT5DP#mAyzTmDD` | none | none | 48.8 s |
| `D0qvstE4` | draft | 2,917 | Drawn | 8997 by 8048 | 1,087 | under 6 s |
| `8PuyaYA8` | shelved | 2,191 | Drawn | 23223 by 15579 | 4,764 | about 32 s |
| `vKEsyHFk` | historical | 2,194 | Drawn | 23223 by 15579 | 4,764 | about 27 s, fit scale 0.055 |

Times for the last three rows include page load. Screenshots: `impl-opus-06-state-draft-final.png` and `impl-opus-13-state-last.png`. The error text comes from `crates/archboard-layout/src/blocks/planned/fixed.rs:59`. `ModelDiagram.tsx:84` prints it with no action. The pane offers no retry and no recovery.

Observed: `ModelComparisonSelector.tsx:50` offers only a default and named bases. A reader cannot turn comparison off, although the server supports `compare: false`.

Observed: main had a layout engine bar. `SemanticEngineBar` is now replay-only, and `drawing.ts:25` passes no `layout`. The reader has no route around a Blocks failure.

Inferred: `drawing.ts:41` ignores the query signal, so a hopeless draw holds a worker after the reader leaves. I did not measure this.

Inferred: the failing input is a comparison depiction, because comparison puts removed subjects back into the picture (`model-projection.ts:166`). I did not test the same state without comparison. Someone must test that before they assign the bug to the router.

Fix before the redesign: a failed comparison falls back to the selected state, names what failed, and offers retry. Add a time limit and pass the abort signal. Part of the redesign: a proposal opens on what changed, not on the union of two whole models.

### F4. State selection destroys the pane

Observed: choosing a state destroyed `pane-header`, `model-reading`, `model-diagram`, `semantic-sidebar`, `model-breadcrumbs`, `tabs-content` and `module-list`. "Reading architecture…" stood for 598 ms.

Cause, in three steps. `ArchitectureModelStage.tsx:126` has no placeholder data, so a new state key leaves `data` undefined. `readingSessionKey` at `ArchitectureModelStage.tsx:395` then changes. `ModelWalkthroughFrame` at `ModelWalkthroughReader.tsx:40` also switches branch while the model is undefined.

Main carried a variant change through `transitionPicture`, with cards moving in place. The state selector is the direct successor of that motion.

Fix: use `keepPreviousData` on the reading query. Remove the model identity from the frame key. Keep the header outside the frame.

### F5. Every read returns everything

Observed cost per action is in section 4. These are the worst cases:

- `use-model-catalog.ts:101` reads the full model of every registered repository. `readModels` at line 71 then uses only `manifest`.
- `use-model-navigation.ts:17` reads the full model again on each module selection. It uses only `codeTarget` and `resolvedReferences`. Size: 2,733 KB.
- `clients/architecture-model/queries.ts:183` reads 96 checkpoints at 5,948 KB. Of the JSON, 89 percent is `revision`, one file hash list per checkpoint. The two menus read `id`, `createdAt`, `state.name` and `request.doing`. Source: `packages/board/src/runtime/operations/history/result.ts:135`.
- Lines 171 and 172 of that file refetch always on mount and focus. The feed already reports changes, so the focus refetch buys nothing while the socket is live.
- Line 197 sets an infinite stale time, and line 198 overrides it with `refetchOnMount: "always"`.
- The feed sends a full snapshot on every subscribe, `model-watch.ts:87`. The HTTP read of the same model is then cancelled. Four of eight model requests on open returned zero bytes.

Inferred: bytes on loopback are cheap. The real costs are server read time, JSON parsing and validation, and wait time. `/api/architecture/checkpoints` took between 555 ms and 1,262 ms.

Fix: add a light catalogue field to `/api/repositories`. Add a module detail endpoint. Strip `revision` from the checkpoint list. Make the subscribe snapshot a digest. Drop focus refetch while the feed is live.

### F6. The drawing key holds the complete model

Observed: `browser-renderer.ts:132` sets `key: JSON.stringify(request)`. `drawing.ts:28` puts `projection.complete` in that request. The key for the root scope is 1,075,050 characters. The content of that scope is 12,900 characters.

Observed with an in-memory edit: I changed the description of `Pretext`, which is outside the Browser scope. The scope content stayed equal, and the key changed. So any edit anywhere misses the cache for every scope.

Observed: eight pictures in IndexedDB held 9.4 million characters of keys and 3.4 million of values. Keys outweighed the pictures. After twelve pictures, the browser reported 30.7 MB of storage.

Observed: nothing evicts these entries in the live reader. The only caller of `forgetStalePictures` is `local-pictures.ts:348`, which is replay-only.

The comment at `drawing.ts:14` says that a reading accepts only a scene key derived from its content and interfaces. The code does not do this.

Fix: hash the request. Reduce `variant` to the interface facts of drawn containers. ADR 0044 needs those facts only. Evict by age or count.

### F7. A healthy change event shows a false stale warning

Observed: a replayed change event showed this banner, in `ArchitectureModelStage.tsx:421`:

```
Showing the last coherent reading. The selected architecture is not confirmed. Refresh to retry.
```

The text stood for 339 ms with no selection, and for 831 ms with a selection.

Observed: the banner is in normal flow, `ArchitectureModelStage.tsx:416`. The canvas height went from 1040 to 1007 px and back.

Cause: `ArchitectureModelStage.tsx:325` treats `feed.refreshing` as stale, and `events.ts:145` sets refreshing on each event. A refetch in progress is not staleness.

Inferred: agents write in bursts, so a reader sees this repeatedly during normal work. The text also tells the reader to do what the system is already doing.

Fix: remove `feed.refreshing` from `currentIsStale`. Lay the banner over the canvas, so that a real outage does not move the picture. A real socket loss showed the banner for 3,172 ms, and that case is correct.

### F8. Walkthrough steps blank the surface and cut the camera

Observed over four steps: the surface element was a new one each time. Between 5 and 45 frames had no picture. The camera took one value, then the final value, with no glide between. "Drawing modules…" appeared each time.

Cause: `ModelDiagram.tsx:72` turns off placeholder data during a presentation. `ModelDiagram.tsx:78` then returns text while the next picture is pending, which unmounts `ModelScene`.

`docs/design/operator-canvas-shell.md:298` says that the camera glides between steps. The visual authority and the code disagree.

Fix: keep the last picture on the surface while the next one draws, and let `use-picture-transition.ts:107` carry it.

### F9. Reading controls exist only inside the sidebar

Observed: with the sidebar closed, `model-breadcrumbs`, `model-grammar-selector`, `model-filters`, `model-focus`, `part-search` and `model-walkthroughs` were all absent from the DOM. See `impl-opus-08-sidebar-closed.png`.

Cause: `ModelReading.tsx:162` builds the controls and passes them to `SemanticSidebar.tsx:328`. If the sidebar is away, that component returns null at line 317.

The sidebar is the only containment navigation on screen. Closing it for room leaves Back as the only way up. This is an implementation cause of the crowded sidebar that the owner reports.

The redesign removes this. Scope position and grammar must leave the sidebar.

### F10. No picture is drawn ahead

Observed: a first visit to a scope showed "Drawing modules…" for 2,264 ms. A second visit showed nothing.

Main drew listed boards ahead, `local-pictures.ts:291`. That path now runs only in replay. The Dive at main needs the child picture within `divePrefetch`, 140 ms (`exploring.ts:152`). With no draw ahead, a Dive always takes the plain way.

Fix as part of the redesign: draw the children of the open scope at idle priority, after the solve-time work lands. The drawing cache must be repaired first, see F6.

### F11. Four of the five ADR 0042 answers are lost or partly lost

ADR 0042 is accepted. ADR 0068 does not mention it, so PR #19 reversed an accepted decision without recording that. Section 3 has the detail. The camera under the hand (answer 1) survives. Answers 2 and 3 are partly lost. Answer 4, the Dive, and its plain-way rule (answer 5) are gone.

The redesign must either restore each answer or supersede the ADR in writing.

### F12. Two reader stacks remain

Observed from an import graph of `apps/web/src`, with type-only imports excluded:

| Set | Modules | Lines |
| --- | --- | --- |
| Reachable from the live application | 296 | 41,965 |
| Reachable only from replay | 76 | 12,495 |

The replay-only set holds `SemanticBoardStage`, `SemanticDiagram`, `use-dive.ts`, the About pages and `SemanticInspector`. Section 7 has the rest.

Position: delete the stack. A talk with no `architecture` field is the only way in, at `ReplayStage.tsx:149`. ADR 0068 keeps legacy decoding for exact retained originals, so this needs one owner decision. I did not count how many legacy talks exist.

### F13. Keys and URL fields overlap as state owners

Section 5 has the detail. The worst case: a `subject` change remounts the whole stage and costs 12,501 KB. Agent `browser show` and reference links take this path, `use-model-location.ts:187`.

### F14. Loading text changes four times on open

Observed: "Locating repository…", "Reading architecture…", "Loading diagram…" and "Drawing modules…" follow each other in the same place. A warm open went through all four in 399 ms. A cold open held the last one for 4.5 s.

A reader sees flicker and learns nothing. Use one state: the canvas ground, then the picture. Add text only after a delay.

### F15. The watcher reads the full model every second

Observed: `model-watch.ts:109` runs `refresh` each second for each vault on each socket. Each run does a full read and two `JSON.stringify` calls on the event loop.

Observed in isolation: the read took 23.6 ms and each stringify took 3.0 ms. One watcher on this repository used 4.9 percent of one core. A small vault used 0.6 percent.

`board-locks.ts:104` still says that the poll costs one small file read. That comment is false now. `use-model-catalog.ts:93` subscribes to every registered vault, so the cost grows with repositories and tabs.

TASK-559 reports 58 percent of a core with one tab. I measured 49.9 percent on the shared server with council traffic, and I cannot split that by cause. The watcher alone does not explain 58 percent. My test script omits socket work and the five-second polls. Someone must repeat this on a private server with one tab.

Fix: compare file metadata first. If it changed, read the model. Otherwise, do nothing. Follow the open vault and no other.

### F16. Whole fit scales small scopes up to 2.94 times

Observed: `shop` opened at scale 2.94, and the `Pretext` scope at 2.22. See `impl-opus-12-repo-switch.png` and `impl-opus-14-leaf-dive.png`.

Cause: `camera.ts:221` allows a whole fit up to `MAX_SCALE`, which is 8. PR #19 did not change this. Recursion makes it common, because small scopes are now routine.

Fix as part of the redesign: cap a whole fit near scale 1.

## 3. Motion at main and why each one stopped

Each owner below still exists at HEAD, in replay-only code, unless the row says otherwise.

| Motion at main | Owner | State at HEAD | Exact cause |
| --- | --- | --- | --- |
| Carry one picture into the next, cards and lines moving | `use-picture-transition.ts:271` | Never runs | `ModelDiagram.tsx:238` calls `stagePicture` |
| Part-by-part entrance | `use-picture-transition.ts:275` | Never runs | Same cause |
| Ghost of the last picture, leaving the way the reader went | `use-picture-transition.ts:274` | Never runs | Same cause, and `useDeparture` is unused |
| Picture leaves while the next one loads | `SemanticDiagram.tsx:292` | Never runs | `ModelScene` has no departure |
| Camera keeps shared cards still across a new picture | `use-picture-transition.ts:269` | Never runs | No `keepStill` call. Observed: all context left the view, `impl-opus-07-*.png` |
| Dive into a card and back | `SemanticBoardStage.tsx:293` | Never runs | `ModelDiagram.tsx:148` calls `onOpen`, which is a plain navigation |
| Camera glide to a new reading | `use-auto-fit.ts` through `SemanticBoardStage.tsx:305` | Presentation only | `ModelDiagram.tsx:172` passes null outside a presentation, and line 261 fits instantly |
| Camera survives across pictures | `SemanticBoardStage.tsx:287` | Lost | `ModelDiagram.tsx:74` under the key at `ModelReadingCanvas.tsx:52` |
| Far view, larger names at a distance | `SemanticDiagram.tsx:334` | Off | `ModelDiagram.tsx:301` passes `far: false`. The landing fit is 0.255, far under `FAR_SCALE` 0.75 |
| Line drawn on from source to target | `SemanticDiagram.tsx:328` | Not called | `useSweep` is absent from `ModelScene` |
| Trace, each hop fainter | `SemanticDiagram.tsx:321` | Computed, then dropped | `useLighting` returns `reach`, and `ModelDiagram.tsx:246` to `:248` ignores it |
| Row in a list lights its relationship | `Peek.tsx` provider in `SemanticStageView.tsx:266` | No effect | `ModelDiagram.tsx:182` passes `NOTHING_PEEKED`. Live rows call `usePeekControl` with no provider |
| Hover tip on a subject | `SemanticDiagram.tsx:336` | Not called | No tip in `ModelScene`. At scale 0.255 the card text is unreadable, and no tip replaces it |
| Bring a pick into view | `SemanticBoardStage.tsx:356` | Not called | No `useReveal`, no `useClearOfPanel` |
| Sticky heads on a flow | `SemanticDiagram.tsx:329` | Not called | `operator-canvas-shell.md:302` still requires them |
| Traffic rests during a pan | `SemanticDiagram.tsx:366` | Not called | Low cost, see section 8 |
| Sidebar slide | `use-sidebar-slide.ts` | Works | Live |
| Camera under the hand | `use-board-camera.ts` | Works | Live |
| Lighting on hover and pick | `use-lighting.ts` | Works | Live, with a reduced input |

The canonical model allows something simpler than the old Dive. Module identities are stable across scopes. The root and the Browser scope share `Browser`, `Archboard server` and `Workspace packages` by identity. So `sharedShift` and the carry can run across a scope change with real shared subjects. Inferred: main needed a picture inside a card because a parent board and a child board shared no subjects.

Position: use the carry as the default for parent and child scopes. If the carry fails review, keep the Dive flight.

## 4. Why navigation is janky

Observed, one run of each.

| Action | Destroyed | Placeholder | HTTP KB | Socket KB | Longest task |
| --- | --- | --- | --- | --- | --- |
| Cold open | All | Four texts, picture at 5,405 ms | 6,088 | 2,816 | 200 ms |
| Warm reload | All | Four texts, picture at 476 ms | 6,093 | 2,816 | 90 ms |
| Click a module | Sidebar panel | None | 3,810 | 0 | None |
| Dive, first visit | Canvas, surface, picture | "Drawing modules…" 2,264 ms | 1,077 | 0 | 147 ms |
| Dive, drawn before | Canvas, surface, picture | None | 1,077 | 0 | 242 ms |
| Browser Back | Canvas, surface, picture | None | 3 | 0 | 115 ms |
| Filter toggle | Picture | "Updating diagram…" 2,062 ms | 3 | 0 | 93 ms |
| Choose a draft state | Header, breadcrumb, sidebar, canvas | Two texts, then an error at 49.5 s | 4,152 | 0 | None |
| Window focus | Nothing | None | 8,816 | 0 | None |
| Change event, no selection | Nothing | False stale banner 339 ms | 2,743 | 76 | None |
| Change event, module selected | Nothing | False stale banner 831 ms | 5,476 | 76 | None |
| Feed socket drop | Nothing | Stale banner 3,172 ms | 11 | 2,816 | 81 ms |
| URL `subject` change | Whole stage | None | 12,501 | 0 | 136 ms |
| Open a walkthrough | Nothing, ordinary reader hidden | Three texts | 2,892 | 0 | 131 ms |
| Next walkthrough step | Surface, picture | "Drawing modules…", 5 to 45 blank frames | 0 | 0 | Not recorded |

Inferred: a real agent write with reason `completed` also refetches checkpoints, `events.ts:147`. That adds 5,948 KB per tab.

A double-click is two actions. The first click selects, which starts both a 2,733 KB read and a 1,074 KB `locality` read. The second click opens the scope and cancels the model read. The locality read finishes for nothing, and the selection stays on. See `impl-opus-02-after-dive.png`, which shows "1 selected" after a dive.

The cached dive still blocks the main thread for 242 ms. SVG parsing is not the cause, see section 8. I did not profile the rest. The remount is the likely owner, and removing the key will show that.

## 5. State ownership

Position: the URL is the right owner of reading intent, and pane state is the right owner of selection. The fault is the reset mechanism between them.

- URL: `use-model-location.ts:29` to `:44` reads 15 reading fields. This portable address is sound and worth keeping.
- Selection: `ModelPane.tsx:16` holds canonical identities as pane state. This matches the architecture invariants.
- `ArchitectureModelStage.tsx:98` keys `ModelPane` on `subject`. A URL field therefore resets selection by destroying the whole reader. Selection must take a controlled reset instead.
- Observed: `open` at `use-model-location.ts:200` leaves `subject` in the URL. After a dive the address kept `subjectA` for a module that the reader left. A reload selects that old module again.
- `useSidebar` lives inside the keyed `ModelPane`. Inferred: a `subject` change also resets sidebar tab and pin state.
- `ModelReading.tsx:72` forces the sidebar tab inside a navigation callback. A navigation action must not own a tab.
- `ModelPane.tsx:19` passes `false` for "stepped aside". `ModelFrame.tsx:75` then rebuilds a sidebar object in the header for walkthroughs. Main passed this state into `useSidebar`. One writable fact now has two derivations.
- `useModelLocation` has 10 call sites and returns about 30 members. Only `ModelReading.tsx:50` passes `bookmarkReading`, so the same hook gives different scope answers in one tree. `docs/agents/frontend.md` warns against wide hooks.
- The camera is per scope and is lost on Back. It must stay out of the URL under ADR 0042. It belongs in a pane-level memory by scope, so Back returns the reader to their place.

The query cache is sound as the content owner. Its freshness settings are not, see F5.

## 6. Server cost

Open costs, observed:

| Item | Size | Note |
| --- | --- | --- |
| HTTP on open | 6,088 KB | 5,948 KB of it is checkpoints |
| Socket on open | 2,816 KB | Full model snapshots for six vaults |
| Requests in the first 7 s | 25 | Includes 8 model reads. In another run, 4 of 8 returned zero bytes |
| Model reply | 2,743 KB | No compression, `Cache-Control: no-store` |

Share of the model reply, by JSON size:

| Field | Share | Reader need |
| --- | --- | --- |
| `modules` | 30 percent | Needed |
| `migration` | 24 percent | Only the Bookmarks and Former addresses menus |
| `relationships` | 14 percent | A copy of `modules[].outgoing` |
| `collections` | 13 percent | Needed for flows |
| `walkthroughs` | 10 percent | Needed for the list. Beats can wait |
| `proposals` | 4 percent | Needed for proposal readings |
| `revision` | 3 percent | Only the digest |

Observed: `outgoing` and `relationships` both count 1,117 entries with the same fields, plus `from`. The server sends the same data twice.

Polling: `vaultCheckQuery` and `codeFindingsQuery` poll every 5 s, `clients/semantic-board-canvas/reads/queries.ts:159` and `:192`. A comment in `code-check-route.ts:7` describes this poll as an existing behavior. Each poll is small, at about 3 KB.

## 7. Duplicated concepts and dead code

Duplicates that I read:

| Concept | Canonical | Board | Position |
| --- | --- | --- | --- |
| Diagram host | `ModelDiagram.tsx` | `SemanticDiagram.tsx` | One host. Move the hooks from the old one into the new one |
| Pane stage | `ArchitectureModelStage.tsx` | `SemanticBoardStage.tsx` | Keep the first after the repair. Take camera ownership from the second |
| Pane header | `ModelHeader` in `ModelFrame.tsx:70` | `PaneHeader.tsx` | Keep the first |
| Picture cache | `cachedModelDrawing` | `readCachedPicture`, `writeCachedPicture` | One path in `picture-cache.ts` |
| Code findings | `use-model-code-findings.ts` | `use-code-findings.ts` | One owner. The second serves `CodeWarnings.tsx` and replay |

`ModelGroups`, `ModelInterface` and `ModelWalkthrough` wrap shared components. That is correct reuse.

The folder name `semantic-board-canvas` is now false. The live reader depends on 15,654 lines under that name, and no semantic board is live. The redesign must rename this to the concept that remains.

Dead or misleading code:

- Replay-only: 76 modules, section 2.
- Test-only: `rules/board-catalog/outline.ts`, `listing.ts` and `vault-boards.ts`, 724 lines. No source file outside that folder imports them.
- Unused: `hooks/application/use-drill-repositories.ts`. Nothing imports it.
- Bundled and idle: the carry code in `picture-cards`, `picture-lines`, `picture-pairing`, `picture-motion`, `picture-entrance`, `picture-departure`, `path-morph`, `path-reading` and `use-picture-transition`. These hold 3,087 lines. This is the code that F1 reconnects, so keep it.
- Silent: `state/semantic-board-canvas/board-changes.ts`. `announceSemanticBoardChange` has no caller, so its listeners never fire.
- Live but board-shaped: `reads/board-keys.ts`, `board-refresh.ts`, `semantic-boards.ts`. The live reader needs only `vaultCheckQuery` and `codeFindingsQuery` from them.
- Filler in product code: the "Model ownership" block at `ModelReadingSidebar.tsx:71` states an unavailable feature to every reader.

## 8. Hypotheses that failed

I tested these and rejected them. They must not drive the repair.

- SVG parsing is not the jank. A 632 KB picture parsed in 12 to 14 ms.
- `projectModel` is not the jank. It took 1.2 to 3.0 ms on 540 modules.
- Moving traffic is not a frame-rate problem here. Over 2.5 s with a pan, the run had 148 frames with traffic and 151 without. The median was 16.7 ms in both. The worst frame was 66.7 ms with traffic and 16.8 ms without. Headless rendering limits this result.
- Search works. It goes to the parent scope and selects the module, and the whole fit keeps the module in view.
- A dive into a leaf is not a dead end. It gives a usable reading of the module and its neighbors. Its only faults are F2 and F16.

## 9. Build on, replace, keep

A redesign cannot build on these, and must replace them:

- `ModelReadingCanvas.tsx`, because of its keys.
- `ModelDiagram.tsx` in its current form, because it owns the camera and calls `stagePicture`.
- `ModelReading.tsx`, which mixes reading derivation with chrome assembly in one function of about 195 lines.
- The `controls` slot at `SemanticSidebar.tsx:328`.
- `ModelReadingSidebar.tsx` and the four header selectors at `ArchitectureModelStage.tsx:158`.
- `readingSessionKey` and the frame around it.
- `useModelCatalog` and `useModelNavigation`, because their read contract is wrong.

Keep these:

- `projectModel` and the projection rules. They are pure and fast.
- The portable URL address, with `subject` repaired.
- The canonical selection, including aggregate line translation at `use-model-selection.ts:59`.
- The picture engine in `clients/semantic-board-canvas/picture/`, `useBoardCamera` and `CameraSurface`.
- `useDiagramGestures`, including the new rectangle selection and Space pan.
- The one tab socket in `feed-socket.ts`.
- The captured walkthrough read in `ModelWalkthroughReader.tsx`.
- `findModules` in `rules/architecture-model/search.ts`.

Order of work before design review. Each step ships alone.

1. Delete the scope and grammar keys, and move the camera and surface up (F2).
2. Give drawings a reading identity, and call `usePictureTransition` from `ModelScene` (F1, F8).
3. Keep the previous reading during a state change, and fix the frame key (F4).
4. Remove the false stale state, and lay the banner over the canvas (F7).
5. Hash the drawing key, and evict old pictures (F6).
6. Split the reads, and stop the snapshot and focus refetches (F5, F15).
7. Add recovery for a failed draw and a way to turn comparison off (F3).

Inferred: steps 1 to 4 touch about six files and need no server change. Step 1 comes first, because every motion in section 3 needs one surface that survives.

## 10. Open questions

- Does `93RlBGLx` draw without comparison? This decides whether F3 is a router bug or a comparison bug.
- What uses the rest of the server CPU with one tab? Repeat on a private server.
- How many legacy talks exist? This decides F12.
- What holds the 242 ms task on a cached dive? Profile after step 1.
- Are 2,191 to 2,955 changed subjects real, or did the migration change identities? I did not investigate. If identities changed, then proposal comparison is a model problem first.
