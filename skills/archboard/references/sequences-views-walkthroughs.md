# Sequences, views and walkthroughs

## Flows

A flow is an ordered exchange between nodes of one variant.

- `participants` are the columns, in the order they are drawn: put the caller
  first and read left to right. Participants compare as a set; their order is
  presentation intent. Every participant names a node of that variant, and the
  participants are a subset of them: a node the board draws need not take a
  column, so the work one part does through the parts it uses can be one step
  with that part at both ends.
- `steps` are messages in sequence, each `from` one participant `to` another
  with a `label` and a `kind`:
  - `sync`: A call that waits (the default), an awaited promise included.
  - `return`: The answer travelling back.
  - `async`: Sent and not waited for: an event, a queue put, a promise nobody
    awaits.
  - `self`: A participant's own step. Exactly when `from` and `to` are the same
    node.
- `repeat` (an integer of 2 or more) says one step happens exactly that many
  times in a run, and only when the source fixes the count: a retry limit
  written as a number, a batch of a stated size, a literal list of candidates
  tried in turn (a loop over two fixed file names is `repeat: 2`, and its
  early exit on the first that exists is the `note`). A loop over a list whose
  length depends on data, or a retry until success, is one step with a `note`
  saying so; a count the source does not state is a count you invented.
- `note` is a caveat on one step, shown beside it: a condition under which the
  step happens (a branch), a loop whose count is not fixed, a detail the label
  cannot carry.
- A flow may have one participant whose steps are all `self`: a component's own
  sequence is a real explanation.
- A step's position is meaningful; a step keeps its identity by the action it
  represents. Restate a flow to insert, remove or reorder steps, keeping the ids
  of continuing calls and returns even when their order or payload changes; a
  flow written again without its ids reads as a wholesale deletion and
  addition.

## Views

Views belong to the board and apply to every variant; editing one is a change
to the board's shared reading even when the batch names a variant. Its
`grammar` is one of:

- `architecture`: Nodes, containment and relationships of the selection.
- `data-flow`: The selected flow as a sequence: columns and messages.

`scope` is either `{ "kind": "all" }` or a selection, and a selection means
one of two different things. Decide which the request asks for before writing
the view, and check the saved `scope` afterwards:

- **Node-region inclusion**: `{ "kind": "selection", "nodes": [...] }` with no
  `edges`. Every relationship among the kept nodes is drawn, whatever
  connects them now or later. Use it when the request says "these parts and
  how they are wired".
- **Explicit-edge isolation**: name relationships in `edges`, by id or
  same-write handle. Only those relationships are drawn; another relationship
  between the same parts stays out. Use it when the request says "only this
  call" or "not that one". Listing `nodes` as well does not add their other
  relationships back.
- **A sequence**: `{ "kind": "selection", "flows": ["<flow>"] }` with the
  `data-flow` grammar. A sequence drawn without its view is the architecture
  picture, not the exchange.

Both ends of a shown relationship, every participant of a shown flow, and every
container they sit inside come with the selection. A selection that names
nothing that exists on a variant draws nothing; it never falls back to the whole
board. A comparison keeps a selected subject the proposal removed, drawn as
removed. Draw a view with
`semantic rasterize <board> --view <name> --out <file.png>` (or
`semantic render` for SVG); without `--view` the whole variant is drawn, never
the first view. When the request asks for a picture of a view, look at that
view's picture, not the whole board's.

## Walkthroughs

A walkthrough explains one variant in ordered `beats`, each with a `heading`,
a `body`, optional `subjects` and an optional `view`.

- `subjects` are nodes, relationships, flows or steps. Name a node or flow by
  its name or id; name a relationship or step, which has no name, by id. A new
  subject of any of those kinds can use its same-write handle. They are
  highlighted while the beat is read and compare as a set. A beat that
  explains an ordering names both of its sides: the step that must come first
  and what relies on it having happened.
