---
status: accepted
---

# Each area groups code by behavior first

The owner decided this on 2026-11-06 (TASK-582.03). It amends
[ADR 0055](0055-packages-own-behavior-and-apps-compose-it.md) in two sentences.
The first sentence puts role folders first inside each area.
The second sentence holds an app to the same area and role rules as a package.
Everything else in ADR 0055 stands.
The Backlog document `doc-003` (Behavior-first layout plan) holds the evidence and the order of the moves.

## Context

ADR 0055 put role folders first inside each area, such as `ui/clients/pane-session`, `ui/rules/pane-session` and `ui/hooks/pane-session`.
So the files of one behavior sat in as many folders as it had roles.
No directory held one behavior, and no module of the architecture model can bind one folder that holds its parts (TASK-582).
The containment check of `archboard check` warned about 83 such containers.

The areas themselves do a different job.
An area says where code runs, and the import directions of lint depend on it.
A file of `ui` never imports `runtime` or `server`, and lint reads that from the first folder below `src/`.

## Decision

The areas stay the first folder below `src/`: `shared`, `runtime`, `server`, `ui` and `cli`.
Inside an area, code is grouped by behavior first.

A behavior folder holds every file of one job in one area.
A sub-job is a sub-folder.
A behavior folder is named for its job.
It is never a role name, an area name, a generic bucket name or `legacy`.

A role folder is always the last folder of a path, and it holds files only.
These are the roles:

```text
api clients components constants hooks lifecycle middleware operations processes
projections protocol routes rules schemas services sockets state store wiring workers
```

The form of a path is `src/<area>/<behavior>[/<behavior>…]/<role>/<file>`.

- Code that belongs to the area as a whole keeps `src/<area>/<role>/<file>` with no behavior folder.
- `src/<area>/api/` stays directly under the area, because it is the interface that `exports` names.
- Tests mirror their source under `tests/<area>/…`. `tests/<area>/support/` stays.
- Generated and ignored trees keep the shape of the tool that writes them.
- The `#*` aliases do not change.
- A module with parts binds its behavior folder.

Apps follow the same rules as packages.

## Considered options

Keeping role folders first and binding a module to several folders keeps one behavior scattered.
A reader still has to visit each role to see one job.

Dropping the areas and grouping by behavior at the top of `src/` makes one folder hold browser code and server code.
The import directions then need a second way to know where a file runs.

Behavior folders inside each area keep both guarantees.
The area still says where code runs, and the behavior folder holds one job.

## Consequences

Hundreds of files move, over many commits, and each commit keeps `bun run check` green.
So the lint rules accept both layouts until the last move, and then accept only the new one.
`tests/system/repository-policy/workspace-layout.test.ts` holds the new rule.
A ratchet in it lists the trees that still put roles first.
Each move commit removes its trees from that list, and the last one removes the list.

`scripts/move-source.ts` moves the files of a reviewed manifest.
It rewrites the imports and the repository paths, and it updates the bindings and anchors of the vault in the same commit.

A behavior folder never has the name of a role. So a behavior whose name is a role word gets a new name.
An example is the `routes` folder of the edge routes in the renderer's tests.
