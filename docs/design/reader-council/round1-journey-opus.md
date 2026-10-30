# The reader journey: a redesign

Seat: Opus. Lens: the user journey and the information architecture. Round 1.

File names without a directory are in `apps/web/src/ui/components/architecture-model/`. Screenshots are in `/tmp/integrate/reader-council/evidence/`. "Observed" means that I measured it or saw it in a picture. "Decision" means that I choose it. Numbers about the model come from `GET /api/architecture/model` on this repository.

## The position

The reader has no single place. The picture, the header, the sidebar and the address each hold a part of where the person is. The 280 px sidebar holds nearly everything else. The redesign gives the person one place: the module they are inside.

Six decisions carry the whole redesign:

1. The left column becomes the module tree. It holds the place, reads like the repository, and replaces the breadcrumbs in the sidebar, the module list and the missing sideways control.
2. The right sidebar stops being a home for the reader. It is a panel about one selected subject. It is absent until a person selects something.
3. Every reading has one shape: the open scope is a frame, its children are cards inside the frame, and everything else is a small door on the frame's edge. The root is the same shape, with the whole model as the frame.
4. One Read menu merges flows, grammar, walkthroughs and imported views. One History panel merges state and compare. One Key merges the legend, filters and groups. The header goes from 9 controls to 7, and the sidebar's 9 controls leave the surface. The former addresses menu and the Bookmarks menu leave altogether.
5. Each card shows its code path. The tree sorts by code path. A person always has two coordinates: the place in the architecture and the place in the repository.
6. The reader mounts the motion code that still exists in the repository. It writes no new choreography. The cause of the lost transitions is one React key and a smaller set of hooks.

## What I observed

The rows below are the facts that drive the design.

| Moment | Observed | Evidence |
| --- | --- | --- |
| First screen | The pane opens the first registered repository. That repository is unmigrated, so a person reads "Migration required" under Current, Compare and Refresh controls that can do nothing. | `01-start.png` |
| Root picture | 19 cards and 93 line groups. The picture is 4983 by 2799 in a 1319 by 1040 area, a scale of 0.265. A card is 85 by 20 px on screen. A 14 px name is 3.7 px high. | `journey-opus-02-root.png` |
| Root sidebar | The Architecture tab scrolls 7,692 px in a 794 px view, 9.7 screens. Its first words are an agent's note about TASK-549.24. | `journey-opus-02-root.png` |
| Model name | The name is `vKEsyHFk`, which is also the identity. The sidebar sets it as a headline. | `journey-opus-13-draft.png` |
| Left column | The last repository row ends at y 332 and the agent dock starts at y 1023. So 691 px of a 319 px wide column are empty. | measured |
| Selection | The Selection tab scrolls 3,638 px and holds 26 Evidence disclosures. The name takes about 100 px of height. `Open module` sits at y 872. A path breaks inside a word. | `journey-opus-03-selected.png` |
| Sidebar hidden | Breadcrumbs, grammar, Focus, Filters and Explain leave the page. The person loses every reading control. | `journey-opus-04-sidebar-hidden.png` |
| Opening a module | At 43 ms the text "Drawing modules…" replaces the picture. The new picture lands at 828 ms. Nothing moves. The module stays selected after it opens. | `journey-opus-05b-open-settled.png` |
| What can open | The SVG holds 34 label parts, 1 header part and 0 drill marks. A hover shows no tip. Double-click is the only gesture on the picture. | live SVG |
| Sideways | No control exists. | live control list |
| Scope text | In `HTTP serving`, the scope's own heading sits 1,822 px down the tab, under the task note and all 19 walkthroughs. | live measure |
| Flow | The person chooses Sequence first. The pane goes blank with one sentence. A second selector then appears. | `journey-opus-09b-flow-picker.png` |
| State menu | 114 rows in one flat list: Current, 17 states and 96 checkpoints. Compare repeats the list. | `journey-opus-11-state-menu.png` |
| Proposal | The default comparison reports 2,955 changed subjects. The proposal's own record holds 90 changes. The picture still read "Drawing modules…" after 8 s. | `journey-opus-13-draft.png` |
| Walkthrough | The same 19 rows appear at every scope, and 18 start with "Original". The plate takes 285 px. The zoomed card reads well. | `journey-opus-14-walkthrough.png` |
| Focus | Focus on the five parent roots gives 18 cards, 91 lines and a larger picture, 5638 by 3202. The lever does not simplify. | `journey-opus-17-focus-five-parents.png` |
| Far view | `ModelDiagram.tsx:301` passes `far: false`. Forcing the far view on the root helps little. The picture draws too much for a name to help. | `journey-opus-16-root-far-view.png` |
| Small model | The `shop` root has 2 cards and fits at about 3.1 times. Fit has no ceiling. "Implemented · Implemented" is the sidebar's first line. | `journey-opus-18-shop-root.png` |

