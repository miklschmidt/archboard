# Read a canonical model

Use this path when the addressed vault contains an authored `model.json` manifest.
Existing `.semantic.json` boards retain authority until explicit migration.
The canonical reader refuses a mixed vault.

Run `archboard model read -C <directory>` to inspect root modules and relationships.
The directory follows the same vault discovery rules as board commands.
The result names the addressed vault.
Read `roots` in order, then find each identity in `modules`.

Run `archboard model read '<qualified-id>' -C <directory>` to select one module.
A qualified identity uses `model[/original-board]#local-id`.
The optional original board records imported provenance.
Each segment follows the existing one-to-eight-character ID authority.
Current and former names work only when exactly one module matches.
If a name is ambiguous, use one of the returned matching identities.

The result includes the manifest, policy, modules, derived relationships, and input revision.
Each module owns `outgoing` relationships.
The derived `relationships` list adds each source as `from`.
Find incoming relationships by their `to` identity.
Module and relationship order comes from authored `order` values.
Qualified IDs resolve equal positions deterministically.

The reader preserves responsibilities, descriptions, groups, bindings, evidence anchors, traffic, and document references.
It validates all discovered definitions before returning any part of the model.
Failures return structured codes, source paths, affected identities, and recovery actions.
An unsuccessful CLI read exits with status 2 and keeps its structured JSON result.

When a pane opens an authored model vault, the browser lists its root modules.
Select a module to read its responsibility, description, evidence, and connections.
The browser keeps selection as presentation state and writes no architecture content.
Use Refresh to read repaired or externally edited files.
Opening the reading, returning to the tab, and reconnecting also refresh its content.
Invalid input shows its source and recovery instructions instead of a partial model.

The revision covers recognized input paths and exact bytes, including policy.
A file rename changes the revision and preserves identity.
A whitespace edit changes the revision and preserves meaning.
An unrelated documentation file does not change the revision.

This delivery supports reading authored manifest and module files only.
Use existing board commands for legacy vaults.
Canonical authoring, history, proposals, and explicit migration arrive through later TASK-549 slices.
