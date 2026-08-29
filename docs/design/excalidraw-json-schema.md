---
status: measured
---

# Does Excalidraw publish a JSON Schema?

## Answer

No. Upstream does not publish a complete, machine-readable JSON Schema for the persisted/exported
scene format. Upstream publishes a page called [JSON Schema][doc], but the
page is prose plus an illustrative JSON-like example. It is not a draft-schema
document consumable by validators: the example contains comments and `...`, and
has no `$schema`, JSON Schema keywords, definitions, or element-property
constraints.

This conclusion is based on the current `excalidraw/excalidraw` tree at
commit [`e1bb9ff8f8931e783c11d104abb8967ac6605c9a`][commit] (2026-08-28).
The tree has `dev-docs/docs/codebase/json-schema.mdx`, but no dedicated
`*.schema.json`, `schema.json`, or equivalent validator schema. File names
containing "schema" elsewhere refer to prose or internal concepts (for
example, binding schema migration), not a published scene JSON Schema.

## What upstream actually provides

1. **Format documentation and examples.** The page documents the top-level
   `.excalidraw` keys (`type`, `version`, `source`, `elements`, `appState`,
   `files`) and a separate clipboard shape. Its "JSON Schema example" is
   intentionally abbreviated and is invalid JSON because it includes comments
   and ellipses. [Source: `dev-docs/docs/codebase/json-schema.mdx`][doc]

2. **TypeScript types.** `packages/excalidraw/data/types.ts` defines
   `ExportedDataState`, `ImportedDataState`, and library-data interfaces. These
   are compile-time contracts, not runtime JSON Schema; notably the exported
   type uses broad `string`/`number`, `ExcalidrawElement[]`, and
   `BinaryFiles | undefined`, while imported data is deliberately partial and
   nullable. [Source: `data/types.ts`][types]

   Element structure is likewise expressed through TypeScript unions and
   intersections in `packages/element/src/types.ts`, including a common base
   and per-element variants. [Source: `element/src/types.ts`][element-types]

3. **Serialization and a shallow runtime guard.** `serializeAsJSON()` builds
   the exported object, cleans `appState`, filters local files, and calls
   `JSON.stringify`. `isValidExcalidrawData()` checks only that `type` is the
   Excalidraw type and that `elements` is an array (if present) and `appState`
   is an object (if present); it does not validate element fields, files,
   version, or the complete document shape. `loadFromBlob()` then restores and
   repairs the accepted values. [Source: `data/json.ts`][json],
   [`data/blob.ts`][blob]

4. **API documentation for helpers.** The official API docs describe
   `serializeAsJSON()` and `loadFromBlob()` and their TypeScript signatures,
   but do not provide a validator schema. [Source: API utils docs][api]

## Implication for Archboard

Archboard should derive the persisted element type from upstream's TypeScript
types. Those types provide compile-time authority, not runtime validation. Use
Excalidraw's serializer, restore logic, renderer, and documented examples as
behavioral references, and keep Archboard's own runtime schemas for untrusted
data and genuinely local input formats. Round-trip tests remain the
compatibility check where types cannot express Excalidraw's behavior. Calling
any locally generated contract "the Excalidraw JSON Schema" would overstate
upstream support.

The remaining uncertainty is version drift: Excalidraw may add a formal schema
in a future commit or package release. Recheck the upstream tree and the
version pinned by Archboard when upgrading the dependency.

## Pinned 0.18.1 declaration exception

The published 0.18.1 element declaration imports `LocalPoint` and `Radians`
from `@excalidraw/math`, but that module is absent from the package. With
`skipLibCheck`, those two fields otherwise project as `any`. Archboard's
`src/shared/board-elements/vendor-math-0.18.1.d.ts` supplies only the two exact
0.18.1 branded spellings. The JSON-writable projection removes their brands;
the repository-policy owner rejects any additional ambient export or spelling
drift. Remove or revise this exception only as part of a pinned dependency
upgrade that makes the public declarations self-contained.

[doc]: https://github.com/excalidraw/excalidraw/blob/master/dev-docs/docs/codebase/json-schema.mdx
[commit]: https://github.com/excalidraw/excalidraw/tree/e1bb9ff8f8931e783c11d104abb8967ac6605c9a
[types]: https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/data/types.ts
[element-types]: https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts
[json]: https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/data/json.ts
[blob]: https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/data/blob.ts
[api]: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/utils-intro
