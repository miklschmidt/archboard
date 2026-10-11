# Reconcile a proposal drawn before the code

Section 2 of the skill sends you here when it found a proposal that somebody
drew before the code existed. The proposal says what was intended, and the
head branch's code says what was built. Compare them in both directions:

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
  boundary moved or a new dependency on another system: tell the user what
  differs and ask whether to edit the proposal to match the code. The user
  planned the other design and must know that the code built something else.
  This is one of the two places where you ask (the other is the skill's
  section 0). Once the user answers, put the difference first in "Proposed
  and built".

Several pull requests, stacked or not, can build one proposal. Each one reuses
it, and its explainer says how much of the proposal it builds. In a stack,
`--base` reads only the commits of this pull request, so a part that a pull
request below built reads as not changed: say where it was built.
