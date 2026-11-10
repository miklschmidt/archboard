---
status: accepted
---

# Blocks keeps legacy placement and plans its routes

Amended on 2026-11-09. The dense placement of [ADR 0064](0064-blocks-is-the-default-layout-engine.md) states one cost and searches for the placement that costs least.
That cost replaces the rules of the 2026-11-08 amendment (TASK-559.09), which chose each door's wall by the room the page costs.
The cost sketches each line with at most one bend, between the sides of its two cards that face each other.
It adds the sketch's length and 120 for each bend.
It adds the way round each card or foreign frame in the sketch's way, and 300 for each crossing.
A line that runs up, against the reading direction, adds 150.
A frame's own line to a card outside the frame is sketched from the frame's tab, because the line leaves the frame's header.
It also adds three times how far the members of each group stand from the group's middle.
Simulated annealing from a fixed seed moves the parts between the cells of each frame's grid, and starts from the grid's greedy answer.
A cell can stay empty, and a whole group can move one cell at a time.
An exact dynamic program stands the cards outside the frames round them, at one gap from the frames.
Either the top and bottom walls of that ring reach past the frames' corners, or its side walls do.
Thus no two walls share a corner.
Each of these cards has a place where it stands when it stands alone.
The cards keep the order of those places round the frames, so their own lines do not cross.
A line between two of these cards then pulls each card toward the place where the other card stands.
The program also pays for the blank space of the box that these cards and the frames fill.
It also pays for the pane that this box leaves blank, as a finished drawing does below, but by the square of the scale lost, so that it offers a page of the pane's shape.
It refuses a page that does not read where it lands while a page that reads holds the cards.
Among the routes that pass the guards, the router prefers one that meets such a card on a side that faces the line's far end.
Each grid width gives one placement, and a reading of several frames gives one more with the frames stacked.
Otherwise two frames stand in one row. Three frames or more stand in the rows that land them at the largest scale on 0.6 of the readable page's width, because the outside cards widen the page more than they heighten it.
Each placement is priced again on its drawn frame, whose columns and rows are as wide as what they hold.
Each placement also has a variant whose outside cards can stand one gap further out, because contraction takes that room back.
A reading with more than 64 relationships searches every grid width briefly and goes on with the two cheapest only.
A line that the router refuses, or sends a long way round, asks its frame's grid for 72 px of room on its direct way.
The placement then routes again with that room, twice at most.
The direct way lies between the rows and the columns of the line's two parts.
For a line to a card outside the frame or to the frame's tab, it lies between the part and the wall that faces that end.
A way straight along a column or a row past another part asks for the room beside that part instead.
That room is on the side that faces the frame's middle, because room between the rows that the line passes does not let it by.
No line asks once the reading has a drawing that reads where it lands and has no long detour.
Finished drawings rank first by whether the page reads where it lands, then by their long detours.
Then they rank by route cost plus crowded approaches plus blank space.
Blank space is the area farther than 48 px from every card, line, label, frame title and group caption.
On a page that fills the landing room, 96 px² of blank space costs as much as 1 px of line.
On a page that takes at most three quarters of the room, blank space costs nothing, because it makes no word land smaller.
Between the two, its cost grows with the page, so a small reading keeps its straight lines before it saves blank page.
A page that lands smaller than full scale also pays for the pane that its shape leaves blank there.
That blank is the landing room less the page at its landing scale, and it costs twice what blank space costs.
It counts by the share of the scale that the page loses on its way to 0.6, where words just read.
So a strip loses to a page of the pane's shape that lands at full scale.
The room cost, its charge for scale, and the promise before routing are gone.

TASK-554 proposes this decision on 2026-10-28 and revises it on 2026-10-29.
The owner selected the hybrid direction after three iterations failed to improve the six reference pictures with planner-owned placement.
The legacy placer composes the boards better, while planned routing supplies explicit ownership, complete geometry guards, and bounded search.

