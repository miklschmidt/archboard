# Reconcile a proposal drawn before the code

Section 2 of the skill sends you here when the user drew a proposal for
exactly this pull request before the code existed. The [split](split.md)
sends you here for a design of the whole branch. The proposal says what was
intended, and the head branch's code says what was built. Compare them in both
directions:

- **Built as proposed**: for each relationship of the proposal without an
  `anchor`, find the code in the diff that makes it. Restate the relationship
  with its `id`, its fields and that anchor. Bind each planned part to the
  file that now implements it.
- **Proposed but not built**: a relationship whose code you cannot find, a
  part in `namedNotChanged`, and a `check code --variant` warning that the
  run without `--variant` lacks.
- **Built but not proposed**: a part in `changedNotNamed`, a
  `RELATIONSHIP_UNDRAWN` warning, and code the diff adds that no part binds.

Settle each difference in one of two ways:

- The code is the better answer, for example a call that lands on another
  function than proposed: edit the proposal to match the code.
- The difference changes what the proposal is for, such as a part dropped, a
  boundary moved or a new dependency on another system: tell the user what
  differs and ask whether to edit the proposal to match the code. The user
  planned the other design and must know that the code built something else.
  This is one of the two places where you ask (the other is the skill's
  section 0). Once the user answers, say the difference in the Summary, in
  one sentence.

The picture then shows what was built. Never draw a part that this pull
request does not build.

## A design that changed through the stack

A design document can change in a later pull request of the stack that
builds it. The design draft's reference then names an older commit than the
document now has. Read the change with `git diff <commit> <branch> -- <path>`,
where `<branch>` is the head branch of the pull request that changed the
document. Edit the design draft's parts, relationships and flows to what the
document now says. In the same edit, restate its `documents` with the reference at the commit
you read, so that the draft names the version it now draws. A proposal that
branched from the design draft kept the old reference: restate its list too
when it draws the new version.

Done: every draft that names the design document names the commit whose
version it draws, and `git diff <commit> <branch> -- <path>` is empty for
each draft that draws the latest one.

## A design that several pull requests build

A design that the user drew for more than this pull request is not this pull
request's proposal. Leave it a draft as it is. Branch the pull request's own
proposal as section 2 of the skill says, name its parts as the design names
them, and draw only what this pull request builds. Never cut the design down
into the proposal: the cut parts read as removed.
