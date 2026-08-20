---
status: accepted
---

# A save writes a file, and does not move a pane

`board save --board payments --variant option-a` used to take every pane that
was holding `payments` and repoint it at `payments@option-a`. So the obvious
way to start a proposal took the architecture that exists off screen, and the
skill had to teach a line that put it back. That line was a workaround in
documentation for behaviour nobody had chosen.

Whether a pane should follow is a real question. Following is defensible: you
branched, so you are working on the branch now. Not following is also
defensible: you branched in order to compare, so the source should stay where
it is.

**It does not follow.** archboard exists to hold a current architecture beside a
proposal, and the branch is the moment that comparison becomes possible. Taking
the source off screen exactly then is the opposite of the request. The same
reasoning covers the other way a save changes address: "save elsewhere" is one
of the three ways out of a write conflict (ADR 0006), where the human parks a
copy in order to go on working on the original, and dragging them onto the copy
undoes the choice they just made.

There is also a rule the code already had and this broke. `board open` and
`board new` are the commands that choose what is on screen; every other command
names a board and writes to it, on screen or not. A save that silently repoints
a pane gives one command both jobs, and the one it does silently is the one
about the screen.

## Naming the scratch board is not a branch

One case does move a pane: `board save --board scratch --as payments`. Scratch
is a placeholder rather than a subject. It has no home in the vault, and after
the save the placeholder and the named board hold the same drawing, so a pane
left on scratch would be showing a second copy of the board that was just
created. There is nothing to stay behind for.

That is the distinction the code makes, in `classifyBoardSave`: a source with a
home in the vault is branched and nothing moves, a source without one is being
named and the panes come with it.

## Say it either way

The decision that mattered least was which way this went, and the one that
mattered most was that it stopped happening silently. Every save now reports
what it did to the screen: `panes.moved` for the panes it repointed, `panes.kept`
for the panes deliberately left on the board that was saved from, and
`saveKind` for which of the three acts it was. The CLI turns that into a
sentence naming the pane, the way `board open` already does, and a branch says
in the same breath that the branch is not showing anywhere and how to show it.

## Why not make branching a separate command

`board branch payments --as option-a` would carry the meaning in its name and
leave `save` as the boring write. It is the better command and it is not worth
the churn: `board save --as` and `--variant` are what INSTALL.md, TESTING.md and
the skill all teach, and a second spelling of the same act would have to be
taught alongside them for as long as anybody has the old one in muscle memory.
The behaviour is what was wrong, not the name.