The model's shape decides the rest. It has 540 modules, 19 roots and 8 tiers. Of the 130 modules with children, the median holds 3 and only 5 hold more than 12. A copy of the projection rule says that neighbors outnumber children in 50 of those 130 scopes. The model has 410 leaves. The model also holds 1,117 relationships, 72 flows, 19 walkthroughs, 17 states, 96 checkpoints, 245 imported bookmarks and 2,614 former addresses.

Inference: most scopes are small. A person almost never needs a large picture. They need the right small picture and a way to move between small pictures without losing their place.

## The layout: one job for each region

Each region answers one question. The picture stays the largest region, and it gains 281 px of width because no sidebar is docked.

```text
+-- 320 px ------------------+-- pane ---------------------------------------------+
| ARCHBOARD      bell gear   | Archboard server / HTTP serving   src/server/       |
| Find                Ctrl K |            Read: Structure v  Current v  Diagram|About|
| archboard v                +-----------------------------------------------------+
|   Agent CLI                | Takes every HTTP call and opens a node's code.      |
| v Archboard server         |                                                     |
|     apps/server            |    [Agent CLI 4]   [Browser 5]        doors, calling|
| v   HTTP serving           |   +-- HTTP serving ------------------------------+  |
|       src/server/          |   |                                              |  |
|       HTTP application     |   |   [HTTP application]    [HTTP listener]      |  |
|       HTTP listener        |   |   [Route handlers]                           |  |
|       Route handlers       |   +----------------------------------------------+  |
|     Code evidence          |    [Workspace packages 26]   [Panes 4]  doors, called|
|   Browser                  |                                                     |
|   Workspace packages       |                                                     |
|   Outside 11               | Key                                                 |
| Working now                |                                                     |
| Talk                       |                                                     |
+----------------------------+-----------------------------------------------------+
```

- The left column answers "where am I, and where else can I go?"
- The pane header answers "what am I reading, and in what state?"
- The caption under the header answers "what is this?" It is one line of 32 px on the pane's ground. It holds the scope's responsibility, or the model's summary at the root.
- The picture answers "how does it fit together?"
- The inspector answers "what is this one thing?" It lays over the right edge of the picture only after a selection.
- The About page answers every question that needs a long list.

Decision: no sidebar is docked in a lone pane. The away behavior in `docs/design/operator-canvas-shell.md:233` becomes the only behavior. A pick lays a 360 px panel over the picture and refits nothing, so the picture does not move under the pointer. The panel eases in over the 160 ms that `SIDEBAR_MS` already sets. If the panel covers the selected card, the camera glides over 520 ms until the card is clear.

## The journey, moment by moment

### The first screen and the starting point

The first screen must show a system or a clear choice. It must never show a repository that the person did not ask for and cannot read.

- Today: the served vault wins, so this machine opens an unmigrated repository under controls that do nothing.
- On screen: the reader tries three sources in order. It opens the reading in the address. Then it opens this browser's last reading. If exactly one repository is readable, it opens that repository. Otherwise it shows the Start page.
- On the Start page: one row for each repository, newest change first. A row holds the name, the model's summary, the module count, the proposal count and the date of the last checkpoint. Repositories that need migration come last.
- Primary action: open the first row, with Enter or a click.
- Removed: the pane header on any surface that is not a reading, and the `Open` button on each row, because the row is the action.

A repository that needs migration keeps its explanation and gains one action. The action is Ask the agent to prepare a migration preview, and it fills the composer. Today the page tells the person to use an agent and offers no way to do it.

### Opening a repository

Opening a repository is one click on its row. The reader then gives the column to that repository.

- Today: the row stays one of six, `Open` is a small ghost button, and nothing about the model appears in the column.
- On screen: the repository list folds into one switcher row at the head of the column. The module tree takes the height under it. The picture arrives with the 760 ms entrance.
- Primary action: read the map, then open a card.
- Removed: the repository list while a model is open. Find reaches another repository, and so does the switcher. Checkout choice moves into the switcher's menu.

