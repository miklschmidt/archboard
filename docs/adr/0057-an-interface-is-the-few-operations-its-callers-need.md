---
status: accepted
---

# An interface is the few operations its callers need

Decided for TASK-529. Amends [ADR 0055](0055-packages-own-behavior-and-apps-compose-it.md).

## Context

ADR 0055 asks each package for a few interfaces for the operations that callers need.
TASK-500.14 put that into practice with a narrower rule.
A public file re-exports a name only when code outside the package imports it today.
Its criteria counted subpaths, not names.
That rule keeps unused names out, but it keeps every name that a shallow caller reached for.
Callers still put package internals together themselves.
So each interface grew to the sum of what its callers reached for.
On 2026-10-25 five packages exported more than 120 names each, and `board` exported 231.

## Decision

An interface is designed from the operations its callers need.
It is measured by everything a caller must learn to use it correctly: names, types, invariants,
ordering, error modes and configuration.
This is the meaning of interface in `.claude/skills/codebase-design/SKILL.md`.

A caller outside the package is necessary for a public name, but it is not sufficient.
Some names have a caller only because the seam is in the wrong place.
Such a name goes behind a deeper operation.
Callers sometimes import several pieces of a package and connect them.
Then that assembly moves into the package as one operation.
The callers use the operation, and the pieces become private.

Interface width is visible and ratcheted.
The width of a package is the number of names that the code entries of its `exports` export,
summed over the entries.
`tests/system/repository-policy/interface-width.test.ts` counts the width of each package.
It fails when a package exceeds the ceiling recorded for it in `interface-width-ceilings.json`
beside the test.
The ceiling file lists exactly the packages that exist, so a new package starts with a ceiling.
A ceiling goes down when a package gets narrower.
A ceiling never goes up to make room for a name: design a deeper operation instead.

## Considered options

The rule of TASK-500.14 alone lets an interface follow caller demand.
Each shallow caller adds a name, and nothing takes one away.

A subpath count measures the layout of files, not what a caller learns.
Merging files lowers it and keeps every name.

A name count does not see types, invariants, ordering or error modes.
It is still cheap and deterministic, and it goes up each time a caller must learn a new name.
The check uses it to make width visible, and design review judges the rest.

Hiding the same names behind one object or in one large file only moves the width.
The count cannot see that move, so this rule names it.

## Consequences

A change that adds a public name must fit under the package's ceiling.
If it does not fit, the change deepens an operation instead.
A change that narrows a package lowers the ceiling, so the freed room cannot fill again unseen.
When an assembly moves into a package, the tests of that assembly move with it.
The name count is a lower bound on what a caller must learn.
Review still judges the types, invariants, ordering and error modes behind each name.
