# Sequences, views and walkthroughs

## Flows

A flow is an ordered exchange between nodes of one variant.

- `participants` are the columns, in the order they are drawn: put the caller
  first and read left to right. Participants compare as a set. Their order is
  presentation intent. Every participant names a node of that variant, and the
  participants are a subset of them. A node the board draws need not take a
  column. So the work that one part does through the parts it uses can be one
  step with that part at both ends.
- `steps` are messages in sequence, each `from` one participant `to` another
  with a `label` and a `kind`:
  - `sync`: A call that waits (the default), an awaited promise included.
  - `return`: The answer travelling back.
  - `async`: Sent and not waited for: an event, a queue put, a promise nobody
    awaits.
  - `self`: A participant's own step. Its `from` and `to` are the same node, and
    no other kind has that.
- `repeat` (an integer of 2 or more) says one step happens exactly that many
  times in a run. Use it only for a count that the source fixes: a retry limit
  written as a number, a batch of a stated size, a literal list of candidates
  tried in turn. A loop over two fixed file names is `repeat: 2`, and its `note`
  is the early exit on the first file that exists. A loop over a list of
  data-dependent length, or a retry until success, is one step with a `note`
  that says so. A count that the source does not state is a count you invented.
- `note` is a caveat on one step, shown beside it: a condition under which the
  step happens (a branch), a loop whose count is not fixed, a detail the label
  cannot carry.
- A flow can have one participant whose steps are all `self`: a component's own
  sequence is a real explanation.
- A step's position is meaningful. A step keeps its identity by the action it
  represents. To insert, remove or reorder steps, restate the flow. Keep the ids
  of continuing calls and returns, even across a change of order or payload. A
  flow written again without its ids reads as a wholesale deletion and addition.

## Views

Views belong to the board and apply to every variant. Editing one changes the
board's shared reading. Naming a variant in the batch does not change that. A
view's `grammar` is one of:

- `architecture`: Nodes, containment and relationships of the selection.
- `data-flow`: The selected flow as a sequence: columns and messages.

`scope` is either `{ "kind": "all" }` or a selection, and a selection means
one of two different things. Decide which the request asks for before writing
the view, and check the saved `scope` afterwards:

- **Node-region inclusion**: `{ "kind": "selection", "nodes": [...] }` with no
  `edges`. Every relationship among the kept nodes is drawn, whatever
  connects them now or later. Use it for a request such as "these parts and
  how they are wired".
- **Explicit-edge isolation**: name relationships in `edges`, by id or
  same-write handle. Only those relationships are drawn. Another relationship
  between the same parts stays out. Use it for a request such as "only this
  call" or "not that one". Listing `nodes` as well does not add their other
  relationships back.
- **A sequence**: `{ "kind": "selection", "flows": ["<flow>"] }` with the
  `data-flow` grammar. A sequence drawn without its view is the architecture
  picture, not the exchange.

Both ends of a shown relationship, every participant of a shown flow, and every
container they sit inside come with the selection. A selection that names
nothing that exists on a variant draws nothing. It never falls back to the whole
board. A comparison keeps a selected subject the proposal removed, drawn as
removed. Draw a view with
`semantic rasterize <board> --view <name> --out <file.png>` (or
`semantic render` for SVG). Without `--view`, the whole variant is drawn, never
the first view. When the request asks for a picture of a view, look at that
view's picture, not the whole board's.

Both export commands accept `--no-comparison`. Use it to hide comparison marks
and removed subjects when exporting a variant. The file or clipboard receipt
then reports `comparedWith: null`. Without the flag, comparisons stay visible.

### Copy an image with its description

On Linux or macOS, copy PNG and HTML together:

```bash
archboard semantic rasterize "Skill evaluation" --clipboard --no-comparison
```

The HTML embeds the same PNG and carries the board, variant, view and SVG
description as image alt text. The receiving app chooses its supported format.
The copied image does not depend on a server URL or a temporary file.
The command prints a JSON receipt after the native clipboard accepts both formats.
No clipboard manager is required.
Choose either `--clipboard` or `--out` for one command.

### Copy an image through a pipe

Without `--out`, `semantic render` writes SVG to stdout, and `semantic rasterize`
writes PNG bytes. An explicit `--out <file>` writes the image file and prints
a JSON receipt.

On Wayland, pipe PNG into `wl-copy` to paste the picture into apps that accept images:

```bash
archboard semantic rasterize "Skill evaluation" | wl-copy --type image/png
```

If the destination accepts SVG, copy the SVG with its embedded fonts and accessibility metadata:

```bash
archboard semantic render "Skill evaluation" | wl-copy --type image/svg+xml
```

The PNG pipe keeps the visible labels but loses the SVG description. Available SVG
descriptions stay inside the image document. They do not add a separate text clipboard entry.
`wl-copy` offers one format per copy.

## Walkthroughs

A walkthrough explains one variant in ordered `beats`, each with a `heading`,
a `body`, optional `subjects` and a `view`.

