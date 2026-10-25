# The board tab: what a reader comes for, and in what order

TASK-383. This study comes before the redesign of the Board tab of the pane
sidebar. It names the tasks a user brings to the tab, how often each one comes
up, how people read an architecture diagram, and what the tab shows today. The
last section derives the hierarchy that the redesign builds. The pane sidebar
section of [operator-canvas-shell.md](operator-canvas-shell.md) states the
result as the visual authority.

Revised 2026-10-03 (TASK-388). The tab no longer lists the variants of a board
that a reader reached by a drill-down (task 7 below). The About page of the
pane's header lists them with the record of each and opens one in the pane. The
header's breadcrumb names the one on screen. The changes section names the
variant that it is compared with in its own heading. The rest of the study
stands as it was found.

Revised 2026-10-25 (TASK-537.01). A region of design questions sits between
the reading region and the legend. It answers a question that no task below
names: where understanding or changing the code can take more work than it
should. The pane sidebar section of
[operator-canvas-shell.md](operator-canvas-shell.md) states what it shows.

The evidence has three kinds. The product documents say what each element is
for. The boards in `.archboard/vault` and `examples/web-shop` say how often
each element has anything to show. Research on diagram reading and interface
design says in which order a reader needs the elements. Sources are listed at
the end, and the text cites them by number.

## What the boards hold

Eighteen boards were counted: the fifteen of the dogfood vault and the three of
the web shop example. The counts are of the variant that a bare board name
opens.

| Element                    | Boards with none | Boards with some | Range per board                         |
| -------------------------- | ---------------: | ---------------: | --------------------------------------- |
| Summary of the variant     |                1 |               17 | one or two sentences, 47 to 156 letters |
| Walkthroughs               |                1 |               17 | 1 or 2, of 3 to 8 steps                 |
| Views (besides Everything) |                5 |               13 | 2 to 5; 9 of 42 views are data-flow     |
| Summary of a view          |                  |                  | 34 of 42 views have one                 |
| Groups on the variant      |                5 |               13 | 1 to 5                                  |
| Node kinds drawn           |                0 |               18 | 1 to 7                                  |
| Relationship kinds drawn   |                0 |               18 | 1 to 6                                  |
| Variants                   |                  |                  | 4 boards have 1; 14 have 2 to 6         |
| Drill-downs                |                1 |               17 |                                         |

