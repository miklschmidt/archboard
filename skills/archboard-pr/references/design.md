# A design pull request

Section 1 of the skill sends you here. A design pull request states a design
that later code builds, and its diff changes only documents and task records:
a design document, an ADR, a plan and its tasks. In a stack, it is the pull
request whose proposal is the design draft that the later proposals branch
from. It prepares the reviewer for every pull request that builds the design,
so its body explains the design's decisions, not the files that hold them.

The body keeps the three sections, the markers and the posting of the skill.
In place of sections 4 to 6, this file gives the pictures, the walkthrough and
the three sections of a design pull request.

## The documents of the design draft

Each design draft names the design document and the plan in its
`documents`, at the commit of the head branch that you drew it from, so a
reader knows which version it draws. Restate the list whole with
`semantic edit --variant "<design draft>"`. The `archboard` skill's variants
reference gives the shape, under "Documents a variant draws". A draft of an alternative that the design rejects never
names the design document: shelve it with the reason that the design gives.
The proposals that branch from the design draft copy its list.

Done: on each board that holds a draft of this design, the design draft names
the design document and the plan at one commit, and
`archboard check code --every-draft` reports no `DOCUMENT_PATH_MISSING`.

## The state comment

Write one state comment for each board that holds a draft of this design,
with the flag `design` after `archboard-pr`. A later pull request finds this
one by these comments (section 6 of the skill):

```markdown
<!-- archboard-pr design board="<board>" proposal="<design draft>" vault="github.com/<owner>/<name>" -->
```

A design draft with a parent also names `against="<below>"`.

## Summary

1. Open with up to three sentences: the problem, what the design decides, and
   where it applies first. Say in one clause that the pull request changes no
   code.
2. Then write one section for each concern of the design. A concern is one
   question that a reviewer of the later pull requests asks, such as "How a
   write reaches the board file" or "What happens when the server stops". Take
   the concerns from the design document's own sections, and make each one a
   `###` heading in the form of that question.
3. Each section opens with the decision and its reason, in short sentences
   that each state one decision. If the design records a trade-off for the
   concern, one sentence names it. Then a list recites each negative decision
   that the design records for that concern, one line each, such as "The
   browser never writes board content." Define a domain term at its first
   use. If the decision is a matrix, such as which caller may write which
   file, use a small table.
4. Put the picture of a concern in its section. Draw it through a view that
   shows that concern, on any board that the design changes, at the variant
   that holds the design on that board. Draw it against that board's current
   variant, so that it marks what the design adds to what is built. On a
   board with no current variant, draw it without `--against`. Never draw it
   against another draft: its marks would show a rejected alternative as
   removed. Follow [renders](renders.md), and prefer a view that the boards
   already have: `semantic views` at the design's variant, with the
   `--against` the picture takes, lists the views whose `marks` count the
   concern. If no view shows the concern, add one as renders says.
5. End with a section on scope: what the first delivery proves, and what the
   design leaves for later, as the design document states it.

The later pull requests show the interfaces, the file layout and each
parameter that no decision depends on, so the Summary leaves them out.

Done: each concern of the design document has a section with its decision
and reason. Every negative decision that the document records is in the
Summary. The visible body reads in about five minutes. The headings and the
first sentence of each section state every decision.

## Walkthrough

Record one walkthrough with [walkthrough](walkthrough.md), and put it at the
end of the Summary. Beat 1 says why the design exists and where it applies.
Then one beat for each concern, in the order of the sections. The last beat
names the decision that Merge Danger names first.

## Evidence

- **Before:** what the base branch states about the problem, often nothing.
- **After:** what the design rests on, such as an agreed review, a
  measurement or a prototype, and the plan that will prove it, such as one
  task for each concern. Link the design document and the plan.

## Merge Danger

**Door:** two-way, because the merge changes no code. Then name each
decision that later pull requests make hard to reverse. Examples are the
format of a stored file and who may write it.

**Blast Radius:** `planning`, and one sentence on who builds on the design.
