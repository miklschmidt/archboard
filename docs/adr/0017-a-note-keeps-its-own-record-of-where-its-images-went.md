# A note keeps its own record of where its images went

A board is a note in an Obsidian vault, and Obsidian's own Excalidraw plugin
opens that note as a drawing. Both tools write it.

The two disagree about where a picture lives. archboard keeps a board's images
inside the drawing, as bytes. The plugin does not. The first time it saves a
note it writes every picture out as an ordinary file in the vault, records
under an "Embedded Files" heading which file each image now lives in, and
leaves the drawing carrying no picture bytes at all. Bytes in a drawing are an
input format it accepts and migrates away from.

## Pinned source for this decision

The source read for this decision is the Obsidian Excalidraw plugin at
`https://github.com/zsviczian/obsidian-excalidraw-plugin`, commit
`36a32940bac50fd60fb379b18a9f38668f941108`. Its pinned manifest reports
version `2.26.4`. The reading copy and its source links are recorded in the
[vendor provenance note](../design/vendor/README.md).

The relied-on source regions are:

- `loadData`, [lines 539-925](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L539-L925), reads the data region and the `## Embedded Files` records.
- `generateMDBase`, [lines 1379-1467](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1379-L1467), writes Embedded Files entries and builds the scene JSON for the Drawing payload. `generateMDAsync` and `generateMDSync`, [lines 1470-1495](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1470-L1495), wrap that JSON in the Drawing section and return the note data.
- `syncFiles`, [lines 1599-1745](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1599-L1745), cleans file records and writes new scene files to the vault.
- `syncElements`, [lines 1747-1766](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1747-L1766), clears `scene.files` after syncing.
- Element Links have a bidirectional lifecycle. `loadData` parses the persisted section and applies entries to matching scene elements at [lines 772-856](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L772-L856). `findNewElementLinksInScene` only adds missing links at [lines 1034-1058](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1034-L1058). During sync and save, `syncElements` runs `updateElementLinksFromScene` and then `findNewElementLinksInScene` at [lines 1747-1766](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1747-L1766); `updateElementLinksFromScene` reconciles existing entries at [lines 1114-1127](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1114-L1127); and `generateMDBase` emits the current map at [lines 1407-1415](https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/36a32940bac50fd60fb379b18a9f38668f941108/src/shared/ExcalidrawData.ts#L1407-L1415).

No exact plugin-authored `.excalidraw.md` note from version 2.26.4 was found in
the pinned upstream tree or available local material. The public
[v2.19.0 issue attachment](https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/2594)
is not evidence for this pinned version and is not used. The existing
`scripts/check-obsidian-md.mjs` examples are Archboard-authored and synthetic.
They protect Archboard's parser and round-trip behavior, but they do not detect
drift in real plugin-emitted bytes. This ADR records a source-based contract,
not captured-note coverage.

## Why that is a problem

A save regenerates the drawing and the sections the plugin serialises around
it, which is exactly where that record sits. So opening a board in Obsidian and
then touching it here deleted the only thing that said where its pictures were.
The image files stayed in the vault. Nothing was left able to name them, and
the board came back with holes in it.

Nobody would see it happen. The board looks right until it is reopened, and by
then the note that could have said what went missing has been rewritten.

Today that costs one section on the handful of saves somebody asks for in a
day. Under ADR 0015 every write is a write to the note, so the first box
anybody drags after Obsidian has touched a board destroys the record.

## Considered and rejected

**Write the plugin's shape.** archboard would put a board's pictures into vault
files itself and keep the same record, so both tools would write and read one
format. It is the wrong trade twice over. Where an attachment goes in a vault
is a setting a person makes in Obsidian, so archboard would be guessing at it,
and guessing wrong scatters files through somebody's vault. It also makes
archboard responsible for a migration it has no reason to perform. A board
nobody ever opens in Obsidian would be split across a note and a pile of image
files for no benefit at all.

**Keep writing bytes and merely restore the record.** Two tools then take
turns moving the same picture between two places, and every round trip leaves
it recorded twice, once in each. The note grows, and neither copy is the one to
believe.

## The decision

A note records where each of its images is, once, and that record belongs to
whichever tool wrote it.

A save carries the Embedded Files section across untouched. That is the promise
the frontmatter and a human's prose already have (ADR 0004, TASK-017), and this
was the one place it was not kept. archboard does not write the section and
does not need to understand what is in it.

An image the section names is not written into the drawing again. The section
is where that picture is recorded, so recording it a second time would be two
claims about one thing, which is what ADR 0015 exists to prevent. An image the
section says nothing about is archboard's, and goes into the drawing as before.

**A record nobody can follow is only half of it**, so archboard reads the
section. An image the plugin moved into a vault file is loaded back from that
file when the board opens, and the board renders as it did in Obsidian. A link
with no answer, or with more than one, resolves to nothing rather than to a
guess. The wrong picture on a board is worse than a missing one, because
nobody checks a picture that is there.

## Consequences

Not everything in that section names a file. An equation and a link out to the
web are recorded there too. archboard carries both across and resolves neither.
Fetching the web link is the plugin's job.

**One neighbouring section is deliberately not preserved**, the one recording
which element links where. It is not a sole record: the links live on the
elements in the drawing. On load, `loadData` applies persisted Element Links to
matching elements. During sync and save, `syncElements` reconciles existing
links with the scene, adds missing links, and `generateMDBase` emits the current
map. Keeping a stale copy would put back a link somebody had deleted here,
which is the shape of TASK-028 and TASK-029.

The formats stay independent. archboard writes what it writes, the plugin
writes what it writes, and each keeps the other's record rather than converting
it. Two conversions that have to agree is what ADR 0015 refused, and this is
the same refusal about one section of one note.
