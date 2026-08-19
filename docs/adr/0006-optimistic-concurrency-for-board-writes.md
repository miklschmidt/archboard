# Detect board write conflicts rather than prevent them

Archboard records a board file's hash when it loads it, verifies that hash
before every write, and **refuses the write and reports the conflict** if the
file changed underneath. It does not lock, and it does not reload.

Boards are shared with Obsidian, and neither side knows about the other:
archboard holds the canvas in memory, the Obsidian Excalidraw plugin holds scene
state in memory when a board is open, and a synced vault is effectively a third
writer. Last-writer-wins would silently eat hand-arranged work, which is the one
failure mode a board cannot tolerate — the layout *is* the content, and a person
cannot tell at a glance that a version of it went missing.

This is not theoretical: the Obsidian Excalidraw plugin has a documented class
of data loss where Obsidian Sync overwrites in-progress edits
([#1189](https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/1189)),
with autosave repeatedly implicated.

## Considered Options

- **Convention only** — archboard owns a board while it is open; Obsidian is for
  reading and prose. Kept as the documented convention, but rejected as the
  whole answer: it fails silently the first time someone forgets.
- **File-watch and reload** — watch the board file and reload on external
  change. Rejected. Excalidraw scenes do not merge meaningfully, so this
  discards whatever the canvas held; it swaps which side loses work silently
  rather than fixing anything.

## Consequences

Saving can fail, so every write path needs a conflict outcome rather than a
boolean. The human chooses: reload and lose local changes, overwrite and lose
theirs, or save elsewhere. Archboard never picks for them.

The check is cheap and prevents nothing — two writers can still both have a
board open. That is deliberate. The goal is that no edit disappears without
someone being told.
