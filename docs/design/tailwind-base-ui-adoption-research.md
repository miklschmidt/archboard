# Tailwind 4 and shadcn/Base UI adoption research

Date: 2026-08-30
Scope: smallest rigorous adoption path for the existing Bun, Vite 8, React 19, and
strict TypeScript frontend. No package, configuration, source, or test changes were
made as part of this research.

## Recommendation

Adopt Tailwind CSS 4 as an additive styling tool and adopt shadcn as a source
distribution workflow for a small number of Base UI primitives. Do not perform a
stylesheet rewrite or install the full shadcn dependency set up front.

The first implementation should have one canonical Tailwind CSS entrypoint, one
semantic token map, and one copied primitive as a proof of the seam. Keep the current
shell CSS and Excalidraw CSS in place until a primitive is migrated and its rendered
behavior is checked. The operator-canvas reference remains the visual authority:
canvas-first proportions, a dense aligned grid, one-pixel rules, small radii, little
or no shadow, and no gradients, glow, or rounded dashboard cards. See
[`operator-canvas-shell.md`](operator-canvas-shell.md), especially its verification
standard and distinction between visual direction and current product behavior.

This path has material value for UI workers: Tailwind gives them a shared vocabulary
and fast local composition, while Base UI removes repeated keyboard, focus, and ARIA
plumbing. It does not create a second design system or a second application state
model. It also leaves the current product contracts and browser checks as the safety
net.

## Repository baseline

The inspected baseline is:

| Area         | Current state                                                                                                          | Consequence                                                                                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime      | Bun `>=1.4.0`, React/React DOM `19.2.8`                                                                                | Use `bun add`, `bunx`, and `bun run`; do not copy npm/npx commands literally.                                                                                                                                  |
| Build        | Vite `8.2.2`, `root: "frontend"`, output `dist/frontend`                                                               | CSS is rooted at `frontend/`; source UI remains under `src/ui`. Vite and TypeScript alias configuration must account for both roots.                                                                           |
| CSS          | [`src/ui/shell/shell.css`](../../src/ui/shell/shell.css) is about 1,773 lines; opener settings has its own stylesheet  | Existing CSS is a real visual and behavior contract. It has light/dark semantic tokens, plus older gradients and glow that the new reference explicitly rejects. Migrate deliberately, component by component. |
| HTML entry   | [`frontend/index.html`](../../frontend/index.html) links Excalidraw CSS and shell CSS directly                         | Add exactly one application stylesheet entrypoint. Keep Excalidraw's vendor stylesheet separate and test the effect of any global reset.                                                                       |
| TypeScript   | [`tsconfig.frontend.json`](../../tsconfig.frontend.json) is a separate strict browser check                            | Any alias must resolve in the frontend type check and Vite, not only in the root TypeScript config.                                                                                                            |
| Formatting   | [`oxfmt@0.65.0`](../../package.json) with no Tailwind option                                                           | Tailwind sorting is available in this package but disabled until configured.                                                                                                                                   |
| Lint         | [`oxlint@1.80.0`](../../package.json) with `jsx-a11y`, strict categories, and an existing local JS plugin              | Preserve the existing lint lane. There is no native Tailwind rule family in the inspected Oxlint release/config schema.                                                                                        |
| Verification | `bun run check` runs lint, format check, type checks, module/system/repository tests, and the serial real-browser lane | New UI gates must be additive. The browser lane is the authority for the shell, themes, focus, and responsive behavior.                                                                                        |

The source layout also matters. [`docs/agents/boundaries.md`](../agents/boundaries.md)
requires browser implementation under `src/ui/<module>`, root entrypoints for module
imports, and no generic implementation buckets. A generated `components/ui` tree
copied from a stock Vite example would violate the repository's intended shape unless
the module boundary is explicitly chosen and documented.

## Verified integration

### Tailwind 4 with Vite 8