Decision: the reader asks for no checkpoints until the History panel opens. Today `ArchitectureModelStage.tsx:135` asks at repository open, and that answer is 6.09 MB here.

### The first picture of a model

The first picture must be a map that a person reads at fit. It says what is inside the system, what is outside it, how the inside parts connect and where each part lives in the repository.

- Today: 19 equal cards and 93 line groups, with unreadable names. The groups are split by relationship kind at `packages/board/src/shared/rules/model-projection.ts:349`. Most labels say only "2 relationships" (`:357`).
- On screen: the whole model is the frame. The 8 modules that are not `external` are cards inside it. Each card shows its name, code path, one line of responsibility and an open mark with its part count. The 11 external modules are doors on the frame's edge, with their names only.
- Lines: one line for each direction between two modules. The count sets the weight. A lit line adds its kinds and labels. From the model data, the 29 directed pairs among the roots become at most 12 inside the frame.
- Fit: the scale has a ceiling of 1.0, so `shop` stops filling the pane at 3.1 times. A card name must be at least 12 px on screen at fit.
- Primary action: open a card. If the model has a tour, the caption offers it.
- Removed: group regions by default, the state note, and every line to an external module except a short stub to its door.

The caption needs a system statement, and the model has none. `model.json` holds a name and a current designation (`CONTEXT.md:16-17`). Decision: add one optional authored `summary` to `model.json`. The study at `docs/design/pane-sidebar-hierarchy.md:95` already says scope comes first, and product success depends on reading a system "from its model alone". When the summary is absent, the caption is absent.

This repository also needs its name fixed, because `vKEsyHFk` is an identity and not a name.

### Going down

A person goes down because a card interests them. The picture must say which cards open, and the move must feel like entering the card.

- Today: no mark, no tip, an 828 ms text state, a cut, and a leftover selection. `Open module` leaves the Architecture tab open, and a double-click leaves the Selection tab open.
- On screen: the renderer's existing drill mark returns (`crates/archboard-scene/src/paint/drill_mark.rs`), with the part count beside it. A pointer that rests on a card shows the tip that the old canvas showed.
- Gestures: double-click, Enter on a selected card, the gold action in the inspector, or a click on a tree row. Each gesture does the same thing.
- At the click: the crumbs, the caption, the tree and the path update at once. The picture then flies into the card over the 720 ms dive.
- After the move: the selection clears, as `use-drill-moves.ts:3` did, and the inspector closes.
- Primary action on a leaf: `Open code`. It takes the gold style, because 386 of the 410 leaves have a binding and have nothing to open below them.

The picture never shows text in place of a picture. If the next picture is late, the current picture stays dimmed and zoomed into the card until the next one arrives. The reader starts to prepare a card's picture after the pointer rests on it for the existing 140 ms.

### Going up

Going up must return the person to where they were. It must not rebuild the parent from nothing.

- Today: the breadcrumb sits in the sidebar at 13 px. If the sidebar is hidden, the breadcrumb leaves the page. Browser Back works.
- On screen: crumbs live in the pane header, and they fold in the middle on a deep path, as the old `PaneHeader` did.
- Gestures: Backspace, the frame's header, a crumb, a tree row, or browser Back. Back follows history, and the other four follow containment.
- Motion: the reverse dive. A jump of several levels is one flight out of the ancestor's card.
- On arrival: the camera returns to where the person left it, as `use-drill-places.ts` did. The card they came from wears a soft ring that fades after 1,200 ms. No inspector opens.
- Primary action: none is needed. The person continues from the same place.

### Going sideways

Architects move sideways along what talks to what, and also through siblings. Both routes must exist, and neither exists today.

- Today: the person goes up, selects a sibling, and opens it. Neighbors are full cards with the same weight as children, as in `journey-opus-07-depth2.png`.
- On screen: neighbors are doors. A door is a small card with an icon, a name and a count. Callers stand above the frame and called modules stand below it, each with a short stub to the frame's edge.
- Gestures: a click selects a door and lights which children it reaches. A double-click opens the door. `[` and `]` move to the previous and next sibling.
- Motion: the door grows into the frame while the old frame shrinks into a door. The picture transition already carries shared subjects, so this is the same 640 ms carry.
- Primary action: open the door.
- Removed: the Nearby modules list and full-size context cards.

### Keeping one's place

Five things hold the place, and all of them update at the click:

