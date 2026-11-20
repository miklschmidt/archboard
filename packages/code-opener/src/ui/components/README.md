# The opener choice's radio group

`radio-group.tsx` is the official shadcn `radio-group` registry item, style `base-nova`,
generated with the pinned CLI (`shadcn` 4.23.0) from preset
[`b3QvqlIdU`](https://ui.shadcn.com/create?preset=b3QvqlIdU) on 2026-09-05 with the shared kit's
other items. `OpenerChoiceGroup.tsx` is its one caller and draws its two parts, `RadioGroup` and
`RadioGroupItem`, so the file lives beside it
([ADR 0093](../../../../../docs/adr/0093-a-registry-item-with-one-caller-lives-beside-it.md)).

| Item          | Registry path                           | Content digest     |
| ------------- | --------------------------------------- | ------------------ |
| `radio-group` | `registry/base-nova/ui/radio-group.tsx` | `f779542f2370b82f` |

The digest is the SHA-256 (first 16 hex) of the item's file content as served by
`https://ui.shadcn.com/r/styles/base-nova/radio-group.json` at generation time.

The file keeps the registry's markup, focus handling and state mechanics. Its local changes are
the shared kit's (`packages/ui-kit/src/ui/shadcn/components/README.md`): theme tokens and `cn`
from `@archboard/ui-kit/components` in place of the bare `cn` package. Its lint policy is the
exact-file shadcn override at the end of `.oxlintrc.jsonc`.

To regenerate it, compare the registry's bytes with
`bun run shadcn add radio-group --diff`. The CLI writes a `ui` item to the `ui` alias of
`components.json`, which names the shared kit, and it ignores `-p` for such an item, so apply the
change here by hand.