Legacy Blocks placement owns card positions, dependency order, packing, frames, folds, and wraps.
The planner replaces Blocks routing, including the old trunk router and its unrestricted grid search.
The placer can respond to the new routes with smaller gaps.
A placement change must improve the reading and pass the reference gates.
Small views compare guarded candidates by clear card approaches, crossings, bends, and route length.
They also try placement without the provisional label boxes that final routing replaces.
The original measured labels still constrain every final route.
Extra blank space, priced as for dense readings, and long detours must not erase that gain.
Dense scopes use a smaller wrap search, and Blocks omits the repeated side-exit hierarchy pass.

The planner routes fixed measured geometry through four-wall ports, private lanes, and explicit source and target fans.
Every shared run names one endpoint common to all its members and preserves the full line treatment.
Pairwise compatibility alone cannot establish trunk ownership.
A source fan only splits, and a target fan only merges.
If the ports of a line's two facing ends stand less than two bend radii apart, the end that holds its port alone moves onto the other end's line, so the line runs straight.
Local conflict repair and grid windows have explicit work limits.
A failed candidate can request bounded extra room from the legacy placer.
No unchecked route reaches the painter.

After selecting routes, two lines that meet one card wall side by side and cross just beside it trade their places on that wall.
Each keeps its first stretch and its turn, and a trade stands only when it removes a crossing and passes the complete geometry guard.
After selecting routes, the planner closes the space that nothing uses while preserving card sizes, route topology, and clearance around bends and boundaries.
A line that joins another before the card they enter keeps the room the guard asks of that junction.
A line that leaves another after the card they start from keeps the same room when one of them draws an arrowhead there, as a two-way line does.
TASK-559.37 replaced the bands, which had to stand empty across the whole page, with a contraction.
In it, each piece moves on its own and keeps its order against what shares its slab.
It places labels again on those shorter runs and applies the same complete geometry guard.
A rejected contraction retains the original geometry through that guard.

Each label belongs to one real relationship and receives no semantic node ID or arrowhead.
It occupies the midpoint of the longest clear private run that holds its measured plate.
When no qualifying midpoint exists, it occupies the nearest clear private spot along the route from the source.
The implementation counts those cases.
Words remain horizontal on horizontal or vertical runs.
A stack of separate label plates uses a vertical run long enough to carry every plate.
The label never covers shared ink, crosses a frame wall, or lies under a foreign line.
It never lies over another stretch of its own route either.
Each label has a second, narrower plate where its words wrap narrower, and that plate holds its longest word whole.
Where the wide plate finds no spot, the words wrap onto the narrow plate before the label stands beside the route's other stretches or the line takes a longer way.
When a route leaves no spot clear of its other stretches, the label can stand closer beside them, but not over them.
A route never gains a bend to reach a label slot.

The complete geometry guard protects cards, headers, captions, walls, labels, endpoints, and fan ownership before emission.
It also refuses a route that crosses or touches its own ink, because no hop can mark where a line crosses itself.
The painter measures actual decorated ink for page bounds.
Plain Blocks views omit hidden comparison subjects before placement, so those subjects reserve no space.
The visible subject set stays the same, but turning comparison on can move the remaining cards.
Planned crossing decoration retains its finite search limits.
The Solver interface, text shaping, Rust core, worker pool, and Graphviz remain under ADRs 0059 and 0060.
A pool of several workers lays a dense reading out in parts across them, and the core makes the choice of one solve from their answers ([ADR 0078](0078-a-blocks-solve-is-laid-out-in-parts-across-the-layout-workers.md)).
Track retains its existing behavior and must remain byte-identical.
ADRs 0033, 0040, 0061, and 0062 retain their placement and measured-header decisions.

The original proposal replaced placement as well as routing.
Step 8 removed all twenty-three baseline geometry findings and met the three speed budgets.
It still increased mean area and route length.
Iteration 3 rejected its readability trials because none passed all six references.
The hybrid removes that planner-owned placement and keeps its useful routing and guard contracts.

TASK-554 records the work limits, historical trials, and acceptance gates.
The owner accepted this direction on 2026-10-30 and selected Blocks as the default in ADR 0064.