- `subjects` are nodes, relationships, flows or steps. Name a node or flow by
  its name or id. Name a relationship or step by id, because it has no name. A
  new subject of any of those kinds can use its same-write handle. They are
  highlighted while the beat is read and compare as a set. A relationship or
  step comes with the parts at its two ends, highlighted and kept in view with
  it. So name a part on its own only for a beat about that part. A beat that
  names several parts also highlights the relationships between them. So name a
  relationship only for a beat about that relationship. A beat that
  explains an ordering names both of its sides: the step that must come first
  and what relies on it having happened.
- An opening beat can have no subjects: it is about the whole picture.
- Set `view` on every beat, even when consecutive beats use the same view.
  Choose the view that shows the problem this beat explains.
  A write warns with `WALKTHROUGH_VIEW_MISSING` for each authored beat that
  omits `view`. The write still succeeds, but `view` will become required soon.
- A beat keeps its `id` through rewording and reordering. Restate the
  walkthrough with the ids you read. A beat without an id is a new beat, and a
  beat id from another walkthrough is refused. When a subject a beat names is
  removed, point the beat at its successor in the same batch.

A beat is read beside the picture. The voice explains it from its heading, its
body and its subjects. On a proposal, the voice is also told whether each
subject was added or changed. The voice never sees the view, or a change the
beat does not name. Write each beat so:

