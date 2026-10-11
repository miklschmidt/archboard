---
name: archboard-pr
description: >-
  Give a pull request an explainer drawn with archboard boards: what the change
  does to the architecture, to a request or data flow, to a process or state
  progression, to infrastructure or ownership, or to the behaviour inside one
  part. An architecture change becomes a proposal on a vault board, compared
  with the base branch. Anything else is drawn on an ephemeral board that never
  touches the vault. It names the parts the change can reach and embeds
  board renders in the description. Use it for every pull request that you
  create or update in a repository whose AGENTS.md or CLAUDE.md names
  ARCHBOARD_VAULT. Also use it to explain a pull request.
---

# Archboard pull request explainer

A reviewer reads a pull request one file at a time. The explainer shows first
what the change does, why, and which callers it can reach: the parts it adds,
removes or rewires, the order a request now takes, the process or state it
moves through, the infrastructure it deploys. It takes one of two forms:

- **A proposal** on a board that the vault keeps, when the architecture
  changes. After the merge, the proposal becomes the current architecture, so
  nothing is drawn twice.
- **An ephemeral board**, drawn only for this review in a vault of its own and
  deleted after it. It explains whatever the vault should not keep.

The `archboard` skill holds every board operation, its evidence rules and its
refusals. Read its Essentials before the first command, its propose and
compare recipe before section 2, and the recipe of the diagram you draw
(architecture or sequence) before section 3.

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
the setup block names the CLI by an absolute path, take it from that path.
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
2. **No narrated walkthrough for this pull request.** The explainer is posted
   with its still renders only, and the recording steps are not run. Without
   Chromium, you also cannot rasterize a render to look at it, so the renders
   are posted unseen: the question says so, and so does your final report.

This is one of the two places where you ask the user. The other is in
[reconciling a proposal](references/reconcile.md). Decide everything else on
your own.

## 1. Decide what needs explaining

