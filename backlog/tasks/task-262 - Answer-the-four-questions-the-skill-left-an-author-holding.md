---
id: TASK-262
title: Answer the four questions the skill left an author holding
status: To Do
assignee: []
created_date: '2026-09-17 22:30'
labels: []
dependencies: []
references:
  - TASK-257
  - skills/archboard/references/variants.md
  - skills/archboard/references/edit.md
ordinal: 469000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The dogfood rewrite (TASK-257) was the first substantial use of the revised skill by an agent that had not written it, and it recorded four things the skill or the product did not tell it, in the order they cost time.

1. A board must be drawn with its predecessor in mind. `semantic rasterize` on a variant that has a parent draws the COMPARISON, not the variant, and that is the picture a reader gets. The recipes say to draw and look, but every worked example is a root variant, so nothing warns an author that adding parts to a derived variant is a different drawing problem. It is also how the renderer crash TASK-257 fixed stayed hidden: wide-boards.test.ts renders every vault board without a predecessor.

2. `resolve --side theirs` is refused for a deleted-and-changed issue, because taking that side is an ordinary edit rather than a choice between two values. The refusal is clear, but references/variants.md presents mine/theirs as a general choice, and a batch mixing competing-field and deleted-and-changed issues is refused whole with every subject named, which reads as though none could be answered.

3. Edge identity is counted against the PREDECESSOR, not against what the author read. Restating a relationship with one changed label was refused because it differs from the historical variant by three properties. references/edit.md says two or more changed properties make a replacement without saying two or more relative to the variant this one came from — a real trap on a derived variant, where a relationship nobody has touched may already be one change from its limit.

4. Views, walkthrough beats and flows mint their own ids. references/authoring.md says to leave `id` out for new nodes and relationships and does not say the same for the rest, so a readable id is written and refused for the block-id alphabet.

Each is either a sentence the skill owes an author or a refusal the product should word better; decide which per item rather than assuming the skill is always the answer. Whether these land is measured by the next evaluation batch, which the user runs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each of the four is answered where an author meets it, in the skill or in the refusal, and the choice is recorded per item
- [ ] #2 No recipe step grows longer than it is today
- [ ] #3 Any payload shown is validated through the store or the generated schema
- [ ] #4 The skill text stays about archboard's own source and passes the eval:skill check leak guard
<!-- AC:END -->
