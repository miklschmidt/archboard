# Frontend code structure

If you change browser UI, apply these rules. They adapt the structure and React
ownership patterns of Platform.Frontend to Archboard. [boundaries.md](boundaries.md)
remains the authority for module interfaces, imports and test ownership.
These rules give a predictable place to find a workflow. You can then change
that workflow and keep its state out of the application root.

## Placement

The browser app lives in `apps/web/src/ui/<role>/<behavior>/`.
Name each behavior folder for the behavior that it owns.
Feature-specific UI, state and commands belong to that module. A visual section
with its own workflow is a feature owner, not only a shared component.
Reusable domain behavior belongs in a named peer module, and generic UI belongs
in the existing shared UI modules. Application and shell composition connect
those owners through their public interfaces. Shared primitives and reusable
domain modules must not depend on application or shell composition.

Use role folders as needed:

| Role          | Contents                                                           |
| ------------- | ------------------------------------------------------------------ |
| `components/` | React components and their composite parts                         |
| `hooks/`      | React hooks                                                        |
| `state/`      | State definitions, stores and selectors                            |
| `rules/`      | Pure, non-React logic, contracts and types                         |
| `clients/`    | What touches the outside: server calls, sockets, storage, the page |
| `constants/`  | Named constants                                                    |
| `workers/`    | Browser workers                                                    |
| `api/`        | A package's public interface (an app has none)                     |

The `ui/` area of a package or an app has no module root. It keeps role folders
directly below `ui/` (`api/`, `clients/`, `components/`, `constants/`, `hooks/`,
`rules/`, `state/`, `workers/`) with behavior folders below a role. A package's
`api/` files are its public interface, so they may re-export hooks; an app has
no `api/`, because nothing imports an app. The same naming rules hold, and the
tests in `tests/ui/` are held to the UI lint policy.

All these folders are private. A package exposes only its `exports`, and nothing
imports an app. `apps/web/src/ui/theme/` holds the one stylesheet; it is no role,
and the placement rule judges TypeScript only.

Keep a small private concern in a single scoped file in the applicable folder.
If there is no code to place in a folder, do not create the folder. Do not nest folders
without need within a concern. If only one component consumes a hook or a state
helper, it still belongs to its own concern. If a separate type
file only adds navigation, keep a private type with its owner.

An app has no index files and no barrels: a caller imports the file that defines
a name. If another behavior needs shared behavior, extract that behavior to an
applicable owner. Use the existing test owners. Do not colocate tests in
`components/` or `hooks/`.

## Files and components

- Name component files in PascalCase, hooks in kebab-case with a `use-` prefix,
  and non-React files in scoped kebab-case. Public `index.ts[x]` entrypoints
  keep their conventional name. For a small public API, use `api.ts`. Non-hooks
  do not use the `use-` prefix. Use dots only for existing tooling conventions
  and test suffixes, not to encode concerns in implementation filenames.
- Prefer one primary component per file. Composite parts can share the file of
  the root component. Where declaration dependencies permit, put the exported
  component first. Then put subcomponents, helpers, static content and types.
- Split by responsibility. Repeated UI clusters, deep branching, large
  conditional JSX, or handlers that mix validation, transport and presentation
  signal a missing boundary. More than 100 JSX lines or 10 exports prompts a
  simplification check, not a mechanical split. Export count alone does not
  require you to change a file into a folder. Existing lint limits still apply.
- Prefer early returns and focused branch helpers. Use lookup maps for actual
  mappings, not to hide control flow. Name callbacks. If you pass a callback to
  a consumer that depends on its identity, keep the callback stable.
- Use named React imports, also for types. If a new React 19 component needs
  `ref`, it receives `ref` as a prop. Do not add `forwardRef` wrappers for it.
  Use named imports elsewhere too. If a third-party API requires a namespace
  import, use a namespace import.

## State and effects

Keep fetched data subscriptions, local state, derived values and callbacks with
the consuming component or its focused hook. Lift ownership only for a value
that a parent needs or that siblings share as one truth. Extract hooks by
responsibility, not by adjacent lines. Avoid controller parents, wide hooks,
and prop bags whose only job is to relay values to their real consumer.

Each writable value is a source of truth. Derive values from existing state.
Change internal state at event boundaries, not through effects that copy it
elsewhere. Use effects only to synchronize with external systems, with cleanup
and ownership that fit that system. Keep existing external-store subscriptions
and domain controllers where they own lifecycle or ordering. A move of code
into a hook does not justify a move of its state up the tree.

