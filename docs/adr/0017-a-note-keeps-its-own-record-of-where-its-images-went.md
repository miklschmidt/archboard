# A note keeps its own record of where its images went

A board is a note in an Obsidian vault, and Obsidian's own Excalidraw plugin
opens that note as a drawing. Both tools write it.

The two tools disagree about where an image lives. archboard keeps a board's
images inside the drawing, as bytes. The plugin does not. The first time it
saves a note, it writes every image out as an ordinary file in the vault. It
records under an "Embedded Files" heading which file each image now lives in. It
leaves the drawing with no image bytes at all. Bytes in a drawing are an input
format that the plugin accepts and migrates away from.

## Pinned source for this decision

This decision rests on the source of the Obsidian Excalidraw plugin at
`https://github.com/zsviczian/obsidian-excalidraw-plugin`, commit
`36a32940bac50fd60fb379b18a9f38668f941108`. Its pinned manifest reports version
`2.26.4`.

We found no exact plugin-authored `.excalidraw.md` note from version 2.26.4 in
the pinned upstream tree or available local material. The public
[v2.19.0 issue attachment](https://github.com/zsviczian/obsidian-excalidraw-plugin/issues/2594)
is not evidence for this pinned version, so we do not use it. The existing
`scripts/check-obsidian-md.mjs` examples are Archboard-authored and synthetic.
They protect Archboard's parser and round-trip behavior, but they do not detect
drift in real plugin-emitted bytes. This ADR records a source-based contract,
not captured-note coverage.

## Why that is a problem

A save regenerates the drawing and the sections that the plugin serializes
around it. The record sits exactly there. Opening a board in Obsidian and then
touching it here deleted the only thing that said where its images were. The
image files stayed in the vault. Nothing remained that was able to name them,
and the board came back with holes in it.

Nobody sees it happen. The board looks right until somebody reopens it. By then,
a rewrite replaced the one note that was able to say what went missing.

Today that costs one section on the handful of saves that somebody asks for in a
day. Under ADR 0015, every write is a write to the note. So the first node that
anybody drags after Obsidian touched a board destroys the record.

## Considered and rejected

The first option is to write the plugin's shape. archboard puts a board's images
into vault files itself and keeps the same record. Both tools then write and
read one format. It is the wrong trade twice over.

The first reason is that where an attachment goes in a vault is a setting that a
user makes in Obsidian. So archboard guesses at it, and a wrong guess scatters
files through somebody's vault. The second reason is that this option makes
archboard responsible for a migration that it has no reason to perform. A board
that nobody ever opens in Obsidian splits across a note and a pile of image
files for no benefit at all.

The second option is to keep writing bytes and only restore the record. Two
tools then take turns moving the same image between two places. Every round trip
leaves it recorded twice, once in each. The note grows, and neither copy is the
one to believe.

## The decision

A note records where each of its images is, once, and that record belongs to
whichever tool wrote it.

A save carries the Embedded Files section across untouched. The frontmatter and
a human's prose already have that promise (ADR 0004, TASK-017). This section was
the one place where the promise was not kept. archboard does not write the
section. It does not need to understand what is in it.

archboard does not write an image that the section names into the drawing again.
The section records that image, so a second record is two claims about one
thing. ADR 0015 exists to prevent that. An image that the section does not
mention is archboard's. It goes into the drawing as before.

A record that nobody can follow is only half of it, so archboard reads the
section. When the board opens, archboard loads an image that the plugin moved
into a vault file back from that file. The board renders as it did in Obsidian.
A link with no answer, or with more than one, resolves to nothing rather than to
a guess. The wrong image on a board is worse than a missing one, because nobody
checks an image that is there.

## Consequences

Not everything in that section names a file. An equation and a link out to the
web are recorded there too. archboard carries both across and resolves neither.
Fetching the web link is the plugin's job.

archboard deliberately does not preserve one neighboring section, the one that
records which element links where. It is not a sole record. The links live on
the elements in the drawing.

Keeping a stale copy will put back a link that somebody deleted here. This is
the shape of TASK-028 and TASK-029.

The formats stay independent. archboard writes what it writes, the plugin writes
what it writes, and each keeps the other's record rather than converting it. ADR
0015 refused two conversions that have to agree. This is the same refusal about
one section of one note.
