# Sequences, views and walkthroughs

## Flows

A flow is an ordered exchange between nodes of one variant.

- `participants` are the columns, in the order they are drawn: put the caller
  first and read left to right. Participants compare as a set. Their order is
  presentation intent. Every participant names a node of that variant, and the
  participants are a subset of them. A node the board draws need not take a
  column. So the work that one part does through the parts it uses can be one
  step with that part at both ends.
- `steps` are in order. A step is a message, a decision or a loop. A decision
  and a loop hold steps of their own
  ([when a flow branches or repeats](create-sequence.md#when-a-flow-branches-or-repeats)).
  A message goes `from` one participant `to` another with a `label` and a
  `kind`:
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
  data-dependent length, or a retry until success, is a `loop` step. A count
  that the source does not state is a count you invented.
- `note` is a caveat on one message, shown beside it: an environment variable,
  a detail the label cannot carry. A condition under which steps happen is a
  decision, not a note.
- A flow can have one participant whose steps are all `self`: a component's own
  sequence is a real explanation.
- A step's position is meaningful. A step keeps its identity by the action it
  represents. To insert, remove or reorder steps, restate the flow. Keep the ids
  of continuing calls, returns, decisions and loops, even across a change of
  order, payload or the alternative that holds them. A
  flow written again without its ids reads as a wholesale deletion and addition.

## Views

Views belong to the board and apply to every variant. Editing one changes the
board's shared reading. Naming a variant in the batch does not change that. A
view's `grammar` is one of:

- `architecture`: Nodes, containment and relationships of the selection.
- `sequence`: The selected flow as a sequence: columns and messages, a
  decision as an `alt` frame and a loop as a `loop` frame.
- `flowchart`: The selected flow's logic: its steps as boxes from a start to an
  end, a decision as a diamond with a labelled line for each alternative, and a
  loop as a hexagon with lines labelled `repeat` and `done`. A flow with no
  decision and no loop draws as a column of boxes, which a sequence view
  shows better.

[Which view](../SKILL.md#which-view) says which grammar answers a question.
Before schema 2.5.0, the `sequence` grammar was called `data-flow`. A payload
that says `data-flow` is refused with the new name.

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
  `sequence` grammar. A sequence drawn without its view is the architecture
  picture, not the exchange.

Both ends of a shown relationship, every participant of a shown flow, and every
container they sit inside come with the selection, except a container that
holds all of them: it would only frame the picture, so it is left out. A selection that names
nothing that exists on a variant draws nothing. It never falls back to the whole
board. A comparison keeps a selected subject the proposal removed, drawn as
removed. Draw a view with
`semantic rasterize <board> --view <name> --out <file.png>` (or
`semantic render` for SVG). Without `--view`, the board's overview is drawn,
never the first view. The overview shows the root parts. It closes every
container and draws one line for all relationships between two drawn parts. `--view Everything` draws
every part and every relationship. No view can be called `Overview` or
`Everything`. When the request asks for a picture of a view, look at that
view's picture, not the overview's.

Choose a view from text before you draw one. Every view belongs to every
variant, and many draw little or nothing at a given variant.
`semantic views <board> --variant <variant>` takes `--against` and
`--no-comparison` as render does, and lists the overview, every view and
`Everything`. For each it gives `drawn` (how many nodes, edges, flows and
steps the picture draws), `marks` (the added, changed and removed counts that
the key shows) and `size`. A view with every `drawn` count at zero draws
nothing there. A grammar draws part of what its view selects: a sequence draws
no relationships, a flowchart no parts, and an architecture on a board with
relationships no flows. So a change shows only in a view whose `marks` count
it. The receipt of `semantic render --out` and `semantic rasterize --out`
names the same picture: `drawn` lists each subject by `id` and `name`, with its
`standing` when the picture marks a comparison, and `marks` holds the key's
counts (null when it marks none).

Both export commands accept `--no-comparison`. Use it to hide comparison marks
and removed subjects when exporting a variant. The file or clipboard receipt
then reports `comparedWith: null`. Without the flag, comparisons stay visible.

`--against <variant>` draws the picture relative to another variant than the
usual one, and `semantic record` takes it too. The picture marks only what the
drawn variant adds, changes and removes over the variant named, the same
entries that `semantic compare --variant <drawn> --against <variant>` reports.
Use it for a proposal that stacks on another one, such as a pull request on the
pull request below it, so the picture shows only its own change. The picture
carries no "Planned" frame, also on a board with no current variant, because it
says nothing about whether the board is built. The receipt names the variant
under `comparedWith`. A variant that the board lacks, the drawn variant itself
and `--no-comparison` with `--against` are usage errors (exit 2).

```bash
archboard semantic render pr-128 --variant "This pull request" --against "Pull request 127" --out pr-128.svg
```

For a picture in a document, a README or a pull request, draw one SVG with
`semantic render <board> --out <file.svg>`. Its default theme is `auto`: it
carries both grounds and shows the one of the reader's colour scheme (the
page's own scheme where the page declares one, else the browser's), as an
image, a background or inline. A PNG holds one ground, so `semantic rasterize`
draws `--theme dark` by default and takes `--theme light`.

Both export commands can draw what a reader needs beside the picture:

- `--title` draws the board, the view, the variant and what it is compared
  with above the picture. `--title "<text>"` draws your own words.
- The key is drawn under the picture by default (`--legend horizontal`).
  `--legend vertical` draws it beside the picture, and `--no-legend` draws
  none. The key lists what the board's legend on the page lists for the same
  picture.
- `--legend-only` draws the key alone, in the layout `--legend` names, for a
  page that shows several pictures with one key.

Every SVG and PNG that the two commands give out carries its render recipe:
the board, the variant (or "current" when you named none), the view and the
comparison by id, the drawing choices, and a fingerprint of what the picture
draws. An SVG keeps it in its `<metadata>` element and a PNG in a text chunk.
A post-processor that strips metadata, such as SVGO with its default
`removeMetadata`, removes the recipe, so keep the metadata.

### A picture in documentation that stays current

When a document in a Git checkout shows a board, draw the picture into that
checkout with `--track`. Prefer SVG; `semantic rasterize` takes the same
options for a PNG. A picture for a pull request body, or one you draw only to
look at, is no embed: draw it in a temporary directory without `--track`.

```bash
archboard semantic render payments --out docs/payments.svg --track --doing "Drawing the payments picture for the design doc"
```

The board then lists the file as a tracked embed, `{ repo, path }`. That is a
board write: it takes the lease and needs `--doing`, and it needs no
`--expect-version`. It is refused with `TRACK_OUTSIDE_CHECKOUT` when no Git
checkout holds the file or Git ignores it, and with `TRACK_VAULT_UNREGISTERED`
when this machine has no registered checkout of the vault's repository. To
draw a board of another repository's vault, name that vault with `-C <its
checkout>`: `--out` still resolves against the working directory. Commit the
file, and commit the vault when the answer raised its version.

Keep the file as the command wrote it. Its recipe names the board, the
variant, the view and the drawing choices, so a pipeline that runs SVGO must
keep `<metadata>`. A file without its recipe is no longer an embed.

After a change, run `archboard check`. It runs every check, and the embeds
check is the last:

1. `check code` says that a board no longer matches the code.
2. Correct the board.
3. `archboard check` names each embed that the correction made outdated, as
   the warning `EMBED_OUTDATED`. `EMBED_RENDERER_CHANGED` is information: the
   renderer draws the same board differently now.
4. `archboard check --fix` draws each one again from its own recipe and lists
   every file it rewrote. Commit them.

The check reads the embeds that Git tracks in the checkout that it runs in.
A documentation repository without a vault is such a checkout: there
`archboard check` runs only the embeds check. The check finds each embed's
vault by the repository that its recipe names. It reads a registered checkout
of that repository as it is. Otherwise it fetches that repository's
`.archboard/vault` from the default branch with your Git credentials. When
the fetch fails, it reads the copy it cached before: every finding from that
copy is information, and `--fix` writes nothing from it. With no copy, the
failed fetch is a warning that names the repository. In the vault's own repository, an outdated tracked
embed of another repository is information, and `--fix` draws it again only
in a registered checkout of that repository.

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
  `--variant`, `--theme light` and `--layout blocks` choose what is drawn. The
  default theme is dark and the default layout is Track, and the talk keeps
  the layout it was drawn with.
  `--against <variant>` draws every frame relative to that variant, without the
  "Planned" frame, as `render` does, and the talk keeps it too, so a replay
  draws the same comparison.
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
request changed and why. The board is disposable. Its cut-down architecture
(step 3) is only for this throwaway board. On a vault board, a proposal holds
the whole architecture: follow [a stack of pull
requests](variants.md#a-stack-of-pull-requests) instead.

1. **Read the change and say why it exists.** Read the diff against the merge
   base, not against the tip of `main`. Write one sentence that says why the
   pull request exists, as its author tells a reviewer. Done: the sentence names
   the need or the problem rather than the files touched.
2. **Choose the parts the change touches.** If the vault has a board whose
   parts bind this repository's files, run
   `archboard semantic footprint <board> --base origin/main`. Its `changed`
   lists the parts whose bound declarations or paths the pull request changed, each
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
   `--theme light` or `--theme dark` for the other palette. It draws the layout the talk was
   recorded with, unless `--layout` names the other. It needs the Archboard
   server, a browser and ffmpeg, as `record` does, but no Codex sign-in. A talk
   that cannot be read is a usage error (exit 2) before a browser starts. Done:
   the receipt's `frames` and `durationMs` are the recording's.

```bash
archboard semantic record pr-128 --variant "This pull request" --talk ~/recordings/pr-128-talk --out ~/recordings/pr-128.mp4 --discard --doing "recording pull request 128 for its reviewers"
archboard semantic replay ~/recordings/pr-128-talk --theme light --out ~/recordings/pr-128-light.mp4
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
