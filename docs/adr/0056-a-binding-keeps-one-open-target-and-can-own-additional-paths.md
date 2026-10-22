---
status: rejected
---

# Keep one code owner per binding and draw its internal parts

TASK-501 exposed incomplete bindings and incorrect anchors after the source moved into workspace packages.
The baseline code check reports 82 anchor mismatches, including 40 on Browser application.
That count alone does not establish a missing binding feature.

Keep the existing singular binding model.
A node names one primary code owner.
When a behavior contains several implementation parts, draw separately bound children at the appropriate level.
The code check already includes descendants when it judges an anchored relationship endpoint.
Preserve the parent node's identity as the explanation gains detail.

A role folder does not establish a separate architectural responsibility by itself.
Name children for what their code does, and bind each to its actual implementation.
If an anchor cites a helper rather than the exchange that the relationship describes, correct the anchor or the relationship.
Do not expand a node's ownership to make an unrelated anchor pass.

The rejected proposal added optional `additionalPaths` beside the code-opening target.
That field can combine independently owned modules without showing their boundaries on the board.
It also introduces a second path contract for ownership, history, and code opening.
The user chose explicit lower-level children instead.

The unfinished experiment remains on branch `experiment/task501-additional-paths` for inspection.
It is not part of the product branch and is not a validated implementation.