Tailwind's official [Vite installation guide](https://tailwindcss.com/docs/installation/using-vite)
uses the `@tailwindcss/vite` plugin, a CSS `@import "tailwindcss"`, and a compiled
stylesheet included by the page. Tailwind's [v4 announcement](https://tailwindcss.com/blog/tailwindcss-v4)
also recommends the first-party Vite plugin for Vite projects. The current
`@tailwindcss/vite` package manifest at [v4.3.3](https://raw.githubusercontent.com/tailwindlabs/tailwindcss/v4.3.3/packages/@tailwindcss-vite/package.json)
declares the peer range `^5.2.0 || ^6 || ^7 || ^8`, which includes this repository's
Vite `8.2.2`.

The implementation seam is therefore small:

1. Add one exact, mutually compatible `tailwindcss` and `@tailwindcss/vite` version as
   build-time dependencies and add `tailwindcss()` to the existing Vite plugin list.
   The version must be pinned in `package.json` and `bun.lock`; do not use an
   unconstrained install that can select an older plugin whose Vite peer range stops
   at Vite 7.
2. Create one canonical CSS entrypoint under the shell UI module, for example
   `src/ui/shell/app.css`, and point `components.json` and Oxfmt at that same file.
   Import it once from `frontend/index.html` or `frontend/main.tsx`. The exact location
   can differ, but it must remain inside the UI module boundary and must not result in
   duplicate Tailwind imports.
3. Keep `assets/excalidraw.css` separate. Run a browser regression before deciding
   whether Tailwind Preflight is safe for the existing canvas and shell.

Tailwind's [Preflight documentation](https://tailwindcss.com/docs/preflight) confirms
that `@import "tailwindcss"` injects theme, base, and utilities. It resets margins,
border styles, headings, lists, and image defaults. This is a meaningful integration
risk for an existing Excalidraw surface and a large hand-authored shell stylesheet.
Tailwind officially supports importing theme and utilities without Preflight. For the
first migration slice, omitting Preflight is the lower-risk choice if the current reset
is still authoritative. Enabling full Preflight is also valid, but it must be a
deliberate visual migration with before/after browser evidence, not an incidental side
effect of running `shadcn init`.

Tailwind scans source as plain text and does not understand interpolation or string
concatenation. Its [class detection guidance](https://tailwindcss.com/docs/detecting-classes-in-source-files)
requires complete class names and recommends mapping props to complete static class
strings. This is both a build requirement and a repository convention. It rules out
patterns such as `bg-${tone}-600`; use a typed variant map containing the complete
strings instead.

### shadcn configured for Base UI

The official shadcn [Vite guide](https://ui.shadcn.com/docs/installation/vite) covers
Tailwind 4, Vite, CSS imports, and aliases. The current CLI exposes
`--base <base|radix|aria>` and the official [July 2026 announcement](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default)
makes Base UI the default for new projects while retaining Radix support. Make the
choice explicit in automation with `--base base`, even though Base UI is currently the
default.

`components.json` is optional for copy-and-paste, but required for the CLI. Its official
[schema](https://ui.shadcn.com/schema.json) currently represents the selected visual
preset in `style` values such as `base-nova`, `base-vega`, or another `base-*` value.
The library choice is a CLI/preset choice, not an invented `componentLibrary` field.
The file should contain, at minimum:

- the schema URL;
- the chosen `base-*` style and `rsc: false` for this client-only application;
- `tailwind.config: ""` for Tailwind 4, the path to the one CSS entrypoint,
  `cssVariables: true`, a deliberate `baseColor`, and no prefix unless a concrete
  collision requires one;
- aliases that resolve to the existing `src/ui` modules; and
- an icon strategy that does not silently add `lucide-react` when the existing local
  [`Icons.tsx`](../../src/ui/shell/Icons.tsx) is sufficient.

The shadcn docs state that the `style`, `tailwind.baseColor`, and `cssVariables`
choices are initialization decisions. Choose them only after the token ownership
below is agreed. `cssVariables: true` is the correct direction here because the
operator shell already has light and dark semantic values.

The current project has no aliases. Stock examples assume `@/*` points at a single
`src` tree, but this repository has a Vite root at `frontend/`, a browser TypeScript
config separate from the root config, and implementation under `src/ui`. Do not copy
the stock alias blindly. Either:

- add the same `@/* -> src/*` mapping to every relevant TypeScript config and to Vite,
  using an ESM-safe absolute path; or
- use `package.json#imports` with `#ui`, `#ui-lib`, and similar named roots, enable
  `resolvePackageJsonImports`, and configure the matching `components.json` aliases.

The shadcn [alias documentation](https://ui.shadcn.com/docs/components-json#aliases)
supports both approaches and explicitly requires matching CLI aliases. The package
imports option avoids introducing a broad `@` alias, but either choice is acceptable
only if `bun run type-check` and `bun run build` resolve the same imports.

Generated source is application source. The official Tailwind 4 notes say shadcn code
is what the application would write itself, with no hidden abstraction. The Base UI
Button source currently published by shadcn demonstrates the boundary: it imports
`Button` from [`@base-ui/react/button`](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/bases/base/ui/button.tsx),
uses `class-variance-authority`, and combines variants through a local `cn` helper.
The Base UI Dialog source similarly imports [`@base-ui/react/dialog`](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/bases/base/ui/dialog.tsx)
and composes copied parts. Review and adapt each copied file to Archboard's tokens,
module boundary, and product semantics. Do not add every available component or
overwrite modified files with `add --all --overwrite`.

### Runtime and development dependencies

The smallest dependency set is determined by the selected copied files, not by the
generic manual-install command.

| Package                    | Role                                                                      | Initial recommendation                                                                                                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tailwindcss`              | Build-time compiler and theme source                                      | Add as an exact dev dependency alongside the matching Vite plugin.                                                                                                                                                               |
| `@tailwindcss/vite`        | Vite build integration                                                    | Add as an exact dev dependency; current source supports Vite 8.                                                                                                                                                                  |
| `@base-ui/react`           | Browser runtime primitives                                                | Add only when the first Base UI primitive is adopted. It exports component subpaths and is tree-shakable.                                                                                                                        |
| `clsx`                     | Runtime class composition used by the usual `cn` helper                   | Add if the copied helper uses it.                                                                                                                                                                                                |
| `tailwind-merge`           | Runtime conflict-aware class merging used by the usual `cn` helper        | Add if the copied helper uses it. The current shadcn CLI also depends on it internally, but do not rely on the CLI package as an application import.                                                                             |
| `class-variance-authority` | Runtime variant recipes used by official shadcn primitives such as Button | Add only if the selected source imports `cva`.                                                                                                                                                                                   |
| `lucide-react`             | Runtime icon implementation in the standard shadcn preset                 | Omit initially; the repository already owns a typed SVG icon module. Add only when a selected copied component actually requires it and the icon decision is explicit.                                                           |
| `tw-animate-css`           | Optional animation utilities in the generic manual setup                  | Omit unless a reviewed component needs its classes. The reference direction favors restrained motion and no glow.                                                                                                                |
| `shadcn`                   | CLI and registry resolver                                                 | Keep dev-only and pin its version if installed. The current package manifest is `4.19.0` and declares Node `>=20.18.1`; run a Bun smoke test before making it a required developer command. It is not a browser runtime library. |

Base UI's [quick start](https://base-ui.com/react/overview/quick-start) confirms that
all components ship in one tree-shakable package and that Base UI is unstyled and can
be used with Tailwind, plain CSS, or other styling systems. Its current package
manifest at [v1.7.0](https://raw.githubusercontent.com/mui/base-ui/master/packages/react/package.json)
declares React and React DOM peer support through React 19. Its runtime dependencies
include `@base-ui/utils`, Floating UI packages, `@babel/runtime`, and
`use-sync-external-store`; those transitive packages are part of the lockfile graph
even though the application adds `@base-ui/react` directly. Verify the actual graph
and bundle output after the first primitive rather than assuming a single-package
runtime cost.

## Token and visual strategy

Keep the existing app semantic values as the canonical design input while the visual
migration is in progress. The current shell defines names such as `--ink`, `--muted`,
`--border`, `--paper`, `--surface`, `--surface-raised`, `--accent`, `--danger`, and
light/dark overrides on `.shell[data-theme="dark"]`. The implementation may rename
them to an explicit namespace such as `--arch-ink` and `--arch-paper` to prevent
collisions, but it must not create a second, competing palette in generated component
files.

Expose only semantic aliases through Tailwind's theme namespace. Tailwind's
[theme-variable documentation](https://tailwindcss.com/docs/theme) says that
`@theme` variables create utility APIs and that `@theme inline` is required when the
theme value references another variable. Its [color example](https://tailwindcss.com/docs/colors#referencing-other-variables)
uses a light/dark selector plus `@theme inline`, which maps directly to Archboard's
`data-theme` state.

The shape should be equivalent to the following, with values owned by the app token
block rather than copied into each primitive:

```css
:root {
	--arch-paper: /* light canvas */;
	--arch-surface: /* light panel */;
	--arch-ink: /* light text */;
	--arch-muted: /* light secondary text */;
	--arch-border: /* light rule */;
	--arch-accent: /* cobalt/selection or approved accent */;
	--arch-accent-ink: /* readable accent foreground */;
	--arch-danger: /* error */;
}

[data-theme="dark"] {
	--arch-paper: /* dark canvas */;
	--arch-surface: /* dark panel */;
	--arch-ink: /* dark text */;
	/* remaining semantic overrides */
}

@theme inline {
	--color-background: var(--arch-paper);
	--color-foreground: var(--arch-ink);
	--color-card: var(--arch-surface);
	--color-border: var(--arch-border);
	--color-primary: var(--arch-accent);
	--color-primary-foreground: var(--arch-accent-ink);
	--color-destructive: var(--arch-danger);
}
```

This is a mapping pattern, not a request to choose new colors in the adoption task.
The actual values must follow the approved operator reference, including cobalt and
acid-lime accents, once the visual migration changes the old neutral/brass values.
Use semantic utilities such as `bg-background`, `text-foreground`,
`text-muted-foreground`, `border-border`, and `bg-primary`; do not scatter default
palette names through shell code. Keep font, spacing, radius, and shadow tokens in
the same canonical CSS source. Small radii and restrained shadow values should make
the reference direction easy to follow, while utility availability should not be an
excuse to introduce rounded cards or decorative effects.

Avoid generic shadcn variable names as the only source of truth if they collide with
the existing shell. Namespaced app variables plus a small semantic alias layer make
ownership clear and let the `data-theme` selector continue to drive both themes.

## Class composition and drift controls

### What Oxfmt can enforce

Oxfmt's [sorting documentation](https://oxc.rs/docs/guide/usage/formatter/sorting)
and [configuration reference](https://oxc.rs/docs/guide/usage/formatter/config-file-reference#sorttailwindcss)
confirm that Tailwind utility sorting is built in, based on
`prettier-plugin-tailwindcss`, and disabled by default. The object form accepts a v4
`stylesheet` path, exact-match custom `functions`, additional exact-match `attributes`,
and whitespace/duplicate options. The future configuration should point at the
canonical CSS entrypoint and list every composition helper actually used, for example
`cn`, `clsx`, `cva`, and `twMerge`. The function list is exact-match; regex patterns are
not supported.

The repository already runs the npm package through Bun, not the standalone binary.
That distinction matters: Oxfmt's [quick start](https://oxc.rs/docs/guide/usage/formatter/quickstart)
says the standalone binary does not support Tailwind sorting, while the package does.
Keep `bun run fmt:check` as the enforcement command. Add a small formatter fixture for
`className`, `cn`, and `cva` before relying on the option, so a future Oxfmt upgrade
cannot silently stop sorting the forms used by this codebase.

Oxfmt sorting is normalization, not a design policy. It does not prove that a class
exists, that two classes do not contradict each other, or that an arbitrary value is
justified.

### What Oxlint does not currently enforce

The official [Oxlint rule catalog](https://oxc.rs/docs/guide/usage/linter/rules.html)
has no Tailwind-specific rule family. The inspected pinned `oxlint@1.80.0` configuration
schema likewise has no Tailwind setting or rule name. Do not invent a native rule in
`.oxlintrc.jsonc` or describe Oxfmt's sorter as an Oxlint check.

Oxlint can load ESLint-compatible JS plugins, but its official [JS plugin documentation](https://oxc.rs/docs/guide/usage/linter/js-plugins.html)
labels that API alpha and under active development. The existing local JS plugin is
not evidence that a third-party Tailwind plugin is a stable repository contract. Do
not make an external Tailwind plugin through `jsPlugins` the first acceptance gate.

### Additive drift policy

The first Tailwind slice should add a narrow repository-policy owner, scoped to the
new or migrated UI directories. It should fail on machine-observable conventions
that protect the reference and the compiler:

- no interpolated Tailwind fragments such as `bg-${value}`; variant props map to
  complete, statically present class strings;
- no arbitrary color, spacing, radius, or shadow values in migrated component class
  strings unless the rule has a named allowlist entry and a reason;
- no raw color literals in migrated TSX class/style values; colors belong in the
  canonical token CSS;
- no inline style for fixed presentation; allow an explicit, documented exception for
  runtime geometry or measurements that cannot be represented by a utility;
- conditional class composition goes through the one shared `cn` helper (and
  `cva` for typed variants), rather than ad hoc concatenation; and
- the canonical stylesheet contains the required token aliases exactly once.

Keep the policy scoped to new code initially. A repository-wide ban would turn a
useful migration guard into an unrelated rewrite of the existing shell. The test must
include bad fixtures and report the file and violated convention, so it fails on the
old behavior and stays stable across unrelated formatting changes.

If the project needs compiler-aware checks for unknown or contradictory utilities,
the direct maintained alternative reviewed here is
[`eslint-plugin-tailwindcss` v4](https://github.com/francoismassart/eslint-plugin-tailwindcss/tree/v4).
Its own rule list includes `no-arbitrary-value`, `no-custom-classname`,
`no-contradicting-classname`, `no-unnecessary-arbitrary-value`, canonical spelling,
and class ordering. Its v4 README requires a Tailwind 4 CSS configuration path and
supports ESLint 10. This is an external ESLint lane, not an Oxlint feature. Add it only
if the repository-owned policy is insufficient, pin exact versions, run it as an
explicit additive `lint:tailwind` command, and include a compatibility fixture for
the copied Base UI source. Do not weaken Oxlint, Oxfmt, or any existing test lane to
make the plugin pass. The alternative adds a second linter and therefore is not the
smallest first step.

## Accessibility boundary

Base UI supplies substantial interaction behavior. Its official
[accessibility guidance](https://base-ui.com/react/overview/accessibility) says that
components handle many ARIA and role attributes, pointer interactions, keyboard
navigation, and focus management, and follow WAI-ARIA Authoring Practices. The
library's tested primitives are valuable leverage for dialogs, menus, popovers, and
other composite controls.

Base UI does not make the application accessible automatically. The same guidance
assigns the application responsibility for:

- visible `:focus` or `:focus-visible` treatment;
- foreground/background contrast;
- accessible names and labels (`label`, `alt`, `aria-label`, or
  `aria-labelledby` as appropriate);
- meaningful content, error messages, and status announcements; and
- testing the composition, not only the primitive in isolation.

The Base UI quick start also requires an isolation stacking context for application
roots when portals are used, so dialogs and popovers remain above page content. Add
that root contract deliberately and test it against Excalidraw's layering. Do not
keep a hand-rolled dialog and a Base UI dialog active for the same product behavior:
choose one owner per primitive, then preserve the current Escape, focus, and focus
return behavior through a browser check.

For every migrated or new interactive surface, browser acceptance should cover a
keyboard-only path, visible focus in both themes, accessible names, disabled and
error states, dialog/menu focus return, and narrow viewport behavior. Existing
`jsx-a11y` lint remains useful but cannot observe focus order, portal stacking, or the
operator's rendered visual hierarchy.

## Canonical and reproducible artifacts

| Artifact                                                    | Ownership                                                                                                                                                                           |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json` and `bun.lock`                               | Canonical exact dependency and tool versions.                                                                                                                                       |
| `vite.config.js`                                            | Canonical Vite/Tailwind plugin and alias integration.                                                                                                                               |
| `components.json`                                           | Canonical shadcn CLI choices, Base UI style, CSS entrypoint, aliases, and CSS-variable policy. It is optional only when the team intentionally uses copy-and-paste without the CLI. |
| Canonical app CSS and token block                           | Canonical visual input. Keep semantic values and `@theme inline` mappings here, not in generated output.                                                                            |
| Copied shadcn/Base UI source and `cn`/variant helpers       | Canonical application code after review. Generated source is not disposable vendor cache.                                                                                           |
| Oxfmt config, repository policy test, docs, browser owners  | Canonical repository contracts.                                                                                                                                                     |
| `node_modules`, `dist/frontend`, Vite caches, generated CSS | Reproducible and ignored. A build must recreate them from the lockfile and source.                                                                                                  |
| Registry JSON payloads and network responses                | Inputs to a deliberate copy operation, not the application source of truth. Review each file and dependency before committing it.                                                   |
| `shadcn` CLI package/cache                                  | Reproducible tool input. Pin its version and registry/ref; never use `shadcn@latest` in a script or CI path.                                                                        |

The shadcn registry schema separates copied files from package `dependencies`,
`devDependencies`, and `registryDependencies`; see the official
[registry item specification](https://ui.shadcn.com/docs/registry/registry-item-json).
That separation is a review checklist, not a reason to assume a registry item is
free. A copied component's package imports remain part of the browser dependency
graph. When a registry dependency points to GitHub or another registry, pin a tag or
full commit where the CLI supports it and record the source in the review.

## Acceptance gates for implementation

These gates are additive. The existing `bun run check` command must continue to run
unchanged in substance: Oxlint, Oxfmt check, strict type checks, all native test lanes,
and the serial browser lane. No existing warning, lint rule, type rule, or browser
owner may be disabled to admit Tailwind or copied source.

1. **Dependency and resolver gate.** Exact Tailwind/plugin versions install with Bun;
   `@base-ui/react` and every copied source import resolve; the shadcn CLI runs once
   with the chosen Base UI option; `bun run type-check` passes for both TypeScript
   configs; and `bun run build:frontend` succeeds from the repository root.
2. **CSS compiler gate.** There is one canonical Tailwind entrypoint, its configured
   `@theme inline` aliases compile, a fixture utility appears in the built CSS, and
   the build contains no accidental duplicate entrypoint. If Preflight is enabled,
   the fixture and browser regression explicitly cover its reset effects.
3. **Formatter gate.** Oxfmt's configured Tailwind sorter changes a deliberately
   misordered `className`, `cn`, and `cva` fixture; `bun run fmt:check` rejects the
   unformatted fixture and accepts the formatted result. The package implementation,
   not a standalone Oxfmt binary, must be used.
4. **Class policy gate.** The scoped repository-policy owner rejects dynamic class
   fragments, forbidden arbitrary values, raw token literals, and direct fixed inline
   styles; it accepts complete static variant maps and documented runtime geometry.
   If the ESLint alternative is later added, its own bad fixtures must prove unknown,
   contradictory, and unnecessary arbitrary classes before it becomes required.
5. **Product and accessibility gate.** The changed primitive is reachable through the
   existing shell, has semantic names and visible focus, supports the expected
   keyboard interaction, and does not create a duplicate dialog, popup, or state
   owner. Any selection/focus presentation remains browser-only and does not write a
   board note.
6. **Rendered visual gate.** Run the serial browser lane in both themes at a desktop
   viewport and 420 pixels. Confirm that the canvas keeps the largest share, the board
   strip/inspector/workbench hierarchy remains legible, the old product actions remain
   reachable, and the result follows the reference's flat dense visual direction.
   Compare against the reference image as a design authority, not as a pixel-perfect
   screenshot test.
7. **Full regression gate.** Run `bun run check`, including the fixed-point,
   human-edit, focus/hold, and other existing owners. A UI styling change must not
   alter note bytes, server write counts, Excalidraw round-trip behavior, or the
   no-stale-source rules.

## Guidance to add for future UI workers

The durable agent-facing guidance should require the following sequence:

1. Read `docs/design/operator-canvas-shell.md`, this note, and
   `docs/agents/boundaries.md` before touching UI. Treat the reference image and its
   written visual direction as authoritative, while preserving the documented product
   contracts.
2. Use Tailwind utilities for new composition, but keep semantic token definitions in
   the canonical CSS entrypoint. Prefer named semantic utilities over default palette
   colors and arbitrary values.
3. Use the configured `cn` helper and typed `cva` recipes. Write complete static
   class maps; never construct utility names by interpolation. Run Oxfmt rather than
   hand-ordering classes.
4. Add one Base UI primitive at a time through the pinned shadcn CLI with the explicit
   Base UI choice. Read the generated registry item, dependencies, and source before
   accepting it. Put copied code under a named `src/ui/<module>` boundary and expose
   it through that module's entrypoint.
5. Treat copied code as owned source. Adapt its classes and semantics to Archboard;
   do not overwrite local changes from a registry update and do not add generic cards,
   gradients, glow, large radii, or a second icon system because a preset contains
   them.
6. Keep presentation state in the browser. Do not make styling, selection,
   responsive layout, or focus mode write to the board note or alter the canvas
   synchronization contract.
7. Before handoff, run the focused type/build checks, `bun run fmt:check`,
   `bun run lint`, the relevant browser owner through the serial adapter, and finally
   `bun run check`. Register any new browser owner in the existing inventory instead
   of invoking it directly.

## Primary sources checked

- Tailwind: [Vite installation](https://tailwindcss.com/docs/installation/using-vite),
  [v4 announcement](https://tailwindcss.com/blog/tailwindcss-v4),
  [class detection](https://tailwindcss.com/docs/detecting-classes-in-source-files),
  [theme variables](https://tailwindcss.com/docs/theme),
  [colors and variable aliases](https://tailwindcss.com/docs/colors), and
  [Preflight](https://tailwindcss.com/docs/preflight).
- shadcn: [Vite setup](https://ui.shadcn.com/docs/installation/vite),
  [components.json](https://ui.shadcn.com/docs/components-json),
  [Tailwind 4](https://ui.shadcn.com/docs/tailwind-v4),
  [CLI](https://ui.shadcn.com/docs/cli),
  [Base UI default announcement](https://ui.shadcn.com/docs/changelog/2026-07-base-ui-default),
  [registry item schema](https://ui.shadcn.com/docs/registry/registry-item-json),
  [current schema](https://ui.shadcn.com/schema.json),
  [Base UI Button source](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/bases/base/ui/button.tsx),
  [Base UI Dialog source](https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/registry/bases/base/ui/dialog.tsx), and
  [CLI package manifest](https://raw.githubusercontent.com/shadcn-ui/ui/main/packages/shadcn/package.json).
- Base UI: [quick start](https://base-ui.com/react/overview/quick-start),
  [accessibility](https://base-ui.com/react/overview/accessibility),
  [releases](https://base-ui.com/react/overview/releases), and
  [package manifest](https://raw.githubusercontent.com/mui/base-ui/master/packages/react/package.json).
- Oxc: [Oxfmt sorting](https://oxc.rs/docs/guide/usage/formatter/sorting),
  [Oxfmt configuration](https://oxc.rs/docs/guide/usage/formatter/config-file-reference),
  [Oxfmt quick start](https://oxc.rs/docs/guide/usage/formatter/quickstart),
  [Oxlint rules](https://oxc.rs/docs/guide/usage/linter/rules.html), and
  [Oxlint JS plugins](https://oxc.rs/docs/guide/usage/linter/js-plugins.html).
- Optional external alternative: [eslint-plugin-tailwindcss v4 rule source](https://github.com/francoismassart/eslint-plugin-tailwindcss/tree/v4).
