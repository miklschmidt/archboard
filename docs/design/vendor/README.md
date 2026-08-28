# Vendored reading copies

Not compiled, not imported, not shipped. Source read while making a decision,
kept so the decision can be checked against what was actually read.

## ExcalidrawData.ts

`docs/design/vendor/ExcalidrawData.ts` is a reading copy of the Obsidian
Excalidraw plugin source used by [ADR 0017](../../adr/0017-a-note-keeps-its-own-record-of-where-its-images-went.md).

### Pinned provenance

- Repository: `https://github.com/zsviczian/obsidian-excalidraw-plugin`
- Commit: [`36a32940bac50fd60fb379b18a9f38668f941108`](https://github.com/zsviczian/obsidian-excalidraw-plugin/commit/36a32940bac50fd60fb379b18a9f38668f941108)
- Plugin version: `2.26.4`, from the pinned [`manifest.json`](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/manifest.json)
- Upstream path: [`src/shared/ExcalidrawData.ts`](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts)
- Pinned and checked: 2026-08-28

The local file remains a reading copy. Its formatting is not source identity,
and it must not be compiled or imported into archboard.

### Behaviors used by ADR 0017

All source links below point at the pinned commit.

- `loadData` [lines 539-925](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L539-L925) reads the data region, including `## Embedded Files`, its legacy heading, file links, external links, equations, and Mermaid records.
- `generateMDBase` [lines 1379-1467](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1379-L1467) writes `## Embedded Files` entries and builds the scene JSON for the Drawing payload. `generateMDAsync` and `generateMDSync` [lines 1470-1495](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1470-L1495) wrap that JSON in the Drawing section and return the note data.
- `syncFiles` [lines 1599-1745](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1599-L1745) removes records no longer used by image elements and writes new scene file data to vault files.
- `syncElements` [lines 1747-1766](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1747-L1766) calls `syncFiles` and then clears `scene.files` after the bytes have been written to disk.
- Element Links have a bidirectional lifecycle. `loadData` parses the persisted section and applies entries to matching scene elements at [lines 772-856](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L772-L856). `findNewElementLinksInScene` only adds missing links at [lines 1034-1058](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1034-L1058). During sync and save, `syncElements` runs `updateElementLinksFromScene` and then `findNewElementLinksInScene` at [lines 1747-1766](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1747-L1766); `updateElementLinksFromScene` reconciles existing entries at [lines 1114-1127](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1114-L1127); and `generateMDBase` emits the current map at [lines 1407-1415](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1407-L1415).

### Evidence boundary

The pinned upstream tree contains no committed `.excalidraw.md` note. No exact
plugin-authored note from version 2.26.4 was found in the available local
material. The [public v2.19.0 issue attachment](https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/2594)
is not evidence for the pinned version and is not copied here.

The examples in `scripts/check-obsidian-md.mjs` are Archboard-authored and
synthetic. They protect Archboard's parser and round-trip behavior, but they do
not detect drift in bytes emitted by a real plugin version. This task adds no
fixture, Obsidian automation, plugin runner, or second format implementation.