- The tree lights the path from the root to the open scope in gold, and it keeps that path open.
- The header names the scope, its crumbs and its code path.
- The caption says what the scope does.
- Going up restores the camera and marks the card the person came from.
- The address holds the whole reading, as it does today.

Decision: no minimap. The tree is the map, and it costs no space that the column does not already have.

### Asking what a part does

A single click must answer "what is this?" without a scroll. The answer needs at most one screen.

- Today: a 280 px column and a 40 px display name. Then come the full description, `Documents`, the actions at y 872 and 26 Evidence disclosures.
- On screen, in the inspector:
  - the icon, the name at title size, the kind and the code path with a copy control
  - the responsibility, then the first three lines of the description, with More for the rest
  - how it stands, only in a comparison, with an open issue, or with a code warning
  - Sends to and Receives from, grouped by neighbor, with at most five rows and then All
  - Flows through it, with at most three rows and then All
- Pinned foot: a module with parts has gold `Open <name>` and a secondary `Open code`. A leaf has gold `Open code`. Ask stands beside them.
- Rows: a row that the pointer rests on lights its line on the picture. The old `Peek` did this, and `ModelDiagram.tsx:182` turned it off.
- Removed: Interface, Local code history, Documents, Definition and Former names. All move to About.

Ask replaces the Explain menu. Today that menu shows four items, some disabled, and it appears with nothing selected (`journey-opus-15-explain-menu.png`). Ask offers only the actions that apply, and the answer appears in the inspector. A right-click opens a menu at the pointer: Open, Open code, Ask, Focus, Copy path. Today a right-click opens a menu in the far sidebar (`ModelReading.tsx:147-152`).

### How a person relates a module to the code

The owner's decision is settled. Layer 0 to Layer 7 are deleted, no groups replace them, the card shows its code path, and navigation reads like the repository.

The layers cost more than they gave. They put 315 of the 540 modules, 58 percent, one tier deeper. They are the only users of kind `other`. `packages/` is flat on disk, with 17 directories, so no folder matches any layer. Layers 1 to 4 each hold one child. A layer number is also a derived fact: `docs/agents/boundaries.md:8` says that `tests/system/repository-policy/package-graph.test.ts:26` declares the layers and refuses upward imports. The rule stays enforced there. The model does not need to repeat it.

The deletion goes through a proposal. It reparents the 17 packages to `Workspace packages` with `set.parent` and removes the 8 containers in the same batch (`skills/archboard/references/canonical-models.md:386,408`). The package identities stay. The mean leaf depth falls from 3.72 to 3.14, and the deepest path falls from 7 to 6. The `Workspace packages` scope grows from 8 to 17 children. Its picture then joins 50 directed package pairs, where the layer picture joined 28. Callers still read above foundations, because the picture's reading order already does that (`docs/design/grading-council/criteria.md:65`).

Four rules then relate every module to the repository:

1. Every container has a code folder. A module with a binding uses its binding. A module without one uses the shared folder of its bound descendants, through one shared rule, `moduleCodeRoot`. After the deletion, 54 of the 55 unbound containers have a shared folder at or below `apps/x` or `packages/x`. Only `Layout investigation` spans two units, and it shows "2 folders".
2. Each card shows its path, relative to the open scope. The root shows `apps/server` and `packages/renderer`. Inside `packages/renderer`, a card shows `src/shared/rules/blocks`. Relative paths stay short, and the header gives the full path. A derived folder ends in `/`, so a person can tell it from an authored binding. The projection must stop removing the binding at `model-projection.ts:381`. In the far view, a card keeps its name and path and drops its description.
3. The tree sorts siblings by code path, then lists external modules behind one `Outside` row. The root reads `apps/cli`, `apps/server`, `apps/web`, `apps/workbench-example`, `evals`, `packages`, `scripts`, like the repository. The lit path shows a mono path segment under each name, so the open path reads as a file path from top to bottom. Other rows show the path on hover.
4. A person who starts from a file finds the module. `findModules` already matches `binding.path` and `binding.symbol` (`apps/web/src/ui/rules/architecture-model/search.ts:36`). Find will show the matched path in the row and rank a path match level with a name match.

`Open code` also uses `moduleCodeRoot`, so an unbound container opens its folder. Decision: no second tree organized by folder. It adds a mode, and Find plus a path-sorted tree already answer the question with one mechanism.

### Flows, sequence and flowchart

