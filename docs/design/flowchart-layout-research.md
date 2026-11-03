# Breaking a long flowchart into columns

Date: 2026-11-03
Scope: decide where a tall structured flowchart breaks into columns, and where its lines run.
The current layout is [ADR 0073](../adr/0073-a-flowchart-lays-out-from-its-flow-and-a-flow-opens-in-the-reading-that-fits.md).
`crates/archboard-flows/src/flowchart/layout/mod.rs` and `branches.rs` implement it.
The research itself changed no code.
Every claim about a source cites it, and [Sources](#sources) lists them with notes on access.
A claim marked **abstract only** rests on the abstract alone.
Text marked **Inference** is my reasoning, not a claim of a source.
Translations from Russian are mine.

## The question

A structured flowchart here has four kinds of block.
A step is a box.
A terminal is the start or the end.
A decision has two or three labelled answers that join again below it.
A loop has a body that repeats, with a line back up.

Today a run of blocks stacks on one axis.
A decision stands its answers side by side below its diamond.
A run that is too tall breaks into columns of even height (`fill` and `Layout::columns` in `layout/mod.rs`).
The only rule on where a break falls is that a terminal never stands alone.
The core picks the column height at which the reference pane of ADR 0073 shows the picture largest.
The line between two columns rises in the gap and enters the next column from the top.
Every run breaks this way, also the run of an answer and the body of a loop.

The owner finds these breaks arbitrary.
The owner's sketch proposes two changes:

1. A decision stays at the foot of the run before it.
2. The long answer of a decision leaves the side point of the diamond and starts at the top of a new column.

The question: does a flowchart read better with breaks at its decisions and its semantic phases, and not at step counts?
The owner also asked whether research exists on how to lay these charts out well.

## Short answer

- I found no study that tests where a flowchart breaks best into columns.
  No experiment compares breaks at decisions with breaks at even heights.
- The sources that deal with long charts agree on one point: split a long chart into parts by meaning, not by count.
  DRAKON requires it ([Parondzhanov 1995][p95] p. 145, [Parondzhanov 2009][p09] p. 5).
  Nassi and Shneiderman require it ([1973][ns73] p. 22).
  Practitioners ranked the 7PMG guideline "model as structured as possible" first and decomposition second ([7PMG][7pmg] pp. 11, 18).
- The proposed rule matches the DRAKON silhouette.
  A DRAKON branch is one column.
  It starts with a named header at the top and ends with an address at the foot.
  The address names the branch that runs next ([1995][p95] p. 145).
  A branch can have several exits, each an address ([1995][p95] p. 146).
  DRAKON rejects a layout that fits a long sequence on a sheet with an upward segment ([2009][p09] p. 58).
- Wrapping research gives the mechanics.
  Pick the number of columns for the largest scale, then put each cut where few lines cross it ([Rüegg and von Hanxleden][wrap] pp. 6-10).
  The authors warn that unfortunate cut indices give cluttered drawings ([wrap] p. 3).
  The Eclipse Layout Kernel implements this method ([wrap] p. 1), and archboard's current breaks follow the same idea.
- Readability studies name the cost of each break.
  Crossings hurt most ([Purchase 1997][pur97] p. 248).
  Path continuity comes next ([Ware et al. 2002][ware02], **abstract only**).
  Readers do best with flowcharts that run with their reading direction ([Krohn 1983][krohn83], **abstract only**).
  Every column break adds one upward line.
- **Inference.** Keep the max-scale choice of how many columns to draw.
  Allow a cut only at a decision or after a join, and prefer the decision cut that the owner proposes.
  Fall back to an even-height cut only inside a long run of plain steps.
  For those runs, let the flow author name the phases, because only the author knows them.

## Outcome

The section [What this means for this flowchart](#what-this-means-for-this-flowchart) argues for the owner's sketch.
A prototype on the long flows of this repository showed that cuts at decisions alone left the long lines in place.
ADR 0073 took another way, and TASK-572 built it.
A line that would run far now jumps: it stops at a lettered jump out and goes on at the jump in of the same letter.
This is the named jump of the open question [Long join lines](#open-questions), as a DRAKON address or an ISO 5807 connector.
It replaces the rising line between columns, the long line of a short answer to its join, and a long loop's lines round its body.
The cut of a column still falls at the balanced height, and never in front of a decision or a landing.
No reader test compares jumps with drawn lines yet.

## Findings

### DRAKON, the flowchart language of Vladimir Parondzhanov

DRAKON comes from the software of the Buran orbiter ([1995][p95] p. 142).
Its rules are design doctrine argued from ergonomics.
I found no controlled experiment behind them in the texts I read.

What the sources say:

- **Skewer.** A skewer-block has one entry at the top and one exit at the bottom, on the same vertical ([1995][p95] p. 142).
  Its other verticals stand to the right of that main vertical.
  All verticals run top to bottom, except the lines of a loop ([syntax page][syntax], thesis 7).
- **Cap and branches.** The top of a DRAKON chart is the "cap".
  It holds the title and one header icon per branch.
  The cap answers three questions in a few seconds ([1995][p95] p. 145).
  The questions are: "What is the name of the problem? How many parts does it consist of? What is the name of each part?"
  The 2009 text calls these the three "royal" questions ([2009][p09] p. 10).
- **A branch is a part chosen by meaning.**
  "The division of the problem into N parts is performed by partitioning the program into N branches" ([1995][p95] p. 145).
  For a long sequence, the author must cut "the long gut" into meaningful parts ([2009][p09] p. 5).
  The example cuts a fishing trip into three topics: getting up and breakfast, packing, the trip.
  The ergonomic rules say: split a complex algorithm into parts, draw each part as a branch, and give each part a clear name ([rules page][rules], rule 3).
  I found no rule that chooses a branch by its size.
- **Header at the top, address at the foot.**
  A branch has one entry, its header, and one or more exits ([1995][p95] p. 145).
  "The exit from the branch is represented as an Address icon containing the name of the next branch to be executed" (p. 145).
  An address transfers control only to the start of a branch (p. 145).
- **Order of the branches.** Branches stand by the rule «чем правее, тем позже», "the further right, the later" ([2009][p09] p. 28, [rules page][rules], rule 4).
  The leftmost branch runs first and the rightmost runs last.
  A branch loop modifies the rule ([2009][p09] p. 9).
- **The main route, or "royal road".**
  The 2009 text asks «ЕСТЬ ЛИ В АЛГОРИТМЕ ЦАРСКАЯ ДОРОГА?», "Does the algorithm have a royal road?" ([2009][p09] p. 14).
  The main route is the path to the greatest success, and it must run on the skewer ([2009][p09] p. 15).
  The main route of a branch runs from its header to its address.
  A branch with several addresses ends its main route at the leftmost one ([1995][p95] p. 146).
  The main route of a silhouette is the main routes of its branches, joined in the order they run (p. 146).
- **"The further right, the worse".** Side routes stand right of the skewer by the rule «Чем правее, тем хуже» ([2009][p09] p. 16).
  The 1995 paper puts it this way: "verticals are placed from left to right in order of decreasing success" ([1995][p95] p. 146).
  Where success has no meaning, choose another criterion.
  A shift to the right must then still carry "some reasonable meaning" (p. 146).
- **No crossings, no connectors.** "Both the described crossings are prohibited by the DRAKON rules" ([1995][p95] p. 148).
  This covers a drawn crossing and a crossing hidden by connectors.
  The 2009 text forbids crossings and breaks in lines ([2009][p09] p. 24).
- **The frame lines stay.** In a silhouette, the path leaves each address to the left along the bottom ([2009][p09] p. 11).
  It rises on the left side and runs right along the top, past an arrow, into the next header (p. 11).
  The addresses alone decide the order of execution, so execution does not need the frame lines ([2009][p09] p. 12).
  The author keeps them anyway, because they "glue" the separate pieces into one whole image.
  Without them the chart falls apart for the eye (p. 12).
- **Side exits go to the lower line.** "Grounding" attaches the end of a side route to the lower line of the silhouette ([syntax], thesis 29).
  An address icon then goes on that side route (thesis 29, [1995][p95] p. 151).
- **No upward wrap.** A DRAKON chart must fit on one sheet ([2009][p09] p. 58).
  The example is a linear chart of twelve icons on a sheet that holds eight.
  Its first layout fits the sheet with a segment AB on which the reader's path moves upward.
  The text rejects it, because DRAKON forbids that (p. 58).
  The two remedies are a silhouette, or an "insertion" that moves a part with one meaning into its own procedure (pp. 58-59).
- **When to use a silhouette.** A chart without branches is a "primitive".
  The 1995 paper recommends a primitive for about 5 to 15 icons ([1995][p95] p. 146).
  The 2009 text says at most 10 icons ([2009][p09] p. 21), and later recommends silhouettes almost always (p. 123).

**Inference.** DRAKON gives the owner's proposal a precedent.
A branch with several addresses, reached through a fork, is a column that ends at a decision.
The exit on the main route starts the branch to the right, at the top.
DRAKON differs in one point: it keeps the main route on the left vertical and puts side routes to its right.
In the owner's sketch, the main route leaves the right point of the diamond, because the next column stands to the right.
That keeps "the further right, the later" at the level of columns.
DRAKON also shows what to do with the short answers: they run down to a shared lower line.

### Wrapping layered drawings: Rüegg and von Hanxleden, and the Eclipse Layout Kernel

The full text is Kiel technical report 1803 ([wrap]).
An abridged version appeared at Diagrams 2018 ([wrap-lncs], not read).

What the report says:

- **Problem.** A layered drawing is at least as tall as its longest path.
  So a long control flow graph comes out much taller than wide ([wrap] p. 1).
  Its labels then become too small to read on a screen.
  The authors cut the layering into chunks drawn side by side (p. 1).
- **Upward lines.** The lines between chunks point upwards, which layered drawing normally avoids.
  Still, "the chunks are well-separated and the overall flow of the diagram remains clearly visible" ([wrap] p. 1).
- **Goal.** Use the drawing area as well as possible, and keep the number of wrapped lines small ([wrap] p. 5).
  They measure the first goal by "max scale", the largest scale at which the drawing fits the area (p. 5).
- **Choosing cuts.** ARD estimates the number of chunks from the target aspect ratio.
  MSD then cuts so that each chunk has about the same height ([wrap] pp. 6-7).
  Its variant MSD-1 also tries one chunk more and one less (p. 7).
  A forbidden cut then moves to an allowed one.
  "Lookback" picks the nearest allowed index, and the authors found it better than "Greedy" (pp. 7-8).
- **Valid cuts.** In the single-edge variant, a valid cut has at most one edge across it ([wrap] p. 6).
  For denser graphs: "Good cuts are therefore between pairs of layers that have a small number of edges in-between them" (p. 9).
  The multi-edge variant gives each index a cost (p. 10).
  The cost is the number of edges that span the index, plus its distance to a planned cut raised to a power.
- **Unfortunate cuts.** "Selecting unfortunate cut indices can result in poor and cluttered drawings" ([wrap] p. 3, Fig. 1.3).
  The figure moves two cut indices by one each.
- **Evaluation.** The first test set was 135 sequentialized SCGs, a kind of control flow diagram ([wrap] pp. 1, 8).
  Wrapping gave a larger max scale for target aspect ratios from 1.0 to 4.0 (p. 8).
  At a target ratio of 0.25 it gave no significant gain (p. 8).
  On the North graphs, wrapping helped from a ratio of 1.0 up (pp. 13-14).
  At 0.25, the drawings without wrapping scored best on average (p. 14).
  The report has no study with human readers.
- **Where the cut lines run.** The backward cut edges run "in well-defined areas of the drawing, in-between pairs of chunks" ([wrap] p. 16).
  The method "works best with sparse and 'elongated' graphs and graphs that regularly have 'bottlenecks'" (p. 16).
  For many cut edges, the authors suggest bundling them, or labelling numbers in place of lines (p. 17).

What ELK documents and does:

- `elk.layered.wrapping.strategy` is `OFF`, `SINGLE_EDGE` or `MULTI_EDGE`, and `OFF` is the default ([ELK strategy][elk-strategy]).
  The page says that the edges between chunks are "'wrapped' around from the end of one chunk to the start of the other chunk".
- `cutting.strategy` is `ARD`, `MSD` or `MANUAL`, and `MSD` is the default ([ELK cutting][elk-cutting]).
  `cutting.cuts` takes cuts the user picks ([ELK cuts][elk-cuts]).
  `cutting.msd.freedom` defaults to 1. With a first guess of 3, it allows 2, 3 and 4 ([ELK freedom][elk-freedom]).
- `validify.strategy` is `NO`, `GREEDY` or `LOOK_BACK`, and `GREEDY` is the default ([ELK validify][elk-validify]).
  The report found Lookback better (see above).
  `validify.forbiddenIndices` takes a list of indices, and its page gives no description ([ELK forbidden][elk-forbidden]).
  The source marks each listed index as not allowed ([GraphStats][elk-gs]).
- `multiEdge.improveCuts` defaults to true.
  It seeks "a compromise between evenly-distributed cuts and the total number of cut edges" ([ELK improve cuts][elk-improve]).
  `multiEdge.distancePenalty` defaults to 2.0 ([ELK penalty][elk-penalty]).
  In the source, the score of an index is its spanning edges plus its distance to the planned cut raised to that power ([BreakingPointInserter][elk-bpi]).
- `multiEdge.improveWrappedEdges` defaults to true and shortens wrapped edges ([ELK wrapped edges][elk-wrapped]).
  `additionalEdgeSpacing` defaults to 10 and keeps wrapped edges apart from other edges ([ELK spacing][elk-spacing]).
- In the source, the default rule allows a cut before a layer only where one pair of nodes links it to the layer before ([GraphStats][elk-gs]).

**Inference.** Archboard's current breaks are MSD in all but name.
They balance column heights and keep the height that gives the largest scale.
In a structured run, the answers of a decision join before the next block.
So every boundary between two blocks carries one line, and every boundary is a valid single-edge cut.
The valid set therefore carries no meaning, and the breaks fall wherever the height runs out.
That is the arbitrariness the owner sees.
The fix fits the same method: shrink the set of valid cuts to boundaries with meaning, and move each balanced cut to the nearest one.
ELK has both parts already, as forbidden indices and the Lookback strategy.

### Readability studies of graph layout

What the sources say:

- **Crossings first.** Purchase tested bends, crossings, minimum angle, orthogonality and symmetry on screen ([pur97] pp. 249-252).
  The graph had 16 nodes and 28 edges (p. 252), and 55 students took part (p. 256).
  She found that "reducing the number of edge crosses is by far the most important aesthetic" (p. 248).
  "Minimising the number of bends and maximising symmetry have a lesser effect" (p. 248).
  Minimum angle and orthogonality had no significant effect (p. 248).
- **The domain matters.** Purchase, Carrington and Allder report that only some aesthetics affect usability significantly ([pca02], **abstract only**).
  The semantic domain of the drawing "affects which aesthetic criteria need to be emphasised".
- **Direction of flow.** In UML class diagrams, 93% preferred fewer crossings and 91% preferred fewer bends ([uml02] pp. 264-266).
  The stated reasons showed "that the direction of flow was an important consideration", which the study had not tested (p. 267).
  One participant wrote: "I prefer arrows pointing down rather than up" (p. 267).
- **Continuity.** Ware, Purchase, Colpoys and McGill measured the cost of finding shortest paths ([ware02], **abstract only**).
  In their words: "after the length of the path the two most important factors are continuity and edge crossings".
  Continuity means "keeping multi-edge paths as straight as possible".
  The number of branches that leave nodes on the path also matters.
- **Paths that head the wrong way.** A preliminary eye-tracking study tested path search ([huang08], **abstract only**, arXiv preprint).
  It reports that a path "can become harder to follow" with many branches that "go toward the target node".
- **Flowcharts follow reading order.** Krohn compared flowchart orientations, and decision boxes with two or more alternatives ([krohn83], **abstract only**).
  Performance was best with flowcharts that ran with reading patterns, "from left to right and from top to bottom".
  "The number of alternatives leading from decision boxes had no effect on performance".

**Inference.** No study here tests column breaks.
They still set the price of one.
A break adds one upward line and four bends to the main route, and it breaks the route's straight line.
Only crossings rank above continuity, and the current layout has no crossings by construction.
So a break must buy real scale, and it needs to fall where the reader expects a new part anyway.
A long answer that rises to the next column moves away from the end of the flow.
The short answers below it still head toward the end.
That is the case Huang describes, so the rising line needs a clear mark of direction.

### Comprehension of process models

What the sources say:

- **Structure and decomposition.** 7PMG lists seven guidelines ([7pmg] p. 11).
  G4 reads "Model as structured as possible", and means that every split has a matching join of the same type.
  G7 reads "Decompose a model with more than 50 elements" (p. 11, Table 1).
  A large sub-component with a single entry and a single exit can become one activity (p. 11).
  That activity points to the sub-component as a separate model.
  Industry experts ranked G4 first and G7 second (p. 18).
  I read the authors' preprint.
- **Layout is barely tested.** Figl reviewed forty studies of objective comprehension ([figl17] abstract).
  "Only two of the selected empirical studies conduct empirical evaluations of explicating factors related to model layout" (p. 52).
  One tested flow direction, the other a task-specific layout of elements (p. 52).
- **Decomposition helps for some tasks.** Figl reports that Reijers et al. found modularization positively related to comprehension ([figl17] p. 51).
  It "shields the reader from unnecessary information".
  Figl also reports that Turetken et al. found flat models more accurate for local tasks inside one sub-model (p. 51).
- **Flow direction.** Figl and Strembeck compared four flow directions with 44 participants ([fs15] abstract).
  They found no significant advantage for left to right, and readers "adapted well to uncommon reading directions" ([fs15] abstract and Discussion).
  They note that modelers build "zigzag models" to avoid scrolling or to fit a page ([fs15] Directions for Future Research).
  They list mixed directions in one model as an open research question there.
- **Consistent flow is a feature that readers notice.** Burattin et al. list "consistency of flow" among the visual features that users found meaningful ([flowcons] abstract and Table 2).
  In their example, one model runs on three horizontal lines ([flowcons] p. 8).
  The authors rate it as less consistent, because the reader has to "go back" with the eyes.
  Another feature is "branching off", where branches from one main path flow in different directions (Table 2).
- **Eye tracking.** Figl reports that fixations on the relevant region predicted comprehension task scores up to 70% ([figl17] p. 61).
  I found no eye-tracking study of column breaks.

**Inference.** The process-model evidence supports structure over geometry.
A column that holds one structured part is a visual sub-model, in the sense of 7PMG G7.
Columns join one flow, so a reader still sees every part, which avoids the cost Turetken et al. found for local tasks.
The flow-direction results suggest that readers adapt to a rising line, but these were small studies of whole models.

### Layout of structured process models

What the sources say:

- **Structure-driven layout.** Gschwind, Pinggera, Zugal, Reijers and Weber propose a layout algorithm from constraints for a readable process model ([gsch14], **abstract only**).
  In their words: "Our algorithm exploits the structure of the process model and allows the computation of the final layout in linear time".
  Moderately experienced modelers found it useful and easy to use.
  I did not reach the full text.
  So I cannot say how it uses the structure tree, or how it treats long models.
- **BPMN layout.** Kitzmann, König, Lübke and Singer give an automatic BPMN layout ([kitz09], **abstract only**, read through its OpenAlex record).
  They argue that badly and inconsistently laid out processes are hard to read.
- **SESE decomposition.** The program structure tree is a hierarchy of single-entry single-exit regions of a control flow graph ([pst94], **abstract only**).
  I read that abstract through its OpenAlex record.
  A linear-time algorithm builds the tree for any control flow graph.
  7PMG cites the refined process structure tree for its decomposition advice ([7pmg] p. 11, ref. 49).
  I did not reach that paper ([rpst09]).

**Inference.** An archboard flow is block-structured by construction.
Its block tree is already its SESE decomposition.
A layout that breaks at block boundaries follows the structure that these algorithms recover from unstructured graphs.

### Older practice: ISO 5807, BPMN and Nassi and Shneiderman

What the sources say:

- **ISO 5807.** ISO 5807:1985 "Defines symbols to be used in information processing documentation and gives guidance on conventions" for flowcharts ([iso5807], abstract only).
  I did not read its text.
  The Russian catalogue lists GOST 19.701-90 as "ГОСТ 19.701-90 (ИСО 5807-85)" and says that it contains ISO 5807:1985 requirements ([gostinfo]).
  The rules below come from GOST 19.701-90 ([gost]), not from the ISO text.
- **GOST 19.701-90.** Flow from left to right and from top to bottom is standard (4.2.1).
  Arrows mark any other direction (4.2.1).
  The standard tells charts to avoid line crossings (4.2.2).
  Lines enter a symbol from the left or the top and leave it from the right or the bottom (4.2.4).
  A line can break at a connector (4.2.5).
  The standard names three reasons: to avoid extra crossings, to avoid too long lines, and to continue on another page.
  The two connectors of one break carry the same unique label (3.4.1).
  A comment can add the page reference (4.2.6).
- **BPMN 2.0.2.** The specification recommends one direction for sequence flows, "either left to right or top to bottom" ([bpmn] p. 40).
  A pair of named Link Events serves as an off-page connector for a process that spans printed pages ([bpmn] pp. 266-267).
  Link Events also serve as "Go To" objects that reduce the length of sequence flow lines (p. 267).
- **Nassi and Shneiderman.** Their chart makes "arbitrary transfers of control" impossible ([ns73] p. 15).
  Each "complete thought structure" fits on one page, with no off-page connectors (p. 15).
  No more than "fifteen or twenty symbols" fit on one sheet (p. 22).
  So "the programmer must modularize his program into meaningful sections" (p. 22).
  They add that this removes "the temptation to use off-page connectors which lead only to confusion" (p. 22).
  A process box can stand for a call to another structure (p. 19).

**Inference.** The older practice splits two ways.
ISO and BPMN break a long line with a named pair of connectors.
DRAKON and Nassi and Shneiderman reject connectors and split the chart into named parts.
Archboard draws on a screen, not on pages, and its columns all stand in one picture.
So it can keep every line, as DRAKON keeps its frame lines, and still split by meaning.

## What this means for this flowchart

Everything in this section is **inference** from the findings above.
No source tests these rules on a flowchart.

### Where a column breaks

1. **Keep the max-scale choice.** Choose the number of columns and the column height against the reference pane as today.
   This is MSD ([wrap] pp. 6-7), and it keeps ADR 0073's rule that a flowchart that fits whole never breaks.
2. **Allow cuts only at boundaries with meaning.** A cut can fall in three places, in this order of preference:
   1. At a decision, between its diamond and the first block of its long answer (the decision cut).
   2. In a run, right after a decision's join or a loop's done line, where the flow is one line again.
   3. Between two plain steps, only in a run that offers neither of the first two within reach.
3. **Forbid the rest.** No cut falls right before a decision, so a decision stays at the foot of the run before it.
   No cut falls inside a loop body, or inside a short answer.
   No terminal stands alone in a column, as today.
4. **Move each balanced cut to the nearest allowed cut.** Use Lookback, which picks the nearest allowed index in either direction ([wrap] p. 7).
   Score candidates like ELK's multi-edge improvement: a cost for the kind of cut, plus the squared distance from the balanced height ([elk-bpi]).
   If its scale stays within a tolerance of the balanced set, keep the cut set with meaning.
5. **Read left to right in execution order.** Each column runs later than the column to its left, as in DRAKON ([2009][p09] p. 28).
   The current layout already does this.

### Where a decision's answers go

6. **A decision that fits stays whole.** Its answers stand side by side below its diamond, as ADR 0073 decides.
7. **A decision that closes a column.** The diamond stands at the foot of the column, after the steps that lead to it.
   Its short answers stay below the diamond in that column.
   Its long answer leaves the right point of the diamond and runs into the gap.
   It rises there and enters the first block of the next column from above.
   The label of the long answer stays beside the side point.
8. **Which answer is long.** It is the tallest answer, and it must be clearly taller than the rest.
   Allow the decision cut only for a long answer that is also the last answer.
   That answer already leaves the right point.
   Otherwise keep the decision whole, so that a break never reorders the authored answers.
9. **The long answer goes on.** Its own run follows the same rules, so it can end at its own decision and cut again.
   The steps after the decision's join continue in the column where the long answer ends.

### Where the joining lines run

10. **The main route rises in the gap.** The line from the foot of a column rises in the gap to its right.
    It enters the next column from above.
    The line of a decision cut starts at the side point of the diamond.
    The report routes cut lines in the same place ([wrap] p. 16).
    DRAKON runs its frame line around the left side instead, and keeps it to hold the picture together ([2009][p09] pp. 11-12).
    Mark the top run of the rising line with an arrowhead that points right, as DRAKON marks its upper line ([2009][p09] p. 11).
    This keeps it apart from a loop's back line, which enters the side point of a hexagon (ADR 0073).
11. **Short answers run along a lower line.** Their loose ends drop to a shared line below the columns and run right to their joins.
    DRAKON grounds side routes on the lower line of a silhouette in the same way ([syntax], thesis 29).
    Nested decisions join from the inside out.
    So the lower line of an inner decision runs above the lower line of an outer one, and no line crosses another.
12. **Keep lines, not connectors.** Draw every line, as DRAKON and Nassi and Shneiderman ask ([1995][p95] p. 148, [ns73] p. 22).
    A named connector remains a fallback for a join line that crosses many columns (see the open questions).

### A run with no decision in it

13. **Break it last.** Break the other runs first.
    Break a plain run only to reach the chosen height.
14. **Break it evenly.** A plain run that must break cuts at the balanced height, as today.
    Leave at least two steps on each side of the cut.
15. **Ask the author for its parts.** Only the author knows the phases of a plain run.
    DRAKON gives this work to the author ([2009][p09] p. 5), and so does Nassi and Shneiderman ([ns73] p. 22).
    This repository's rule is that agents author meaning and the renderer draws it.
    A named phase in the flow gives the renderer a cut with meaning.
    It also gives a column header, like the DRAKON cap.
16. **A weak hint.** A change in a step's sender or receiver can mark a phase boundary.
    No source tests this.
    So use it only to break ties between cuts of equal cost.

### The owner's example under these rules

The sketch shows the flow "A context change reaches a workhorse".
Under rules 1 to 11, its columns hold these parts:

1. Start, four steps that announce and deliver the change, and the decision "Did this change already arrive?".
   The answer "seen" stays below the diamond.
2. The answer "first time": four steps that check the change and the link, and the decision "Do the change, the target and the link pass?".
   The answer "refused" stays below the diamond.
3. The answer "pass": the steps that classify the target thread and prove it current.
   It ends with "is the change still fresh, and the newest of the feed?" and the decision "Does the final guard hold?".
4. The answer "holds": the inject steps and the decision "What came of the attempt?" with its three answers.
5. After the joins: the receipt steps and End.

In every decision of this flow, the long answer is the last one, so rule 8 allows each cut.
Column 3 is the tallest, so it sets the scale.
The check "is the change still fresh" moves to the column of the guard that asks about it.
Each column then opens with the first step of a phase: announce, check, classify, inject, receipt.

## Open questions

- **Tolerance.** How much scale can a cut with meaning cost, compared with the balanced cut?
  Under ADR 0073, a shorter column height must gain at least 1% of scale.
  The tolerance for meaning needs a value, measured on the flows of this repository.
- **Length of "long".** How much taller than the others must the long answer be?
- **Two long answers.** What happens to a decision with two answers that are both too tall for the column?
  One default is to keep the decision whole and break before the run that leads to it.
- **Answer order.** Can a break reorder answers so that the long answer leaves the right point?
  DRAKON orders answers by meaning, best on the left ([1995][p95] p. 146).
  Archboard keeps the authored order.
- **Long join lines.** A short answer from the first column can run under every later column to its join.
  Ware et al. rank path length first ([ware02]).
  A named jump, like a DRAKON address or a BPMN link, makes it shorter ([1995][p95] p. 145, [bpmn] p. 267).
  Nassi and Shneiderman say connectors "lead only to confusion" ([ns73] p. 22).
  Which costs a reader more needs a test.
- **Named phases.** Does a flow need named phases?
  Does a column then show its phase name at the top?
  This changes the flow format, which the owner decides.
- **Loops.** What happens to a loop body that alone is taller than the column?
  These rules never cut inside a loop, so such a loop sets the column height.
- **Evidence.** A small test can compare the current breaks with these rules on long flows of this repository.
  It can time a path-tracing task, like those of Purchase ([pur97] p. 250) and Ware et al. ([ware02]).

## Sources

All accessed 2026-11-03.
Unless a note says otherwise, I extracted the full text and took quotes from it.

- DRAKON: [Parondzhanov, "Visual Syntax of the DRAKON Language", Programming and Computer Software 21(3), 1995, pp. 142-153][p95].
  This is the official English translation, hosted on drakon.su.
  [Parondzhanov, «Язык ДРАКОН. Краткое описание», 2009][p09], whose PDF page numbers match its printed pages.
  [«Эргономические правила построения ДРАКОН-схем»][rules] and [«Описание визуального синтаксиса языка ДРАКОН»][syntax].
  Both pages are drakon.su excerpts of «Как улучшить работу ума» (2001).
  I did not read the 2001 book itself.
- Wrapping: [Rüegg and von Hanxleden, "Wrapping Layered Graphs", Kiel report 1803, 2018][wrap].
  I did not read the abridged [Diagrams 2018 chapter][wrap-lncs].
- ELK option pages: [strategy][elk-strategy], [cutting][elk-cutting], [cuts][elk-cuts], [MSD freedom][elk-freedom], [validify][elk-validify].
  Also [forbidden indices][elk-forbidden], [improve cuts][elk-improve], [distance penalty][elk-penalty], [improve wrapped edges][elk-wrapped], [additional spacing][elk-spacing].
  ELK source at commit `b715fb10e90f`: [GraphStats.java][elk-gs], [BreakingPointInserter.java][elk-bpi].
- Graph aesthetics: [Purchase 1997][pur97], full text.
  [Purchase, Carrington and Allder 2002][pca02], abstract on the [Glasgow record][pca02-abs] only.
  [Purchase, Allder and Carrington 2002][uml02], full text.
  [Ware, Purchase, Colpoys and McGill 2002][ware02], abstract on the [Monash record][ware02-abs] only.
  [Huang 2008][huang08], arXiv abstract only.
  [Krohn 1983][krohn83], abstract from the publisher's Crossref record only.
- Process models: [Mendling, Reijers and van der Aalst 2010][7pmg], read in the [authors' preprint][7pmg-pre].
  [Figl 2017][figl17], full text.
  [Figl and Strembeck 2015][fs15], full text, with the [GI record][fs15-rec].
  [Burattin et al. 2018][flowcons-pub], read in the [arXiv version][flowcons].
  [Gschwind et al. 2014][gsch14], abstract on the [DTU record][gsch14-abs] only.
  The IBM report RZ3830 did not respond.
  [Kitzmann et al. 2009][kitz09], abstract through [OpenAlex][kitz09-oa] only, because IEEE Xplore did not respond.
  [Johnson, Pearson and Pingali 1994][pst94], abstract through [OpenAlex][pst94-oa] only.
  [Vanhatalo, Völzer and Koehler 2009][rpst09], not reached.
- Standards: [ISO 5807:1985][iso5807], abstract on the ISO committee page only.
  [GOST 19.701-90][gost], full text.
  [The GOST catalogue record][gostinfo].
  [BPMN 2.0.2][bpmn], full text.
- Nassi and Shneiderman: [Flowchart techniques for structured programming, SIGPLAN Notices 8(8), 1973][ns73].
  I read [Shneiderman's copy][ns73-copy].

[p95]: https://drakon.su/_media/video_i_prezentacii/graphical_syntax_.pdf
[p09]: https://drakon.su/_media/biblioteka/drakondescription.pdf
[rules]: https://drakon.su/jazyk/pravila_postroenija_sxem
[syntax]: https://drakon.su/jazyk/vizualnyj_sintaksis
[wrap]: https://rtsys.informatik.uni-kiel.de/~biblio/downloads/papers/report-1803.pdf
[wrap-lncs]: https://doi.org/10.1007/978-3-319-91376-6_72
[elk-strategy]: https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-wrapping-strategy.html
[elk-cutting]: https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-wrapping-cutting-strategy.html
[elk-cuts]: https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-wrapping-cutting-cuts.html
[elk-freedom]: https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-wrapping-cutting-msd-freedom.html
[elk-validify]: https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-wrapping-validify-strategy.html
[elk-forbidden]: https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-wrapping-validify-forbiddenIndices.html
[elk-improve]: https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-wrapping-multiEdge-improveCuts.html
[elk-penalty]: https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-wrapping-multiEdge-distancePenalty.html
[elk-wrapped]: https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-wrapping-multiEdge-improveWrappedEdges.html
[elk-spacing]: https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-wrapping-additionalEdgeSpacing.html
[elk-gs]: https://github.com/eclipse-elk/elk/blob/b715fb10e90f3691fee1bd77a6c680247e8b2b0e/plugins/org.eclipse.elk.alg.layered/src/org/eclipse/elk/alg/layered/intermediate/wrapping/GraphStats.java
[elk-bpi]: https://github.com/eclipse-elk/elk/blob/b715fb10e90f3691fee1bd77a6c680247e8b2b0e/plugins/org.eclipse.elk.alg.layered/src/org/eclipse/elk/alg/layered/intermediate/wrapping/BreakingPointInserter.java
[pur97]: https://doi.org/10.1007/3-540-63938-1_67
[pca02]: https://doi.org/10.1023/A:1016344215610
[pca02-abs]: https://eprints.gla.ac.uk/35821
[uml02]: https://doi.org/10.7155/jgaa.00054
[ware02]: https://doi.org/10.1057/palgrave.ivs.9500013
[ware02-abs]: https://research.monash.edu/en/publications/cognitive-measurements-of-graph-aesthetics/
[huang08]: https://arxiv.org/abs/0810.4431
[krohn83]: https://doi.org/10.1177/001872088302500511
[7pmg]: https://doi.org/10.1016/j.infsof.2009.08.004
[7pmg-pre]: https://www.vdaalst.com/publications/p574.pdf
[figl17]: https://doi.org/10.1007/s12599-016-0460-2
[fs15]: https://nm.wu-wien.ac.at/nm/strembeck/publications/emisa15.pdf
[fs15-rec]: https://dl.gi.de/items/5cd2a94f-a6c5-4a14-ab85-779e2ecada3e/full
[flowcons]: https://arxiv.org/abs/1602.02992
[flowcons-pub]: https://doi.org/10.1007/s10270-017-0576-y
[gsch14]: https://doi.org/10.1016/j.jvlc.2013.11.002
[gsch14-abs]: https://orbit.dtu.dk/en/publications/a-linear-time-layout-algorithm-for-business-process-models/
[kitz09]: https://doi.org/10.1109/CEC.2009.28
[kitz09-oa]: https://api.openalex.org/works/doi:10.1109/CEC.2009.28
[pst94]: https://doi.org/10.1145/178243.178258
[pst94-oa]: https://api.openalex.org/works/doi:10.1145/178243.178258
[rpst09]: https://doi.org/10.1016/j.datak.2009.02.015
[iso5807]: https://www.iso.org/standard/11955.html
[gost]: https://www.swrit.ru/doc/espd/19.701-90.pdf
[gostinfo]: https://www.gostinfo.ru/catalog/Details/?id=4138296
[bpmn]: https://www.omg.org/spec/BPMN/2.0.2/PDF
[ns73]: https://doi.org/10.1145/953349.953350
[ns73-copy]: https://www.cs.umd.edu/hcil/members/bshneiderman/nsd/1973.pdf
