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
  Without `repoX`, the pane uses its admitted vault.
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
  The repository navigator reads the same authority and opens current canonical architecture through the router.
  Its model action targets the active pane, including a workspace that keeps only pane B.
  The sidebar explains unavailable ownership transfer under Model ownership.

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
  `subjectX` names an explicit reference destination and seeds selection when that reading opens.
  Later pointer selection stays temporary and does not rewrite that destination.
  For canonical readings, selecting a state clears the checkpoint, and selecting a checkpoint clears the state.
  Either selection clears the prior explicit comparison.
  They use `focusX`, `hideKindsX`, and `hideGroupsX` for focused subjects and hidden visual features.
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
  A current event snapshot populates only the default current query.
  Other mutable readings refresh through the same public reader. Exact checkpoints keep distinct keys.
  The selected state metadata supplies lifecycle labels, including retained drafts.
  It also supplies unresolved issues and blocked ancestry, independently of comparison changes.
  The current catalogue also supplies adopted and shelved logical states.
  Reading and comparison controls share those identities and keep exact checkpoints distinct.
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
  Code and foreign navigation details use the same cache with module and action selectors.
  Their state, checkpoint, and revision must match the inspected architecture.
  Remembered code findings also match the model identity, state, and exact revision.
  The existing warning control, diagram marks, and evidence panel show only that matching pass.
  Selecting a bound canonical module requests its local Git history through the existing analysis.
  The response must match the inspected model, state, checkpoint, and revision.
  Fast selections share a pending history read. No timer, focus change, or reconnect starts another analysis.
  A source failure remains explicit, and the reader can refresh the history on demand.
  A foreign activation requires the returned address to match the resolved link the reader selected.
  A change of source context cancels its pending activation.
  An unavailable base stays explicit, and the selected reading supplies its own complete interface facts.
  Toolbar, keyboard, and context-menu explanations use the same visible selection and captured reading.
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
- The repository catalogue reads canonical models through the same queries and event feed as open panes.
  Claim activity, pane registration, and pane departure do not trigger another architecture read.
  A missing canonical model exposes initialization or explicit migration, according to the returned refusal.
  Reconnect and repository changes refresh discovery through the existing catalogue owner.
- Define freshness, cancellation, retry, and unavailable states for each resource.
  Preserve healthy exact checkpoints when mutable architecture changes.
  A retained reading with a live comparison base refreshes its comparison metadata through the same reader.
  Retry interrupted reads only after a coherent completion event or an explicit reader action.
  Browser controls never retry authoring or maintain optimistic architecture copies.

Retained recording replay loads separately from the ordinary application.
Its existing read provider supplies the captured original document, listing, policy, and empty code findings.
Its picture provider uses the local renderer.
No provider falls back to a live board HTTP route.
Canonical recordings use their captured model and the same canonical walkthrough components as ordinary playback.

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
cards and the shade of a container's header slab, and the `--tray-*` colors a
container's neutral well. A header's face is `--background`, or the floor of
the tray around it. A group region has no token of
its own: it is drawn in tones of its group's `--semantic-<name>` (ADR 0044).
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
`tests/system/browser/measured-text.test.ts` compares every color that
`theme.css` sets with the color the built page has, in both themes. So no other
stylesheet may set a theme token.

Canonical panes share the existing 280-pixel sidebar and its dock, float, and hide behavior.
The Architecture tab holds scope navigation, reading evidence, narratives, modules, and connections.
The Selection tab starts with the selected module meaning, then its evidence and relationships.
ModelPane owns ordinary selection across asynchronous reads.
The drawing projection translates aggregate lines into canonical relationship identities without owning another selection.
Captured walkthroughs keep their own selection and suspend the ordinary reader.
Their header shares the existing presentation context and holds the sidebar control until playback ends.
Authored beat subjects drive the shared focus, camera glide, and emphasis rules.
An ordinary reader retains its own camera while a captured presentation runs.
Leaving a remote presentation clears its request in the pane arrival owner, so another state read cannot restart it.
Narrative buttons start playback directly and create no popup outside the suspended reader.

A coherent model event resumes exact reads interrupted by an installation barrier.
Healthy immutable readings with no live comparison keep their cached data without another read.
A fresh selected set represents another pick, including a repeated choice of the same module.
The existing sidebar opens Selection for that pick.
Module navigation labels comparison context with its standing, including removed reference modules.

The sidebar search reads the complete selected model, including modules outside the visible scope.
It searches names, responsibilities, descriptions, and code bindings without another server read.
Choosing a result opens its containing scope and selects its canonical identity.
The existing sidebar shortcut, combobox, Escape behavior, and focus handoff remain shared.

Group choices use membership from the complete selected model, independently of scope and group-region filters.
The canonical selected set determines which group choices are active.
Selecting a group chooses all its members, including hidden descendants.
Focus reveals those members through the existing reading controls.