A flow is a noun that belongs to a scope. A grammar is a way to draw that noun. Today the product asks for the grammar first, which offers a blank pane before it offers a choice.

- Today: `Sequence`, a blank pane, then a selector of flow names. `Choose an authored flow to read its behavior.` is a state that the product creates for itself.
- On screen: the Read menu in the header lists the flows that touch the open scope, through the existing `relevantFlows` (`apps/web/src/ui/rules/architecture-model/flow-reading.ts:11`). The inspector lists the flows through the selected part. Find lists flows by name.
- Primary action: choose a flow. It opens as a sequence with the scope's participants lit.
- While a flow is open: the Read control shows the flow's name. A two-way `Sequence | Flowchart` toggle stands beside it. The toggle exists at no other time.
- The tree: rows of the flow's participants wear a small mark. This answers where the flow runs in the structure.
- Motion: cards lift from their places to the head row, because a participant has the same identity in both pictures. A participant inside a closed card rises from that card. Lifelines then draw down, and steps appear in order. Esc returns to Structure with the camera as it was.
- Inside a flow: clicking a participant opens the inspector. Its foot offers Show in structure, which opens the parent scope with that module selected.
- Restored: the sticky participant heads of `use-sticky-heads.ts`, which keep the head row in view on a long sequence.
- Removed: the grammar selector, the second flow selector and the empty flow state.

The Read control is absent in a scope with nothing to read. That is 37 of the 130 parents for flows. `open` also leaves the old `flow` in the address (`apps/web/src/ui/hooks/architecture-model/use-model-location.ts:202`), and that needs a fix.

### Comparing proposals

Reading a proposal is reading a pull request. A person wants the change set, a way to walk it, and the architecture around it.

- Today: two selectors that repeat 114 rows, a word "Default" that says nothing, and a count of 2,955 for a proposal that records 90 changes.
- On screen: the state chip opens the History panel, a 480 px panel from the left of the pane. Proposals come first: name, summary, the count of its own changes, whether current moved past its base, and Open and Open beside.
- After opening: the header reads `TASK-446` against `its base`, as two chips. The second chip offers its base, Current and Other.
- The base: the default base is the proposal's own predecessor, so the count says what the proposal changes. If current moved, one line says so and offers Compare with current.
- The picture: changed subjects wear the existing marks, and unchanged subjects recede.
- The tree: each row wears a mark and a count of changed subjects below it, as a file tree does in a code review. This is the table of contents for the change.
- Primary action: `N` and `P` walk the changes. Each press opens the right scope, selects the subject, and shows before and after in the inspector.
- Motion: the carry, with the camera held by `sharedShift`. Shared cards stay in place and only the change moves.
- Removed: `Compare · Default` as a permanent control.

Competing options stay side by side through Open beside, which uses the existing second pane. Reconciliation moves onto the proposal's row. If the open proposal needs it, the header shows it too.

### Reading history

History is rare, and a first reader never needs it. It must not take the first place on any surface.

- Today: `Implemented · TASK-549.24` and two paragraphs lead the sidebar. Checkpoints share one flat menu with proposals.
- On screen: the second part of the History panel. One group for each state, closed: `TASK-549.24 canonical module ownership` (35), `TASK-482.07` (32), `Migration baseline` (18), `TASK-549.24` (7), `Original legacy documents` (4). A row leads with the `doing` sentence and the date, and the hash comes last in mono.
- Shelved proposals: one closed group.
- On a retained reading: the chip reads the date and "read only", and a 2 px line runs under the header. Nothing else changes.
- Primary action: open a checkpoint.
- Motion: the carry, as for a proposal.
- Removed: the decision text from the first screen. The reason and the documents move to the row of that state. `ModelPublication` moves there too.

### Walkthroughs

The walkthrough is the best surface in the product, because it shows a readable card and a sentence. It needs less height, and it needs to teach the person where they are.

- Today: 19 rows at every scope, at 1,497 px. The plate takes 285 px, and its Narrate pill holds the filler line "Hear this walkthrough read aloud."
- On screen: the Read menu lists the walkthroughs whose beats touch the open scope. That is 2 at `HTTP serving`, 3 at `Commands` and 11 at `renderer`. The root's caption offers the model's first walkthrough as Take the tour.
- During a beat: the plate holds the rail, the title, the sentence and the keys, at about 180 px. Narrate is one key in that row. The tree follows the beat with its lit path, so the tour also teaches the structure. Today nothing outside the plate follows the beat.
- Primary action: next.
- Between beats: a beat in a child scope uses the dive, and a beat in the same scope uses the carry. Today the picture swaps at `ModelDiagram.tsx:238`, with only the camera in motion. This comes from the code, and I did not record it frame by frame.
- Leaving: Esc returns to the reading and camera from before the tour. Stay here leaves the tour and keeps the beat's reading, so the author's story opens into free reading.
- Removed: the walkthrough list, and the filler line.