Emphasis and traffic are on 18 of 18 boards. The longest names are a
walkthrough of 49 letters ("Why a picture is refused rather than
approximated") and a view of 33 letters. Every board but one can be reached
by a drill-down, so a user meets a new board by following a link as often as
by choosing it in the navigator.

Two facts stand out. First, the summary of the variant is written on 17 of 18
boards, and the skill tells an agent to write it as the board's scope. The
shell shows it nowhere. Second, 34 of 42 views carry a summary of what the view
answers. The shell shows none of them either.

## The tasks a user brings to the tab

Each task is named for what the user wants to know. The frequency says how often
the task comes up in the product's workflows, as the documents describe them.

1. **Orient: what is this board, and what am I looking at?** Every arrival at a
   board, which includes every drill-down. The header names the board and its
   level, and names the variant when it is not the current one. Only the summary
   says what the board is about. High frequency on a first read, and on each
   new board of a drill path.
2. **Read a proposal: what does this variant change?** Every variant but the
   current one is drawn against the current one with change marks (ADR 0023).
   Every task in this repository carries a board proposal (the `archboard-dev`
   skill), so proposals are read in review. The marks are the reason to look at
   such a variant. Medium frequency, high value.
3. **Follow the author: take the explanation the author wrote.** A walkthrough
   is "for explaining architecture" to leadership, to a pull request's
   reviewers and to somebody new to the code (ADR 0023, the `archboard`
   skill). 17 of 18 boards offer one, and several are named "Read this board".
   Once per reader per variant: high value on a first read, low on a return
   visit.
4. **Change the reading: look at one path, one exchange, one container.** A
   view is "a subset a reader wants alone" (the skill), and a sequence is read
   only through its data-flow view. 13 of 18 boards offer views. This is the
   control a returning reader uses most.
5. **Find a concern: which parts belong to one effort, team or migration?** A
   group's colour marks its members wherever containment puts them (ADR 0038),
   and choosing a group selects them. 13 of 18 boards use groups. Occasional.
6. **Look up a mark: what does this icon, line or colour mean?** The legend is
   "the one explanation" of appearance (ADR 0025, amended 2026-09-27). The
   vocabulary is shared by the whole vault, so a reader learns it once per
   vault and looks up a kind again only when a new one appears. High frequency
   on a first read, falling with experience.
7. **Choose a variant of a board a level down.** The navigator holds the
   variants of the pane's own board. A board reached by drill-down offers its
   variants in the tab instead (TASK-249). Only after a drill-down.
8. **Change the layout engine.** A preference of this browser for every pane
   (ADR 0040, TASK-348). It says nothing about the board. Rare.

## How a person reads an architecture diagram

The research agrees on an order more than on any single rule.

**Scope first.** C4 asks that "every diagram should have a title describing
the diagram type and scope", and its review checklist asks "Do you understand
what the diagram scope is?" [11, 12]. Shneiderman's mantra starts with
"overview first" [13]. A reader who does not know what a board is about reads
every box to find out. In the eye-tracking study of UML diagrams, weaker readers
scanned top to bottom and examined almost every class [5].

**Then the notation, while it is new.** Larkin and Simon show that a diagram
saves search and recognition, not reading [1]. Recognition needs the notation.
Petre found that reading graphics is a learned skill, and that novices do not
see structure that experts see [2]. Moody asks that text reinforce each symbol
and that the key use the diagram's own symbols [4]. The map legend research adds
three findings. Show only what is on the map, because readers do not want "a
legend that is showing things that are not on the map" [8]. Draw each symbol in
the key the way the map draws it [8]. Attention to the legend falls with each
task on the same map [9]. C4 requires a key on every diagram [11]. So the key
must always be there, but it is a lookup that a reader needs less and less. It
does not need the first place.

**Then a path.** Readers follow lines to navigate [5], and they follow the line
nearest the straight path to their target [6]. That is work on the picture,
not in the tab. The tab helps by narrowing the picture: a view is a subset that
a reader wants alone, which is Shneiderman's "zoom and filter" [13]. Narrative
visualisation research adds the author's path. In the martini glass structure,
the author's narrative comes first and then opens out to free exploration. The
authored part is "a jumping off point" [20].

**Then a part or a cluster.** Experts in the UML study "used clusters as units
of navigation (and not classes)", and found them by colour [5]. A group is that
kind of cluster in archboard. Its colour is on the picture, and its row in the
tab is both its key and the way to select its members.

**Comparing a variant.** Marks drawn on the picture combine superposition with
explicit encoding [21]. Colouring added and removed elements gave significantly
fewer errors when readers counted changes [22]. So the marks are the right
mechanism, and the tab should key them and count them. A proposal's reader
needs that key at once. Green and Petre call this visibility: "whether
required material is accessible without cognitive work" [3]. Apple's guidance
says to avoid "putting critical information or actions at the bottom of a
sidebar" [19].

**How the tab itself is read.** Readers scan headings first, so headings must be
distinct and say what their section holds [16]. A hierarchy guides the eye in
the order of importance with about three type sizes, and "if everything is
contrasted, then nothing stands out" [17]. Whitespace groups as well as a
border does, with less clutter [18]. Progressive disclosure shows the most
important options first [14]. Accordions hurt when a reader needs most of the
content or when there is little of it [15], which is the case for every section
here: the longest list on any board is six rows.

## What the tab shows today

![The Board tab before TASK-383: the draft Queued fulfilment of the web shop
in the light theme, and Inventory service reached by a drill-down in the dark
theme](assets/pane-sidebar-before.png)

Left: `Web shop@Queued fulfilment`, a draft read against the current variant,
light theme. Right: `Inventory service`, reached by a drill-down from the web
shop, dark theme. Both captures are 1920 px wide with a viewport tall enough to
show the whole tab.

The tab is a stack of six sections of equal weight: State, View,
Walkthroughs, Groups, Layout engine and Legend. Each has the same uppercase
kicker heading, the same padding and the same rule under it. So the position
of a section says nothing about its rank, and nothing guides a first read.

| Element                                    | Task | Rank | What is wrong with it                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------ | ---- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tab row: Board, Selection, collapse        | all  | 0    | The tab labels start 8 px from the edge and the content starts at 16 px, so the column does not start on one line.                                                                                                                                                                                                                                    |
| (missing) summary of the variant           | 1    | 1    | Written on 17 of 18 boards and shown nowhere. A first reader has no sentence that says what the board is about.                                                                                                                                                                                                                                       |
| State: the variants of a drilled board     | 7, 1 | 1    | Named "State", which the domain avoids for a variant. Two lines per variant with an uppercase lifecycle under the name. A single variant is set 8 px left of the buttons above and below it.                                                                                                                                                          |
| View: Everything and the board's views     | 4    | 2    | Headed "View" while its peers are plural. The labels start 11 px right of the heading. The view's summary, written on 34 of 42 views, is not shown, so a reader chooses by name alone.                                                                                                                                                                |
| Walkthroughs                               | 3    | 2    | Below the views, although it is the author's entry point for a first read. A walkthrough row looks like a view row, but it starts a presentation that steps the sidebar aside. Its length (3 to 8 steps) is not shown. A long name is cut off ("Why a picture is refused rathe…").                                                                    |
| Groups                                     | 5    | 3    | Labels start at 47 px, beside a 12 px chip that starts at 27 px, not on the heading's line. A variant with no groups says "No groups on this state." while the views and walkthroughs of a board without any are simply absent: two rules for one situation, and the word "state" again.                                                              |
| Layout engine                              | 8    | 5    | A preference of the whole browser sits between the groups and the legend, in the middle of the board's own sections, and outranks the legend.                                                                                                                                                                                                         |
| Legend heading                             | 6    | 4    | "LEGEND" is an eyebrow: a small uppercase label above the headings "Node types" and "Relationships". The tab thus has two heading levels in one place and one everywhere else.                                                                                                                                                                        |
| Node types                                 | 6    | 4    | 24 px chips at a 34 px pitch, labels at 52 px.                                                                                                                                                                                                                                                                                                        |
| Relationships                              | 6    | 4    | 36 px line samples at a 30 px pitch, labels at 64 px: a third label column in one legend. Emphasis and traffic are explained in two lines of prose rather than keyed by a sample.                                                                                                                                                                     |
| Comparison and attention: toggle and marks | 2    | 1    | The key to the change marks is the last thing in the tab. On the web shop draft it starts at y = 1164 on a 1080 px screen, so the one key a proposal's reader needs first is below the fold. The marks come in a two-column grid with its own label columns (36 and 166 px). The toggle label says "canvas", a word the domain keeps for the surface. |
| Selected                                   | none | none | Keys the ring the user drew by picking something. The user already knows what it means, and at this size the sample reads as an unchecked checkbox.                                                                                                                                                                                                   |

Measured in the light theme on the web shop draft, text in the tab starts at
eight different distances from the left edge: 8, 16, 27, 36, 40, 47, 52 and
64 px. Rows are 30 px apart in the view list, 34 px in the node kinds and 30 px
in the relationships. Section headings are 10 px uppercase, list rows are 13 px
and legend rows 12 px, and the legend's sub-headings are 12 px semibold.

## The hierarchy

The tab answers five questions, in the order a reader asks them. Each question
is one region, and a one-pixel rule separates two regions. Inside a region,
space separates the sections. So a rule means a new question, and nothing else
draws one.

1. **What is this, and what does it change?** Always first, never collapsed.
   - _Variants_, only on a board reached by a drill-down (task 7). One row per
     variant, said as the navigator and the header say it
     (`src/ui/variant-lifecycle`): the lifecycle's mark before the name, a
     historical or shelved name receding unless it is on screen, and the
     navigator's order, the variant the board's name opens first, then the
     other live ones, then the receding ones newest first. The lifecycle is in
     the row's title and accessible name. Unlike the navigator, the list
     gathers no Earlier row: it holds one board's variants, at most six on any
     board, and it is the only place a drilled board's variants can be chosen,
     so hiding some would cost a click where nothing else offers them. The
     order and the recede already put the earlier ones last and quiet. A board
     with one variant shows that one row, not as a control.
   - _The summary_ of the variant on screen (task 1), with no heading. It is
     the board's own statement of its scope, which C4 asks every diagram to
     make [11]. When the variant has none, nothing stands in for it.
   - _Changes_, only on a variant that is read against another (task 2). It
     names the variant it is read against and gives one row for each standing
     that occurs: the pin the picture draws on the corner of such a subject
     [8], the word, and how many subjects stand so [22]. The control that shows
     or hides the marks sits under the rows. While the marks are hidden, the
     rows go, because they would key nothing on screen [8].
2. **How do I read it?** The author's path, then the reader's.
   - _Walkthroughs_ (task 3). The author's explanation is the entry to a first
     read [20]. It is one or two rows on every board, so it costs a returning
     reader almost nothing to pass. Each row shows that it presents, its full
     name, and its number of steps. Narrate sits beside it.
   - _Views_ (task 4). Everything, then the board's views in the order the
     board states them. The view on screen shows its summary under its name,
     so the reader sees what the reading answers where they chose it [18].
   - _Groups_ (task 5). Each row is the group's colour and its name: the key to
     the colour on the picture and the way to select its members [5].
3. **Where can the code take more work than it should?** The design questions
   of the variant on screen (TASK-537.01), only where one has a result. They
   come after the reading region, because a reader asks them of a board that
   they can already read, and before the legend, which stays at the foot.
4. **What do the marks mean?** The legend (task 6), under one heading. The node
   kinds the picture draws, as the picture's chips. The relationship kinds, as
   the picture's lines. Then two samples for what a line's weight and its
   moving pulses say, where there are relationships. Only what the picture
   draws is keyed, in the order the picture draws it [8, 10].
5. **A preference of this browser.** The layout engine (task 8), one row at
   the foot, under the last rule.

The weight follows the rank. The most important and most frequent query gets
the most distinct object [7]. So the summary is the first text of the tab and
its only paragraph in the foreground. The choices are the only text in the
control role, 13 px and medium. Headings and secondary lines are muted. The
legend's labels are body text beside their samples, at the foot.

### What is disclosed

Nothing is collapsed by default, and no section can collapse on its own. The
lists of choices are short (at most six rows on any board), and a reader of a
first board needs most of the tab [15]. The legend is longer, but C4 asks that
the key always be there [11], and the legend already keys only what is
drawn. Hiding the whole sidebar, with the control in the pane's header,
stays the one way to hide it all, the legend included, which keeps the legend
visible by default and hideable (ADR 0025).

A section with nothing to show is absent. This already held for the views and
the walkthroughs. It now holds for the groups too, so a board without groups no
longer says "No groups on this state." One rule for one situation.

Two elements go. The "Selected" sample keys a ring the user drew by picking
something. And the uppercase "Legend" eyebrow over its sub-headings goes with
the sub-headings: the chips and the lines say which list is which.

### Type, spacing and alignment

| Level                                                | Role                          | Weight | Colour                      |
| ---------------------------------------------------- | ----------------------------- | ------ | --------------------------- |
| Tab labels                                           | control, 13/18 px             | 500    | muted, active in foreground |
| Summary                                              | body, 12/16 px                | 400    | foreground                  |
| Section heading                                      | body, 12/16 px, sentence case | 600    | muted                       |
| Choice rows: variants, walkthroughs, views, groups   | control, 13/18 px             | 500    | foreground                  |
| Secondary lines: view summary, "against", step count | body, 12/16 px                | 400    | muted                       |
| Legend labels, change counts                         | body, 12/16 px                | 400    | foreground                  |
| Name of a historical or shelved variant              | control, 13/18 px             | 500    | muted, unless on screen     |

Two type sizes carry the tab, within the three NN/g suggests [17]: 13 px for
what a reader chooses and 12 px for what a reader reads. A variant's lifecycle
is a mark, as in the navigator, not a word. The heading and the summary share a
size and differ in weight and colour, so the summary is read and the heading is
scanned [16].

The same heading role replaces the uppercase kicker labels of the Selection
tab, so the two tabs of one sidebar have one heading style.

Spacing uses a 4 px scale: 4, 8 and 16 px.

- The text column starts 16 px from the sidebar's left edge and ends 16 px
  from its right edge. Headings, the summary, the text of every row, every
  sample and the engine's label start on that line. So does the text of the
  tab labels, which today starts at 8 px.
- A choice's fill reaches 8 px past the text column on either side, so the
  text does not move when the fill appears. The choice on screen takes the
  reading tone and a cobalt bar at its edge, as the navigator's selected row
  does. A choice under the pointer takes half the reading tone and no bar, so
  it never looks chosen. The secondary fill this replaces differs from the
  light sidebar by less than 1 % in lightness, so in the light theme the view
  on screen was hard to see.
- A region has 16 px above and below its content. Sections in one region are
  16 px apart. A heading is 4 px above its first row.
- Every row is at least 28 px high: a choice, a row of the change key, a row
  of the legend and a variant that is said rather than offered. Its first line
  is 18 px, set 5 px from its top, which is how 28 px holds one line; that 5 px
  follows from the row and the line, so it is the one length off the scale.
  Rows of one list touch, with no space between them. A long name wraps
  rather than being cut off.
- A mark before a label sits in a slot of fixed width, and the label starts
  8 px after the slot. The 12 px marks of the walkthroughs, the groups and the
  changes, and the change control's 16 px box, have a 16 px slot, so their
  labels start at 40 px. The samples of the legend have a 28 px slot, so its
  labels start at 52 px. So the tab has three text lines: 16, 40 and 52 px.

### States the tab must handle

| State                                           | What the tab shows                                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The picture is still being drawn                | The summary and the reading region as soon as the board is read. The legend fills when the picture arrives, and keeps the leaving picture's key meanwhile. |
| No views, no walkthroughs or no groups          | That section is absent. A board with none of the three shows the summary, the legend and the engine.                                                       |
| No design question has a result                 | The design questions region is absent.                                                                                                                     |
| One variant, on a board reached by drill-down   | One plain variant row, not a control.                                                                                                                      |
| The current variant                             | No Changes section: there is nothing to read it against.                                                                                                   |
| A proposal identical to what it is read against | The Changes section says so, with no rows and no control.                                                                                                  |
| A view in which nothing differs                 | The Changes section says that nothing in this view differs and keeps the control: the counts are of what the picture draws, and the change is elsewhere.   |
| Marks hidden                                    | The Changes heading, the "against" line and the control. No rows.                                                                                          |
| Many groups or kinds                            | The list grows. The tab scrolls under its fixed tab row.                                                                                                   |
| A long name or summary                          | It wraps. Nothing is cut off.                                                                                                                              |
| A data-flow view                                | The legend keys the participants' kinds. Messages carry no kind today, so the relationship rows and the two line samples are absent.                       |
| A board nobody has built                        | The tab speaks for the draft that the board's bare name opens, as the picture does. Before TASK-383 it read no variant there and showed nothing of it.     |

## Before and after

![The Board tab of Archboard on the dogfood vault before and after TASK-383:
light before, light after, dark before, dark after](assets/pane-sidebar-before-after.png)

The board `Archboard` of the dogfood vault, at 1920×1080, cut to the
sidebar. From the left: before and after in the light theme, then before and
after in the dark theme. The pane sidebar section of
[operator-canvas-shell.md](operator-canvas-shell.md) shows the result on a
board with views and changes.

## Sources

Each finding above was checked against the paper or the official page, except
where the note says the abstract or a citing paper was the source.

1. Larkin, J. H. and Simon, H. A. (1987). Why a diagram is (sometimes) worth
   ten thousand words. _Cognitive Science_ 11(1), 65–99.
   doi:10.1111/j.1551-6708.1987.tb00863.x. Checked against the abstract.
2. Petre, M. (1995). Why looking isn't always seeing: readership skills and
   graphical programming. _Communications of the ACM_ 38(6), 33–44.
   doi:10.1145/203241.203251. Checked against the abstract.
3. Green, T. R. G. and Petre, M. (1996). Usability analysis of visual
   programming environments: a "cognitive dimensions" framework. _Journal of
   Visual Languages and Computing_ 7(2), 131–174.
4. Moody, D. L. (2009). The "physics" of notations. _IEEE Transactions on
   Software Engineering_ 35(6), 756–779. The quoted principles were read in
   Moody, Heymans and Matulevičius (2009), Improving the effectiveness of visual
   representations in requirements engineering, RE 2009.
5. Yusuf, S., Kagdi, H. and Maletic, J. I. (2007). Assessing the comprehension
   of UML class diagrams via eye tracking. ICPC 2007, 113–122.
6. Huang, W., Eades, P. and Hong, S.-H. (2009). A graph reading behavior:
   geodesic-path tendency. IEEE PacificVis 2009, 137–144. Read in Huang (2013),
   _Personal and Ubiquitous Computing_ 17, 93–105.
7. Ware, C. (2008). _Visual Thinking for Design_. Morgan Kaufmann. Chapter 1.
8. Dykes, J., Wood, J. and Slingsby, A. (2010). Rethinking map legends with
   visualization. _IEEE TVCG_ 16(6), 890–899.
9. Hepburn, J. and Fairbairn, D. (2022). Applying eye-tracking for
   interpreting map legend use by professional decision makers. _Abstracts of
   the ICA_ 5. doi:10.5194/ica-abs-5-105-2022.
10. Huestegge, L. and Philipp, A. M. (2011). _Attention, Perception and
    Psychophysics_ 73, 1903–1915. Read in Riechelmann and Huestegge (2018),
    _APP_ 80, 1011–1022.
11. Brown, S. The C4 model: Notation. https://c4model.com/diagrams/notation
12. Brown, S. The C4 model: Diagram review checklist.
    https://c4model.com/diagrams/checklist
13. Shneiderman, B. (1996). The eyes have it: a task by data type taxonomy for
    information visualizations. IEEE Symposium on Visual Languages, 336–343.
14. Nielsen, J. (2006). Progressive disclosure. Nielsen Norman Group.
    https://www.nngroup.com/articles/progressive-disclosure/
15. Wang, H.-H. (2023). Accordions on desktop. Nielsen Norman Group.
    https://www.nngroup.com/articles/accordions-on-desktop/
16. Pernice, K. (2019). The layer-cake pattern of scanning content on the web.
    Nielsen Norman Group.
    https://www.nngroup.com/articles/layer-cake-pattern-scanning/
17. Gordon, K. (2021). Visual hierarchy in UX: definition. Nielsen Norman
    Group. https://www.nngroup.com/articles/visual-hierarchy-ux-definition/
18. Palmer, S. E. (1992). Common region: a new principle of perceptual
    grouping. _Cognitive Psychology_ 24(3), 436–447 (checked against the
    abstract); and Harley, A. (2020). The principle of common region. Nielsen
    Norman Group. https://www.nngroup.com/articles/common-region/
19. Apple. Human Interface Guidelines: Sidebars, and Disclosure controls.
    https://developer.apple.com/design/human-interface-guidelines/sidebars
20. Segel, E. and Heer, J. (2010). Narrative visualization: telling stories
    with data. _IEEE TVCG_ 16(6), 1139–1148.
21. Gleicher, M., Albers, D., Walker, R., Jusufi, I., Hansen, C. D. and
    Roberts, J. C. (2011). Visual comparison for information visualization.
    _Information Visualization_ 10(4), 289–309.
22. Archambault, D., Purchase, H. C. and Pinaud, B. (2010). Difference map
    readability for dynamic graphs. Graph Drawing 2010.