## Router and server data

TanStack Router owns reading addresses, and TanStack Query owns server responses.
Each behavior keeps its existing public boundary and one state owner.

- Use code-based routes within the existing module boundaries.
  Route composition connects domain interfaces.
  The URL restores each reading and the active pane.
  Selection, the camera, and live voice remain session state.
- The `board-routing` behavior owns search parameters on the one route at `/`.
  Canonical panes use `modelX`, `scopeX`, and `checkpointX` beside `repoX`.
  Each `repoX` names a registered repository identity, never a filesystem path.
  `repoX` alone names a pane in a repository with no model or a legacy model.
  At the start, a pane without `repoX` reads the only repository, or the one that holds its model (ADR 0069).
  After the start, a pane without `repoX` uses its admitted vault.
  Old `paneX` addresses resolve only through captured migration aliases.
  They never open a live legacy board reader.

  `previewX` names a saved migration origin beside `modelX`.
  Preview queries keep their own identity and use no canonical event feed or state controls.
  Original-state and migration-checkpoint selectors remain paired through preview navigation.
  Ordinary canonical state and checkpoint choices remain mutually exclusive.
  They refresh on mount, focus, reconnect, and explicit Refresh.
  A failed preview hides cached candidate content and retains the requested address for recovery.
  Source details retain exact fingerprints, original board coverage, and proposed state mappings.
  An original reading names its one-board coverage and retains lifecycle and standing evidence.
  State evidence includes explicit draft predecessors, baseline fingerprints, conflicts, and blocked ancestry.
  Retained original files load from the returned byte envelope, independently of canonical composition.
  File inspection decodes one selected input and exposes unsupported UTF-8 as base64.
  Failed composition keeps originals and recovery visible without drawing an empty current model.
  Planned-only sources expose an empty current reading with visible guidance.
  Code and reference reads preserve the preview origin and selected original state beside the checkpoint.
  A followed reference uses its returned preview origin and clears any source alias or bookmark.
  `bookmarkX` selects an imported reading. `legacyAddressX` resolves an exact original alias.
  Both remain router-owned intent through reload and browser history.
  Bookmarks supply default reading fields without copying model content.

  Installed bookmarks come from `migration`, while `migrationPreview` identifies retained original coverage.
  Both readers show explicit bookmark diagnostics before drawing unavailable intent.
  `LEGACY_AUTHORITY` directs ordinary panes to explicit migration.
  Retained original readings use the preview reader.
  Interrupted installation exposes recovery, and durable completion refreshes the shared queries.
  Existing pane keys resolve through captured aliases into paired original state and checkpoint addresses.
  The repository switcher reads the same authority and opens current canonical architecture through the router.
  A repository row targets the active pane, including a workspace that keeps only pane B.
  About explains unavailable ownership transfer under Model ownership.

  Scope, focus, or grammar changes leave the bookmark and retain the displayed reading fields.
  Filters narrow the bookmark without changing its original membership.
  Preview walkthroughs reuse the existing captured player and explicit restart.
  Every converted beat requires an explicit original view. Missing views remain unavailable.
  Explicit visibility narrows diagrams while complete model content supplies interface facts.
  Bookmarks and walkthrough beats use the same projection rule.
  Canonical sockets name `reading=canonical` and start without a legacy board.
  Original inspection decodes old schemas in memory without rewriting their source bytes.
  Explicit canonical intent remains visible even when the server remembers an old address.
  Each reader instance belongs to its resolved vault. A foreign destination replaces that instance and its native reading controls.
  `stateX` names a mutable proposal, and `againstX` names an explicit comparison base.
  `againstX=after` asks for the state alone, and reads with `compare: false`. The control beside the picture says `No comparison`.
  `subjectX` names an explicit reference destination and seeds selection when that reading opens.
  Later pointer selection stays temporary and does not rewrite that destination.
  For canonical readings, selecting a state clears the checkpoint, and selecting a checkpoint clears the state.
  Either selection clears the prior explicit comparison.
  They use `focusX` and `hideKindsX` for focused subjects and hidden kinds.
  `expandX` lists the modules opened beside the scope, sorted, so that one picture has one address. Another scope clears it.
  `grammarX` selects the diagram mode, and `flowX` identifies one explicit authored flow.
  Missing grammar means architecture. Missing flow in a behavioral mode requires a choice.
  Behavioral modes preserve the architecture fields so that returning restores the prior reading.
  These lists contain comma-separated canonical identities or vocabulary keys.
  An absent focus keeps recursive scope navigation. Absent filters show all configured features.
  An absent scope means repository roots. With no checkpoint or state, the pane reads current inputs.
  These parameters remain router-owned reading intent, including explicit unavailable states.
  The canonical reader consumes them directly without opening a legacy board on the server.
  An explicit `repoX` resolves through the existing repository query to its chosen checkout's vault.
  An unavailable repository stays explicit and never falls back to the pane's initial vault.
  The workspace records actual pane presence and preserves each canonical reading during closure, reload, Back, and Forward.
  A mismatched model identity refuses the reading instead of substituting the vault's current model.
  Selection and the camera remain separate from the address.

  Mutable state queries share the architecture event feed, with separate keys for state and comparison intent.
  A subscription reports the revision and carries no architecture.
  A reading stays fresh until the feed reports another revision, so a focus or a mount of cached data reads nothing.
  Exact checkpoints keep distinct keys.
  The selected state metadata supplies lifecycle labels, including retained drafts.
  It also supplies unresolved issues and blocked ancestry, independently of comparison changes.
  The current catalogue also supplies adopted and shelved logical states.
  History and the comparison control share those identities and keep exact checkpoints distinct.
  Selected state details expose recorded decisions, dates, ancestry, and document references.

  The same bounded history disclosure exposes correction reasons, source commits, and exact prior and corrected reading links.
  Its summary identifies corrections even while collapsed.
  Comparison-base audit remains distinct from the selected audit, including when the selected model has no current state.
  Archive-only completion events refresh mutable logical states without a file-digest equality guard.
  Exact checkpoints preserve their original audit coverage and remain explicit during unavailable-history recovery.

  Lineage actions use the existing router and preserve explicit unavailable history.
  The state picker and selected reading expose that standing. The shared issue component shows both values and repair instructions.
  A blocked reading can open its live ancestor through the same router.
  Exact checkpoints preserve their original standing after live settlement. The browser authors no settlement.
  The comparison reference must match the requested model, state, checkpoint, and base revision.
  Only a coherent reference supplies removed subjects to the existing semantic comparison operation.
  Code and reference details come from `/api/architecture/module`, which answers for one module.
  They name the reading that they belong to. Its state, checkpoint, and revision must match the inspected architecture.
  Remembered code findings also match the model identity, state, and exact revision.
  The existing warning control, diagram marks, and evidence panel show only that matching pass.
  A selection of a bound canonical module reads the model's local Git history, and so does `Measures` when it opens (ADR 0045).
  One answer holds every module, so a later selection reads nothing, and neither does a timer, a focus change, or a reconnect.
  The response must match the inspected model, state, checkpoint, and revision. A new revision reads again, and `Refresh` reads a moved HEAD.
  The read takes no signal, because a selection that moves on must not stop a read that the next selection joins.
  A source failure remains explicit, and its action reads again.
  A foreign activation requires the returned address to match the resolved link the reader selected.
  A change of source context cancels its pending activation.
  An unavailable base stays explicit, and the selected reading supplies its own complete interface facts.
  Toolbar, keyboard, and context-menu explanations use the same visible selection and captured reading.
  The capture carries `expectedComparisonRevision` from that model's comparison, beside the target and optional narrative-source guards.
  An absent comparison omits that guard. Later reads never replace a captured guard.
  One tab-scoped query reads temporary answers from the existing local action owner.
  The pane socket announces changes, and reconnect refreshes the same query.
  Answer controls use the captured vault after navigation. The result labels its original model, state, subjects, and revision.
  Canonical metadata joins the existing pane report sequence, with the admitted vault on the request and actual reading vault inside architecture.

  Canonical walkthroughs reuse the existing presentation controls, diagram, camera, and voice overlay.
  Each playback query holds one captured source and target until an explicit restart.
  The pane reports both revision guards and the narrative source selection.
  Narration waits for the latest report to reach the server before starting voice.
  A changed or failed report refuses that start. The control remains unavailable while the picture draws.
  Server presentation requests move only the matching captured walkthrough in that socket's pane.
  The existing position owner reports the request identity until a person chooses another step.
  Recording and replay pages use their supplied capture without reading mutable architecture.

  A deliberate user navigation adds one history entry.
  An agent navigation replaces the current entry.
  The pending navigation operation identifies its matching canonical socket arrival once.
  HTTP completion and socket arrival can occur in either order.
  Unavailable destinations retain their address and expose recovery.
  Closing or restoring a pane needs no content guard because the browser authors no architecture.

