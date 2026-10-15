---
name: archboard-pr
description: >-
  Write a pull request body with three sections, Summary, Evidence and Merge
  Danger, whose Summary shows the change on an archboard board: a proposal on
  a vault board when the architecture changes, or an ephemeral board for a
  flow, a process or infrastructure that the vault need not keep, with a short
  narrated walkthrough when the change crosses several parts. In a stack of
  pull requests, each one is drawn against the one below it. Use it for every
  pull request that you create or update in a repository that has an
  .archboard/vault directory, or whose architecture another repository's vault
  keeps. Also use it to explain a pull request.
---

# A pull request body with an archboard picture

A reviewer reads a pull request to learn what changes, why, and what the merge
can break. The body answers that in three sections, and in nothing else:

- **Summary**: the picture of the change, a few sentences, and for a change
  across several parts a short narrated walkthrough.
- **Evidence**: a before and an after that show that the change works.
- **Merge Danger**: whether the merge can be walked back, and what it can
  break.

The three sections follow the
[`pr` skill](https://github.com/mattpocock/skills/blob/main/skills/engineering/pr/SKILL.md)
by Matt Pocock (MIT license). This skill adds the picture and the walkthrough.
When another pull request skill is also in use, write one body: its sections
are these three.

The `archboard` skill holds every board operation, its evidence rules and its
refusals. Read its Essentials before the first command, its propose and
compare recipe before section 2, and the recipe of the diagram you draw
(architecture or sequence) before section 3.

A command finds its vault from the directory it runs in. Run the board
commands inside the checkout that holds the vault, or give `-C <checkout>`.
That is usually the checkout of the pull request. When the user keeps the
architecture in another repository, it is the checkout of that repository.
The `archboard` skill's Essentials say how a command finds its vault.

## 0. Check the prerequisites

Do this first, before anything else. A narrated walkthrough needs three
things: Codex signed in, Chromium or Google Chrome, and ffmpeg with the
`libx264` and `aac` encoders. Looking at a render also needs Chromium, because
`semantic rasterize` draws the PNG in it (`semantic render` draws SVG without
it).

```bash
checkout=$(dirname "$(dirname "$(realpath "$(command -v archboard)")")")
state="${XDG_STATE_HOME:-$HOME/.local/state}/archboard"   # macOS: "$HOME/Library/Application Support/archboard"
# 1. Codex: exit 0 and "Logged in using …"; exit 1 and "Not logged in" when signed out.
CODEX_HOME="$state/codex-workbench/codex-home" "$checkout/node_modules/.bin/codex" login status
# 2. Chromium: prints an executable, or exits 1 when there is none.
printenv ARCHBOARD_RENDERER_CHROMIUM || command -v chromium || command -v chromium-browser || command -v google-chrome || command -v google-chrome-stable
# 3. ffmpeg: prints 2, one row for each encoder.
if [ -n "${ARCHBOARD_FFMPEG:-}" ] || command -v ffmpeg >/dev/null; then
  "${ARCHBOARD_FFMPEG:-ffmpeg}" -hide_banner -encoders
else
  nix --extra-experimental-features 'nix-command flakes' run nixpkgs#ffmpeg-headless -- -hide_banner -encoders
fi | grep -cE '^ *[VA][A-Z.]{5} +(libx264|aac) '
```

`checkout` is the archboard checkout whose pinned Codex every server runs; if
`archboard` is not on your `PATH`, use the `bin/archboard` of that checkout.
Every server on the machine shares the sign-in in the state directory. On
macOS, Chromium is also found as `Google Chrome.app` or `Chromium.app` in
`/Applications`. The first ffmpeg run through Nix fetches it, which can take
minutes; with neither ffmpeg nor Nix, ffmpeg is missing.

If all three are ready, go on. If any is missing, stop and ask the user one
question that names everything missing, with two answers:

1. **Set it up, then continue.** Codex: the user signs in from the agent dock
   of the Archboard server at `ARCHBOARD_URL`. Chromium or ffmpeg: name the
   exact command you will run to install it on this machine. Run the checks
   again afterwards.
2. **No narrated walkthrough for this pull request.** The body is posted with
   its picture only, and the recording steps are not run. Without Chromium,
   you also cannot rasterize a render to look at it, so the picture is posted
   unseen: the question says so, and so does your final report.

This is one of the two places where you ask the user. The other is in
[reconciling a proposal](references/reconcile.md). Decide everything else on
your own.

## 1. Decide what to draw

1. Name the base: the branch the pull request merges into. In a stack of pull
   requests, the base is the branch directly below this one, never the trunk.
   The [gh-stack skill](https://github.com/github/gh-stack/tree/main/skills/gh-stack),
   if it is installed, names that branch.
2. Read the change from the merge base: `git diff --find-renames <base>...HEAD`.
3. List the boards with `archboard semantic`. For each board whose parts bind
   this repository, run `archboard semantic footprint <board> --base <base>`.
   Its `changed` lists the parts the commits changed. For the parts in
   `skipped`, and for each repository that it did not read, use the diff. A
   board with no current variant refuses (`NO_CURRENT_VARIANT`): read the diff
   instead.
4. Pick the picture from the first row that fits:

| The change                                                                                                                                          | The picture                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adds, removes, renames or rewires something that a vault board draws, changes what a part is for, or adds durable architecture                      | A proposal on that board (section 2). When no board draws the code, first draw the board from the base branch with the `archboard` skill's create recipe, or start it with an empty base draft when the base has none of the code |
| Changes a request or data flow, an order, a process or state progression, or infrastructure, ownership or dependencies that the vault need not keep | An ephemeral board (section 3)                                                                                                                                                                                                    |
| Formatting, a rename inside one part, a dependency bump, generated files, a fix whose diff explains itself                                          | No board. The Summary uses the smallest text view that makes the point: pseudocode, a call tree, a file tree, or a diff of one of them, in a fenced block                                                                         |

Draw on a vault board only what the vault should keep: parts, boundaries and
relationships that stay true after the merge, at the level that the vault's
boards use. A flow drawn for one change, or an incidental helper, goes on an
ephemeral board.

Done: each part in `changed` is in the picture you chose, or needs no picture.

## 2. Find or draw the proposal

Do this for each vault board that section 1 chose.

1. Read the board with `archboard semantic show <board>` and note its
   `version`.
2. Find the proposal of this pull request:
   - When the pull request exists, its body's state comment (section 6) names
     the board, the proposal and what it is drawn against. A body that an
     earlier version of this skill wrote names them in its `Open it` line.
   - Otherwise, a draft named after the head branch is the proposal.
   - A draft that the user drew before the code for exactly this change is
     the proposal too: reconcile it with the code
     ([reconcile](references/reconcile.md)).

   A found proposal keeps its name for life, so never rename it after the
   head branch. Below, `<proposal>` is its name.

3. Claim the board: `archboard claim --board <board> --reason "explaining <head branch> for its reviewers"`.
4. If no proposal was found, branch one named after the head branch:
   `archboard semantic branch <board> --from "<below>" --as "<head branch>" --summary "<pull request title>" --expect-version <n> --doing "..."`.
   `<below>` is the first of these that exists:
   - In a stack, the proposal of the nearest pull request below that has one
     on this board.
   - The current variant.
   - The empty base draft of a board that nobody has built (below).

   For a found proposal, `<below>` is the variant it came from: its `parent`
   in `semantic show`. Every picture and recording of the proposal is drawn
   against `<below>`.

5. Edit the proposal with the propose and compare recipe. Each `edit` names it
   with `--variant "<proposal>"`. Anchor every relationship you add or move in
   the head branch's code. Give the binding of each part whose code is only on
   the head branch `"branch": "<head branch>"`.
6. Check the proposal against the code. These checks are for you. The body
   never quotes them.
   - `archboard semantic compare <board> --variant "<proposal>" --against "<below>"`
     reports every change that the diff makes to what the board draws, and
     nothing else.
   - `archboard semantic footprint <board> --base <base> --variant "<proposal>"`:
     each part in `changedNotNamed` and `namedNotChanged` is drawn, or you can
     say why its change needs no picture.
   - `archboard check --code --variant "<proposal>"` reports no warning that
     the same run without `--variant` lacks.
7. Release the claim: `archboard release --board <board>`.

When the vault is inside this repository and Git tracks it, commit the changed
`.semantic.json` file on the head branch. The reviewer then reads the board
change in the same diff as the code.

### A board that nobody has built

When the base branch has none of the code that a board draws, the board has
no current variant. A proposal must still be drawn against something, so the
board starts with an empty first draft that states the base:
`archboard semantic new <board> --input base.json --doing "..."`, where
`base.json` holds the board's `level`, `"lifecycle": "draft"` and a `summary`
that names the base branch, and no parts. A proposal branched from it reads
as all added.

### A stack of pull requests

A stack explains one design in steps. The reader of each pull request must
see where its step sits in that design.

- One board carries the stack. Name every part as the design names it.
- Each proposal holds what is built up to and including its pull request. It
  is branched from the proposal below and drawn against it, so it marks only
  its own step.
- Draw a finer part inside the design part it belongs to, on the same board.
  A drill-down board would need a base draft of its own.
- A design drawn before the code, which several pull requests build, stays a
  draft. Never cut it down into the first proposal: the cut parts read as
  removed. If the design's board has nothing built, draw the stack on a board
  of its own that starts with an empty base draft.

## 3. Draw an ephemeral board

An ephemeral board lives in a temporary vault that an Archboard server of its
own serves, so nothing reaches the repository's vault or its server. Follow
[ephemeral boards](references/ephemeral.md), which gives every command:

1. Make the temporary vault and start its server.
2. Draw the base branch's code as the current variant, with the parts named as
   the vault's boards name them. Branch a draft named after the head branch,
   and restate what the head branch does with the ids you were given.
3. Check the draft as section 2 step 6 does.
4. Keep the server for the picture and the walkthrough, then tear it down.

Done: `compare` reports every change the diff makes to what the board draws,
and the repository's vault is unchanged.

## 4. Draw the picture

Draw it with [renders](references/renders.md). In short:

1. Draw one picture. Add a second only when the change moves both structure
   and a flow: then one architecture picture and one sequence.
2. Draw it through a view of the changed parts and their direct neighbours.
   In a stack, use the view of the design part that the step builds, named
   `Inside <design part>`, and share it with the other steps inside that part.
3. Draw it `--against "<below>"`. The picture then marks only this pull
   request's change, and it has no planned frame.
4. Give it a title that names where it sits and what it adds, such as
   `--title "Inside Board store: the lease table replaces lock files"`.

Done: you looked at the picture at the size it will show, and every part that
`compare` reports as added or removed is on it.

## 5. Record a walkthrough

Skip this if the user chose no walkthrough in section 0. Otherwise, record one
when the user asks, or when the change crosses three or more parts, or when an
order or a protocol matters. A change of one or two parts gets no video: the
picture already shows it.

Follow [walkthrough](references/walkthrough.md): three or four beats, about 90
seconds, drawn like the picture and against the same proposal. The first beat
says why the change exists and where it sits. The last says where to look
closely.

Done: the video, its chapters and its transcript are in `$tmp`, or you can
name why there is none.

## 6. Write the body

Write the body into `$tmp/body.md` in this shape. The example is a change to
archboard's own renderer:

```markdown
<!-- archboard-pr:begin -->
<!-- archboard-pr board="Semantic renderer" proposal="TASK-467" against="TASK-464" -->

## Summary

A picture exported into a pull request or a document had no name for what it shows, so every author wrote a caption by hand. `semantic render` and `semantic rasterize` now draw a title above the picture: the given text, or the board, view and variant names.

![Inside Renderer core: the export frame wraps the painted page and draws the title band](/tmp/pr/after.svg)

**Walkthrough**, 1:12, narrated.

![](/tmp/pr/walkthrough.mp4)

<details><summary>Transcript</summary>

**0:01 An exported picture names itself.** ...

**0:24 The export frame wraps the page.** ...

**0:51 Where to look: the page moves whole.** ...

</details>

## Evidence

- **Before:** `archboard semantic render pipeline --title --out a.svg` is refused: unknown option `--title`.
  **After:** `bun test src/runtime/semantic-renderer/tests/export-title.test.ts` passes: the titled page is the untitled one moved down by the band, and a wide title widens the page.

## Merge Danger

**Door:** two-way

**Blast Radius:** exports

Every exported picture now passes through the export frame. Without a title it must return the page untouched. Look at `framedForExport` in `lib/svg/export-frame.ts`.
<!-- archboard-pr:end -->
```

**The state comment** is the second line. It names the board, the proposal
and `against="<below>"`. When the vault is in another repository, it also
names `vault="<that repository>"`. An ephemeral board
writes `<!-- archboard-pr ephemeral -->`, because an update draws it again
from the code. The comment is for the next agent that updates the body. The
reader never sees it.

**Summary.**

- In a stack, the first line gives the position, the design and the
  neighbours: `Part 4 of 15 of device trust (#589). Below: #604. Next: #606.`
- Then one to three sentences: the problem or need, and what the change does
  about it. Use the repository's domain words: its glossary (`CONTEXT.md`,
  `GLOSSARY.md` or similar) and the names that the picture carries.
- Then the picture, with alt text that says what it shows, not the file name.
  If a card carries a triangle on its top-right corner, say under the picture
  that it marks a disagreement with the current variant that nobody settled.
- Then the walkthrough. Its chapters are the bold headings of the transcript,
  collapsed with it. The sentences above the picture do not repeat the
  walkthrough: they are the short version, and it is the long one.

**Evidence.** One before and one after. A test that fails before and passes
after is best: name the test and what it checks. For new code with no before,
show the test or the output that covers it. In a stack, the pull request's own
CI run is evidence. A visible change gets a screenshot.

**Merge Danger.** The door is one-way when the merge does something that a
revert cannot undo, such as a migration, a deletion or a key rotation, and
two-way otherwise. Blast Radius is one word, then one or two sentences: which
callers or users can break, and the one place to look first. Find the callers
in the parts that have a relationship to a changed part.

**The body never contains:**

- archboard's own words, unless the change is about archboard itself:
  variant, proposal, vault, footprint, ephemeral, board version, claim,
  receipt, or a command that opens or compares a board.
- How the picture, the video or a test result was made, or where and when you
  ran anything.
- A list of what the pull request does not do or does not claim. One
  sentence, `Not in this pull request: …`, is allowed when a reader would
  otherwise expect it.
- A paragraph copied from another pull request's body.
- Status news, such as a CI fix. That goes in a pull request comment.

Check before you post. Done: every line holds.

- [ ] The sections are Summary, Evidence and Merge Danger, in that order, and
      nothing stands between them.
- [ ] The visible body reads in about two minutes. The Summary has at most
      three sentences above the picture, after the stack line.
- [ ] No sentence breaks the never-list.
- [ ] The picture is drawn with Blocks, `--theme auto`, a title and a
      horizontal legend, against `<below>`, and it has alt text.
- [ ] A video has three or four beats, is under 10 MB, and has its
      transcript collapsed under it.

## 7. Put it in the pull request

The body is one section between `<!-- archboard-pr:begin -->` and
`<!-- archboard-pr:end -->`. On an update, replace all of the text between
the markers. Text outside them belongs to the author and reviewers.

Post it with [posting](references/posting.md): upload the files with gh
`--attach` (gh 2.99 or later), with each render as one Markdown image.

Then read the body back. Done:

- The markers occur once each.
- No reference names a local path.
- Each render is an uploaded image with alt text.
- The video's URL stands alone on its line.

## 8. After the merge

An ephemeral board needs nothing: it was deleted with its vault.

For a proposal: when the pull request merges, its code is on the default
branch. So restate each binding that names the head branch without its
`branch`. Then adopt the proposal:
`archboard semantic adopt <board> --variant "<proposal>" --reason "<what the pull request changed>" --expect-version <n> --doing "..."`.
A stack merges from the bottom, so its proposals are adopted in that order. A
refusal as `PARENT_SUPERSEDED` means that another proposal was adopted first.
The `archboard` skill's variants reference says how to state the change again.

When the pull request closes without a merge, shelve its proposal with that
reason. A design drawn before the code stays a draft until all of it is
built. Then shelve it, because the adopted proposals state what was built.