The 18 walkthroughs named "Original …" are data for an agent to rename. The reader must not hide them by prefix.

## What belongs in the right sidebar

The sidebar holds one subject. That rule answers every placement question.

| Item | Today | Decision |
| --- | --- | --- |
| Selected subject: name, kind, path, responsibility, standing | Selection tab | Stays, in the inspector |
| Connections of the subject | Full list with 26 disclosures | Stays, grouped, at most 5 rows |
| Flows of the subject | Absent | Added, at most 3 rows |
| Open, Open code, Ask | Mid-column | Pinned foot |
| Search | Sidebar head | Left column, merged into Find |
| Breadcrumbs | Sidebar | Pane header |
| Selection count, Focus, Clear selection, Explain | Sidebar bar | Inspector and context menu, after a selection |
| Grammar, Filters | Sidebar bar | Read menu and Key |
| State note and decision | Top of the tab | History panel |
| Walkthroughs | Tab | Read menu |
| Scope introduction | Tab, 1,822 px down | Caption and About |
| Modules list | Tab, 1,886 px | Tree |
| Connections list | Tab, 3,487 px | About, where it keeps its keyboard route |
| Groups | Tab | Key |
| Interface, code history, documents, definition | Tab | About |
| Model ownership note | Tab | Removed. It states something unavailable and offers nothing. |

About returns from the old product as the second page of the pane, with `Diagram | About` in the header. It describes the open scope. It holds what the scope is, its parts, connections, interface, flows, walkthroughs, code history and documents. It uses the full width and the old outline. A long list needs a wide page, and the study behind the old About page already showed that. Every list that the sidebar loses lands here, so nothing leaves the product.

## The levers

The levers are good. They are shown all at once, at every moment, and that is the fault. Each lever below appears at the moment of its use.

| Lever | Verdict | Where it lives | When it appears |
| --- | --- | --- | --- |
| Scope | Stays, and becomes the center | Tree, crumbs, picture gestures | Always |
| Focus | Changes | `F`, context menu, and a `Focused on 3` chip while active | After a selection |
| Filters | Merge with the legend | Key, on the picture's lower left | One small button always. It shows a count of hidden rows. |
| Groups | Change | Key: select members, or show the region | Off by default, because they saturate the picture |
| Grammar | Merges into flow | `Sequence \| Flowchart` toggle | Only while a flow is open |
| Flow | Merges into Read | Read menu, inspector, Find | When the scope touches a flow, 93 of 130 parents |
| Walkthroughs | Merge into Read | Read menu, root caption | When a beat touches the scope |
| State | Merges with compare | Chip, then History panel | Chip always, panel on request |
| Compare | Merges into state | Second chip | Only on a reading that is not current |
| Bookmarks | Merge into Read, as Views | Read menu, Find | Only the views that touch the scope |
| Former addresses | Leave the surface | Address resolver only | Never as a control |

Focus needs a real fix. It must draw the selected subjects and the lines between them, and everything else becomes a door. Today it keeps context, so it does not simplify.

The Key is the legend that the reader lost: `SemanticLegend` is not in the reader at all. One row is both the key to a mark and the control that hides it. It lists only what the picture draws, which the old study already required.

Former addresses keep their function. An old link still resolves, and a notice names the new place. A person never browses 2,614 old spellings. Find still matches former names.

## Transitions

The motion code survived. `git diff --stat 396bfd9add2f HEAD` over `picture/` and the dive hooks shows 51 added lines and 2 removed lines, in two files. By grep, only the replay stage still reaches `SemanticDiagram`, so a live reading runs almost none of the code below.

What the old board canvas did at `origin/main`, from its code and docs. I read this and did not run it.

