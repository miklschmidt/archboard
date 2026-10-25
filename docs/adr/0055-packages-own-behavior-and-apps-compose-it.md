---
status: accepted
---

# Packages own behavior and apps compose it

Amended by [ADR 0057](0057-an-interface-is-the-few-operations-its-callers-need.md)
(2026-10-25). An outside caller is necessary for a public name, but it is not sufficient.
An interface is the few operations its callers need, and a repository check holds each package
to a recorded ceiling on the names it exports. Everything else stands.

Decided for TASK-500.

## Context

A coding agent that changes one behavior needs to find its rules, effects and interface together.
Separating source by execution area scattered each behavior across many small modules.
A caller had to learn the private layout to use it.
Re-exporting every file from a module entry kept that layout in the caller's interface.

## Decision

A workspace package owns one behavior and exposes a few interfaces for the operations that callers need.
Its manifest lists each public entry explicitly.
Every other file stays private, and each public name has a concrete outside caller.
An interface can re-export selected names from its implementation.
It does not export every name from a folder.

Each package keeps its execution areas inside its boundary.
Each area groups code by role, then by behavior when needed.
Browser code reaches shared rules and browser behavior without importing server effects.
Shared rules run without input or output effects.
Types used across areas belong to the package, so their callers need no upward dependency.

Apps compose packages into the command line, server and browser.
An app has no public interface and no outside importer.
Its entry starts the process, and its implementation follows the same area and role rules as a package.
Internal imports name their owning workspace through manifest-local aliases.
Cross-package imports use only the declared public entries.
A package dependency follows the agreed layer order and forms no cycle.

## Considered options

Keeping one module for each small file leaves callers with many interfaces to learn.
A public entry for each private file preserves that cost after a move into packages.
Moving every declaration into one large interface file only hides the same complexity in a larger file.
Selected interfaces keep implementation separate while giving callers one operation for each job.

Separate browser and server packages for every behavior split ownership again.
Execution areas within one package preserve browser safety while keeping one behavior together.
Apps with public exports let libraries depend on process composition and make that composition harder to change.

## Consequences

A source move can stay private to its package when its public interface stays the same.
A new public name needs an actual caller and a place in the package's interface.
Tests of private behavior belong to their owning package or app.
Tests across owners use public interfaces or start the process.
Boundary checks enforce these rules instead of relying on each caller to remember them.
