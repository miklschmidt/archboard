# Vendored reading copies

Not compiled, not imported, not shipped. Source read while making a decision,
kept so the decision can be checked against what was actually read.

## ExcalidrawData.ts

From the Obsidian Excalidraw plugin (`zsviczian/obsidian-excalidraw-plugin`),
fetched 2026-08-21 while working out what a note's `## Embedded Files` section
is for (TASK-085, ADR 0017).

**No version was recorded when it was fetched**, which is TASK-087. The
identification of the repository is read off the file's contents rather than
from a URL anybody wrote down, so treat it as very likely rather than certain.

What ADR 0017 relies on, all of it in this file:

- `syncFiles` writes every entry of a scene's `files` out as an ordinary vault
  file, and `syncElements` then empties `files` outright.
- `generateMDBase` emits the `## Embedded Files` heading, one `<id>: <target>`
  line per entry.
- `loadData` finds that heading and parses the lines under it.
- `## Element Links`, the neighbouring section, is rebuilt from the elements'
  own `link` fields — which is why ADR 0017 preserves one section and
  regenerates the other.