- It makes one point, in the order the reader needs the points.
- Its heading states the point, what happens or what holds ("Only the ledger
  writes"), rather than naming what is drawn ("The ledger").
- Its body explains what the picture cannot show: what the point means for how
  the system behaves. It names parts exactly as the board names them. If the
  source states the one number that matters (a limit, a count, a timeout), it
  gives that number.
- Its `subjects` are the two or three things it is about, so the highlight
  points somewhere.
- It reads at the first attempt: short sentences, active voice, and only terms
  the board itself names.

## Recording a walkthrough

`semantic record <board> --out talk.mp4` presents one walkthrough of the board
in a private headless browser and records it with the Codex voice explaining
each beat: MP4 or WebM, by the file's extension. Each beat moves on after the
voice finishes explaining it. The caption shows the beat's heading and body. The
voice explains them in its own words and does not read them out. Write a body
that the voice can explain in a few sentences. The voice also gets the beat's
subjects and, on a proposal, how each was added or changed. The voice does not
speak about a change that no beat names.

- If the variant states several walkthroughs, `--walkthrough <name>` picks one.
  `--variant` and `--theme dark` choose what is drawn.
- The voice speaks English. `--language <tag>` names another language as a
  BCP 47 tag, such as `da`, `fr` or `pt-BR`. The voice speaks only that
  language, whatever language the beats are written in. The command refuses a
  tag that names no language before it starts anything.
- It needs the Archboard server's Codex signed in, and a refusal says so. Voice
  in a browser can stay live, because the recording runs in a browser of its
  own.
- It works in two passes. First the talk: the voice explains each beat, and the
  command prints each beat as it is reached. Then the picture: the command draws
  the video from the talk frame by frame and prints its progress each second of
  video. On a machine with several cores the picture takes less time than the
  talk, so a talk of two minutes takes about four minutes in all.
- For a board made only for the video, create it with `semantic new`, look at
  it with `semantic rasterize`, then record with
  `--discard --doing "<why>"`, which deletes the board once the file is
  written. A failed recording keeps the board, so record again. A board that
  changed while it was recorded is kept, and the receipt's `discarded` is
  false with the reason.
- Recording needs ffmpeg with libx264 and aac (libvpx-vp9 and libopus for a
  WebM): the one `ARCHBOARD_FFMPEG` names, else the one on PATH, else Nix
  runs `nixpkgs#ffmpeg-headless`, fetched on the first recording. With none of
  them, or one that cannot encode, the command refuses `ENCODER_UNAVAILABLE`
  (exit 4) before it starts a browser: put ffmpeg on PATH, name it with
  `ARCHBOARD_FFMPEG`, or install Nix. An MP4 has AAC sound, which every browser
  plays.
- A recording keeps its talk: a directory with the voice, the board as it was
  drawn, and the moment of each beat and each line the voice said. The
  receipt's `talk` names it. By default it goes to the state directory, which
  keeps only the newest ten. `--talk <dir>` keeps it in a new directory of your
  choice instead. A render that fails is `RENDER_FAILED` (exit 1), writes no
  video and keeps the talk. [Render the talk again](#rendering-a-talk-again)
  rather than record again.

### A pull request's recording

The video is how a reviewer who has not read the code learns what the pull
request changed and why. The board is disposable. The vault's own boards are
updated through their usual recipe, never through this one.

1. **Read the change and say why it exists.** Read the diff against the merge
   base, not against the tip of `main`. Write one sentence that says why the
   pull request exists, as its author tells a reviewer. Done: the sentence names
   the need or the problem rather than the files touched.
2. **Choose the parts the change touches.** If the vault has a board whose
   parts bind this repository's files, run
   `archboard semantic footprint <board> --base origin/main`. Its `changed`
   lists the parts whose bound files the pull request's commits changed, each
   with its `path` and its `commits`. Read the subject of a commit marked
   `large` (more than 30 files, often a rename or a format pass) before you
   make a beat of it. `skipped` lists the parts it could not read, and a
   `repositories` entry with `status: "unread"` names a checkout that lacks
   the ref: take those parts from the diff. Done: every part of `changed` is on
   the board of step 3, or you can say why it is not.
3. **Make the board with the architecture before the change**: the parts of
   step 2 and the parts directly connected to them, which show the reviewer
   what the change can reach, named as the vault's boards name them.
   Helpers, configuration, types and tests stay out unless the change is about
   them. With no board of the repository, take the parts from the diff. Done:
   it reads as `main` does.
4. **Branch the pull request from it** and make the change in one edit to the
   branch. The pane draws a draft's comparison with the current variant, the
   variant it was branched from. The screen thus marks what was added, changed
   and removed. Done: every change that the diff makes to the architecture is on
   the branch.
5. **Write the walkthrough on the branch for a reviewer**, three to six beats
   [written for the voice](#walkthroughs):
   - The first beat is the why sentence, with no subjects.
   - Then the change that matters most, then each other change in its own
     beat. A change's heading says what the pull request did ("The ledger now
     takes the lease"). A heading that was already true on `main` describes
     the code, not the change. A removed part cannot be a subject, so the body
     names what the pull request removed.
   - The last beat tells the reviewer where to look closely, such as a seam or
     an invariant the change relies on, and what to check there: a place to
     look, not a verdict on the code.

   A beat of a few sentences is about half a minute of speech, so the video
   stays within one to three minutes. Done: a reviewer can answer "what
   changed, and why" from the beats alone.

6. **Record it outside the repository and discard the board.** Done: the receipt
   says `discarded: true`.
7. **Attach it to the pull request** with gh 2.99 or later (`--attach` also
   works on `gh pr create` and `gh pr edit`). GitHub takes videos up to 10 MB
   on free plans and 100 MB on paid ones. The receipt's `bytes` is the size.
   Done: the video plays in the pull request.

```bash
git diff --find-renames origin/main...HEAD   # three dots: from the merge base
archboard semantic footprint "Board store" --base origin/main   # the parts the commits changed
archboard semantic new pr-128 --doing "drawing what pull request 128 changes" --input before.json
archboard semantic branch pr-128 --as "This pull request" --expect-version 1 --doing "branching pull request 128"
archboard semantic edit pr-128 --variant "This pull request" --expect-version 2 --doing "making pull request 128's change" --input change.json
archboard semantic edit pr-128 --variant "This pull request" --expect-version 3 --doing "writing the reviewer's walkthrough" --input walkthrough.json
archboard semantic record pr-128 --variant "This pull request" --out ~/recordings/pr-128.mp4 --discard --doing "recording pull request 128 for its reviewers"
gh pr comment 128 --attach ~/recordings/pr-128.mp4 --body "A narrated walkthrough of this change."
```

### Rendering a talk again

A kept talk renders to a new video with no new voice session, and the board
need not exist anymore. Render it again for the other palette, after an
archboard update that changed the picture, or after a render that failed. If
the words or the board change, record again instead.

1. **Find the talk**: the directory that the recording's receipt names as
   `talk`. Done: it holds `talk.json` and `voice.wav`.
2. **Render it** with `semantic replay <talk> --out <file>`, and with
   `--theme dark` for the other palette. It needs the Archboard server, a
   browser and ffmpeg, as `record` does, but no Codex sign-in. A talk that
   cannot be read is a usage error (exit 2) before a browser starts. Done: the
   receipt's `frames` and `durationMs` are the recording's.

```bash
archboard semantic record pr-128 --variant "This pull request" --talk ~/recordings/pr-128-talk --out ~/recordings/pr-128.mp4 --discard --doing "recording pull request 128 for its reviewers"
archboard semantic replay ~/recordings/pr-128-talk --theme dark --out ~/recordings/pr-128-dark.mp4
```

### A newcomer's walkthrough

For somebody new to the code who asks how one thing works. The reader cannot
take in a whole diagram at once, so the picture starts with two parts and grows.

1. **Write the answer first**: one sentence of the form "When you _do this_,
   _this happens_", short enough to say back. Done: it names what the
   reader does and what they get.
2. **Draw the one path between the two**: four to ten parts, each
   `responsibility` saying in plain words what the part does. Helpers,
   configuration, types and tests stay out. Done: every part is on the path and
   every relationship that the answer rests on is drawn.
3. **Grow the picture beat by beat**: each view adds one to three parts to the
   one before. The views are node-region selections. Each holds the one before,
   and the last one shows the whole path. Give each view one beat whose subjects
   are the parts it added and whose body says what they do. Views belong to
   every variant of a board. So on a board that the vault keeps, use one view
   and let the subjects move along the path instead. Done: no beat brings in
   more
   than three new parts.
4. **Show where it goes wrong**. If the path has a failure that the reader will
   meet, add a beat on the step or relationship where it fails. The beat says
   what fails and what the reader sees.
5. **Close with the answer sentence again** and one number the reader now
   understands, such as a limit, a count or a size. Done: the last beat can
   stand alone as the summary.
