---
name: archboard-pr
description: >-
  Give a pull request an architecture explainer from archboard boards: a
  proposal of the change, compared with the base branch. It names the parts
  the change can reach and embeds board renders in the description. Use
  it for every pull request that you create or update in a repository whose
  AGENTS.md or CLAUDE.md names ARCHBOARD_VAULT. Also use it to explain the
  architecture of a pull request.
---

# Archboard pull request explainer

A reviewer reads a pull request one file at a time. The explainer shows first
what the change does to the architecture: which parts it adds, removes or
rewires, why, and which callers it can reach. The explainer is a proposal on a
board that the vault already keeps. After the merge, that proposal becomes the
current architecture, so nothing is drawn twice.

The `archboard` skill holds every board operation, its evidence rules and its
refusals. Read its Essentials before the first command, and its propose and
compare recipe before section 2.

## 1. Decide whether the architecture changes

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

If the pull request adds, removes, renames or rewires something that a board
draws, or changes what a part is for, the architecture changes. A change
inside one part (a fix, a refactor, tests, formatting) leaves every board true.
Done: each part in `changed` is either a change the proposal will draw, or a
part whose change stays inside it.

If nothing changes, the pull request gets no explainer. Say in your final
report which parts changed inside. If no board draws the changed code, the
vault has nothing to compare against: post no explainer and stop. Drawing that
board is the `archboard` skill's create recipe, a separate request.

## 2. Find or draw the proposal

Do this for each board that step 1 found changed.

1. Read the board with `archboard semantic show <board>` and note its
   `version`.
2. Find the proposal that this pull request builds. Often the user drew it
   before the code existed.
   - When the pull request exists, read its body with
     `gh pr view <number> --json body`. If the body holds the explainer, its
     `Open it` line (section 3) names the board and the proposal: use them.
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
   (below) instead of drawing it again.
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

### Reconcile a proposal drawn before the code

The proposal says what was intended, and the head branch's code says what was
built. Compare them in both directions:

- **Built as proposed**: for each relationship of the proposal without an
  `anchor`, find the code in the diff that makes it. Restate the relationship
  with its `id`, its fields and that anchor. Bind each planned part to the
  file that now implements it.
- **Proposed but not built**: a relationship whose code you cannot find, a
  part in `namedNotChanged`, and a `check --code --variant` warning that the
  run without `--variant` lacks.
- **Built but not proposed**: a part in `changedNotNamed`, a
  `RELATIONSHIP_UNDRAWN` warning, and code the diff adds that no part binds.

Settle each difference in one of three ways:

- The code is the better answer, for example a call that lands on another
  function than proposed: edit the proposal to match the code, and say why in
  the explainer.
- This pull request builds only part of the proposal: leave the proposal as
  it is, and list the rest as left for later.
- The difference changes what the proposal is for, such as a part dropped, a
  boundary moved or a new dependency on another system: edit the proposal to
  match the code, and put the difference first in "Proposed and built".

Several pull requests, stacked or not, can build one proposal. Each one reuses
it, and its explainer says how much of the proposal it builds. In a stack,
`--base` reads only the commits of this pull request, so a part that a pull
request below built reads as not changed: say where it was built.

On a board with no current variant, nothing is built yet. `footprint` refuses
there, and `compare` refuses its first draft. Read the differences from
`check --code --variant` and the diff, and draw only the after render.

When the vault is inside this repository and Git tracks it, commit the changed
`.semantic.json` file on the head branch. The reviewer then reads the board
change in the same diff as the code.

## 3. Write the explainer

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
3. **Decide on a walkthrough video.** Record one at the user's request, and
   for a change with many interacting parts. Any one of these signs is
   enough:
   - Three or more relationships change across three or more parts.
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
      then each relationship that is not `unchanged`, with where it now lands.
      Use the board's names.
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
   10. **Open it**: one line for each board,
       `archboard semantic compare "<board>" --variant "<proposal>"`, with the
       exact names. A reviewer with the vault runs it, and an update of the
       pull request reads the names from it.

   Done: each part is written, except a walkthrough you did not record and
   **Proposed and built** for a proposal drawn with the code.

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

## 4. Put it in the pull request

The explainer is one section between `<!-- archboard-pr:begin -->` and
`<!-- archboard-pr:end -->`. On an update, replace only the text between the
markers. Text outside them belongs to the author and reviewers.

A render follows the reader's GitHub theme only inside a `<picture>` element.
gh `--attach` uploads a file and rewrites only a Markdown reference to it, so
the `<picture>` is written in a second pass. `--attach` needs gh 2.99 or
later. Without it, leave the renders and the video out of the body, and give
the user their paths.

1. **Upload.** In the section, reference each file by the absolute path that
   you give `--attach`, each on a line of its own. For a render, use the file
   name as alt text, as in `![after-light](/tmp/pr/after-light.svg)`. Give the
   video a paragraph of its own: `![](/tmp/pr/walkthrough.mp4)`. Inside a
   `<details>`, leave a blank line after the `<summary>` line and before
   `</details>`, so that the lines between are read as Markdown. gh replaces
   each path with the URL of the upload and keeps the alt text.

   ```bash
   gh pr create --title "<title>" --body-file "$tmp/body.md" --attach "$tmp/after-light.svg" --attach "$tmp/after-dark.svg" --attach "$tmp/before-light.svg" --attach "$tmp/before-dark.svg"
   gh pr edit <number> --body-file "$tmp/body.md" --attach "$tmp/after-light.svg" --attach "$tmp/after-dark.svg" --attach "$tmp/before-light.svg" --attach "$tmp/before-dark.svg"
   ```

   For a video, add `--attach "$tmp/walkthrough.mp4"`.

2. **Pair.** Read the body back with
   `gh pr view <number> --json body --jq .body > "$tmp/posted.md"`. Replace
   each light and dark pair of image lines with one `<picture>`, using the two
   uploaded URLs. Then write the body back with
   `gh pr edit <number> --body-file "$tmp/posted.md"`, without `--attach`.

   ```text
   <a href="<light URL>"><picture>
   <source media="(prefers-color-scheme: dark)" srcset="<dark URL>">
   <source media="(prefers-color-scheme: light)" srcset="<light URL>">
   <img alt="<what the render shows>" src="<light URL>">
   </picture></a>
   ```

Read the body back once more. Done:

- The markers occur once each.
- No reference names a local path.
- Each `<picture>` has both sources and an `<img>` with alt text.
- The video's URL stands alone on its line.

## 5. After the merge

When the pull request merges, its code is on the default branch. So restate
each binding that names the head branch without its `branch`. When all of the
proposal is on the default branch, adopt it:
`archboard semantic adopt <board> --variant "<proposal>" --reason "<what the pull request changed>" --expect-version <n> --doing "..."`.
While another open pull request still builds part of it, the proposal stays a
draft. A refusal as `PARENT_SUPERSEDED` means another proposal was
adopted first. The `archboard` skill's variants reference says how to state
the change again.

When the pull request closes without a merge, shelve a proposal that it drew,
with that reason. A proposal drawn before the code can outlive the pull
request: leave it a draft, and say so in your final report.