- Dive (`use-dive.ts`, 720 ms): the child's picture sat inside the card, in the parent's coordinates. The camera flew in and the card's words went first. The parent faded, and the child's picture took over in the same commit with no entrance.
- Departure (`picture-departure.ts`, 280 ms): leaving started at the click, not at arrival. Opening zoomed into the card, going back drew the picture away, and anything else faded.
- Carry (`picture-transition.ts`, 640 ms): shared subjects moved from old geometry to new, lines morphed, what left shrank to 0.96 and faded, and what arrived grew in. `sharedShift` moved the camera so the shared cards held still.
- Entrance (`picture-entrance.ts`, 760 ms): frames first, then a wave of cards, then lines drawn from their source, then labels. The time did not depend on the card count.
- Sweep (`picture-sweep.ts`, 180 to 520 ms): each newly lit relationship drew on from source to target, so its direction read before the arrowhead.
- Also: the far view below scale 0.75 (`apps/web/src/ui/rules/semantic-board-canvas/camera/camera.ts:98`), sticky participant heads, hover tips and `Peek` from sidebar rows. It kept a saved place for each level, and it held the last picture during the next draw.

The cause today is small. `ModelReadingCanvas.tsx:52` keys the scene on the scope, and `:77` keys it on the flow. So each move remounts the camera and the picture. It also defeats the `keepPreviousData` at `ModelDiagram.tsx:72`. A new state or checkpoint is a new query key, so `ArchitectureModelStage.tsx:409` shows "Reading architecture…" in place of the reading. `ModelDiagram.tsx:238` calls `stagePicture` directly, with no transition path.

| The person's act | `origin/main` | Today | Required |
| --- | --- | --- | --- |
| First open | Entrance | Nothing | Entrance, 760 ms |
| Open a card | Dive | Text, then a cut, 828 ms | Dive, 720 ms |
| Up, one level or many | Reverse dive, place restored | Cut | Reverse dive, place restored |
| Sideways | Did not exist | Did not exist | Carry: door becomes frame, 640 ms |
| Change state or checkpoint | Carry | Text, then a cut (from code) | Carry, camera held |
| Focus or filter | Entrance for a view | "Updating diagram…" badge | Carry, because the subjects are shared |
| Open a flow | Entrance | Cut | Carry to the head row, then lifelines and steps |
| Select | Lighting and sweep | Lighting only | Lighting and sweep |
| Point at a row | `Peek` | Nothing | `Peek` |
| Walkthrough beat | Carry and camera glide | Camera glide | Dive or carry by relation, with camera glide |
| Inspector | Eases over `SIDEBAR_MS` | Tabs rebuild | Eases in 160 ms, leaves in 110 ms |

Two changes make this work. Remove both keys and let one surface live for the whole reading. Change `continuousPictures` from "same board and same view" to "same model and at least one shared subject", because a recursive model is one continuous thing. The header, tree and caption update at the click and never wait for a picture. Reduced motion keeps the plain moves that the hooks already provide.

## What I would cut

Each row below leaves the main surface or the product.

| Cut | Why |
| --- | --- |
| Docked sidebar and its two tabs | The sidebar's 9.7 screens answered no single question |
| `Implemented · TASK…` as first text | An agent's note is not a system statement |
| Modules list and Nearby modules | The tree and doors replace them |
| `0 selected`, disabled Focus, disabled Clear selection | They describe nothing, and a selection brings its own actions |
| `Refresh` (`ModelFrame.tsx:93`) | The feed is live. Refresh stays only inside a stale notice. |
| `Bookmarks` and `Former addresses` selectors | 245 and 2,614 entries in the header of every reading |
| `Compare · Default` | "Default" says nothing, and compare only means something on a proposal |
| Grammar selector | A grammar without a flow is an empty pane |
| Explain menu with disabled items | Ask offers what applies |
| `Model ownership` disclosure | It states an absence |
| The 26 Evidence disclosures | Evidence moves to About |
| 40 px display name in the panel | The scope's name is in the crumbs and the card |
| "Drawing modules…", "Reading architecture…", "Updating diagram…" | A picture stays on screen until the next picture replaces it |
| `Open` on each repository row | The row is the action |
| Second search field and second shortcut | Find is one field with `Ctrl K` |
| "N relationships" labels | The weight carries the count, and a lit line gives the words |
| Scope's own card inside its frame (`model-projection.ts:73`) | The frame's header is the scope |
| Layer 0 to Layer 7 | The owner deleted them |

Reading controls on the root: 15 today, 5 after. Before: Current, Compare, Bookmarks, Former addresses, Refresh, Find, two tabs, the crumb, Focus, Clear selection, Explain, grammar, Filters and the sidebar toggle. After: the crumb, Read, the state chip, the `Diagram | About` switch and Key. The left column adds Find and the tree, which replace the old Find and the 19 Modules rows.

