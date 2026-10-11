---
id: TASK-368
title: Derive each container's interface from the board and hold it to the code
status: Done
assignee: []
created_date: '2026-09-29 01:17'
updated_date: '2026-10-06 19:43'
labels:
  - interfaces
dependencies: []
documentation:
  - docs/design/design-checks.md
priority: medium
type: feature
ordinal: 693000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A deep module hides a lot of behaviour behind a small interface (Ousterhout; the codebase-design skill). Archboard cannot show that today. A board has containment and relationships, but nothing says which children of a container are its interface and which are hidden. Archboard's own lint lets callers import only a module's root files, yet on the 15 current dogfood boards, 37 of the 202 relationships that cross a code module end on another module's private file, and 9 of the 15 boards draw no container at all (docs/design/design-checks.md). Board persistence draws Archboard server calling eight private files of the store, and it cannot say that the store's interface is one `index.ts`.

Part of the cause is the consumer skill: it binds a part to the file whose body runs and lands each call on that body, so it draws the implementation and never the interface. The interface needs no new authored field, which ADR 0031 would refuse as a second answer to a question the store can derive: a container's interface is the set of its children that relationships reach from outside it. From that come the measures the codebase-design skill names, a comparison that reports interface changes first (an interface change costs every caller), design it twice with numbers, and, with TASK-367's code facts, a check of the drawn interface against the interface the code declares.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `archboard semantic inspect` reports, for any container on any variant, its entry points, hidden parts, callers, the relationships that leave it and the entry points that only pass a call through, derived and never stored
- [x] #2 `archboard semantic compare` reports interface changes before implementation changes, and compares the interfaces of two or more proposals side by side
- [x] #3 The archboard skill draws a module that a board describes as a container, and callers land on its entry points
- [x] #4 The renderer places a container's entry points along its top edge, and every board still lays out under 1 second
- [x] #5 The code check reports entry points that the code does not expose, and exposed names that no outside part reaches, for every language TASK-367 reads
- [x] #6 The flat dogfood module boards draw their modules as containers
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A container's interface is derived from the board, never stored (ADR 0044): the children that relationships from outside reach are its entry points. semantic inspect --container reports entry points, hidden parts, callers, leaving relationships and pass-through entry points; semantic compare reports interface changes first and compares the interfaces of proposals side by side; the pane inspector shows a picked container's interface. The skill draws a described module as a container whose callers land on its entry points, the renderer puts entry points on a container's first row with every board laid out under 1 s, and the flat dogfood boards now draw their modules as containers. The code check holds the drawn interface against what the code exposes (ENTRY_POINT_UNEXPOSED, CALLER_UNDRAWN, EXPOSED_UNUSED) for TypeScript, Python, Swift, C, C++, Objective-C, C# and Terraform, which also gets VARIABLE_PASSED_THROUGH and MODULE_SHALLOW. Nix, Kubernetes and compose define no module, so a container bound to one is skipped as exposure-unknown.
<!-- SECTION:FINAL_SUMMARY:END -->
