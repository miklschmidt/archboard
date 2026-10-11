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
   own proposal. Branch it from the proposal of the branch below
   (`semantic branch --from`), and compare it with that proposal
   (`semantic compare --against`). A render reads a proposal against the
   current variant, and so do the parts that a footprint says it names. So
   they also show the changes below: say so beside the render.
2. Read the change from the merge base: `git diff --find-renames <base>...HEAD`.
3. List the boards with `archboard semantic`. For each board whose parts bind
   this repository, run `archboard semantic footprint <board> --base <base>`.
   Its `changed` lists the parts the commits changed. For the parts in
   `skipped`, and for each repository that it did not read, use the diff.

If the pull request adds, removes, renames or rewires something that a board
draws, or changes what a part is for, the architecture changes. A change
inside one part (a fix, a refactor, tests, formatting) leaves every board true.
Done: each part in `changed` is either a change the proposal will draw, or a
part whose change stays inside it.

If nothing changes, the pull request gets no explainer. Tell the user in one
line which parts changed inside. If no board draws the changed code, the vault
has nothing to compare against: tell the user, and stop. Drawing that board is
the `archboard` skill's create recipe, a separate request.

## 2. Draw the change as a proposal

Do this for each board that step 1 found changed.

1. Claim the board: `archboard claim --board <board> --reason "explaining <head branch> for its reviewers"`.
2. Read it with `archboard semantic show <board>` and note its `version`.
3. Name the proposal after the head branch, because a new pull request has no
   number yet. Branch it from the current variant, or in a stack from the
   proposal below:
   `archboard semantic branch <board> --as "<head branch>" --summary "<pull request title>" --expect-version <n> --doing "..."`.
   If a proposal of that name exists, the pull request is being updated: edit
   that proposal instead.
4. Edit the proposal with the propose and compare recipe. Each `edit` names it
   with `--variant "<head branch>"`, so the current variant stays as it was.
   Anchor every relationship you add or move in the head branch's code.
5. Check the proposal against the code:
   - `archboard semantic compare <board> --variant "<head branch>"` reports
     every change the diff makes to the architecture, and nothing else.
   - `archboard semantic footprint <board> --base <base> --variant "<head branch>"`:
     each part in `changedNotNamed` and `namedNotChanged` is drawn or has a
     reason.
   - `archboard check --code --variant "<head branch>"` reports no warning
     that the same run without `--variant` lacks.
6. Release the claim: `archboard release --board <board>`.

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
- **Open it**: the board and proposal names, so a reviewer with the vault runs
  `archboard semantic compare <board> --variant "<head branch>"`.

Draw two renders through one board view that holds the changed parts and their
neighbours. Views belong to every variant, so prefer a view the board already
has. If a later reader also needs a new view, add it. If the board is small,
draw the whole variant. Write the files to a temporary directory, `$tmp`
below, and never into the checkout:

```bash
archboard semantic rasterize <board> --view "<view>" --out "$tmp/before.png"
archboard semantic rasterize <board> --view "<view>" --variant "<head branch>" --out "$tmp/after.png"
```

The second render marks what the proposal added, changed and removed. Open
both PNGs and look at them before you use them.

## 4. Put it in the pull request

The explainer is one section between `<!-- archboard-pr:begin -->` and
`<!-- archboard-pr:end -->`. On an update, replace only the text between the
markers. Text outside them belongs to the author and reviewers. Read the
current body first with `gh pr view <number> --json body`.

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

When the pull request merges, adopt the proposal:
`archboard semantic adopt <board> --variant "<head branch>" --reason "<what the pull request changed>" --expect-version <n> --doing "..."`.
Before that, restate each binding that names the head branch without its
`branch`, because the code is now on the default branch. When the pull request
closes without a merge, shelve the proposal with that reason. A refusal as
`PARENT_SUPERSEDED` means another proposal was adopted first. The `archboard`
skill's variants reference says how to state the change again.
