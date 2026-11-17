# Detect board write conflicts rather than prevent them

[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) retires board
writes. For the canonical model, the read token of
[ADR 0066](0066-canonical-model-reads-keep-legacy-authority-explicit.md) covers
the exact bytes that a write expects.

When it loads a board file, archboard records the file's hash. Before every
write, archboard makes sure that the file still has that hash. If the file
changed underneath, archboard refuses the write and reports the conflict. It
does not lock, and it does not reload.

Boards are shared with writers that do not know about archboard: Obsidian, a
sync client, and `git pull`. Last-writer-wins silently eats hand-arranged work.
That is the one failure mode a board cannot tolerate. The Obsidian Excalidraw
plugin has a documented class of this data loss
([#1189](https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/1189)).

## Considered Options

The first option was convention only. Archboard owns a board while it is open,
and Obsidian is for reading and prose. It was rejected as the whole answer,
because it fails silently the first time someone forgets.

The second option was file-watch and reload. It was rejected. Excalidraw scenes
do not merge meaningfully, so this discards whatever the canvas held. It swaps
which side loses work silently rather than fixing anything.

The third option was a version number in the frontmatter, compared instead of
the hash. It was rejected, and it fails in the direction that costs work. Both
Obsidian and archboard carry unknown frontmatter keys across a save verbatim. So
a foreign edit leaves the number exactly where it was, and archboard overwrites.
`git pull` can also move a note backwards to a lower number. The hash needs
nobody's cooperation, because it is a property of the bytes.

## Consequences

Saving can fail, so every write path needs a conflict outcome rather than a
boolean. The human chooses: reload and lose local changes, overwrite and lose
theirs, or save elsewhere. Archboard never picks for them.

The check prevents nothing. Two writers can still both have a board open. That
is deliberate. The goal is that no edit disappears without someone being told.
