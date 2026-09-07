# Shared shadcn Base UI components

Official shadcn registry source, style `base-nova`, generated with the pinned
CLI (`shadcn` 4.21.0, see package.json) from preset
[`b3QvqlIdU`](https://ui.shadcn.com/create?preset=b3QvqlIdU) on 2026-09-05
with `iconLibrary: remixicon`, so the CLI wrote `@remixicon/react` imports.
Class merging is the registry's own `cn` engine, configured once in
`src/ui/components/class-names.ts` (through its official `createCn`, the
`utils` alias in `components.json`) so the Archboard type
roles `text-kicker`, `text-technical`, `text-body`, `text-control`,
`text-title` and `text-board` merge as font sizes rather than colours; the
components import `cn` from there.

Root files here are the public component entrypoints. Product behaviour never
lives in this module: feature modules compose these controls and keep their
own state. Allowed local changes are theme tokens, Tailwind classes, size and
colour variants, Remix imports and import paths. Markup, focus handling,
keyboard behaviour and state mechanics stay official.

The lint policy for exactly these files is the override at the end of
`.oxlintrc.jsonc` (TASK-150.02): compiler, type-aware safety, React
correctness and accessibility checks stay on; authored-code style,
module-layout and file-length rules are off. Regenerate that list when a
component is added or removed.

## Registry digests

SHA-256 (first 16 hex) of each item's file content as served by
`https://ui.shadcn.com/r/styles/base-nova/<name>.json` at generation time.

| Item            | Registry path                             | Content digest     |
| --------------- | ----------------------------------------- | ------------------ |
| `button`        | `registry/base-nova/ui/button.tsx`        | `313353436d0fcc8e` |
| `badge`         | `registry/base-nova/ui/badge.tsx`         | `d9fb280e266119c4` |
| `separator`     | `registry/base-nova/ui/separator.tsx`     | `9a80ff8c110e0c55` |
| `tooltip`       | `registry/base-nova/ui/tooltip.tsx`       | `f83d5f511812573f` |
| `dialog`        | `registry/base-nova/ui/dialog.tsx`        | `5be79d2cf2d2152a` |
| `alert-dialog`  | `registry/base-nova/ui/alert-dialog.tsx`  | `c84bd1caf46c3e7b` |
| `alert`         | `registry/base-nova/ui/alert.tsx`         | `f253568242c1c69b` |
| `input`         | `registry/base-nova/ui/input.tsx`         | `dab990dfefa0ba78` |
| `textarea`      | `registry/base-nova/ui/textarea.tsx`      | `82601c91ffc6c727` |
| `field`         | `registry/base-nova/ui/field.tsx`         | `d8a8444942021d02` |
| `label`         | `registry/base-nova/ui/label.tsx`         | `b3b7b21d2877838f` |
| `select`        | `registry/base-nova/ui/select.tsx`        | `6918ba753234e510` |
| `combobox`      | `registry/base-nova/ui/combobox.tsx`      | `0df11848e07ee063` |
| `input-group`   | `registry/base-nova/ui/input-group.tsx`   | `d6c74e82a2aa0298` |
| `checkbox`      | `registry/base-nova/ui/checkbox.tsx`      | `0cc30ddee3fa9381` |
| `radio-group`   | `registry/base-nova/ui/radio-group.tsx`   | `f779542f2370b82f` |
| `collapsible`   | `registry/base-nova/ui/collapsible.tsx`   | `ead4349ff7b01d69` |
| `tabs`          | `registry/base-nova/ui/tabs.tsx`          | `958b817b256cffae` |
| `toggle-group`  | `registry/base-nova/ui/toggle-group.tsx`  | `143ec051e67e2d31` |
| `dropdown-menu` | `registry/base-nova/ui/dropdown-menu.tsx` | `ba92acc16e141ad7` |
| `sidebar`       | `registry/base-nova/ui/sidebar.tsx`       | `d08ce0624ed0a9a5` |
| `sheet`         | `registry/base-nova/ui/sheet.tsx`         | `7db65922fb40d9a1` |
| `skeleton`      | `registry/base-nova/ui/skeleton.tsx`      | `4c2af7fa9c645358` |
| `toggle`        | `registry/base-nova/ui/toggle.tsx`        | `48ab6456afc25c4c` |
| `use-mobile`    | `registry/base-nova/hooks/use-mobile.ts`  | `ad0936f84f1df79d` |

## Local deviations from the registry bytes

Each keeps the official behaviour and exists to satisfy a retained safety or
correctness check rather than a style rule.

- `field.tsx`: error list keys by the already-unique message instead of the
  array index; one redundant optional chain removed.
- `use-mobile.ts`: the media-query hook reads through `useSyncExternalStore`
  instead of setting state inside an effect. Same boolean, same breakpoint.
- `toggle-group.tsx`: the context value is memoised.
- `input-group.tsx`: the addon click narrows `event.target` with
  `instanceof HTMLElement` instead of an assertion; its pointer-only focus
  convenience carries a documented statement-level accessibility suppression.
- `label.tsx`: one documented statement-level suppression for the
  association rule, which cannot see the spread `htmlFor`.
- Every file: `cn` comes from `@/ui/components/class-names` (see above) instead of the
  bare `cn` package. Same engine, same semantics, plus the six type roles.
- `tooltip.tsx`: the positioner is `pointer-events-none`, so a tooltip that is
  closing or open on focus never swallows a click meant for a neighbour.
- `badge.tsx`: a `size` axis (`default`, `technical`, `chip`) beside the
  official variants; every official variant is untouched.
- `sidebar.tsx`, `toggle-group.tsx`: CSS custom properties in `style` are
  typed by `css-custom-properties.d.ts` instead of `as React.CSSProperties`.
