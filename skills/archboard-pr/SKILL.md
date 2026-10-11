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

If nothing changes, the pull request gets no explainer. Tell the user in one
line which parts changed inside. If no board draws the changed code, the vault
has nothing to compare against: tell the user, and stop. Drawing that board is
the `archboard` skill's create recipe, a separate request.

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
   - If exactly one fits, use it. If several fit, or a draft shows only one
     sign, ask the user one question: which proposal does this pull request
     build, or none? If none fits, step 4 branches a new one.

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
  boundary moved or a new dependency on another system: ask the user before
  you edit.

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

Read every statement from the `compare` and `footprint` answers, not from the
change you meant to draw.

- **Why**: one sentence that names the need or the problem, not the files.
- **What changed**: the interface changes first (`interfaceChanges`), each
  with the callers it gains and loses. Then the parts added and removed, then
  each relationship that is not `unchanged`, with where it now lands.
- **What it can reach**: every caller of a changed entry point, and every part
  with a relationship to a changed part. These are the parts a reviewer checks
  for breakage.
- **Where to look**: the seam or invariant the change relies on, and what to
  check there. Give a place to look, not a verdict on the code.
- **Proposed and built**, for a proposal drawn before the code: what this pull
  request builds of it, each difference from it and why, and what is left for
  later. `compare` and the after render show the whole proposal, so **What
  changed** names only what this pull request builds.
- **Open it**: one line for each board,
  `archboard semantic compare "<board>" --variant "<proposal>"`, with the
  exact names. A reviewer with the vault runs it, and an update of the pull
  request reads the names from it.

Draw two renders through one board view that holds the changed parts and their
neighbours. Views belong to every variant, so prefer a view the board already
has. If a later reader also needs a new view, add it. If the board is small,
draw the whole variant. Write the files to a temporary directory, `$tmp`
below, and never into the checkout:

```bash
archboard semantic rasterize <board> --view "<view>" --out "$tmp/before.png"
archboard semantic rasterize <board> --view "<view>" --variant "<proposal>" --out "$tmp/after.png"
```

The second render marks what the proposal added, changed and removed. For a
proposal drawn before the code, say beside it that the proposal came first,
and that it also draws what is left. Open both PNGs and look at them before
you use them.

## 4. Put it in the pull request

The explainer is one section between `<!-- archboard-pr:begin -->` and
`<!-- archboard-pr:end -->`. On an update, replace only the text between the
markers. Text outside them belongs to the author and reviewers.

In the section, reference each render by the path that you give `--attach`,
as `![<alt text>]($tmp/after.png)`. gh uploads the file and rewrites that
reference to the uploaded asset. `--attach` needs gh 2.99 or later. Without it,
leave the renders out of the body and give the user their paths.

```bash
gh pr create --title "<title>" --body-file "$tmp/body.md" --attach "$tmp/before.png" --attach "$tmp/after.png"
gh pr edit <number> --body-file "$tmp/body.md" --attach "$tmp/before.png" --attach "$tmp/after.png"
```

Read the body back with `gh pr view <number> --json body`. Done: the markers
occur once each, and no image reference names a local path.

If the user asks for a narrated video, follow the `archboard` skill's pull
request's recording.

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
request: ask the user before you shelve it.
