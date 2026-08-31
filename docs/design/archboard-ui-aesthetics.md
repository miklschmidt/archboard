# Archboard UI aesthetic contract

This document is the visual authority for Archboard UI work. It turns the approved
[TASK-140 operator canvas shell reference](operator-canvas-shell.md) and its
[light-and-dark mockup](assets/operator-canvas-shell.png) into rules that a UI worker can apply.
The [Tailwind 4 and shadcn/Base UI adoption record](tailwind-base-ui-adoption-research.md)
defines how those rules enter the current toolchain.

The mockup is authoritative for composition, proportion, density, typography, color, and finish.
It is not a screenshot, a pixel specification, or a source of product state. Product behavior
comes from Archboard's implemented contracts and their tests. Tailwind, shadcn, Base UI, and copied
registry source are implementation tools. None of them supplies a second visual direction.
Framework defaults and shadcn presets are forbidden as visual direction.

Shell integration and future agent-facing enforcement depend on this contract. This document does
not certify that current or later rendered work conforms. Every UI change must prove its own result
through the product interface.

## The canvas owns the frame

Archboard is a desktop application for a person and an agent working on one architecture board.
The canvas receives the largest uninterrupted share of the window. Shell regions expose board,
pane, selection, binding, claim, and agent state without turning the canvas into the background of
a dashboard.

Use the reference composition:

- a slim shared header;
- a compact board and variant navigator on the left;
- the canvas in the center;
- a narrow selection inspector on the right when selection warrants it; and
- a collapsible agent workbench below the canvas.

One-pane, two-pane, and fullscreen presentations may change which supporting regions are visible,
but they must keep the same hierarchy. Keep a supporting region open only while it exposes a needed
action or current state. Do not add a second drawing toolbar. Excalidraw owns drawing tools.

The shell is desktop-only. Do not design, implement, or gate phone or narrow responsive layouts.
Verify at the supported 1440 by 900 desktop viewport and at desktop dimensions suitable for the
Samsung Flip. Visual density must not shrink pointer targets: interactive controls used on the
Flip retain the semantic 44px touch target even when their visible mark is smaller.

## Use a Swiss grid, not a field of containers

Align region edges, labels, controls, and repeated rows to a small shared spacing grid. Adjacent
regions share one boundary rather than sitting inside separate floating containers. Use whitespace,
alignment, and one-pixel rules to establish hierarchy. The shell forms one continuous aligned frame
around the canvas.

Prefer the spacing, rule, header, and touch-target utilities exposed by
[`src/ui/theme/app.css`](../../src/ui/theme/app.css). Add a semantic token there when a real repeated
relationship is missing. Do not scatter arbitrary gaps or offsets until the rows happen to line up.

Keep the composition flat and compact:

- Use one-pixel rules between regions and within data-dense lists.
- Use the small semantic radius scale. Hairlines, controls, panels, and dialogs range from 1px to
  5px. Reserve the round token for objects that are intrinsically circular, such as a status dot.
- Use `shadow-flat` by default. A shadow may separate a functional overlay only when borders and
  contrast cannot do the job, and it needs a semantic token plus rendered evidence. Decorative
  shadows are forbidden.
- Do not use gradients, glow, glass effects, oversized pills, or rounded dashboard cards.
- Do not turn workbench messages, statuses, or metadata into generic chat bubbles or a stack of
  generic cards. Group content through the grid, headings, rules, and disclosure.

Names such as `card` and `popover` in a compatibility alias do not authorize a card-based layout.
Archboard's composition decides the shape.

## Typography has two jobs

Use the bundled families and the roles already established by the reference:

| Content              | Family and weight                                                                   | Treatment                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Human interface text | Onest 400 for body, 500 for labels and metadata, 600 for headings, 700 for emphasis | Normal or title case, normal tracking                                                      |
| Technical tokens     | DM Mono 400 for values and timestamps, 500 for compact technical emphasis           | Repository names, paths, branches, commits, element IDs, versions, and activity times only |
| Product mark         | The canonical lowercase vector `archboard` wordmark                                 | No icon tile and no substituted text rendering                                             |

State phrases, counts, navigator labels, inspector labels, and workbench prose are human interface
text. Monospace is not a shortcut for making the whole shell look technical. Keep
`font-synthesis: none`; a machine-local font or synthesized weight must not change the hierarchy.

Use the semantic text sizes and line heights from the theme. Do not import a framework typography
scale or choose a preset heading simply because it exists.

## Color communicates ownership and state

Light and dark themes use the same geometry and hierarchy. Light mode uses chalk-white and pale
stone surfaces with near-black text. Dark mode uses deep charcoal and black surfaces with
bone-white text. Both use the same two accents:

| Accent    | Owned meaning                                                        | Do not use it for                                                    |
| --------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Cobalt    | Selection, primary interaction, focus, and the active connected path | General decoration or unrelated data categories                      |
| Acid lime | Live agent status and positive activity                              | Generic button fill, large surfaces, or the only indication of state |

Destructive, warning, offline, muted, border, and surface roles use their own semantic tokens. A
state must remain identifiable by text, iconography, or structure when color is absent. Check
foreground contrast and visible focus in both themes.

[`src/ui/theme/app.css`](../../src/ui/theme/app.css) is the canonical token source. Its light values,
dark overrides, and Tailwind aliases move together. Do not make dark mode a separate component tree,
add a competing `prefers-color-scheme` owner, or place raw theme values in component source.

## Motion is feedback

Motion may explain a state change, reveal a disclosure, or show that an agent is active. It must not
decorate idle space. Use the semantic control and status durations and easing. Do not adopt stock
transition durations, spring motion, entrance choreography, shimmer, or animation libraries because
a framework example includes them.