- An opening beat may name no subjects: it is about the whole picture.
- `view` switches what the reader looks at for this beat ("now follow one
  request"); a beat without one is told through what is already shown.
- A beat keeps its `id` through rewording and reordering; restate the
  walkthrough with the ids you read. A beat without an id is a new beat, and a
  beat id from another walkthrough is refused. When a subject a beat names is
  removed, point the beat at its successor in the same batch.

A beat is read beside the picture, and the voice explains it from its heading,
its body and its subjects, told on a proposal whether each subject was added or
changed. The voice never sees the view, or a change the beat does not name.
Write each beat so:

- It makes one point, in the order the reader needs the points.
- Its heading states the point, what happens or what holds ("Only the ledger
  writes"), rather than naming what is drawn ("The ledger").
- Its body explains what the picture cannot show: what the point means for
  how the system behaves, with parts named exactly as the board names them and
  the one number that matters when the source states it (a limit, a count, a
  timeout).
- Its `subjects` are the two or three things it is about, so the highlight
  points somewhere.
- It reads at the first attempt: short sentences, active voice, and only terms
  the board itself names.

## Recording a walkthrough

`semantic record <board> --out talk.mp4` presents one walkthrough of the board
in a private headless browser and records it with the Codex voice explaining
each beat: MP4 or WebM, by the file's extension. Each beat moves on once the
voice has finished explaining it. The caption shows the beat's heading and
body, and the voice explains them in its own words rather than reading them
out, so write a body that can be explained in a few sentences. The voice is
also told the beat's subjects and, on a proposal, how each was added or
changed; a change that no beat names is not spoken about.

- `--walkthrough <name>` picks one when the variant states several, and
  `--variant` and `--theme dark` choose what is drawn.
- It needs the Archboard server's Codex signed in and voice not live on that server. A
  refusal says which. It takes about as long as the talk and prints each beat
  as it is reached.
- For a board made only for the video, create it with `semantic new`, look at
  it with `semantic rasterize`, then record with
  `--discard --doing "<why>"`, which deletes the board once the file is
  written. A failed recording keeps the board, so record again. A board that
  changed while it was recorded is kept, and the receipt's `discarded` is
  false with the reason.
- An MP4 plays with sound in every browser when `ffmpeg` is on PATH (or
  named by `ARCHBOARD_FFMPEG`): the recorder converts its sound to AAC. The
  command says when it could not, and why a Safari viewer would hear nothing.

### A pull request's recording

The video is how a reviewer who has not read the code learns what the pull
request changed and why. The board is disposable; the vault's own boards are
updated through their usual recipe, never through this one.

1. **Read the change and say why it exists.** Read the diff against the merge
   base, not against the tip of `main`, and write one sentence saying why the
   pull request exists, as its author would tell a reviewer. Done when the
   sentence names the need or the problem rather than the files touched.
2. **Make the board with the architecture before the change**: the parts the
   diff touches and the parts directly connected to them, which show the
   reviewer what the change can reach, named as the vault's boards name them.
   Helpers, configuration, types and tests stay out unless the change is about
   them. Done when it reads as `main` does.
3. **Branch the pull request from it** and make the change in one edit to the
   branch. The pane draws a draft's comparison with the current variant, which
   is what it was branched from, so what was added, changed and removed is
   marked on screen. Done when every
   change the diff makes to the architecture is on the branch.
4. **Write the walkthrough on the branch for a reviewer**, three to six beats
   [written for the voice](#walkthroughs):
   - The first beat is the why sentence, with no subjects.
   - Then the change that matters most, then each other change in its own
     beat. A change's heading says what the pull request did ("The ledger now
     takes the lease"); a heading that was already true on `main` describes
     the code, not the change. A removed part cannot be a subject, so the body
     names what the pull request removed.
   - The last beat says where a reviewer should look closely, such as a seam
     or an invariant the change relies on, and what to check there: a place to
     look, not a verdict on the code.

   A beat of a few sentences is about half a minute of speech, so the video
   stays within one to three minutes. Done when a reviewer could answer "what
   changed, and why" from the beats alone.

5. **Record it outside the repository and discard the board.** Done when the
   receipt says `discarded: true` and the command said nothing about sound.
6. **Attach it to the pull request** with gh 2.99 or later (`--attach` also
   works on `gh pr create` and `gh pr edit`). GitHub takes videos up to 10 MB
   on free plans and 100 MB on paid ones; the receipt's `bytes` is the size.
   Done when the video plays in the pull request.

```bash
git diff --find-renames origin/main...HEAD   # three dots: from the merge base
archboard semantic new pr-128 --doing "drawing what pull request 128 changes" --input before.json
archboard semantic branch pr-128 --as "This pull request" --expect-version 1 --doing "branching pull request 128"
archboard semantic edit pr-128 --variant "This pull request" --expect-version 2 --doing "making pull request 128's change" --input change.json
archboard semantic edit pr-128 --variant "This pull request" --expect-version 3 --doing "writing the reviewer's walkthrough" --input walkthrough.json
archboard semantic record pr-128 --variant "This pull request" --out ~/recordings/pr-128.mp4 --discard --doing "recording pull request 128 for its reviewers"
gh pr comment 128 --attach ~/recordings/pr-128.mp4 --body "A narrated walkthrough of this change."
```

### A newcomer's walkthrough

For somebody new to the code who asks how one thing works. The reader cannot
take in a whole diagram at once, so the picture starts with two parts and grows.

1. **Write the answer first**: one sentence of the form "When you _do this_,
   _this happens_", short enough to say back. Done when it names what the
   reader does and what they get.
2. **Draw the one path between the two**: four to ten parts, each
   `responsibility` saying in plain words what the part does. Helpers,
   configuration, types and tests stay out. Done when every part is on the
   path and every relationship the answer rests on is drawn.
3. **Grow the picture beat by beat**: views that each add one to three parts to
   the one before (node-region selections, each holding the last), ending on
   the whole path, and one beat per view whose subjects are the parts it added
   and whose body says what they do. Views belong to every variant of a board,
   so on a board the vault keeps, use one view and let the subjects move along
   the path instead. Done when no beat brings in more than three new parts.
4. **Show where it goes wrong**, when the path has a failure the reader will
   meet: a beat on the step or relationship where it fails, saying what fails
   and what the reader sees.
5. **Close with the answer sentence again** and one number the reader now
   understands, such as a limit, a count or a size. Done when the last beat
   could stand alone as the summary.
