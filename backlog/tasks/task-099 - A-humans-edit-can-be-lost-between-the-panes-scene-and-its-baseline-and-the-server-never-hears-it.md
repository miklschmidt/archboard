---
id: TASK-099
title: >-
  A human's edit can be lost between the pane's scene and its baseline, and the
  server never hears it
status: To Do
assignee: []
created_date: '2026-08-22 22:26'
updated_date: '2026-08-22 22:26'
labels: []
dependencies:
  - TASK-098
references:
  - frontend/src/canvas/useCanvasSession.ts
  - frontend/src/canvas/changes.ts
  - scripts/check-live-session.mjs
priority: medium
type: bug
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while investigating an intermittent `check-live-session` reported against TASK-091. It is not a flaky check: the check is correctly reporting that a person's edit was silently dropped.

## The signature

```
first diverged on cycle 33 (agent recolour, human resize):
  auth (rectangle) .width: server 232 / pane 238
```

The pane holds the human's resize and the server does not, and it never catches up — `agree()` re-reads both sides for six seconds before giving up. The edit is not in flight, it is gone. On the wall that is a person's drag disappearing into the vault with nothing said.

A second shape of it, same run family, is worse because the element ends up incoherent rather than merely behind:

```
cycle 14 (agent relabel, human retype):
  BDgCjPv2 .text:         server 'store v14'  / pane 'typed at 14'
  BDgCjPv2 .rawText:      server 'typed at 2' / pane 'typed at 14'
  BDgCjPv2 .originalText: server 'store v14'  / pane 'typed at 14'
```

The server's copy carries `text` from the agent's relabel and `rawText` from a human retype twelve cycles earlier. Three values, none of them the current document.

## Candidate mechanism, read rather than proved

`applyServerScene` (`frontend/src/canvas/useCanvasSession.ts`) replaces the scene and then rebaselines inside `settle()`, which is a `setTimeout(..., 0)` with change detection suppressed until it fires. It rebaselines from `api.getSceneElements()` — the pane's live scene — rather than from the elements the server sent.

An edit applied in that window is therefore folded into the baseline without ever being reported. The check's `humanEdit` calls `app.updateScene` directly, so it lands in that window whenever an agent's broadcast is in flight, which the 42-cycle loop arranges on purpose. A person drawing on a wall while an agent writes is the same arrangement.

Unverified: nobody has instrumented the window and caught it. It matches every observed symptom and no other mechanism found does.

## Rates

Standalone, one at a time, nothing else on the machine:

| Tree | Failures |
|---|---|
| `ca8f399` (before TASK-091) | 1 of 10 |
| `6db912d` (TASK-098 + TASK-091) | 0 of 10 |
| TASK-091 alone, without TASK-098 | 0 of 10 |
| both plus TASK-091's follow-ups | 1 of 10 |

The last two rows are the interleaved comparison — alternating trees rather than running each in a block, because a block of ten and the next block are minutes apart on a shared machine and this check is sensitive enough to notice. Both arms failed on the same round, which says the machine and not the tree.

## Its relationship to TASK-097

TASK-097 reads this family as contention, and that is not the whole of it. This reproduces standalone at about one run in ten; the wait it blames is already a condition with a six-second budget, not a fixed window, and it runs that budget out. Contention makes it likelier. Something else makes it possible.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The window between a server scene landing and the pane rebaselining cannot swallow a local edit: an edit applied in it is still owed to the server and still reported
- [ ] #2 The mechanism is established by instrumentation or a deterministic reproduction before anything is changed
- [ ] #3 check-live-session passes 20 standalone runs at the rate this task was filed against
- [ ] #4 A text element cannot end up holding text, rawText and originalText from three different writes
<!-- AC:END -->