- Each request resource has one Query owner for its keys, transport, freshness, and recovery.
  Keep subscriptions with the consuming behavior.
  An unrelated request must not unmount a live canvas or voice owner.
  Query holds server responses, while each pane owns its mounted scene and transient selection.
  Edit acknowledgements, socket ordering, claims, workbench streams, and voice retain their existing owners.
- The repository catalogue reads no model. The event feed follows every readable vault and reports its summary.
  Claim activity, pane registration, and pane departure do not trigger an architecture read.
  A missing canonical model exposes initialization or explicit migration, according to the reported refusal.
  Reconnect and repository changes refresh discovery through the existing catalogue owner.
- Define freshness, cancellation, retry, and unavailable states for each resource.
  Preserve healthy exact checkpoints when mutable architecture changes.
  Retained checkpoint rows load when a person opens History or compares with a saved reading, and completions keep them fresh after that.
  A canonical drawing is kept under a digest of the exact render request, whose whole-model part holds only containment and relationship ends.
  An edit that the drawing does not read keeps its entry. The browser keeps a bounded number of drawings for one renderer build.
  A retained reading with a live comparison base refreshes its comparison metadata through the same reader.
  Retry interrupted reads only after a coherent completion event or an explicit reader action.
  Browser controls never retry authoring or maintain optimistic architecture copies.

