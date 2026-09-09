# Frontend code structure

Apply these rules when changing browser UI. They adapt Platform.Frontend's
structure and React ownership patterns to Archboard. [boundaries.md](boundaries.md)
remains authoritative for module interfaces, imports, and test ownership.
The benefit is a predictable place to find a workflow and change it without
pulling its state into the application root.

## Placement

Keep `src/ui/<module>` flat and name each module for the behavior it owns.
Feature-specific UI, state, and commands belong to that module. A visual section
with its own workflow is a feature owner, not merely a shared component.
Reusable domain behavior belongs in a named peer module; generic UI belongs in
the existing shared UI modules. Application and shell composition connect those
owners through their public interfaces. Shared primitives and reusable domain
modules must not depend on application or shell composition.

Use concern folders inside a module as needed:

| Concern       | Contents                                         |
| ------------- | ------------------------------------------------ |
| `components/` | React components and their composite parts       |
| `hooks/`      | React hooks                                      |
| `state/`      | State definitions and selectors                  |
| `lib/`        | Non-React helpers, adapters, and bridge wrappers |
| `api/`        | Non-React calls across external boundaries       |
| `types/`      | Type definitions                                 |
| `tests/`      | Module contract tests and their private support  |

All these subfolders remain private. Expose only the entrypoints callers need
at the module root; an intentionally public hook, component, or API may live
there. Keep small private concerns in a single scoped file in the appropriate
folder. Create folders when there is code to place in them, and avoid redundant
nesting within a concern. Hooks and state helpers belong to their own concerns,
even when only one component consumes them. Colocate a private type with its
owner when a separate type file would only add navigation.

Keep the existing public-entrypoint model, including focused `index.ts`
interfaces. Re-export hubs that expose unrelated implementation are not module
interfaces. Extract shared behavior to an appropriate owner when another module
needs it; never reach into a neighbor's private concern folders. Use the existing
test owners rather than colocating tests in `components/` or `hooks/`.

## Files and components

- Name component files in PascalCase, hooks in kebab-case with a `use-` prefix,
  and non-React files in scoped kebab-case. Public `index.ts[x]` entrypoints keep
  their conventional name; use `api.ts` for a small public API. Non-hooks do not
  use the `use-` prefix. Use dots only for existing tooling conventions and test
  suffixes, not to encode concerns in implementation filenames.
- Prefer one primary component per file. Composite parts may share the root
  component's file. Place the exported component first, then subcomponents,
  helpers, static content, and types where declaration dependencies permit.
- Split by responsibility. Repeated UI clusters, deep branching, large
  conditional JSX, or handlers mixing validation, transport, and presentation
  signal a missing boundary. More than 100 JSX lines or 10 exports prompts a
  simplification check, not a mechanical split. Export count alone does not
  require switching a file into a folder; existing lint limits still apply.
- Prefer early returns and focused branch helpers. Use lookup maps for actual
  mappings, not to disguise control flow. Name callbacks and keep them stable
  when passed to consumers that depend on their identity.
- Use named React imports, including types. New React 19 components receive
  `ref` as a prop when needed instead of introducing `forwardRef` wrappers.
  Use named imports elsewhere too, except when a third-party API requires a
  namespace import.

## State and effects

Keep fetched data subscriptions, local state, derived values, and callbacks
with the consuming component or its focused hook. Lift ownership only when a
parent needs the value or siblings share one truth. Extract hooks by
responsibility, not by adjacent lines. Avoid controller parents, wide hooks,
and prop bags whose only job is relaying values to their real consumer.

Each writable value is a source of truth. Derive values from existing state;
change internal state at event boundaries rather than using effects to copy
it elsewhere. Reserve effects for external-system synchronization, with cleanup
and ownership appropriate to that system. Keep existing external-store
subscriptions and domain controllers where they own lifecycle or ordering.
Moving code into a hook does not justify moving its state up the tree.

## Router and server data

TanStack Router (TASK-166) and TanStack Query (TASK-167) are approved migration
targets. Apply these contracts as those tasks introduce the dependencies; do not
add imports or a second state path ahead of that work.

- Use code-based TanStack Router routes within the existing module boundaries.
  Route composition stays thin and consumes domain-owned interfaces. The first
  navigation contract is a URL that restores an open board or comparison and
  its active pane, with Back/Forward following deliberate board navigation.
  The URL represents browser display intent; the note remains board authority.
  Selection, pending edits, and live voice remain session state. Preserve the
  one-shot Excalidraw library-install hash flow.
- Use TanStack Query for request/response resources where it replaces manual
  loading, error, cache, and refresh state. Start with board listings and server
  previews. Each resource has one cache owner, with query keys/options and API
  adapters owned by its domain module; route loaders coordinate that same cache.
  Keep subscriptions at the consuming UI. Use Suspense where a bounded loading
  fallback helps; an unrelated fetch must not unmount a live canvas or voice owner.
- Query owns server snapshots, not mounted canvas scenes. Mounted previews come
  from the pane. Edit acknowledgements, socket ordering, claims, workbench
  streams, and voice retain their domain owners. Resolve the existing listing's
  mix of persisted boards and live pane inventory explicitly during migration.
- Define freshness, event invalidation, reconnect, cancellation, and retry
  behavior for each migrated resource. Query defaults are not the product
  contract. Keep the last usable data visible where appropriate and provide
  explicit recovery. Board writes retain version checks and existing command
  semantics; do not add automatic write retries or parallel optimistic models.

The remaining stack stays as it is: use the existing shadcn/Base UI primitives,
Remix icons, Tailwind theme tokens, and Bun validation. Other Platform libraries,
font utilities, logging APIs, and referenced skills are not implied dependencies.
Propose an additional dependency only for a concrete unmet workflow and obtain
approval before installing it.

## Adoption and validation

These are the rules for new frontend code. Existing departures are dedicated
cleanup work, not precedent or a reason to mix unrelated moves into feature work.
TASK-165 covers concern placement, naming, component/state ownership, and matching
lint enforcement; routing and Query are separate delivery scopes.
Existing generated/vendor conventions retain only their documented exceptions.
Backend and CLI structure is outside this adoption.

`archboard/ui-concern-placement` enforces the mechanically checkable half of
these rules over authored `src/ui` source: the concern folder names above,
PascalCase component files, `use-` prefixed kebab-case hook files, scoped
kebab-case everywhere else, and React markup and hook exports only in
`components/`, `hooks/` or an intentionally public module-root entrypoint.
`archboard/named-react-imports` enforces the named-import rule above over the
same source, tests included: nothing authored reaches React through its
namespace, in a value or a type position. The documented generated/vendor files
keep the exemption they already have in `.oxlintrc.jsonc`.

Keep tests under the owners in [boundaries.md](boundaries.md), with names that
truthfully identify the contract tested. Follow [test-suite.md](test-suite.md)
for runtime validation and the repository test policy for choosing the cheapest
credible owner. Fix React warnings in touched workflows. Use types and lint for
structure rather than tests of file contents. Preserve existing lint/type rules
while aligning enforcement with these conventions.

Before completing a change, reconsider the resulting ownership and remove any
abstraction, mirror state, or file split that makes the workflow harder to follow.
