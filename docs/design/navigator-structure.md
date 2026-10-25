# The navigator's structure

A study for TASK-384, made on 2026-09-30. It names what a vault holds and
what a reader does with the navigator. It measures how the tree drew both
before this task, and it sets the representation that replaced it. The visual
authority stays [The navigator](operator-canvas-shell.md#the-navigator) in the
shell reference.

Revised 2026-10-05. The tree has since changed how it draws what this study
derived, and the navigator section of the shell reference states it. A board
and a folder take a 36 px row and a 14 px name, and a variant and the Earlier
row a 30 px row and a 13 px name. A board's mark is its level's icon. Rails and
elbows join the rows, and the line to the selected row is lit in gold in place
of a bar on the row. A board lists its variants while it has more than one,
and a draft nests under the variant it was derived from. The measurements of
the old tree and the research stand as they were found.

## What a vault holds

The listing route reports every board with its name, level, variants and the
drill-downs of the variant its name opens
(`packages/board/src/shared/protocol/board-listing.ts`). The outline turns that into a
tree (`src/ui/board-catalog/lib/outline.ts`). Five structures reach the
navigator:

1. **Folders.** A `/` in a board's name makes a folder. `Platform/Payments/Ledger`
   sits in `Payments`, inside `Platform`. Folders nest as deep as the names
   go. A folder has no level, no variants, and nothing a pane can show.
2. **Drill levels.** A board sits under the board it drills up from: the
   container it says it describes, else the closest coarser board that drills
   down to it. Both boards must be in the same folder. The dogfood vault is
   five levels deep: `Archboard`, `Codex realtime voice`, `Browser application`,
   `Board viewer`, `Semantic renderer`.
3. **Variants in their lifecycles.** Every board has one or more variants.
   Each is current (at most one per board), draft, historical or shelved. A
   predecessor can have several competing successors.
4. **Derivation chains.** A draft can derive from a draft. Every adoption turns
   the current variant historical, so a board that several tasks changed
   holds a chain of historical variants, each derived from the one before.
   In the dogfood vault `Voice coordinator` holds four historical variants
   before its current one. `Board rasterizer` holds five earlier variants, and
   one of them is shelved.
5. **Boards with no current variant.** A board for something nobody has built
   holds only drafts (ADR 0031). Its name opens the draft that no other draft
   came before.

A row also carries facts that are not structure: a long name, a board that
cannot be read, an agent at work, and the panes that show the board.

**The placement rules are product facts, and this task keeps them.** Folders
come first, then the drill parent, then name order that reads numbers as
numbers. A vault with no drill links is one alphabetical list. The order never
moves under the pointer.

The captures use two vaults. The first is a copy of the dogfood vault: 15
boards, drill levels, adoption chains, three shelved variants, no folders. The
second is a scratch vault written through the CLI for this study. It holds 260
boards: folders nested two and three deep, drill chains inside and outside
folders, `Checkout` with a current variant, a chain of three drafts, a
competing draft and a shelved one, `Catalog` with two historical variants and a
draft, `Loyalty programme` with no current variant, two names that wrap, and
twelve folders of twenty boards each.

## Navigation tasks

Archboard has no usage telemetry, so this ranks the tasks by the workflows
that the repository documents (the `archboard-dev` skill, `TESTING.md`).

| Task                                    | How a reader does it                                   | How often                                                                                 | What the tree must show                                                   |
| --------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| See what each pane shows                | A glance at the tree                                   | All the time                                                                              | The board and the variant of every pane, with nothing to open             |
| See a board's variants and open a draft | The rows under a board                                 | Several times per task: every task carries a proposal named after it (`<board>@TASK-123`) | Which boards have proposals, and the live variants of the board on screen |
| Compare two variants                    | Two panes, often on one board (`TESTING.md` section 5) | Once or twice per task                                                                    | Which variant each pane shows, when both show one board                   |
| Go up or down a drill chain             | The tree, or a drill-down on a node in the picture     | Several times a session                                                                   | Nesting that reads at a glance, with the way to the board on screen open  |
| Find a board by name                    | The filter                                             | At the start of a session, and in a large vault whenever the board is not on the way      | The matches in tree order, the matched letters, a count                   |
| See what agents work on                 | Working now, and the lamps in the tree                 | While agents work                                                                         | Where an agent works, whether or not a pane shows the board               |

## The tree before this task

![The navigator before this task: the dogfood vault light and dark, the
scratch vault light and dark](assets/navigator-structure-before.png)

Captured headless at 1920×1080. From the left: the dogfood vault reading
`Board rasterizer` (light), the dogfood vault in two panes (dark), the scratch
vault reading `Checkout` (light), and the scratch vault reading
`Platform/Payments/Settlement` (dark). The two themes measure the same to the
pixel. Only the colours differ.

### Where each part sat

Every x is in pixels from the navigator's left edge, measured from the drawn
glyphs. `L` is the row's `aria-level`.

| Row                       | Disclosure     | Marker              | Name                             | Facts                                                     |
| ------------------------- | -------------- | ------------------- | -------------------------------- | --------------------------------------------------------- |
| Folder, L1                | 17             | lamp 38, icon 52    | 74                               | count, right edge 303                                     |
| Folder, L2                | 31             | lamp 52, icon 66    | 88                               | count, right edge 303                                     |
| Board, L1 to L4           | 17, 31, 45, 59 | lamp 38, 52, 66, 80 | 52, 66, 80, 94                   | count from 222 (200 with a pane letter), level 257 to 303 |
| Unbuilt board, L2         | none           | lamp 52             | 66                               | count from 199, "not built" 234 to 303                    |
| Variant under an L1 board | none           | none                | 52                               | lifecycle word, starting at 237, 257 or 270               |
| Variant under an L2 board | none           | none                | 66                               | the same                                                  |
| Nested draft              | none           | none                | 12 more per nesting: 78, 90, 102 | the same                                                  |
| Filter match              | as its kind    | as its kind         | as its kind                      | as its kind                                               |
| Working now entry         | none           | lamp 16             | 30, doing line 30                | age, right edge 303                                       |
| Filter                    | none           | icon 16             | text 38                          | count or hint                                             |

Boards stepped 14 px, nested drafts stepped 12 px, and a variant stepped 0 px
from its board.

### The defects and their causes

The causes cite the code at commit `17aa518e`.

1. **A variant did not indent from its board.** `Synchronous checkout` sat at
   66, the x of its board `Checkout`, although it is one level deeper. The
   variant row computed its own left edge from the board's name column
   (`OutlineRow.tsx:460-468`: `guide = indent(boardDepth) + LEAD_WIDTH - 9`,
   `left = guide + 9 + nesting * 12`). It never used its own depth.
2. **Nested drafts stepped 12 px while boards stepped 14 px.** Two rows at one
   level landed 2 px apart per nesting (level 3: 64 and 66; level 5: 90, 92
   and 94). The cause is `nesting * 12` against `INDENT_STEP = 14`
   (`OutlineRow.tsx:32`).
3. **Variants and child boards interleaved on two grids.** A board listed its
   variants first, then its child boards (`navigator-rows.ts:414`). `Cart`, a
   child of `Checkout`, sat at 80, between the drafts at 78 and 90. A reader
   could not tell whether `Cart` belonged to `Checkout` or to a draft.
4. **An adoption history made a staircase.** Every variant nested under the
   variant it came from, whatever its lifecycle (`navigator-rows.ts:238-251`).
   Each adoption pushed the current variant one level deeper. The current
   variant of `Voice coordinator` sat at level 9, x 142, five levels below its
   board. The most important variant was the deepest one. The filter
   inherited the same staircase.
5. **Folder names sat 22 px right of board names at the same depth** (74
   against 52 at level 1). A folder drew a 16 px icon and a 6 px gap after the
   lamp column, where a board drew its name (`OutlineRow.tsx:271-275` against
   `312-315`).
6. **The marker column meant different things per kind.** A board reserved an
   8 px lamp column that was empty unless an agent worked. A folder added an
   icon after it. A variant had neither a disclosure nor a marker, so its name
   started where the board's lamp column was. The guide of a variant list ran
   at 57, through the board's lamp column, not under its disclosure.
7. **Facts floated.** The level word sat in a 46 px box, and everything else
   was sized by its content (`OutlineRow.tsx:389-433`). The count moved from
   222 to 200 when a pane letter appeared. "not built" was wider than the level
   box and pushed the count to 199. The lifecycle words differ in width
   (`current`, `draft`, `historical`), so a pane letter landed at 248 on one
   variant and at 235 on another.
8. **Two rows looked selected.** The board row took the reading tone and the
   cobalt bar, and its variant row took the tone and cobalt text
   (`rowTone(row.active)`, `OutlineRow.tsx:297` and `469`). The cobalt name on
   the dark tone measured 2.75:1, under the 4.5:1 that WCAG asks of 12 px text.
9. **Rows differed in rhythm and in overflow.** Board rows were 32 px and
   variant rows 28 px, with 1 px gaps between rows (`BoardOutline.tsx:92`). A
   board name wrapped to two lines, and a variant name was cut to one
   (`Dead-letter handling for pa…`).
10. **The read error sat on no column.** It was indented a fixed 30 px
    (`OutlineRow.tsx:444`), whatever the row's depth.
11. **Pane B's variant was hidden.** Only the active pane's board listed its
    variants (`navigator-rows.ts:301-304`). With pane B on a draft of another
    board, the B letter sat on the board row, and nothing said which variant
    B showed.
12. **The column had four text edges.** The filter text started at 38, the
    Working now names at 30, the top board names at 52 and the top folder names
    at 74.
13. **A board had two disclosures.** The chevron opened its child boards, and
    the count opened its variants. Right arrow did one, then the other.

## How established trees show nesting

- **One fixed step per level, and the disclosure after the indent.** VS Code
  indents 8 px per level by default (`workbench.tree.indent`, 4 to 40), then
  draws a 16 px twistie
  ([listService.ts](https://github.com/microsoft/vscode/blob/main/src/vs/platform/list/browser/listService.ts),
  [abstractTree.ts](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/tree/abstractTree.ts),
  [tree.css](https://github.com/microsoft/vscode/blob/main/src/vs/base/browser/ui/tree/media/tree.css)).
  Primer's TreeView steps 8 px behind a 16 px toggle column
  ([TreeView.module.css](https://github.com/primer/react/blob/main/packages/react/src/TreeView/TreeView.module.css)).
  Carbon steps 16 px without icons and 24 px with them
  ([TreeNode.tsx](https://github.com/carbon-design-system/carbon/blob/main/packages/react/src/components/TreeView/TreeNode.tsx)).
  Fluent 2 steps 24 px
  ([usage](https://fluent2.microsoft.design/components/web/react/core/tree/usage)).
  AppKit indents the disclosure triangle with the cell by default
  ([indentationMarkerFollowsCell](https://developer.apple.com/documentation/appkit/nsoutlineview/indentationmarkerfollowscell)).
- **A leaf keeps the disclosure's width**, so icons and names at one depth
  line up. VS Code keeps the 16 px twistie on every row. Primer reserves its
  toggle column. Fluent adds 24 px for a leaf. Carbon adds an offset for the
  missing expand icon.
- **Either every row has a leading visual, or none has.** Primer states it
  outright ([TreeView](https://primer.style/product/components/tree-view/)).
- **Guides.** VS Code draws one 1 px guide per ancestor level, on hover by
  default, and keeps the guide of the focused branch lit. Primer draws one
  line per level of nesting, on hover or focus
  ([guidelines](https://primer.style/product/components/tree-view/guidelines/)).
  Fluent and Carbon draw none.
- **Row height.** The VS Code explorer uses 22 px. Primer, Fluent and Carbon
  use 32 px, with a 24 px compact size.
- **A secondary kind of child is set apart by its glyph, not by its indent.**
  Notion marks a database's views with a dot instead of a page icon
  ([sidebar](https://www.notion.com/help/navigate-with-the-sidebar)). Figma
  gives each layer type its own icon
  ([layers](https://help.figma.com/hc/en-us/articles/360039831974)).
- **Versions stay out of the child list.** Figma shows a branch count on a
  file and lists branches apart, with active and archived tabs
  ([branching](https://help.figma.com/hc/en-us/articles/5668839659415)). Google
  Docs keeps versions in a separate history panel
  ([version history](https://support.google.com/docs/answer/190843)).
  JetBrains groups branches under Recent, Local and Remote nodes
  ([branches](https://www.jetbrains.com/help/idea/manage-branches.html)).
- **One selected row, drawn as a leading bar and a tone, with its path open.**
  The WAI-ARIA pattern allows no more than one selected node in a
  single-select tree, gives the tree one tab stop, and sends focus to the
  selected node when the tree takes focus
  ([tree view pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)).
  Primer draws the current item as a tone and a bar and opens the path to it.
  Carbon draws a 4 px bar.
- **Depth costs width.** NN/g warns that each tier of indenting takes room
  from the content, and that deep hierarchies are harder to use
  ([local navigation](https://www.nngroup.com/articles/local-navigation/),
  [flat and deep](https://www.nngroup.com/articles/flat-vs-deep-hierarchy/)).
  Primer asks to reconsider a tree whose common paths pass ten levels.

## The representation

### One grid

Every row is the same four columns, placed by its depth alone
(`src/ui/shell/lib/tree-grid.ts`):

| Part                                | Width         | x at depth d                            |
| ----------------------------------- | ------------- | --------------------------------------- |
| Disclosure: a chevron, or its space | 16            | 8 + 16d                                 |
| Marker: what kind of row it is      | 16            | 24 + 16d                                |
| Name, after a 6 px gap              | the rest      | 46 + 16d                                |
| Facts, ending at one edge           | their content | right edge 12 px from the column's edge |

The step is 16 px, one disclosure column. A row's disclosure therefore sits
under its parent's marker. This is Carbon's step without icons, and twice the
compact step of VS Code and Primer. It reads at a glance in a 320 px column,
and a name at depth 5 still keeps about 170 px. Every open row draws a 1 px guide
through the middle of its disclosure, down beside everything under it. The
guides stay on, because what sits under what was the question the old tree
could not answer. Every row is 28 px for one line of name and 46 px for two.
The filter's icon and Working now's lamps sit in the marker column of depth 0,
and their text starts at 46, the name column of depth 0. The column has one
text edge.

### Rows by kind

| Row     | Disclosure                                    | Marker                                                                                                       | Name                                                   | Facts                                                                           |
| ------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Folder  | Always                                        | Folder, open or closed                                                                                       | 13 px, medium                                          | How many boards it holds                                                        |
| Board   | When it has boards under it or lists variants | A diagram glyph                                                                                              | 13 px, medium; semibold while the active pane shows it | Pane letters while none of its variants is listed, "not built", how many drafts |
| Variant | Its space                                     | Its lifecycle: a check for current, a branch for a draft, a clock for historical, an archive box for shelved | 12 px, regular; muted for historical and shelved       | Pane letters                                                                    |
| Earlier | Always                                        | A history glyph                                                                                              | "Earlier", 12 px, muted                                | How many variants it holds                                                      |

Every row has a marker, so the marker column is a column. Hovering a board's
name shows its whole name and its level, and hovering a variant's mark names
its lifecycle. Both are said to assistive technology. The header names the
level of the board being read. A board row no longer repeats its level. The level was the same word on most rows of a folder and
took 46 px from every name.

### Variants

A board's variants sit one depth in, directly under it and before the boards
it drills down to. They sit on the same grid as a child board. Three things
set them apart at a glance: the lifecycle mark, a smaller and lighter name,
and their place first under the board.

- **The live variants come first.** The variant the board's name opens comes
  first, then its other live variants as the board lists them.
- **A draft nests under the variant it was derived from.** A draft derived
  from the current variant nests under it, and a draft derived from a draft
  nests under that draft, so the list reads as a timeline with a branch for
  each proposal. History never nests, so adoptions make no staircase.
- **Historical and shelved variants wait behind one Earlier row**, newest
  first. The row opens when a pane shows one of them. While a filter is on,
  the variants it finds are listed directly under their board, in the same
  order, with no Earlier row.
- **A board lists its variants while it has more than one.** A board has one
  disclosure, and opening it lists its variants and its child boards
  together. A board whose other variants are all history lists its current
  variant and one Earlier row, so a board with a history always shows a
  chevron, whether or not a pane shows it.
- **The draft count stays on the board row**, as Figma keeps a branch count on
  a file, so a reader sees which boards carry proposals without opening them.

The lifecycle mark, the rule that historical and shelved variants recede,
and the order above live in one module, `src/ui/variant-lifecycle`, so every
place that names a variant says it the same way. The header draws the same
mark before the variant it names.

### What the panes show

- The way to every pane's reading is open: its folders, the boards above it,
  its board, and the Earlier row when the pane shows an earlier variant. A
  person can close part of it. It opens again when a pane moves.
- Each pane letter sits on exactly one row, the most specific row drawn: the
  variant's row, else the board's row. Letters show while two panes are open.
- One row is selected: the most specific row of the active pane. It takes the
  reading tone and a 2 px cobalt bar. Its name keeps the foreground colour
  (16.9:1 light, 13.5:1 dark). The active pane's board row sets its name in
  semibold, and takes no tone.
- An agent at work lights a lamp on the corner of its board's marker. A closed
  folder or board with an agent at work inside it shows a faint ring there.
  Working now lists the same boards at the foot.

### States

| State                       | What the tree shows                                                               |
| --------------------------- | --------------------------------------------------------------------------------- |
| Empty vault                 | One line at the name column: an agent makes a board with `archboard semantic new` |
| Reading the vault           | Grey bars at the name column                                                      |
| The listing failed          | The reason and Retry                                                              |
| One board                   | One row with no disclosure                                                        |
| A filter with no match      | "No board matches" with Clear, and a count of 0                                   |
| A long name                 | Two lines, then an ellipsis; the whole name on hover                              |
| Deep nesting                | One more step per level; a name at depth 5 keeps about 170 px                     |
| A few hundred boards        | Folders closed except the way to the panes; top boards with children open         |
| A board that cannot be read | The reason under its name, starting at the name column                            |

## What the redesign left alone

The placement rules, the filter's keys (Ctrl K, `/`, typing; Enter, Alt+Enter,
Escape), its dimmed ancestors, marked letters and count, the tree's one tab
stop and arrow keys, revealing the row a pane moves to, and Working now's order
all keep their behaviour. The tree's keys follow the WAI-ARIA pattern more
closely than before: Right opens a closed row, then steps in; Left closes an
open row, then steps out. That is one step fewer, because a board now has one
disclosure.