Retained recording replay loads separately from the ordinary application.
Its existing read provider supplies the captured original document, listing, policy, and empty code findings.
Its picture provider uses the local renderer.
No provider falls back to a live board HTTP route.
Canonical recordings use their captured model and the same canonical walkthrough components as ordinary playback.

The left column draws its depth from the picture's tokens. `column-well` in `app.css` is the well of a list, and a row's tone is `bg-tray-sink`, so a stuck row hides what scrolls under it.
A shelf or a foot of a list stands proud of the floor, so it sets its own z-index above the well's shadow.
The `edge` variant of `Tabs.List` stands on the top edge of that well. `app.css` holds its piece, outside any layer, so it replaces the registry's trigger.
A count is `Badge` with `variant="count"` and `size="technical"`.

Every dropdown is `Select` or `DropdownMenu` from the ui-kit, and both ease with the `menu-motion` utility. The kit reads no timing, because it stands in the lowest layer, and a popover stands in a portal outside the shell root. So `applyShellDurations` puts `COLUMN_MS.popoverIn` and `popoverOut` on the root element when the page starts.

The remaining stack stays as it is. Use the existing shadcn/Base UI primitives,
Remix icons, Tailwind theme tokens and Bun validation. Other Platform libraries,
font utilities, logging APIs and referenced skills are not implied dependencies.
Propose an additional dependency only for a concrete unmet workflow. Get
approval before you install it.

## Adoption and validation

These are the rules for new frontend code. Existing departures from them are
dedicated cleanup work, not precedent or a reason to mix unrelated moves into
feature work. TASK-165 covers concern placement, naming, component/state
ownership and matching lint enforcement. Routing and Query are separate delivery
scopes. Existing generated/vendor conventions keep only their documented
exceptions. Backend and CLI structure is outside this adoption.

`archboard/ui-concern-placement` enforces the half of these rules that a machine
can check, over authored UI source in packages and apps. It checks the role
folder names above and PascalCase component files. It checks `use-` prefixed kebab-case hook
files and scoped kebab-case everywhere else. It also permits React markup and
hook exports only in `components/` and `hooks/`; a package's `api/` files may re-export hooks.

`archboard/named-react-imports` enforces the named-import rule above over the
same source, tests included. Nothing authored reaches React through its
namespace, in a value or a type position. The documented generated/vendor files
keep the exemption that they already have in `.oxlintrc.jsonc`.

Keep tests under the owners in [boundaries.md](boundaries.md), with names that
truthfully identify the contract that they test. For runtime validation, follow
[test-suite.md](test-suite.md). To choose the cheapest credible owner, follow
the repository test policy. Fix React warnings in touched workflows. For
structure, use types and lint, not tests of file contents. Keep existing
lint/type rules while you align enforcement with these conventions.