## Authoring guidance and `archboard check`

A container must relate to code or have a job of its own. Guidance sets the expectation, and `check` catches what guidance misses.

I tested the rules against this model before I proposed them. One test alone, "no relationship of its own and in no flow", flags 40 of the 63 unbound containers. Those include useful containers such as `Painting` and `Workhorses`, so the test is too wide. Two narrower structural rules work:

- Pass-through: one child, no binding, no relationship of its own, and in no flow. This flags 11 modules: Layer 1 to Layer 4, `Cross-thread calls`, `Coordinator news`, `Agent and voice`, `Architecture news`, `Server plumbing`, `Repositories and checkouts` and `Pictures and video`.
- No code and no job: no binding, parts in more than one top-level folder, no relationship of its own, and in no flow. This flags exactly Layer 0, Layer 5, Layer 6 and Layer 7.

Together they flag all 8 layers and 7 other modules out of 130, and nothing else. Both rules need no judgment of a name, so I reject a rule that matches numbered names.

Decision on severity:

- `archboard check` reports both as warnings. Each warning names the subject and the repair: fold the child up, bind the container to its folder, or remove it.
- If an intent creates a "no code and no job" container, the write refuses. No other write refuses on these rules. The rule runs in the existing candidate step, and `packages/board/src/runtime/operations/check/` holds its neighbors.
- A pass-through stays a warning, because an agent can add a container before its second child.
- Reading never refuses. Retained states stay readable.

The guidance change goes in `skills/archboard/SKILL.md:126-127` and in `skills/archboard/references/canonical-models.md`. The `archboard-dev` skill holds no containment guidance today, so it inherits these rules from the consumer skill. Proposed text:

```text
A container is a folder, a package, a deployable or a named job in the code.
Bind each container to the folder it owns.
Name a module with the word the code uses, or with a plain statement of its job.
Do not use a container for a rank, an order, a count or any fact that the code can compute.
Do not add a container with one child unless it has its own code or relationships.
Do not add groups to replace a removed container.
State what the system is in the summary of model.json.
```

## Documents this changes

Three documents need an owner decision or a revision, because the redesign contradicts them.

- `docs/design/operator-canvas-shell.md` needs a new pane sidebar section, because it docks the sidebar and defines its two tabs. TASK-559 acceptance criterion 4 points at this document, so the criterion follows the new text.
- `CONTEXT.md:39` says that authored order controls sibling modules. The tree sorts by path. The renderer keeps authored order, so the rule stays true for the picture, and the document must state the tree's exception.
- `CONTEXT.md:16-17` needs the new `summary` field in `model.json`.

## Order of work

The order puts the cheapest large gains first.

1. Model data: delete the layers through a proposal, fix the model's name, write its summary.
2. Reader wiring: remove the two keys, mount the hooks, restore the mark, tip, far view and `Peek`.
3. Left column: the module tree, the switcher, one Find.
4. Header and caption: crumbs, path, Read, chips. Remove the sidebar bar.
5. Inspector and About, then remove the tabs.
6. Doors and the frame shape, with the renderer seat.
7. History panel and the change walk.
8. `moduleCodeRoot` in the card, tree and opener, then `check` and the skill text.

## Risks and limits

The redesign carries these risks, and the points below stay unconfirmed.

- Doors change what a still picture shows. `docs/design/grading-council/criteria.md:7` says hover must not repair a still picture, and defect 1 at `:89` covers a missing line. A door with a stub states the neighbor and the direction, but not which child it reaches. The renderer seat and the graders must accept this, or the stubs must extend to the child.
- The dive needs the next picture soon. One scope took 828 ms, and TASK-559 records 4.9 s for the root. A slow solve leaves the person on a held picture for that long.
- A code path adds a line to each card. I did not measure the area cost, and the owner's complaint about dead space makes that cost real.
- SVG exports will carry repository-relative paths, because the projection stops removing the binding. The paths reveal no machine directory, but authors of public documents must know.
- Read at the root lists 72 flows and 19 walkthroughs. It needs a filter field and grouping by collection, which I did not design in detail.
- I did not test two panes, keyboard paths or the light theme. The tree and the chips must hold at half width, where the header path folds into a tooltip.
- My account of `origin/main` comes from its code and docs, because I did not run it. The comparison with the proposal's own predecessor rests on one proposal.
