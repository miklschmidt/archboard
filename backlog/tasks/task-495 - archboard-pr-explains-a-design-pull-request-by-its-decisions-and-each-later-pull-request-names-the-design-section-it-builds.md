---
id: TASK-495
title: >-
  archboard-pr explains a design pull request by its decisions, and each later
  pull request names the design section it builds
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-18 12:19'
updated_date: '2026-10-18 12:22'
labels:
  - skill
dependencies: []
priority: high
type: enhancement
ordinal: 860000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The redo of the device trust stack (Admin-By-Request/Platform #589 to #615) gave #589, the design PR that prepares the reviewer for every later PR, a three-sentence Summary that names the files it adds (Doc-0072, TASK-0417) and none of the design. The author's own summary on the same PR is 1,600 words but holds what a reviewer needs: one section per concern, headed by the question a reviewer asks, with each decision, its reason and the trade-off it accepts, and explicit negative decisions such as the accepted direct-IIS gap and no automatic downgrade. Three skill rules removed that content: the Summary caps at three sentences above the pictures, the body reads in about two minutes, and the never-list forbids any list of what a PR does not do, which also removed negative decisions that the design records. The owner also found the layers hard to relate to the design, and walkthrough.md tells beat 1 to name the PR below while the never-list forbids a PR's place in a stack (#614's narration says "from the earlier change"). GitHub search finds text inside the hidden state comment, so a later agent can find the design PR by the design draft's name even when another agent wrote it. PR body headings get no anchors in the rendered HTML, so a link names the section in words.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard-pr recognizes a design pull request: one whose diff changes only documents and task records and states a design that later code builds; in a stack, the one whose proposal is the design draft that the stack branches from
- [ ] #2 A design pull request's Summary opens with the problem, what the design decides and where it applies first, then gives one short section per concern headed by the question a reviewer asks, each with its decision, reason, accepted trade-off and a picture through an existing view
- [ ] #3 The never-list still forbids listing what a pull request does not contain, and allows reciting a negative decision that the change records, and a design pull request's one line that it changes no code
- [ ] #4 A later pull request whose proposal descends from a design names the design section it builds, with one link to the design pull request, which an agent finds from the board and GitHub without having written it
- [ ] #5 The first beat of a walkthrough says where the change sits in the design, never which pull request is below it
- [ ] #6 #589 is explained again with the changed skill and posted, and the 17 later bodies of the stack name the design section they build, with the link
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. No dogfood board is affected: the change is wording in the archboard-pr skill, and no board draws its rules.
2. SKILL.md: a first row in the section 1 table sends a design pull request to a new references/design.md. The design PR's state comment carries the flag `design`.
3. SKILL.md never-list: the "does not do" item forbids only what the change does not contain, and allows a negative decision that the change records. The stack item allows one link to the design PR.
4. SKILL.md section 6: a later PR whose proposal descends from a design names the design section it builds, with one link. How to find the design PR: walk the proposal's parents, search PR bodies for each name, keep the PR whose state comment has `design` and names it.
5. references/design.md: how to recognize a design PR, its Summary shape (intent, one section per concern with decision, reason, trade-off, picture), walkthrough, Evidence, Merge Danger and reading budget.
6. walkthrough.md beat 1: where the change sits in the design, never the PR below.
7. Run generate:skill-artifacts and test:repository, then the full gate at close.
8. Apply: an opus agent explains #589 again with the changed skill. I review it against the author's summary, add the design link to the 17 later bodies, and post.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Skill change committed in 5a325f353: references/design.md, the section 1 row, the never-list items, the design sentence in section 6 and walkthrough beat 1. Examples in the shipped skill use archboard's own domain. GitHub search finds text in the hidden state comment (tested: '"Managed PostgreSQL design"' finds #589). Rendered PR body headings carry no anchor (body_html has no user-content ids), so the design sentence names the section in words. test:repository and install-targets pass. An opus agent now explains #589 again with the changed skill (brief: /tmp/pr-audit/stack-redo3/_brief.txt).
<!-- SECTION:NOTES:END -->
