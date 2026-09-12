# The pipeline, as a semantic board

What is in this directory is the example TASK-180 asks for: the architecture of
archboard's own write path, said twice — the drawing-centred pipeline it had, and
the semantic one it has — as boards a person can open rather than as prose about
boards.

It is here rather than in a vault because it is source: the statements are
tracked, the boards are built from them by `bun scripts/build-pipeline-example.ts`,
and building twice from the same statements produces the same boards. Nothing in
a person's vault is read or written by that script, and no `.excalidraw.md` note
is touched, created or migrated anywhere (ADR 0023).

- `system.json` — the system level: what the parts are, and how a write moves
  through them. Its board drills down into the write path.
- `write-path.json` — the level below: what the write boundary actually does,
  told once as an architecture and once as a sequence.

Both are stated in the agent-facing spelling — `semantic new` and `semantic edit`
take exactly these — so the example is also a worked demonstration of what an
agent writes. There are no coordinates in either file, because there is nowhere
to put one.