Honor `prefers-reduced-motion`. The canonical theme reduces control and status motion and stops
repetition. Components must consume those values rather than add a second reduced-motion path. The
Tailwind compiler can still emit a small set of hardcoded transition fallbacks after its configurable
theme is cleared; their existence does not make them Archboard tokens or approved product classes.

## Reference content is not product state

The mockup contains illustrative strings and controls that helped establish density. They cannot
enter the product unless an implemented contract supplies their data and behavior. Never ship mock
data to make a region look complete.

In particular, the image alone does not authorize:

- a board-level Git branch, health, latency, or error-rate field;
- a hidden proposed-diff workflow;
- `Pause`, `Send`, prompt, or other agent controls without one safe owning contract;
- synthetic board miniatures or generated preview data; or
- another drawing toolbar.

A navigator preview depicts real current board content without opening, claiming, focusing, or
changing that board. Empty, loading, partial, unavailable, stale, and error states must say what is
true. A later feature may implement something that resembles an illustrative detail, but it must be
accepted on its own product contract and real state source, not on the picture.

## Build through named modules and semantic utilities

UI implementation follows the [module boundary contract](../agents/boundaries.md). Put behavior
under a product-named `src/ui/<module>` with public entrypoints at the module root. Existing examples
include `shell`, `selection-inspector`, `board-preview`, `path-focus`, `theme`, and `ui-classnames`.
Do not create generic `components/ui`, `core`, `utils`, or preset-shaped buckets.

Copied shadcn source becomes Archboard source. Reduce it to the needed Base UI primitive, place it in
the module that owns the product behavior, replace registry styling with Archboard semantics, and
reuse the typed local icon set. Do not accept a preset's palette, radius, shadow, animation, sample
content, dependency, or icon choice as a default.

Use Tailwind for composition through the semantic aliases in the canonical theme. Suitable examples
include `bg-background`, `bg-surface`, `text-foreground`, `text-muted-foreground`, `border-border`,
`bg-primary`, `text-status`, `rounded-control`, `shadow-flat`, `font-sans`, `font-mono`, and
`duration-control`. Default palette names, stock radius and shadow scales, and arbitrary visual
values are not Archboard styling. If a new value describes a repeated product role, name it in the
theme first.

Keep utility strings complete and static so Tailwind can discover them. Put variants in exhaustive,
typed maps in their owning module. Compose them with the canonical
[`cn`](../../src/ui/ui-classnames/index.ts) helper; never construct a utility name by interpolation.
Run the repository's Oxfmt command to order utilities. Do not hand-maintain an ordering convention or
add a second formatter.

## One behavior, one state owner

Adopting a primitive must leave one path for the behavior:

- The product module owns product state, transitions, data projection, and user-visible outcomes.
- Base UI may own the primitive's keyboard, pointer, focus, and ARIA mechanics. It receives product
  state and callbacks; it does not create a parallel application model.
- A migrated dialog, disclosure, menu, tooltip, or control replaces the former interaction owner.
  Do not keep hand-rolled and Base UI versions active for the same behavior.
- Presentation state stays in the browser. Selection, path focus, previews, shell layout, and styling
  do not write to the board note or change synchronization semantics.

Current state must remain inspectable. Similar actions need similar outcomes, and an error must say
what happened and what the person can do next. Preserve every reachable success, progress, empty,
partial, failure, and recovery state that the product can produce.

## Accessibility is part of the composition

Base UI removes repeated mechanics but does not make a composition accessible. Every new or migrated
surface must provide:

- a keyboard-only path and visible `:focus-visible` treatment in both themes;
- programmatic names, labels, roles, descriptions, and state where appropriate;
- readable contrast without disabling user-agent forced-color behavior;
- meaningful status and error announcements without reading every streaming token;
- disabled and unavailable states that remain understandable without color;
- expected Escape behavior, focus containment, and focus return for overlays; and
- portal stacking that stays above the shell without trapping or obscuring Excalidraw.

Verify pointer, keyboard, screen-reader, and desktop-sized Flip touch use through the rendered
composition. Lint can catch missing markup, but it cannot prove focus order, portal stacking,
contrast, or hierarchy.

## Required workflow and evidence

Before touching UI, read this contract, the [operator reference](operator-canvas-shell.md), the
[Tailwind/Base UI adoption record](tailwind-base-ui-adoption-research.md), and the
[module boundary contract](../agents/boundaries.md). Identify the current behavior and state owner
before choosing a component.

During implementation:

1. Work in one named module and use the canonical semantic theme.
2. Preserve real product states and remove any replaced interaction owner.
3. Render early in the actual shell. Inspect light and dark themes at 1440 by 900, then exercise the
   affected one-pane, two-pane, fullscreen, keyboard, and Flip-sized touch workflows.
4. Compare composition, density, alignment, typography, color roles, and finish against the
   reference. Do not use a pixel-perfect screenshot threshold.
5. Prove that presentation-only work causes no board-note write and does not change an existing
   behavior contract.

Before handoff, use the repository's native commands: `bun run fmt`, `bun run fmt:check`,
`bun run lint`, `bun run type-check`, the focused module or browser owner, `bun run build:frontend`,
and finally `bun run check`. New browser owners join the serial browser inventory instead of running
as a competing lane. Do not weaken a test, lint rule, type rule, warning policy, or existing owner to
admit the change.

Capture rendered evidence for every changed region and reachable state. Keep disposable screenshots,
compiled CSS, registry responses, and build output untracked. Commit canonical source, token,
configuration, and durable reference inputs only.

When a stable part of this contract is machine-observable, enforce it with the cheapest native
owner: types or lint for structure, focused tests for module behavior, compiler fixtures for theme
output, and serial browser tests for rendered workflows. An agent instruction or policy added later
must point back to this document instead of paraphrasing a second aesthetic contract.