Before you complete a change, examine the resulting ownership again. Remove any
abstraction, mirror state or file split that makes the workflow harder to
follow.

## Theme colors

`packages/renderer/assets/theme.css` holds the light and dark colors of the shell and
of the diagrams. It has the shadcn colors and the comparison colors
(`--standing-added`, `--standing-changed`, `--standing-removed`). It also has
the palette `--semantic-<name>`, whose names the kinds and groups of a vault
use.
`--diagram-edge` paints relationships that have no palette color, and the
lifelines of a sequence. It is separate from `--muted-foreground`.
`--diagram-glow` is the light that a traffic pulse mixes into its line. The
`--slab-*` colors paint the faces, front edges and shadows of the picture's
cards, and the `--tray-*` colors a container's neutral well. `--tray-tab` is the lighter piece a container's tab raises on the well's edge.
`--bright-<name>` is the dark value of `--semantic-<name>` in both themes, because a
door and a group's tag are the same bright piece on either ground. Change the two together.
`apps/web/src/ui/theme/app.css` imports the file and holds every value that is not a
color.

The file holds only custom properties that each hold one literal color, in two
blocks: `:root` for light and `:root[data-theme="dark"]` for dark. A token that
the dark block does not set keeps its light value. Write colors in OKLCH. The
renderer refuses other selectors and rules, `!important` and values that are
not colors. It also refuses a token that a picture uses but the file does not
set. A new palette
name needs its token here and its name in `PaletteColorSchema` in
`packages/board/src/shared/schemas/semantic-policy.ts`.

A picture in the page paints with the tokens themselves, so a theme switch
redraws nothing. A standalone SVG or PNG from `model render` or
`model rasterize` is drawn in one theme. Its root sets `color-scheme` and
every token that it uses. An SVG drawn with `--theme auto` sets
`color-scheme: light dark` and each token whose themes differ as
`light-dark(<light>, <dark>)`, so the reader's colour scheme chooses. Lightning CSS converts those tokens to sRGB.

After you edit `theme.css`, run `bun run build`. Then restart the Archboard
server, because the server reads the file only once, at start.
`tests/system/browser/drawn-glyphs.test.ts` compares every color that
`theme.css` sets with the color the built page has, in both themes. So no other
stylesheet may set a theme token.

`ModelPanel` is a column beside the picture on every Diagram reading, so the camera fits the room it leaves and a selection never refits the picture.
It holds its width under About, which lies over it, so the picture keeps its camera.
`ModelPanelScope` says what is open while nothing is selected, through the same `scopeHead` as About.
`ModelPanelSubject` says what the selection is, and `selectedSubject` decides which subject that is for the panel and for About.
A row of the panel is an action. Long lists and evidence live on `ModelAbout`, which names the open scope or the selected subject.
`ModelPanelContext` stands under what the panel says, in the same scroll, and `contextOf` decides what it lists.
A row opens its flow or walkthrough through the same choice as Find, so the left column follows it.
The left tabs list the whole model, and only the panel follows what a reader looks at.
`ModelLegend` ends the panel, under the actions and outside the keyed subject, so a selection neither moves nor redraws it.
It owns the marks, and `Filter` puts a visibility switch on each line type that a reader can hide.
`rules/architecture-model/legend-rows.ts` derives its rows from the whole reading, in the policy's order, so that a hidden kind and what left the picture with it keep their rows.
A group's tag takes `--tag` from `paletteTag`, and the `group-tag` utility in `app.css` holds its one recipe.
A tag selects what the picture draws of its group through the ordinary selection, and it reads as on from that selection, with no state of its own.
`ModelEngine` stands under the legend on a structural reading. `useAcceptedScene` reads the browser's engine and puts it on the request, so the scene key, the fit and the drawing key all name it.
A switch is a destination like any other: the last picture stays until the other engine's drawing exists, and the selection holds.
A flow request carries no engine, because the core lays out only architecture, so its stored drawing outlives a switch.
`useDoorPick` turns a click on a door into a move to its module, and `ModelDoorTip` lists the door's endpoints on hover. Ctrl, a removed door and a presented step keep the ordinary pick.
A click on the control that a door or a frame's tab wears goes to `onToggle` instead. The one rule is `toggled` in `rules/architecture-model/expansion.ts`, and the pointer, the panel and the `E` key all reach it. A module expanded beside the scope keeps `sceneBoard`, so the picture is carried, and `sceneFit` names it, so the camera lands whole.
Only `useModelReading` and `useModelMoves` pass `controls: true` to `projectModel`, so an export and a presented step draw neither control. The core draws the control, and `app.css` adds only its hover.
The selection survives About.
ModelPane owns ordinary selection across asynchronous reads.
The drawing projection translates aggregate lines into canonical relationship identities without owning another selection.
Captured walkthroughs keep their own selection and suspend the ordinary reader.
Their header shares the existing presentation context and holds the sidebar control until playback ends.
Authored beat subjects drive the shared focus, camera glide, and emphasis rules.
An ordinary reader retains its own camera while a captured presentation runs.
On one board, the surface that comes into sight starts from the camera that the other left and glides to its own rest.
Leaving a remote presentation clears its request in the pane arrival owner, so another state read cannot restart it.
Narrative buttons start playback directly and create no popup outside the suspended reader.