1. Name the base: the branch the pull request merges into. In a stack of pull
   requests, the base is the branch directly below this one, never the trunk.
   The [gh-stack skill](https://github.com/github/gh-stack/tree/main/skills/gh-stack),
   if it is installed, names that branch. Each pull request of a stack gets its
   own proposal, unless it builds part of an earlier one (section 2). Branch it
   from the proposal of the branch below (`semantic branch --from`), and
   compare it with that proposal (`semantic compare --against`). A render
   reads a proposal against the current variant, and so do the parts that a
   footprint says it names. So they also show the changes below: say so beside
   the render.
2. Read the change from the merge base: `git diff --find-renames <base>...HEAD`.
3. List the boards with `archboard semantic`. For each board whose parts bind
   this repository, run `archboard semantic footprint <board> --base <base>`.
   Its `changed` lists the parts the commits changed. For the parts in
   `skipped`, and for each repository that it did not read, use the diff. A
   board with no current variant refuses (`NO_CURRENT_VARIANT`): nothing on it
   was built, and the diff says whether this change builds its draft.
4. Name what a reviewer must understand, and pick the form from the first row
   that fits:

| The change                                                                                                                                | The explainer                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Adds, removes, renames or rewires something that a vault board draws, or changes what a part is for                                       | A proposal on that board (section 2)                                                              |
| Adds or rewires durable architecture that no board draws                                                                                  | Draw the board as `current` from the base branch first (below), then a proposal on it (section 2) |
| Changes a request or data flow, an ordering, a process or a state progression, or the steps inside one part, while every board stays true | An ephemeral sequence board: a `flow` through a `data-flow` view (section 3)                      |
| Changes infrastructure, deployment topology, ownership or dependencies that no board draws and the vault need not keep                    | An ephemeral architecture board (section 3)                                                       |
| Formatting, a rename inside one part, a dependency bump, generated files, a fix whose diff explains itself                                | No explainer: the ordinary description stands, and your final report says why                     |

**Persistent or ephemeral.** Draw on a vault board only what the vault should
keep: parts, boundaries and relationships that stay true after the merge and
that a later reader of the vault needs, at a level the vault's boards use.
Everything else is ephemeral: a flow drawn for one change, a before and after
of one behaviour, an incidental helper. A pull request can need both: the
proposal leads, and an ephemeral flow follows it as a second render.

**Draw the missing board.** When durable architecture changes and no board
draws the code, use the `archboard` skill's create recipe on the base branch's
code. Draw only the area that the change touches and the parts around it that
it can reach, and bind every part to its code. Create the board as `current`:
it states what the base branch is. Then run step 3 again.

Done: each part in `changed` is drawn by the form you chose, or you can say
why its change needs no explanation.

## 2. Find or draw the proposal

Do this for each vault board that section 1 found changed.

1. Read the board with `archboard semantic show <board>` and note its
   `version`.
2. Find the proposal that this pull request builds. Often the user drew it
   before the code existed.
   - When the pull request exists, read its body with
     `gh pr view <number> --json body`. If the body holds the explainer, its
     `Open it` line (section 4) names the board and the proposal: use them.
   - Otherwise, the candidates are the variants whose `lifecycle` is `draft`.
     A draft named after the head branch of another pull request belongs to
     that pull request. A candidate fits in two cases: the user names it, or
     it shows both of these signs:
     - Its name or `summary` describes this change: the head branch, the
       title, the summary of the pull request.
     - The change builds what it proposes:
       `archboard semantic footprint <board> --base <base> --variant "<draft>"`
       lists parts under `namedAndChanged`, or the diff adds the code of a
       part that the draft adds.
   - If exactly one fits, use it. If several fit, use the one whose footprint
     lists the most changed parts. A draft that shows only one sign does not
     fit. If none fits, step 4 branches a new one.

   A found proposal keeps its name for life, so never rename it after the head
   branch. Below, `<proposal>` is its name.

3. Claim the board: `archboard claim --board <board> --reason "explaining <head branch> for its reviewers"`.
4. If no proposal was found, branch one and name it after the head branch,
   because a new pull request has no number yet. Branch it from the current
   variant, or in a stack from the proposal below:
   `archboard semantic branch <board> --as "<head branch>" --summary "<pull request title>" --expect-version <n> --doing "..."`.
5. Edit the proposal with the propose and compare recipe. Each `edit` names it
   with `--variant "<proposal>"`, so the current variant stays as it was.
   Anchor every relationship you add or move in the head branch's code. Give
   the binding of each part whose code is only on the head branch
   `"branch": "<head branch>"`. Reconcile a found proposal with the code
   ([reconcile](references/reconcile.md)) instead of drawing it again.
6. Check the proposal against the code:
   - `archboard semantic compare <board> --variant "<proposal>"` reports
     every change the diff makes to the architecture. It reports nothing else,
     except what the explainer lists as left for later.
   - `archboard semantic footprint <board> --base <base> --variant "<proposal>"`:
     each part in `changedNotNamed` and `namedNotChanged` is drawn or has a
     reason.
   - `archboard check --code --variant "<proposal>"` reports no warning
     that the same run without `--variant` lacks, except on what the explainer
     lists as left.
7. Release the claim: `archboard release --board <board>`.

On a board with no current variant, nothing is built yet. `footprint` refuses
there, and `compare` refuses its first draft. Read the differences from
`check --code --variant` and the diff, and draw only the after render.

When the vault is inside this repository and Git tracks it, commit the changed
`.semantic.json` file on the head branch. The reviewer then reads the board
change in the same diff as the code.

## 3. Draw an ephemeral board

An ephemeral board lives in a temporary vault that an Archboard server of its
own serves, so nothing reaches the repository's vault or its server. Follow
[ephemeral boards](references/ephemeral.md), which gives every command:

1. Make the temporary vault with a copy of the vault's `config.yaml`, point
   `ARCHBOARD_VAULT` and `ARCHBOARD_URL` (a free loopback port) at it, and
   start its server. Before the first write, `archboard semantic config` must
   name a `configurationFile` inside it: nothing else checks which server a
   command reaches.
2. Draw the base branch's code as the current variant, with the parts named as
   the vault's boards name them. Branch a draft named after the head branch,
   and restate what the head branch does with the ids you were given. A flow
   that the base lacks goes on a board created as a draft, with no before.
3. Check the draft as section 2 step 6 does.
4. Keep the server for the renders and the walkthrough (section 4 steps 2 and
   3), then stop it, delete the vault and restore both variables.

Done: `compare` reports every change the diff makes to what the board draws.
After section 4 step 3, the server is stopped, its vault is deleted, and the
repository's vault is unchanged.

## 4. Write the explainer

A reviewer's main problem is to understand the change, and above all why it
was made. The explainer gives that understanding and a route through the diff,
so the review takes less time and misses less. It points at the code and never
stands in for it. Read every statement from the `compare` and `footprint`
answers and the diff, not from the change you meant to draw.

Read [the explainer reference](references/explainer.md) before step 1. It
gives the evidence for each part, more on splitting a large review, and the
anti-patterns.

1. **Size the review.** Count the changed lines with
   `git diff --numstat <base>...HEAD`, without generated, lock and snapshot
   files. Above about 400 lines, or with more than one independent purpose,
   split the review into passes. Each pass is one named group of related parts,
   with one purpose and a rough size. The riskiest pass comes first. Done: the
   review is one pass, or each pass has a name, a purpose and a size.
2. **Draw the renders** with [renders](references/renders.md): Blocks, one
   view, a light and a dark file for each render. Done: the files are in
   `$tmp`, and you looked at the after render at the size it will show.
3. **Decide on a walkthrough video.** Skip it if the user chose no walkthrough
   in section 0. Otherwise, record one at the user's request, and for a change
   with many interacting parts. Any one of these signs is enough:
   - Three or more relationships or steps change across three or more parts.
   - An ordering or a protocol matters.
   - The reviewer must follow a path through several parts.

   A change of one or two parts gets no video, because the after render
   already shows it. These thresholds are judgement. To record, follow
   [walkthrough](references/walkthrough.md). Done: the video, its chapters and
   its transcript are in `$tmp`, or you can name the sign that is missing.

4. **Write the parts in this order** into `$tmp/body.md`:
   1. **Why**: one or two sentences on the need or the problem and how urgent
      it is, never the files. Then one shortcoming accepted or one alternative
      rejected, with the reason.
   2. **The after render**: a title line naming the board, the view and what
      is compared, the render, and the key for the marks it shows
      ([renders](references/renders.md#title-key-and-alt-text)). Under it, the
      before render in a collapsed `<details>`.
   3. **The walkthrough**: for a recorded video, the block that
      [walkthrough](references/walkthrough.md#in-the-pull-request) gives.
   4. **What changed**: the interface changes first (`interfaceChanges`), each
      with the callers it gains and loses. Then the parts added and removed,
      then each relationship and step that is not `unchanged`, with where it
      now lands. Use the board's names.
   5. **Changed but not drawn**: each part in `changedNotNamed`, each
      `RELATIONSHIP_UNDRAWN` warning, and the diff's code that no part binds,
      each with its reason. If there is none, write "Nothing".
   6. **What it can reach**: each caller of a changed entry point, and each
      part with a relationship to a changed part. Give each one concrete
      question to check.
   7. **Reading order**: a numbered list of files, each with the part it
      implements, grouped by pass. Inside a group, a part comes before the
      parts that call or read it.
   8. **Where to look closely**: the seam or invariant the change relies on,
      and what to check there. Give a place to look, not a verdict on the code.
   9. **Proposed and built**, for a proposal drawn before the code: what this
      pull request builds of it, each difference from it and why, and what is
      left for later. `compare` and the after render show the whole proposal,
      so **What changed** names only what this pull request builds.
   10. For a proposal, **Open it**: one line for each board,
       `archboard semantic compare "<board>" --variant "<proposal>"`, with the
       exact names. A reviewer with the vault runs it, and an update of the
       pull request reads the names from it. For an ephemeral board, **About
       the picture**: one line saying that it is an ephemeral board, drawn from
       the code at `<base>` and the head branch and kept in no vault, and that
       an update of the pull request draws it again from the code.

   Done: each part is written, except a walkthrough you did not record and
   **Proposed and built** for anything but a proposal drawn before the code.

5. **Check before you post.** Done: every line holds.
   - [ ] **Why** names the problem, its urgency, and one rejected alternative
         or accepted shortcoming.
   - [ ] Every statement under **What changed** comes from `compare` or
         `footprint`. **Changed but not drawn** lists each part, or says
         "Nothing".
   - [ ] The after render comes first. It is drawn with Blocks, through a view
         of the changed parts, in light and dark. It has a title line, a key
         and alt text. The before render is collapsed under it.
   - [ ] Each part under **What it can reach** has one question to check.
   - [ ] The reading order is grouped, with the riskiest group first. A change
         above about 400 lines is split into passes.
   - [ ] A video has three to six beats and is under 10 MB. It has chapters,
         a transcript and the note on its layout.
   - [ ] The explainer reads in a few minutes. File lists and API detail stay
         in the diff.

## 5. Put it in the pull request

The explainer is one section between `<!-- archboard-pr:begin -->` and
`<!-- archboard-pr:end -->`. On an update, replace only the text between the
markers. Text outside them belongs to the author and reviewers.

Post it in two passes with [posting](references/posting.md): upload the files
with gh `--attach` (gh 2.99 or later), then pair each light and dark render in
one `<picture>`, which follows the reader's GitHub theme.

After the second pass, read the body back. Done:

- The markers occur once each.
- No reference names a local path.
- Each `<picture>` has both sources and an `<img>` with alt text.
- The video's URL stands alone on its line.

## 6. After the merge

An ephemeral board needs nothing: it was deleted with its vault.

For a proposal: when the pull request merges, its code is on the default
branch. So restate each binding that names the head branch without its
`branch`. When all of the proposal is on the default branch, adopt it:
`archboard semantic adopt <board> --variant "<proposal>" --reason "<what the pull request changed>" --expect-version <n> --doing "..."`.
While another open pull request still builds part of it, the proposal stays a
draft. A refusal as `PARENT_SUPERSEDED` means another proposal was
adopted first. The `archboard` skill's variants reference says how to state
the change again.

When the pull request closes without a merge, shelve a proposal that it drew,
with that reason. A proposal drawn before the code can outlive the pull
request: leave it a draft, and say so in your final report.
