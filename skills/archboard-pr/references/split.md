# Split a branch into a stack

Section 1 of the skill sends you here for a branch that has no pull request
yet. A reviewer reads one change best: one part of the planned architecture,
or the groundwork that no board draws. So the boards decide the layers of the
stack, and the code decides their order. A layer is one branch of the stack
and its pull request. The
[gh-stack skill](https://github.com/github/gh-stack/tree/main/skills/gh-stack)
gives the commands that manage the stack.

Split only a branch that has no pull request. An open pull request stays as it
is, because its reviewers already read it as one change. For one, name in your
final report the layers that it would split into.

## 1. Name the design

The design is the planned architecture of the whole branch, on each board
that section 1 chose a proposal for:

- A draft that the user drew for this work before the code. Until the split,
  one branch builds all of it, so reconcile it with the code of the whole
  branch as the proposal of exactly this change ([reconcile](reconcile.md)).
  The layers come from it. When Git tracks the vault, commit the changed board
  file on the head branch before you go on.
- Otherwise, the proposal that section 2 draws for the whole branch, named
  after the head branch and drawn against the current variant.

The design stays a draft when the stack is built, as the skill's rules for a
stack of pull requests say. Each layer gets a proposal of its own later.

Done: each board that section 1 chose a proposal for has a design.

## 2. List the layers

1. For each board, run `archboard semantic compare <board> --variant "<design>"`.
   Each part that it reports as added, changed or removed is a design part.
   A reported part inside another reported part belongs to the outer one.
2. Make one layer for each design part, named after it. Join two design parts
   into one layer in each of these cases:
   - They import or call each other in both directions. A call in one
     direction only sets their order (section 4).
   - The change of one only connects it to the other, such as a new call or a
     value passed on.
   - Two boards draw the same part at two levels.
3. Make one groundwork layer for the changes that build nothing the design
   adds or changes: a refactor, a dependency bump, tooling, or a fix inside a
   part that the boards keep as it is. If one sentence cannot describe it,
   make two.

If the branch then has one layer, do not split it. Go on with section 2 of the
skill, with one pull request.

Done: each design part is in exactly one layer, and each layer can be
described in one sentence.

## 3. Put each change in its layer

1. For each board, run
   `archboard semantic footprint <board> --base <trunk> --variant "<design>"`.
   Each part in `namedAndChanged` and `changedNotNamed` lists the commits that
   changed its code. For a part in `skipped`, read the diff.
2. Read what each of those commits does to the part's code. A change that
   builds what the design adds or changes in a design part goes to that part's
   layer. A change that builds nothing the design adds or changes, such as a
   rename across parts, goes to the groundwork layer.
3. A change that needs the code of a design layer goes to the highest layer
   that it needs, also when no part binds it. A call from an unchanged part to
   a new part is one.
4. A test, a document or a generated file goes to the layer whose code it
   tests, describes or is generated from.
5. When Git tracks the vault in this repository, each changed board file goes
   whole to the lowest design layer. Section 6 below commits the proposal of
   each layer to that file on the layer's own branch.
6. Every other change goes to the groundwork layer.
7. Split a commit whose changes go to two layers by file. When one file holds
   the changes of two layers, the lower layer takes the file with only its own
   changes, and the higher layer takes the rest. Where one hunk mixes them,
   write the lower layer's file by hand.

Done: each file that `git diff --name-only <trunk>...<head branch>` lists is
in one layer, or is split between layers as step 7 says.

## 4. Order the layers

The groundwork layer is at the bottom, because it needs no design layer. Put
each design layer above every layer whose code it imports or calls. The
design's relationships show most of these.

Done: each layer is above every layer that it needs.

## 5. Build the stack

1. Make one branch for each layer with git, from the bottom. Start the lowest
   from the trunk and each other one from the branch below it.
2. Name each branch `<head branch>-<layer>`, and the groundwork layer's
   `<head branch>-groundwork`, unless the repository has its own rule for
   branch names. Git cannot hold `<head branch>/<layer>` while the head
   branch exists, and the head branch stays as it is.
3. Commit to each branch only the changes of its layer. Cherry-pick a commit
   that belongs whole to the layer. Take a file whose whole change belongs to
   the layer with `git checkout <head branch> -- <path>`.
4. Make the branches a stack with `gh stack init <lowest branch> ... <top branch>`.
   It adopts branches that exist. Then go on with the gh-stack skill.

Done:

- `git diff <head branch> <top branch>` prints nothing.
- Each branch passes the repository's checks with only the branches below it.
  If one fails, fix it on its own branch and rebase the branches above it, as
  the gh-stack skill says.

## 6. Explain each pull request

1. Open the pull requests with `gh stack submit --auto`, as the gh-stack
   skill says. Each one then has the number that the stack line of its
   neighbours names.
2. For each pull request, from the bottom, check out its branch and run the
   skill from section 1. Section 7 puts the body in as an update. The skill's
   rules for a stack of pull requests apply to each one. The groundwork layer
   changes no board, so section 1 picks its picture from the table.
3. When Git tracks the vault, commit the layer's board file on its branch.
   Then rebase the branches above it and push the stack, as the gh-stack
   skill says, before you go on to the next pull request.

Done: each pull request of the stack has its body, and the stack is pushed.