A pane keeps one mounted surface, so no key on scope, state, model or arrival remounts the reader.
`useAcceptedScene` keeps the requested destination apart from the accepted scene until its drawing exists.
The header, crumbs and controls read the destination.
The picture, inspection, Ask and pane reports read the accepted scene, through `shown`.
A pane reports a reading as drawn only when `ready` is true.
An empty or unavailable reading is an accepted scene with no picture, so the last picture never stands in for it.
A failed drawing or a failed read of a destination leaves the accepted scene where it is, and `pending` is false, because nothing is on its way.
The failure lies over the picture with Retry and Back, and with `No comparison` when a comparison can be what failed.
Back is the browser's, so a reading opened directly has none.
Every notice about a reading lies over the picture in `model-notices`, so no failure and no lost server moves it.
A cached reading is stale only when a read failed or the stream was lost. An event being applied is healthy and shows nothing.
A retained reading stays through a lost server. A refusal of that same reading removes it, because the server has then said that it is unavailable.
A message about a wait appears after `PICTURE_MS.waitNotice` and names the destination.
A scope in `retiredIds` says that the module was removed, and `/api/architecture/retained-module` finds the newest retained reading that holds it.
That reading opens with no comparison. An address of a reader goes through `/api/panes/show` with a missing scope, because the pane states what is missing. An agent's show is refused.
`rules/architecture-model/scene.ts` decides what carries, what leaves and which way, from the two readings, so every route to a reading moves the same way.
A history entry keeps its camera, so Back and Forward return that camera. Up is a new visit, and it fits.

A coherent model event resumes exact reads interrupted by an installation barrier.
Healthy immutable readings with no live comparison keep their cached data without another read.
A fresh selected set represents another pick, including a repeated choice of the same module.
The list of parts on About labels comparison context with its standing, including removed reference modules.

The shell owns the left column's frame and holds no model knowledge.
The reader of the focused pane portals Find, the destinations, and its lists into the column slots from `usePaneChrome`.
The pane header slot takes the crumbs, the code path, the state chip, and `Diagram | About`.
`useReader` gathers the reading, places, moves, and choices that the column, the header, and the surface read.
`React.Activity` keeps the reading mounted while a walkthrough plays, so the column stays and the picture keeps its camera.
A live `architecture_snapshot` has no `states`, so `History` and the timeline of About read `architectureRecordQuery`, which loads only when one of them opens.
`ModelMeasures` is the `Measures` destination. It draws the accepted scene, and `rules/architecture-model/module-measures.ts` joins each module's interface, which needs no server, with what the one locality answer says of it.
That rule also holds the one order of each measure, and each measure's name and what it counts.
`ModelMeasureRow` draws a row's cells on one track of seven columns, so the heads and the rows line up.
`ModelChoiceList` puts them in `Tree.Facts`, and `flat` gives a table's row no room for a disclosure.
A row selects through `findModule`, the path of Find and of a count in the interface line.
A closed tab draws nothing, so `ReadingColumn` keeps the sort.

Find reads the complete selected model, including modules outside the visible scope.
It searches names, code paths, responsibilities, descriptions, and code symbols without another server read.
Choosing a module opens its containing scope, selects its canonical identity, and moves focus to the picture.

Group choices use membership from the complete selected model, independently of scope.
The canonical selected set determines which group choices are active.
Selecting a group chooses all its members, including hidden descendants.
Focus reveals those members through the existing reading controls.
