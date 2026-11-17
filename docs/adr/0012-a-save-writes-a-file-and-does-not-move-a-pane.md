---
status: accepted
---

# A save writes a file, and does not move a pane

Saving or branching a board never changes
browser state.

`board save --board payments --variant option-a` used to take every pane that
held `payments` and repoint it at `payments@option-a`. So the obvious way to
start a proposal took the existing architecture off screen. The skill had to
teach a line that put it back. That line was a workaround in documentation for
behavior nobody had chosen.

Whether a pane follows is a real question. Following is defensible: you
branched, so you work on the branch now. Not following is also defensible: you
branched to compare, so the source stays where it is.

A pane does not follow. archboard exists to hold a current architecture beside a
proposal, and the branch is the moment that comparison becomes possible. Taking
the source off screen at that moment is the opposite of the request.

The same reasoning covers the other way that a save changes address. The choice
"save elsewhere" is one of the three ways out of a write conflict (ADR 0006).
There the human parks a copy to go on working on the original. Dragging the
human onto the copy undoes the choice that the human just made.

The code already had a rule that this behavior broke. `board open` and
`board new` are the commands that choose what is on screen. Every other command
names a board and writes to it, on screen or not. A save that silently repoints
a pane gives one command both jobs. The job that it does silently is the one
about the screen.

## Say it either way

Which way the decision went mattered least. That the behavior stopped happening
silently mattered most. Every save now reports what it did to the screen.
`panes.moved` lists the panes that the save repointed. `panes.kept` lists the
panes that the save deliberately left on the board that was saved from.
`saveKind` names which of the three acts the save was.

## Why not make branching a separate command

`board branch payments --as option-a` carries the meaning in its name and leaves
`save` as the plain write. It is the better command, but it is not worth the
churn. INSTALL.md, TESTING.md and the skill all teach `board save --as` and
`--variant`. A second spelling of the same act must be taught beside them for as
long as anybody has the old one in muscle memory. The behavior was wrong, not
the name.
